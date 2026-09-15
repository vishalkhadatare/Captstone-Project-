import os
import sys
import time
import html
import re
import itertools
from pathlib import Path
from PIL import Image
import torch
from transformers import AutoProcessor, AutoModelForMultimodalLM

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# OTSL Table Parser Support
OTSL_NL = "<nl>"
OTSL_FCEL = "<fcel>"
OTSL_ECEL = "<ecel>"
OTSL_LCEL = "<lcel>"
OTSL_UCEL = "<ucel>"
OTSL_XCEL = "<xcel>"
OTSL_TOKENS = [OTSL_NL, OTSL_FCEL, OTSL_ECEL, OTSL_LCEL, OTSL_UCEL, OTSL_XCEL]

def _otsl_extract_tokens_and_text(text: str):
    pattern = "(" + "|".join(map(re.escape, OTSL_TOKENS)) + ")"
    tokens = re.findall(pattern, text)
    parts = [part for part in re.split(pattern, text) if part.strip()]
    return tokens, parts

def _count_right(rows, row_idx, col_idx, tokens):
    span = 0
    while col_idx < len(rows[row_idx]) and rows[row_idx][col_idx] in tokens:
        span += 1
        col_idx += 1
    return span

def _count_down(rows, row_idx, col_idx, tokens):
    span = 0
    while row_idx < len(rows) and col_idx < len(rows[row_idx]) and rows[row_idx][col_idx] in tokens:
        span += 1
        row_idx += 1
    return span

def _otsl_parse_texts(parts, tokens):
    rows = [list(row) for is_nl, row in itertools.groupby(tokens, lambda token: token == OTSL_NL) if not is_nl]
    if not rows:
        return [], []

    max_cols = max(len(row) for row in rows)
    for row in rows:
        row.extend([OTSL_ECEL] * (max_cols - len(row)))

    cells = []
    row_idx = 0
    col_idx = 0
    for idx, part in enumerate(parts):
        if part in (OTSL_FCEL, OTSL_ECEL):
            cell_text = ""
            right_offset = 1
            if part != OTSL_ECEL and idx + 1 < len(parts) and parts[idx + 1] not in OTSL_TOKENS:
                cell_text = parts[idx + 1].strip()
                right_offset = 2

            next_right = parts[idx + right_offset] if idx + right_offset < len(parts) else ""
            next_bottom = rows[row_idx + 1][col_idx] if row_idx + 1 < len(rows) and col_idx < len(rows[row_idx + 1]) else ""
            col_span = 1 + (_count_right(rows, row_idx, col_idx + 1, {OTSL_LCEL, OTSL_XCEL}) if next_right in {OTSL_LCEL, OTSL_XCEL} else 0)
            row_span = 1 + (_count_down(rows, row_idx + 1, col_idx, {OTSL_UCEL, OTSL_XCEL}) if next_bottom in {OTSL_UCEL, OTSL_XCEL} else 0)
            cells.append({
                "text": cell_text,
                "row_span": row_span,
                "col_span": col_span,
                "start_row": row_idx,
                "end_row": row_idx + row_span,
                "start_col": col_idx,
                "end_col": col_idx + col_span,
            })
        if part in (OTSL_FCEL, OTSL_ECEL, OTSL_LCEL, OTSL_UCEL, OTSL_XCEL):
            col_idx += 1
        elif part == OTSL_NL:
            row_idx += 1
            col_idx = 0
    return cells, rows

def convert_otsl_to_html(otsl_content: str) -> str:
    if otsl_content.startswith("<table") and otsl_content.endswith("</table>"):
        return otsl_content

    tokens, parts = _otsl_extract_tokens_and_text(otsl_content)
    cells, rows = _otsl_parse_texts(parts, tokens)
    if not cells or not rows:
        return otsl_content

    grid = [[None for _ in range(len(rows[0]))] for _ in range(len(rows))]
    for cell in cells:
        for row_idx in range(cell["start_row"], min(cell["end_row"], len(rows))):
            for col_idx in range(cell["start_col"], min(cell["end_col"], len(rows[0]))):
                grid[row_idx][col_idx] = cell

    html_rows = []
    for row_idx, row in enumerate(grid):
        html_rows.append("  <tr>\n")
        for col_idx, cell in enumerate(row):
            if cell is None or cell["start_row"] != row_idx or cell["start_col"] != col_idx:
                continue
            attrs = ""
            if cell["row_span"] > 1:
                attrs += f' rowspan="{cell["row_span"]}"'
            if cell["col_span"] > 1:
                attrs += f' colspan="{cell["col_span"]}"'
            html_rows.append(f'    <td{attrs}>{html.escape(cell["text"].strip())}</td>\n')
        html_rows.append("  </tr>\n")
    return "<table>\n" + "".join(html_rows) + "</table>"

def get_model_path():
    """Find local model path or fall back to Hugging Face Hub identifier."""
    candidates = [
        Path("./models/NaviDC-OCR").resolve(),
        Path("../models/NaviDC-OCR").resolve(),
        Path(__file__).resolve().parent.parent / "models" / "NaviDC-OCR",
        Path(__file__).resolve().parent / "models" / "NaviDC-OCR",
    ]
    for c in candidates:
        if c.exists() and (c / "config.json").exists() and (c / "model.safetensors").exists():
            return str(c)
    return "StarDoc-AI/NaviDC-OCR"

def resolve_directories():
    """Resolve data and outputs directories relative to this script."""
    script_dir = Path(__file__).resolve().parent
    data_dir = script_dir / "data"
    outputs_dir = script_dir / "outputs"
    
    data_dir.mkdir(parents=True, exist_ok=True)
    outputs_dir.mkdir(parents=True, exist_ok=True)
    return data_dir, outputs_dir

def load_navidc_pipeline():
    """Load processor and model with optimal device mapping."""
    model_path = get_model_path()
    print(f"[NaviDC-OCR] Loading weights from: {model_path}")
    
    processor = AutoProcessor.from_pretrained(model_path, trust_remote_code=True)
    
    is_cuda = torch.cuda.is_available()
    device = "cuda" if is_cuda else "cpu"
    dtype = torch.bfloat16 if is_cuda else torch.float32
    
    print(f"[NaviDC-OCR] Initializing model on device={device}, dtype={dtype}...")
    model = AutoModelForMultimodalLM.from_pretrained(
        model_path,
        trust_remote_code=True,
        torch_dtype=dtype,
        device_map="auto" if is_cuda else None
    )
    if not is_cuda:
        model = model.to("cpu")
        
    model.eval()
    print("[NaviDC-OCR] Model loaded successfully and ready for inference.")
    return processor, model, device

def parse_single_image(processor, model, device, image_path: Path):
    """Run NaviDC-OCR vision-language inference on an image with optimal task prompt."""
    try:
        image = Image.open(image_path).convert("RGB")
    except Exception as err:
        print(f"[NaviDC-OCR] Error reading image {image_path.name}: {err}")
        return None

    stem = image_path.stem.lower()
    if "formula" in stem:
        prompt_text = "Please write out the expression of the formula in the image using LaTeX format."
    elif "table" in stem:
        prompt_text = "This is the image of a table. Please output the table in OTSL format."
    elif "figure" in stem:
        prompt_text = "This is a scientific figure. Please extract the table implied by this figure."
    else:
        prompt_text = "Please output the text content from the image."

    messages = [
        {"role": "system", "content": "You are a helpful assistant."},
        {
            "role": "user",
            "content": [
                {"type": "image"},
                {"type": "text", "text": prompt_text}
            ]
        }
    ]

    prompt = processor.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)
    inputs = processor(text=[prompt], images=[image], return_tensors="pt").to(model.device if hasattr(model, 'device') else device)
    inputs.pop("mm_token_type_ids", None)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            use_cache=True,
            do_sample=False,
            max_new_tokens=512,
        )

    # Slice output tokens past prompt tokens
    input_ids = inputs["input_ids"]
    generated_tokens = outputs[0][input_ids.shape[-1]:]
    raw_text = processor.decode(generated_tokens, skip_special_tokens=True).strip()

    # Format result according to document type
    if "formula" in stem:
        clean_eq = raw_text.removeprefix("\\[").removesuffix("\\]").strip()
        if not (clean_eq.startswith("$") and clean_eq.endswith("$")):
            clean_eq = f"$$\n{clean_eq}\n$$"
        return f"# Mathematical Formula\n\n{clean_eq}\n"
    elif ("table" in stem or "figure" in stem) and ("<fcel>" in raw_text or "<nl>" in raw_text):
        html_table = convert_otsl_to_html(raw_text)
        return f"# Structured Table (OTSL)\n\n{html_table}\n\n## Raw OTSL\n```\n{raw_text}\n```\n"
    else:
        return f"# Document Content\n\n{raw_text}\n"

def main():
    print("=" * 60)
    print("  📐 NaviDC-OCR Vision Document Parser (1.2B Qwen2.5-VL)")
    print("=" * 60)

    data_dir, outputs_dir = resolve_directories()
    image_extensions = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"}
    image_files = [f for f in data_dir.iterdir() if f.is_file() and f.suffix.lower() in image_extensions]

    if not image_files:
        print(f"[NaviDC-OCR] No images found in {data_dir}. Place images in {data_dir} to process.")
        return

    print(f"[NaviDC-OCR] Found {len(image_files)} document(s) in {data_dir}:")
    for img in image_files:
        print(f"  • {img.name}")

    processor, model, device = load_navidc_pipeline()
    
    results_summary = []
    total_start = time.time()

    for idx, img_path in enumerate(image_files, start=1):
        print(f"\n[{idx}/{len(image_files)}] Processing {img_path.name}...")
        t0 = time.time()
        
        parsed_markdown = parse_single_image(processor, model, device, img_path)
        elapsed = time.time() - t0

        if parsed_markdown:
            out_filename = f"{img_path.stem}_parsed.md"
            out_path = outputs_dir / out_filename
            out_path.write_text(parsed_markdown, encoding="utf-8")
            print(f"  ✓ Saved parsed markdown to {out_path.name} ({elapsed:.2f}s)")
            results_summary.append((img_path.name, out_filename, len(parsed_markdown), f"{elapsed:.2f}s", "SUCCESS"))
        else:
            results_summary.append((img_path.name, "-", 0, f"{elapsed:.2f}s", "FAILED"))

    total_time = time.time() - total_start
    print("\n" + "=" * 60)
    print("  📊 NaviDC-OCR Batch Processing Summary")
    print("=" * 60)
    print(f"{'Input Document':<25} | {'Parsed Markdown':<25} | {'Chars':<6} | {'Status'}")
    print("-" * 65)
    for inp, out, chars, el, status in results_summary:
        print(f"{inp:<25} | {out:<25} | {chars:<6} | {status}")
    print("=" * 60)
    print(f"Total time elapsed: {total_time:.2f}s across {len(image_files)} file(s).")
    print(f"All markdown files saved in: {outputs_dir}")

if __name__ == "__main__":
    main()


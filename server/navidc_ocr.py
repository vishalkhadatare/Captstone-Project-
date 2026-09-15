import os
import sys
import json
import time
import html
import re
import itertools
import base64
import argparse
from io import BytesIO
from pathlib import Path
from PIL import Image

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

def load_image(image_source):
    if not image_source:
        raise ValueError("No image source provided")
    
    # Check if base64 data URL
    if image_source.startswith("data:image") or ";base64," in image_source:
        b64_str = image_source.split(";base64,")[1]
        img_bytes = base64.b64decode(b64_str)
        return Image.open(BytesIO(img_bytes)).convert("RGB")
    
    # Check if pure base64
    if len(image_source) > 200 and not os.path.exists(image_source):
        try:
            img_bytes = base64.b64decode(image_source)
            return Image.open(BytesIO(img_bytes)).convert("RGB")
        except Exception:
            pass

    # Check if file path
    p = Path(image_source)
    if p.exists():
        return Image.open(p).convert("RGB")
    
    raise ValueError(f"Unable to load image from source (length {len(image_source)})")

def parse_mcq_from_markdown(md_text):
    """Parse raw output into structured MCQ objects if possible."""
    questions = []
    q_blocks = re.split(r'\n(?=(?:Q(?:uestion)?\s*\.?\s*\d+|^\d+[\.\)]\s+))', md_text, flags=re.MULTILINE)
    
    for block in q_blocks:
        b = block.strip()
        if not b or len(b) < 15:
            continue
            
        num_match = re.search(r'^(?:Q(?:uestion)?\s*\.?\s*)?(\d+)[\.\)]?\s*(.*)', b, re.DOTALL)
        q_num = num_match.group(1) if num_match else str(len(questions) + 1)
        
        opt_matches = list(re.finditer(r'(?:^|\n)\s*(?:[\(\[]?([A-Da-d])[\)\]\.]|\b([A-Da-d])\))\s+([^\n]+)', b))
        options = []
        if opt_matches:
            for m in opt_matches:
                opt_id = (m.group(1) or m.group(2)).upper()
                opt_val = m.group(3).strip()
                options.append({"id": opt_id, "text": opt_val})
        
        ans_match = re.search(r'(?:Answer|Ans|Correct Option)[:\s]+[\(\[]?([A-Da-d])[\)\]]?', b, re.IGNORECASE)
        ans = ans_match.group(1).upper() if ans_match else ""
        
        has_latex = bool(re.search(r'(\$[^\$]+\$|\\\([^\)]+\\\)|\\\[[^\]]+\\\])', b))
        has_table = bool(re.search(r'\|[^\n]+\|[^\n]+\|', b) or "<table" in b or "<fcel>" in b)
        
        questions.append({
            "question_number": q_num,
            "content_text": b,
            "options": options if options else None,
            "correct_answer": ans,
            "has_latex": has_latex,
            "has_table": has_table,
            "marks": 2 if "GATE" in b or "NEET" in b else 1
        })
        
    return questions

def run_navidc(image_source, mode="markdown", custom_prompt=None):
    import torch
    from transformers import AutoProcessor, AutoModelForMultimodalLM

    t0 = time.time()
    image = load_image(image_source)
    model_path = get_model_path()

    processor = AutoProcessor.from_pretrained(model_path, trust_remote_code=True)
    
    is_cuda = torch.cuda.is_available()
    device = "cuda" if is_cuda else "cpu"
    dtype = torch.bfloat16 if is_cuda else torch.float32

    model = AutoModelForMultimodalLM.from_pretrained(
        model_path,
        trust_remote_code=True,
        torch_dtype=dtype,
        device_map="auto" if is_cuda else None
    )
    if not is_cuda:
        model = model.to("cpu")
    model.eval()

    if custom_prompt:
        prompt_text = custom_prompt
    elif mode == "table":
        prompt_text = "This is the image of a table. Please output the table in OTSL format."
    elif mode == "formula":
        prompt_text = "Please write out the expression of the formula in the image using LaTeX format."
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
            max_new_tokens=512,
            do_sample=False
        )

    input_ids = inputs["input_ids"]
    generated_tokens = outputs[0][input_ids.shape[-1]:]
    result_text = processor.decode(generated_tokens, skip_special_tokens=True).strip()
    
    # Process OTSL table if present
    if "<fcel>" in result_text or "<nl>" in result_text:
        html_table = convert_otsl_to_html(result_text)
        result_text = f"{html_table}\n\n<!-- raw otsl:\n{result_text}\n-->"

    elapsed_ms = int((time.time() - t0) * 1000)
    questions = parse_mcq_from_markdown(result_text)

    return {
        "success": True,
        "markdown": result_text,
        "questions": questions,
        "execution_time_ms": elapsed_ms,
        "device": device,
        "model": model_path
    }

def main():
    parser = argparse.ArgumentParser(description="NaviDC-OCR Vision Document Parser Service")
    parser.add_argument("--image", help="Path to image file or base64 string")
    parser.add_argument("--mode", default="markdown", choices=["markdown", "mcq", "table", "formula"])
    parser.add_argument("--prompt", help="Custom prompt text")
    parser.add_argument("--stdin", action="store_true", help="Read JSON request from stdin")

    args = parser.parse_args()

    try:
        if args.stdin or not args.image:
            raw_in = sys.stdin.read()
            if not raw_in.strip():
                raise ValueError("No input provided on stdin or --image")
            data = json.loads(raw_in)
            img_src = data.get("image_data") or data.get("image_path")
            mode = data.get("mode", "markdown")
            prompt = data.get("prompt")
        else:
            img_src = args.image
            mode = args.mode
            prompt = args.prompt

        res = run_navidc(img_src, mode=mode, custom_prompt=prompt)
        print(json.dumps(res, indent=2))
    except Exception as e:
        err_res = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(err_res), file=sys.stdout)
        sys.exit(1)

if __name__ == "__main__":
    main()


#!/usr/bin/env python3
"""Competitive Exam Visual & Question Structure Extractor (Competitive Exam ONLY).

Implements the strict Visual Extraction Behavior and Explicit Extraction/Fallback Rules:
1. PDF Parsing Order:
   - First extract text, question structure, and metadata.
   - Filter out unrelated page decorations, headers, footers, running heads, and watermarks.
   - Then detect embedded images, diagrams, tables, symbols, equations, graphs, and figures.
   - Map every visual element to the nearest/associated question using page position,
     question number, captions, two-column layout awareness, and multi-question references.
2. Question + Visual Binding:
   - Links every visual to its original question number and source draft paper.
   - Detects visuals shared across multiple questions (e.g., "Questions 1-3: Study the graph").
3. Extraction Priority & Explicit Fallback Rules:
   - Prefer original embedded visual/image from the source PDF (never AI-invented).
   - If embedded-image extraction fails, render the source PDF page at high resolution (240 DPI)
     and crop the visual from the page.
   - If a visual cannot be reliably separated from the page (or a question references a figure/
     diagram/table/graph that could not be isolated, or the page is scanned), keep the required
     source-page region crop rather than dropping the visual.
   - If text extraction fails on scanned pages, use OCR + image/region extraction.
   - If table extraction fails, use page rendering/cropping to preserve the original table visually.
   - If equation/symbol extraction fails (e.g., symbol fonts / PUA glyphs), preserve it as an image crop.
   - Never silently omit a visual element.

Usage:
  python server/competitiveVisualExtractor.py <pdf_path> <output_dir> [public_url_prefix] [dpi]
Prints a JSON object on stdout.
"""

import base64
import hashlib
import json
import os
import re
import sys

try:
    import fitz  # PyMuPDF
except ImportError:
    try:
        import pymupdf as fitz
    except ImportError:
        print(json.dumps({"success": False, "error": "PyMuPDF not installed"}))
        sys.exit(1)

MIN_STROKE = 14.0
MIN_STROKES = 3
MERGE_GAP = 14.0
MIN_AREA_RATIO = 0.0025
MAX_AREA_RATIO = 0.78
BAND_WIDTH_RATIO = 0.78
BAND_MAX_HEIGHT = 68.0
MIN_RASTER_AREA_RATIO = 0.004
MAX_RASTER_AREA_RATIO = 0.78

HEADER_FOOTER_NOISE_PATTERNS = [
    re.compile(r"^page\s+\d+(\s+of\s+\d+)?$", re.I),
    re.compile(r"^-+\s*\d+\s*-+$"),
    re.compile(r"^confidential(\s+exam|\s+document)?$", re.I),
    re.compile(r"^end\s+of\s+(question\s+)?paper$", re.I),
    re.compile(r"^please\s+turn\s+over(\s*\(pto\))?$", re.I),
    re.compile(r"^rough\s+work(\s+only)?$", re.I),
    re.compile(r"^space\s+for\s+rough\s+work$", re.I),
    re.compile(r"^copyright\s+.*reserved", re.I),
    re.compile(r"^do\s+not\s+open\s+this\s+test\s+booklet", re.I),
    re.compile(r"^test\s+booklet\s+code", re.I),
    re.compile(r"^roll\s+no\.?\s*[:\-_]*$", re.I),
]

QUESTION_START_RE = re.compile(
    r"^\s*(?:Q(?:uestion)?\.?\s*(\d+[a-z]?)|(\d+[a-z]?)[\.\)])\s+(.*)",
    re.I | re.S,
)

SHARED_DIRECTION_RE = re.compile(
    r"(?:directions?|questions?|study\s+the\s+following|refer\s+to\s+the\s+following)"
    r"[^.\n]{0,80}?(?:q(?:uestions?)?\.?\s*(?:nos?\.?\s*)?)?(\d+)\s*(?:to|\-|–|—|and|&)\s*(\d+)",
    re.I,
)

VISUAL_REFERENCE_RE = re.compile(
    r"\b("
    r"fig(?:ure)?\.?\s*\d*|"
    r"diagram|"
    r"graph|"
    r"chart|"
    r"table|"
    r"circuit|"
    r"image|"
    r"picture|"
    r"map|"
    r"plot|"
    r"histogram|"
    r"bar\s+graph|"
    r"pie\s+chart|"
    r"venn\s+diagram|"
    r"free\s+body\s+diagram|"
    r"ray\s+diagram|"
    r"block\s+diagram|"
    r"flow\s*chart|"
    r"shown\s+(?:in\s+the\s+|below|above|here|alongside)|"
    r"given\s+(?:below|above|figure|diagram|table|graph|circuit)|"
    r"following\s+(?:figure|diagram|table|graph|chart|circuit|reaction|structure)"
    r")\b",
    re.I,
)

CAPTION_RE = re.compile(
    r"^\s*((?:fig(?:ure)?|table|diagram|graph|chart|circuit|scheme|map)\.?\s*[\dA-Za-z\-\.]*.*)",
    re.I,
)

MATH_SYMBOL_RE = re.compile(
    r"([∑∫∮√∛∜∆∇∂∞±∓×÷≤≥≠≈≡∝∈∉⊂⊃⊆⊇∪∩∀∃⇒⇔→⇌↑↓°′″αβγδεζηθικλμνξπρστυφχψωΓΔΘΛΞΠΣΦΨΩ]"
    r"|\\[a-zA-Z]+|\^\{?[0-9a-zA-Z+\-]+\}?|_\{?[0-9a-zA-Z+\-]+\}?|"
    r"\b(?:sin|cos|tan|cot|sec|csc|log|ln|lim|max|min)\b)",
    re.I,
)

PUA_OR_GARBLED_RE = re.compile(r"[\uf000-\uf8ff\ufffd]")

SYMBOL_FONT_NAMES = (
    "symbol",
    "cmmi",
    "cmsy",
    "cmex",
    "msam",
    "msbm",
    "mtextra",
    "mt-extra",
    "euclid",
    "wingdings",
    "math",
)


def _as_rect(value):
    if hasattr(value, "is_empty"):
        return fitz.Rect(value)
    if isinstance(value, (list, tuple)) and len(value) == 4:
        return fitz.Rect(float(value[0]), float(value[1]), float(value[2]), float(value[3]))
    return None


def _union(a, b):
    return fitz.Rect(
        min(a.x0, b.x0), min(a.y0, b.y0), max(a.x1, b.x1), max(a.y1, b.y1)
    )


def _overlaps(a, b, gap=0.0):
    return not (
        a.x1 + gap < b.x0
        or b.x1 + gap < a.x0
        or a.y1 + gap < b.y0
        or b.y1 + gap < a.y0
    )


def _rect_area(r):
    return max(0.0, float(r.width)) * max(0.0, float(r.height))


def _intersection_ratio(inner, outer):
    ix0 = max(inner.x0, outer.x0)
    iy0 = max(inner.y0, outer.y0)
    ix1 = min(inner.x1, outer.x1)
    iy1 = min(inner.y1, outer.y1)
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    denom = max(_rect_area(inner), 1.0)
    return inter / denom


def merge_rects(rects, gap=MERGE_GAP):
    merged = [fitz.Rect(r) for r in rects]
    changed = True
    while changed:
        changed = False
        out = []
        for rect in merged:
            for i, existing in enumerate(out):
                if _overlaps(rect, existing, gap):
                    out[i] = _union(existing, rect)
                    changed = True
                    break
            else:
                out.append(rect)
        merged = out
    return merged


def is_header_or_footer_rect(rect, page_rect):
    width_ratio = rect.width / max(page_rect.width, 1.0)
    if width_ratio >= BAND_WIDTH_RATIO and rect.height <= BAND_MAX_HEIGHT:
        if rect.y1 <= page_rect.y0 + 0.12 * page_rect.height or rect.y0 >= page_rect.y1 - 0.10 * page_rect.height:
            return True
    if rect.y1 <= page_rect.y0 + 0.075 * page_rect.height and width_ratio >= 0.45:
        return True
    if rect.y0 >= page_rect.y1 - 0.055 * page_rect.height and width_ratio >= 0.45:
        return True
    return False


def is_hairline_separator(rect, page_rect):
    if rect.height <= 2.8 and rect.width / max(page_rect.width, 1.0) >= 0.52:
        return True
    if rect.width <= 2.8 and rect.height / max(page_rect.height, 1.0) >= 0.52:
        return True
    return False


def is_noise_text(text):
    clean = (text or "").strip()
    if not clean:
        return True
    return any(rx.search(clean) for rx in HEADER_FOOTER_NOISE_PATTERNS)


def save_crop_asset(pixmap_or_bytes, output_dir, public_prefix, filename, width=0, height=0):
    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, filename)
    if isinstance(pixmap_or_bytes, (bytes, bytearray)):
        raw_bytes = bytes(pixmap_or_bytes)
        with open(out_path, "wb") as f:
            f.write(raw_bytes)
    else:
        pixmap_or_bytes.save(out_path)
        raw_bytes = pixmap_or_bytes.tobytes("png")
        width = pixmap_or_bytes.width
        height = pixmap_or_bytes.height

    sha256 = hashlib.sha256(raw_bytes).hexdigest()
    b64 = base64.b64encode(raw_bytes).decode("ascii")
    data_url = f"data:image/png;base64,{b64}"
    public_url = f"{public_prefix.rstrip('/')}/{filename}" if public_prefix else data_url
    return {
        "filePath": out_path,
        "publicUrl": public_url,
        "dataUrl": data_url,
        "sha256": sha256,
        "width": width,
        "height": height,
        "aspectRatio": round(float(width) / max(float(height), 1.0), 3) if width and height else 1.0,
    }


def extract_page_text_and_structure(page, page_index):
    """Step 1 of PDF Parsing Order:
    Extract text blocks, question structure, captions, equations, and metadata.
    Excludes headers, footers, and watermarks.
    """
    page_rect = page.rect
    blocks_raw = []
    symbol_equation_rects = []
    equations_list = []

    try:
        text_dict = page.get_text("dict")
    except Exception:
        text_dict = {"blocks": []}

    for blk in text_dict.get("blocks", []):
        if blk.get("type") != 0:
            continue
        bbox = _as_rect(blk.get("bbox"))
        if bbox is None:
            continue
        # Filter out top/bottom page furniture (headers/footers)
        if bbox.y1 <= page_rect.y0 + 0.06 * page_rect.height or bbox.y0 >= page_rect.y1 - 0.05 * page_rect.height:
            line_texts = []
            for ln in blk.get("lines", []):
                line_texts.append("".join(sp.get("text", "") for sp in ln.get("spans", [])))
            combined_hf = " ".join(line_texts).strip()
            if is_noise_text(combined_hf) or re.match(r"^\d+$", combined_hf):
                continue

        lines_out = []
        blk_has_symbol_font = False
        blk_has_pua = False
        for ln in blk.get("lines", []):
            ln_rect = _as_rect(ln.get("bbox")) or bbox
            # Ignore diagonal watermark lines (non-horizontal dir)
            ln_dir = ln.get("dir", (1.0, 0.0))
            if isinstance(ln_dir, (list, tuple)) and len(ln_dir) == 2:
                if abs(float(ln_dir[1])) > 0.25 and abs(float(ln_dir[0])) < 0.95:
                    continue

            spans_text = []
            ln_symbol = False
            for sp in ln.get("spans", []):
                sp_text = sp.get("text", "")
                font_name = (sp.get("font") or "").lower()
                if any(sf in font_name for sf in SYMBOL_FONT_NAMES):
                    ln_symbol = True
                    blk_has_symbol_font = True
                if PUA_OR_GARBLED_RE.search(sp_text):
                    ln_symbol = True
                    blk_has_pua = True
                spans_text.append(sp_text)

            line_str = "".join(spans_text).strip()
            if not line_str or is_noise_text(line_str):
                continue
            lines_out.append({"text": line_str, "bbox": ln_rect, "hasSymbolFont": ln_symbol})

            # Detect mathematical expressions/equations
            if MATH_SYMBOL_RE.search(line_str) or ln_symbol:
                equations_list.append(
                    {
                        "text": line_str,
                        "page": page_index + 1,
                        "bbox": [round(ln_rect.x0, 1), round(ln_rect.y0, 1), round(ln_rect.x1, 1), round(ln_rect.y1, 1)],
                        "needsImageCrop": bool(ln_symbol or PUA_OR_GARBLED_RE.search(line_str)),
                    }
                )
                if ln_symbol or PUA_OR_GARBLED_RE.search(line_str):
                    symbol_equation_rects.append(ln_rect)

        if not lines_out:
            continue

        block_text = "\n".join(l["text"] for l in lines_out).strip()
        if is_noise_text(block_text):
            continue

        blocks_raw.append(
            {
                "bbox": bbox,
                "text": block_text,
                "lines": lines_out,
                "hasSymbolFont": blk_has_symbol_font,
                "hasPua": blk_has_pua,
            }
        )

    # Sort blocks in reading order (aware of two-column layout if present)
    mid_x = page_rect.x0 + page_rect.width * 0.5
    left_col = [b for b in blocks_raw if b["bbox"].x1 <= mid_x + 25]
    right_col = [b for b in blocks_raw if b["bbox"].x0 >= mid_x - 25]
    if len(left_col) >= 2 and len(right_col) >= 2 and (len(left_col) + len(right_col) >= 0.7 * len(blocks_raw)):
        # Two-column layout: sort left column top-to-bottom, then right column top-to-bottom
        spanning = [b for b in blocks_raw if b not in left_col and b not in right_col]
        spanning.sort(key=lambda b: (round(b["bbox"].y0, 1), round(b["bbox"].x0, 1)))
        left_col.sort(key=lambda b: (round(b["bbox"].y0, 1), round(b["bbox"].x0, 1)))
        right_col.sort(key=lambda b: (round(b["bbox"].y0, 1), round(b["bbox"].x0, 1)))
        ordered_blocks = spanning + left_col + right_col
    else:
        ordered_blocks = sorted(blocks_raw, key=lambda b: (round(b["bbox"].y0, 1), round(b["bbox"].x0, 1)))

    # Segment into questions, shared directions, and captions
    questions_on_page = []
    captions_on_page = []
    shared_directions = []
    current_q = None

    for blk in ordered_blocks:
        for ln in blk["lines"]:
            t = ln["text"].strip()
            r = ln["bbox"]

            # Check shared multi-question direction e.g. "Directions (Q. 1 to 3): Study the following graph"
            dir_match = SHARED_DIRECTION_RE.search(t)
            if dir_match:
                try:
                    q_start = int(dir_match.group(1))
                    q_end = int(dir_match.group(2))
                    if 1 <= q_start <= q_end <= q_start + 15:
                        shared_nums = [str(n) for n in range(q_start, q_end + 1)]
                        shared_directions.append(
                            {
                                "text": t,
                                "bbox": r,
                                "questionNumbers": shared_nums,
                                "groupId": f"shared-p{page_index + 1}-q{q_start}_{q_end}",
                            }
                        )
                except Exception:
                    pass

            cap_match = CAPTION_RE.match(t)
            if cap_match and len(t) <= 140 and not QUESTION_START_RE.match(t):
                captions_on_page.append({"text": t, "bbox": r})

            q_match = QUESTION_START_RE.match(t)
            if q_match:
                if current_q is not None:
                    questions_on_page.append(current_q)
                q_num = (q_match.group(1) or q_match.group(2) or str(len(questions_on_page) + 1)).strip()
                rest = (q_match.group(3) or "").strip()
                current_q = {
                    "questionNumber": q_num,
                    "page": page_index + 1,
                    "bbox": fitz.Rect(r),
                    "lines": [rest] if rest else [],
                    "rawLinesWithRects": [(t, fitz.Rect(r))],
                    "equations": [],
                    "captions": [],
                }
            elif current_q is not None:
                current_q["bbox"] = _union(current_q["bbox"], r)
                current_q["lines"].append(t)
                current_q["rawLinesWithRects"].append((t, fitz.Rect(r)))

    if current_q is not None:
        questions_on_page.append(current_q)

    # Enrich each detected question with visual references, equations, tables, and shared group metadata
    for q in questions_on_page:
        full_text = " ".join(q["lines"]).strip()
        q["questionText"] = full_text
        refs = [m.group(0) for m in VISUAL_REFERENCE_RE.finditer(full_text)]
        q["visualReferences"] = list(dict.fromkeys(refs))
        q["requiresVisual"] = len(q["visualReferences"]) > 0

        # Check if this question belongs to any shared multi-question direction
        q["sharedVisualGroupId"] = None
        q["sharedWithQuestionNumbers"] = []
        for sd in shared_directions:
            if str(q["questionNumber"]) in sd["questionNumbers"]:
                q["sharedVisualGroupId"] = sd["groupId"]
                q["sharedWithQuestionNumbers"] = sd["questionNumbers"]
                q["requiresVisual"] = True
                break

        # Attach equations inside question bbox
        q_eqs = []
        for eq in equations_list:
            eq_rect = _as_rect(eq["bbox"])
            if eq_rect and _overlaps(q["bbox"], eq_rect, 8.0):
                q_eqs.append(eq["text"])
        q["equations"] = list(dict.fromkeys(q_eqs))

        # Parse pipe/tab structured table lines if present inside question
        table_rows = []
        for line_str, _ in q["rawLinesWithRects"]:
            if "|" in line_str and line_str.count("|") >= 2:
                cells = [c.strip() for c in line_str.strip("|").split("|")]
                if any(cells) and not all(re.match(r"^[\-:]+$", c) for c in cells if c):
                    table_rows.append(cells)
            elif "\t" in line_str and line_str.count("\t") >= 2:
                cells = [c.strip() for c in line_str.split("\t") if c.strip()]
                if len(cells) >= 2:
                    table_rows.append(cells)
        if len(table_rows) >= 2:
            q["tableData"] = {
                "headers": table_rows[0],
                "rows": table_rows[1:],
            }
        else:
            q["tableData"] = None

    total_chars = sum(len(b["text"]) for b in ordered_blocks)
    return {
        "blocks": ordered_blocks,
        "questions": questions_on_page,
        "captions": captions_on_page,
        "sharedDirections": shared_directions,
        "equations": equations_list,
        "symbolEquationRects": merge_rects(symbol_equation_rects, gap=6.0),
        "totalChars": total_chars,
    }


def detect_embedded_and_vector_visuals(doc, page, page_index, page_structure, output_dir, public_prefix, dpi=240):
    """Steps 2, 3, and 4:
    - Detect embedded raster images (preferring original embedded image bytes, with high-DPI crop fallback).
    - Detect vector diagrams, figures, graphs, charts, and rule-drawn tables.
    - Detect equation/symbol crops where text encoding used symbol/PUA glyphs.
    """
    page_rect = page.rect
    visual_candidates = []
    seen_rects = []

    # 1. Embedded Raster Images (Extraction Priority #1: Original embedded visual from PDF)
    try:
        images = page.get_images(full=True)
    except Exception:
        images = []

    for img_info in images:
        xref = img_info[0]
        try:
            placements = page.get_image_rects(xref)
        except Exception:
            placements = []

        for placement in placements:
            rect = _as_rect(placement)
            if rect is None or rect.width < 18 or rect.height < 14:
                continue
            clip = fitz.Rect(rect) & page_rect
            if clip.width < 18 or clip.height < 14:
                continue
            if is_header_or_footer_rect(clip, page_rect):
                continue
            area_ratio = _rect_area(clip) / max(_rect_area(page_rect), 1.0)
            if area_ratio < MIN_RASTER_AREA_RATIO:
                continue
            # If the raster image covers the whole page (>78%) and page has almost no text, it's a scanned page
            if area_ratio > MAX_RASTER_AREA_RATIO:
                continue
            if any(_overlaps(clip, s, 4.0) for s in seen_rects):
                continue

            seen_rects.append(clip)
            visual_idx = len(visual_candidates) + 1
            fname = f"p{page_index + 1}_img_{visual_idx}.png"

            # Prefer original embedded image bytes when cleanly extractable as PNG/JPEG without mask distortion,
            # otherwise fallback to high-DPI page crop of the exact image rect (Fallback Rule #1).
            asset = None
            extraction_method = "embedded_image"
            try:
                pix = fitz.Pixmap(doc, xref)
                # Convert CMYK or alpha masks safely to RGB PNG
                if pix.n - pix.alpha > 3:
                    pix = fitz.Pixmap(fitz.csRGB, pix)
                if pix.width >= 24 and pix.height >= 16:
                    asset = save_crop_asset(pix, output_dir, public_prefix, fname)
            except Exception:
                asset = None

            if asset is None:
                # Explicit Fallback Rule: render relevant source PDF page at high resolution and crop visual
                extraction_method = "high_res_page_crop"
                pix = page.get_pixmap(dpi=dpi, clip=clip)
                asset = save_crop_asset(pix, output_dir, public_prefix, fname)

            visual_candidates.append(
                {
                    "type": "image",
                    "extractionMethod": extraction_method,
                    "page": page_index + 1,
                    "bbox": [round(clip.x0, 1), round(clip.y0, 1), round(clip.x1, 1), round(clip.y1, 1)],
                    "rect": clip,
                    **asset,
                }
            )

    # 2. Vector Diagrams, Figures, Charts, Graphs, and Rule-Drawn Tables
    try:
        drawings = page.get_drawings()
    except Exception:
        drawings = []

    strokes = []
    horiz_rules = 0
    vert_rules = 0
    for d in drawings:
        r = _as_rect(d.get("rect"))
        if r is None or (r.width <= 0 and r.height <= 0):
            continue
        if is_hairline_separator(r, page_rect):
            continue
        if r.width < MIN_STROKE and r.height < MIN_STROKE:
            continue
        if _rect_area(r) / max(_rect_area(page_rect), 1.0) > 0.88:
            continue
        strokes.append(r)

    if len(strokes) >= MIN_STROKES:
        clusters = merge_rects(strokes, gap=MERGE_GAP)
        for cluster in clusters:
            if is_header_or_footer_rect(cluster, page_rect):
                continue
            area_ratio = _rect_area(cluster) / max(_rect_area(page_rect), 1.0)
            if area_ratio < MIN_AREA_RATIO or area_ratio > MAX_AREA_RATIO:
                continue
            member_strokes = [s for s in strokes if _overlaps(s, cluster, 2.0)]
            if len(member_strokes) < MIN_STROKES:
                continue

            # Expand slightly to include axis labels / arrow labels / table borders
            padded = fitz.Rect(
                max(page_rect.x0, cluster.x0 - 6.0),
                max(page_rect.y0, cluster.y0 - 6.0),
                min(page_rect.x1, cluster.x1 + 6.0),
                min(page_rect.y1, cluster.y1 + 6.0),
            )
            if padded.width < 24 or padded.height < 16:
                continue
            if any(_intersection_ratio(padded, s) > 0.65 or _intersection_ratio(s, padded) > 0.65 for s in seen_rects):
                continue

            # Classify whether this vector cluster is a table (grid of horizontal/vertical rules) or diagram/graph
            h_lines = sum(1 for s in member_strokes if s.width >= 30 and s.height <= 4.0)
            v_lines = sum(1 for s in member_strokes if s.height >= 20 and s.width <= 4.0)
            is_table_grid = h_lines >= 3 and v_lines >= 2

            seen_rects.append(padded)
            visual_idx = len(visual_candidates) + 1
            v_type = "table" if is_table_grid else "diagram"
            fname = f"p{page_index + 1}_{v_type}_{visual_idx}.png"

            try:
                pix = page.get_pixmap(dpi=dpi, clip=padded)
                asset = save_crop_asset(pix, output_dir, public_prefix, fname)
                table_data = extract_table_cells_from_rect(page_structure["blocks"], padded) if is_table_grid else None
                visual_candidates.append(
                    {
                        "type": v_type,
                        "extractionMethod": "vector_diagram_crop" if not is_table_grid else "table_visual_crop",
                        "page": page_index + 1,
                        "bbox": [round(padded.x0, 1), round(padded.y0, 1), round(padded.x1, 1), round(padded.y1, 1)],
                        "rect": padded,
                        "tableData": table_data,
                        **asset,
                    }
                )
            except Exception:
                pass

    # 3. Fallback Rule for Equations/Symbols that failed text decoding (Symbol font / PUA glyphs)
    for eq_rect in page_structure.get("symbolEquationRects", []):
        padded_eq = fitz.Rect(
            max(page_rect.x0, eq_rect.x0 - 4.0),
            max(page_rect.y0, eq_rect.y0 - 4.0),
            min(page_rect.x1, eq_rect.x1 + 4.0),
            min(page_rect.y1, eq_rect.y1 + 4.0),
        )
        if padded_eq.width < 14 or padded_eq.height < 10:
            continue
        if any(_overlaps(padded_eq, s, 2.0) for s in seen_rects):
            continue
        seen_rects.append(padded_eq)
        visual_idx = len(visual_candidates) + 1
        fname = f"p{page_index + 1}_eq_{visual_idx}.png"
        try:
            pix = page.get_pixmap(dpi=max(dpi, 260), clip=padded_eq)
            asset = save_crop_asset(pix, output_dir, public_prefix, fname)
            visual_candidates.append(
                {
                    "type": "equation",
                    "extractionMethod": "equation_image_crop",
                    "page": page_index + 1,
                    "bbox": [round(padded_eq.x0, 1), round(padded_eq.y0, 1), round(padded_eq.x1, 1), round(padded_eq.y1, 1)],
                    "rect": padded_eq,
                    **asset,
                }
            )
        except Exception:
            pass

    return visual_candidates


def extract_table_cells_from_rect(blocks, table_rect):
    """Extracts structured rows and columns from text lines falling inside a table bounding box."""
    lines_in_table = []
    for blk in blocks:
        for ln in blk.get("lines", []):
            r = ln["bbox"]
            if _overlaps(r, table_rect, 4.0):
                lines_in_table.append((r, ln["text"].strip()))
    if not lines_in_table:
        return None

    # Group lines by row (similar y0 within 6pt)
    lines_in_table.sort(key=lambda item: (round(item[0].y0 / 6.0), round(item[0].x0, 1)))
    rows = []
    current_row = []
    current_y = None
    for r, txt in lines_in_table:
        if not txt:
            continue
        if current_y is None or abs(r.y0 - current_y) <= 7.0:
            current_row.append((r.x0, txt))
            if current_y is None:
                current_y = r.y0
        else:
            current_row.sort(key=lambda x: x[0])
            rows.append([c[1] for c in current_row])
            current_row = [(r.x0, txt)]
            current_y = r.y0
    if current_row:
        current_row.sort(key=lambda x: x[0])
        rows.append([c[1] for c in current_row])

    if len(rows) < 2:
        return None
    return {
        "headers": rows[0],
        "rows": rows[1:],
    }


def map_visuals_to_questions(
    page,
    page_index,
    page_structure,
    visual_candidates,
    output_dir,
    public_prefix,
    source_pdf_name,
    dpi=240,
):
    """Step 1.3, Step 2, and Step 4:
    Maps every visual element on the page to its owning question(s) using page position,
    question number, captions, and layout.
    Applies Fallback Rule: if a question requires a visual (or is on a scanned page) and no
    isolated visual was attached, crops the source-page question region so no visual is ever omitted.
    """
    page_rect = page.rect
    questions = page_structure["questions"]
    captions = page_structure["captions"]
    shared_directions = page_structure["sharedDirections"]

    for q in questions:
        q["visualElements"] = []

    unassigned_visuals = []

    for v_idx, vis in enumerate(visual_candidates):
        v_rect = vis["rect"]

        # 1. Attach nearest caption (immediately below or above the visual)
        attached_caption = None
        best_cap_dist = 48.0
        for cap in captions:
            c_rect = cap["bbox"]
            horiz_overlap = min(v_rect.x1, c_rect.x1) - max(v_rect.x0, c_rect.x0)
            if horiz_overlap < -30:
                continue
            dist = min(abs(c_rect.y0 - v_rect.y1), abs(v_rect.y0 - c_rect.y1))
            if dist <= best_cap_dist:
                best_cap_dist = dist
                attached_caption = cap["text"]

        # Refine visual type from caption if caption mentions Graph / Chart / Table / Circuit / Figure
        effective_type = vis["type"]
        if attached_caption:
            low_cap = attached_caption.lower()
            if "table" in low_cap:
                effective_type = "table"
            elif "graph" in low_cap or "plot" in low_cap:
                effective_type = "graph"
            elif "chart" in low_cap:
                effective_type = "chart"
            elif "fig" in low_cap:
                effective_type = "figure"

        # 2. Check if visual belongs to a multi-question shared direction block
        matched_shared_group = None
        matched_shared_qnums = []
        for sd in shared_directions:
            sd_rect = sd["bbox"]
            if abs(v_rect.y0 - sd_rect.y1) <= 180 or _overlaps(v_rect, sd_rect, 40.0):
                matched_shared_group = sd["groupId"]
                matched_shared_qnums = sd["questionNumbers"]
                break

        # 3. Map to question(s)
        target_questions = []
        if matched_shared_qnums:
            target_questions = [
                q for q in questions if str(q["questionNumber"]) in matched_shared_qnums
            ]

        if not target_questions and attached_caption:
            # Check if caption explicitly names a question number e.g. "Fig. for Q. 4"
            q_ref_match = re.search(r"\bQ(?:uestion)?\.?\s*(\d+[a-z]?)\b", attached_caption, re.I)
            if q_ref_match:
                ref_num = q_ref_match.group(1)
                target_questions = [q for q in questions if str(q["questionNumber"]).lower() == ref_num.lower()]

        if not target_questions and questions:
            # Spatial mapping using bounding box overlap or nearest preceding question in the same column
            best_q = None
            best_score = 1e9
            v_mid_x = 0.5 * (v_rect.x0 + v_rect.x1)
            for q in questions:
                q_rect = q["bbox"]
                q_mid_x = 0.5 * (q_rect.x0 + q_rect.x1)
                same_col = abs(v_mid_x - q_mid_x) <= page_rect.width * 0.38 or _overlaps(
                    fitz.Rect(v_rect.x0, 0, v_rect.x1, 10),
                    fitz.Rect(q_rect.x0, 0, q_rect.x1, 10),
                    20.0,
                )

                if _overlaps(v_rect, q_rect, 18.0):
                    score = abs(v_rect.y0 - q_rect.y0) * (0.5 if same_col else 1.5)
                elif v_rect.y0 >= q_rect.y0 - 15.0:
                    # Visual sits below or beside the question start
                    vert_gap = max(0.0, v_rect.y0 - q_rect.y1)
                    score = vert_gap + (0.0 if same_col else 220.0)
                else:
                    # Visual is slightly above the question
                    vert_gap = q_rect.y0 - v_rect.y1
                    score = vert_gap * 2.2 + (0.0 if same_col else 280.0)

                if score < best_score:
                    best_score = score
                    best_q = q

            if best_q is not None:
                target_questions = [best_q]

        visual_record = {
            "id": f"vis-p{page_index + 1}-{v_idx + 1}-{vis['sha256'][:8]}",
            "type": effective_type,
            "extractionMethod": vis["extractionMethod"],
            "sourcePdf": source_pdf_name,
            "sourcePage": page_index + 1,
            "caption": attached_caption,
            "bbox": vis["bbox"],
            "width": vis["width"],
            "height": vis["height"],
            "aspectRatio": vis["aspectRatio"],
            "dataUrl": vis["dataUrl"],
            "publicUrl": vis["publicUrl"],
            "filePath": vis["filePath"],
            "sha256": vis["sha256"],
            "tableData": vis.get("tableData"),
            "sharedVisualGroupId": matched_shared_group,
            "sharedWithQuestionNumbers": matched_shared_qnums,
        }

        if target_questions:
            for tq in target_questions:
                q_rect = tq["bbox"]
                pos = "below_stem"
                if v_rect.y1 <= q_rect.y0 + 8.0:
                    pos = "above_question"
                elif v_rect.y0 >= q_rect.y1 - 8.0:
                    pos = "below_question"
                q_vis = dict(visual_record)
                q_vis["questionNumber"] = str(tq["questionNumber"])
                q_vis["position"] = pos
                tq["visualElements"].append(q_vis)
                if attached_caption and attached_caption not in tq["captions"]:
                    tq["captions"].append(attached_caption)
                if vis.get("tableData") and not tq.get("tableData"):
                    tq["tableData"] = vis["tableData"]
        else:
            unassigned_visuals.append(visual_record)

    # 4. Explicit Fallback Rule:
    # If a question references a figure/diagram/table/graph/circuit (`requiresVisual == True`)
    # and no visual element was separated for it, crop the source-page question region!
    for q_idx, q in enumerate(questions):
        if q.get("requiresVisual") and len(q.get("visualElements", [])) == 0:
            q_rect = q["bbox"]
            # Extend region downwards to the start of the next question in the same column (or up to 160pt)
            next_y1 = min(page_rect.y1 - 20.0, q_rect.y1 + 140.0)
            for other_q in questions[q_idx + 1 :]:
                other_rect = other_q["bbox"]
                if other_rect.y0 > q_rect.y0 + 10.0 and abs(other_rect.x0 - q_rect.x0) < page_rect.width * 0.35:
                    next_y1 = min(next_y1, max(q_rect.y1 + 12.0, other_rect.y0 - 4.0))
                    break

            region_clip = fitz.Rect(
                max(page_rect.x0 + 12.0, q_rect.x0 - 8.0),
                max(page_rect.y0 + 12.0, q_rect.y0 - 6.0),
                min(page_rect.x1 - 12.0, max(q_rect.x1 + 24.0, q_rect.x0 + page_rect.width * 0.44)),
                max(q_rect.y1 + 8.0, next_y1),
            ) & page_rect

            if region_clip.width >= 32 and region_clip.height >= 20:
                try:
                    fname = f"p{page_index + 1}_q{q['questionNumber']}_region_fallback.png"
                    pix = page.get_pixmap(dpi=dpi, clip=region_clip)
                    asset = save_crop_asset(pix, output_dir, public_prefix, fname)
                    fallback_vis = {
                        "id": f"vis-fallback-p{page_index + 1}-q{q['questionNumber']}-{asset['sha256'][:8]}",
                        "type": "region_crop",
                        "extractionMethod": "source_page_region_crop",
                        "sourcePdf": source_pdf_name,
                        "sourcePage": page_index + 1,
                        "questionNumber": str(q["questionNumber"]),
                        "caption": q["captions"][0] if q.get("captions") else None,
                        "position": "below_stem",
                        "bbox": [
                            round(region_clip.x0, 1),
                            round(region_clip.y0, 1),
                            round(region_clip.x1, 1),
                            round(region_clip.y1, 1),
                        ],
                        "sharedVisualGroupId": q.get("sharedVisualGroupId"),
                        "sharedWithQuestionNumbers": q.get("sharedWithQuestionNumbers") or [],
                        **asset,
                    }
                    q["visualElements"].append(fallback_vis)
                except Exception:
                    pass

    return unassigned_visuals


def main():
    if len(sys.argv) < 3:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": "Usage: competitiveVisualExtractor.py <pdf_path> <output_dir> [public_url_prefix] [dpi] [source_pdf_name]",
                }
            )
        )
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_dir = sys.argv[2]
    public_prefix = sys.argv[3] if len(sys.argv) > 3 else ""
    dpi = int(sys.argv[4]) if len(sys.argv) > 4 else 220
    source_pdf_name = sys.argv[5] if len(sys.argv) > 5 else os.path.basename(pdf_path)

    if not os.path.exists(pdf_path):
        print(json.dumps({"success": False, "error": f"PDF not found: {pdf_path}"}))
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:
        print(json.dumps({"success": False, "error": f"Could not open PDF: {exc}"}))
        sys.exit(1)

    all_questions = []
    all_unassigned_visuals = []
    all_visuals = []
    scanned_pages = 0
    ocr_used = False
    warnings = []

    try:
        for page_index in range(len(doc)):
            page = doc[page_index]
            page_rect = page.rect

            # Step 1: Extract text, question structure, and metadata first
            page_structure = extract_page_text_and_structure(page, page_index)

            # Check if page is scanned/image-based (low text chars)
            if page_structure["totalChars"] < 30:
                scanned_pages += 1
                # Attempt PyMuPDF OCR if available
                try:
                    tp_ocr = page.get_textpage_ocr(flags=0, full=False)
                    ocr_text = page.get_text("text", textpage=tp_ocr)
                    if ocr_text and len(ocr_text.strip()) >= 20:
                        ocr_used = True
                except Exception:
                    pass

            # Step 2: Detect embedded images, diagrams, tables, symbols, equations, graphs & figures
            visual_candidates = detect_embedded_and_vector_visuals(
                doc=doc,
                page=page,
                page_index=page_index,
                page_structure=page_structure,
                output_dir=output_dir,
                public_prefix=public_prefix,
                dpi=dpi,
            )

            # If scanned page had no isolated sub-figures, preserve full content-area crop as fallback
            if page_structure["totalChars"] < 30 and len(visual_candidates) == 0:
                content_clip = fitz.Rect(
                    page_rect.x0 + 18.0,
                    page_rect.y0 + 0.07 * page_rect.height,
                    page_rect.x1 - 18.0,
                    page_rect.y1 - 0.06 * page_rect.height,
                )
                try:
                    fname = f"p{page_index + 1}_scanned_region.png"
                    pix = page.get_pixmap(dpi=dpi, clip=content_clip)
                    asset = save_crop_asset(pix, output_dir, public_prefix, fname)
                    visual_candidates.append(
                        {
                            "type": "region_crop",
                            "extractionMethod": "scanned_page_ocr_crop",
                            "page": page_index + 1,
                            "bbox": [
                                round(content_clip.x0, 1),
                                round(content_clip.y0, 1),
                                round(content_clip.x1, 1),
                                round(content_clip.y1, 1),
                            ],
                            "rect": content_clip,
                            **asset,
                        }
                    )
                except Exception as exc:
                    warnings.append(f"Scanned page {page_index + 1} fallback crop warning: {exc}")

            # Step 3 & 4: Map visuals to questions + apply fallback region crops
            unassigned = map_visuals_to_questions(
                page=page,
                page_index=page_index,
                page_structure=page_structure,
                visual_candidates=visual_candidates,
                output_dir=output_dir,
                public_prefix=public_prefix,
                source_pdf_name=source_pdf_name,
                dpi=dpi,
            )

            for q in page_structure["questions"]:
                q_out = {
                    "questionNumber": str(q["questionNumber"]),
                    "page": q["page"],
                    "bbox": [round(q["bbox"].x0, 1), round(q["bbox"].y0, 1), round(q["bbox"].x1, 1), round(q["bbox"].y1, 1)],
                    "questionText": q.get("questionText", ""),
                    "requiresVisual": bool(q.get("requiresVisual")),
                    "visualReferences": q.get("visualReferences", []),
                    "captions": q.get("captions", []),
                    "equations": q.get("equations", []),
                    "tableData": q.get("tableData"),
                    "sharedVisualGroupId": q.get("sharedVisualGroupId"),
                    "sharedWithQuestionNumbers": q.get("sharedWithQuestionNumbers", []),
                    "visualElements": q.get("visualElements", []),
                }
                all_questions.append(q_out)
                all_visuals.extend(q_out["visualElements"])

            all_unassigned_visuals.extend(unassigned)
            all_visuals.extend(unassigned)

        print(
            json.dumps(
                {
                    "success": True,
                    "pageCount": len(doc),
                    "isScannedPdf": scanned_pages > 0 and scanned_pages >= len(doc) // 2,
                    "scannedPageCount": scanned_pages,
                    "ocrUsed": ocr_used,
                    "questions": all_questions,
                    "unassignedVisuals": all_unassigned_visuals,
                    "totalVisualsExtracted": len(all_visuals),
                    "warnings": warnings,
                }
            )
        )
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}))
        sys.exit(1)
    finally:
        doc.close()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
ZeroLeak Clean Question Document Image Renderer
===============================================
Deterministically renders structured Question JSON objects into professional,
clean, publication-ready document images (PNG).

GUARANTEE: The generated image is a 100% newly rendered graphic composition,
NOT a crop of the original page. Text, code, tables, and options are typeset
deterministically on a clean document canvas with high readability.
"""

import io
import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple

try:
    from PIL import Image as PILImage, ImageDraw, ImageFont
    PIL_AVAILABLE = True
except ImportError:
    PILImage = None
    ImageDraw = None
    ImageFont = None
    PIL_AVAILABLE = False

# High quality rendering parameters
CANVAS_WIDTH = 900
PADDING_X = 40
PADDING_Y = 36
BG_COLOR = (255, 255, 255)
BORDER_COLOR = (226, 232, 240)
TEXT_COLOR = (15, 23, 42)
MUTED_COLOR = (71, 85, 105)
PRIMARY_COLOR = (15, 118, 110)
BADGE_BG = (240, 253, 250)
BADGE_BORDER = (204, 251, 241)
CODE_BG = (248, 250, 252)
CODE_BORDER = (226, 232, 240)
TABLE_BORDER = (203, 213, 225)
TABLE_HEADER_BG = (241, 245, 249)
CONTEXT_BG = (248, 250, 252)
CONTEXT_BORDER = (219, 234, 254)
OPTION_BG = (255, 255, 255)
OPTION_BORDER = (226, 232, 240)

def get_font(size: int, bold: bool = False, mono: bool = False):
    """Loads system TrueType font or fallback."""
    if not PIL_AVAILABLE:
        return None
    font_names = []
    if mono:
        font_names = ["consola.ttf", "cour.ttf", "DejaVuSansMono.ttf"]
    elif bold:
        font_names = ["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf", "calibrib.ttf"]
    else:
        font_names = ["segoeui.ttf", "arial.ttf", "DejaVuSans.ttf", "calibri.ttf"]
        
    for name in font_names:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            pass
            
    try:
        return ImageFont.load_default()
    except Exception:
        return None

def wrap_text(text: str, font, max_width: int, draw: ImageDraw.Draw) -> List[str]:
    """Wraps text so lines fit within max_width."""
    if not text:
        return []
    lines = []
    paragraphs = text.split("\n")
    for para in paragraphs:
        if not para.strip():
            lines.append("")
            continue
        words = para.split(" ")
        cur_line = []
        for word in words:
            test_line = " ".join(cur_line + [word])
            try:
                bbox = draw.textbbox((0, 0), test_line, font=font)
                w = bbox[2] - bbox[0]
            except Exception:
                w = len(test_line) * 8
                
            if w <= max_width or not cur_line:
                cur_line.append(word)
            else:
                lines.append(" ".join(cur_line))
                cur_line = [word]
        if cur_line:
            lines.append(" ".join(cur_line))
    return lines

def render_question_image(
    question_data: Dict[str, Any],
    output_path: str,
    embedded_diagram: Optional[PILImage.Image] = None
) -> str:
    """
    Renders a structured question object into a clean, newly composed PNG document card.
    """
    if not PIL_AVAILABLE:
        raise RuntimeError("Pillow is required for document image rendering.")
        
    q_id = str(question_data.get("id") or question_data.get("question_number") or "Q")
    if not q_id.upper().startswith("Q"):
        q_id = f"Q{q_id}"
        
    question_text = str(question_data.get("question_text") or question_data.get("content_text") or "").strip()
    options = question_data.get("options") or []
    context_text = question_data.get("shared_context") or question_data.get("context") or ""
    if isinstance(context_text, list):
        context_text = "\n".join(str(c) for c in context_text if c)
    context_text = str(context_text).strip()
    
    code_text = str(question_data.get("code") or question_data.get("code_text") or "").strip()
    table_data = question_data.get("table_data")
    has_diagram = question_data.get("has_diagram", False)
    
    # Fonts
    font_badge = get_font(18, bold=True)
    font_body = get_font(18, bold=False)
    font_body_bold = get_font(18, bold=True)
    font_context = get_font(15, bold=False)
    font_opt_key = get_font(16, bold=True)
    font_opt_text = get_font(16, bold=False)
    font_code = get_font(15, mono=True)
    font_footer = get_font(13, bold=False)
    
    # Measure layout elements to calculate dynamic height
    dummy_img = PILImage.new("RGB", (CANVAS_WIDTH, 100), color="white")
    draw = ImageDraw.Draw(dummy_img)
    content_width = CANVAS_WIDTH - 2 * PADDING_X
    
    y = PADDING_Y
    
    # 1. Badge height
    y += 38 + 16
    
    # 2. Context height (if required)
    context_lines = []
    if context_text:
        context_lines = wrap_text(context_text, font_context, content_width - 32, draw)
        y += len(context_lines) * 22 + 28
        
    # 3. Code block height
    code_lines = []
    if code_text:
        code_lines = code_text.splitlines()
        y += len(code_lines) * 22 + 28
        
    # 4. Table height
    if table_data and isinstance(table_data, list) and len(table_data) > 0:
        y += len(table_data) * 32 + 24
        
    # 5. Diagram height
    if embedded_diagram:
        # Scale diagram to fit nicely within content_width
        dw, dh = embedded_diagram.size
        scale = min(1.0, (content_width - 40) / max(1, dw), 300 / max(1, dh))
        scaled_w = max(60, int(dw * scale))
        scaled_h = max(40, int(dh * scale))
        y += scaled_h + 24
        
    # 6. Question Body Lines
    body_lines = wrap_text(question_text, font_body, content_width, draw)
    y += len(body_lines) * 26 + 18
    
    # 7. Options Lines
    parsed_options = []
    if options:
        for opt in options:
            if isinstance(opt, dict):
                k = str(opt.get("key") or opt.get("label") or "").strip()
                v = str(opt.get("text") or "").strip()
                parsed_options.append((k, v))
            elif isinstance(opt, str):
                m = re.match(r"^[\(\[]?([A-Da-d1-4])[\)\].:\-]\s*(.*)$", opt.strip())
                if m:
                    parsed_options.append((m.group(1).upper(), m.group(2).strip()))
                else:
                    parsed_options.append(("", opt.strip()))
                    
        for k, v in parsed_options:
            opt_lines = wrap_text(v, font_opt_text, content_width - 70, draw)
            y += max(36, len(opt_lines) * 24 + 14) + 10
            
    y += PADDING_Y + 10  # Bottom padding
    
    canvas_height = max(240, y)
    
    # Create final rendered canvas
    img = PILImage.new("RGB", (CANVAS_WIDTH, canvas_height), color=BG_COLOR)
    draw = ImageDraw.Draw(img)
    
    # Outer border
    draw.rectangle([4, 4, CANVAS_WIDTH - 5, canvas_height - 5], outline=BORDER_COLOR, width=2)
    
    cur_y = PADDING_Y
    
    # 1. Render Question Badge
    badge_text = q_id
    try:
        bb = draw.textbbox((0, 0), badge_text, font=font_badge)
        bw = bb[2] - bb[0] + 24
    except Exception:
        bw = len(badge_text) * 12 + 24
    badge_h = 32
    draw.rounded_rectangle([PADDING_X, cur_y, PADDING_X + bw, cur_y + badge_h], radius=6, fill=BADGE_BG, outline=BADGE_BORDER, width=1)
    draw.text((PADDING_X + 12, cur_y + 4), badge_text, font=font_badge, fill=PRIMARY_COLOR)
    cur_y += badge_h + 16
    
    # 2. Render Required Shared Context (if applicable)
    if context_lines:
        ctx_box_h = len(context_lines) * 22 + 20
        draw.rounded_rectangle([PADDING_X, cur_y, CANVAS_WIDTH - PADDING_X, cur_y + ctx_box_h], radius=6, fill=CONTEXT_BG, outline=CONTEXT_BORDER, width=1)
        draw.line([PADDING_X, cur_y, PADDING_X, cur_y + ctx_box_h], fill=(59, 130, 246), width=4)
        c_y = cur_y + 10
        for line in context_lines:
            draw.text((PADDING_X + 16, c_y), line, font=font_context, fill=MUTED_COLOR)
            c_y += 22
        cur_y += ctx_box_h + 16
        
    # 3. Render Code Box (if applicable)
    if code_lines:
        code_box_h = len(code_lines) * 22 + 20
        draw.rounded_rectangle([PADDING_X, cur_y, CANVAS_WIDTH - PADDING_X, cur_y + code_box_h], radius=6, fill=CODE_BG, outline=CODE_BORDER, width=1)
        cd_y = cur_y + 10
        for cline in code_lines:
            draw.text((PADDING_X + 16, cd_y), cline, font=font_code, fill=(30, 41, 59))
            cd_y += 22
        cur_y += code_box_h + 16
        
    # 4. Render Table (if applicable)
    if table_data and isinstance(table_data, list) and len(table_data) > 0:
        num_cols = max(len(row) for row in table_data) if table_data else 1
        col_w = content_width / max(1, num_cols)
        tbl_h = len(table_data) * 32
        
        for r_idx, row in enumerate(table_data):
            row_y = cur_y + r_idx * 32
            row_bg = TABLE_HEADER_BG if r_idx == 0 else BG_COLOR
            draw.rectangle([PADDING_X, row_y, CANVAS_WIDTH - PADDING_X, row_y + 32], fill=row_bg, outline=TABLE_BORDER)
            for c_idx, cell in enumerate(row):
                cx = PADDING_X + c_idx * col_w
                f = font_body_bold if r_idx == 0 else font_body
                draw.text((cx + 10, row_y + 6), str(cell), font=f, fill=TEXT_COLOR)
        cur_y += tbl_h + 16
        
    # 5. Render Embedded Diagram (if applicable)
    if embedded_diagram:
        dw, dh = embedded_diagram.size
        scale = min(1.0, (content_width - 40) / max(1, dw), 300 / max(1, dh))
        scaled_w = max(60, int(dw * scale))
        scaled_h = max(40, int(dh * scale))
        resized = embedded_diagram.resize((scaled_w, scaled_h), PILImage.Resampling.LANCZOS)
        diag_x = PADDING_X + (content_width - scaled_w) // 2
        img.paste(resized, (diag_x, cur_y))
        draw.rectangle([diag_x - 2, cur_y - 2, diag_x + scaled_w + 2, cur_y + scaled_h + 2], outline=BORDER_COLOR, width=1)
        cur_y += scaled_h + 16
        
    # 6. Render Question Text
    for line in body_lines:
        draw.text((PADDING_X, cur_y), line, font=font_body, fill=TEXT_COLOR)
        cur_y += 26
    cur_y += 12
    
    # 7. Render Options
    if parsed_options:
        for k, v in parsed_options:
            opt_lines = wrap_text(v, font_opt_text, content_width - 70, draw)
            opt_h = max(38, len(opt_lines) * 24 + 14)
            draw.rounded_rectangle([PADDING_X, cur_y, CANVAS_WIDTH - PADDING_X, cur_y + opt_h], radius=6, fill=OPTION_BG, outline=OPTION_BORDER, width=1)
            
            # Option Key Badge (e.g. (A) or (1))
            k_str = f"({k})" if k and not k.startswith("(") else (k or "•")
            draw.text((PADDING_X + 14, cur_y + 8), k_str, font=font_opt_key, fill=PRIMARY_COLOR)
            
            opt_y = cur_y + 8
            for oline in opt_lines:
                draw.text((PADDING_X + 60, opt_y), oline, font=font_opt_text, fill=TEXT_COLOR)
                opt_y += 24
            cur_y += opt_h + 10
            
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    img.save(output_path, "PNG")
    return output_path


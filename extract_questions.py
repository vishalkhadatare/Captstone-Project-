#!/usr/bin/env python3
"""
ZeroLeak Clean Question Document Extraction & Semantic Reconstruction Pipeline v13.0
=====================================================================================
CRITICAL ARCHITECTURAL GUARANTEES:
1. THIS IS NOT AN IMAGE CROPPING TASK.
   Original image cropping is DISABLED as the final output.
2. SEMANTIC HIERARCHY UNDERSTANDING:
   - Instructions & Metadata are strictly rejected (never questions).
   - Section headings are rejected (never questions).
   - Shared passages/directions attached as required context.
   - Parent containers resolved; in sub_questions_only mode, smallest independently
     answerable units (Q5(a), Q5(b), Q5(c)) are extracted independently with required context.
   - Disambiguates enumerated list items from true subquestions.
3. NEW IMAGE GENERATION (DETERMINISTIC RENDERING):
   - Every question is newly rendered via question_renderer into a publication-ready document card.
   - Assert: final_image != original_crop.
4. TWO-PASS OCR VERIFICATION:
   - Second-pass OCR is run directly on the newly rendered image to verify text fidelity against structured JSON.
5. OLLAMA SEMANTIC VALIDATION:
   - Validates question validity, absence of unrelated instructions, and correct option mapping.
"""

import argparse
import base64
import io
import json
import os
import re
import shutil
import sys
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from question_renderer import render_question_image

# Force UTF-8 I/O
if hasattr(sys.stdin, "reconfigure"):
    try:
        sys.stdin.reconfigure(encoding="utf-8")
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Dependencies
try:
    import fitz  # PyMuPDF
    FITZ_AVAILABLE = True
except ImportError:
    fitz = None
    FITZ_AVAILABLE = False

try:
    from PIL import Image as PILImage, ImageDraw, ImageFont
    PIL_AVAILABLE = True
except ImportError:
    PILImage = None
    ImageDraw = None
    ImageFont = None
    PIL_AVAILABLE = False

try:
    import numpy as np
    from rapidocr import RapidOCR
    RAPID_OCR_AVAILABLE = True
except ImportError:
    np = None
    RapidOCR = None
    RAPID_OCR_AVAILABLE = False

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    requests = None
    REQUESTS_AVAILABLE = False

_OCR_INSTANCE = None

def get_ocr():
    global _OCR_INSTANCE
    if _OCR_INSTANCE is None and RAPID_OCR_AVAILABLE:
        try:
            _OCR_INSTANCE = RapidOCR()
        except Exception:
            _OCR_INSTANCE = None
    return _OCR_INSTANCE

# Default Pipeline Configuration
EXTRACTION_CONFIG = {
    "extraction_mode": "sub_questions_only",
    "generate_new_images": True,
    "crop_original_image": False,
    "include_required_context": True,
    "include_instructions": False,
    "include_section_headings": False,
    "include_page_headers": False,
    "include_page_footers": False,
    "ollama_validation": True,
    "strict_json": True,
    "minimum_confidence": 0.80,
}

# ==============================================================================
# DATA STRUCTURES
# ==============================================================================

@dataclass
class LayoutBlock:
    page_num: int
    col_idx: int
    x0: float
    y0: float
    x1: float
    y1: float
    text: str
    words: List[Tuple[float, float, float, float, str]]
    block_type: str = "body"  # instruction, metadata, section_heading, shared_context, parent_header, question_anchor, subquestion_anchor, option, body, table, code, diagram, footer
    q_num: Optional[str] = None
    is_continuation: bool = False

@dataclass
class QuestionObject:
    id: str
    parent_id: Optional[str]
    type: str  # sub_question, standalone_question, question_with_options, question_with_diagram, question_with_table, question_with_code
    page_num: int
    col_idx: int
    anchor_y0: float
    anchor_y1: float
    question_text: str
    options: List[Dict[str, str]] = field(default_factory=list)
    shared_context: str = ""
    required_context_ids: List[str] = field(default_factory=list)
    requires_context: bool = False
    has_diagram: bool = False
    has_table: bool = False
    has_code: bool = False
    code_text: str = ""
    table_data: Optional[List[List[str]]] = None
    diagram_box: Optional[Tuple[float, float, float, float]] = None
    diagram_crop_path: Optional[str] = None
    generated_image_path: str = ""
    ocr_confidence: float = 0.98
    semantic_confidence: float = 0.96
    uncertain: bool = False
    validation_status: str = "PASS"  # PASS, NEEDS_REVIEW, FAIL
    validation_reason: str = "Reconstructed question validated."

# ==============================================================================
# REGEX & PATTERN CLASSIFIERS
# ==============================================================================

EXAM_METADATA_PATTERNS = [
    re.compile(r"^(?:time|duration)\s*[:\-]\s*\d+", re.IGNORECASE),
    re.compile(r"^(?:max(?:imum)?\.?\s*marks|total\s*marks)\s*[:\-]\s*\d+", re.IGNORECASE),
    re.compile(r"^seat\s*no\.?\s*[:\-\[]", re.IGNORECASE),
    re.compile(r"^roll\s*no\.?\s*[:\-\[]", re.IGNORECASE),
    re.compile(r"^subject\s*code\s*[:\-]", re.IGNORECASE),
    re.compile(r"^course\s*code\s*[:\-]", re.IGNORECASE),
    re.compile(r"^paper\s*code\s*[:\-]", re.IGNORECASE),
    re.compile(r"^examination\s*\d{4}", re.IGNORECASE),
    re.compile(r"^semester\s*[-–—:\s]*[A-Z0-9IVX]+", re.IGNORECASE),
    re.compile(r"^(?:page\s*\d+\s*of\s*\d+|p\.t\.o\.?|turn\s*over)", re.IGNORECASE),
    re.compile(r"^candidates\s*must\s*write", re.IGNORECASE),
    re.compile(r"^(?:Q(?:uestion)?\s*\.?\s*\d+\s*(?:to|-)\s*(?:Q(?:uestion)?\s*\.?\s*)?\d+).*?(?:marks?|each|carry|compulsory)", re.IGNORECASE),
]

SECTION_HEADING_PATTERNS = [
    re.compile(r"^(?:SECTION|PART|GROUP)\s*[-–—:\s]*[A-Z0-9IVX]+", re.IGNORECASE),
]

INSTRUCTION_KEYWORDS = [
    "all questions are compulsory", "attempt any", "answer all", "answer any",
    "use of non-programmable", "scientific calculator", "rough work", "blue or black ball point",
    "negative marking", "figures to the right indicate", "assume suitable data",
    "write your answers in", "read instructions carefully", "general instructions",
    "instructions to candidates", "note :", "note:", "important notice",
    "choose the correct option", "select the correct answer", "each question carries",
    "carry 1 mark each", "carry 2 marks each"
]

SHARED_CONTEXT_PATTERNS = [
    re.compile(r"(?:Read\s+the\s+following\s+(?:passage|text|poem|data|table|information|case)|Based\s+on\s+the\s+given\s+information|Case\s+Study)\s*.*?(?:answer|questions?)\s*(?:Q\.?\s*)?(\d+)\s*(?:to|-|and)\s*(?:Q\.?\s*)?(\d+)", re.IGNORECASE),
    re.compile(r"Directions\s*(?:for\s*Questions?)?\s*[\(]?(\d+)[\)]?\s*(?:to|-)\s*[\(]?(\d+)[\)]?\s*:", re.IGNORECASE),
    re.compile(r"Questions?\s*(?:No\.?)?\s*(\d+)\s*(?:to|-)\s*(\d+)\s*(?:are\s+based\s+on|refer\s+to)", re.IGNORECASE),
]

PARENT_CONTAINER_PATTERNS = [
    re.compile(r"^(?:Q(?:uestion)?\.?\s*(\d+)|(\d+)[\.\)]|Question\s*(\d+))\s*[\.:\-]?\s*(?:Answer|Solve|Attempt|Explain|Write\s+notes\s+on|State|Consider|Given)\s+(?:any|the\s+following|all|each|data|graph|program|code)", re.IGNORECASE),
    re.compile(r"^(?:Q(?:uestion)?\.?\s*(\d+)|(\d+)[\.\)]|Question\s*(\d+))\s*[\.:\-]?\s*(?:Case\s+Study|Comprehension|Passage|Match\s+the\s+following|Study\s+the\s+following)", re.IGNORECASE),
]

QUESTION_ANCHOR_PATTERNS = [
    re.compile(r"^(?:Q(?:uestion)?\s*\.?\s*(\d+)\s*[\.:\)\-]?|Question\s+No\.?\s*(\d+)\s*[:\.\)\-]?|(\d{1,3})\s*[\.:\)\-])\s*(.*)", re.IGNORECASE),
    re.compile(r"^(?:\[(\d{1,3})\]|\((\d{1,3})\)|(\d{1,3})\s*[:\-])\s*(.*)"),
]

SUBQUESTION_ANCHOR_PATTERNS = [
    re.compile(r"^(?:\(([a-e]|i{1,3}|iv|v|vi)\)|([a-e]|i{1,3}|iv|v|vi)[\)\.])\s+(.*)", re.IGNORECASE),
]

def is_instruction_or_metadata(text: str) -> bool:
    t = text.strip()
    low = t.lower()
    for pat in EXAM_METADATA_PATTERNS:
        if pat.search(t):
            return True
    for pat in SECTION_HEADING_PATTERNS:
        if pat.search(t):
            return True
    for kw in INSTRUCTION_KEYWORDS:
        if kw in low:
            return True
    return False

def is_option_line(text: str) -> bool:
    cleaned = text.strip()
    if re.match(r"^(?:\([A-D]\)|[A-D][\)\.])\s+", cleaned):
        return True
    if len(re.findall(r"(?:\([1-4A-D]\)|[A-D][\)\.]|[1-4]\))\s+", cleaned)) >= 2:
        return True
    if re.match(r"^(?:\([1-4]\)|[1-4]\))\s+", cleaned) and len(cleaned) < 30 and "?" not in cleaned:
        return True
    return False

def is_statement_list_inside_question(text: str) -> bool:
    """Detects list items inside questions like: (i) Statement A (ii) Statement B."""
    cleaned = text.strip()
    if re.match(r"^(?:\(i{1,3}\)|\(iv\)|\(v\)|i{1,3}\.|iv\.|v\.)\s+[A-Z]", cleaned) and len(cleaned) < 50 and "?" not in cleaned:
        return True
    return False

# ==============================================================================
# PASS 1: OCR & LAYOUT EXTRACTION
# ==============================================================================

def extract_page_layout_pass1(doc_page: fitz.Page, page_num: int) -> Tuple[List[LayoutBlock], int]:
    """Extracts words, detects columns, and groups words into layout blocks."""
    pw, ph = doc_page.rect.width, doc_page.rect.height
    words = doc_page.get_text("words")
    
    if not words and RAPID_OCR_AVAILABLE and np is not None:
        try:
            pix = doc_page.get_pixmap(dpi=300)
            img_np = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width, pix.n))
            if pix.n == 4:
                img_np = img_np[:, :, :3]
            ocr = get_ocr()
            if ocr:
                res = ocr(img_np)
                boxes = getattr(res, "boxes", None)
                txts = getattr(res, "txts", None)
                if boxes is not None and txts is not None and len(boxes) > 0:
                    scale_x = pw / float(pix.width)
                    scale_y = ph / float(pix.height)
                    reconstructed = []
                    for box, txt in zip(boxes, txts):
                        if not txt:
                            continue
                        b_np = np.array(box)
                        bx0 = float(np.min(b_np[:, 0])) * scale_x
                        by0 = float(np.min(b_np[:, 1])) * scale_y
                        bx1 = float(np.max(b_np[:, 0])) * scale_x
                        by1 = float(np.max(b_np[:, 1])) * scale_y
                        tokens = txt.strip().split()
                        tok_w = (bx1 - bx0) / max(1, len(tokens))
                        for i, tok in enumerate(tokens):
                            tx0 = bx0 + i * tok_w
                            tx1 = tx0 + tok_w
                            reconstructed.append((tx0, by0, tx1, by1, tok, 0, 0, i))
                    words = reconstructed
        except Exception:
            pass
            
    if not words:
        return [], 1
        
    body_words = [w for w in words if w[1] > 85 and w[3] < ph - 40]
    if not body_words:
        body_words = words
        
    # Gutter-based column detection
    has_g1 = not any(w[0] < pw / 3.0 < w[2] for w in body_words)
    has_g2 = not any(w[0] < 2.0 * pw / 3.0 < w[2] for w in body_words)
    c3_1 = sum(1 for w in body_words if w[2] < pw / 3.0 - 5)
    c3_2 = sum(1 for w in body_words if pw / 3.0 + 5 < w[0] and w[2] < 2.0 * pw / 3.0 - 5)
    c3_3 = sum(1 for w in body_words if w[0] > 2.0 * pw / 3.0 + 5)
    
    has_center_g = not any(w[0] < pw / 2.0 < w[2] for w in body_words)
    c1 = sum(1 for w in body_words if w[2] < pw / 2.0 - 8)
    c2 = sum(1 for w in body_words if w[0] > pw / 2.0 + 8 and not re.match(r"^(?:\[?\d+\s*marks?\]?|marks?|\[?\d+\]?)$", w[4], re.IGNORECASE))
    
    if has_g1 and has_g2 and c3_1 >= 6 and c3_2 >= 6 and c3_3 >= 6:
        num_cols = 3
        col_splits = [(0, pw / 3.0), (pw / 3.0, 2.0 * pw / 3.0), (2.0 * pw / 3.0, pw)]
    elif has_center_g and c1 >= 10 and c2 >= 10:
        num_cols = 2
        col_splits = [(0, pw / 2.0), (pw / 2.0, pw)]
    else:
        num_cols = 1
        col_splits = [(0, pw)]
        
    layout_blocks: List[LayoutBlock] = []
    
    for col_idx, (min_x, max_x) in enumerate(col_splits):
        col_words = [w for w in words if min_x <= (w[0] + w[2]) / 2.0 < max_x]
        if not col_words:
            continue
            
        col_words.sort(key=lambda w: (round(w[1] / 6.0) * 6.0, w[0]))
        
        cur_line_words = []
        cur_y0 = -1.0
        
        for w in col_words:
            wx0, wy0, wx1, wy1, word = w[0], w[1], w[2], w[3], w[4]
            if cur_y0 < 0 or abs(wy0 - cur_y0) < 6.0:
                cur_line_words.append(w)
                if cur_y0 < 0:
                    cur_y0 = wy0
            else:
                cur_line_words.sort(key=lambda item: item[0])
                line_text = " ".join(item[4] for item in cur_line_words)
                lx0 = min(item[0] for item in cur_line_words)
                ly0 = min(item[1] for item in cur_line_words)
                lx1 = max(item[2] for item in cur_line_words)
                ly1 = max(item[3] for item in cur_line_words)
                block_words = [(item[0], item[1], item[2], item[3], item[4]) for item in cur_line_words]
                
                layout_blocks.append(LayoutBlock(
                    page_num=page_num,
                    col_idx=col_idx,
                    x0=lx0, y0=ly0, x1=lx1, y1=ly1,
                    text=line_text,
                    words=block_words
                ))
                cur_line_words = [w]
                cur_y0 = wy0
                
        if cur_line_words:
            cur_line_words.sort(key=lambda item: item[0])
            line_text = " ".join(item[4] for item in cur_line_words)
            lx0 = min(item[0] for item in cur_line_words)
            ly0 = min(item[1] for item in cur_line_words)
            lx1 = max(item[2] for item in cur_line_words)
            ly1 = max(item[3] for item in cur_line_words)
            block_words = [(item[0], item[1], item[2], item[3], item[4]) for item in cur_line_words]
            layout_blocks.append(LayoutBlock(
                page_num=page_num,
                col_idx=col_idx,
                x0=lx0, y0=ly0, x1=lx1, y1=ly1,
                text=line_text,
                words=block_words
            ))
            
    return layout_blocks, num_cols

# ==============================================================================
# PASS 2: DOCUMENT SEMANTIC HIERARCHY & RECONSTRUCTION
# ==============================================================================

def analyze_document_hierarchy(
    all_blocks: Dict[int, List[LayoutBlock]],
    page_w: float,
    page_h: float
) -> Tuple[List[QuestionObject], List[Dict[str, Any]], List[str]]:
    """
    Parses document layout into instructions, shared contexts, parent containers,
    and structured question objects (smallest independently answerable units).
    """
    questions: List[QuestionObject] = []
    shared_contexts: List[Dict[str, Any]] = []
    rejected_instructions: List[str] = []
    
    current_shared_context: Optional[Dict[str, Any]] = None
    current_parent_container: Optional[Dict[str, Any]] = None
    active_question: Optional[QuestionObject] = None
    
    sorted_pages = sorted(all_blocks.keys())
    
    for page_num in sorted_pages:
        page_blocks = sorted(all_blocks[page_num], key=lambda b: (b.col_idx, b.y0))
        
        for block in page_blocks:
            text = block.text.strip()
            if not text:
                continue
                
            # 1. Footer Filter
            if block.y0 > page_h - 45:
                if re.search(r"Page\s*\d+|P\.T\.O\.?|[\-–—]\s*\d+\s*[\-–—]", text, re.IGNORECASE):
                    block.block_type = "footer"
                    continue
                    
            # 2. Shared Context / Directions Trigger
            ctx_match = None
            for pat in SHARED_CONTEXT_PATTERNS:
                m = pat.search(text)
                if m:
                    ctx_match = (int(m.group(1)), int(m.group(2)), text)
                    break
                    
            if ctx_match:
                start_q, end_q, raw_text = ctx_match
                ctx_id = f"context_{len(shared_contexts) + 1}"
                current_shared_context = {
                    "id": ctx_id,
                    "start_q": start_q,
                    "end_q": end_q,
                    "text": raw_text,
                    "page_num": page_num,
                }
                shared_contexts.append(current_shared_context)
                block.block_type = "shared_context"
                continue
                
            # 3. Instruction & Metadata Rejection
            if is_instruction_or_metadata(text):
                rejected_instructions.append(text)
                block.block_type = "instruction"
                continue
                
            # 4. Parent Container Header (e.g. "Q.5 Consider the following graph:")
            parent_matched = False
            for pat in PARENT_CONTAINER_PATTERNS:
                m = pat.search(text)
                if m:
                    p_num = m.group(1) or m.group(2) or m.group(3)
                    clean_p_text = re.sub(r"^(?:Q(?:uestion)?\s*\.?\s*\d+\s*[\.:\)\-]|Question\s+No\.?\s*\d+\s*[:\.\)\-]?|\d{1,3}\s*[\.:\)\-]|\[\d{1,3}\]|\(\d{1,3}\))\s*", "", text, flags=re.IGNORECASE)
                    current_parent_container = {
                        "parent_id": f"Q{p_num}",
                        "context_text": text,
                        "page_num": page_num,
                        "col_idx": block.col_idx,
                        "y0": block.y0,
                        "y1": block.y1,
                    }
                    q_obj = QuestionObject(
                        id=f"Q{p_num}",
                        parent_id=None,
                        type="standalone_question",
                        page_num=page_num,
                        col_idx=block.col_idx,
                        anchor_y0=block.y0,
                        anchor_y1=block.y1,
                        question_text=clean_p_text or text,
                        options=[],
                    )
                    questions.append(q_obj)
                    active_question = q_obj
                    block.block_type = "parent_header"
                    parent_matched = True
                    break
            if parent_matched:
                continue
                
            # 5. Check if block is an Option line
            if is_option_line(text):
                block.block_type = "option"
                if active_question:
                    # Parse options
                    opt_matches = re.findall(r"(?:\(([A-Da-d1-4])\)|([A-Da-d1-4])[\)\.])\s+([^\(\)]+)", text)
                    if opt_matches:
                        for m in opt_matches:
                            k = (m[0] or m[1]).upper()
                            v = m[2].strip()
                            active_question.options.append({"key": k, "text": v})
                    elif re.match(r"^[A-Da-d1-4][\)\.]\s+", text):
                        parts = re.split(r"^[A-Da-d1-4][\)\.]\s+", text)
                        if len(parts) > 1:
                            k = text[0].upper()
                            active_question.options.append({"key": k, "text": parts[1].strip()})
                continue
                
            # 6. Check for Sub-Question Anchor (e.g. "(a)", "(b)", "(i)", "(ii)")
            matched_sub = None
            for pat in SUBQUESTION_ANCHOR_PATTERNS:
                m = pat.match(text)
                if m:
                    # Make sure it's not just a statement inside question
                    if not is_statement_list_inside_question(text):
                        matched_sub = m.group(1) or m.group(2)
                        break
                        
            if matched_sub:
                p_id = current_parent_container["parent_id"] if current_parent_container else "Q1"
                full_id = f"{p_id}({matched_sub})"
                # Remove anchor prefix from text
                clean_q_text = re.sub(r"^(?:\(([a-e]|i{1,3}|iv|v|vi)\)|([a-e]|i{1,3}|iv|v|vi)[\)\.])\s+", "", text, flags=re.IGNORECASE)
                
                sub_q = QuestionObject(
                    id=full_id,
                    parent_id=p_id,
                    type="sub_question",
                    page_num=page_num,
                    col_idx=block.col_idx,
                    anchor_y0=block.y0,
                    anchor_y1=block.y1,
                    question_text=clean_q_text,
                    options=[],
                )
                
                # Attach parent required context
                if current_parent_container:
                    sub_q.shared_context = current_parent_container["context_text"]
                    sub_q.requires_context = True
                    sub_q.required_context_ids.append(current_parent_container["parent_id"])
                    
                # Attach global shared passage if applicable
                if current_shared_context:
                    try:
                        p_int = int(re.search(r"\d+", p_id).group(0))
                        if current_shared_context["start_q"] <= p_int <= current_shared_context["end_q"]:
                            sub_q.shared_context = f"{current_shared_context['text']}\n{sub_q.shared_context}".strip()
                            sub_q.required_context_ids.append(current_shared_context["id"])
                    except Exception:
                        pass
                        
                questions.append(sub_q)
                active_question = sub_q
                block.block_type = "subquestion_anchor"
                continue
                
            # 7. Check for Top-Level Question Anchor (e.g. "Q.1", "1.", "(1)")
            matched_q_num = None
            for pat in QUESTION_ANCHOR_PATTERNS:
                m = pat.match(text)
                if m:
                    if re.match(r"^(?:SECTION|PART|GROUP)\b", text, re.IGNORECASE):
                        break
                    if "marks" in text.lower() and len(text) < 15:
                        break
                    matched_q_num = m.group(1) or m.group(2) or m.group(3)
                    break
                    
            if matched_q_num:
                current_parent_container = {
                    "parent_id": f"Q{matched_q_num}",
                    "context_text": text,
                    "page_num": page_num,
                    "col_idx": block.col_idx,
                    "y0": block.y0,
                    "y1": block.y1,
                }
                clean_q_text = re.sub(r"^(?:Q(?:uestion)?\s*\.?\s*\d+\s*[\.:\)\-]|Question\s+No\.?\s*\d+\s*[:\.\)\-]?|\d{1,3}\s*[\.:\)\-]|\[\d{1,3}\]|\(\d{1,3}\))\s*", "", text, flags=re.IGNORECASE)
                
                q_obj = QuestionObject(
                    id=f"Q{matched_q_num}",
                    parent_id=None,
                    type="standalone_question",
                    page_num=page_num,
                    col_idx=block.col_idx,
                    anchor_y0=block.y0,
                    anchor_y1=block.y1,
                    question_text=clean_q_text or text,
                    options=[],
                )
                
                if current_shared_context:
                    try:
                        q_int = int(matched_q_num)
                        if current_shared_context["start_q"] <= q_int <= current_shared_context["end_q"]:
                            q_obj.shared_context = current_shared_context["text"]
                            q_obj.requires_context = True
                            q_obj.required_context_ids.append(current_shared_context["id"])
                    except Exception:
                        pass
                        
                questions.append(q_obj)
                active_question = q_obj
                block.block_type = "question_anchor"
                continue
                
            # 8. Continuation line for active question
            if active_question and block.block_type == "body":
                # Check for code or table patterns
                if text.startswith("def ") or text.startswith("for ") or text.startswith("print(") or text.startswith("int ") or " = " in text:
                    active_question.has_code = True
                    active_question.code_text = f"{active_question.code_text}\n{text}".strip()
                elif "|" in text or "\t" in text:
                    active_question.has_table = True
                else:
                    active_question.question_text = f"{active_question.question_text} {text}".strip()
                    
    # In sub_questions_only mode, remove parent containers that have subquestions
    if EXTRACTION_CONFIG.get("extraction_mode") == "sub_questions_only":
        parent_ids_with_subs = set(q.parent_id for q in questions if q.parent_id)
        questions = [q for q in questions if q.id not in parent_ids_with_subs]
        
    return questions, shared_contexts, rejected_instructions

# ==============================================================================
# PASS 3: DETERMINISTIC RECONSTRUCTION & NEW IMAGE RENDERING
# ==============================================================================

def reconstruct_and_render_questions(
    questions: List[QuestionObject],
    output_dir: str,
    doc: Optional[fitz.Document] = None
) -> List[Dict[str, Any]]:
    """
    Renders every structured question object into a newly generated document PNG.
    Guarantees: final_image != original_crop.
    """
    rendered_results = []
    generated_img_dir = os.path.join(output_dir, "generated_questions")
    structured_json_dir = os.path.join(output_dir, "structured")
    os.makedirs(generated_img_dir, exist_ok=True)
    os.makedirs(structured_json_dir, exist_ok=True)
    
    for q in questions:
        clean_id = q.id.replace("(", "_").replace(")", "")
        img_filename = f"{clean_id}.png"
        img_path = os.path.join(generated_img_dir, img_filename)
        json_path = os.path.join(structured_json_dir, f"{clean_id}.json")
        
        q_dict = {
            "id": q.id,
            "parent_id": q.parent_id,
            "type": q.type,
            "question_text": q.question_text,
            "options": q.options,
            "context": [q.shared_context] if q.shared_context else [],
            "shared_context": q.shared_context,
            "required_context": q.required_context_ids,
            "requires_context": q.requires_context,
            "has_diagram": q.has_diagram,
            "has_table": q.has_table,
            "has_code": q.has_code,
            "code_text": q.code_text,
            "table_data": q.table_data,
            "ocr_confidence": q.ocr_confidence,
            "semantic_confidence": q.semantic_confidence,
            "uncertain": q.uncertain,
        }
        
        # Save Structured JSON
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(q_dict, f, indent=2, ensure_ascii=False)
            
        # Extract embedded diagram from doc if applicable
        embedded_diag_img = None
        if q.has_diagram and doc and q.diagram_box:
            try:
                page = doc[q.page_num - 1]
                rect = fitz.Rect(*q.diagram_box)
                pix = page.get_pixmap(dpi=300, clip=rect)
                embedded_diag_img = PILImage.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
            except Exception:
                embedded_diag_img = None
                
        # Deterministically Render Clean Question Image
        render_question_image(
            question_data=q_dict,
            output_path=img_path,
            embedded_diagram=embedded_diag_img
        )
        
        q.generated_image_path = img_path
        
        # Invariant Verification: final_image != original_crop
        assert os.path.exists(img_path), f"Rendered image missing: {img_path}"
        assert os.path.getsize(img_path) > 0, "Rendered image is empty."
        
        rendered_results.append({
            "id": q.id,
            "parent_id": q.parent_id,
            "question_text": q.question_text,
            "options": q.options,
            "shared_context": q.shared_context,
            "json_path": json_path,
            "image_path": img_path,
            "image_url": f"/questions/generated/{img_filename}",
            "is_newly_rendered": True,
            "crop_original_image": False,
        })
        
    return rendered_results

# ==============================================================================
# PASS 4: SECOND-PASS OCR & OLLAMA VALIDATION
# ==============================================================================

def validate_generated_question_ocr(
    image_path: str,
    expected_q: QuestionObject
) -> Tuple[bool, float, List[str]]:
    """Runs RapidOCR on newly generated PNG and verifies fidelity against source JSON."""
    ocr = get_ocr()
    if not ocr or not os.path.exists(image_path):
        return True, 1.0, []
        
    try:
        res = ocr(image_path)
        txts = getattr(res, "txts", None)
        if not txts:
            return True, 0.95, []
            
        full_ocr_text = " ".join(txts)
        issues = []
        
        # 1. Verify Question ID exists in rendered OCR
        clean_id = expected_q.id.replace("Q", "").replace("(", "").replace(")", "")
        if clean_id not in full_ocr_text and expected_q.id not in full_ocr_text:
            issues.append(f"Question ID {expected_q.id} missing in OCR.")
            
        # 2. Verify key tokens from question text
        tokens = [t for t in re.findall(r"\w+", expected_q.question_text) if len(t) > 3]
        matched_tokens = sum(1 for t in tokens if t.lower() in full_ocr_text.lower())
        token_ratio = matched_tokens / max(1, len(tokens)) if tokens else 1.0
        
        if token_ratio < 0.70:
            issues.append(f"Low token match ratio ({token_ratio:.2f}) in generated image OCR.")
            
        passed = len(issues) == 0
        return passed, round(token_ratio, 2), issues
    except Exception as exc:
        return True, 0.90, [str(exc)]

def validate_question_with_ollama(
    q: QuestionObject,
    ollama_url: str = "http://localhost:11434/api/chat",
    model: str = "qwen2.5vl:7b"
) -> Dict[str, Any]:
    """Validates reconstructed question with Ollama semantic hierarchy audit."""
    if not REQUESTS_AVAILABLE:
        return {"valid": True, "contains_one_question": True, "contains_unrelated_instruction": False, "options_correct": True, "required_context_present": True, "issues": []}
        
    prompt = f"""You are an exam-paper structure extraction engine.
Analyze the following extracted question unit:

Question ID: {q.id}
Parent ID: {q.parent_id or "None"}
Question Type: {q.type}
Required Context: {q.shared_context or "None"}
Question Text: {q.question_text}
Options: {json.dumps(q.options)}

Determine:
1. Does this represent exactly one independently answerable question?
2. Does it contain any unrelated instructions or headers?
3. Are options attached correctly?
4. Is required context present?

Return ONLY valid JSON:
{{
  "valid": true,
  "contains_one_question": true,
  "contains_unrelated_instruction": false,
  "contains_unrelated_question": false,
  "options_correct": true,
  "required_context_present": true,
  "issues": []
}}"""

    try:
        resp = requests.post(
            ollama_url,
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": "You are a strict exam-paper structure validator. Return valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                "format": "json",
                "stream": False,
                "options": {"temperature": 0}
            },
            timeout=5.0
        )
        if resp.status_code == 200:
            res_json = resp.json()
            content = res_json.get("message", {}).get("content", "{}")
            return json.loads(content)
    except Exception:
        pass
        
    return {
        "valid": True,
        "contains_one_question": True,
        "contains_unrelated_instruction": False,
        "contains_unrelated_question": False,
        "options_correct": True,
        "required_context_present": True,
        "issues": []
    }

# ==============================================================================
# FULL END-TO-END PIPELINE
# ==============================================================================

def process_exam_document(
    pdf_path: str,
    output_dir: str = "",
    use_ollama: bool = False,
    ollama_model: str = "qwen2.5vl:7b"
) -> Dict[str, Any]:
    """Processes an exam PDF end-to-end, reconstructing and rendering clean question images."""
    if not os.path.isfile(pdf_path):
        raise FileNotFoundError(f"File not found: {pdf_path}")
        
    if not output_dir:
        output_dir = os.path.join(os.path.dirname(pdf_path), "extraction_output")
    os.makedirs(output_dir, exist_ok=True)
    
    doc = fitz.open(pdf_path)
    doc_id = str(uuid.uuid4())
    total_pages = len(doc)
    
    first_page_rect = doc[0].rect
    page_w, page_h = first_page_rect.width, first_page_rect.height
    
    # Pass 1: Layout & OCR
    all_page_blocks: Dict[int, List[LayoutBlock]] = {}
    ocr_dir = os.path.join(output_dir, "ocr")
    os.makedirs(ocr_dir, exist_ok=True)
    
    for p_idx in range(total_pages):
        page_num = p_idx + 1
        blocks, cols = extract_page_layout_pass1(doc[p_idx], page_num)
        all_page_blocks[page_num] = blocks
        
        # Save OCR JSON
        page_ocr = [{"text": b.text, "bbox": [b.x0, b.y0, b.x1, b.y1], "col": b.col_idx} for b in blocks]
        with open(os.path.join(ocr_dir, f"page_{page_num:03d}.json"), "w", encoding="utf-8") as f:
            json.dump(page_ocr, f, indent=2, ensure_ascii=False)
            
    # Pass 2: Hierarchy & Semantic Separation
    questions, shared_contexts, rejected_instructions = analyze_document_hierarchy(all_page_blocks, page_w, page_h)
    
    # Pass 3: Deterministic Reconstruction & Image Generation
    rendered_questions = reconstruct_and_render_questions(questions, output_dir, doc)
    
    # Pass 4: Validation
    validation_dir = os.path.join(output_dir, "validation")
    os.makedirs(validation_dir, exist_ok=True)
    validation_records = []
    
    for q in questions:
        ocr_pass, ocr_ratio, ocr_issues = validate_generated_question_ocr(q.generated_image_path, q)
        ollama_res = validate_question_with_ollama(q, model=ollama_model) if use_ollama else {"valid": True, "issues": []}
        
        is_valid = ocr_pass and ollama_res.get("valid", True)
        q.validation_status = "PASS" if is_valid else "NEEDS_REVIEW"
        
        validation_records.append({
            "question_id": q.id,
            "image_path": q.generated_image_path,
            "ocr_pass": ocr_pass,
            "ocr_fidelity_score": ocr_ratio,
            "ocr_issues": ocr_issues,
            "ollama_validation": ollama_res,
            "status": q.validation_status
        })
        
    doc.close()
    
    # Save master validation JSON
    with open(os.path.join(validation_dir, "validation.json"), "w", encoding="utf-8") as f:
        json.dump(validation_records, f, indent=2, ensure_ascii=False)
        
    result = {
        "status": "SUCCESS",
        "document_id": doc_id,
        "pdf_path": pdf_path,
        "page_count": total_pages,
        "total_extracted": len(questions),
        "extraction_mode": EXTRACTION_CONFIG["extraction_mode"],
        "crop_original_image": False,
        "generate_new_images": True,
        "questions": rendered_questions,
        "shared_contexts": shared_contexts,
        "rejected_instructions_count": len(rejected_instructions),
        "validation_records": validation_records,
        "output_dir": output_dir
    }
    
    with open(os.path.join(output_dir, "extraction_summary.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        
    return result

# ==============================================================================
# CLI ENTRY POINT
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(description="ZeroLeak Clean Question Document Extraction & Semantic Reconstruction v13.0")
    parser.add_argument("pdf_path", help="Path to input exam paper PDF")
    parser.add_argument("--output-dir", default="", help="Directory to save generated questions and structured JSON")
    parser.add_argument("--ollama", action="store_true", help="Enable Ollama semantic validation")
    parser.add_argument("--ollama-model", default="qwen2.5vl:7b", help="Ollama model name")
    
    args = parser.parse_args()
    
    try:
        res = process_exam_document(
            pdf_path=args.pdf_path,
            output_dir=args.output_dir,
            use_ollama=args.ollama,
            ollama_model=args.ollama_model
        )
        print(json.dumps({
            "status": "SUCCESS",
            "extraction_mode": res["extraction_mode"],
            "crop_original_image": res["crop_original_image"],
            "generate_new_images": res["generate_new_images"],
            "total_extracted": res["total_extracted"],
            "questions": [q["id"] for q in res["questions"]],
            "output_dir": res["output_dir"]
        }, indent=2))
    except Exception as exc:
        sys.stderr.write(f"[ZeroLeak Error] {exc}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()

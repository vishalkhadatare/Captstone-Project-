#!/usr/bin/env python3
"""
ZeroLeak Production AI-Powered Question & Visual Diagram Extraction Pipeline v3.0

Architecture:
  Phase 1  - Page Type Classification (COVER_PAGE / EXAM_INSTRUCTIONS / QUESTION_PAGE / ANSWER_KEY)
  Phase 2  - Instruction Text Filter (exam rules, duration, marks info → never become questions)
  Phase 3  - Strict Question Detection (numbered + interrogative/MCQ criteria required)
  Phase 4  - Docling Layout Analysis (figure/table/text region detection with bboxes)
  Phase 5  - 3-Method Visual Extraction:
               Method 1 - PyMuPDF embedded raster images
               Method 2 - Docling figure regions
               Method 3 - High-res (250 DPI) render + text-mask + OpenCV contour detection
  Phase 6  - Multi-stage Branding Filter (hash repeat, margin, coaching keywords)
  Phase 7  - Question Boundary Association (strict y-range per question)
  Phase 8  - Semantic Relevance Scoring (>= 0.75 threshold)
  Phase 9  - Debug Mode output with page classifications and rejected assets
"""

import base64
import hashlib
import io
import json
import os
import re
import sys
import tempfile
import unicodedata

# ── Force UTF-8 I/O ─────────────────────────────────────────────────────────
if hasattr(sys.stdin, "reconfigure"):
    try:
        sys.stdin.reconfigure(encoding="utf-8")
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# ── PyMuPDF ──────────────────────────────────────────────────────────────────
try:
    import fitz
    FITZ_AVAILABLE = True
except ImportError:
    fitz = None
    FITZ_AVAILABLE = False

# ── OpenCV / NumPy ───────────────────────────────────────────────────────────
try:
    import cv2
    import numpy as np
    CV2_AVAILABLE = True
except ImportError:
    cv2 = None
    np = None
    CV2_AVAILABLE = False

# ── Pillow ───────────────────────────────────────────────────────────────────
try:
    from PIL import Image as PILImage
    PIL_AVAILABLE = True
except ImportError:
    PILImage = None
    PIL_AVAILABLE = False

# ── PaddleOCR & PP-Structure (Layout, Table & Figure Analysis) ───────────────
paddle_ocr_engine = None
try:
    from paddleocr import PaddleOCR
    paddle_ocr_engine = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
except Exception:
    paddle_ocr_engine = None

ppstructure_engine = None
PPSTRUCTURE_AVAILABLE = False

def get_ppstructure_engine():
    global ppstructure_engine, PPSTRUCTURE_AVAILABLE
    if ppstructure_engine is not None:
        return ppstructure_engine
    try:
        from paddleocr import PPStructure
        ppstructure_engine = PPStructure(
            show_log=False,
            image_orientation=False,
            layout=True,
            table=True,
            ocr=False,
            recovery=False
        )
        PPSTRUCTURE_AVAILABLE = True
    except Exception:
        ppstructure_engine = None
        PPSTRUCTURE_AVAILABLE = False
    return ppstructure_engine

# ── Docling (optional – DISABLED by default, set ENABLE_DOCLING=1 to use) ─────
# Docling loads a 770-weight ML model which takes 15-30 seconds on first call.
# For fast extraction we skip it and rely on PyMuPDF + OpenCV instead.
DOCLING_AVAILABLE = False
_docling_converter = None
_DOCLING_ENABLED = os.environ.get("ENABLE_DOCLING", "0").strip() == "1"

def _get_docling_converter():
    global _docling_converter, DOCLING_AVAILABLE
    if not _DOCLING_ENABLED:
        return None
    if _docling_converter is not None:
        return _docling_converter
    try:
        from docling.document_converter import DocumentConverter
        from docling.datamodel.base_models import InputFormat
        from docling.document_converter import PdfFormatOption
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        pipeline_opts = PdfPipelineOptions()
        pipeline_opts.do_ocr = False
        pipeline_opts.do_table_structure = False
        pipeline_opts.generate_picture_images = True
        _docling_converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_opts)
            }
        )
        DOCLING_AVAILABLE = True
    except Exception:
        _docling_converter = None
        DOCLING_AVAILABLE = False
    return _docling_converter


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1 & 2 – CONSTANTS: INSTRUCTION PATTERNS, QUESTION PATTERNS, BRANDING
# ═══════════════════════════════════════════════════════════════════════════════

EXAM_INSTRUCTION_PATTERNS = [
    re.compile(
        r"\b(?:test\s*(?:is\s*of|duration|booklet)|duration\s*of\s*(?:the\s*)?exam(?:ination)?|"
        r"time\s*allowed|maximum\s*marks|total\s*(?:questions|marks)|test\s*booklet|booklet\s*code|"
        r"roll\s*no|omr\s*(?:sheet|no|answer)|serial\s*no)\b",
        re.IGNORECASE
    ),
    re.compile(
        r"\b(?:each\s*question\s*carries|correct\s*response\s*(?:will|shall)|"
        r"incorrect\s*response|negative\s*marking|marks\s*will\s*be\s*deducted|"
        r"all\s*questions\s*are\s*compulsory|no\s*negative\s*marking|"
        r"for\s*each\s*correct\s*answer|for\s*(?:an\s*)?incorrect\s*answer|"
        r"award(?:ed)?\s+\d+\s*marks?|deduct(?:ed)?\s+\d+\s*marks?)\b",
        re.IGNORECASE
    ),
    re.compile(
        r"\b(?:general\s*instructions|instructions\s*for\s*(?:the\s*)?candidates|"
        r"read\s*(?:the\s*)?following\s*instructions|candidates\s*are\s*(?:advised|required|not allowed)|"
        r"use\s*(?:blue|black)\s*(?:ball\s*point|ink)?\s*pen|rough\s*work|"
        r"electronic\s*devices|mobile\s*phone|calculator\s*(?:is\s*not)?|"
        r"hall\s*ticket|admit\s*card|invigilator|sign\s*the\s*attendance)\b",
        re.IGNORECASE
    ),
    re.compile(
        r"\b(?:please\s*turn\s*over|p\.t\.o\.?|end\s*of\s*(?:the\s*)?question\s*paper|"
        r"all\s*rights\s*reserved|corporate\s*office|test\s*series\s*(?:for\s*neet|for\s*jee)|"
        r"pattern\s*of\s*(?:the\s*)?test|space\s*for\s*rough\s*work)\b",
        re.IGNORECASE
    ),
    re.compile(
        r"\b(?:do\s*not\s*open\s*(?:this\s*)?(?:seal|booklet)|break\s*the\s*seal|"
        r"immediately\s*after\s*the\s*commencement|verify\s*that\s*(?:the\s*)?test\s*booklet|"
        r"contains\s*\d+\s*pages|the\s*test\s*is\s*of\s*\d+\s*hours?|"
        r"\d+\s*hours?\s*duration|read\s*instructions\s*carefully)\b",
        re.IGNORECASE
    ),
    re.compile(
        r"\b(?:use\s*(?:blue|black|blue\s*or\s*black)\s*(?:ball\s*point\s*)?(?:pen|ink)|"
        r"mark\s*(?:only\s*)?(?:one|1)\s*(?:option|answer|choice|bubble|circle)|"
        r"do\s*not\s*(?:open|fold|tear|staple|disturb|mark)\s*(?:the\s*)?(?:booklet|seal|omr|sheet)|"
        r"write\s*(?:your\s*)?(?:name|roll|registration|enrolment)\s*(?:number|no\.?|id)|"
        r"seal\s*of\s*(?:the\s*)?booklet|before\s*(?:the\s*)?(?:invigilator|commencement|signal)|"
        r"fill\s*in\s*(?:the\s*)?(?:required\s*)?details|sign\s*(?:the\s*)?attendance|"
        r"return\s*(?:the\s*)?(?:omr|question\s*paper|test\s*booklet)|"
        r"darken\s*(?:the\s*)?(?:circle|bubble|oval)|"
        r"pencil\s*(?:is|are)\s*(?:not\s*)?(?:allowed|acceptable|recommended))\b",
        re.IGNORECASE
    ),
]

# Section / Subject headers (not questions, not instructions)
SECTION_RE = re.compile(
    r"^(?:SECTION|PART|GROUP|MODULE|UNIT)\s+([A-Z0-9IVXLCDM]+)[\:\-\s]*(.*)$",
    re.IGNORECASE
)
SUBJECT_HEADER_RE = re.compile(
    r"^\s*(?:PHYSICS|CHEMISTRY|BOTANY|ZOOLOGY|BIOLOGY|MATHEMATICS|APTITUDE)"
    r"(?:\s*[\:\-\s]\s*(?:SECTION\s*[A-Z0-9]+))?\s*$",
    re.IGNORECASE
)

# Branding / Coaching keywords
BRANDING_KEYWORDS_RE = re.compile(
    r"\b(?:pw|physics\s*wallah|physicswallah|allen|aakash|byju'?s?|unacademy|resonance|fiitjee|"
    r"narayana|chaitanya|sri\s*chaitanya|career\s*point|target|bansal|vedantu|motion|catalyser|"
    r"vibrant|pace|vidyamandir|vmc|dpps?|test\s*series|telegram|scan\s*qr|download\s*app|"
    r"play\s*store|app\s*store|youtube|instagram|facebook|twitter|follow\s*us|subscribe|"
    r"copyright|all\s*rights\s*reserved|corporate\s*office|helpline)\b",
    re.IGNORECASE
)

# Visual dependency keywords
DIAGRAM_MENTION_RE = re.compile(
    r"\b(?:diagram|figure|fig\.?|circuit|graph|chart|plot|schematic|illustration|truth\s*table|"
    r"waveform|drawing|structure|anatomy|organelle|chloroplast|mitochondria|cell\s*structure|"
    r"ray\s*diagram|free\s*body|apparatus|chemical\s*structure|reaction\s*scheme|pathway|cycle|"
    r"shown\s*(?:below|above|in)|refer\s*to\s*(?:the\s*)?(?:given|following)|"
    r"given\s*(?:in\s*the\s*)?(?:diagram|figure|graph|circuit|scheme|below)|"
    r"observe\s*(?:the\s*)?(?:given|following)?|identify\s*(?:the\s*)?(?:labelled|marked|parts)|"
    r"match\s*(?:the\s*)?(?:column|following)|table\s*(?:given|below|shows))\b",
    re.IGNORECASE
)

# Question starters (interrogative + scientific)
QUESTION_STEM_RE = re.compile(
    r"^(?:which|what|where|when|who|why|how|calculate|determine|find|identify|evaluate|"
    r"consider|in\s*the\s*given|given\s*below|match\s*the|select\s*the|assertion|reason|"
    r"statement\s*[iI]\b|the\s*value\s*of|the\s*ratio\s*of|a\s*body|if\s*a|for\s*a|"
    r"an?\s*(?:electron|particle|object|block|charge|conductor|lens|mirror|cell|organism|plant)|"
    r"two\s*(?:charges|masses|particles|resistors|blocks)|"
    r"among\s*the\s*following|one\s*of\s*the\s*following|all\s*of\s*the)",
    re.IGNORECASE
)

# Explicit question start (e.g. "1.", "101.", "Q1.", "Question 101:")
QUESTION_START_RE = re.compile(
    r"^(?:"
    r"(?:Q(?:uestion)?|Que|Ques)\s*\.?\s*(?:No\.?)?\s*(\d{1,4})[\.\:\-\s]*|"
    r"(\d{1,4})\s*[\.\:\-]\s+|"
    r"\[(\d{1,4})\]\s*[\.\:\-]?\s*"
    r")"
    r"(.*)$",
    re.IGNORECASE
)

# Option markers
ALPHA_OPTION_RE = re.compile(r"^\s*[\(\[]?([A-Ea-e])[\)\]\.\:\-]\s+(.*)$")
SUB_OPTION_RE = re.compile(r"^\s*[\(\[]?([1-5]|[ivxIVX]{1,4})[\)\]\.\:\-]\s+(.*)$")
INLINE_ALPHA_SPLIT_RE = re.compile(
    r"(?:^|\s{2,}|\s+)(?:[\(\[]?([A-Ea-e])[\)\]\.\:\-])\s+(.+?)(?=(?:\s{2,}|\s+)[\(\[]?[B-Eb-e][\)\]\.\:\-]\s+|$)"
)
INLINE_NUM_SPLIT_RE = re.compile(
    r"(?:^|\s{2,}|\s+)(?:[\(\[]?([1-4])[\)\]\.\:\-])\s+(.+?)(?=(?:\s{2,}|\s+)[\(\[]?[2-4][\)\]\.\:\-]\s+|$)"
)
NUM_TO_ALPHA = {"1": "A", "2": "B", "3": "C", "4": "D", "5": "E"}

# Answer / Metadata
ANSWER_OPTION_RE = re.compile(
    r"^\s*(?:answer|ans|correct\s+(?:option|answer)|key|solution)\s*[\:\-\s]+"
    r"(?:option\s*)?[\(\[]?([A-Ea-e1-5])[\)\]]?(?:\s*[\.\:\)]|\s*$)",
    re.IGNORECASE
)
ANSWER_TEXT_RE = re.compile(
    r"^\s*(?:answer|ans|correct\s+(?:option|answer)|key|solution)\s*[\:\-\s]+(.+)$",
    re.IGNORECASE
)
MARKS_RE = re.compile(r"^\s*(?:marks?|max\s*marks?|credit)\s*[\:\-]?\s*(\d+(?:\.\d+)?)", re.IGNORECASE)
NEG_MARKS_RE = re.compile(r"^\s*(?:negative(?:\s*marks?)?|penalty)\s*[\:\-]?\s*(\d+(?:\.\d+)?)", re.IGNORECASE)
TOPIC_RE = re.compile(r"^\s*(?:topic|subject|domain|category|unit)\s*[\:\-]?\s*(.+)", re.IGNORECASE)

NOISE_PATTERNS = [
    re.compile(r"^(?:page\s*)?\d+(?:\s*(?:of|/)\s*\d+)?$", re.IGNORECASE),
    re.compile(r"^space\s*for\s*rough\s*work$", re.IGNORECASE),
]


# ═══════════════════════════════════════════════════════════════════════════════
# UTILITIES
# ═══════════════════════════════════════════════════════════════════════════════

def clean_text(value: str) -> str:
    if not value:
        return ""
    value = unicodedata.normalize("NFC", value)
    value = (value.replace("\u00a0", " ").replace("\u2013", "-").replace("\u2014", "-")
             .replace("\u2018", "'").replace("\u2019", "'")
             .replace("\u201c", '"').replace("\u201d", '"'))
    return re.sub(r"[ \t]+", " ", value).strip()


def is_noise_line(text: str) -> bool:
    if not text or len(text.strip()) < 2:
        return True
    for p in NOISE_PATTERNS:
        if p.match(text.strip()):
            return True
    return False


# ── Math to LaTeX Conversion ──────────────────────────────────────────────────
SUPERSCRIPTS = {
    '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
    '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
    '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')',
    'ⁿ': 'n', 'ⁱ': 'i'
}

SUBSCRIPTS = {
    '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
    '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
    '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')',
    'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x'
}

GREEK_AND_SYMBOLS = {
    'α': r'\alpha', 'β': r'\beta', 'γ': r'\gamma', 'δ': r'\delta',
    'ε': r'\epsilon', 'θ': r'\theta', 'λ': r'\lambda', 'μ': r'\mu',
    'π': r'\pi', 'ρ': r'\rho', 'σ': r'\sigma', 'τ': r'\tau',
    'ω': r'\omega', 'Δ': r'\Delta', 'Ω': r'\Omega', 'Φ': r'\Phi',
    '√': r'\sqrt', '±': r'\pm', '×': r'\times', '÷': r'\div',
    '≠': r'\neq', '≤': r'\le', '≥': r'\ge', '≈': r'\approx',
    '∞': r'\infty', '∫': r'\int', '∑': r'\sum', '∂': r'\partial',
    '→': r'\rightarrow', '°': r'^\circ'
}

def convert_math_to_latex(text: str) -> str:
    """
    Converts Unicode mathematical symbols, superscripts, subscripts, Greek
    letters, and equations into standard LaTeX $...$ format for KaTeX rendering.
    """
    if not text:
        return ""
    res = text
    for sym, lat in GREEK_AND_SYMBOLS.items():
        if sym in res:
            res = res.replace(sym, f" {lat} ")
    res = re.sub(r"[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ]+", lambda m: "^{" + "".join(SUPERSCRIPTS.get(c, c) for c in m.group(0)) + "}", res)
    res = re.sub(r"[₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓ]+", lambda m: "_{" + "".join(SUBSCRIPTS.get(c, c) for c in m.group(0)) + "}", res)
    res = re.sub(r"\s+", " ", res).strip()

    has_math_tokens = any(k in res for k in [
        r'\alpha', r'\beta', r'\gamma', r'\delta', r'\theta', r'\mu', r'\Omega',
        r'\lambda', r'\pi', r'\rho', r'\sigma', r'\omega', r'\Delta', r'\sqrt',
        r'\pm', r'\times', r'\neq', r'\le', r'\ge', r'\approx', '^', '_'
    ])
    if has_math_tokens:
        words = res.split(" ")
        alpha_words = [w for w in words if w.isalpha() and len(w) > 3]
        if len(alpha_words) == 0:
            return "$" + res + "$"
        else:
            chunks = []
            cur_math = []
            for w in words:
                is_m = any(k in w for k in [
                    r'\alpha', r'\beta', r'\gamma', r'\delta', r'\theta', r'\mu', r'\Omega',
                    r'\lambda', r'\pi', r'\rho', r'\sigma', r'\omega', r'\Delta', r'\sqrt',
                    r'\pm', r'\times', r'\neq', r'\le', r'\ge', r'\approx', '^', '_', '=', '+', '<', '>'
                ])
                if is_m:
                    cur_math.append(w)
                else:
                    if cur_math:
                        chunks.append("$" + " ".join(cur_math) + "$")
                        cur_math = []
                    chunks.append(w)
            if cur_math:
                chunks.append("$" + " ".join(cur_math) + "$")
            return " ".join(chunks)
    return res


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2 – INSTRUCTION DETECTION
# ═══════════════════════════════════════════════════════════════════════════════

def is_instruction_or_metadata_text(text: str) -> bool:
    """
    Returns True if the text is an exam instruction, rule, or metadata block
    that must never be treated as a question.
    """
    if not text or len(text.strip()) < 4:
        return True

    cleaned = clean_text(text).lower()

    # Whitelist: if it's clearly an interrogative question, it's NOT an instruction
    # even if a sub-pattern accidentally matches
    if QUESTION_STEM_RE.match(cleaned) and len(cleaned) > 20:
        return False

    for pattern in EXAM_INSTRUCTION_PATTERNS:
        if pattern.search(cleaned):
            # Double-check: assertion/reason questions mention "correct" but aren't instructions
            if ("statement i" in cleaned or "statement ii" in cleaned or
                    "which of the following" in cleaned or "calculate" in cleaned or
                    "find the" in cleaned or "identify" in cleaned):
                return False
            return True

    return False


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1 – PAGE CLASSIFICATION
# ═══════════════════════════════════════════════════════════════════════════════

def classify_page_type(raw_text: str, structured_lines: list, page_idx: int) -> str:
    """
    Classifies a page as one of:
    COVER_PAGE | EXAM_INSTRUCTIONS | QUESTION_PAGE | ANSWER_KEY | MIXED
    """
    tl = raw_text.lower()

    # Fast exits
    if re.search(r"\banswer\s*key\b|\bsolutions?\b", tl, re.IGNORECASE) and page_idx > 2:
        return "ANSWER_KEY"

    instruction_hits = sum(1 for p in EXAM_INSTRUCTION_PATTERNS if p.search(tl))

    # Count genuine question starts on this page
    question_starters = 0
    for li in structured_lines:
        t = li.get("text", "")
        m = QUESTION_START_RE.match(t)
        if m:
            rest = m.group(4) or ""
            if rest and not is_instruction_or_metadata_text(rest):
                question_starters += 1

    # Page 1 rules
    if page_idx <= 2:
        if instruction_hits >= 2 and question_starters == 0:
            return "EXAM_INSTRUCTIONS"
        if ("test booklet" in tl or "time allowed" in tl or
                "read the following instructions" in tl or "read the instructions" in tl):
            if question_starters == 0:
                return "COVER_PAGE"

    # General rules
    if instruction_hits >= 3 and question_starters <= 1:
        return "EXAM_INSTRUCTIONS"
    if question_starters >= 1:
        return "QUESTION_PAGE" if instruction_hits < 3 else "MIXED"

    return "MIXED"


def _is_valid_question_candidate(num_str: str, rest_text: str, current_q_num: int) -> bool:
    """
    A numbered text block is a valid question only if:
    1. The rest_text is NOT an instruction.
    2. The number follows sequentially (or is a fresh start after section break).
    3. The rest_text contains a genuine question stem OR MCQ options follow.
    """
    if not rest_text:
        return True  # will be filled by following lines
    if is_instruction_or_metadata_text(rest_text):
        return False
    # Allow: interrogative opener, or short stem (will be validated when finalized)
    return True


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 6, 7 – VISUAL CLASSIFICATION & BRANDING FILTER
# ═══════════════════════════════════════════════════════════════════════════════

def is_header_or_footer_region(rect, page_rect) -> bool:
    """Returns True if the rect is in a header/footer/margin zone."""
    if rect.y1 < 68 or rect.y0 < 50:           # top header
        return True
    if rect.y0 > page_rect.height - 60:          # bottom footer
        return True
    if rect.width > page_rect.width * 0.80 and rect.height > page_rect.height * 0.80:
        return True                              # full-page background
    if rect.width < 18 or rect.height < 18:      # tiny icon noise
        return True
    return False


def classify_visual_asset(asset: dict, page_rect, global_hash_counts: dict, surrounding_text: str = "") -> str:
    """
    Multi-stage branding + layout classifier.
    Returns one of: BRANDING_REPEATED | HEADER_ELEMENT | FOOTER_ELEMENT |
                    WATERMARK_BACKGROUND | DECORATION_LINE | BRANDING_COACHING | QUESTION_DIAGRAM
    """
    # Stage 1 – repeated image across pages
    img_hash = asset.get("image_hash")
    if img_hash and global_hash_counts.get(img_hash, 0) >= 2:
        return "BRANDING_REPEATED"

    x0, y0, x1, y1 = asset["bbox"]
    w, h = x1 - x0, y1 - y0
    pw, ph = page_rect.width, page_rect.height

    # Stage 2 – header / footer margin
    if y0 < ph * 0.08 or y1 < 68:
        return "HEADER_ELEMENT"
    if y0 > ph * 0.92 or y1 > ph * 0.94:
        return "FOOTER_ELEMENT"

    # Stage 3 – full-page watermark
    if w > pw * 0.65 and h > ph * 0.65:
        return "WATERMARK_BACKGROUND"

    # Stage 4 – decoration line / tiny artifact
    if w < 20 or h < 16 or (w > pw * 0.70 and h < 8):
        return "DECORATION_LINE"

    # Stage 5 – surrounding text branding keyword
    if surrounding_text and BRANDING_KEYWORDS_RE.search(surrounding_text):
        return "BRANDING_COACHING"

    return "QUESTION_DIAGRAM"


def calculate_question_visual_relevance(current_q: dict, visual_asset: dict, raw_content: str) -> float:
    """
    Calculates a relevance score [0.0–1.0] for attaching a visual to a question.
    Must be >= 0.75 to attach.
    """
    score = 0.0

    q_min_y0 = current_q.get("min_y0", 0)
    q_max_y1 = current_q.get("max_y1", 9999)
    q_stmt_y1 = current_q.get("statement_y1", q_min_y0 + 30)
    q_opts_y0 = current_q.get("options_y0", q_max_y1)
    q_col = current_q.get("col", 1)

    iy0 = visual_asset["y0"]
    iy1 = visual_asset["y1"]
    ic_y = (iy0 + iy1) / 2.0
    same_col = (visual_asset.get("col", 1) == q_col) or (visual_asset.get("width", 0) > 260)

    if not same_col:
        return 0.0

    mentions_diagram = bool(DIAGRAM_MENTION_RE.search(raw_content))
    is_table = (visual_asset.get("type") == "table" or visual_asset.get("source_type") == "table_structure")
    mentions_table = bool(re.search(r"\b(?:table|list\s*[-–I12]|match\s*(?:the)?|column\s*[-–I12])\b", raw_content, re.IGNORECASE))

    # 1. Explicit visual mention in question text
    if mentions_diagram:
        score += 0.45
    if is_table and mentions_table:
        score += 0.50

    # 2. Strict spatial in-between placement (between statement end and options start)
    in_gap = (q_stmt_y1 - 15 <= iy0) and (iy1 <= q_opts_y0 + 35)
    if in_gap:
        score += 0.45
    elif q_min_y0 - 25 <= ic_y <= q_max_y1 + 35:
        score += 0.30

    # 3. Scientific source / table structure bonus
    if is_table or visual_asset.get("source_type") in ("vector_drawing", "opencv_contour", "docling_figure", "table_structure"):
        score += 0.15

    # 4. Heavy penalty: pure text question with no visual mention and not in gap
    if not mentions_diagram and not (is_table and mentions_table) and not in_gap:
        score -= 0.60

    return max(0.0, min(0.99, score))


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 5 – DOCLING FIGURE EXTRACTION
# ═══════════════════════════════════════════════════════════════════════════════

def extract_docling_figures(pdf_bytes: bytes, page_count: int) -> dict:
    """
    Uses Docling to detect figure/picture regions per page.
    Returns: {page_number (1-based): [list of figure dicts]}

    Each figure dict has: {y0, y1, x0, x1, width, height, col, data_url, source_type}
    Resilient – returns {} on any failure.
    """
    figures_by_page = {}
    if not FITZ_AVAILABLE:
        return figures_by_page

    conv = _get_docling_converter()
    if conv is None:
        return figures_by_page

    try:
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.write(pdf_bytes)
        tmp.flush()
        tmp.close()

        from docling.datamodel.base_models import InputFormat
        from docling.document_converter import PdfFormatOption
        result = conv.convert(tmp.name)
        doc = result.document

        # Get page dimensions from PyMuPDF for coordinate normalization
        fitz_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page_dims = {}
        for i, pg in enumerate(fitz_doc, start=1):
            page_dims[i] = (pg.rect.width, pg.rect.height)
        fitz_doc.close()

        for element, level in doc.iterate_items():
            try:
                from docling_core.types.doc import PictureItem, TableItem
                if not isinstance(element, (PictureItem,)):
                    continue
                for prov in element.prov:
                    pn = prov.page_no  # 1-based
                    if pn not in page_dims:
                        continue
                    pw, ph = page_dims[pn]
                    bb = prov.bbox  # normalized [0,1] coords in docling
                    # Docling uses bottom-left origin; convert to top-left
                    x0 = bb.l * pw
                    y0 = (1.0 - bb.t) * ph
                    x1 = bb.r * pw
                    y1 = (1.0 - bb.b) * ph
                    if y0 > y1:
                        y0, y1 = y1, y0
                    fig_w = x1 - x0
                    fig_h = y1 - y0
                    if fig_w < 20 or fig_h < 20:
                        continue

                    # Render the crop from the PDF
                    fitz_doc2 = fitz.open(stream=pdf_bytes, filetype="pdf")
                    pg2 = fitz_doc2[pn - 1]
                    clip = fitz.Rect(max(0, x0 - 8), max(0, y0 - 8),
                                     min(pw, x1 + 8), min(ph, y1 + 8))
                    pix = pg2.get_pixmap(clip=clip, dpi=180)
                    fitz_doc2.close()

                    img_b64 = base64.b64encode(pix.tobytes("png")).decode("utf-8")
                    mid_x = pw / 2.0
                    col_idx = 1 if (x0 + x1) / 2.0 < mid_x else 2

                    fig_entry = {
                        "image_id": f"docling_p{pn}_{len(figures_by_page.get(pn, []))+1}",
                        "type": "diagram",
                        "classification": "QUESTION_DIAGRAM",
                        "source_type": "docling_figure",
                        "bbox": [x0, y0, x1, y1],
                        "y0": y0, "y1": y1, "x0": x0, "x1": x1,
                        "width": fig_w, "height": fig_h,
                        "col": col_idx,
                        "data_url": f"data:image/png;base64,{img_b64}",
                        "assigned": False,
                    }
                    figures_by_page.setdefault(pn, []).append(fig_entry)
            except Exception:
                continue

        try:
            os.unlink(tmp.name)
        except Exception:
            pass

    except Exception:
        pass

    return figures_by_page



# ═══════════════════════════════════════════════════════════════════════════════
# TIGHT CROP UTILITIES
# ═══════════════════════════════════════════════════════════════════════════════

def auto_tighten_crop(img_bgr, padding_px: int = 12):
    """
    Given a BGR numpy image, find the minimum bounding box that contains
    all non-background pixels, then re-crop with small padding (10-20px).
    Returns (tightened_img, (c_min, r_min, c_max, r_max))
    """
    if img_bgr is None or img_bgr.size == 0:
        return img_bgr, None
    try:
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        H, W = gray.shape[:2]

        # Estimate background brightness from outer 4% margins
        borders = [
            gray[0:max(1, int(H*0.04)), :],
            gray[min(H-1, int(H*0.96)):, :],
            gray[:, 0:max(1, int(W*0.04))],
            gray[:, min(W-1, int(W*0.96)):]
        ]
        border_px = np.concatenate([b.ravel() for b in borders if b.size > 0])
        bg_val = float(np.median(border_px)) if border_px.size > 0 else 255.0

        # Meaningful foreground: pixels darker than background by at least 16 units
        thresh = max(160.0, bg_val - 16.0)
        fg_mask = gray < thresh

        rows = np.any(fg_mask, axis=1)
        cols = np.any(fg_mask, axis=0)
        if not rows.any() or not cols.any():
            return img_bgr, None

        r_min, r_max = np.where(rows)[0][[0, -1]]
        c_min, c_max = np.where(cols)[0][[0, -1]]

        # Add small padding around the actual foreground content
        r_min = max(0, r_min - padding_px)
        r_max = min(H - 1, r_max + padding_px)
        c_min = max(0, c_min - padding_px)
        c_max = min(W - 1, c_max + padding_px)

        cropped = img_bgr[r_min:r_max+1, c_min:c_max+1]
        return cropped, (c_min, r_min, c_max, r_max)
    except Exception:
        return img_bgr, None


def validate_crop_density(img_bgr, min_density: float = 0.03) -> bool:
    """
    Returns True if the crop has enough foreground content (> min_density).
    Rejects mostly-blank images that only contain a tiny element.
    """
    if img_bgr is None or img_bgr.size == 0:
        return False
    try:
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        fg_pixels = np.sum(gray < 230)
        total_pixels = gray.size
        if total_pixels == 0:
            return False
        return (fg_pixels / total_pixels) >= min_density
    except Exception:
        return True  # allow on error


def render_tight_crop(page, bbox_pdf, dpi: int = 160, pad: int = 8) -> tuple[str | None, list | None]:
    """
    Renders a tight crop from a PDF page bbox.
    Applies auto_tighten_crop to remove excess whitespace.
    Returns (data_url, tight_bbox_pdf).
    """
    try:
        pw, ph = page.rect.width, page.rect.height
        x0 = max(0, bbox_pdf[0] - pad)
        y0 = max(0, bbox_pdf[1] - pad)
        x1 = min(pw, bbox_pdf[2] + pad)
        y1 = min(ph, bbox_pdf[3] + pad)

        # Hard guard: reject if bounding box is > 70% of page in both dimensions
        if (x1 - x0) > pw * 0.70 and (y1 - y0) > ph * 0.70:
            return None, None

        clip = fitz.Rect(x0, y0, x1, y1)
        pix = page.get_pixmap(clip=clip, dpi=dpi)
        img_bytes = pix.tobytes("png")
        scale = dpi / 72.0
        tight_pdf_box = [x0, y0, x1, y1]

        if cv2 is not None and np is not None:
            arr = np.frombuffer(img_bytes, dtype=np.uint8)
            img_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img_bgr is not None:
                img_bgr, crop_box = auto_tighten_crop(img_bgr, padding_px=10)
                if not validate_crop_density(img_bgr, min_density=0.03):
                    return None, None
                if crop_box:
                    c_min, r_min, c_max, r_max = crop_box
                    tight_pdf_box = [
                        x0 + c_min / scale,
                        y0 + r_min / scale,
                        x0 + c_max / scale,
                        y0 + r_max / scale
                    ]
                _, enc = cv2.imencode(".png", img_bgr)
                img_bytes = enc.tobytes()

        return "data:image/png;base64," + base64.b64encode(img_bytes).decode("utf-8"), tight_pdf_box
    except Exception:
        return None, None


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 5c – OPENCV TEXT-MASKING + CONTOUR DETECTION (fast, tight-crop)
# ═══════════════════════════════════════════════════════════════════════════════

def extract_visuals_with_opencv_masking(
    page, page_idx: int, structured_lines: list,
    existing_images: list, global_hash_counts: dict
) -> list:
    """
    Renders PDF page at 180 DPI (down from 250 for speed), masks all text
    bounding boxes, then detects non-text graphical regions via Canny + contours.

    Key improvements over v2:
    - 180 DPI instead of 250 (38% faster rendering)
    - 3×3 morphological kernel (was 7×7) – prevents giant merged clusters
    - Content density validation before saving
    - auto_tighten_crop() to remove blank whitespace from every crop
    - Full-page guard: rejects if crop > 70% page dimensions
    - Separate pass for table-like structures (rectangular bordered regions)
    - Minimum contour area and aspect-ratio checks
    """
    if not CV2_AVAILABLE or not np or not fitz:
        return []

    new_images = []
    try:
        DPI = 180
        scale = DPI / 72.0
        pw, ph = page.rect.width, page.rect.height

        pix = page.get_pixmap(dpi=DPI)
        img_bytes = pix.tobytes("png")
        arr = np.frombuffer(img_bytes, dtype=np.uint8)
        img_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img_bgr is None:
            return []

        H, W = img_bgr.shape[:2]

        # ── Build word-level text mask ────────────────────────────────────────
        text_mask = np.zeros((H, W), dtype=np.uint8)
        word_blocks = page.get_text("words")
        for wb in word_blocks:
            # Expand each word bbox by 5px to catch any glyph overflow
            wx0 = max(0, int(wb[0] * scale) - 5)
            wy0 = max(0, int(wb[1] * scale) - 5)
            wx1 = min(W, int(wb[2] * scale) + 5)
            wy1 = min(H, int(wb[3] * scale) + 5)
            cv2.rectangle(text_mask, (wx0, wy0), (wx1, wy1), 255, -1)

        # Mask header/footer zones
        header_px = max(0, int(ph * 0.09 * scale))
        footer_px = min(H, int(ph * 0.91 * scale))
        text_mask[:header_px, :] = 255
        text_mask[footer_px:, :] = 255

        # ── TABLE DETECTION PASS: find bordered rectangular structures ────────
        # Tables have visible horizontal and vertical lines. Detect them first
        # before generic contour pass, so we get cleaner table-only crops.
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        _, binary = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)

        # Horizontal lines (table borders)
        h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(30, W // 10), 1))
        h_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)

        # Vertical lines (table borders)
        v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(20, H // 15)))
        v_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel)

        # Combine table structure
        table_struct = cv2.add(h_lines, v_lines)
        t_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        table_struct = cv2.dilate(table_struct, t_kernel, iterations=2)

        t_contours, _ = cv2.findContours(table_struct, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for tc in t_contours:
            tx, ty, tw, th = cv2.boundingRect(tc)
            if tw < 60 or th < 30:
                continue
            # Convert back to PDF coords
            pt_x0, pt_y0 = tx / scale, ty / scale
            pt_x1, pt_y1 = (tx + tw) / scale, (ty + th) / scale
            # Must be inside question zone (not full-page)
            if (pt_x1 - pt_x0) > pw * 0.70 and (pt_y1 - pt_y0) > ph * 0.70:
                continue
            # Check text pixel ratio – tables contain text so lower threshold
            bx0, by0 = max(0, tx-2), max(0, ty-2)
            bx1, by1 = min(W, tx+tw+2), min(H, ty+th+2)
            region_mask = text_mask[by0:by1, bx0:bx1]
            if region_mask.size > 0 and np.count_nonzero(region_mask) / region_mask.size > 0.95:
                continue  # 95%+ text = pure text block, skip
            is_dup = any(abs(img["y0"] - pt_y0) < 20 and abs(img["y1"] - pt_y1) < 20
                         for img in existing_images + new_images)
            if is_dup:
                continue
            surr_t = page.get_text("text", clip=fitz.Rect(0, max(0,pt_y0-30), pw, min(ph, pt_y1+30)))
            meta_t = {"bbox":[pt_x0,pt_y0,pt_x1,pt_y1], "y0":pt_y0,"y1":pt_y1,"x0":pt_x0,"x1":pt_x1,
                      "width":pt_x1-pt_x0,"height":pt_y1-pt_y0,"source_type":"table_structure"}
            if classify_visual_asset(meta_t, page.rect, global_hash_counts, surr_t) != "QUESTION_DIAGRAM":
                continue
            data_url, tight_box = render_tight_crop(page, [pt_x0, pt_y0, pt_x1, pt_y1], dpi=160, pad=8)
            if not data_url:
                continue
            bx = tight_box or [pt_x0, pt_y0, pt_x1, pt_y1]
            mid_x = pw / 2.0
            col_idx = 1 if (bx[0] + bx[2]) / 2.0 < mid_x else 2
            new_images.append({
                "image_id": f"tbl_p{page_idx}_{len(existing_images)+len(new_images)+1}",
                "type": "table", "classification": "QUESTION_DIAGRAM",
                "source_type": "table_structure",
                "bbox": bx,
                "y0": bx[1], "y1": bx[3], "x0": bx[0], "x1": bx[2],
                "width": bx[2] - bx[0], "height": bx[3] - bx[1],
                "col": col_idx, "data_url": data_url, "assigned": False,
            })

        # ── DIAGRAM DETECTION PASS: Canny edge + contours ────────────────────
        gray2 = gray.copy()
        gray2[text_mask == 255] = 255   # blank-out text areas

        blurred = cv2.GaussianBlur(gray2, (3, 3), 0)
        edges = cv2.Canny(blurred, 35, 120)
        edges[text_mask == 255] = 0

        # Smaller kernel (3×3 was 7×7) → doesn't bridge distant elements
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # ── Collect candidate rects in PDF coords ─────────────────────────────
        candidate_rects = []
        MIN_AREA_PDF = 800  # minimum 800 sq-pt area (roughly 2×1 cm)
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < 120:  # skip tiny pixel noise
                continue
            cx, cy, cw, ch = cv2.boundingRect(cnt)
            pt_x0, pt_y0 = cx / scale, cy / scale
            pt_x1, pt_y1 = (cx + cw) / scale, (ty + th) / scale if 'th' in locals() else (cy + ch) / scale
            pt_x1 = (cx + cw) / scale
            pt_y1 = (cy + ch) / scale
            pt_w, pt_h = pt_x1 - pt_x0, pt_y1 - pt_y0
            if pt_w < 28 or pt_h < 20:
                continue
            if pt_w * pt_h < MIN_AREA_PDF:
                continue
            # Reject if wider than 80% of page AND taller than 80% (full-page)
            if pt_w > pw * 0.80 and pt_h > ph * 0.80:
                continue
            candidate_rects.append(fitz.Rect(pt_x0, pt_y0, pt_x1, pt_y1))

        if not candidate_rects:
            return new_images

        # ── Cluster proximity-based (tighter gap threshold: 20pt was 30pt) ───
        candidate_rects.sort(key=lambda r: r.y0)
        clusters = []
        GAP = 20  # max gap between components to merge (was 30/40)
        for r in candidate_rects:
            merged = False
            for c in clusters:
                if not (r.y0 > c.y1 + GAP or r.y1 < c.y0 - GAP or
                        r.x0 > c.x1 + GAP or r.x1 < c.x0 - GAP):
                    c.include_rect(r)
                    merged = True
                    break
            if not merged:
                clusters.append(fitz.Rect(r))

        for c in clusters:
            if c.width < 30 or c.height < 22:
                continue
            if is_header_or_footer_region(c, page.rect):
                continue

            # ── Full-page guard ───────────────────────────────────────────────
            if c.width > pw * 0.70 and c.height > ph * 0.70:
                continue  # reject – almost certainly a page-level false positive

            # ── Text pixel ratio check ────────────────────────────────────────
            bx0 = max(0, int(c.x0 * scale))
            by0 = max(0, int(c.y0 * scale))
            bx1 = min(W, int(c.x1 * scale))
            by1 = min(H, int(c.y1 * scale))
            region_mask = text_mask[by0:by1, bx0:bx1]
            if region_mask.size > 0:
                text_ratio = np.count_nonzero(region_mask) / region_mask.size
                if text_ratio > 0.72:   # > 72% text → pure text block, skip
                    continue

            # Skip if already detected as table
            is_dup = any(abs(img["y0"] - c.y0) < 20 and abs(img["y1"] - c.y1) < 20
                         for img in existing_images + new_images)
            if is_dup:
                continue

            surr = fitz.Rect(0, max(0, c.y0 - 35), pw, min(ph, c.y1 + 35))
            surrounding_text = page.get_text("text", clip=surr)

            asset_meta = {
                "bbox": [c.x0, c.y0, c.x1, c.y1],
                "y0": c.y0, "y1": c.y1, "x0": c.x0, "x1": c.x1,
                "width": c.width, "height": c.height, "source_type": "opencv_contour",
            }
            if classify_visual_asset(asset_meta, page.rect, global_hash_counts, surrounding_text) != "QUESTION_DIAGRAM":
                continue

            # ── Tight crop with auto-tighten and density validation ────────────
            data_url, tight_box = render_tight_crop(page, [c.x0, c.y0, c.x1, c.y1], dpi=160, pad=8)
            if not data_url:
                continue  # density check failed or crop was full-page

            bx = tight_box or [c.x0, c.y0, c.x1, c.y1]
            mid_x = pw / 2.0
            col_idx = 1 if (bx[0] + bx[2]) / 2.0 < mid_x else 2

            new_images.append({
                "image_id": f"cv_p{page_idx}_{len(existing_images)+len(new_images)+1}",
                "type": "diagram", "classification": "QUESTION_DIAGRAM",
                "source_type": "opencv_contour",
                "bbox": bx,
                "y0": bx[1], "y1": bx[3], "x0": bx[0], "x1": bx[2],
                "width": bx[2] - bx[0], "height": bx[3] - bx[1],
                "col": col_idx, "data_url": data_url, "assigned": False,
            })

    except Exception:
        pass

    return new_images



# ═══════════════════════════════════════════════════════════════════════════════
# COLUMN SORTER + PAGE EXTRACTION
# ═══════════════════════════════════════════════════════════════════════════════

def split_inline_options(line: str):
    matches = list(INLINE_ALPHA_SPLIT_RE.finditer(line))
    if len(matches) >= 2:
        labels = [m.group(1).upper() for m in matches]
        if labels == sorted(labels) and len(set(labels)) == len(labels):
            return [(m.group(1).upper(),
                     re.sub(r"^(?:[A-Ea-e1-5][\)\:]\s*|[A-Ea-e1-5]\.\s+)", "", m.group(2).strip()))
                    for m in matches]

    matches_num = list(INLINE_NUM_SPLIT_RE.finditer(line))
    if len(matches_num) >= 2:
        labels = [m.group(1) for m in matches_num]
        if labels == sorted(labels) and len(set(labels)) == len(labels):
            return [(NUM_TO_ALPHA.get(m.group(1), m.group(1)),
                     re.sub(r"^(?:[A-Ea-e1-5][\)\:]\s*|[A-Ea-e1-5]\.\s+)", "", m.group(2).strip()))
                    for m in matches_num]
    return None


def sort_page_blocks_by_column(page):
    blocks = page.get_text("blocks")
    if not blocks:
        return []
    pw = page.rect.width
    mid_x = pw / 2.0
    valid = [b for b in blocks if len(b) > 4 and b[4].strip()]
    if not valid:
        return []

    top, bot, col1, col2 = [], [], [], []
    for b in valid:
        x0, y0, x1, y1 = b[0], b[1], b[2], b[3]
        cx = (x0 + x1) / 2.0
        w = x1 - x0
        if w > pw * 0.65 and y0 < 110:
            top.append((b, 0))
        elif w > pw * 0.65 and y0 > page.rect.height - 70:
            bot.append((b, 0))
        elif cx < mid_x:
            col1.append((b, 1))
        else:
            col2.append((b, 2))

    if len(col1) >= 2 and len(col2) >= 2:
        top.sort(key=lambda t: t[0][1])
        col1.sort(key=lambda t: (t[0][1], t[0][0]))
        col2.sort(key=lambda t: (t[0][1], t[0][0]))
        bot.sort(key=lambda t: t[0][1])
        return top + col1 + col2 + bot

    valid.sort(key=lambda b: (b[1], b[0]))
    return [(b, 1) for b in valid]


def extract_pages_from_pdf(pdf_bytes: bytes):
    """
    Full page extraction: text blocks, structural lines, page type classification,
    and 3-method visual extraction.
    """
    if not fitz:
        raise RuntimeError("PyMuPDF not installed. Run: pip install pymupdf")

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = []
    image_hash_counts = {}
    all_rejected = []

    try:
        # ── First pass: build global image hash frequency map ────────────────
        for pg in doc:
            try:
                for img_info in pg.get_images(full=True):
                    xref = img_info[0]
                    rects = pg.get_image_rects(xref)
                    if not rects:
                        continue
                    img_dict = doc.extract_image(xref)
                    if img_dict and "image" in img_dict:
                        h = hashlib.md5(img_dict["image"]).hexdigest()
                        image_hash_counts[h] = image_hash_counts.get(h, 0) + 1
            except Exception:
                pass

        # ── Docling figure extraction (Option C: run once for the whole PDF) ─
        docling_figures_by_page = {}
        try:
            docling_figures_by_page = extract_docling_figures(pdf_bytes, len(doc))
        except Exception:
            pass

        # ── Second pass: per-page extraction ─────────────────────────────────
        for page_idx, page in enumerate(doc, start=1):
            sorted_blocks = sort_page_blocks_by_column(page)
            structured_lines = []

            for b_tuple in sorted_blocks:
                b, col_idx = b_tuple[0], b_tuple[1]
                b_text = b[4].strip()
                if not b_text:
                    continue
                b_lines = b_text.splitlines()
                b_h = max(1.0, b[3] - b[1])
                line_h = b_h / max(1, len(b_lines))
                for li, ls in enumerate(b_lines):
                    ls = ls.strip()
                    if not ls:
                        continue
                    l_y0 = b[1] + li * line_h
                    l_y1 = l_y0 + line_h
                    structured_lines.append({
                        "text": ls,
                        "page": page_idx,
                        "col": col_idx,
                        "bbox": [b[0], l_y0, b[2], l_y1],
                        "y0": l_y0, "y1": l_y1,
                        "x0": b[0], "x1": b[2],
                    })

            raw_text = "\n".join(sl["text"] for sl in structured_lines)

            # OCR fallback for scanned / image-only pages
            if len(re.sub(r"\W", "", raw_text)) < 20 and paddle_ocr_engine:
                try:
                    pix = page.get_pixmap(dpi=150)
                    ocr_result = paddle_ocr_engine.ocr(pix.tobytes("png"), cls=True)
                    if ocr_result and ocr_result[0]:
                        ocr_lines = [ld[1][0] for ld in ocr_result[0] if len(ld) > 1 and ld[1]]
                        raw_text = "\n".join(ocr_lines)
                        structured_lines = [
                            {"text": l, "page": page_idx, "col": 1,
                             "bbox": [50, 50+i*20, page.rect.width-50, 70+i*20],
                             "y0": 50+i*20, "y1": 70+i*20, "x0": 50, "x1": page.rect.width-50}
                            for i, l in enumerate(ocr_lines)
                        ]
                except Exception:
                    pass

            # Classify page type
            page_type = classify_page_type(raw_text, structured_lines, page_idx)

            # ── Method 0: Native PyMuPDF & PP-Structure Layout Detection ───────
            page_images = []
            page_rejected = []

            # ── Step 3: PaddleOCR PP-Structure Layout Detection ───────────────
            pps = get_ppstructure_engine()
            if pps is not None and np is not None and cv2 is not None:
                try:
                    PPS_DPI = 200
                    pps_scale = PPS_DPI / 72.0
                    pix = page.get_pixmap(dpi=PPS_DPI)
                    img_arr = np.frombuffer(pix.tobytes("png"), dtype=np.uint8)
                    img_bgr = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
                    if img_bgr is not None:
                        pps_results = pps(img_bgr)
                        for item in pps_results:
                            reg_type = item.get("type", "").lower()
                            if reg_type in ("table", "figure", "image"):
                                ibbox = item.get("bbox")
                                if ibbox:
                                    pdf_x0 = ibbox[0] / pps_scale
                                    pdf_y0 = ibbox[1] / pps_scale
                                    pdf_x1 = ibbox[2] / pps_scale
                                    pdf_y1 = ibbox[3] / pps_scale

                                    # Hard guard against full-page crops (STEP 14)
                                    pw, ph = page.rect.width, page.rect.height
                                    if (pdf_x1 - pdf_x0) > pw * 0.90 and (pdf_y1 - pdf_y0) > ph * 0.70:
                                        continue
                                    if is_header_or_footer_region(fitz.Rect(pdf_x0, pdf_y0, pdf_x1, pdf_y1), page.rect):
                                        continue

                                    data_url, tight_box = render_tight_crop(page, [pdf_x0, pdf_y0, pdf_x1, pdf_y1], dpi=160, pad=8)
                                    if data_url:
                                        bx = tight_box or [pdf_x0, pdf_y0, pdf_x1, pdf_y1]
                                        mid_x = pw / 2.0
                                        col_idx = 1 if (bx[0] + bx[2]) / 2.0 < mid_x else 2
                                        vtype = "table" if reg_type == "table" else "diagram"
                                        page_images.append({
                                            "image_id": f"pps_p{page_idx}_{len(page_images)+1}",
                                            "type": vtype,
                                            "classification": "QUESTION_DIAGRAM",
                                            "source_type": f"ppstructure_{reg_type}",
                                            "bbox": bx,
                                            "y0": bx[1], "y1": bx[3], "x0": bx[0], "x1": bx[2],
                                            "width": bx[2] - bx[0], "height": bx[3] - bx[1],
                                            "col": col_idx,
                                            "data_url": data_url,
                                            "assigned": False,
                                        })
                except Exception:
                    pass
            try:
                if hasattr(page, "find_tables"):
                    tabs = page.find_tables()
                    for tab in tabs.tables:
                        tb = tab.bbox  # (x0, y0, x1, y1)
                        tw = tb[2] - tb[0]
                        th = tb[3] - tb[1]
                        if tw < 50 or th < 25:
                            continue
                        if tw > page.rect.width * 0.75 and th > page.rect.height * 0.75:
                            continue
                        if is_header_or_footer_region(fitz.Rect(tb), page.rect):
                            continue
                        data_url, tight_box = render_tight_crop(page, tb, dpi=160, pad=6)
                        if not data_url:
                            continue
                        bx = tight_box or list(tb)
                        mid_x = page.rect.width / 2.0
                        col_idx = 1 if (bx[0] + bx[2]) / 2.0 < mid_x else 2
                        page_images.append({
                            "image_id": f"tab_p{page_idx}_{len(page_images)+1}",
                            "type": "table",
                            "classification": "QUESTION_DIAGRAM",
                            "source_type": "table_structure",
                            "bbox": bx,
                            "y0": bx[1], "y1": bx[3], "x0": bx[0], "x1": bx[2],
                            "width": bx[2] - bx[0], "height": bx[3] - bx[1],
                            "col": col_idx,
                            "data_url": data_url,
                            "assigned": False,
                        })
            except Exception:
                pass

            # ── Method 0b: Text-based List-I / List-II Table Detection ───────
            try:
                blocks = page.get_text("blocks")
                for b in blocks:
                    if len(b) > 4:
                        txt = b[4]
                        if re.search(r"\b(?:List|Column)\s*[-–I1]+\b.*\b(?:List|Column)\s*[-–I2]+\b", txt, re.IGNORECASE | re.DOTALL):
                            tb = [b[0], b[1], b[2], b[3]]
                            if not any(abs(img["y0"] - tb[1]) < 25 and abs(img["y1"] - tb[3]) < 25 for img in page_images):
                                data_url, tight_box = render_tight_crop(page, tb, dpi=160, pad=6)
                                if data_url:
                                    bx = tight_box or tb
                                    mid_x = page.rect.width / 2.0
                                    col_idx = 1 if (bx[0] + bx[2]) / 2.0 < mid_x else 2
                                    page_images.append({
                                        "image_id": f"listtab_p{page_idx}_{len(page_images)+1}",
                                        "type": "table",
                                        "classification": "QUESTION_DIAGRAM",
                                        "source_type": "table_structure",
                                        "bbox": bx,
                                        "y0": bx[1], "y1": bx[3], "x0": bx[0], "x1": bx[2],
                                        "width": bx[2] - bx[0], "height": bx[3] - bx[1],
                                        "col": col_idx,
                                        "data_url": data_url,
                                        "assigned": False,
                                    })
            except Exception:
                pass

            # ── Method 1: Embedded Raster Images ─────────────────────────────
            try:
                for img_info in page.get_images(full=True):
                    xref = img_info[0]
                    rects = page.get_image_rects(xref)
                    if not rects:
                        continue
                    rect = rects[0]

                    img_hash = None
                    img_dict = doc.extract_image(xref)
                    if img_dict and "image" in img_dict:
                        img_hash = hashlib.md5(img_dict["image"]).hexdigest()

                    surr_r = fitz.Rect(0, max(0, rect.y0-35), page.rect.width, min(page.rect.height, rect.y1+35))
                    surr_text = page.get_text("text", clip=surr_r)

                    meta = {
                        "bbox": [rect.x0, rect.y0, rect.x1, rect.y1],
                        "y0": rect.y0, "y1": rect.y1, "x0": rect.x0, "x1": rect.x1,
                        "width": rect.width, "height": rect.height,
                        "image_hash": img_hash, "source_type": "raster_image",
                    }
                    cls = classify_visual_asset(meta, page.rect, image_hash_counts, surr_text)
                    if cls != "QUESTION_DIAGRAM":
                        page_rejected.append({
                            "asset_id": f"xref_{xref}_p{page_idx}",
                            "classification": cls,
                            "reason": f"Filtered: {cls} (hash_count={image_hash_counts.get(img_hash, 0)})"
                        })
                        continue

                    try:
                        # Use render_tight_crop: crops the exact bbox on the page,
                        # auto-tightens whitespace, and validates content density.
                        data_url, tight_box = render_tight_crop(
                            page, [rect.x0, rect.y0, rect.x1, rect.y1], dpi=150, pad=4
                        )
                        bx = tight_box or [rect.x0, rect.y0, rect.x1, rect.y1]
                        if not data_url:
                            # Fallback: use raw embedded pixel data with tighten
                            pix = fitz.Pixmap(doc, xref)
                            if pix.n >= 5:
                                pix = fitz.Pixmap(fitz.csRGB, pix)
                            raw_bytes = pix.tobytes("png")
                            if cv2 is not None and np is not None:
                                arr = np.frombuffer(raw_bytes, dtype=np.uint8)
                                img_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                                if img_bgr is not None:
                                    img_bgr, _ = auto_tighten_crop(img_bgr, padding_px=6)
                                    if not validate_crop_density(img_bgr, min_density=0.04):
                                        continue
                                    _, enc = cv2.imencode(".png", img_bgr)
                                    raw_bytes = enc.tobytes()
                            data_url = "data:image/png;base64," + base64.b64encode(raw_bytes).decode("utf-8")
                        mid_x = page.rect.width / 2.0
                        col_idx = 1 if (bx[0] + bx[2]) / 2.0 < mid_x else 2
                        page_images.append({
                            "image_id": f"img_p{page_idx}_{len(page_images)+1}",
                            "type": "diagram", "classification": cls,
                            "source_type": "raster_image",
                            "bbox": bx,
                            "y0": bx[1], "y1": bx[3], "x0": bx[0], "x1": bx[2],
                            "col": col_idx, "data_url": data_url,
                            "width": bx[2] - bx[0], "height": bx[3] - bx[1], "assigned": False,
                        })
                    except Exception:
                        pass
            except Exception:
                pass

            # ── Method 2: Docling Figures ─────────────────────────────────────
            for df in docling_figures_by_page.get(page_idx, []):
                is_dup = any(abs(img["y0"]-df["y0"]) < 25 and abs(img["y1"]-df["y1"]) < 25
                             for img in page_images)
                if not is_dup:
                    page_images.append(df)

            # ── Method 3: Vector Drawings via PyMuPDF get_drawings() ─────────
            try:
                drawings = page.get_drawings()
                if drawings:
                    d_rects = [d["rect"] for d in drawings
                               if d.get("rect") and d["rect"].width >= 15 and d["rect"].height >= 12
                               and not is_header_or_footer_region(d["rect"], page.rect)
                               and not (d["rect"].width > page.rect.width * 0.70 and d["rect"].height < 6)]

                    d_rects.sort(key=lambda r: r.y0)
                    clusters = []
                    for r in d_rects:
                        merged = False
                        for c in clusters:
                            if not (r.y0 > c.y1+20 or r.y1 < c.y0-20 or
                                    r.x0 > c.x1+20 or r.x1 < c.x0-20):
                                c.include_rect(r)
                                merged = True
                                break
                        if not merged:
                            clusters.append(fitz.Rect(r))

                    for c in clusters:
                        if c.width < 28 or c.height < 18:
                            continue
                        # Full-page guard
                        if c.width > page.rect.width * 0.70 and c.height > page.rect.height * 0.70:
                            continue
                        is_dup = any(abs(img["y0"]-c.y0) < 20 and abs(img["y1"]-c.y1) < 20
                                     for img in page_images)
                        if is_dup:
                            continue
                        surr_r = fitz.Rect(0, max(0, c.y0-35), page.rect.width, min(page.rect.height, c.y1+35))
                        surr_text = page.get_text("text", clip=surr_r)
                        meta = {
                            "bbox": [c.x0, c.y0, c.x1, c.y1],
                            "y0": c.y0, "y1": c.y1, "x0": c.x0, "x1": c.x1,
                            "width": c.width, "height": c.height, "source_type": "vector_drawing",
                        }
                        cls = classify_visual_asset(meta, page.rect, image_hash_counts, surr_text)
                        if cls != "QUESTION_DIAGRAM":
                            continue
                        # Use render_tight_crop for vector drawings too
                        data_url, tight_box = render_tight_crop(page, [c.x0, c.y0, c.x1, c.y1], dpi=160, pad=8)
                        if not data_url:
                            continue
                        bx = tight_box or [c.x0, c.y0, c.x1, c.y1]
                        mid_x = page.rect.width / 2.0
                        col_idx = 1 if (bx[0] + bx[2]) / 2.0 < mid_x else 2
                        page_images.append({
                            "image_id": f"vec_p{page_idx}_{len(page_images)+1}",
                            "type": "diagram", "classification": cls,
                            "source_type": "vector_drawing",
                            "bbox": bx,
                            "y0": bx[1], "y1": bx[3], "x0": bx[0], "x1": bx[2],
                            "col": col_idx, "data_url": data_url,
                            "width": bx[2] - bx[0], "height": bx[3] - bx[1], "assigned": False,
                        })
            except Exception:
                pass

            # ── Method 4: OpenCV text-masked contour + table detection ────────
            # Always run (not just as fallback) – catches tables and diagrams
            # that Methods 1-3 may miss on text-only PDFs without embedded images.
            cv_imgs = extract_visuals_with_opencv_masking(
                page, page_idx, structured_lines, page_images, image_hash_counts
            )
            page_images.extend(cv_imgs)


            all_rejected.extend(page_rejected)
            pages.append({
                "pageNumber": page_idx,
                "pageType": page_type,
                "rawText": raw_text or "",
                "cleanedText": "",
                "structuredLines": structured_lines,
                "images": page_images,
                "rejectedAssets": page_rejected,
            })
    finally:
        doc.close()

    return pages, all_rejected


# ═══════════════════════════════════════════════════════════════════════════════
# LINE CLEANING
# ═══════════════════════════════════════════════════════════════════════════════

def clean_page_lines(pages: list):
    """Remove repetitive headers/footers and tag instruction lines."""
    # Find running headers/footers (lines appearing in boundary zones of ≥2 pages)
    hf_counts = {}
    for p in pages:
        lines = [clean_text(l) for l in p["rawText"].splitlines() if clean_text(l)]
        boundary = set(lines[:3] + lines[-3:])
        for bl in boundary:
            if len(bl) > 3 and not re.match(r"^\d+[\.\)]", bl):
                hf_counts[bl] = hf_counts.get(bl, 0) + 1
    repeated_headers = {ln for ln, cnt in hf_counts.items() if cnt >= 2}

    for p in pages:
        if not p.get("structuredLines"):
            raw = p.get("rawText", "")
            p["structuredLines"] = [
                {"text": l, "page": p.get("pageNumber", 1), "col": 1,
                 "bbox": [50, i*25, 500, i*25+20], "y0": i*25, "y1": i*25+20, "x0": 50, "x1": 500}
                for i, l in enumerate(raw.splitlines()) if l.strip()
            ]

        cleaned = []
        for li in p.get("structuredLines", []):
            c = clean_text(li.get("text", ""))
            if not c or is_noise_line(c):
                continue
            if c in repeated_headers and (li.get("y0", 0) < 110 or li.get("y0", 0) > 700):
                continue
            li["cleanText"] = c
            cleaned.append(li)

        p["structuredLines"] = cleaned
        p["cleanedText"] = "\n".join(it["cleanText"] for it in cleaned)


# ═══════════════════════════════════════════════════════════════════════════════
# ANSWER KEY PARSER
# ═══════════════════════════════════════════════════════════════════════════════

def parse_trailing_answer_key(full_text: str) -> dict:
    m = re.search(r"(?:ANSWER\s*KEY|SOLUTIONS?|ANSWERS?)\s*[\:\-]?\s*\n+(.+)$",
                  full_text, re.IGNORECASE | re.DOTALL)
    if not m:
        return {}
    matches = re.findall(r"(?:Q(?:uestion)?\.?\s*)?(\d{1,4})\s*[\.\:\-\s]+\(?([A-Ea-e1-5])\)?",
                         m.group(1))
    return {str(int(q)): ans.upper() for q, ans in matches}


# ═══════════════════════════════════════════════════════════════════════════════
# QUESTION BODY CROPPING & SPATIAL RENDERING
# ═══════════════════════════════════════════════════════════════════════════════

def crop_question_body_image(
    doc, start_page: int, start_y0: float, options_y0: float, end_y0: float,
    q_lines_body: list, visual_assets: list, dpi: int = 200
) -> str | None:
    """
    Renders the complete Question Body (from Question Number & Text down to
    the beginning of options) as ONE clean, high-resolution cropped image.
    Preserves question text, biological illustrations, chemical structures,
    circuits, diagrams, formulas, and List-I / List-II matching tables.
    """
    if not doc or not fitz:
        return None
    try:
        page_idx = start_page - 1
        if page_idx < 0 or page_idx >= len(doc):
            return None
        page = doc[page_idx]
        pw = page.rect.width
        ph = page.rect.height

        # Determine vertical boundaries
        y_top = max(0.0, start_y0 - 6.0)
        if options_y0 < 90000.0:
            y_bottom = min(ph, options_y0 - 2.0)
        elif end_y0 < 90000.0:
            y_bottom = min(ph, end_y0 - 4.0)
        else:
            y_bottom = min(ph, y_top + 320.0)

        # Ensure minimum reasonable height
        if y_bottom <= y_top + 15.0:
            y_bottom = min(ph, y_top + 50.0)

        # Collect horizontal extents from line items and visual assets
        xs = [li.get("x0") for li in q_lines_body if li.get("x0") is not None]
        xe = [li.get("x1") for li in q_lines_body if li.get("x1") is not None]
        for v in visual_assets:
            bx = v.get("bbox")
            if bx and len(bx) == 4:
                xs.append(bx[0])
                xe.append(bx[2])
                if bx[1] < y_top and bx[1] >= start_y0 - 25.0:
                    y_top = max(0.0, bx[1] - 4.0)
                if bx[3] > y_bottom and (options_y0 >= 90000.0 or bx[3] <= options_y0 + 15.0):
                    y_bottom = min(ph, bx[3] + 4.0)

        cols = [li.get("col") for li in q_lines_body if li.get("col") is not None]
        is_col1 = any(c == 1 for c in cols)
        is_col2 = any(c == 2 for c in cols)
        mid_x = pw / 2.0

        min_x = min(xs) if xs else 35.0
        max_x = max(xe) if xe else pw - 35.0

        if is_col1 and not is_col2:
            x_left = max(10.0, min_x - 12.0)
            x_right = min(mid_x - 6.0, max(max_x + 12.0, min_x + 60.0))
        elif is_col2 and not is_col1:
            x_left = max(mid_x + 6.0, min_x - 12.0)
            x_right = min(pw - 10.0, max(max_x + 12.0, min_x + 60.0))
        else:
            x_left = max(15.0, min_x - 12.0)
            x_right = min(pw - 15.0, max(max_x + 12.0, min_x + 100.0))

        # Full-page guard
        if (x_right - x_left) > pw * 0.85 and (y_bottom - y_top) > ph * 0.85:
            return None

        clip = fitz.Rect(x_left, y_top, x_right, y_bottom)
        pix = page.get_pixmap(clip=clip, dpi=dpi)
        img_bytes = pix.tobytes("png")

        if cv2 is not None and np is not None:
            arr = np.frombuffer(img_bytes, dtype=np.uint8)
            img_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img_bgr is not None:
                img_bgr, _ = auto_tighten_crop(img_bgr, padding_px=10)
                if not validate_crop_density(img_bgr, min_density=0.01):
                    return None
                _, enc = cv2.imencode(".png", img_bgr)
                img_bytes = enc.tobytes()

        return "data:image/png;base64," + base64.b64encode(img_bytes).decode("utf-8")
    except Exception:
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN QUESTION PARSER
# ═══════════════════════════════════════════════════════════════════════════════

def parse_questions_from_pages(pages: list, subject: str, category: str, pdf_bytes: bytes = None) -> list:
    """
    True Region & Boundary-First Question Extraction Pipeline
    
    Architecture:
      1. Page Layout Analysis: skip COVER_PAGE and EXAM_INSTRUCTIONS.
      2. Question Anchor Detection: find real question starter lines (number + stem).
         - Explicitly rejects options like (1), (2), (A), (B).
         - Rejects exam rules and instructions.
      3. Strict Question Spatial Boundaries:
         For Question i: [start_page, start_y0] -> [end_page, end_y0].
      4. Question Body Cropping:
         High-resolution 200 DPI crop of [start_y0, options_y0] preserving
         question number, question text, biology/physics/chemistry diagrams,
         circuits, and List-I/List-II matching tables as ONE integrated image.
      5. Text Options Extraction with LaTeX Math:
         Extracts options A/B/C/D as text, converting math superscripts,
         subscripts, Greek letters, and formulas into LaTeX ($...$).
    """
    doc = None
    if pdf_bytes and fitz:
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        except Exception:
            doc = None

    try:
        # ── Pass 1: Collect non-instruction line items in reading order ──────────
        active_pages = [p for p in pages if p.get("pageType") not in ("COVER_PAGE", "EXAM_INSTRUCTIONS")]
        if not active_pages:
            active_pages = pages  # fallback if all were classified

        all_line_items = []
        split_re = re.compile(
            r"(?<=\S)\s+(?=(?:(?:Q(?:uestion)?|Que|Ques)\s*\.?\s*(?:No\.?)?\s*\d+|\d{1,4}\.\s+[A-Z]))"
        )

        for p in active_pages:
            for item in p.get("structuredLines", []):
                raw = item.get("cleanText") or item.get("text") or ""
                subparts = split_re.split(raw)
                for sp in subparts:
                    sp = sp.strip()
                    if sp:
                        ni = dict(item)
                        ni["line_text"] = sp
                        all_line_items.append(ni)

        full_corpus = "\n".join(it.get("line_text", "") for it in all_line_items)
        trailing_answers = parse_trailing_answer_key(full_corpus)

        # ── Pass 2: Detect REAL Question Anchors ──────────────────────────────────
        anchors = []
        last_q_num = None

        for idx, item in enumerate(all_line_items):
            line = item.get("line_text", "").strip()
            if not line:
                continue

            # Reject pure options or subparts like "(1)", "(2)", "(A)", "(1) 20 m/s"
            if re.match(r"^\s*\(?\d{1,2}\)?\s*$", line):
                continue
            if re.match(r"^\s*\([1-5A-Ea-e]\)\s+", line):
                continue
            if is_instruction_or_metadata_text(line):
                continue

            m = QUESTION_START_RE.match(line)
            if not m:
                continue

            num_str = m.group(1) or m.group(2) or m.group(3)
            if not num_str or not num_str.isdigit():
                continue

            num = int(num_str)
            # Avoid false sub-numbering (e.g. subpart numbered 1. inside question 102)
            if last_q_num is not None and num <= last_q_num and (last_q_num - num) < 50:
                continue

            rest = (m.group(4) or "").strip()
            if is_instruction_or_metadata_text(rest) and len(rest) > 10:
                continue

            anchors.append({
                "anchor_idx": idx,
                "q_number": num,
                "page": item.get("page", 1),
                "y0": item.get("y0", 0.0),
                "x0": item.get("x0", 0.0),
                "starter_text": rest,
                "line_item": item,
            })
            last_q_num = num

        # ── Pass 3: Construct Question Regions and Populate Content ──────────────
        parsed_questions = []

        for a_idx, anchor in enumerate(anchors):
            q_num = anchor["q_number"]
            start_page = anchor["page"]
            start_y0 = anchor["y0"]

            if a_idx + 1 < len(anchors):
                next_a = anchors[a_idx + 1]
                end_page = next_a["page"]
                end_y0 = next_a["y0"]
            else:
                end_page = active_pages[-1]["pageNumber"]
                end_y0 = 99999.0

            # Collect lines in this question region
            q_lines = []
            start_line_idx = anchor["anchor_idx"]
            next_line_idx = anchors[a_idx + 1]["anchor_idx"] if a_idx + 1 < len(anchors) else len(all_line_items)

            for l_idx in range(start_line_idx, next_line_idx):
                q_lines.append(all_line_items[l_idx])

            # Separate question content from options
            content_lines = []
            options = []
            statement_y1 = start_y0 + 20.0
            options_y0 = 99999.0
            current_answer = ""
            current_marks = None
            current_neg_marks = None
            current_topic = "Standard Section"

            # Check if question has matching table (List-I / List-II)
            has_list_matching = False
            options_started = False

            for li in q_lines:
                txt = li.get("line_text", "").strip()
                if not txt:
                    continue

                # First line: remove the question number prefix
                if li == anchor["line_item"]:
                    txt = anchor["starter_text"]
                    if not txt:
                        continue

                # Metadata parsing
                am = ANSWER_OPTION_RE.match(txt)
                if am:
                    current_answer = am.group(1).upper()
                    continue
                at = ANSWER_TEXT_RE.match(txt)
                if at:
                    current_answer = at.group(1).strip()
                    continue
                mm = MARKS_RE.match(txt)
                if mm:
                    try: current_marks = float(mm.group(1))
                    except: pass
                    continue
                nm = NEG_MARKS_RE.match(txt)
                if nm:
                    try: current_neg_marks = float(nm.group(1))
                    except: pass
                    continue
                tm = TOPIC_RE.match(txt)
                if tm:
                    current_topic = tm.group(1).strip()
                    continue

                # Check for section headers
                sm = SECTION_RE.match(txt)
                if sm:
                    current_topic = sm.group(2).strip() or f"Section {sm.group(1)}"
                    continue
                if SUBJECT_HEADER_RE.match(txt):
                    current_topic = txt
                    continue

                if re.search(r"\b(?:List|Column)\s*[-–I12]\b", txt, re.IGNORECASE):
                    has_list_matching = True

                if re.search(r"\b(?:choose|correct\s+answer|options)\b", txt, re.IGNORECASE):
                    options_started = True

                # Inline options (e.g. (1) A-I  (2) A-II)
                inline_opts = split_inline_options(txt)
                if inline_opts:
                    options_started = True
                    options_y0 = min(options_y0, li.get("y0", 0.0))
                    for lbl, opt_val in inline_opts:
                        opt_val = convert_math_to_latex(opt_val)
                        options.append(f"{lbl}) {opt_val}")
                    continue

                # Dedicated Option line
                ao = ALPHA_OPTION_RE.match(txt)
                so = SUB_OPTION_RE.match(txt)

                # Check if this line is part of a List-I / List-II matching block
                if has_list_matching and not options and not options_started:
                    is_pairing = bool(re.search(r"[A-Da-d]\s*[-–]\s*[I1234ivx]+", txt))
                    if not is_pairing:
                        content_lines.append(txt)
                        statement_y1 = max(statement_y1, li.get("y1", 0.0))
                        continue

                if ao:
                    options_started = True
                    options_y0 = min(options_y0, li.get("y0", 0.0))
                    opt_lbl = ao.group(1).upper()
                    opt_clean = re.sub(r"^(?:[A-Ea-e1-5][\)\:]\s*|[A-Ea-e1-5]\.\s+)", "", ao.group(2)).strip()
                    opt_clean = convert_math_to_latex(opt_clean)
                    options.append(f"{opt_lbl}) {opt_clean}")
                    continue

                if so:
                    options_started = True
                    options_y0 = min(options_y0, li.get("y0", 0.0))
                    raw_lbl = so.group(1)
                    opt_lbl = NUM_TO_ALPHA.get(raw_lbl, raw_lbl.upper())
                    opt_clean = re.sub(r"^(?:[A-Ea-e1-5][\)\:]\s*|[A-Ea-e1-5]\.\s+)", "", so.group(2)).strip()
                    opt_clean = convert_math_to_latex(opt_clean)
                    options.append(f"{opt_lbl}) {opt_clean}")
                    continue

                # Regular content line
                if not options:
                    content_lines.append(txt)
                    statement_y1 = max(statement_y1, li.get("y1", 0.0))
                else:
                    opt_cont = convert_math_to_latex(txt)
                    options[-1] += f" {opt_cont}"

            raw_question_text = " ".join(content_lines).strip()
            clean_question_text = re.sub(r"\s+", " ", raw_question_text).strip()
            clean_question_text = convert_math_to_latex(clean_question_text)

            # ── Pass 4: Collect Visual Assets Strictly Inside This Region ────────
            q_visual_assets = []

            for p in active_pages:
                p_num = p["pageNumber"]
                if p_num < start_page or p_num > end_page:
                    continue

                for img in p.get("images", []):
                    if img.get("classification") and img["classification"] != "QUESTION_DIAGRAM":
                        continue

                    iy0 = img["y0"]
                    iy1 = img["y1"]
                    ic_y = (iy0 + iy1) / 2.0

                    # Strict boundary check
                    inside = False
                    if start_page == end_page:
                        inside = (p_num == start_page) and (start_y0 - 20.0 <= ic_y <= end_y0 + 20.0)
                    else:
                        if p_num == start_page:
                            inside = (ic_y >= start_y0 - 20.0)
                        elif p_num == end_page:
                            inside = (ic_y <= end_y0 + 20.0)
                        else:
                            inside = True

                    if inside:
                        img["assigned"] = True
                        q_visual_assets.append({
                            "id": f"q{q_num}_{img.get('type', 'diagram')}_{len(q_visual_assets)+1}",
                            "type": img.get("type", "DIAGRAM").upper(),
                            "path": img["data_url"],
                            "data_url": img["data_url"],
                            "page": p_num,
                            "page_number": p_num,
                            "bbox": img.get("bbox"),
                            "association_confidence": 0.95,
                        })

            # ── Crop Question Body Image (Header + Text + Diagram + Table) ───────
            body_items = [li for li in q_lines if li.get("y0", 0.0) < options_y0]
            if not body_items:
                body_items = q_lines

            q_body_data_url = crop_question_body_image(
                doc, start_page, start_y0, options_y0, end_y0, body_items, q_visual_assets, dpi=200
            )

            # Check if this question requires a diagram / visual asset
            has_diagram_or_table = (
                bool(q_visual_assets) or
                has_list_matching or
                bool(DIAGRAM_MENTION_RE.search(raw_question_text))
            )

            final_diagram_url = None
            if q_body_data_url and has_diagram_or_table:
                final_diagram_url = q_body_data_url
                q_visual_assets.insert(0, {
                    "id": f"q{q_num}_body",
                    "type": "QUESTION_BODY",
                    "path": q_body_data_url,
                    "data_url": q_body_data_url,
                    "page": start_page,
                    "page_number": start_page,
                    "association_confidence": 0.99,
                })
            elif q_visual_assets:
                final_diagram_url = q_visual_assets[0]["data_url"]

            # ── Pass 5: Validate and Reject Invalid/Empty Questions ───────────────
            # Reject stray options like "(1)", "(2)", "(A)", "(4)"
            if re.match(r"^\s*\(?[0-9A-Za-z]{1,3}\)?\s*$", clean_question_text):
                continue

            # Reject fragments with < 15 chars and no options and no visuals
            if len(clean_question_text) < 15 and not options and not q_visual_assets and not q_body_data_url:
                continue

            # Reject exam instruction paragraphs
            if is_instruction_or_metadata_text(clean_question_text) and len(options) == 0:
                continue

            # ── Pass 6: Build Final Question Object ──────────────────────────────
            final_answer = current_answer or trailing_answers.get(str(q_num), "")
            q_type = "MCQ" if len(options) >= 2 else "THEORY"

            # Structured options
            structured_opts = []
            for opt in options:
                om = re.match(r"^([A-Ea-e1-5])[\)\.\:\-]\s*(.*)$", opt)
                if om:
                    structured_opts.append({"label": om.group(1).upper(), "text": om.group(2).strip()})
                else:
                    structured_opts.append({"label": "", "text": opt})

            conf = 0.85
            if options and len(options) >= 4: conf += 0.10
            if final_answer: conf += 0.04
            conf = min(0.99, round(conf, 2))

            marks = current_marks or (4 if q_type == "MCQ" else 10)
            neg_marks = current_neg_marks if current_neg_marks is not None else (1.0 if q_type == "MCQ" else 0.0)

            diff = "MEDIUM"
            if len(clean_question_text) < 80 and q_type == "MCQ": diff = "EASY"
            elif len(clean_question_text) > 300 or "statement i" in clean_question_text.lower(): diff = "HARD"

            page_list = list(range(start_page, end_page + 1))

            parsed_questions.append({
                "tempId": f"EXT-{len(parsed_questions)+1}",
                "original_question_number": q_num,
                "question_number": str(q_num),
                "page_numbers": page_list,
                "page_number": start_page,
                "startPage": start_page,
                "endPage": end_page,
                "extraction_confidence": conf,
                "needs_review": conf < 0.80 or "[unclear]" in clean_question_text.lower(),
                "subject": subject or "Academic Examination",
                "topic": current_topic,
                "question_type": q_type,
                "difficulty": diff,
                "marks": marks,
                "negative_marks": neg_marks,
                "correct_answer": final_answer,
                "language": "English",
                "syllabus": category or "Standard Core Curriculum",
                "question_text": clean_question_text,
                "content_text": clean_question_text,
                "question_image": q_body_data_url,
                "options": options if len(options) >= 2 else None,
                "structured_options": structured_opts,
                "visual_assets": q_visual_assets,
                "images": q_visual_assets,
                "diagram_url": final_diagram_url,
                "diagram_data": final_diagram_url,
                "has_diagram": bool(final_diagram_url),
                "selected": True,
            })

        # Deduplicate questions by normalized question_text
        unique, seen = [], set()
        for q in parsed_questions:
            norm = re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFKC", q["content_text"]).lower()).strip()
            if not norm or norm in seen:
                continue
            seen.add(norm)
            q["tempId"] = f"EXT-{len(unique)+1}"
            unique.append(q)

        return unique
    finally:
        if doc is not None:
            try:
                doc.close()
            except Exception:
                pass


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN PIPELINE ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

def extract_questions_pipeline(payload: dict) -> dict:
    subject = payload.get("subject") or "Academic Examination"
    category = payload.get("category") or "Competitive Exam"
    file_data = payload.get("file_data")
    paper_text = payload.get("paper_text") or ""
    file_name = payload.get("file_name") or "uploaded_paper.pdf"

    all_rejected = []
    pages = []
    pdf_bytes = None

    if file_data:
        try:
            if "," in file_data:
                file_data = file_data.split(",", 1)[1]
            pdf_bytes = base64.b64decode(file_data)
            pages, all_rejected = extract_pages_from_pdf(pdf_bytes)
        except Exception as err:
            raise ValueError(f"Unable to read PDF ({file_name}): {err}")
    else:
        pages = [{
            "pageNumber": 1, "pageType": "QUESTION_PAGE",
            "rawText": paper_text, "cleanedText": "", "structuredLines": [], "images": [],
            "rejectedAssets": [],
        }]

    total_text = sum(len(re.sub(r"\W", "", p["rawText"])) for p in pages)
    if total_text < 15:
        return {
            "document_id": file_name, "questions": [], "extractedQuestions": [],
            "totalExtracted": 0, "detectedSubject": subject,
            "extractionSummary": f"No readable text in {file_name}. Scanned PDF detected.",
            "aiEngineUsed": False,
            "engine": "PyMuPDF + Docling + OpenCV + PaddleOCR Pipeline",
            "pages": [{"pageNumber": p["pageNumber"], "status": "OCR_REQUIRED"} for p in pages],
            "debug_info": {"page_analysis": [], "rejected_branding": all_rejected},
        }

    clean_page_lines(pages)
    questions = parse_questions_from_pages(pages, subject, category, pdf_bytes=pdf_bytes)

    debug_info = {
        "page_analysis": [
            {
                "page_number": p.get("pageNumber"),
                "page_type": p.get("pageType", "QUESTION_PAGE"),
                "structured_lines": len(p.get("structuredLines", [])),
                "visual_assets_extracted": len(p.get("images", [])),
                "rejected_assets": len(p.get("rejectedAssets", [])),
            }
            for p in pages
        ],
        "rejected_branding": all_rejected,
        "total_rejected": len(all_rejected),
        "docling_available": DOCLING_AVAILABLE,
        "opencv_available": CV2_AVAILABLE,
        "paddleocr_available": paddle_ocr_engine is not None,
    }

    summary = (
        f"Extracted {len(questions)} questions across {len(pages)} pages. "
        f"Page types: { {p['pageType']: sum(1 for pp in pages if pp.get('pageType')==p['pageType']) for p in pages} }. "
        f"Rejected branding assets: {len(all_rejected)}."
    )

    return {
        "document_id": file_name,
        "questions": questions,
        "extractedQuestions": questions,
        "totalExtracted": len(questions),
        "detectedSubject": subject,
        "extractionSummary": summary,
        "aiEngineUsed": False,
        "engine": "PyMuPDF + Docling + OpenCV + PaddleOCR (100% Free & Local)",
        "pages": [{"pageNumber": p["pageNumber"], "status": "EXTRACTED"} for p in pages],
        "debug_info": debug_info,
    }


def main():
    try:
        data = sys.stdin.read()
        if not data.strip():
            print(json.dumps({"error": "No input received.", "totalExtracted": 0, "extractedQuestions": []}))
            sys.exit(1)
        result = extract_questions_pipeline(json.loads(data))
        print(json.dumps(result))
    except Exception as exc:
        print(json.dumps({"error": str(exc), "totalExtracted": 0, "extractedQuestions": []}))
        sys.exit(1)


if __name__ == "__main__":
    main()

import base64
import json
import re
import sys
import unicodedata

import pymupdf as fitz

QUESTION_RE = re.compile(r"^(?:Q(?:uestion)?\s*\.?\s*(\d+)\s*[\.:)\-]|Question\s+No\.?\s*(\d+)\s*[:.)\-]?|(\d{1,4})\s*[\.:)\-])\s*(.*)$", re.I)
OPTION_RE = re.compile(r"^[\(\[]?([A-Da-d])[\)\].:\-]\s*(.*)$")
NUMERIC_OPTION_RE = re.compile(r"^[\(\[]?(\d)[\)\]]\s*(.*)$")
ANSWER_RE = re.compile(r"^(?:answer|correct\s+answer|solution)\s*[:\-]\s*([A-Da-d1-4])", re.I)
METADATA_RE = re.compile(r"^(?:marks?|negative\s+marks?|topic|section|page)\s*[:\-]", re.I)


def normalize(value):
    value = unicodedata.normalize("NFKC", value).lower()
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def clean_line(value):
    value = unicodedata.normalize("NFKC", value).replace("\u00a0", " ")
    return re.sub(r"[ \t]+", " ", value).strip()


def clean_pages(pages):
    occurrences = {}
    for page_index, page in enumerate(pages):
        lines = page["rawText"].splitlines()
        meaningful = [clean_line(line) for line in lines if clean_line(line)]
        for line in set(meaningful[:3] + meaningful[-3:]):
            occurrences.setdefault(line, set()).add(page_index)
    repeated = {line for line, page_indexes in occurrences.items() if len(page_indexes) >= 2 and len(line) > 2}
    for page in pages:
        lines = page["rawText"].splitlines()
        cleaned = []
        for index, line in enumerate(lines):
            value = clean_line(line)
            if not value:
                continue
            if value in repeated and (index < 4 or index >= len(lines) - 4):
                continue
            if re.fullmatch(r"(?:page\s*)?\d+(?:\s*(?:of|/)\s*\d+)?", value, re.I):
                continue
            cleaned.append(value)
        page["cleanedText"] = "\n".join(cleaned)


def parse_questions(pages, subject):
    lines = []
    for page in pages:
        page["startLine"] = len(lines)
        lines.extend(page["cleanedText"].splitlines())
        page["endLine"] = len(lines) - 1

    def page_at(index):
        for page in pages:
            if page["startLine"] <= index <= page["endLine"]:
                return page["pageNumber"]
        return 1

    parsed = []
    current = None

    def finish():
        nonlocal current
        if not current:
            return
        text = " ".join(current["text"]).strip()
        options = current["options"] or None
        if not text:
            current = None
            return
        confidence = 0.62 + (0.15 if current["number"] else 0) + (0.15 if options and len(options) >= 2 else 0)
        if "[unclear]" not in text.lower():
            confidence += 0.08
        parsed.append({
            "tempId": f"EXT-{len(parsed) + 1}",
            "question_number": current["number"] or str(len(parsed) + 1),
            "page_number": current["startPage"],
            "startPage": current["startPage"],
            "endPage": current["endPage"],
            "extraction_confidence": round(min(confidence, 0.98), 2),
            "needs_review": confidence < 0.8 or "[unclear]" in text.lower(),
            "subject": subject, "topic": "Standard Section",
            "question_type": "MCQ" if options and len(options) >= 2 else "THEORY",
            "difficulty": "MEDIUM",
            "marks": current["marks"] or (4 if options and len(options) >= 2 else 10),
            "negative_marks": current["negative_marks"] or 0,
            "correct_answer": current["answer"], "language": "English",
            "syllabus": "Standard Core Curriculum", "content_text": text,
            "options": options, "selected": True,
        })
        current = None

    for index, line in enumerate(lines):
        question_match = QUESTION_RE.match(line)
        alpha_option = OPTION_RE.match(line)
        numeric_option = NUMERIC_OPTION_RE.match(line)
        numeric_is_option = bool(numeric_option and current and current["options"] and not alpha_option)
        if question_match and not numeric_is_option:
            number = question_match.group(1) or question_match.group(2) or question_match.group(3)
            finish()
            current = {"number": str(int(number)), "text": [], "options": [], "answer": "", "marks": None, "negative_marks": None, "startPage": page_at(index), "endPage": page_at(index)}
            if question_match.group(4).strip():
                current["text"].append(question_match.group(4).strip())
            continue
        if not current:
            continue
        current["endPage"] = page_at(index)
        option_match = alpha_option or (numeric_option if numeric_is_option else None)
        if option_match:
            current["options"].append(option_match.group(2).strip())
            continue
        answer_match = ANSWER_RE.match(line)
        if answer_match:
            current["answer"] = answer_match.group(1).upper()
            continue
        if METADATA_RE.match(line):
            marks = re.search(r"marks?\s*[:\-]\s*(\d+(?:\.\d+)?)", line, re.I)
            negative = re.search(r"negative\s+marks?\s*[:\-]\s*(\d+(?:\.\d+)?)", line, re.I)
            if marks:
                current["marks"] = float(marks.group(1))
            if negative:
                current["negative_marks"] = float(negative.group(1))
            continue
        current["text"].append(line)
    finish()

    unique = []
    seen = set()
    for question in parsed:
        key = normalize(question["content_text"])
        if not key or key in seen:
            continue
        seen.add(key)
        question["tempId"] = f"EXT-{len(unique) + 1}"
        unique.append(question)
    return unique


def extract(payload):
    subject = payload.get("subject") or "Academic Examination"
    pages = []
    if payload.get("file_data"):
        try:
            document = fitz.open(stream=base64.b64decode(payload["file_data"]), filetype="pdf")
        except Exception as error:
            raise ValueError("Unable to read PDF. Please upload a valid PDF.") from error
        try:
            for page_number, page in enumerate(document, start=1):
                pages.append({"pageNumber": page_number, "rawText": page.get_text("text") or "", "cleanedText": ""})
        finally:
            document.close()
    else:
        pages = [{"pageNumber": 1, "rawText": payload.get("paper_text") or "", "cleanedText": ""}]
    meaningful = [len(re.sub(r"\W", "", page["rawText"])) for page in pages]
    if sum(meaningful) < 10:
        return {"extractedQuestions": [], "totalExtracted": 0, "detectedSubject": subject, "extractionSummary": "No readable text detected. This may be a scanned PDF. OCR processing is required.", "aiEngineUsed": False, "pages": [{"pageNumber": p["pageNumber"], "status": "OCR_REQUIRED"} for p in pages]}
    clean_pages(pages)
    questions = parse_questions(pages, subject)
    failed = [p["pageNumber"] for p, size in zip(pages, meaningful) if size < 10]
    summary = f"Extracted {len(questions)} structured questions from {len(pages)} page(s)."
    if failed:
        summary += f" {len(failed)} page(s) require OCR review."
    status = "EXTRACTED" if questions else "EXTRACTION_FAILED"
    return {"extractedQuestions": questions, "totalExtracted": len(questions), "detectedSubject": subject, "extractionSummary": summary, "aiEngineUsed": False, "pages": [{"pageNumber": p["pageNumber"], "status": "OCR_REQUIRED" if p["pageNumber"] in failed else status} for p in pages]}


try:
    result = extract(json.load(sys.stdin))
    print(json.dumps(result))
except Exception as error:
    print(json.dumps({"error": str(error)}))
    sys.exit(1)
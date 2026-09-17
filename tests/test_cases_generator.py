#!/usr/bin/env python3
"""
ZeroLeak 50-Case Comprehensive Synthetic Exam Generator
======================================================
Generates 50 distinct, realistic question paper PDFs spanning all 5 specification categories:
  Category 1 (01-10): Basic Question Formats & Column Layouts
  Category 2 (11-20): Instructions, Headers, Metadata & Shared Contexts
  Category 3 (21-30): Complex Layouts, Tables, Code Blocks, Formulas & Diagrams
  Category 4 (31-40): Boundary Cases, Spanning & Dense Typography
  Category 5 (41-50): Real-World Exam Paper Combinations & Complex Formats

Each test case generates:
  1. A standalone .pdf file
  2. A ground-truth JSON metadata descriptor defining expected questions, options, shared_context, instructions, and bleed criteria.
"""

import os
import sys
import json
import fitz  # PyMuPDF
from typing import Dict, Any, List

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
SYNTHETIC_DIR = os.path.join(TESTS_DIR, "synthetic_data")
os.makedirs(SYNTHETIC_DIR, exist_ok=True)

PAGE_W = 595  # A4 pt width
PAGE_H = 842  # A4 pt height

def create_base_doc():
    return fitz.open()

def add_header(page, title: str, subtitle: str = "EXAMINATION 2024-2025", time_marks: str = "Time: 3 Hours    Max Marks: 100"):
    page.insert_text(fitz.Point(PAGE_W / 2 - len(title) * 3.5, 35), title, fontsize=12, fontname="helv", color=(0, 0, 0))
    page.insert_text(fitz.Point(PAGE_W / 2 - len(subtitle) * 3, 50), subtitle, fontsize=10, fontname="helv", color=(0.2, 0.2, 0.2))
    page.insert_text(fitz.Point(50, 68), time_marks, fontsize=9, fontname="helv", color=(0.3, 0.3, 0.3))
    page.draw_line(fitz.Point(50, 75), fitz.Point(PAGE_W - 50, 75), color=(0, 0, 0), width=1)
    return 90

def add_instructions_block(page, y_start: float, instructions: List[str]):
    page.insert_text(fitz.Point(50, y_start), "INSTRUCTIONS TO CANDIDATES:", fontsize=10, fontname="helv", color=(0, 0, 0))
    y = y_start + 14
    for i, inst in enumerate(instructions):
        page.insert_text(fitz.Point(60, y), f"{i+1}. {inst}", fontsize=8.5, fontname="helv", color=(0.2, 0.2, 0.2))
        y += 12
    y += 4
    page.draw_line(fitz.Point(50, y), fitz.Point(PAGE_W - 50, y), color=(0.5, 0.5, 0.5), width=0.5)
    return y + 15

# ==============================================================================
# CATEGORY 1: BASIC QUESTION FORMATS (01-10)
# ==============================================================================

def gen_test_01():
    """Test 01: Single Column Standard MCQ (1. 2. 3. with (A)(B)(C)(D))"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "COMPUTER SCIENCE - CATEGORY 1 TEST 01")
    
    questions = [
        {"num": 1, "text": "What is the time complexity of binary search on a sorted array of size n?", "opts": ["(A) O(1)", "(B) O(log n)", "(C) O(n)", "(D) O(n^2)"]},
        {"num": 2, "text": "Which data structure uses LIFO (Last In First Out) principle?", "opts": ["(A) Queue", "(B) Stack", "(C) Array", "(D) Tree"]},
        {"num": 3, "text": "Which of the following is NOT an operating system?", "opts": ["(A) Linux", "(B) Windows", "(C) Oracle", "(D) macOS"]},
        {"num": 4, "text": "In Python, which keyword is used to define a function?", "opts": ["(A) func", "(B) define", "(C) def", "(D) function"]},
    ]
    
    for q in questions:
        page.insert_text(fitz.Point(50, y), f"{q['num']}. {q['text']}", fontsize=10, fontname="helv")
        y += 16
        for opt in q["opts"]:
            page.insert_text(fitz.Point(70, y), opt, fontsize=9.5, fontname="helv")
            y += 14
        y += 12
        
    doc_path = os.path.join(SYNTHETIC_DIR, "test_01_single_col_std_mcq.pdf")
    doc.save(doc_path)
    gt = {
        "id": "test_01",
        "category": "Basic Formats",
        "total_questions": 4,
        "expected_questions": ["1", "2", "3", "4"],
        "has_shared_context": False,
        "instructions_count": 0,
        "pdf_path": doc_path
    }
    with open(os.path.join(SYNTHETIC_DIR, "test_01_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_02():
    """Test 02: Single Column Q-prefix (Q.1, Q.2, Q.3 with A) B) C) D))"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "PHYSICS FOUNDATIONS - TEST 02")
    
    questions = [
        {"num": 1, "text": "What is the SI unit of electric current?", "opts": ["A) Volt", "B) Ampere", "C) Ohm", "D) Joule"]},
        {"num": 2, "text": "Speed of light in vacuum is approximately:", "opts": ["A) 3 x 10^8 m/s", "B) 3 x 10^6 m/s", "C) 3 x 10^5 km/s", "D) Both A and C"]},
        {"num": 3, "text": "Which law states that for every action there is an equal and opposite reaction?", "opts": ["A) First Law", "B) Second Law", "C) Third Law", "D) Law of Gravitation"]},
    ]
    for q in questions:
        page.insert_text(fitz.Point(50, y), f"Q.{q['num']} {q['text']}", fontsize=10, fontname="helv")
        y += 16
        for opt in q["opts"]:
            page.insert_text(fitz.Point(70, y), opt, fontsize=9.5, fontname="helv")
            y += 14
        y += 14
    doc_path = os.path.join(SYNTHETIC_DIR, "test_02_single_col_q_prefix.pdf")
    doc.save(doc_path)
    gt = {"id": "test_02", "category": "Basic Formats", "total_questions": 3, "expected_questions": ["1", "2", "3"], "has_shared_context": False, "instructions_count": 0, "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_02_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_03():
    """Test 03: Two-Column Standard Layout"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y_top = add_header(page, "MATHEMATICS SECTION - TWO COLUMN TEST 03")
    page.draw_line(fitz.Point(PAGE_W / 2, y_top), fitz.Point(PAGE_W / 2, PAGE_H - 50), color=(0.8, 0.8, 0.8), width=0.5)
    
    col1_qs = [
        {"num": 1, "text": "The derivative of sin(x) is:", "opts": ["(a) cos(x)", "(b) -cos(x)", "(c) tan(x)", "(d) sec(x)"]},
        {"num": 2, "text": "Value of log(1) is:", "opts": ["(a) 1", "(b) 0", "(c) e", "(d) infinity"]},
        {"num": 3, "text": "Matrix A is singular if det(A) is:", "opts": ["(a) 1", "(b) 0", "(c) -1", "(d) positive"]},
    ]
    col2_qs = [
        {"num": 4, "text": "Sum of angles in a triangle is:", "opts": ["(a) 90 deg", "(b) 180 deg", "(c) 270 deg", "(d) 360 deg"]},
        {"num": 5, "text": "Integral of 1/x dx is:", "opts": ["(a) ln|x| + C", "(b) 1/x^2", "(c) x", "(d) e^x"]},
        {"num": 6, "text": "If f(x) = x^2, then f'(3) is:", "opts": ["(a) 3", "(b) 6", "(c) 9", "(d) 12"]},
    ]
    
    y = y_top + 10
    for q in col1_qs:
        page.insert_text(fitz.Point(40, y), f"{q['num']}. {q['text']}", fontsize=9.5, fontname="helv")
        y += 14
        for opt in q["opts"]:
            page.insert_text(fitz.Point(55, y), opt, fontsize=9, fontname="helv")
            y += 12
        y += 12
        
    y = y_top + 10
    for q in col2_qs:
        page.insert_text(fitz.Point(PAGE_W / 2 + 15, y), f"{q['num']}. {q['text']}", fontsize=9.5, fontname="helv")
        y += 14
        for opt in q["opts"]:
            page.insert_text(fitz.Point(PAGE_W / 2 + 30, y), opt, fontsize=9, fontname="helv")
            y += 12
        y += 12

    doc_path = os.path.join(SYNTHETIC_DIR, "test_03_two_col_standard.pdf")
    doc.save(doc_path)
    gt = {"id": "test_03", "category": "Basic Formats", "total_questions": 6, "expected_questions": ["1", "2", "3", "4", "5", "6"], "has_shared_context": False, "instructions_count": 0, "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_03_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_04():
    """Test 04: Parentheses Numbering (1), (2), (3)"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "GENERAL APTITUDE - TEST 04")
    qs = [
        {"num": 1, "text": "Find the odd one out: 2, 3, 5, 7, 9, 11", "opts": ["(A) 3", "(B) 7", "(C) 9", "(D) 11"]},
        {"num": 2, "text": "Complete series: 1, 4, 9, 16, 25, ?", "opts": ["(A) 30", "(B) 35", "(C) 36", "(D) 49"]},
        {"num": 3, "text": "If CAT is coded as 24, DOG is coded as:", "opts": ["(A) 26", "(B) 28", "(C) 30", "(D) 32"]},
    ]
    for q in qs:
        page.insert_text(fitz.Point(50, y), f"({q['num']}) {q['text']}", fontsize=10, fontname="helv")
        y += 16
        for opt in q["opts"]:
            page.insert_text(fitz.Point(70, y), opt, fontsize=9.5, fontname="helv")
            y += 14
        y += 14
    doc_path = os.path.join(SYNTHETIC_DIR, "test_04_parentheses_numbering.pdf")
    doc.save(doc_path)
    gt = {"id": "test_04", "category": "Basic Formats", "total_questions": 3, "expected_questions": ["1", "2", "3"], "has_shared_context": False, "instructions_count": 0, "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_04_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_05():
    """Test 05: Bracket Numbering [1], [2], [3]"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "LOGIC DESIGN - TEST 05")
    qs = [
        {"num": 1, "text": "Which logic gate gives output 1 only when all inputs are 1?", "opts": ["A. OR", "B. AND", "C. XOR", "D. NOR"]},
        {"num": 2, "text": "How many select lines are needed for an 8-to-1 Multiplexer?", "opts": ["A. 2", "B. 3", "C. 4", "D. 8"]},
    ]
    for q in qs:
        page.insert_text(fitz.Point(50, y), f"[{q['num']}] {q['text']}", fontsize=10, fontname="helv")
        y += 16
        for opt in q["opts"]:
            page.insert_text(fitz.Point(70, y), opt, fontsize=9.5, fontname="helv")
            y += 14
        y += 14
    doc_path = os.path.join(SYNTHETIC_DIR, "test_05_bracket_numbering.pdf")
    doc.save(doc_path)
    gt = {"id": "test_05", "category": "Basic Formats", "total_questions": 2, "expected_questions": ["1", "2"], "has_shared_context": False, "instructions_count": 0, "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_05_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_06():
    """Test 06: Question Colon Prefix 'Question 1:'"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "CHEMISTRY PAPER - TEST 06")
    qs = [
        {"num": 1, "text": "What is the pH of pure water at 25 degrees Celsius?", "opts": ["(1) 0", "(2) 7", "(3) 14", "(4) 1"]},
        {"num": 2, "text": "Which element has atomic number 1?", "opts": ["(1) Helium", "(2) Hydrogen", "(3) Carbon", "(4) Oxygen"]},
    ]
    for q in qs:
        page.insert_text(fitz.Point(50, y), f"Question {q['num']}: {q['text']}", fontsize=10, fontname="helv")
        y += 16
        for opt in q["opts"]:
            page.insert_text(fitz.Point(70, y), opt, fontsize=9.5, fontname="helv")
            y += 14
        y += 14
    doc_path = os.path.join(SYNTHETIC_DIR, "test_06_colon_numbering.pdf")
    doc.save(doc_path)
    gt = {"id": "test_06", "category": "Basic Formats", "total_questions": 2, "expected_questions": ["1", "2"], "has_shared_context": False, "instructions_count": 0, "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_06_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_07():
    """Test 07: Subparts Alphabetical Q1(a), Q1(b), Q2(a), Q2(b)"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "DATABASE MANAGEMENT SYSTEMS - TEST 07")
    
    page.insert_text(fitz.Point(50, y), "Q.1 Answer the following:", fontsize=10, fontname="hebo")
    y += 16
    page.insert_text(fitz.Point(60, y), "(a) Define Primary Key and Foreign Key with an example. [4 Marks]", fontsize=9.5, fontname="helv")
    y += 24
    page.insert_text(fitz.Point(60, y), "(b) Explain the ACID properties of a transaction in DBMS. [4 Marks]", fontsize=9.5, fontname="helv")
    y += 28
    
    page.insert_text(fitz.Point(50, y), "Q.2 Answer the following:", fontsize=10, fontname="hebo")
    y += 16
    page.insert_text(fitz.Point(60, y), "(a) What is 3NF (Third Normal Form)? Give step by step normalization. [6 Marks]", fontsize=9.5, fontname="helv")
    y += 24
    page.insert_text(fitz.Point(60, y), "(b) Compare B-Tree and B+ Tree indexing mechanisms. [6 Marks]", fontsize=9.5, fontname="helv")
    
    doc_path = os.path.join(SYNTHETIC_DIR, "test_07_subparts_alphabetical.pdf")
    doc.save(doc_path)
    gt = {"id": "test_07", "category": "Basic Formats", "total_questions": 4, "expected_questions": ["1(a)", "1(b)", "2(a)", "2(b)"], "has_shared_context": False, "instructions_count": 0, "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_07_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_08():
    """Test 08: Subparts Roman 1. (i), 1. (ii), 2. (i), 2. (ii)"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "ENGINEERING MECHANICS - TEST 08")
    
    page.insert_text(fitz.Point(50, y), "1. Solve any two:", fontsize=10, fontname="hebo")
    y += 16
    page.insert_text(fitz.Point(65, y), "(i) State and prove Lami's Theorem with neat free body diagram.", fontsize=9.5, fontname="helv")
    y += 24
    page.insert_text(fitz.Point(65, y), "(ii) Define angle of friction and angle of repose.", fontsize=9.5, fontname="helv")
    y += 28
    
    page.insert_text(fitz.Point(50, y), "2. Attempt the following:", fontsize=10, fontname="hebo")
    y += 16
    page.insert_text(fitz.Point(65, y), "(i) Calculate centroid of a T-section with flange 100x20mm.", fontsize=9.5, fontname="helv")
    y += 24
    page.insert_text(fitz.Point(65, y), "(ii) Derive work energy principle for a particle in motion.", fontsize=9.5, fontname="helv")
    
    doc_path = os.path.join(SYNTHETIC_DIR, "test_08_subparts_roman.pdf")
    doc.save(doc_path)
    gt = {"id": "test_08", "category": "Basic Formats", "total_questions": 4, "expected_questions": ["1(i)", "1(ii)", "2(i)", "2(ii)"], "has_shared_context": False, "instructions_count": 0, "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_08_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_09():
    """Test 09: Three Column Layout"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y_top = add_header(page, "RAPID REVISION MCQ - THREE COLUMN TEST 09")
    col_w = (PAGE_W - 80) / 3
    
    c1_x = 40
    c2_x = 40 + col_w + 10
    c3_x = 40 + 2 * (col_w + 10)
    
    # 3 questions per column
    qs = [
        {"col": 0, "num": 1, "text": "HTML stands for?", "opts": ["A) Hyper Text Markup", "B) High Text", "C) Hyper Tab", "D) None"]},
        {"col": 0, "num": 2, "text": "CSS is used for?", "opts": ["A) Styling", "B) Scripting", "C) Database", "D) Server"]},
        {"col": 1, "num": 3, "text": "HTTP port is:", "opts": ["A) 80", "B) 443", "C) 21", "D) 22"]},
        {"col": 1, "num": 4, "text": "HTTPS port is:", "opts": ["A) 80", "B) 443", "C) 25", "D) 53"]},
        {"col": 2, "num": 5, "text": "DNS resolves:", "opts": ["A) IP to Name", "B) Name to IP", "C) MAC to IP", "D) Port to IP"]},
        {"col": 2, "num": 6, "text": "FTP is used for:", "opts": ["A) Mail", "B) Web", "C) File Transfer", "D) DNS"]},
    ]
    
    col_ys = [y_top + 10, y_top + 10, y_top + 10]
    for q in qs:
        cx = [c1_x, c2_x, c3_x][q["col"]]
        cy = col_ys[q["col"]]
        page.insert_text(fitz.Point(cx, cy), f"{q['num']}. {q['text']}", fontsize=8.5, fontname="helv")
        cy += 12
        for opt in q["opts"]:
            page.insert_text(fitz.Point(cx + 8, cy), opt, fontsize=8, fontname="helv")
            cy += 10
        cy += 10
        col_ys[q["col"]] = cy
        
    doc_path = os.path.join(SYNTHETIC_DIR, "test_09_three_column_layout.pdf")
    doc.save(doc_path)
    gt = {"id": "test_09", "category": "Basic Formats", "total_questions": 6, "expected_questions": ["1", "2", "3", "4", "5", "6"], "has_shared_context": False, "instructions_count": 0, "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_09_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_10():
    """Test 10: Mixed Numbering Styles in Single Doc (Q.1, 2., 3))"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "GENERAL SCIENCE - MIXED NUMBERING TEST 10")
    
    page.insert_text(fitz.Point(50, y), "Q.1 What is the chemical formula of water?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) H2O   (B) CO2   (C) NaCl   (D) CH4", fontsize=9.5, fontname="helv")
    y += 20
    
    page.insert_text(fitz.Point(50, y), "2. Which gas do plants absorb during photosynthesis?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "A. Oxygen   B. Carbon Dioxide   C. Nitrogen   D. Argon", fontsize=9.5, fontname="helv")
    y += 20
    
    page.insert_text(fitz.Point(50, y), "3) What is the hardest natural substance on Earth?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "1) Gold   2) Iron   3) Diamond   4) Platinum", fontsize=9.5, fontname="helv")
    
    doc_path = os.path.join(SYNTHETIC_DIR, "test_10_mixed_numbering_single_doc.pdf")
    doc.save(doc_path)
    gt = {"id": "test_10", "category": "Basic Formats", "total_questions": 3, "expected_questions": ["1", "2", "3"], "has_shared_context": False, "instructions_count": 0, "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_10_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

# ==============================================================================
# CATEGORY 2: INSTRUCTIONS, HEADERS, METADATA & SHARED CONTEXT (11-20)
# ==============================================================================

def gen_test_11():
    """Test 11: Exam Header & Metadata Filtering"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    
    # Large metadata block
    page.insert_text(fitz.Point(50, 30), "NATIONAL BOARD OF HIGHER EDUCATION", fontsize=12, fontname="hebo")
    page.insert_text(fitz.Point(50, 46), "Seat Number: [______________]    Center Code: 4021", fontsize=9, fontname="helv")
    page.insert_text(fitz.Point(50, 60), "Date: 15-Nov-2024    Duration: 3 Hours    Maximum Marks: 100", fontsize=9, fontname="helv")
    page.insert_text(fitz.Point(50, 74), "Course Code: CS-804    Subject: Distributed Systems", fontsize=9, fontname="helv")
    page.draw_line(fitz.Point(50, 80), fitz.Point(PAGE_W - 50, 80), color=(0, 0, 0), width=1)
    
    y = 100
    page.insert_text(fitz.Point(50, y), "1. Define Lamport logical clocks and their synchronization rules.", fontsize=10, fontname="helv")
    y += 18
    page.insert_text(fitz.Point(50, y), "2. Explain the Byzantine Fault Tolerance algorithm with diagram.", fontsize=10, fontname="helv")
    y += 18
    page.insert_text(fitz.Point(50, y), "3. Compare RPC and RMI communication protocols in distributed systems.", fontsize=10, fontname="helv")
    
    doc_path = os.path.join(SYNTHETIC_DIR, "test_11_exam_header_metadata.pdf")
    doc.save(doc_path)
    gt = {"id": "test_11", "category": "Instructions & Context", "total_questions": 3, "expected_questions": ["1", "2", "3"], "has_shared_context": False, "instructions_count": 0, "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_11_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_12():
    """Test 12: General Instructions Block (Numbered 1, 2, 3 must NOT be confused with Q1, Q2, Q3)"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "FINAL SEMESTER EXAMINATION")
    
    instructions = [
        "All questions are compulsory and carry equal marks.",
        "Use of non-programmable scientific calculator is permitted.",
        "Assume suitable data wherever necessary and state it clearly.",
        "Figures to the right indicate full marks."
    ]
    y = add_instructions_block(page, y, instructions)
    
    y += 10
    page.insert_text(fitz.Point(50, y), "1. Which CPU scheduling algorithm gives minimum average waiting time?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) FCFS   (B) SJF   (C) Round Robin   (D) Priority", fontsize=9, fontname="helv")
    y += 20
    
    page.insert_text(fitz.Point(50, y), "2. A deadlock will NOT occur if which of the following condition is broken?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Mutual exclusion   (B) Hold & wait   (C) No preemption   (D) Any of these", fontsize=9, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_12_general_instructions_block.pdf")
    doc.save(doc_path)
    gt = {"id": "test_12", "category": "Instructions & Context", "total_questions": 2, "expected_questions": ["1", "2"], "has_shared_context": False, "instructions_count": 4, "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_12_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_13():
    """Test 13: Section Headers (SECTION A, SECTION B)"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "APPLIED PHYSICS - SECTIONED PAPER")
    
    page.insert_text(fitz.Point(PAGE_W / 2 - 40, y), "SECTION - A (Objective)", fontsize=11, fontname="hebo")
    page.draw_line(fitz.Point(50, y + 4), fitz.Point(PAGE_W - 50, y + 4), color=(0.4, 0.4, 0.4), width=0.8)
    y += 18
    
    page.insert_text(fitz.Point(50, y), "1. The unit of magnetic flux is:", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Tesla   (B) Weber   (C) Henry   (D) Gauss", fontsize=9.5, fontname="helv")
    y += 24
    
    page.insert_text(fitz.Point(PAGE_W / 2 - 45, y), "SECTION - B (Descriptive)", fontsize=11, fontname="hebo")
    page.draw_line(fitz.Point(50, y + 4), fitz.Point(PAGE_W - 50, y + 4), color=(0.4, 0.4, 0.4), width=0.8)
    y += 18
    
    page.insert_text(fitz.Point(50, y), "2. Derive Maxwell's electromagnetic wave equation in vacuum. [8 Marks]", fontsize=10, fontname="helv")
    y += 20
    page.insert_text(fitz.Point(50, y), "3. Explain Hall Effect and derive expression for Hall coefficient. [8 Marks]", fontsize=10, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_13_section_headers.pdf")
    doc.save(doc_path)
    gt = {"id": "test_13", "category": "Instructions & Context", "total_questions": 3, "expected_questions": ["1", "2", "3"], "has_shared_context": False, "instructions_count": 0, "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_13_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_14():
    """Test 14: Shared Passage Context (Questions 1 to 3 based on Passage)"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "VERBAL ABILITY & READING COMPREHENSION")
    
    page.insert_text(fitz.Point(50, y), "Read the following passage carefully and answer Questions 1 to 3:", fontsize=10, fontname="hebo")
    y += 14
    
    passage_rect = fitz.Rect(50, y, PAGE_W - 50, y + 60)
    page.draw_rect(passage_rect, color=(0.6, 0.6, 0.6), width=0.5)
    passage = "Renewable energy technologies have witnessed unprecedented cost reductions over the past decade. Solar photovoltaic levelized costs dropped by over 85%, while onshore wind costs declined by nearly 60%. These economics are driving rapid global capacity additions."
    page.insert_textbox(fitz.Rect(55, y + 4, PAGE_W - 55, y + 56), passage, fontsize=8.5, fontname="helv")
    y += 70
    
    page.insert_text(fitz.Point(50, y), "1. By what percentage did solar photovoltaic costs decline over the past decade?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) 50%   (B) 60%   (C) 85%   (D) 95%", fontsize=9, fontname="helv")
    y += 20
    
    page.insert_text(fitz.Point(50, y), "2. What is driving rapid global renewable capacity additions?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Government mandates   (B) Favorable economics   (C) Subsidies   (D) Fossil shortage", fontsize=9, fontname="helv")
    y += 20
    
    page.insert_text(fitz.Point(50, y), "3. The primary theme of the passage is:", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Fossil fuels   (B) Renewable cost reduction   (C) Battery storage   (D) Climate treaties", fontsize=9, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_14_shared_passage_context.pdf")
    doc.save(doc_path)
    gt = {"id": "test_14", "category": "Instructions & Context", "total_questions": 3, "expected_questions": ["1", "2", "3"], "has_shared_context": True, "shared_context_for": ["1", "2", "3"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_14_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_15():
    """Test 15: Shared Direction Block (Direction for Q1-Q3)"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "ENGLISH USAGE - TEST 15")
    
    page.insert_text(fitz.Point(50, y), "Direction for Questions 1 to 3: In each question below, choose the word closest in meaning (Synonym) to the capitalized word.", fontsize=9.5, fontname="hebo")
    y += 22
    
    page.insert_text(fitz.Point(50, y), "1. EPHEMERAL", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Eternal   (B) Transient   (C) Giant   (D) Hollow", fontsize=9, fontname="helv")
    y += 20
    
    page.insert_text(fitz.Point(50, y), "2. METICULOUS", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Careless   (B) Precise   (C) Angry   (D) Slow", fontsize=9, fontname="helv")
    y += 20
    
    page.insert_text(fitz.Point(50, y), "3. CANDID", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Frank   (B) Shy   (C) Crafty   (D) Sweet", fontsize=9, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_15_shared_direction_block.pdf")
    doc.save(doc_path)
    gt = {"id": "test_15", "category": "Instructions & Context", "total_questions": 3, "expected_questions": ["1", "2", "3"], "has_shared_context": True, "shared_context_for": ["1", "2", "3"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_15_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_16():
    """Test 16: Note and Disclaimer Block"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "THERMODYNAMICS - TEST 16")
    
    page.insert_text(fitz.Point(50, y), "NOTE: Universal gas constant R = 8.314 J/(mol K). Standard atmospheric pressure = 101.3 kPa.", fontsize=8.5, fontname="helv")
    y += 18
    
    page.insert_text(fitz.Point(50, y), "1. What is the work done in an isochoric thermodynamic process?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) P * delta_V   (B) Zero   (C) nRT ln(V2/V1)   (D) delta_U", fontsize=9, fontname="helv")
    y += 20
    
    page.insert_text(fitz.Point(50, y), "2. In an adiabatic process, heat exchanged with surroundings is:", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Zero   (B) Positive   (C) Negative   (D) Constant", fontsize=9, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_16_note_and_disclaimer.pdf")
    doc.save(doc_path)
    gt = {"id": "test_16", "category": "Instructions & Context", "total_questions": 2, "expected_questions": ["1", "2"], "has_shared_context": False, "instructions_count": 0, "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_16_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_17():
    """Test 17: Inline Instruction Between Questions"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "ORGANIC CHEMISTRY - TEST 17")
    
    page.insert_text(fitz.Point(50, y), "1. Which reagent converts alcohol to alkyl chloride?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) SOCl2   (B) H2O   (C) NaOH   (D) NaCl", fontsize=9, fontname="helv")
    y += 24
    
    page.insert_text(fitz.Point(50, y), "--- Answer any one from the following two questions (Q2 or Q3) ---", fontsize=9, fontname="hebo", color=(0.3, 0.3, 0.3))
    y += 20
    
    page.insert_text(fitz.Point(50, y), "2. Explain Markovnikov rule with an example addition reaction.", fontsize=10, fontname="helv")
    y += 22
    page.insert_text(fitz.Point(50, y), "3. Describe Aldol condensation reaction with mechanism.", fontsize=10, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_17_inline_instruction.pdf")
    doc.save(doc_path)
    gt = {"id": "test_17", "category": "Instructions & Context", "total_questions": 3, "expected_questions": ["1", "2", "3"], "has_shared_context": False, "instructions_count": 0, "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_17_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_18():
    """Test 18: OR Choice Questions"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "STRUCTURAL ANALYSIS - TEST 18")
    
    page.insert_text(fitz.Point(50, y), "Q.1 State and explain Castigliano's First Theorem. [6 Marks]", fontsize=10, fontname="helv")
    y += 18
    page.insert_text(fitz.Point(PAGE_W / 2 - 10, y), "OR", fontsize=10, fontname="hebo")
    y += 18
    page.insert_text(fitz.Point(50, y), "Q.1 State and explain Principle of Virtual Work. [6 Marks]", fontsize=10, fontname="helv")
    y += 28
    
    page.insert_text(fitz.Point(50, y), "Q.2 Analyze a propped cantilever beam subjected to UDL. [8 Marks]", fontsize=10, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_18_or_choice_questions.pdf")
    doc.save(doc_path)
    gt = {"id": "test_18", "category": "Instructions & Context", "total_questions": 2, "expected_questions": ["1", "2"], "has_shared_context": False, "instructions_count": 0, "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_18_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_19():
    """Test 19: Footer and Page Numbers Filtering"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "OPERATING SYSTEMS - TEST 19")
    
    page.insert_text(fitz.Point(50, y), "1. What is thrashing in virtual memory systems?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) High CPU utilization   (B) Excessive page faulting   (C) Memory leak   (D) Deadlock", fontsize=9, fontname="helv")
    y += 24
    
    page.insert_text(fitz.Point(50, y), "2. Which page replacement algorithm suffers from Belady's Anomaly?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) LRU   (B) Optimal   (C) FIFO   (D) Clock", fontsize=9, fontname="helv")
    
    # Footers
    page.draw_line(fitz.Point(50, PAGE_H - 40), fitz.Point(PAGE_W - 50, PAGE_H - 40), color=(0.7, 0.7, 0.7), width=0.5)
    page.insert_text(fitz.Point(50, PAGE_H - 25), "CONFIDENTIAL - CS401 EXAMINATION", fontsize=8, fontname="helv", color=(0.5, 0.5, 0.5))
    page.insert_text(fitz.Point(PAGE_W - 120, PAGE_H - 25), "Page 1 of 1    [Turn Over]", fontsize=8, fontname="helv", color=(0.5, 0.5, 0.5))

    doc_path = os.path.join(SYNTHETIC_DIR, "test_19_footer_and_page_numbers.pdf")
    doc.save(doc_path)
    gt = {"id": "test_19", "category": "Instructions & Context", "total_questions": 2, "expected_questions": ["1", "2"], "has_shared_context": False, "instructions_count": 0, "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_19_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_20():
    """Test 20: Multi-page Exam with Header & Instructions on Each Page"""
    doc = create_base_doc()
    # Page 1
    p1 = doc.new_page(width=PAGE_W, height=PAGE_H)
    y1 = add_header(p1, "ELECTRICAL ENGINEERING - PART I")
    p1.insert_text(fitz.Point(50, y1), "1. Calculate equivalent resistance of two 10-ohm resistors in parallel.", fontsize=10, fontname="helv")
    y1 += 14
    p1.insert_text(fitz.Point(70, y1), "(A) 5 ohms   (B) 10 ohms   (C) 20 ohms   (D) 2.5 ohms", fontsize=9, fontname="helv")
    
    # Page 2
    p2 = doc.new_page(width=PAGE_W, height=PAGE_H)
    y2 = add_header(p2, "ELECTRICAL ENGINEERING - PART II")
    p2.insert_text(fitz.Point(50, y2), "2. State Norton's theorem for linear active electrical networks.", fontsize=10, fontname="helv")
    y2 += 18
    p2.insert_text(fitz.Point(50, y2), "3. Derive condition for maximum power transfer in DC circuits.", fontsize=10, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_20_multipage_instructions.pdf")
    doc.save(doc_path)
    gt = {"id": "test_20", "category": "Instructions & Context", "total_questions": 3, "expected_questions": ["1", "2", "3"], "has_shared_context": False, "instructions_count": 0, "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_20_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

# ==============================================================================
# CATEGORY 3: COMPLEX LAYOUTS, TABLES, CODE BLOCKS, FORMULAS, DIAGRAMS (21-30)
# ==============================================================================

def gen_test_21():
    """Test 21: MCQ with Embedded Geometric / Flowchart Diagram"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "DIGITAL ELECTRONICS - DIAGRAM TEST 21")
    
    page.insert_text(fitz.Point(50, y), "1. Identify the logic gate represented in the schematic below:", fontsize=10, fontname="helv")
    y += 15
    
    # Draw logic gate diagram inside question 1
    diag_rect = fitz.Rect(100, y, 220, y + 50)
    page.draw_rect(diag_rect, color=(0, 0, 0), fill=(0.95, 0.95, 0.95), width=1)
    page.insert_text(fitz.Point(130, y + 28), "[ LOGIC GATE ]", fontsize=9, fontname="hebo")
    page.draw_line(fitz.Point(70, y + 15), fitz.Point(100, y + 15), color=(0, 0, 0), width=1)
    page.draw_line(fitz.Point(70, y + 35), fitz.Point(100, y + 35), color=(0, 0, 0), width=1)
    page.draw_line(fitz.Point(220, y + 25), fitz.Point(250, y + 25), color=(0, 0, 0), width=1)
    page.insert_text(fitz.Point(55, y + 18), "A", fontsize=9, fontname="helv")
    page.insert_text(fitz.Point(55, y + 38), "B", fontsize=9, fontname="helv")
    page.insert_text(fitz.Point(255, y + 28), "Y", fontsize=9, fontname="helv")
    y += 65
    
    page.insert_text(fitz.Point(70, y), "(A) NAND Gate   (B) NOR Gate   (C) XOR Gate   (D) XNOR Gate", fontsize=9.5, fontname="helv")
    y += 25
    
    page.insert_text(fitz.Point(50, y), "2. What is the Boolean expression for an exclusive OR (XOR) gate?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) A'B + AB'   (B) AB + A'B'   (C) A + B   (D) (A + B)'", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_21_mcq_with_diagram.pdf")
    doc.save(doc_path)
    gt = {"id": "test_21", "category": "Complex Layouts", "total_questions": 2, "expected_questions": ["1", "2"], "has_diagram": [1], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_21_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_22():
    """Test 22: Question with Embedded Table"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "DATABASE MANAGEMENT - TABLE TEST 22")
    
    page.insert_text(fitz.Point(50, y), "1. Consider the following relation Employee(EmpID, Dept, Salary):", fontsize=10, fontname="helv")
    y += 12
    
    # Draw table
    table_rect = fitz.Rect(80, y, 320, y + 60)
    page.draw_rect(table_rect, color=(0, 0, 0), width=1)
    page.draw_line(fitz.Point(80, y + 20), fitz.Point(320, y + 20), color=(0, 0, 0), width=1)
    page.draw_line(fitz.Point(150, y), fitz.Point(150, y + 60), color=(0, 0, 0), width=0.5)
    page.draw_line(fitz.Point(230, y), fitz.Point(230, y + 60), color=(0, 0, 0), width=0.5)
    
    page.insert_text(fitz.Point(90, y + 14), "EmpID", fontsize=9, fontname="hebo")
    page.insert_text(fitz.Point(165, y + 14), "Dept", fontsize=9, fontname="hebo")
    page.insert_text(fitz.Point(245, y + 14), "Salary", fontsize=9, fontname="hebo")
    
    page.insert_text(fitz.Point(90, y + 34), "E101", fontsize=8.5, fontname="helv")
    page.insert_text(fitz.Point(165, y + 34), "HR", fontsize=8.5, fontname="helv")
    page.insert_text(fitz.Point(245, y + 34), "50,000", fontsize=8.5, fontname="helv")
    
    page.insert_text(fitz.Point(90, y + 52), "E102", fontsize=8.5, fontname="helv")
    page.insert_text(fitz.Point(165, y + 52), "IT", fontsize=8.5, fontname="helv")
    page.insert_text(fitz.Point(245, y + 52), "75,000", fontsize=8.5, fontname="helv")
    y += 75
    
    page.insert_text(fitz.Point(50, y), "What is the result of query: SELECT AVG(Salary) FROM Employee WHERE Dept='IT'?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) 50,000   (B) 62,500   (C) 75,000   (D) NULL", fontsize=9.5, fontname="helv")
    y += 24
    
    page.insert_text(fitz.Point(50, y), "2. Which normal form deals with multivalued dependency?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) 2NF   (B) 3NF   (C) BCNF   (D) 4NF", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_22_table_in_question.pdf")
    doc.save(doc_path)
    gt = {"id": "test_22", "category": "Complex Layouts", "total_questions": 2, "expected_questions": ["1", "2"], "has_table": [1], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_22_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_23():
    """Test 23: Question with Embedded Code Block"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "DATA STRUCTURES - CODE TEST 23")
    
    page.insert_text(fitz.Point(50, y), "1. What will be the output of the following C code snippet?", fontsize=10, fontname="helv")
    y += 12
    
    code_rect = fitz.Rect(60, y, 350, y + 65)
    page.draw_rect(code_rect, color=(0.8, 0.8, 0.8), fill=(0.96, 0.96, 0.96), width=0.5)
    code = "#include <stdio.h>\nint main() {\n    int a = 5, b = 2;\n    printf(\"%d\", a / b);\n    return 0;\n}"
    page.insert_textbox(fitz.Rect(65, y + 4, 345, y + 60), code, fontsize=8.5, fontname="cour")
    y += 75
    
    page.insert_text(fitz.Point(70, y), "(A) 2.5   (B) 2   (C) 2.0   (D) Compilation Error", fontsize=9.5, fontname="helv")
    y += 24
    
    page.insert_text(fitz.Point(50, y), "2. In C, what does a pointer variable store?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Value   (B) Address of another variable   (C) Size   (D) DataType", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_23_code_snippet_in_question.pdf")
    doc.save(doc_path)
    gt = {"id": "test_23", "category": "Complex Layouts", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_23_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_24():
    """Test 24: Mathematical Formula Dense Question"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "CALCULUS & ANALYSIS - TEST 24")
    
    page.insert_text(fitz.Point(50, y), "1. Evaluate the definite integral: I = integral from 0 to pi of (x * sin(x) / (1 + cos^2(x))) dx", fontsize=10, fontname="helv")
    y += 16
    page.insert_text(fitz.Point(70, y), "(A) pi^2 / 4   (B) pi / 2   (C) pi^2 / 8   (D) 2*pi", fontsize=9.5, fontname="helv")
    y += 24
    
    page.insert_text(fitz.Point(50, y), "2. If matrix M = [[2, 1], [0, 3]], then eigenvalues lambda_1 and lambda_2 are:", fontsize=10, fontname="helv")
    y += 16
    page.insert_text(fitz.Point(70, y), "(A) 2 and 3   (B) 1 and 2   (C) 0 and 5   (D) -2 and -3", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_24_mathematical_formula_dense.pdf")
    doc.save(doc_path)
    gt = {"id": "test_24", "category": "Complex Layouts", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_24_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_25():
    """Test 25: Horizontal Options Layout (A) Yes  (B) No  (C) Maybe  (D) None"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "DISCRETE MATHEMATICS - TEST 25")
    
    page.insert_text(fitz.Point(50, y), "1. Is the relation R = {(a,a), (b,b), (c,c)} reflexive on set S = {a, b, c}?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Yes         (B) No         (C) Partially         (D) Cannot be determined", fontsize=9.5, fontname="helv")
    y += 24
    
    page.insert_text(fitz.Point(50, y), "2. Is empty set a subset of every set?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) True        (B) False       (C) Under conditions  (D) None of these", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_25_horizontal_options_layout.pdf")
    doc.save(doc_path)
    gt = {"id": "test_25", "category": "Complex Layouts", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_25_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_26():
    """Test 26: 2x2 Grid Options Layout"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "CIRCUIT THEORY - TEST 26")
    
    page.insert_text(fitz.Point(50, y), "1. What are the units of inductance and capacitance respectively?", fontsize=10, fontname="helv")
    y += 15
    page.insert_text(fitz.Point(70, y), "(A) Henry, Farad", fontsize=9.5, fontname="helv")
    page.insert_text(fitz.Point(250, y), "(B) Farad, Henry", fontsize=9.5, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(C) Ohm, Siemens", fontsize=9.5, fontname="helv")
    page.insert_text(fitz.Point(250, y), "(D) Weber, Tesla", fontsize=9.5, fontname="helv")
    y += 24
    
    page.insert_text(fitz.Point(50, y), "2. In a series RLC circuit at resonance, the impedance is:", fontsize=10, fontname="helv")
    y += 15
    page.insert_text(fitz.Point(70, y), "(A) Purely resistive (Minimum)", fontsize=9.5, fontname="helv")
    page.insert_text(fitz.Point(270, y), "(B) Purely inductive (Maximum)", fontsize=9.5, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(C) Purely capacitive", fontsize=9.5, fontname="helv")
    page.insert_text(fitz.Point(270, y), "(D) Infinite", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_26_two_by_two_grid_options.pdf")
    doc.save(doc_path)
    gt = {"id": "test_26", "category": "Complex Layouts", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_26_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_27():
    """Test 27: Multi-Line Options Text"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "SOFTWARE ENGINEERING - TEST 27")
    
    page.insert_text(fitz.Point(50, y), "1. Which statement best characterizes the Agile Scrum methodology?", fontsize=10, fontname="helv")
    y += 16
    page.insert_textbox(fitz.Rect(70, y, PAGE_W - 50, y + 25), "(A) Strict sequential linear development phases where testing occurs only after full coding phase is completed.", fontsize=9, fontname="helv")
    y += 28
    page.insert_textbox(fitz.Rect(70, y, PAGE_W - 50, y + 25), "(B) Iterative development in sprints with continuous customer feedback, sprint reviews, and sprint retrospectives.", fontsize=9, fontname="helv")
    y += 28
    page.insert_textbox(fitz.Rect(70, y, PAGE_W - 50, y + 25), "(C) Formal mathematical modeling of system requirements before any software architecture decisions.", fontsize=9, fontname="helv")
    y += 28
    page.insert_textbox(fitz.Rect(70, y, PAGE_W - 50, y + 25), "(D) Ad-hoc code and fix cycle without formal team roles or scheduled sprint planning meetings.", fontsize=9, fontname="helv")
    y += 35
    
    page.insert_text(fitz.Point(50, y), "2. High cohesion and low coupling in modular design aims to:", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Increase dependencies   (B) Facilitate maintainability   (C) Slow execution   (D) None", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_27_multi_line_options.pdf")
    doc.save(doc_path)
    gt = {"id": "test_27", "category": "Complex Layouts", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_27_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_28():
    """Test 28: Image/Diagram Based Options"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "PATTERN RECOGNITION - TEST 28")
    
    page.insert_text(fitz.Point(50, y), "1. Which waveform corresponds to a pulse-width modulated (PWM) signal at 50% duty cycle?", fontsize=10, fontname="helv")
    y += 15
    
    # Draw 4 small diagram option boxes
    for i, lbl in enumerate(["(A)", "(B)", "(C)", "(D)"]):
        bx = 70 + (i % 2) * 220
        by = y + (i // 2) * 45
        page.insert_text(fitz.Point(bx, by + 20), lbl, fontsize=9.5, fontname="hebo")
        box_rect = fitz.Rect(bx + 25, by, bx + 180, by + 35)
        page.draw_rect(box_rect, color=(0, 0, 0), fill=(0.95, 0.95, 0.95), width=0.5)
        page.insert_text(fitz.Point(bx + 40, by + 20), f"[Waveform Pattern {lbl}]", fontsize=8, fontname="helv")
    y += 105
    
    page.insert_text(fitz.Point(50, y), "2. What is the frequency of a signal with period T = 10 ms?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) 50 Hz   (B) 100 Hz   (C) 1 kHz   (D) 10 kHz", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_28_image_based_options.pdf")
    doc.save(doc_path)
    gt = {"id": "test_28", "category": "Complex Layouts", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_28_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_29():
    """Test 29: Tabular Match the Following Question"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "BIOLOGY & LIFE SCIENCES - TEST 29")
    
    page.insert_text(fitz.Point(50, y), "1. Match the items in Column I with those in Column II:", fontsize=10, fontname="helv")
    y += 12
    
    page.insert_text(fitz.Point(80, y), "Column I (Organelle)", fontsize=9, fontname="hebo")
    page.insert_text(fitz.Point(260, y), "Column II (Function)", fontsize=9, fontname="hebo")
    y += 14
    page.insert_text(fitz.Point(80, y), "P. Mitochondria", fontsize=8.5, fontname="helv")
    page.insert_text(fitz.Point(260, y), "1. Protein Synthesis", fontsize=8.5, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(80, y), "Q. Ribosome", fontsize=8.5, fontname="helv")
    page.insert_text(fitz.Point(260, y), "2. ATP Production", fontsize=8.5, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(80, y), "R. Chloroplast", fontsize=8.5, fontname="helv")
    page.insert_text(fitz.Point(260, y), "3. Photosynthesis", fontsize=8.5, fontname="helv")
    y += 16
    
    page.insert_text(fitz.Point(70, y), "(A) P-2, Q-1, R-3   (B) P-1, Q-2, R-3   (C) P-3, Q-1, R-2   (D) P-2, Q-3, R-1", fontsize=9.5, fontname="helv")
    y += 24
    
    page.insert_text(fitz.Point(50, y), "2. Which vitamin is synthesized in skin upon sunlight exposure?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Vitamin A   (B) Vitamin B12   (C) Vitamin C   (D) Vitamin D", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_29_tabular_match_the_following.pdf")
    doc.save(doc_path)
    gt = {"id": "test_29", "category": "Complex Layouts", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_29_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_30():
    """Test 30: Assertion & Reason Format"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "CHEMICAL ENGINEERING - TEST 30")
    
    page.insert_text(fitz.Point(50, y), "1. Given below are two statements: one labeled Assertion (A) and other Reason (R):", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "Assertion (A): Water boils at a lower temperature at high altitudes.", fontsize=9, fontname="hebo")
    y += 12
    page.insert_text(fitz.Point(70, y), "Reason (R): Atmospheric pressure decreases with increasing altitude.", fontsize=9, fontname="hebo")
    y += 16
    
    page.insert_text(fitz.Point(70, y), "(A) Both (A) and (R) are true, and (R) is the correct explanation of (A).", fontsize=8.5, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(70, y), "(B) Both (A) and (R) are true, but (R) is NOT the correct explanation of (A).", fontsize=8.5, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(70, y), "(C) (A) is true but (R) is false.", fontsize=8.5, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(70, y), "(D) (A) is false but (R) is true.", fontsize=8.5, fontname="helv")
    y += 24
    
    page.insert_text(fitz.Point(50, y), "2. The triple point of water is at approximately:", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) 273.16 K   (B) 373.16 K   (C) 100 K   (D) 0 K", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_30_assertion_reason_format.pdf")
    doc.save(doc_path)
    gt = {"id": "test_30", "category": "Complex Layouts", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_30_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

# ==============================================================================
# CATEGORY 4: BOUNDARY CASES & PAGE SPLITS (31-40)
# ==============================================================================

def gen_test_31():
    """Test 31: Question at the Very Top of Page (y = 25 pt)"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = 25
    page.insert_text(fitz.Point(50, y), "1. What is the fundamental unit of heredity?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Chromosome   (B) Gene   (C) Protein   (D) Cell", fontsize=9.5, fontname="helv")
    y += 24
    page.insert_text(fitz.Point(50, y), "2. Who is known as the father of modern genetics?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Gregor Mendel   (B) Charles Darwin   (C) Watson   (D) Crick", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_31_top_of_page_question.pdf")
    doc.save(doc_path)
    gt = {"id": "test_31", "category": "Boundary Cases", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_31_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_32():
    """Test 32: Question at the Very Bottom of Page (y = 780 pt)"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "BOTTOM MARGIN STRESS TEST")
    page.insert_text(fitz.Point(50, y), "1. Standard question in middle of page.", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Opt 1   (B) Opt 2   (C) Opt 3   (D) Opt 4", fontsize=9.5, fontname="helv")
    
    # Question placed at bottom margin
    y = 760
    page.insert_text(fitz.Point(50, y), "2. Bottom-most question right before edge:", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Option A   (B) Option B   (C) Option C   (D) Option D", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_32_bottom_of_page_question.pdf")
    doc.save(doc_path)
    gt = {"id": "test_32", "category": "Boundary Cases", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_32_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_33():
    """Test 33: Dense Spacing (Tiny 6pt gap between Q1 and Q2)"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "DENSE TYPOGRAPHY TEST")
    
    # Dense Q1
    page.insert_text(fitz.Point(50, y), "1. First dense question with tight line height:", fontsize=9.5, fontname="helv")
    y += 11
    page.insert_text(fitz.Point(70, y), "(A) 100   (B) 200   (C) 300   (D) 400", fontsize=9, fontname="helv")
    y += 12  # tiny gap!
    
    # Dense Q2
    page.insert_text(fitz.Point(50, y), "2. Second dense question immediately adjacent:", fontsize=9.5, fontname="helv")
    y += 11
    page.insert_text(fitz.Point(70, y), "(A) Alpha   (B) Beta   (C) Gamma   (D) Delta", fontsize=9, fontname="helv")
    y += 12
    
    # Dense Q3
    page.insert_text(fitz.Point(50, y), "3. Third dense question without bleed:", fontsize=9.5, fontname="helv")
    y += 11
    page.insert_text(fitz.Point(70, y), "(A) True   (B) False   (C) Unknown   (D) Both", fontsize=9, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_33_dense_spacing_no_gap.pdf")
    doc.save(doc_path)
    gt = {"id": "test_33", "category": "Boundary Cases", "total_questions": 3, "expected_questions": ["1", "2", "3"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_33_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_34():
    """Test 34: Question Spanning Across Two Pages"""
    doc = create_base_doc()
    # Page 1
    p1 = doc.new_page(width=PAGE_W, height=PAGE_H)
    y1 = add_header(p1, "MULTI-PAGE CASE STUDY - PART 1")
    p1.insert_text(fitz.Point(50, y1), "1. Standard Warmup Question:", fontsize=10, fontname="helv")
    y1 += 14
    p1.insert_text(fitz.Point(70, y1), "(A) Yes   (B) No   (C) Maybe   (D) None", fontsize=9.5, fontname="helv")
    y1 += 650
    p1.insert_text(fitz.Point(50, y1), "2. A complex industrial chemical plant operates with 3 distillation columns...", fontsize=10, fontname="helv")
    
    # Page 2
    p2 = doc.new_page(width=PAGE_W, height=PAGE_H)
    y2 = 40
    p2.insert_text(fitz.Point(50, y2), "Calculate total reflux ratio and heat duty required for column C-102. [10 Marks]", fontsize=10, fontname="helv")
    y2 += 30
    p2.insert_text(fitz.Point(50, y2), "3. Explain control strategy for temperature stabilization in C-102. [6 Marks]", fontsize=10, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_34_question_spanning_two_pages.pdf")
    doc.save(doc_path)
    gt = {"id": "test_34", "category": "Boundary Cases", "total_questions": 3, "expected_questions": ["1", "2", "3"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_34_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_35():
    """Test 35: Missing Option Letters (Bullet options: - or *)"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "BULLETED OPTIONS TEST")
    
    page.insert_text(fitz.Point(50, y), "1. Which of the following are primary storage devices?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "- RAM and Cache Memory", fontsize=9.5, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(70, y), "- Hard Disk and SSD", fontsize=9.5, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(70, y), "- Optical Disk", fontsize=9.5, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(70, y), "- Magnetic Tape", fontsize=9.5, fontname="helv")
    y += 24
    
    page.insert_text(fitz.Point(50, y), "2. Identify non-volatile semiconductor memory:", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "* ROM / Flash", fontsize=9.5, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(70, y), "* DRAM", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_35_missing_option_letters.pdf")
    doc.save(doc_path)
    gt = {"id": "test_35", "category": "Boundary Cases", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_35_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_36():
    """Test 36: False Anchor Numbers Inside Sentences (Years, Counts, Dimensions)"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "HISTORY & GENERAL KNOWLEDGE - TEST 36")
    
    # In 1945... 1. What was...
    page.insert_text(fitz.Point(50, y), "In 1945, after World War 2 ended with 50 founding member nations creating the UN charter:", fontsize=9.5, fontname="helv")
    y += 16
    page.insert_text(fitz.Point(50, y), "1. Where is the permanent headquarters of the United Nations located?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Geneva   (B) New York   (C) Paris   (D) Vienna", fontsize=9.5, fontname="helv")
    y += 24
    
    page.insert_text(fitz.Point(50, y), "Section 377 of the penal code was decriminalized. In light of article 21:", fontsize=9.5, fontname="helv")
    y += 16
    page.insert_text(fitz.Point(50, y), "2. Which constitutional right protects individual privacy?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Right to Equality   (B) Right to Life & Liberty   (C) Right to Speech   (D) None", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_36_false_anchor_numbers_in_sentence.pdf")
    doc.save(doc_path)
    gt = {"id": "test_36", "category": "Boundary Cases", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_36_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_37():
    """Test 37: Big-O Complexity and Mathematical Numbers in Text"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "ALGORITHMS & COMPLEXITY - TEST 37")
    
    page.insert_text(fitz.Point(50, y), "1. For a hash table with load factor alpha = 0.5, lookup time is O(1) average. Find worst-case:", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) O(1)   (B) O(log n)   (C) O(n)   (D) O(n log n)", fontsize=9.5, fontname="helv")
    y += 24
    
    page.insert_text(fitz.Point(50, y), "2. Solve recurrence relation T(n) = 2*T(n/2) + n using Master Theorem Case 2:", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Theta(n)   (B) Theta(n log n)   (C) Theta(n^2)   (D) Theta(1)", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_37_big_o_and_math_numbers.pdf")
    doc.save(doc_path)
    gt = {"id": "test_37", "category": "Boundary Cases", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_37_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_38():
    """Test 38: Erratic Whitespace and Blank Lines"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "ERRATIC WHITESPACE TEST")
    
    page.insert_text(fitz.Point(50, y), "1. What is the powerhouse of the cell?", fontsize=10, fontname="helv")
    y += 40  # large gap
    page.insert_text(fitz.Point(70, y), "(A) Nucleus", fontsize=9.5, fontname="helv")
    y += 25
    page.insert_text(fitz.Point(70, y), "(B) Mitochondria", fontsize=9.5, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(70, y), "(C) Golgi body   (D) Ribosome", fontsize=9.5, fontname="helv")
    y += 50
    
    page.insert_text(fitz.Point(50, y), "2. Plant cell walls are primarily composed of:", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Cellulose   (B) Chitin   (C) Peptidoglycan   (D) Lipid", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_38_empty_lines_and_whitespace.pdf")
    doc.save(doc_path)
    gt = {"id": "test_38", "category": "Boundary Cases", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_38_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_39():
    """Test 39: Indented Anchors with Wrapped Body Lines"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "INDENTED ANCHORS TEST")
    
    # Indented question
    page.insert_text(fitz.Point(80, y), "1. Explain the working principle of a 4-stroke internal combustion diesel engine.", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(95, y), "Discuss suction, compression, power, and exhaust strokes with P-V indicator diagram. [10 Marks]", fontsize=9.5, fontname="helv")
    y += 30
    
    page.insert_text(fitz.Point(80, y), "2. Compare Otto cycle and Diesel cycle efficiency on basis of compression ratio. [6 Marks]", fontsize=10, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_39_skewed_indented_anchors.pdf")
    doc.save(doc_path)
    gt = {"id": "test_39", "category": "Boundary Cases", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_39_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_40():
    """Test 40: Single Complex Question Taking the Entire Page"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "CASE STUDY EXAMINATION - SINGLE QUESTION")
    
    page.insert_text(fitz.Point(50, y), "1. COMPREHENSIVE SOFTWARE ARCHITECTURE CASE STUDY:", fontsize=11, fontname="hebo")
    y += 18
    text = (
        "Design an end-to-end distributed, fault-tolerant payment gateway processing 100,000 transactions per second (TPS). "
        "Your design must address:\n"
        "a) High availability across multi-region data centers (Active-Active configuration).\n"
        "b) Strict idempotency and double-spend prevention using distributed consensus.\n"
        "c) Low latency tokenization and PCI-DSS compliance.\n"
        "d) Real-time fraud detection pipeline using streaming analytics.\n"
        "e) Disaster recovery and zero-data-loss database replication architecture.\n\n"
        "Provide detailed component architecture diagrams, API sequence diagrams, database schema designs, "
        "and failure recovery protocols. [Total: 25 Marks]"
    )
    page.insert_textbox(fitz.Rect(50, y, PAGE_W - 50, y + 250), text, fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_40_single_question_full_page.pdf")
    doc.save(doc_path)
    gt = {"id": "test_40", "category": "Boundary Cases", "total_questions": 1, "expected_questions": ["1"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_40_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

# ==============================================================================
# CATEGORY 5: REAL-WORLD EXAM PAPER COMBINATIONS (41-50)
# ==============================================================================

def gen_test_41():
    """Test 41: University Semester Exam Format (Q1 MCQ + Q2..Q4 Theory Subquestions)"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "UNIVERSITY OF ENGINEERING & TECHNOLOGY", "B.TECH END-SEMESTER EXAM - COMPUTER NETWORKS")
    
    page.insert_text(fitz.Point(50, y), "Q.1 Choose the correct option: [14 Marks]", fontsize=10, fontname="hebo")
    y += 14
    page.insert_text(fitz.Point(60, y), "1. Which layer of OSI model performs routing? (a) Physical (b) Network (c) Transport (d) Session", fontsize=9, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(60, y), "2. IPv4 address is how many bits in length? (a) 16 (b) 32 (c) 64 (d) 128", fontsize=9, fontname="helv")
    y += 18
    
    page.insert_text(fitz.Point(50, y), "Q.2 Answer any two of the following:", fontsize=10, fontname="hebo")
    y += 14
    page.insert_text(fitz.Point(60, y), "a) Explain distance vector routing algorithm and count-to-infinity problem. [4]", fontsize=9, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(60, y), "b) Differentiate between TCP and UDP with header formats. [4]", fontsize=9, fontname="helv")
    y += 18
    
    page.insert_text(fitz.Point(50, y), "Q.3 Answer any two of the following:", fontsize=10, fontname="hebo")
    y += 14
    page.insert_text(fitz.Point(60, y), "a) What is CSMA/CD? Explain backoff algorithm. [4]", fontsize=9, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(60, y), "b) Explain Three-Way Handshake mechanism in TCP connection establishment. [4]", fontsize=9, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_41_university_semester_format.pdf")
    doc.save(doc_path)
    gt = {"id": "test_41", "category": "Real-World Formats", "total_questions": 6, "expected_questions": ["1", "2", "2(a)", "2(b)", "3(a)", "3(b)"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_41_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_42():
    """Test 42: JEE Advanced Multiple Sections (Single Choice & Multiple Choice)"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "JEE ADVANCED SIMULATION", "PAPER 1 - PHYSICS")
    
    page.insert_text(fitz.Point(50, y), "SECTION 1 (One or More than One Correct Type) [+4, -2]", fontsize=9.5, fontname="hebo")
    y += 16
    page.insert_text(fitz.Point(50, y), "1. For a particle executing simple harmonic motion (SHM):", fontsize=10, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(70, y), "(A) Acceleration is maximum at extreme positions.   (B) Velocity is maximum at mean position.", fontsize=8.5, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(70, y), "(C) Total energy is conserved.                      (D) Kinetic energy is constant.", fontsize=8.5, fontname="helv")
    y += 20
    
    page.insert_text(fitz.Point(50, y), "2. In an ideal gas undergoing adiabatic expansion:", fontsize=10, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(70, y), "(A) Temperature decreases.   (B) Internal energy decreases.", fontsize=8.5, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(70, y), "(C) Work is positive.        (D) Heat absorbed is zero.", fontsize=8.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_42_jee_advanced_format.pdf")
    doc.save(doc_path)
    gt = {"id": "test_42", "category": "Real-World Formats", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_42_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_43():
    """Test 43: GATE CS Examination Format (1-mark & 2-mark)"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "GATE CS/IT EXAMINATION", "COMPUTER SCIENCE & INFORMATION TECHNOLOGY")
    
    page.insert_text(fitz.Point(50, y), "Q.1 - Q.2 Carry 1 Mark Each:", fontsize=9.5, fontname="hebo")
    y += 14
    page.insert_text(fitz.Point(50, y), "Q.1 Which of the following problems is undecidable?", fontsize=10, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(70, y), "(A) Halting problem of Turing machine   (B) Membership in regular language", fontsize=8.5, fontname="helv")
    y += 11
    page.insert_text(fitz.Point(70, y), "(C) Emptiness of DFA                    (D) Equivalence of two DFAs", fontsize=8.5, fontname="helv")
    y += 20
    
    page.insert_text(fitz.Point(50, y), "Q.2 The minimum number of page frames needed for a process is determined by:", fontsize=10, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(70, y), "(A) Instruction set architecture   (B) Page size   (C) Physical memory   (D) OS version", fontsize=8.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_43_gate_cs_format.pdf")
    doc.save(doc_path)
    gt = {"id": "test_43", "category": "Real-World Formats", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_43_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_44():
    """Test 44: NEET Medical Exam Format (Botany & Zoology)"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "NATIONAL ELIGIBILITY CUM ENTRANCE TEST (NEET-UG)", "SECTION: BIOLOGY")
    
    page.insert_text(fitz.Point(50, y), "1. Which plant hormone promotes cell division and delay of leaf senescence?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(1) Auxin   (2) Cytokinin   (3) Gibberellin   (4) Abscisic acid", fontsize=9.5, fontname="helv")
    y += 24
    
    page.insert_text(fitz.Point(50, y), "2. The site of aerobic cellular respiration in eukaryotic cells is:", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(1) Ribosome   (2) Chloroplast   (3) Mitochondria   (4) Lysosome", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_44_neet_medical_format.pdf")
    doc.save(doc_path)
    gt = {"id": "test_44", "category": "Real-World Formats", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_44_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_45():
    """Test 45: UPSC Civil Services Multi-Statement Format"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "CIVIL SERVICES PRELIMINARY EXAMINATION", "GENERAL STUDIES PAPER - I")
    
    page.insert_text(fitz.Point(50, y), "1. With reference to the Indian economy, consider the following statements:", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(65, y), "1. Repo rate is the rate at which RBI lends money to commercial banks.", fontsize=9, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(65, y), "2. An increase in repo rate usually curbs inflation.", fontsize=9, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(50, y), "Which of the statements given above is/are correct?", fontsize=9.5, fontname="hebo")
    y += 14
    page.insert_text(fitz.Point(70, y), "(a) 1 only   (b) 2 only   (c) Both 1 and 2   (d) Neither 1 nor 2", fontsize=9.5, fontname="helv")
    y += 24
    
    page.insert_text(fitz.Point(50, y), "2. Which constitutional amendment introduced the Goods and Services Tax (GST)?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(a) 100th Amendment   (b) 101st Amendment   (c) 102nd Amendment   (d) 103rd Amendment", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_45_upsc_prelims_format.pdf")
    doc.save(doc_path)
    gt = {"id": "test_45", "category": "Real-World Formats", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_45_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_46():
    """Test 46: CBSE Board Examination Format (1M, 3M, 5M marks tags)"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "CENTRAL BOARD OF SECONDARY EDUCATION", "CLASS XII - PHYSICS THEORY")
    
    page.insert_text(fitz.Point(50, y), "1. Define electric dipole moment and write its SI unit. [1 Mark]", fontsize=10, fontname="helv")
    y += 20
    page.insert_text(fitz.Point(50, y), "2. State Gauss's Law in electrostatics. Using it, find the electric field due to an infinitely long straight wire. [3 Marks]", fontsize=10, fontname="helv")
    y += 26
    page.insert_text(fitz.Point(50, y), "3. Derive mirror formula for a concave mirror forming a real image. Draw ray diagram. [5 Marks]", fontsize=10, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_46_cbse_board_format.pdf")
    doc.save(doc_path)
    gt = {"id": "test_46", "category": "Real-World Formats", "total_questions": 3, "expected_questions": ["1", "2", "3"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_46_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_47():
    """Test 47: Mixed MCQ and Theory on the Same Page"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "INFORMATION SECURITY - MIXED FORMAT")
    
    page.insert_text(fitz.Point(50, y), "PART A: Objective Questions", fontsize=10, fontname="hebo")
    y += 16
    page.insert_text(fitz.Point(50, y), "1. Key length in standard AES encryption can be:", fontsize=9.5, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(70, y), "(A) 64, 128, 256 bits   (B) 128, 192, 256 bits   (C) 56 bits   (D) 512 bits", fontsize=9, fontname="helv")
    y += 22
    
    page.insert_text(fitz.Point(50, y), "PART B: Descriptive Questions", fontsize=10, fontname="hebo")
    y += 16
    page.insert_text(fitz.Point(50, y), "2. Explain RSA asymmetric encryption algorithm with a numeric example key generation. [8 Marks]", fontsize=9.5, fontname="helv")
    y += 22
    page.insert_text(fitz.Point(50, y), "3. Describe Diffie-Hellman Key Exchange algorithm and Man-In-The-Middle attack on it. [8 Marks]", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_47_mixed_mcq_theory_same_page.pdf")
    doc.save(doc_path)
    gt = {"id": "test_47", "category": "Real-World Formats", "total_questions": 3, "expected_questions": ["1", "2", "3"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_47_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_48():
    """Test 48: Exam Paper with Diagonal Background Watermark"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    
    # Background watermark text
    page.insert_text(fitz.Point(120, 450), "CONFIDENTIAL - SAMPLE", fontsize=38, fontname="hebo", color=(0.92, 0.92, 0.92))
    
    y = add_header(page, "WATERMARKED EXAMINATION PAPER")
    page.insert_text(fitz.Point(50, y), "1. Which protocol is used for secure remote login across networks?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) Telnet   (B) SSH   (C) FTP   (D) SMTP", fontsize=9.5, fontname="helv")
    y += 24
    
    page.insert_text(fitz.Point(50, y), "2. What is the default port for SSH protocol?", fontsize=10, fontname="helv")
    y += 14
    page.insert_text(fitz.Point(70, y), "(A) 21   (B) 22   (C) 23   (D) 25", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_48_paper_with_watermark.pdf")
    doc.save(doc_path)
    gt = {"id": "test_48", "category": "Real-World Formats", "total_questions": 2, "expected_questions": ["1", "2"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_48_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_49():
    """Test 49: Multi-Subject Combined Paper (Physics, Chemistry, Maths)"""
    doc = create_base_doc()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = add_header(page, "COMBINED SCIENCE SCHOLARSHIP EXAM")
    
    page.insert_text(fitz.Point(50, y), "SUBJECT 1: PHYSICS", fontsize=10, fontname="hebo")
    y += 14
    page.insert_text(fitz.Point(50, y), "1. Work done by friction on a moving object is usually:", fontsize=9.5, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(70, y), "(A) Positive   (B) Negative   (C) Zero   (D) Infinite", fontsize=9, fontname="helv")
    y += 20
    
    page.insert_text(fitz.Point(50, y), "SUBJECT 2: CHEMISTRY", fontsize=10, fontname="hebo")
    y += 14
    page.insert_text(fitz.Point(50, y), "2. Avogadro's number is equal to:", fontsize=9.5, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(70, y), "(A) 6.022 x 10^23   (B) 6.022 x 10^22   (C) 3 x 10^8   (D) 1.6 x 10^-19", fontsize=9, fontname="helv")
    y += 20
    
    page.insert_text(fitz.Point(50, y), "SUBJECT 3: MATHEMATICS", fontsize=10, fontname="hebo")
    y += 14
    page.insert_text(fitz.Point(50, y), "3. The roots of quadratic equation x^2 - 5x + 6 = 0 are:", fontsize=9.5, fontname="helv")
    y += 12
    page.insert_text(fitz.Point(70, y), "(A) 2 and 3   (B) -2 and -3   (C) 1 and 6   (D) 0 and 5", fontsize=9, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_49_multi_subject_single_paper.pdf")
    doc.save(doc_path)
    gt = {"id": "test_49", "category": "Real-World Formats", "total_questions": 3, "expected_questions": ["1", "2", "3"], "pdf_path": doc_path}
    with open(os.path.join(SYNTHETIC_DIR, "test_49_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def gen_test_50():
    """Test 50: Comprehensive Maximum Stress Combination (Multi-Page, Multi-Column, Tables, Diagrams, Shared Passage)"""
    doc = create_base_doc()
    
    # Page 1: Header + Instructions + Passage + 2 Questions
    p1 = doc.new_page(width=PAGE_W, height=PAGE_H)
    y1 = add_header(p1, "ADVANCED ENGINEERING APTITUDE ASSESSMENT", "NATIONAL LEVEL COMPETITIVE EXAMINATION")
    y1 = add_instructions_block(p1, y1, [
        "Section I contains Passage Analysis. Section II contains System Design.",
        "Zero bleed tolerance between consecutive question boundaries.",
        "Darken correct options in OMR answer sheet."
    ])
    
    p1.insert_text(fitz.Point(50, y1), "Read the case scenario and answer Questions 1 and 2:", fontsize=9.5, fontname="hebo")
    y1 += 12
    p1.draw_rect(fitz.Rect(50, y1, PAGE_W - 50, y1 + 45), color=(0.5, 0.5, 0.5), width=0.5)
    p1.insert_textbox(fitz.Rect(55, y1 + 4, PAGE_W - 55, y1 + 40), "Autonomous vehicles rely on sensor fusion combining LiDAR, radar, and vision cameras. LiDAR provides dense 3D point clouds with millimeter depth accuracy under clear weather.", fontsize=8.5, fontname="helv")
    y1 += 55
    
    p1.insert_text(fitz.Point(50, y1), "1. Which sensor provides millimeter 3D depth point clouds?", fontsize=9.5, fontname="helv")
    y1 += 12
    p1.insert_text(fitz.Point(70, y1), "(A) Vision Camera   (B) LiDAR   (C) Ultrasonic   (D) GPS", fontsize=9, fontname="helv")
    y1 += 20
    
    p1.insert_text(fitz.Point(50, y1), "2. Sensor fusion combines multiple sensor modalities primarily to:", fontsize=9.5, fontname="helv")
    y1 += 12
    p1.insert_text(fitz.Point(70, y1), "(A) Increase power consumption   (B) Enhance perception robustness   (C) Replace CPU   (D) Reduce cost", fontsize=9, fontname="helv")
    
    # Page 2: Diagram + Table + Theory Question
    p2 = doc.new_page(width=PAGE_W, height=PAGE_H)
    y2 = add_header(p2, "SECTION II: HARDWARE & CIRCUITS")
    
    p2.insert_text(fitz.Point(50, y2), "3. In the feedback operational amplifier circuit below:", fontsize=9.5, fontname="helv")
    y2 += 12
    # Draw Op-Amp schematic
    p2.draw_rect(fitz.Rect(100, y2, 220, y2 + 45), color=(0, 0, 0), fill=(0.95, 0.95, 0.95), width=0.8)
    p2.insert_text(fitz.Point(135, y2 + 25), "[ OP-AMP (LM741) ]", fontsize=8.5, fontname="hebo")
    y2 += 55
    p2.insert_text(fitz.Point(70, y2), "(A) Non-inverting Amplifier   (B) Inverting Amplifier   (C) Integrator   (D) Differentiator", fontsize=9, fontname="helv")
    y2 += 24
    
    p2.insert_text(fitz.Point(50, y2), "4. Explain Kalman Filter state estimation equations for vehicle localization. [10 Marks]", fontsize=9.5, fontname="helv")

    doc_path = os.path.join(SYNTHETIC_DIR, "test_50_maximum_stress_combination.pdf")
    doc.save(doc_path)
    gt = {
        "id": "test_50",
        "category": "Maximum Stress Combination",
        "total_questions": 4,
        "expected_questions": ["1", "2", "3", "4"],
        "has_shared_context": True,
        "shared_context_for": ["1", "2"],
        "has_diagram": [3],
        "pdf_path": doc_path
    }
    with open(os.path.join(SYNTHETIC_DIR, "test_50_ground_truth.json"), "w") as f:
        json.dump(gt, f, indent=2)

def generate_all_test_cases():
    print("Generating 50 synthetic test cases...")
    generators = [
        gen_test_01, gen_test_02, gen_test_03, gen_test_04, gen_test_05,
        gen_test_06, gen_test_07, gen_test_08, gen_test_09, gen_test_10,
        gen_test_11, gen_test_12, gen_test_13, gen_test_14, gen_test_15,
        gen_test_16, gen_test_17, gen_test_18, gen_test_19, gen_test_20,
        gen_test_21, gen_test_22, gen_test_23, gen_test_24, gen_test_25,
        gen_test_26, gen_test_27, gen_test_28, gen_test_29, gen_test_30,
        gen_test_31, gen_test_32, gen_test_33, gen_test_34, gen_test_35,
        gen_test_36, gen_test_37, gen_test_38, gen_test_39, gen_test_40,
        gen_test_41, gen_test_42, gen_test_43, gen_test_44, gen_test_45,
        gen_test_46, gen_test_47, gen_test_48, gen_test_49, gen_test_50
    ]
    for i, gen_fn in enumerate(generators, 1):
        gen_fn()
        print(f"  [OK] Generated Test Case {i:02d}/50: {gen_fn.__name__}")
    print(f"\nAll 50 test cases successfully generated in: {SYNTHETIC_DIR}")
    
    manifest = []
    for i in range(1, 51):
        gt_path = os.path.join(SYNTHETIC_DIR, f"test_{i:02d}_ground_truth.json")
        if os.path.exists(gt_path):
            with open(gt_path, "r", encoding="utf-8") as f:
                gt = json.load(f)
            manifest.append({
                "name": os.path.basename(gt.get("pdf_path", f"test_{i:02d}")).replace(".pdf", ""),
                "pdf_path": gt.get("pdf_path"),
                "ground_truth": gt,
                "category": gt.get("category", "General")
            })
    return manifest

if __name__ == "__main__":
    generate_all_test_cases()


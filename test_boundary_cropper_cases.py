import os
import sys
import fitz  # PyMuPDF
from PIL import Image, ImageDraw, ImageFont

# Set up test PDF file
TEST_PDF_PATH = "test_exam_paper_sample.pdf"
OUTPUT_DIR = "test_crop_output"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def create_sample_exam_pdf():
    doc = fitz.open()
    page = doc.new_page(width=595, height=842) # Standard A4
    
    # Header
    page.insert_text((50, 40), "ALL INDIA COMPETITIVE EXAMINATION 2026", fontsize=14, fontname="helv")
    page.insert_text((50, 60), "Time: 3 Hours | Subject: Advanced Engineering Physics | Max Marks: 100", fontsize=10, fontname="helv")
    page.draw_line((50, 70), (545, 70))
    
    # Question 1 (MCQ)
    page.insert_text((50, 100), "Q.1 A parallel plate capacitor with air between the plates has a capacitance of 8 pF.", fontsize=11, fontname="helv")
    page.insert_text((50, 115), "    What will be the capacitance if the distance between the plates is reduced by half?", fontsize=11, fontname="helv")
    page.insert_text((70, 135), "(A) 16 pF", fontsize=10, fontname="helv")
    page.insert_text((200, 135), "(B) 4 pF", fontsize=10, fontname="helv")
    page.insert_text((320, 135), "(C) 8 pF", fontsize=10, fontname="helv")
    page.insert_text((440, 135), "(D) 32 pF", fontsize=10, fontname="helv")
    page.draw_rect(fitz.Rect(50, 90, 545, 155), color=(0.8, 0.8, 0.8), width=0.5)

    # Question 2 (Theory + Equation)
    page.insert_text((50, 180), "Q.2 State Schrödinger's time-independent wave equation for a free particle in 1-D box. [5 Marks]", fontsize=11, fontname="helv")
    page.insert_text((70, 200), "    d^2 psi / dx^2 + (8 * pi^2 * m / h^2) * (E - V) * psi = 0", fontsize=10, fontname="helv")
    page.insert_text((50, 220), "    Derive the quantized energy eigen-values E_n = (n^2 * h^2) / (8 * m * L^2).", fontsize=11, fontname="helv")
    page.draw_rect(fitz.Rect(50, 170, 545, 235), color=(0.8, 0.8, 0.8), width=0.5)

    # Question 3 (Circuit / Numerical)
    page.insert_text((50, 260), "Q.3 In a series L-C-R circuit with L = 2.0 H, C = 32 microFarad, and R = 10 Ohm: [5 Marks]", fontsize=11, fontname="helv")
    page.insert_text((70, 280), "(i) Determine the resonant angular frequency omega_0.", fontsize=10, fontname="helv")
    page.insert_text((70, 295), "(ii) Calculate the Quality Factor (Q) of the circuit at resonance.", fontsize=10, fontname="helv")
    page.draw_rect(fitz.Rect(50, 250, 545, 310), color=(0.8, 0.8, 0.8), width=0.5)

    # Question 4 (Multi-choice)
    page.insert_text((50, 335), "Q.4 Which of the following principles is utilized in optical fiber communication?", fontsize=11, fontname="helv")
    page.insert_text((70, 355), "(A) Total Internal Reflection", fontsize=10, fontname="helv")
    page.insert_text((70, 370), "(B) Optical Dispersion", fontsize=10, fontname="helv")
    page.insert_text((70, 385), "(C) Diffraction of Light", fontsize=10, fontname="helv")
    page.insert_text((70, 400), "(D) Polarization by Reflection", fontsize=10, fontname="helv")
    page.draw_rect(fitz.Rect(50, 325, 545, 415), color=(0.8, 0.8, 0.8), width=0.5)

    doc.save(TEST_PDF_PATH)
    doc.close()
    print(f"[PDF CREATED] Generated test paper PDF: {TEST_PDF_PATH}")

def test_boundary_detection_and_crop():
    print("\n--- Running Boundary Detection & Question Crop Test ---")
    doc = fitz.open(TEST_PDF_PATH)
    page = doc[0]
    
    # Render at 300 DPI (standard high-res)
    zoom = 300.0 / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    
    # Extract text blocks with bounding boxes
    text_page = page.get_text("blocks")
    questions = []
    
    # Detect question anchors (Q.1, Q.2, Q.3, Q.4)
    import re
    q_pattern = re.compile(r"^\s*Q\.?\s*(\d+)", re.IGNORECASE)
    
    for block in text_page:
        bbox = block[:4] # (x0, y0, x1, y1)
        text = block[4]
        match = q_pattern.search(text.strip())
        if match:
            q_num = match.group(1)
            questions.append({
                "number": q_num,
                "bbox_pt": bbox,
                "text": text.strip()
            })
            
    print(f"Detected {len(questions)} Question Anchors:")
    for q in questions:
        print(f"  - Q.{q['number']}: y0={q['bbox_pt'][1]:.1f}pt, y1={q['bbox_pt'][3]:.1f}pt -> {q['text'][:50]}...")
        
    # Crop each question with strict non-bleed boundary logic
    PT_TO_PX = zoom
    results = []
    
    for i, q in enumerate(questions):
        y_start_pt = max(0, q["bbox_pt"][1] - 8)
        if i + 1 < len(questions):
            # Strict stop before next question start
            y_end_pt = questions[i + 1]["bbox_pt"][1] - 10
        else:
            # Last question
            y_end_pt = q["bbox_pt"][3] + 40
            
        y0_px = int(y_start_pt * PT_TO_PX)
        y1_px = int(y_end_pt * PT_TO_PX)
        x0_px = int(30 * PT_TO_PX)
        x1_px = int(565 * PT_TO_PX)
        
        # Bounding box crop
        crop_img = img.crop((x0_px, y0_px, x1_px, y1_px))
        crop_filename = f"{OUTPUT_DIR}/question_Q{q['number']}_crop.png"
        crop_img.save(crop_filename)
        
        print(f"  [CROP SAVED] Q.{q['number']}: bbox=({x0_px}, {y0_px}, {x1_px}, {y1_px}) -> {crop_filename} ({crop_img.width}x{crop_img.height}px)")
        results.append({
            "question": q["number"],
            "status": "PASS",
            "dimensions": f"{crop_img.width}x{crop_img.height}px",
            "file": crop_filename
        })
        
    doc.close()
    return results

if __name__ == "__main__":
    create_sample_exam_pdf()
    results = test_boundary_detection_and_crop()
    print("\n--- Summary of Boundary Cropping Tests ---")
    for r in results:
        print(f"  Question {r['question']}: STATUS={r['status']} | Output={r['file']} | Size={r['dimensions']}")


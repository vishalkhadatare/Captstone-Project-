#!/usr/bin/env python3
import sys
import os
import json

try:
    import fitz
except ImportError:
    try:
        import pymupdf as fitz
    except ImportError:
        print(json.dumps({"error": "PyMuPDF not installed"}))
        sys.exit(1)

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: renderPdfPages.py <pdf_path> <output_dir> [dpi] [max_pages]"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_dir = sys.argv[2]
    dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 130
    max_pages = int(sys.argv[4]) if len(sys.argv) > 4 else 10

    if not os.path.exists(pdf_path):
        print(json.dumps({"error": f"PDF not found: {pdf_path}"}))
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    try:
        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        pages_to_render = min(total_pages, max_pages)
        image_paths = []

        for i in range(pages_to_render):
            page = doc[i]
            pix = page.get_pixmap(dpi=dpi)
            out_name = f"page_{i+1}.png"
            out_path = os.path.join(output_dir, out_name)
            pix.save(out_path)
            image_paths.append(out_path)

        print(json.dumps({
            "success": True,
            "totalPages": total_pages,
            "renderedPages": pages_to_render,
            "images": image_paths
        }))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()


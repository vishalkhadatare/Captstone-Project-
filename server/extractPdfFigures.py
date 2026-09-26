#!/usr/bin/env python3
"""Crop the figures a question paper already contains, so they can be reused.

The examiner's rule is that a diagram is never redrawn, approximated, replaced
with Mermaid/ASCII or described in prose: the original visual is a fixed asset.
That means the asset has to come out of the source PDF as pixels.

How a figure is told apart from text
------------------------------------
Most papers reach us as vectors. The examiner's own uploads carry no text layer
at all - every letter of every paragraph is a filled outline, so a naive
"cluster the drawings" pass returns paragraphs and calls them figures.

The discriminator is stroke size. A letter outline is a few points across; a
diagram is built from strokes that are tens of points long - box sides, arrows,
Gantt bars, table rules. So only drawings with a side of at least `MIN_STROKE`
are considered, which makes the text of a page disappear and leaves the actual
visual objects. What survives is then merged (one diagram arrives as dozens of
paths) and filtered against page furniture.

Page-furniture filters: a band across the page is the running head, the seat
number rule or the header box, not a figure, and a cluster with only a stroke or
two is a separator.

Usage: extractPdfFigures.py <pdf_path> <output_dir> [max_figures] [dpi]
Prints a JSON object on stdout.
"""

import json
import os
import sys

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover - alternate distribution name
    try:
        import pymupdf as fitz
    except ImportError:
        print(json.dumps({"error": "PyMuPDF not installed"}))
        sys.exit(1)


# A glyph outline is well under this; a diagram stroke is well over it.
MIN_STROKE = 18.0
# A cluster needs at least this many strokes to be a picture rather than a rule.
MIN_STROKES = 3
# Strokes this close together belong to the same picture. A table drawn with rules
# spaces its rows ~12pt apart, so a smaller gap would split a table into one
# single-rule "figure" per row.
MERGE_GAP = 16.0
# Crops smaller than this share of the page are noise; larger than the maximum
# is the page itself.
MIN_AREA_RATIO = 0.004
MAX_AREA_RATIO = 0.75
# A cluster wider than this and this shallow is page furniture.
BAND_WIDTH_RATIO = 0.8
BAND_MAX_HEIGHT = 70.0
# Raster images are unambiguous, but a page-filling one is the page scan itself.
MIN_RASTER_AREA_RATIO = 0.01
MAX_RASTER_AREA_RATIO = 0.70


def _as_rect(value):
    """Normalise whatever PyMuPDF hands back into a Rect."""
    if hasattr(value, "is_empty"):
        return value
    if isinstance(value, (list, tuple)) and len(value) == 4:
        return fitz.Rect(value[0], value[1], value[2], value[3])
    return None


def _expand(rect, gap):
    return fitz.Rect(rect.x0 - gap, rect.y0 - gap, rect.x1 + gap, rect.y1 + gap)


def _union(a, b):
    """Smallest rectangle containing both.

    `Rect.__or__` is unusable here for the same reason as `intersects`: the
    union of two zero-height rules would collapse to a rule instead of the band
    the rules together describe.
    """
    return fitz.Rect(
        min(a.x0, b.x0), min(a.y0, b.y0), max(a.x1, b.x1), max(a.y1, b.y1)
    )


def _overlaps(a, b, gap):
    """True when the two rectangles touch within `gap`.

    PyMuPDF's own `Rect.intersects` reports False as soon as either rectangle is
    empty, and a printed rule is exactly that - zero height. Using it here would
    drop every table drawn with rules, which is how these papers draw tables.
    """
    return not (
        a.x1 + gap < b.x0
        or b.x1 + gap < a.x0
        or a.y1 + gap < b.y0
        or b.y1 + gap < a.y0
    )


def merge_rects(rects, gap=MERGE_GAP):
    """Union rectangles that touch or sit within `gap` of each other.

    A single diagram arrives as dozens of separate paths - one per box, arrow
    and bar - so without merging, every arrowhead would be cropped on its own.
    """
    merged = list(rects)
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


def is_page_band(rect, page_rect):
    """True for the running head, the header box and other full-width strips."""
    width_ratio = rect.width / max(page_rect.width, 1)
    if width_ratio >= BAND_WIDTH_RATIO and rect.height <= BAND_MAX_HEIGHT:
        return True
    # Anything hugging the very top or bottom edge of the page is furniture.
    if rect.y1 <= page_rect.y0 + 0.09 * page_rect.height and width_ratio >= 0.5:
        return True
    if rect.y0 >= page_rect.y1 - 0.06 * page_rect.height and width_ratio >= 0.5:
        return True
    return False


def is_hairline(rect, page_rect):
    """A rule drawn across or down the page separates content; it is not a figure."""
    if rect.height <= 2.5 and rect.width / max(page_rect.width, 1) >= 0.55:
        return True
    if rect.width <= 2.5 and rect.height / max(page_rect.height, 1) >= 0.55:
        return True
    return False


def diagram_strokes(page, page_rect):
    """Drawings big enough to be part of a picture rather than of a letter."""
    try:
        drawings = page.get_drawings()
    except Exception:
        return []

    strokes = []
    for drawing in drawings:
        rect = _as_rect(drawing.get("rect"))
        # Note: a printed rule has zero height, which PyMuPDF reports as an
        # "empty" rect. Rejecting those here would silently drop every table
        # drawn with rules, which is how these papers draw their tables.
        if rect is None or (rect.width <= 0 and rect.height <= 0):
            continue
        if is_hairline(rect, page_rect):
            continue
        if rect.width < MIN_STROKE and rect.height < MIN_STROKE:
            continue
        if abs(rect.get_area()) / max(abs(page_rect.get_area()), 1) > 0.9:
            continue
        strokes.append(rect)
    return strokes


def vector_figures(page, page_rect):
    strokes = diagram_strokes(page, page_rect)
    if len(strokes) < MIN_STROKES:
        return []

    candidates = []
    for cluster in merge_rects(strokes):
        if is_page_band(cluster, page_rect):
            continue
        area_ratio = abs(cluster.get_area()) / max(abs(page_rect.get_area()), 1)
        if area_ratio < MIN_AREA_RATIO or area_ratio > MAX_AREA_RATIO:
            continue
        inside = sum(1 for rect in strokes if _overlaps(rect, cluster, 2.0))
        if inside < MIN_STROKES:
            continue
        candidates.append(cluster)
    return candidates


def raster_figures(page, page_rect):
    candidates = []
    try:
        images = page.get_images(full=True)
    except Exception:
        return candidates

    for image in images:
        xref = image[0]
        try:
            placements = page.get_image_rects(xref)
        except Exception:
            continue
        for placement in placements:
            rect = _as_rect(placement)
            if rect is None or rect.width <= 0 or rect.height <= 0:
                continue
            ratio = abs(rect.get_area()) / max(abs(page_rect.get_area()), 1)
            if ratio < MIN_RASTER_AREA_RATIO or ratio > MAX_RASTER_AREA_RATIO:
                continue
            candidates.append(rect)
    return candidates


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: extractPdfFigures.py <pdf_path> <output_dir> [max_figures] [dpi]"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_dir = sys.argv[2]
    max_figures = int(sys.argv[3]) if len(sys.argv) > 3 else 12
    dpi = int(sys.argv[4]) if len(sys.argv) > 4 else 200

    if not os.path.exists(pdf_path):
        print(json.dumps({"error": "PDF not found: %s" % pdf_path}))
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    figures = []
    warnings = []

    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:
        print(json.dumps({"error": "Could not open PDF: %s" % exc}))
        sys.exit(1)

    try:
        for page_index in range(len(doc)):
            if len(figures) >= max_figures:
                warnings.append("Stopped after %d figure(s); the source paper contains more." % len(figures))
                break

            page = doc[page_index]
            page_rect = page.rect

            candidates = [(rect, "raster") for rect in raster_figures(page, page_rect)]
            candidates += [(rect, "vector-region") for rect in vector_figures(page, page_rect)]
            candidates.sort(key=lambda item: (round(item[0].y0, 1), round(item[0].x0, 1)))

            seen = []
            for rect, kind in candidates:
                if len(figures) >= max_figures:
                    break
                clip = fitz.Rect(rect) & page_rect
                if clip.width < 24 or clip.height < 16:
                    continue
                # A raster image and the vector frame drawn around it describe the
                # same picture; keep the larger one rather than both.
                if any(_overlaps(clip, existing, 4.0) for existing in seen):
                    continue
                try:
                    pixmap = page.get_pixmap(dpi=dpi, clip=clip)
                except Exception as exc:
                    warnings.append("Figure on page %d could not be rendered: %s" % (page_index + 1, exc))
                    continue

                seen.append(clip)
                name = "figure-%d.png" % (len(figures) + 1)
                out_path = os.path.join(output_dir, name)
                pixmap.save(out_path)
                figures.append(
                    {
                        "name": name,
                        "path": out_path,
                        "page": page_index + 1,
                        "kind": kind,
                        "width": pixmap.width,
                        "height": pixmap.height,
                        "bbox": [round(clip.x0, 1), round(clip.y0, 1), round(clip.x1, 1), round(clip.y1, 1)],
                    }
                )

        if not figures:
            warnings.append(
                "No diagram or table drawn on this paper could be separated from its text, so "
                "nothing could be reused as an image."
            )

        print(
            json.dumps(
                {
                    "success": True,
                    "totalPages": len(doc),
                    "figures": figures,
                    "warnings": warnings,
                }
            )
        )
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)
    finally:
        doc.close()


if __name__ == "__main__":
    main()

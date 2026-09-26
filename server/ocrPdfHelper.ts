import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import Tesseract from 'tesseract.js';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export interface ExtractResult {
  text: string;
  pageCount: number;
  isOcr: boolean;
  ocrMethod?: string;
  charCount: number;
  wordCount: number;
}

/**
 * Extracts text from a PDF Buffer.
 * If the PDF has digital text, it returns it instantly via pdf-parse.
 * If the PDF is a scan (empty text layer), it renders each page and runs
 * OCR (OCR.Space with automatic fallback to local Tesseract.js).
 */
export async function extractPdfTextWithOcr(
  fileBuffer: Buffer,
  fileName: string = 'document.pdf',
  maxPages: number = 8
): Promise<ExtractResult> {
  // 1. Attempt digital text extraction first
  let digitalText = '';
  let digitalPages = 1;
  try {
    const parsed = await pdfParse(fileBuffer);
    digitalText = (parsed.text || '').replace(/\r\n/g, '\n').trim();
    digitalPages = parsed.numpages || 1;
  } catch (err: any) {
    console.warn(`[OCR Engine] pdf-parse note for ${fileName}:`, err?.message || err);
  }

  // If digital text is rich (> 50 chars), return immediately
  if (digitalText.length >= 50) {
    return {
      text: digitalText,
      pageCount: digitalPages,
      isOcr: false,
      ocrMethod: 'DIGITAL_TEXT',
      charCount: digitalText.length,
      wordCount: digitalText.split(/\s+/).filter(Boolean).length,
    };
  }

  // 2. Scanned PDF detected: Run multi-page OCR
  console.log(`[OCR Engine] Scanned PDF detected (${fileName} has ${digitalText.length} chars). Triggering OCR fallback...`);

  const tmpDir = path.join(os.tmpdir(), `zeroleak_ocr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const tmpPdfPath = path.join(tmpDir, 'source.pdf');

  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(tmpPdfPath, fileBuffer);

    // Render pages to PNG using python script
    const scriptPath = path.join(process.cwd(), 'server', 'renderPdfPages.py');
    const renderRes = await new Promise<{ success: boolean; totalPages: number; images: string[] }>((resolve, reject) => {
      execFile('python', [scriptPath, tmpPdfPath, tmpDir, '130', String(maxPages)], (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        try {
          resolve(JSON.parse(stdout));
        } catch (e: any) {
          reject(new Error(`Failed to parse render output: ${stdout || e.message}`));
        }
      });
    });

    const pageImages = (renderRes?.images || []).sort();
    if (!pageImages.length) {
      throw new Error('No page images were generated from the PDF.');
    }

    let combinedText = '';
    const apiKey = process.env.OCR_SPACE_API_KEY || 'K89667280988957';
    let ocrUsed = 'OCR_SPACE';

    for (let i = 0; i < pageImages.length; i++) {
      const imgPath = pageImages[i];
      let pageText = '';

      // Try OCR.Space first (fast cloud OCR)
      try {
        const formData = new FormData();
        formData.append('apikey', apiKey);
        const imgBuffer = fs.readFileSync(imgPath);
        const blob = new Blob([imgBuffer]);
        formData.append('file', blob, path.basename(imgPath));
        formData.append('OCREngine', '2');
        formData.append('isTable', 'true');

        const ocrRes = await fetch('https://api.ocr.space/parse/image', {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(12000),
        });

        if (ocrRes.ok) {
          const data: any = await ocrRes.json();
          pageText = (data?.ParsedResults?.[0]?.ParsedText || '').trim();
        }
      } catch (cloudErr: any) {
        console.warn(`[OCR Engine] OCR.Space warning for page ${i + 1}, falling back to Tesseract:`, cloudErr?.message || cloudErr);
      }

      // If cloud OCR returned nothing or failed, use local Tesseract.js
      if (!pageText) {
        ocrUsed = 'TESSERACT_LOCAL';
        try {
          const tRes = await Tesseract.recognize(imgPath, 'eng');
          pageText = (tRes?.data?.text || '').trim();
        } catch (tErr: any) {
          console.error(`[OCR Engine] Tesseract error for page ${i + 1}:`, tErr?.message || tErr);
        }
      }

      if (pageText) {
        combinedText += `\n\n--- PAGE ${i + 1} ---\n${pageText}`;
      }
    }

    const finalText = combinedText.trim();
    return {
      text: finalText,
      pageCount: renderRes.totalPages || pageImages.length,
      isOcr: true,
      ocrMethod: ocrUsed,
      charCount: finalText.length,
      wordCount: finalText.split(/\s+/).filter(Boolean).length,
    };
  } finally {
    // Always clean up temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}


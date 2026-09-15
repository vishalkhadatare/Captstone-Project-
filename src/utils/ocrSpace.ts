/**
 * OCR.space API Integration for ZeroLeak Exam Management
 * API Key: K89667280988957 (Free Plan: 25,000 requests/month for Engine 1/2, 2,500/month for Engine 3)
 * Docs: https://ocr.space/ocrapi#selectocrengine
 */

export interface OcrSpaceOptions {
  engine?: '1' | '2' | '3';
  isTable?: boolean;
  scale?: boolean;
  detectOrientation?: boolean;
  language?: string;
  isOverlayRequired?: boolean;
  apiKey?: string;
}

export interface ParsedOcrSpaceQuestion {
  questionNumber?: number | string;
  contentText: string;
  options: Array<{ label: string; text: string }>;
  suggestedAnswer?: string;
  rawText: string;
  hasTable: boolean;
  hasDiagramOrFormula: boolean;
  tableMarkdown?: string;
  engineUsed: string;
}

const DEFAULT_API_KEY = 'K89667280988957';
const OCR_SPACE_ENDPOINT = 'https://api.ocr.space/parse/image';

/**
 * Convert Blob or File to Base64 string
 */
export async function fileOrBlobToBase64(fileOrBlob: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      resolve(res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(fileOrBlob);
  });
}

/**
 * Run OCR.space API directly on an image dataUrl, File, or Blob
 */
export async function runOcrSpace(
  imageSource: string | File | Blob,
  options: OcrSpaceOptions = {}
): Promise<{ text: string; raw: any; engine: string }> {
  const apiKey = options.apiKey || DEFAULT_API_KEY;
  const engine = options.engine || '2'; // Engine 2 is default & recommended; Engine 3 is for handwriting & tables

  let base64Image = '';
  if (typeof imageSource === 'string') {
    base64Image = imageSource;
  } else {
    base64Image = await fileOrBlobToBase64(imageSource);
  }

  // Ensure proper data URL format
  if (!base64Image.startsWith('data:')) {
    base64Image = `data:image/png;base64,${base64Image}`;
  }

  const formData = new FormData();
  formData.append('apikey', apiKey);
  formData.append('base64Image', base64Image);
  formData.append('OCREngine', engine);
  formData.append('scale', options.scale !== false ? 'true' : 'false');
  formData.append('detectOrientation', options.detectOrientation !== false ? 'true' : 'false');
  formData.append('isTable', options.isTable !== false ? 'true' : 'false');
  formData.append('language', options.language || (engine === '1' ? 'eng' : 'auto'));

  if (options.isOverlayRequired) {
    formData.append('isOverlayRequired', 'true');
  }

  try {
    const response = await fetch(OCR_SPACE_ENDPOINT, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`OCR.space HTTP error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.IsErroredOnProcessing) {
      const errorMsg = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join('; ') : (data.ErrorMessage || 'OCR processing failed');
      throw new Error(`OCR.space error: ${errorMsg}`);
    }

    const parsedResults = data.ParsedResults || [];
    const fullText = parsedResults.map((r: any) => r.ParsedText || '').join('\n').trim();

    return {
      text: fullText,
      raw: data,
      engine: `OCR.space Engine ${engine}`,
    };
  } catch (err: any) {
    console.error('OCR.space request failed:', err);
    throw err;
  }
}

/**
 * Intelligent parser to extract question statement, MCQ options (A-D or 1-4),
 * tables (Markdown format), and answer key from OCR.space output.
 */
export function parseOcrSpaceQuestion(
  rawText: string,
  engine: string = 'OCR.space Engine 2'
): ParsedOcrSpaceQuestion {
  if (!rawText || !rawText.trim()) {
    return {
      contentText: '',
      options: [],
      rawText: '',
      hasTable: false,
      hasDiagramOrFormula: false,
      engineUsed: engine,
    };
  }

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  let questionNumber: number | string | undefined = undefined;
  const contentLines: string[] = [];
  const options: Array<{ label: string; text: string }> = [];
  let suggestedAnswer: string | undefined = undefined;

  // Option regex patterns: (A), A), A., [A], (1), 1), 1., [1]
  const optionRegex = /^(?:(?:\(?([A-Da-d1-4])[\)\.]|\[([A-Da-d1-4])\]|([A-Da-d])[\:\-]))\s*(.*)/;
  
  // Question number patterns: Q.1, Q1, Question 1:, 1., 1), [1]
  const qNumRegex = /^(?:Q(?:uestion)?\.?\s*(\d+)|(\d+)[\.\)]|\[(\d+)\])\s*(.*)/i;

  let inOptionsSection = false;
  let hasTable = false;
  let hasDiagramOrFormula = false;
  const tableLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for Table formatting (| col1 | col2 | or tabular tab stops)
    if (line.includes('|') && line.split('|').length >= 3) {
      hasTable = true;
      tableLines.push(line);
      contentLines.push(line);
      continue;
    }

    // Check for LaTeX or Math symbols
    if (line.includes('$') || line.includes('\\frac') || line.includes('\\sqrt') || /[\u2200-\u22FF]/.test(line)) {
      hasDiagramOrFormula = true;
    }

    // Check Question Number on first few lines
    if (i <= 2 && !questionNumber) {
      const qMatch = line.match(qNumRegex);
      if (qMatch) {
        questionNumber = parseInt(qMatch[1] || qMatch[2] || qMatch[3], 10);
        const rest = (qMatch[4] || '').trim();
        if (rest) {
          contentLines.push(rest);
        }
        continue;
      }
    }

    // Check Answer keys (e.g. Answer: B, Ans: (C), Key: A)
    const ansMatch = line.match(/^(?:Ans(?:wer)?|Key|Correct(?:\s*Option)?|Option)[\s\:\.\-]+(?:\(?([A-Da-d1-4])\)?)/i);
    if (ansMatch) {
      const rawAns = ansMatch[1].toUpperCase();
      const numToLetter: Record<string, string> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
      suggestedAnswer = numToLetter[rawAns] || rawAns;
      continue;
    }

    // Check Option lines
    const optMatch = line.match(optionRegex);
    if (optMatch) {
      inOptionsSection = true;
      let label = (optMatch[1] || optMatch[2] || optMatch[3] || '').toUpperCase();
      // Map numerical options (1, 2, 3, 4) to (A, B, C, D)
      const numToLetter: Record<string, string> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
      if (numToLetter[label]) {
        label = numToLetter[label];
      }
      const text = (optMatch[4] || '').trim();
      options.push({ label, text });
      continue;
    }

    // Check inline multiple options like "(A) text1 (B) text2 (C) text3 (D) text4"
    const inlineOptions = line.match(/(?:\(?([A-Da-d1-4])[\)\.]|\[([A-Da-d1-4])\])\s*([^(\[A-Da-d1-4]+)/g);
    if (inlineOptions && inlineOptions.length >= 2) {
      inOptionsSection = true;
      for (const item of inlineOptions) {
        const singleMatch = item.trim().match(optionRegex);
        if (singleMatch) {
          let label = (singleMatch[1] || singleMatch[2] || singleMatch[3] || '').toUpperCase();
          const numToLetter: Record<string, string> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
          if (numToLetter[label]) label = numToLetter[label];
          const text = (singleMatch[4] || '').trim();
          options.push({ label, text });
        }
      }
      continue;
    }

    if (inOptionsSection && options.length > 0) {
      // Continuation of previous option
      options[options.length - 1].text += ' ' + line;
    } else {
      contentLines.push(line);
    }
  }

  const contentText = contentLines.join('\n').trim() || rawText;
  const tableMarkdown = hasTable ? tableLines.join('\n') : undefined;

  return {
    questionNumber,
    contentText,
    options,
    suggestedAnswer,
    rawText,
    hasTable,
    hasDiagramOrFormula,
    tableMarkdown,
    engineUsed: engine,
  };
}


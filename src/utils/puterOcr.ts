export interface PuterOcrOptions {
  provider?: 'aws-textract' | 'mistral' | 'aws' | 'textract' | 'mistral-ocr';
  testMode?: boolean;
}

export interface PuterVisionOptions {
  model?: string;
  temperature?: number;
  testMode?: boolean;
}

export interface ParsedOcrQuestion {
  questionNumber?: number | string;
  contentText: string;
  options: Array<{ label: string; text: string }>;
  suggestedAnswer?: string;
  rawText: string;
  hasTable?: boolean;
  tableMarkdown?: string;
  questionType?: 'MCQ' | 'THEORY' | 'NUMERICAL';
}

/**
 * Safely get the Puter SDK instance from window or dynamic import
 */
export async function getPuterSdk(): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).puter) {
    return (window as any).puter;
  }
  try {
    const mod = await import('@heyputer/puter.js');
    return mod.puter || mod.default || (window as any).puter;
  } catch (err) {
    console.warn('[ZeroLeak] Could not dynamically load @heyputer/puter.js:', err);
    return (typeof window !== 'undefined' && (window as any).puter) || null;
  }
}

/**
 * Convert a Base64 data URL to a Blob for Puter img2txt
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Convert an image URL or path to a full Base64 or Blob if needed
 */
export async function normalizeImageSourceForPuter(imageSource: string | File | Blob): Promise<any> {
  if (imageSource instanceof File || imageSource instanceof Blob) {
    return imageSource;
  }
  if (typeof imageSource === 'string') {
    if (imageSource.startsWith('data:')) {
      return dataUrlToBlob(imageSource);
    }
    // If it's a relative URL on localhost (e.g., /papers/xyz/crops/q_1.png)
    if (imageSource.startsWith('/')) {
      try {
        const fullUrl = window.location.origin + imageSource;
        const resp = await fetch(fullUrl);
        if (resp.ok) {
          return await resp.blob();
        }
      } catch {
        // fallback to passing string directly
      }
    }
  }
  return imageSource;
}

/**
 * Run Puter.js AI OCR on an image (URL, File, Blob, or base64)
 * Documentation: https://docs.puter.com/AI/img2txt/
 */
export async function runPuterOcr(
  imageSource: string | File | Blob,
  options: PuterOcrOptions = { provider: 'aws-textract' }
): Promise<string> {
  const puterSdk = await getPuterSdk();

  if (!puterSdk?.ai?.img2txt) {
    throw new Error('Puter.js AI Engine is not loaded. Check internet connection to js.puter.com.');
  }

  const sourcePayload = await normalizeImageSourceForPuter(imageSource);

  try {
    const rawResult = await puterSdk.ai.img2txt(sourcePayload, {
      provider: options.provider || 'aws-textract',
      testMode: Boolean(options.testMode),
    });

    if (typeof rawResult === 'string') {
      return rawResult;
    } else if (rawResult && typeof rawResult === 'object') {
      return (rawResult as any).text || (rawResult as any).content || JSON.stringify(rawResult);
    }
    return String(rawResult || '');
  } catch (err: any) {
    console.error('[ZeroLeak Puter OCR Error]', err);
    throw new Error(err?.message || 'Puter OCR extraction failed.');
  }
}

/**
 * Run Puter.js AI Vision Chat for deep exam question parsing & table structure recovery
 * Documentation: https://docs.puter.com/AI/chat/
 */
export async function runPuterVisionChat(
  imageSource: string | File | Blob,
  customPrompt?: string,
  options: PuterVisionOptions = {}
): Promise<string> {
  const puterSdk = await getPuterSdk();

  if (!puterSdk?.ai?.chat) {
    throw new Error('Puter.js AI Engine is not loaded. Check internet connection to js.puter.com.');
  }

  const sourcePayload = await normalizeImageSourceForPuter(imageSource);

  const defaultPrompt = customPrompt || `
You are an expert exam question parser. Analyze the provided image of an academic examination question.
Extract:
1. Question number (e.g., 1, 2, Q.3(a), Q.4(b)).
2. Question statement / problem text (preserve any mathematical formulas or code).
3. If there is a table, format it cleanly in Markdown table syntax (| Col 1 | Col 2 |).
4. If it's a multiple choice question (MCQ), extract all options:
   (A) Option A text
   (B) Option B text
   (C) Option C text
   (D) Option D text
5. Identify the correct answer if an answer key or tick mark is visible.

Output the extracted question cleanly without conversational filler.
`.trim();

  try {
    const response = await puterSdk.ai.chat(
      defaultPrompt,
      sourcePayload,
      Boolean(options.testMode),
      {
        model: options.model || undefined, // Puter auto-selects best vision model (Claude / Mistral / Llama)
        temperature: options.temperature ?? 0.1,
      }
    );

    if (typeof response === 'string') {
      return response;
    } else if (response?.message?.content) {
      return typeof response.message.content === 'string'
        ? response.message.content
        : JSON.stringify(response.message.content);
    } else if (response?.text) {
      return response.text;
    }
    return JSON.stringify(response);
  } catch (err: any) {
    console.error('[ZeroLeak Puter Vision Error]', err);
    throw new Error(err?.message || 'Puter Vision extraction failed.');
  }
}

/**
 * Automatic resilient multi-engine Puter extraction:
 * 1. Tries AWS Textract
 * 2. If it encounters issues, falls back to Mistral OCR
 * 3. If needed, falls back to Puter Vision Chat
 */
export async function runPuterAutoExtract(
  imageSource: string | File | Blob
): Promise<{ text: string; engineUsed: string }> {
  // Step 1: Try AWS Textract via Puter
  try {
    const res = await runPuterOcr(imageSource, { provider: 'aws-textract' });
    if (res && res.trim().length > 10) {
      return { text: res, engineUsed: 'Puter (AWS Textract)' };
    }
  } catch (err) {
    console.warn('[ZeroLeak Puter] AWS Textract failed, trying Mistral OCR...', err);
  }

  // Step 2: Try Mistral OCR via Puter
  try {
    const res = await runPuterOcr(imageSource, { provider: 'mistral' });
    if (res && res.trim().length > 10) {
      return { text: res, engineUsed: 'Puter (Mistral OCR)' };
    }
  } catch (err) {
    console.warn('[ZeroLeak Puter] Mistral OCR failed, trying Vision Chat...', err);
  }

  // Step 3: Fallback to Puter Vision Chat
  const res = await runPuterVisionChat(imageSource);
  return { text: res, engineUsed: 'Puter (Vision AI)' };
}

/**
 * Parse raw text extracted by Puter OCR into question text, options, and tables
 */
export function parsePuterOcrText(rawText: string): ParsedOcrQuestion {
  if (!rawText) {
    return {
      contentText: '',
      options: [],
      rawText: '',
      hasTable: false,
    };
  }

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  let questionNumber: number | string | undefined = undefined;
  let contentLines: string[] = [];
  const options: Array<{ label: string; text: string }> = [];
  let suggestedAnswer: string | undefined = undefined;
  let hasTable = false;
  const tableLines: string[] = [];

  // Regex patterns for options: (A), A), A., [A], (a), a), a.
  const optionRegex = /^(\(?([A-Da-d])[\)\.]|\[([A-Da-d])\])\s*(.*)/;
  // Regex pattern for question number: Q.1, Q1, Q.3(a), 1., 1), (1)
  const qNumRegex = /^(?:Q(?:uestion)?\.?\s*(\d+(?:\([a-z]\))?)|(\d+(?:\([a-z]\))?)[\.\)])\s*(.*)/i;
  // Markdown or ASCII table detection
  const tableBorderRegex = /^[\|\+\-\:]+[\|\+\-\:\s]+[\|\+\-\:]+$/;

  let inOptionsSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect Markdown Table lines
    if (line.startsWith('|') || tableBorderRegex.test(line)) {
      hasTable = true;
      tableLines.push(line);
      contentLines.push(line);
      continue;
    }

    // Check Question Number on initial lines
    if (i === 0 || !questionNumber) {
      const qMatch = line.match(qNumRegex);
      if (qMatch) {
        questionNumber = qMatch[1] || qMatch[2];
        const rest = qMatch[3]?.trim();
        if (rest) contentLines.push(rest);
        continue;
      }
    }

    // Check Options
    const optMatch = line.match(optionRegex);
    if (optMatch) {
      inOptionsSection = true;
      const label = (optMatch[2] || optMatch[3] || '').toUpperCase();
      const text = optMatch[4]?.trim() || '';
      options.push({ label, text });
      continue;
    }

    // Check Answer key hints if present
    const ansMatch = line.match(/^(?:Ans(?:wer)?|Key|Correct Answer)[\s\:\-]+([A-D])/i);
    if (ansMatch) {
      suggestedAnswer = ansMatch[1].toUpperCase();
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
  const questionType = options.length >= 2 ? 'MCQ' : 'THEORY';

  return {
    questionNumber,
    contentText,
    options,
    suggestedAnswer,
    rawText,
    hasTable,
    tableMarkdown: tableLines.length > 0 ? tableLines.join('\n') : undefined,
    questionType,
  };
}

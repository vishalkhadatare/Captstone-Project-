import { puter } from '@heyputer/puter.js';

export interface PuterOcrOptions {
  provider?: 'aws-textract' | 'mistral' | 'aws' | 'textract' | 'mistral-ocr';
  testMode?: boolean;
}

export interface ParsedOcrQuestion {
  questionNumber?: number | string;
  contentText: string;
  options: Array<{ label: string; text: string }>;
  suggestedAnswer?: string;
  rawText: string;
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
 * Run Puter.js AI OCR on an image (URL, File, Blob, or base64)
 * Documentation: https://docs.puter.com/AI/img2txt/
 */
export async function runPuterOcr(
  imageSource: string | File | Blob,
  options: PuterOcrOptions = { provider: 'aws-textract' }
): Promise<string> {
  // Use window.puter (CDN) if available, otherwise fall back to npm package
  const puterSdk = (typeof window !== 'undefined' && (window as any).puter) || puter;

  if (!puterSdk?.ai?.img2txt) {
    throw new Error('Puter.js AI Engine is not loaded. Check internet connection to js.puter.com.');
  }

  let sourcePayload: any = imageSource;
  if (typeof imageSource === 'string' && imageSource.startsWith('data:')) {
    sourcePayload = dataUrlToBlob(imageSource);
  }

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
    console.error('Puter OCR Error:', err);
    throw new Error(err?.message || 'Puter OCR extraction failed.');
  }
}

/**
 * Parse raw text extracted by Puter OCR into question text and multiple-choice options
 */
export function parsePuterOcrText(rawText: string): ParsedOcrQuestion {
  if (!rawText) {
    return {
      contentText: '',
      options: [],
      rawText: '',
    };
  }

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  let questionNumber: number | string | undefined = undefined;
  let contentLines: string[] = [];
  const options: Array<{ label: string; text: string }> = [];
  let suggestedAnswer: string | undefined = undefined;

  // Regex patterns for options: (A), A), A., [A]
  const optionRegex = /^(\(?([A-Da-d])[\)\.]|\[([A-Da-d])\])\s*(.*)/;
  // Regex pattern for question number: Q.1, Q1, 1., 1)
  const qNumRegex = /^(?:Q(?:uestion)?\.?\s*(\d+)|(\d+)[\.\)])\s*(.*)/i;

  let inOptionsSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check Question Number on initial lines
    if (i === 0 || !questionNumber) {
      const qMatch = line.match(qNumRegex);
      if (qMatch) {
        questionNumber = parseInt(qMatch[1] || qMatch[2], 10);
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
    const ansMatch = line.match(/^(?:Ans(?:wer)?|Key)[\s\:\-]+([A-D])/i);
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

  return {
    questionNumber,
    contentText,
    options,
    suggestedAnswer,
    rawText,
  };
}


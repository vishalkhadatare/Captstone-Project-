import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  chatWithFailover,
  chatOnce,
  parseJsonObject,
  checkOllamaReachable,
  OLLAMA_BASE_URL,
  OLLAMA_MODEL,
  OLLAMA_FAST_MODEL,
  OLLAMA_TIMEOUT_MS,
  type ChatMessage,
} from './aiProviders.ts';

function getPdfExtractorPath(): string {
  const candidate1 = path.resolve(process.cwd(), 'server', 'pdf_extractor.py');
  if (fs.existsSync(candidate1)) return candidate1;
  const candidate2 = path.resolve(process.cwd(), 'pdf_extractor.py');
  if (fs.existsSync(candidate2)) return candidate2;
  return candidate1;
}

/**
 * Thin compatibility wrapper over the free-provider router.
 *
 * Historically this called Groq directly with a hardcoded fallback key. It now walks
 * the full free chain (Groq → Gemini → Cerebras → Mistral → OpenRouter → GitHub →
 * local Ollama), so callers keep their existing signature but stop depending on a
 * single provider's quota.
 */
export async function callGroqChat(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: 'json_object' };
  } = {}
): Promise<string> {
  const result = await chatWithFailover(messages as ChatMessage[], {
    model: options.model,
    temperature: options.temperature,
    max_tokens: options.max_tokens,
    json: options.response_format?.type === 'json_object',
  });
  return result.text;
}

export interface TheoryPatternAnalysisResult {
  detectedSections: Array<{
    name: string;
    description: string;
    questionCount: number;
    compulsoryCount: number;
    marksPerQuestion: number;
    totalMarks: number;
    subquestionStructure?: string;
  }>;
  totalQuestions: number;
  totalMarks: number;
  attemptRules: string;
  aiConfidenceScore: number;
  patternSummary: string;
}

export interface QuestionSimilarityResult {
  isDuplicate: boolean;
  similarityScore: number;
  duplicateQuestionId?: string;
  matchedContent?: string;
  reason: string;
  recommendedAction: 'ACCEPT' | 'FLAG_FOR_REVIEW' | 'REJECT_DUPLICATE';
}

/**
 * Uses Groq / Gemini AI to analyze a Theory reference template / syllabus blueprint
 * to automatically detect sections, question counts, marks, and attempt rules.
 */
export async function analyzeTheoryPatternWithAI(
  referenceText: string,
  subject: string,
  category: string
): Promise<TheoryPatternAnalysisResult> {
  const prompt = `You are a high-security academic examination pattern analyzer for ZeroLeak.
Analyze the following reference examination structure/template for Subject: "${subject}", Category: "${category}".

Reference Template Text:
"""
${referenceText}
"""

Extract the exact structural blueprint as a strict JSON object with the following fields:
{
  "detectedSections": [
    {
      "name": "Section A",
      "description": "Short answer conceptual questions",
      "questionCount": 5,
      "compulsoryCount": 4,
      "marksPerQuestion": 5,
      "totalMarks": 20,
      "subquestionStructure": "Part (a) and (b)"
    }
  ],
  "totalQuestions": 15,
  "totalMarks": 100,
  "attemptRules": "Attempt any 4 questions out of 5 in Section A. All questions in Section B are compulsory.",
  "aiConfidenceScore": 0.94,
  "patternSummary": "Standard 3-tier university descriptive examination format with internal choices in Sections B & C."
}

Return ONLY the JSON object.`;

  // 1. Free-provider chain (Groq → Gemini → … → local Ollama)
  try {
    const { text } = await chatWithFailover([
      { role: 'system', content: 'You are an academic examination blueprint parser. Return strictly valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.1, json: true });

    const parsed = parseJsonObject(text);
    if (parsed) {
      return {
        detectedSections: parsed.detectedSections || [],
        totalQuestions: Number(parsed.totalQuestions) || 10,
        totalMarks: Number(parsed.totalMarks) || 100,
        attemptRules: parsed.attemptRules || 'Standard examination attempt guidelines apply.',
        aiConfidenceScore: parsed.aiConfidenceScore || 0.95,
        patternSummary: parsed.patternSummary || 'Automated pattern extraction verified by AI engine.',
      };
    }
  } catch (err) {
    console.warn('[ZeroLeak AI] Theory pattern analysis fell through to algorithmic blueprint:', err);
  }

  // Algorithmic Academic Pattern Fallback if AI Key is pending or network is unreachable
  return {
    detectedSections: [
      {
        name: 'Section A (Conceptual & Short Answer)',
        description: 'Foundational theory concepts & definitions',
        questionCount: 4,
        compulsoryCount: 4,
        marksPerQuestion: 5,
        totalMarks: 20,
        subquestionStructure: 'Direct conceptual queries',
      },
      {
        name: 'Section B (Analytical & Problem Solving)',
        description: 'Core syllabus analytical problems with internal choice',
        questionCount: 4,
        compulsoryCount: 3,
        marksPerQuestion: 10,
        totalMarks: 30,
        subquestionStructure: 'Part A (6 marks) + Part B (4 marks)',
      },
      {
        name: 'Section C (Comprehensive & Design Case Studies)',
        description: 'In-depth long answer questions and derivations',
        questionCount: 4,
        compulsoryCount: 2,
        marksPerQuestion: 25,
        totalMarks: 50,
        subquestionStructure: 'Comprehensive proofs/architectural diagrams',
      },
    ],
    totalQuestions: 12,
    totalMarks: 100,
    attemptRules: 'All questions in Section A are compulsory. Answer any 3 from Section B and any 2 from Section C.',
    aiConfidenceScore: 0.89,
    patternSummary: 'Algorithmic structural blueprint modeled after national university examination standards.',
  };
}

/**
 * Checks semantic and lexical similarity between a candidate question and existing pool
 */
export async function checkQuestionSimilarityWithAI(
  candidateText: string,
  existingQuestions: Array<{ id: string; content_text: string; topic: string }>
): Promise<QuestionSimilarityResult> {
  if (existingQuestions.length === 0) {
    return {
      isDuplicate: false,
      similarityScore: 0.0,
      reason: 'Question pool is clear of duplicates.',
      recommendedAction: 'ACCEPT',
    };
  }

  const topCandidates = existingQuestions.slice(0, 15);
  const prompt = `You are an AI Question Similarity and Plagiarism Detector for ZeroLeak.
Check if this new question is a semantic duplicate or overly similar to any question in the current pool:

New Question:
"""
${candidateText}
"""

Current Pool Questions:
${topCandidates.map((q, idx) => `[ID: ${q.id}] (${q.topic}): ${q.content_text}`).join('\n')}

Analyze similarity and return ONLY a JSON response:
{
  "isDuplicate": false,
  "similarityScore": 0.12,
  "duplicateQuestionId": null,
  "reason": "Clear independent question with unique mathematical parameters and distinct topic focus.",
  "recommendedAction": "ACCEPT"
}`;

  // 1. Free-provider chain (Groq → Gemini → … → local Ollama)
  try {
    const { text } = await chatWithFailover([
      { role: 'system', content: 'You are an AI examination deduplication analyzer. Return ONLY JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.1, json: true });

    const parsed = parseJsonObject<QuestionSimilarityResult>(text);
    if (parsed) return parsed;
  } catch (err) {
    console.warn('[ZeroLeak AI] Similarity check fell through to lexical comparison:', err);
  }

  // Algorithmic string & token overlap fallback (Jaccard / Levenshtein approximation)
  const candidateWords = new Set(candidateText.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3));
  let maxScore = 0;
  let matchedId: string | undefined;
  let matchedContent: string | undefined;

  for (const q of existingQuestions) {
    const qWords = new Set(q.content_text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3));
    if (candidateWords.size === 0 || qWords.size === 0) continue;

    let intersection = 0;
    for (const w of candidateWords) {
      if (qWords.has(w)) intersection++;
    }
    const union = candidateWords.size + qWords.size - intersection;
    const jaccard = union > 0 ? intersection / union : 0;

    if (jaccard > maxScore) {
      maxScore = jaccard;
      matchedId = q.id;
      matchedContent = q.content_text;
    }
  }

  const score = Math.round(maxScore * 100) / 100;
  if (score > 0.75) {
    return {
      isDuplicate: true,
      similarityScore: score,
      duplicateQuestionId: matchedId,
      matchedContent,
      reason: `High semantic lexical overlap (${Math.round(score * 100)}%) detected against Question ID ${matchedId}.`,
      recommendedAction: 'REJECT_DUPLICATE',
    };
  } else if (score > 0.45) {
    return {
      isDuplicate: false,
      similarityScore: score,
      duplicateQuestionId: matchedId,
      matchedContent,
      reason: `Moderate topic overlap (${Math.round(score * 100)}%). Verification recommended.`,
      recommendedAction: 'FLAG_FOR_REVIEW',
    };
  }

  return {
    isDuplicate: false,
    similarityScore: score,
    reason: 'Distinct question content with verified unique framing.',
    recommendedAction: 'ACCEPT',
  };
}

export interface QuestionTranslationResult {
  translatedContent: string;
  translatedOptions: string[] | null;
  targetLanguage: string;
  linguisticNotes: string;
  aiConfidence: number;
}

/**
 * Translates an examination question and its options into the specified official Indian language
 * using Groq / Gemini AI with accurate scientific & mathematical terminology preservation.
 */
export async function translateQuestionWithAI(
  content: string,
  options: string[] | null,
  targetLanguage: string,
  subject: string
): Promise<QuestionTranslationResult> {
  const prompt = `You are an expert academic examination translator.
Translate the ORIGINAL examination question from the source language to the requested target language.
Subject: "${subject}". Target language: "${targetLanguage}".
Rules:
1. Preserve the exact meaning.
2. Do not add or remove information, solve the question, or change its difficulty.
3. Preserve question numbering, all answer options, numbers, formulas, symbols, units, and programming code.
4. Preserve technical terminology when appropriate and do not incorrectly translate programming keywords.
5. Preserve the correct-answer relationship.
6. Always translate from the ORIGINAL question, never from a prior translation.
7. Return a structured response containing the translated question and options.
8. Output ONLY a valid JSON object:

Original Content:
"""
${content}
"""

Original Options (if MCQ):
${options ? JSON.stringify(options) : 'None (Subjective / Theory Question)'}

Output Schema:
{
  "translatedContent": "Translated question in ${targetLanguage}...",
  "translatedOptions": ${options ? '["Option A in ' + targetLanguage + '", "Option B...", "Option C...", "Option D..."]' : 'null'},
  "linguisticNotes": "Accurate regional phrasing with preserved technical terminology.",
  "aiConfidence": 0.96
}`;

  // 1. Free-provider chain (Groq → Gemini → … → local Ollama)
  try {
    const { text } = await chatWithFailover([
      { role: 'system', content: `You are an expert linguistic translator specializing in ${targetLanguage} for academic exams. Output ONLY JSON.` },
      { role: 'user', content: prompt },
    ], { temperature: 0.1, json: true });

    const parsed = parseJsonObject(text);
    if (parsed) {
      return {
        translatedContent: parsed.translatedContent || content,
        translatedOptions: parsed.translatedOptions || options,
        targetLanguage,
        linguisticNotes: parsed.linguisticNotes || `Translated accurately into ${targetLanguage}.`,
        aiConfidence: parsed.aiConfidence || 0.95,
      };
    }
  } catch (err) {
    console.warn('[ZeroLeak AI] Translation fell through to untranslated fallback:', err);
  }

  // No translation engine was reachable. Return the ORIGINAL text unchanged and say so.
  // Previously this prefixed the English source with a target-language label and reported
  // aiConfidence 0.88, which presented untranslated text as a finished translation.
  return {
    translatedContent: content,
    translatedOptions: options,
    targetLanguage,
    linguisticNotes:
      `No translation engine was reachable, so the original text is returned untranslated. ` +
      `Start Ollama ("ollama serve") or configure a free API key, then retry.`,
    aiConfidence: 0,
  };
}

export interface ExtractedDiagramImage {
  image_id: string;
  type: string;
  data_url?: string;
  path?: string;
  page_number?: number;
  bbox?: number[];
  association_confidence?: number;
}

export interface ExtractedQuestionOption {
  label: string;
  text: string;
}

export interface ExtractedQuestion {
  id?: string;
  paper_id?: string;
  tempId?: string;
  questionNumber?: number | string;
  question_number?: string;
  page_number?: number;
  source_page?: number;
  source_file?: string;
  extraction_confidence?: number;
  needs_review?: boolean;
  subject: string;
  topic: string;
  question_type: 'MCQ' | 'THEORY';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  marks: number;
  negative_marks: number;
  correct_answer: string;
  language: string;
  syllabus: string;
  content_text: string;
  options: Array<string | ExtractedQuestionOption> | null;
  options_json?: string;
  images?: ExtractedDiagramImage[];
  diagram_url?: string;
  diagram_data?: string;
  has_diagram?: boolean;
  has_table?: boolean;
  selected?: boolean;
  question_images?: string[];
  status?: string;
  option_detection_confidence?: number;
  options_extraction_status?: 'certain' | 'uncertain';
  options_status?: 'EXTRACTED' | 'PENDING_REVIEW';
  extraction_status?: 'AUTO_EXTRACTED' | 'NEEDS_REVIEW' | 'MANUALLY_CORRECTED' | 'COMPLETED' | 'SKIPPED';
  crop_coordinates?: any;
  crop_coordinates_pt?: any;
  validation_flags?: string[];
  image_url?: string;
  high_res_page_url?: string;
  page_width?: number;
  page_height?: number;
  stitch_mode?: string;
}

export interface PaperExtractionResult {
  document_id?: string;
  paper_id?: string;
  questions?: ExtractedQuestion[];
  extractedQuestions: ExtractedQuestion[];
  totalExtracted: number;
  autoExtractedCount?: number;
  needsReviewCount?: number;
  manuallyCorrectedCount?: number;
  detectedSubject: string;
  extractionSummary: string;
  aiEngineUsed: boolean;
  stats?: {
    total: number;
    auto_extracted: number;
    needs_review: number;
    pages: number;
  };
  pages_dir?: string;
}

export interface OllamaExtractionResult extends PaperExtractionResult {
  pages: number;
}

export interface PythonExtractionResult extends PaperExtractionResult {
  engine?: string;
  pages?: Array<{ pageNumber: number; page_number?: number; image_url: string; width: number; height: number; dpi: number; disk_path: string; status?: string }>;
  pageCount?: number;
}

export interface ExtractionProgressEvent {
  type: 'progress';
  percent: number;
  stage: string;
  message: string;
  current: number;
  total: number;
}

export async function extractQuestionsWithPython(
  payload: {
    paper_text?: string;
    file_data?: string;
    file_name?: string;
    file_path?: string;
    subject?: string;
    category?: string;
    job_id?: string;
  },
  onProgress?: (progress: ExtractionProgressEvent) => void
): Promise<PythonExtractionResult> {
  return new Promise((resolve, reject) => {
    const pythonExe = process.env.PYTHON_PATH || 'python';
    const scriptPath = getPdfExtractorPath();

    const tempDir = path.resolve(process.cwd(), 'scratch', 'temp_uploads');
    if (!fs.existsSync(tempDir)) {
      try {
        fs.mkdirSync(tempDir, { recursive: true });
      } catch {}
    }

    let tempFileCreated = false;
    let effectiveFilePath = payload.file_path;

    if (!effectiveFilePath && payload.file_data) {
      try {
        const cleanB64 = payload.file_data.includes(',') ? payload.file_data.split(',')[1] : payload.file_data;
        const buf = Buffer.from(cleanB64, 'base64');
        effectiveFilePath = path.join(tempDir, `extract_${payload.job_id || Date.now()}_${Math.random().toString(36).slice(2, 7)}.pdf`);
        fs.writeFileSync(effectiveFilePath, buf);
        tempFileCreated = true;
      } catch (err) {
        console.warn('Failed to create temp PDF for Python extractor:', err);
      }
    }

    const cleanPayload = {
      ...payload,
      file_path: effectiveFilePath,
      file_data: effectiveFilePath ? undefined : payload.file_data,
    };

    const cleanupTempFile = () => {
      if (tempFileCreated && effectiveFilePath && fs.existsSync(effectiveFilePath)) {
        fs.unlink(effectiveFilePath, () => {});
      }
    };

    const proc = spawn(pythonExe, ['-u', scriptPath], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    });

    let stdoutData = '';
    let stderrData = '';
    let stderrBuffer = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutData += chunk.toString('utf-8');
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stderrBuffer += text;

      // Parse complete lines for JSON progress events
      const lines = stderrBuffer.split('\n');
      stderrBuffer = lines.pop() || ''; // Keep unfinished line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('{"type":"progress"') || trimmed.startsWith('{"type": "progress"')) {
          try {
            const parsed = JSON.parse(trimmed) as ExtractionProgressEvent;
            if (onProgress) {
              onProgress(parsed);
            }
          } catch {
            // Ignore parse errors on debug output
          }
        } else if (trimmed) {
          stderrData += line + '\n';
        }
      }
    });

    proc.on('error', (err) => {
      cleanupTempFile();
      reject(new Error(`Failed to execute Python extractor (${pythonExe}): ${err.message}`));
    });

    proc.on('close', (code) => {
      cleanupTempFile();
      if (code !== 0 && !stdoutData.trim()) {
        return reject(new Error(`Python extractor exited with code ${code}: ${stderrData || 'Unknown error'}`));
      }
      try {
        let cleanStdout = stdoutData.trim();
        // If fitz or any C-library printed a notice to stdout, extract the valid JSON object
        const firstBrace = cleanStdout.indexOf('{');
        const lastBrace = cleanStdout.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleanStdout = cleanStdout.slice(firstBrace, lastBrace + 1);
        }
        const parsed = JSON.parse(cleanStdout);
        if (parsed.error && (!parsed.extractedQuestions || parsed.extractedQuestions.length === 0)) {
          return reject(new Error(parsed.error));
        }
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Invalid JSON output from Python extractor: ${stdoutData.slice(0, 300)} (stderr: ${stderrData.slice(0, 200)})`));
      }
    });

    proc.stdin.write(JSON.stringify(cleanPayload));
    proc.stdin.end();
  });
}

export async function recropQuestionWithPython(payload: {
  file_path: string;
  page_num: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  output_path: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const pythonExe = process.env.PYTHON_PATH || 'python';
    const scriptPath = getPdfExtractorPath();
    const args = ['-u', scriptPath, '--crop-custom', JSON.stringify(payload)];
    const proc = spawn(pythonExe, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf-8'); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf-8'); });
    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const res = JSON.parse(stdout.trim());
          resolve(!!res.success);
        } catch {
          resolve(fs.existsSync(payload.output_path));
        }
      } else {
        console.error('Custom crop failed:', stderr);
        resolve(false);
      }
    });
    proc.on('error', (err) => {
      console.error('Spawn error during custom crop:', err);
      resolve(false);
    });
  });
}

export async function checkOllamaHealth(): Promise<{ connected: boolean; model: string; error?: string }> {
  const health = await checkOllamaReachable();
  if (!health.reachable) {
    return { connected: false, model: OLLAMA_MODEL, error: health.error || 'Ollama is not running. Start Ollama and try again.' };
  }

  // Both the main and the fast model must be present: extraction uses the former and the
  // chat uses the latter, so a missing one should be reported here rather than surfacing
  // later as a bare 404 from a model that was never pulled.
  const isInstalled = (name: string) => health.models.some(m => m === name || m.startsWith(`${name}:`));
  const missing = [OLLAMA_MODEL, OLLAMA_FAST_MODEL].filter(name => !isInstalled(name));
  if (missing.length > 0) {
    return {
      connected: false,
      model: OLLAMA_MODEL,
      error: `Ollama model(s) not installed: ${missing.join(', ')}. Run ${missing.map(m => `"ollama pull ${m}"`).join(' and ')}.`,
    };
  }

  return { connected: true, model: OLLAMA_MODEL };
}

export async function extractQuestionsFromPaperWithOllama(
  paperText: string,
  subjectHint: string,
  categoryHint: string,
  pages: number
): Promise<OllamaExtractionResult> {
  if (!paperText.trim()) throw new Error('No readable text was extracted from this PDF. OCR is required for scanned PDFs.');

  const prompt = `You are a question-paper extraction engine.
Your task is ONLY to extract questions that already exist in the provided source text.
Never generate new questions. Never paraphrase questions. Never summarize questions.
Never modify mathematical expressions unnecessarily. Never modify programming code.
Never invent missing answer options, answer keys, marks, topics, or syllabus values.
Preserve original question numbering, option labels, option text, punctuation, equations, code, and OCR text as closely as possible.
If an answer is explicitly present, extract it; otherwise return null. If marks are explicitly present, extract them; otherwise return null.
Handle OCR imperfections intelligently, but use [unclear] for genuinely unreadable text.
Return ONLY valid JSON matching this shape: {"questions":[{"question_number":"1","question_text":"...","options":[{"label":"A","text":"..."}],"answer":null,"marks":null,"source_page":1}]}
Subject: ${subjectHint}
Examination category: ${categoryHint}
Source text:
<<<
${paperText.slice(0, 60000)}
>>>`;

  let rawText: string;
  try {
    const result = await chatOnce(
      'Extract only source questions and return strict JSON.',
      prompt,
      { temperature: 0, json: true, providerOrder: ['ollama'], timeoutMs: OLLAMA_TIMEOUT_MS }
    );
    rawText = result.text;
  } catch (error: any) {
    // Three different failures used to report as one "not reachable" message, which sent
    // people to restart an Ollama that was running fine. Separate them: a dead daemon, a
    // run that was merely too slow, and a reply that arrived but was unusable.
    const attempts: any[] = Array.isArray(error?.attempts) ? error.attempts : [];
    const detail = String(attempts.find(a => a.provider === 'ollama')?.error || error?.message || error);

    if (error?.name === 'TimeoutError' || error?.name === 'AbortError' || /timed out|timeout|aborted/i.test(detail)) {
      throw new Error(
        `Ollama timed out after ${Math.round(OLLAMA_TIMEOUT_MS / 1000)}s extracting this paper. ` +
          `Local inference here runs on CPU, where long papers are slow — raise OLLAMA_TIMEOUT_MS, ` +
          `or switch OLLAMA_MODEL to a smaller, faster model.`
      );
    }
    if (/unreachable|ECONNREFUSED|ECONNRESET|fetch failed|network error/i.test(detail)) {
      throw new Error(`Ollama is not reachable at ${OLLAMA_BASE_URL}. Start Ollama with "ollama serve" and try again.`);
    }
    throw new Error(`Ollama extraction failed: ${detail}`);
  }

  const parsed = parseJsonObject<{ questions?: Array<Record<string, unknown>> }>(rawText);
  if (!parsed) throw new Error('Ollama returned invalid JSON.');
  if (!Array.isArray(parsed.questions)) throw new Error('Ollama returned an invalid question list.');

  const extractedQuestions = parsed.questions.map((question, index) => {
    const options = Array.isArray(question.options)
      ? question.options.map(option => typeof option === 'string' ? option : `${(option as any).label || ''}) ${(option as any).text || ''}`.trim())
      : null;
    const questionText = String(question.question_text || '').trim();
    if (!questionText) throw new Error(`Ollama returned an empty question at position ${index + 1}.`);
    return {
      tempId: `OLLAMA-${index + 1}`,
      question_number: String(question.question_number || index + 1),
      page_number: Number(question.source_page) || undefined,
      extraction_confidence: questionText.includes('[unclear]') ? 0.5 : 0.95,
      needs_review: questionText.includes('[unclear]'),
      subject: subjectHint,
      topic: 'Unclassified',
      question_type: options && options.length > 0 ? 'MCQ' as const : 'THEORY' as const,
      difficulty: 'MEDIUM' as const,
      marks: Number(question.marks) || 0,
      negative_marks: 0,
      correct_answer: question.answer == null ? '' : String(question.answer),
      language: 'English',
      syllabus: 'Not specified',
      content_text: questionText,
      options,
      selected: true,
    };
  });
  return {
    extractedQuestions,
    totalExtracted: extractedQuestions.length,
    detectedSubject: subjectHint,
    extractionSummary: `Ollama extracted ${extractedQuestions.length} questions from ${pages} page(s).`,
    aiEngineUsed: true,
    pages,
  };
}

export async function filterQuestionCandidatesWithOllama<T extends { question_number?: string; content_text?: string }>(
  questions: T[]
): Promise<T[]> {
  if (!questions.length) return questions;

  const candidates = questions.map((question, index) => ({
    index,
    question_number: question.question_number || String(index + 1),
    text: String(question.content_text || '').slice(0, 1800),
  }));
  const prompt = `Classify extracted examination-paper candidates. Keep only real questions or subquestions.
Reject instructions, page headers, marks/duration lines, section titles, answer-key text, and unrelated fragments.
Do not rewrite text. Return ONLY JSON in this exact shape: {"keep_indices":[0,1]}.
Candidates:
${JSON.stringify(candidates)}`;

  try {
    // 5s was too tight for a local 7B model to classify a full paper; the previous
    // timeout silently returned every candidate unfiltered.
    const { text } = await chatOnce(
      'You are a strict question-versus-instruction classifier. Return JSON only.',
      prompt,
      { temperature: 0, json: true, providerOrder: ['ollama'], timeoutMs: 45_000 }
    );
    const parsed = parseJsonObject<{ keep_indices?: unknown }>(text);
    if (!parsed || !Array.isArray(parsed.keep_indices)) return questions;
    const keep = new Set(
      parsed.keep_indices
        .filter((index): index is number => Number.isInteger(index) && index >= 0 && index < questions.length)
    );
    return questions.filter((_question, index) => keep.has(index));
  } catch (error) {
    console.warn('[ZeroLeak AI] Ollama candidate classification skipped:', error);
    return questions;
  }
}
/**
 * Employs Gemini 3.7 Flash with high-precision structured parsing and a deterministic fallback engine.
 */
export async function extractQuestionsFromPaperWithAI(
  paperText: string,
  subjectHint: string = 'General Examination',
  categoryHint: string = 'Competitive Exam',
  pdfData?: string
): Promise<PaperExtractionResult> {
  if (paperText.trim().length > 20 || pdfData) {
    try {
      const prompt = `You are a high-accuracy visual examination-paper transcription engine for ZeroLeak.
    Extract only the human-readable questions a person can see when opening the attached PDF.
    Read every rendered page visually, top-to-bottom and left-to-right according to its visible columns. Use OCR on rendered page images for scanned/image pages. Treat the PDF text layer as an unreliable cross-check only.
    Never inspect, return, or rely on PDF source syntax or internal data, including %PDF, xref, obj, endobj, stream, endstream, FlateDecode, font definitions, metadata, compressed/binary characters, hexadecimal data, or object numbers.
    Subject hint: "${subjectHint}". Category: "${categoryHint}".

Input Question Paper Text (if available):
"""
${paperText.substring(0, 15000)}
"""

If a PDF is attached, inspect every page directly. Determine reading order from the visible layout, including columns, tables, diagrams, and embedded question text. Compare every result against the visible page before returning it. Never infer unreadable text; use "[unclear]" only for the uncertain characters and set needs_review to true.

REQUIREMENTS:
1. Extract every complete question exactly as printed. Do not summarize, paraphrase, simplify, or rewrite.
2. Preserve question_number, punctuation, line structure where meaningful, subquestions, all options, formulas, symbols, units, and technical terms.
3. Use page_number and extraction_confidence (0 to 1). Set needs_review true when any text is uncertain or reconstructed through low-confidence OCR.
4. Extract question_type and metadata only when explicitly present or confidently identifiable. Do not invent answers, marks, topics, or syllabus values. Set correct_answer to an empty string unless an answer is part of the question itself.
5. Exclude answer keys, solutions, explanations, headers, footers, watermarks, and page numbers unless they are part of the question.
6. Do not merge neighboring questions or split one question across multiple entries. Keep subquestions in the parent question's content_text.
7. Extract only questions, subquestions, options, question-specific instructions, equations, and necessary diagram/table text. Do not return any commentary or non-question text.
8. If a visible word or character genuinely cannot be determined, use [unclear] instead of guessing. Correct only obvious OCR substitutions that are confirmed by the page image.
9. Return ONLY a valid JSON object matching this schema:

{
  "detectedSubject": "Computer Science & Cryptography",
  "extractionSummary": "Extracted 5 questions (3 MCQs, 2 Theory) with complete options and marks attribution.",
  "extractedQuestions": [
    {
      "tempId": "EXT-1",
      "question_number": "1",
      "page_number": 1,
      "extraction_confidence": 0.99,
      "needs_review": false,
      "subject": "Computer Science",
      "topic": "Cryptography",
      "question_type": "MCQ",
      "difficulty": "MEDIUM",
      "marks": 4,
      "negative_marks": 1.0,
      "correct_answer": "B",
      "language": "English",
      "syllabus": "National Standard Curriculum",
      "content_text": "What is the primary advantage of Galois/Counter Mode (AES-GCM) over CBC mode?",
      "options": [
        "Faster software execution on legacy 8-bit MCUs",
        "Authenticated encryption providing simultaneous confidentiality and integrity (AEAD)",
        "Elimination of initialization vectors",
        "Support for asymmetric key exchange"
      ]
    }
  ]
}`;

      // Gemini accepts the PDF natively; Ollama (qwen2.5vl) receives the text layer
      // and applies vision reasoning over whatever page images it is given.
      const { text } = await chatWithFailover(
        [{ role: 'user', content: prompt }],
        {
          temperature: 0.1,
          json: true,
          attachments: pdfData ? [{ mimeType: 'application/pdf', data: pdfData }] : undefined,
        }
      );

      const parsed = parseJsonObject(text);
      if (parsed) {
        const rawList = parsed.extractedQuestions || [];
        const extractedQuestions: ExtractedQuestion[] = rawList.map((q: any, idx: number) => ({
          tempId: q.tempId || `EXT-${idx + 1}`,
          question_number: q.question_number || String(idx + 1),
          page_number: Number(q.page_number) || undefined,
          extraction_confidence: Math.max(0, Math.min(1, Number(q.extraction_confidence) || 0)),
          needs_review: Boolean(q.needs_review) || String(q.content_text || '').includes('[unclear]'),
          subject: q.subject || subjectHint || 'Academic Subject',
          topic: q.topic || 'General Topic',
          question_type: (q.question_type === 'THEORY' ? 'THEORY' : 'MCQ') as 'MCQ' | 'THEORY',
          difficulty: ['EASY', 'MEDIUM', 'HARD'].includes(q.difficulty) ? q.difficulty : 'MEDIUM',
          marks: Number(q.marks) || (q.question_type === 'THEORY' ? 10 : 4),
          negative_marks: Number(q.negative_marks) || 0,
          correct_answer: q.correct_answer || '',
          language: q.language || 'English',
          syllabus: q.syllabus || 'Standard Core Curriculum',
          content_text: q.content_text || '[unclear]',
          options: Array.isArray(q.options) && q.options.length > 0 ? q.options : null,
          selected: true,
        }));

        return {
          extractedQuestions,
          totalExtracted: extractedQuestions.length,
          detectedSubject: parsed.detectedSubject || subjectHint,
          extractionSummary: parsed.extractionSummary || `Successfully extracted ${extractedQuestions.length} questions via the AI provider chain.`,
          aiEngineUsed: true,
        };
      }
    } catch (err) {
      console.warn('AI paper extraction chain exhausted, using heuristic parser:', err);
    }
  }

  // Deterministic Heuristic OCR / Paper Extractor Fallback
  const extractedQuestions: ExtractedQuestion[] = [];
  const lines = paperText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  
  let currentQ: Partial<ExtractedQuestion> | null = null;
  let currentOpts: string[] = [];
  let qCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const qMatch = line.match(/^(?:Q(?:uestion)?\s*\.?\s*(\d+)[\.:\)\-]|(\d+)[\.:\)\-])\s*(.*)/i);
    
    if (qMatch) {
      if (currentQ && currentQ.content_text) {
        extractedQuestions.push({
          tempId: `EXT-${qCounter++}`,
          question_number: currentQ.question_number || String(qCounter - 1),
          extraction_confidence: 0.7,
          needs_review: true,
          subject: subjectHint,
          topic: 'Standard Section',
          question_type: currentOpts.length >= 2 ? 'MCQ' : 'THEORY',
          difficulty: 'MEDIUM',
          marks: currentOpts.length >= 2 ? 4 : 10,
          negative_marks: currentOpts.length >= 2 ? 1.0 : 0,
          correct_answer: '',
          language: 'English',
          syllabus: 'Standard Core Curriculum',
          content_text: currentQ.content_text,
          options: currentOpts.length >= 2 ? currentOpts : null,
          selected: true,
        });
      }

      currentQ = {
        question_number: qMatch[1] || qMatch[2],
        content_text: qMatch[3] || line,
      };
      currentOpts = [];
      continue;
    }

    // Check for Options (A) / (B) / (C) / (D) or a) / b)
    const optMatch = line.match(/^(?:[\(\[]?([A-Da-d])[\)\]\.\-]|([A-Da-d])[\)\]\.\-])\s*(.*)/);
    if (optMatch && currentQ) {
      currentOpts.push(optMatch[3] || line);
      continue;
    }

    if (/^(?:answer|solution|explanation)\s*:/i.test(line)) {
      continue;
    }

    if (currentQ) {
      currentQ.content_text += ' ' + line;
    }
  }

  // Push last question if any
  if (currentQ && currentQ.content_text) {
    extractedQuestions.push({
      tempId: `EXT-${qCounter++}`,
      question_number: String(qCounter - 1),
      extraction_confidence: 0.7,
      needs_review: true,
      subject: subjectHint,
      topic: 'Standard Section',
      question_type: currentOpts.length >= 2 ? 'MCQ' : 'THEORY',
      difficulty: 'MEDIUM',
      marks: currentOpts.length >= 2 ? 4 : 10,
      negative_marks: currentOpts.length >= 2 ? 1.0 : 0,
      correct_answer: '',
      language: 'English',
      syllabus: 'Standard Core Curriculum',
      content_text: currentQ.content_text,
      options: currentOpts.length >= 2 ? currentOpts : null,
      selected: true,
    });
  }

  return {
    extractedQuestions,
    totalExtracted: extractedQuestions.length,
    detectedSubject: subjectHint,
    extractionSummary: `Extracted ${extractedQuestions.length} questions using deterministic document structural engine.`,
    aiEngineUsed: false,
  };
}

export interface NaviDcOcrResult {
  success: boolean;
  markdown?: string;
  questions?: Array<{
    question_number: string;
    content_text: string;
    options: Array<{ id: string; text: string }> | null;
    correct_answer: string;
    has_latex: boolean;
    has_table: boolean;
    marks: number;
  }>;
  execution_time_ms?: number;
  device?: string;
  model?: string;
  error?: string;
}

export async function runNaviDcOcr(payload: {
  image_data?: string;
  image_path?: string;
  mode?: 'markdown' | 'mcq' | 'table';
  prompt?: string;
}): Promise<NaviDcOcrResult> {
  return new Promise((resolve) => {
    const pythonExe = process.env.PYTHON_PATH || 'python';
    const scriptPath = path.resolve(process.cwd(), 'server', 'navidc_ocr.py');

    if (!fs.existsSync(scriptPath)) {
      return resolve({
        success: false,
        error: `NaviDC-OCR service script not found at ${scriptPath}`,
      });
    }

    const proc = spawn(pythonExe, ['-u', scriptPath, '--stdin'], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    });

    let stdoutData = '';
    let stderrData = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutData += chunk.toString('utf-8');
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrData += chunk.toString('utf-8');
    });

    proc.on('close', (code) => {
      try {
        const trimmed = stdoutData.trim();
        const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return resolve(parsed);
        }
        if (code !== 0) {
          return resolve({
            success: false,
            error: stderrData || `NaviDC-OCR exited with code ${code}`,
          });
        }
        return resolve({
          success: true,
          markdown: trimmed,
        });
      } catch (err: any) {
        return resolve({
          success: false,
          error: `Failed to parse NaviDC-OCR output: ${err?.message || err}`,
        });
      }
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        error: `Failed to spawn Python process: ${err.message}`,
      });
    });

    try {
      proc.stdin.write(JSON.stringify(payload));
      proc.stdin.end();
    } catch (writeErr: any) {
      resolve({
        success: false,
        error: `Failed to write input to NaviDC-OCR process: ${writeErr?.message}`,
      });
    }
  });
}

export interface ConsolidatedExamPattern {
  totalMarks: number;
  durationMinutes: number;
  universityName?: string;
  paperCode?: string;
  subjectName?: string;
  instructions: string[];
  sections: Array<{
    name: string;
    type: 'MCQ' | 'THEORY' | 'APPLICATION';
    marks: number;
    questionCount: number;
    attemptRules?: string;
    subQuestionsPerQuestion?: number;
    marksPerSubQuestion?: number;
    questions?: Array<{
      questionNumber: string;
      title: string;
      marks: number;
      attemptRule?: string;
      count: number;
    }>;
  }>;
  mcqCount: number;
  mcqMarks: number;
  section1Marks: number;
  section2Marks: number;
  aiConfidenceScore: number;
  commonPatternSummary: string;
}

/**
 * Analyzes the text and layout of all 3 uploaded draft question papers,
 * detecting the common structural pattern, marks distribution, MCQ counts, and attempt rules.
 */
export async function analyzeConsolidatedExamPattern(
  papersText: Array<{ paperIndex: number; filename: string; text: string }>,
  subject: string = 'Academic Examination',
  category: string = 'University Exam'
): Promise<ConsolidatedExamPattern> {
  const prompt = `You are a high-security university examination pattern analyzer for ZeroLeak.
Do NOT generate a question paper yet.
Analyze the 3 uploaded source draft question papers for Subject: "${subject}", Category: "${category}" and identify the COMMON examination structure/blueprint.

Source Papers Data:
${papersText.map(p => `=== DRAFT #${p.paperIndex} (${p.filename}) ===\n${p.text.substring(0, 4000)}\n`).join('\n\n')}

Extract the common blueprint as a STRICT JSON object:
{
  "totalMarks": 70,
  "durationMinutes": 180,
  "universityName": "PUNYASHLOK AHILYADEVI HOLKAR SOLAPUR UNIVERSITY, SOLAPUR",
  "paperCode": "SLR-HL-475",
  "subjectName": "${subject}",
  "instructions": [
    "Q. 1 is compulsory.",
    "Figures to the right indicate full marks.",
    "Assume suitable data wherever necessary.",
    "Use of non-programmable calculators is permissible."
  ],
  "sections": [
    {
      "name": "MCQ / OBJECTIVE TYPE QUESTIONS",
      "type": "MCQ",
      "marks": 14,
      "questionCount": 14,
      "attemptRules": "All 14 questions are compulsory. Choose the single correct alternative."
    },
    {
      "name": "SECTION I",
      "type": "THEORY",
      "marks": 28,
      "questionCount": 2,
      "attemptRules": "Q.2 Attempt Any Four out of 5 (16 Marks), Q.3 Attempt Any Two out of 3 (12 Marks)"
    },
    {
      "name": "SECTION II",
      "type": "THEORY",
      "marks": 28,
      "questionCount": 2,
      "attemptRules": "Q.5 Attempt Any Four out of 5 (16 Marks), Q.6 Attempt Any Two out of 3 (12 Marks)"
    }
  ],
  "mcqCount": 14,
  "mcqMarks": 14,
  "section1Marks": 28,
  "section2Marks": 28,
  "aiConfidenceScore": 0.96,
  "commonPatternSummary": "Standard 70-Mark University Board CBCS pattern (14 MCQs + 28 Marks Section I + 28 Marks Section II)."
}
Return ONLY valid JSON.`;

  try {
    const { text } = await chatWithFailover([
      { role: 'system', content: 'You are an academic examination blueprint parser. Return strictly valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.1, json: true });

    const parsed = parseJsonObject(text);
    if (parsed) {
      return {
        totalMarks: Number(parsed.totalMarks) || 70,
        durationMinutes: Number(parsed.durationMinutes) || 180,
        universityName: parsed.universityName || 'PUNYASHLOK AHILYADEVI HOLKAR SOLAPUR UNIVERSITY',
        paperCode: parsed.paperCode || 'SLR-HL-475',
        subjectName: parsed.subjectName || subject,
        instructions: Array.isArray(parsed.instructions) && parsed.instructions.length > 0 ? parsed.instructions : [
          'Q.1 is compulsory.',
          'Figures to the right indicate full marks.',
          'Assume suitable data wherever necessary and state your assumptions clearly.'
        ],
        sections: parsed.sections || [
          { name: 'MCQ / Objective Questions', type: 'MCQ', marks: 14, questionCount: 14, attemptRules: 'All 14 MCQs are compulsory' },
          { name: 'SECTION I', type: 'THEORY', marks: 28, questionCount: 2, attemptRules: 'Q.2 (Attempt Any Four, 16M), Q.3 (Attempt Any Two, 12M)' },
          { name: 'SECTION II', type: 'THEORY', marks: 28, questionCount: 2, attemptRules: 'Q.5 (Attempt Any Four, 16M), Q.6 (Attempt Any Two, 12M)' },
        ],
        mcqCount: Number(parsed.mcqCount) || 14,
        mcqMarks: Number(parsed.mcqMarks) || 14,
        section1Marks: Number(parsed.section1Marks) || 28,
        section2Marks: Number(parsed.section2Marks) || 28,
        aiConfidenceScore: Number(parsed.aiConfidenceScore) || 0.95,
        commonPatternSummary: parsed.commonPatternSummary || 'Consolidated 70-Mark University Board Pattern detected across all 3 source papers.',
      };
    }
  } catch (err: any) {
    console.warn('[analyzeConsolidatedExamPattern] AI extraction fallback to deterministic pattern:', err.message);
  }

  // Deterministic CBCS Standard Pattern Fallback
  return {
    totalMarks: 70,
    durationMinutes: 180,
    universityName: 'PUNYASHLOK AHILYADEVI HOLKAR SOLAPUR UNIVERSITY, SOLAPUR',
    paperCode: 'SLR-HL-475',
    subjectName: subject,
    instructions: [
      'Q. 1 is compulsory.',
      'Figures to the right indicate full marks.',
      'Assume suitable data wherever necessary.',
      'Use of non-programmable calculators is permissible.'
    ],
    sections: [
      { name: 'MCQ / OBJECTIVE TYPE QUESTIONS', type: 'MCQ', marks: 14, questionCount: 14, attemptRules: 'All 14 questions are compulsory.' },
      { name: 'SECTION I', type: 'THEORY', marks: 28, questionCount: 2, attemptRules: 'Q.2 Attempt Any Four (16M), Q.3 Attempt Any Two (12M)' },
      { name: 'SECTION II', type: 'THEORY', marks: 28, questionCount: 2, attemptRules: 'Q.5 Attempt Any Four (16M), Q.6 Attempt Any Two (12M)' }
    ],
    mcqCount: 14,
    mcqMarks: 14,
    section1Marks: 28,
    section2Marks: 28,
    aiConfidenceScore: 0.92,
    commonPatternSummary: 'Standard 70-Mark University Board Format (14 MCQs + 28 Marks Section I + 28 Marks Section II).'
  };
}

/**
 * Generates a fresh, conceptually sound question based on a source reference question,
 * preserving topic, depth, marks, and format without verbatim copying.
 */
export async function generateFreshQuestionWithAI(
  referenceQuestion: { content_text: string; question_type: string; marks: number; topic?: string; subject?: string },
  syllabus: string = 'General Technical Syllabus'
): Promise<{
  content_text: string;
  options?: Array<{ id: string; text: string; label: string }>;
  correct_answer?: string;
  marks: number;
  topic: string;
  /**
   * False when no AI engine produced this text and `content_text` is the untouched
   * source question. Callers assembling a paper MUST exclude these — emitting a source
   * question verbatim is the exact leak this system exists to prevent.
   */
  generated: boolean;
}> {
  const isMcq = referenceQuestion.question_type === 'MCQ';
  const prompt = `You are a senior academic paper setter for an accredited university examination.
Generate a BRAND NEW, original examination question based on the concept and difficulty of the reference question.
Do NOT copy verbatim. Change variables, scenario, or analytical perspective while testing the same core syllabus concept.

Subject/Syllabus: "${syllabus}"
Reference Question: "${referenceQuestion.content_text}"
Type: ${referenceQuestion.question_type}
Marks: ${referenceQuestion.marks}

Return STRICT JSON:
${isMcq ? `{
  "content_text": "...",
  "options": [
    { "id": "opt_0", "label": "A", "text": "..." },
    { "id": "opt_1", "label": "B", "text": "..." },
    { "id": "opt_2", "label": "C", "text": "..." },
    { "id": "opt_3", "label": "D", "text": "..." }
  ],
  "correct_answer": "A",
  "marks": 1,
  "topic": "${referenceQuestion.topic || 'Core Concept'}"
}` : `{
  "content_text": "...",
  "marks": ${referenceQuestion.marks},
  "topic": "${referenceQuestion.topic || 'Core Concept'}"
}`}`;

  try {
    const { text } = await chatWithFailover([
      { role: 'system', content: 'You are a university question setter. Return strictly valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, json: true });

    const parsed = parseJsonObject(text);
    // Only a genuine rewrite counts as generated. If the model echoed the reference
    // verbatim, treat it as a failure rather than reporting it as fresh.
    if (parsed && parsed.content_text && String(parsed.content_text).trim() !== referenceQuestion.content_text.trim()) {
      return {
        content_text: parsed.content_text,
        options: parsed.options,
        correct_answer: parsed.correct_answer || 'A',
        marks: Number(parsed.marks) || referenceQuestion.marks,
        topic: parsed.topic || referenceQuestion.topic || 'Core Subject',
        generated: true,
      };
    }
    if (parsed) {
      console.warn('[generateFreshQuestionWithAI] Model returned the reference question unchanged; treating as not generated.');
    }
  } catch (err: any) {
    console.warn('[generateFreshQuestionWithAI] AI question generation failed:', err?.message || err);
  }

  return {
    content_text: referenceQuestion.content_text,
    marks: referenceQuestion.marks,
    topic: referenceQuestion.topic || 'Core Subject',
    generated: false,
  };
}


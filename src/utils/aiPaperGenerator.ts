import { getPuterSdk } from './puterOcr';

export type AiGenerationMode =
  | 'EXACT_UPLOADED_PAPER'
  | 'CONCEPT_VARIANTS'
  | 'SYLLABUS_MIRROR'
  | 'ANALYTICAL_HOTS'
  | 'THEORY_SETS';

export interface AiPaperGenerationConfig {
  sourceText: string;
  sourceFileName?: string;
  examTitle?: string;
  subject?: string;
  category?: string;
  mode: AiGenerationMode;
  questionCount: number;
  questionType?: 'MCQ' | 'THEORY' | 'MIXED';
  difficultyDistribution?: {
    easy: number;   // e.g. 30 (%)
    medium: number; // e.g. 50 (%)
    hard: number;   // e.g. 20 (%)
  };
  includeExplanations?: boolean;
  marksPerQuestion?: number;
  negativeMarksPerQuestion?: number;
  model?: string; // 'claude-3-5-sonnet' | 'deepseek-chat' | 'gpt-4o-mini' | 'mistral-large-latest'
  customInstructions?: string;
}

export interface GeneratedAiQuestion {
  id: string;
  questionNumber: number | string;
  questionType: 'MCQ' | 'THEORY' | 'NUMERICAL';
  subject: string;
  topic: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  marks: number;
  negativeMarks: number;
  contentText: string;
  options: Array<{ label: string; text: string }>;
  correctAnswer: string; // 'A' | 'B' | 'C' | 'D' or detailed answer for Theory
  explanation?: string;
  sectionName?: string;
  hasTable?: boolean;
  tableMarkdown?: string;
  hasLatex?: boolean;
}

export interface GeneratedAiPaper {
  title: string;
  subject: string;
  category: string;
  totalQuestions: number;
  totalMarks: number;
  durationMinutes: number;
  generationMode: AiGenerationMode;
  modelUsed: string;
  generatedAt: string;
  questions: GeneratedAiQuestion[];
  rawAiResponse?: string;
}

import { api } from '../api';

export const FREE_AI_MODELS = [
  {
    id: 'groq-gpt-oss-120b',
    name: 'Groq Cloud (GPT-OSS 120B)',
    description: 'Ultra-fast (~600 tokens/sec), comprehensive 120B parameter reasoning and question synthesis.',
    recommended: true,
  },
  {
    id: 'ollama-local',
    name: 'Ollama Engine (Local & Offline)',
    description: '100% Private & Air-Gapped. Uses your local Llama 3.2, DeepSeek-R1, or Mistral without internet.',
    recommended: false,
  },
  {
    id: 'groq-gpt-oss-20b',
    name: 'Groq Cloud (GPT-OSS 20B)',
    description: 'Instant question generation and strict JSON adherence on Groq LPU.',
    recommended: false,
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet (Puter Free)',
    description: 'Highest analytical accuracy, exceptional mathematical LaTeX and diagram reasoning.',
    recommended: false,
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat V3 (Puter Free)',
    description: 'Fast, high-precision STEM problem creation and code synthesis.',
    recommended: false,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini (Puter Free)',
    description: 'Ultra-fast structured JSON generation and comprehensive syllabus coverage.',
    recommended: false,
  },
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large (Puter Free)',
    description: 'Strong reasoning and European/Indian curriculum alignment.',
    recommended: false,
  },
];

/**
 * Main function: generate brand-new examination paper from PDF content via Groq, Ollama, or Puter.js free AI
 */
export async function generatePaperFromPdfText(
  config: AiPaperGenerationConfig,
  onProgress?: (statusText: string) => void
): Promise<GeneratedAiPaper> {
  const modelToUse = config.model || 'groq-gpt-oss-120b';
  
  onProgress?.(`Analyzing source PDF concepts & structuring prompt...`);
  const prompt = buildPaperGenerationPrompt(config);

  let responseText = '';

  // 1. If Ollama model is selected
  if (modelToUse === 'ollama-local' || modelToUse.startsWith('ollama')) {
    onProgress?.(`Synthesizing fresh questions via Local Ollama Engine...`);
    try {
      const ollamaRes = await api.ollamaChat({
        messages: [
          { role: 'system', content: 'You are an expert Academic Examination Controller and Senior Chief Question Paper Setter. Output ONLY valid JSON matching the requested schema.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
      });

      responseText = ollamaRes.text || ollamaRes.message?.content || '';
    } catch (ollamaErr: any) {
      console.warn(`[ZeroLeak AI Generator] Ollama failed:`, ollamaErr);
      onProgress?.(`Ollama offline or timed out, falling back to Groq LPU...`);
    }
  }

  // 2. If Groq model is selected (or fell back from Ollama)
  if (!responseText && (modelToUse.startsWith('groq-') || modelToUse.includes('gpt-oss') || modelToUse === 'ollama-local')) {
    const groqModelName = modelToUse === 'groq-gpt-oss-20b' ? 'openai/gpt-oss-20b' : 'openai/gpt-oss-120b';
    onProgress?.(`Synthesizing fresh questions via Groq LPU (${groqModelName})...`);

    try {
      const groqRes = await api.groqChat({
        messages: [
          { role: 'system', content: 'You are an expert Academic Examination Controller and Senior Chief Question Paper Setter. Output ONLY valid JSON.' },
          { role: 'user', content: prompt },
        ],
        model: groqModelName,
        temperature: 0.1,
      });

      responseText = groqRes.text || groqRes.message?.content || '';
    } catch (groqErr: any) {
      console.warn(`[ZeroLeak AI Generator] Groq model ${groqModelName} failed, falling back to Puter:`, groqErr);
      onProgress?.(`Groq proxy error, switching to backup Puter engine...`);
    }
  }

  // 3. If responseText is still empty, use Puter.js free AI
  if (!responseText) {
    const puterModel = modelToUse.startsWith('groq-') ? 'claude-3-5-sonnet' : modelToUse;
    onProgress?.(`Connecting to Free AI Engine (${puterModel})...`);
    const puterSdk = await getPuterSdk();
    if (!puterSdk?.ai?.chat) {
      throw new Error('Puter.js AI Engine is not available. Please ensure network access to js.puter.com.');
    }

    onProgress?.(`Synthesizing fresh questions via ${puterModel}...`);

    try {
      const rawResponse = await puterSdk.ai.chat(prompt, {
        model: puterModel,
        temperature: 0.2,
      });

      if (typeof rawResponse === 'string') {
        responseText = rawResponse;
      } else if (rawResponse?.message?.content) {
        responseText = typeof rawResponse.message.content === 'string'
          ? rawResponse.message.content
          : JSON.stringify(rawResponse.message.content);
      } else if (rawResponse?.text) {
        responseText = rawResponse.text;
      } else {
        responseText = JSON.stringify(rawResponse);
      }
    } catch (chatErr: any) {
      console.warn(`[ZeroLeak AI Generator] Puter model ${puterModel} failed:`, chatErr);
      const fallbackModel = puterModel === 'claude-3-5-sonnet' ? 'deepseek-chat' : 'gpt-4o-mini';
      onProgress?.(`Switching to backup model ${fallbackModel}...`);
      try {
        const rawFallback = await puterSdk.ai.chat(prompt, {
          model: fallbackModel,
          temperature: 0.2,
        });
        if (typeof rawFallback === 'string') {
          responseText = rawFallback;
        } else if (rawFallback?.message?.content) {
          responseText = typeof rawFallback.message.content === 'string'
            ? rawFallback.message.content
            : JSON.stringify(rawFallback.message.content);
        } else if (rawFallback?.text) {
          responseText = rawFallback.text;
        }
      } catch (fbErr: any) {
        throw new Error(`AI generation failed on all models: ${chatErr?.message || fbErr?.message}`);
      }
    }
  }

  onProgress?.(`Parsing and validating structured question paper...`);

  // Clean and parse JSON response
  const parsedPaper = parseAiPaperResponse(responseText, config, modelToUse);
  onProgress?.(`Successfully generated ${parsedPaper.questions.length} authentic examination questions.`);
  return parsedPaper;
}

/**
 * Builds standard academic prompt for generating examination paper
 */
function buildPaperGenerationPrompt(config: AiPaperGenerationConfig): string {
  const modeInstructions: Record<AiGenerationMode, string> = {
    EXACT_UPLOADED_PAPER: `
Generate and extract the EXACT QUESTIONS DIRECTLY from the uploaded source document.
- Extract EVERY question, sub-question (e.g. Q.1, Q.2(a), Q.2(b)...), problem, and MCQ statement EXACTLY as written in the uploaded source document.
- Preserve the exact question text, LaTeX equations, options (A, B, C, D), marks, and correct answer keys.
- Do NOT fabricate, change, or summarize the questions. They MUST be identical to the uploaded exam paper.
- Retain the exact academic integrity and phrasing of the source question paper.
`,
    CONCEPT_VARIANTS: `
Generate CONCEPT-PARALLEL / ISOMORPHIC VARIANT questions.
- For each concept, theorem, algorithm, or scenario present in the source document, construct a BRAND NEW question.
- Change numerical values, equations, variables, application domains, and option distractors.
- Maintain identical difficulty, mathematical depth, and cognitive demand.
- The new questions must test the exact same underlying concept without copying verbatim phrases from the source text.
`,
    SYLLABUS_MIRROR: `
Generate a SYLLABUS-ALIGNED MIRROR EXAMINATION PAPER.
- Analyze the topics, modules, and sub-domains represented in the source document.
- Construct a full, balanced examination paper mirroring the source's topic distribution and difficulty ratios.
- Questions should feel completely authentic, rigorous, and standard for competitive / university testing.
`,
    ANALYTICAL_HOTS: `
Generate HIGHER-ORDER THINKING (HOTS) & ANALYTICAL questions.
- Elevate cognitive depth to Bloom's taxonomy levels: Analysis, Synthesis, and Evaluation.
- Use multi-concept integration, assertion-reasoning, diagrammatic interpretation, and scenario-based edge cases.
`,
    THEORY_SETS: `
Generate a structured UNIVERSITY THEORY EXAMINATION PAPER.
- Organize questions into sections (e.g. Section A: Short Answer 2-Marks, Section B: Analytical 5-Marks, Section C: Comprehensive 10-Marks).
- Provide step-by-step model answer points / rubrics for each question.
`,
  };

  const truncatedSource = config.sourceText.length > 25000 
    ? config.sourceText.substring(0, 25000) + '\n...[Remaining source text omitted for brevity]'
    : config.sourceText;

  return `
You are an expert Academic Examination Controller and Senior Chief Question Paper Setter for National Competitive & University Examinations.

Your task is to analyze the provided source document text and generate a BRAND NEW, completely original examination question paper containing exactly ${config.questionCount} questions.

GENERATION MODE:
${modeInstructions[config.mode] || modeInstructions.CONCEPT_VARIANTS}

TARGET CONFIGURATION:
- Exam Title: ${config.examTitle || 'National Academic Examination 2026'}
- Subject: ${config.subject || 'Detected from document'}
- Category: ${config.category || 'Competitive & University Examination'}
- Total Questions to Generate: ${config.questionCount}
- Question Type: ${config.questionType || 'MCQ'}
- Marks Per Question: ${config.marksPerQuestion || (config.questionType === 'THEORY' ? 5 : 4)}
- Negative Marks Per Question: ${config.negativeMarksPerQuestion !== undefined ? config.negativeMarksPerQuestion : (config.questionType === 'THEORY' ? 0 : 1)}
- Include Step-by-Step Solutions: ${config.includeExplanations ? 'YES' : 'NO'}
${config.customInstructions ? `- Custom Instructions: ${config.customInstructions}` : ''}

SOURCE DOCUMENT TEXT (EXTRACTED FROM UPLOADED PDF):
=====================================================
${truncatedSource}
=====================================================

OUTPUT FORMAT INSTRUCTIONS:
You MUST respond with a VALID, STRICT JSON object ONLY. Do not include introductory conversational text, markdown outside of the JSON block, or commentary.

The JSON structure must match this schema exactly:
{
  "title": "${config.examTitle || 'Generated Examination Paper'}",
  "subject": "${config.subject || 'Subject Name'}",
  "category": "${config.category || 'Competitive Examination'}",
  "totalQuestions": ${config.questionCount},
  "totalMarks": ${(config.questionCount) * (config.marksPerQuestion || 4)},
  "durationMinutes": ${Math.max(30, config.questionCount * 2)},
  "questions": [
    {
      "questionNumber": 1,
      "questionType": "${config.questionType || 'MCQ'}",
      "subject": "${config.subject || 'Subject'}",
      "topic": "Specific Topic / Chapter",
      "difficulty": "EASY", // "EASY" | "MEDIUM" | "HARD"
      "marks": ${config.marksPerQuestion || 4},
      "negativeMarks": ${config.negativeMarksPerQuestion !== undefined ? config.negativeMarksPerQuestion : 1},
      "contentText": "Question problem statement. Use standard LaTeX for equations like $E = mc^2$ or $\\\\int_0^1 x dx$. If table is needed, use markdown table syntax.",
      "options": [
        { "label": "A", "text": "Option A text" },
        { "label": "B", "text": "Option B text" },
        { "label": "C", "text": "Option C text" },
        { "label": "D", "text": "Option D text" }
      ],
      "correctAnswer": "A", // 'A' | 'B' | 'C' | 'D' (or model answer for Theory)
      "explanation": "Step-by-step mathematical derivation and justification of why option A is correct."
    }
  ]
}

Ensure all ${config.questionCount} questions are completely filled, mathematically accurate, and follow the specified JSON schema strictly.
`.trim();
}

/**
 * Robustly parses and repairs JSON from AI output
 */
function parseAiPaperResponse(
  rawText: string,
  config: AiPaperGenerationConfig,
  modelUsed: string
): GeneratedAiPaper {
  if (!rawText || rawText.trim().length === 0) {
    throw new Error('AI returned an empty response. Please try again.');
  }

  let cleaned = rawText.trim();

  // Strip Markdown code fences: ```json ... ``` or ``` ... ```
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonMatch && jsonMatch[1]) {
    cleaned = jsonMatch[1].trim();
  } else {
    // If not fenced, locate first '{' and last '}'
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err: any) {
    // Attempt basic JSON repairs (trailing commas, escaped quotes)
    try {
      const repaired = cleaned
        .replace(/,\s*([\]}])/g, '$1') // remove trailing commas before ] or }
        .replace(/[\u201C\u201D]/g, '"') // smart double quotes
        .replace(/[\u2018\u2019]/g, "'"); // smart single quotes
      parsed = JSON.parse(repaired);
    } catch (repairErr: any) {
      console.error('[ZeroLeak AI Parser] Raw response failed to parse as JSON:', cleaned);
      throw new Error(`Failed to parse AI question paper JSON: ${err.message}. Response was:\n${cleaned.substring(0, 300)}...`);
    }
  }

  const rawQuestions: any[] = Array.isArray(parsed?.questions)
    ? parsed.questions
    : Array.isArray(parsed)
    ? parsed
    : [];

  if (rawQuestions.length === 0) {
    throw new Error('AI did not return any questions in the expected format. Please retry generation.');
  }

  const normalizedQuestions: GeneratedAiQuestion[] = rawQuestions.map((q: any, idx: number) => {
    const qNum = q.questionNumber || q.q_number || idx + 1;
    const content = q.contentText || q.content_text || q.question || q.statement || `Question ${qNum}`;
    
    // Normalize options
    let options: Array<{ label: string; text: string }> = [];
    if (Array.isArray(q.options)) {
      options = q.options.map((opt: any, optIdx: number) => {
        if (typeof opt === 'string') {
          return { label: String.fromCharCode(65 + optIdx), text: opt.trim() };
        }
        return {
          label: opt.label || String.fromCharCode(65 + optIdx),
          text: String(opt.text || opt.value || opt.option || '').trim(),
        };
      });
    }

    // Determine correct answer
    let correctAnswer = String(q.correctAnswer || q.correct_answer || q.answer || 'A').toUpperCase().trim();
    if (correctAnswer.startsWith('OPTION')) {
      correctAnswer = correctAnswer.replace('OPTION', '').trim();
    }
    if (correctAnswer.length > 1 && (correctAnswer.includes('A') || correctAnswer.includes('B') || correctAnswer.includes('C') || correctAnswer.includes('D'))) {
      const match = correctAnswer.match(/\b([A-D])\b/);
      if (match) correctAnswer = match[1];
    }

    const difficulty = (q.difficulty || 'MEDIUM').toUpperCase() as 'EASY' | 'MEDIUM' | 'HARD';
    const marks = Number(q.marks) || config.marksPerQuestion || 4;
    const negativeMarks = q.negativeMarks !== undefined ? Number(q.negativeMarks) : (config.negativeMarksPerQuestion ?? 1);

    const hasLatex = content.includes('$') || content.includes('\\');
    const hasTable = content.includes('|') && content.includes('\n');

    return {
      id: `ai_q_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      questionNumber: qNum,
      questionType: (q.questionType || config.questionType || (options.length >= 2 ? 'MCQ' : 'THEORY')).toUpperCase() as any,
      subject: q.subject || config.subject || 'General Academic',
      topic: q.topic || 'Core Concept',
      difficulty: ['EASY', 'MEDIUM', 'HARD'].includes(difficulty) ? difficulty : 'MEDIUM',
      marks,
      negativeMarks,
      contentText: content,
      options,
      correctAnswer,
      explanation: q.explanation || q.solution || undefined,
      sectionName: q.sectionName || q.section || undefined,
      hasLatex,
      hasTable,
    };
  });

  const totalMarks = normalizedQuestions.reduce((sum, q) => sum + q.marks, 0);

  return {
    title: parsed.title || config.examTitle || 'Generated Examination Paper',
    subject: parsed.subject || config.subject || 'General Academic',
    category: parsed.category || config.category || 'Competitive Examination',
    totalQuestions: normalizedQuestions.length,
    totalMarks: totalMarks || normalizedQuestions.length * 4,
    durationMinutes: Number(parsed.durationMinutes) || Math.max(30, normalizedQuestions.length * 2),
    generationMode: config.mode,
    modelUsed,
    generatedAt: new Date().toISOString(),
    questions: normalizedQuestions,
    rawAiResponse: rawText,
  };
}


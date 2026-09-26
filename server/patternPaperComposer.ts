/**
 * Pattern-faithful paper composition.
 *
 * The multi-paper generator draws questions from a pool, but it treats the pool
 * as flat: the uploaded papers' *shape* - which main question offers how many
 * sub-questions, for how many marks, under what instruction - is discarded and
 * rebuilt from a hardcoded template. The result is a paper that answers the
 * right number of questions but no longer looks like the paper it came from.
 *
 * This module keeps the main questions and recombines the sub-questions:
 *
 *   1. Derive the main-question frames from the pattern detected in the
 *      uploaded papers (number, instruction, offered count, attempt count,
 *      marks per sub-question). These are carried across verbatim.
 *   2. For each frame, select a FRESH combination of sub-questions from the
 *      pooled questions of every selected source paper - no repeats within a
 *      paper, and spread across sources.
 *   3. Emit real LaTeX, with `tabular` for tables that survived extraction as
 *      text and `\includegraphics` for the original figures cropped from the
 *      source PDFs.
 *
 * Figures are referenced through `\IfFileExists`, so a compile that cannot
 * receive the image files still succeeds and prints a labelled placeholder
 * instead of failing on a missing graphic.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { compileLatexUniversal, isolateAndFormatLatexTablesAndDiagrams } from './formatex.ts';

/** The pattern section shape produced by `analyzeConsolidatedExamPattern`. */
export interface PatternSectionInput {
  name?: string;
  type?: string;
  marks?: number;
  questionCount?: number;
  attemptRules?: string;
  marksPerQuestion?: number;
  questionsToAttempt?: number;
}

/** A question as it reaches the composer, from the `questions` table. */
export interface ComposerQuestion {
  id: string;
  content_text: string;
  question_type?: string;
  marks?: number;
  options_json?: string;
  correct_answer?: string;
  diagram_url?: string;
  question_paper_id?: string;
  subject?: string;
  topic?: string;
}

/**
 * A main question, preserved from the source pattern. These are the parts of
 * the paper that must stay identical between the uploads and the output.
 */
export interface MainQuestionFrame {
  questionNumber: string;
  /** Instruction carried over from the source paper, e.g. "Attempt any FOUR". */
  instruction: string;
  type: 'MCQ' | 'THEORY' | 'ANY';
  /** How many sub-questions the main question offers (a, b, c, ...). */
  subQuestionCount: number;
  /** How many of those the candidate must attempt. */
  attemptCount: number;
  marksPerSubQuestion: number;
  sectionName: string;
  sectionTotalMarks: number;
}

export interface ComposedSubQuestion {
  label: string;
  id: string;
  content: string;
  marks: number;
  options?: Array<{ label: string; text: string }>;
  correctAnswer?: string;
  diagramUrl?: string;
  sourcePaperId?: string;
}

export interface ComposedMainQuestion extends MainQuestionFrame {
  subQuestions: ComposedSubQuestion[];
}

export interface ComposedPaper {
  setLetter: string;
  frames: ComposedMainQuestion[];
  totalMarks: number;
  sourceBreakdown: Record<string, number>;
  warnings: string[];
}

export interface ComposeOptions {
  seed?: string;
  /** Cap on how much of one paper may contribute, as a percentage. */
  maxSourceContributionPercent?: number;
  /** Reject rows that look like page furniture or log lines. */
  qualityGate?: (q: ComposerQuestion) => boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** Deterministic byte stream, so a given seed always rebuilds the same paper. */
function makeRng(seed: string): () => number {
  let block = crypto.createHash('sha256').update(seed).digest();
  let offset = 0;
  return () => {
    if (offset >= block.length) {
      block = crypto.createHash('sha256').update(block).digest();
      offset = 0;
    }
    return block[offset++] / 256;
  };
}

function seededShuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Pull "attempt any FOUR" out of an instruction. Returns null when the wording
 * names no quantity, which is the signal to fall back to the section count.
 */
export function parseAttemptCount(text: unknown): number | null {
  const source = String(text ?? '');
  if (!source.trim()) return null;

  const anyMatch = source.match(/any\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)/i);
  if (anyMatch) {
    const token = anyMatch[1].toLowerCase();
    const value = NUMBER_WORDS[token] ?? Number(token);
    if (Number.isFinite(value) && value > 0) return value;
  }

  const attemptMatch = source.match(/attempt\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)/i);
  if (attemptMatch) {
    const token = attemptMatch[1].toLowerCase();
    const value = NUMBER_WORDS[token] ?? Number(token);
    if (Number.isFinite(value) && value > 0) return value;
  }

  return null;
}

/**
 * Split an `attemptRules` string into individual main questions.
 *
 * The analyzer emits prose like
 *   "Q.2 Attempt Any Four out of 5 (16 Marks), Q.3 Attempt Any Two (12 Marks)"
 * where each `Q.n` is its own main question. Nothing else in the pattern
 * records that split, so it has to be recovered from the text.
 */
export function parseMainQuestionsFromRules(
  rules: string
): Array<{ number: number; instruction: string; attemptCount: number | null; marks: number | null }> {
  const parts = String(rules || '')
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);

  const parsed: Array<{ number: number; instruction: string; attemptCount: number | null; marks: number | null }> = [];

  for (const part of parts) {
    const qm = part.match(/\bQ\.?\s*(\d+)\b/i);
    if (!qm) continue;

    const marksMatch = part.match(/\((\d+)\s*(?:M|Marks?)\b/i);
    // Strip the question label and the marks clause: what remains is the
    // instruction the source paper actually printed.
    const instruction = part
      .replace(/\bQ\.?\s*\d+\b/i, '')
      .replace(/\((\d+)\s*(?:M|Marks?)\b[^)]*\)/gi, '')
      .replace(/^[\s:.\-–]+/, '')
      .trim();

    parsed.push({
      number: Number(qm[1]),
      instruction,
      attemptCount: parseAttemptCount(part),
      marks: marksMatch ? Number(marksMatch[1]) : null,
    });
  }

  return parsed;
}

/**
 * Turn a detected pattern into the ordered main-question frames the new paper
 * must preserve.
 *
 * Prefers the per-question split inside `attemptRules`; when the rules are
 * unparseable it still produces a usable frame per section rather than dropping
 * the section, since dropping it silently shrinks the paper.
 */
export function deriveMainQuestionFrames(
  sections: PatternSectionInput[] | undefined,
  options: { fallbackType?: 'MCQ' | 'THEORY' | 'ANY'; startNumber?: number } = {}
): MainQuestionFrame[] {
  const list = Array.isArray(sections) ? sections : [];
  const frames: MainQuestionFrame[] = [];
  let nextNumber = options.startNumber ?? 1;

  for (const section of list) {
    const sectionName = String(section?.name || 'Section').trim();
    const sectionTotalMarks = Math.max(0, Number(section?.marks ?? 0) || 0);
    const sectionType = String(section?.type || '').toUpperCase();
    const type: MainQuestionFrame['type'] =
      sectionType.includes('MCQ') ? 'MCQ' : sectionType.includes('THEORY') ? 'THEORY' : (options.fallbackType ?? 'ANY');

    const declaredCount = Math.max(0, Number(section?.questionCount ?? 0) || 0);
    const parsed = section?.attemptRules ? parseMainQuestionsFromRules(section.attemptRules) : [];

    if (parsed.length > 0) {
      for (const item of parsed) {
        const attemptCount = item.attemptCount ?? Math.max(1, declaredCount || 1);
        // A main question normally offers one more than it requires - the
        // familiar "attempt any FOUR out of five". Never offer fewer than
        // required, which would make the instruction unsatisfiable.
        const subQuestionCount = Math.max(attemptCount + 1, attemptCount);
        const marksPer = item.marks
          ? item.marks / attemptCount
          : section?.marksPerQuestion || (declaredCount > 0 && sectionTotalMarks > 0 ? sectionTotalMarks / declaredCount : 4);

        frames.push({
          questionNumber: `Q.${item.number || nextNumber}`,
          instruction: item.instruction || `Answer the following questions (Attempt any ${attemptCount}).`,
          type,
          subQuestionCount,
          attemptCount,
          marksPerSubQuestion: Math.max(1, Math.round(marksPer)),
          sectionName,
          sectionTotalMarks: item.marks ?? sectionTotalMarks,
        });
        nextNumber = Math.max(nextNumber, (item.number || nextNumber) + 1);
      }
      continue;
    }

    // No per-question detail: treat the section as one main question.
    const attemptCount = Math.max(
      1,
      Number(section?.questionsToAttempt ?? 0) || declaredCount || parseAttemptCount(section?.attemptRules) || 1
    );
    const subQuestionCount = Math.max(attemptCount, declaredCount || attemptCount);
    const marksPer = section?.marksPerQuestion || (declaredCount > 0 && sectionTotalMarks > 0 ? sectionTotalMarks / declaredCount : 4);

    frames.push({
      questionNumber: `Q.${nextNumber++}`,
      instruction: section?.attemptRules?.trim() || 'Answer the following questions.',
      type,
      subQuestionCount,
      attemptCount,
      marksPerSubQuestion: Math.max(1, Math.round(marksPer)),
      sectionName,
      sectionTotalMarks,
    });
  }

  return frames;
}

function normalizeKey(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseOptions(raw?: string): Array<{ label: string; text: string }> {
  if (!raw) return [];
  let parsed: any = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((opt: any, idx: number) => ({
      label: String.fromCharCode(97 + idx),
      text: typeof opt === 'string' ? opt : String(opt?.text ?? opt?.value ?? opt?.option ?? '').trim(),
    }))
    .filter((o) => o.text.length > 0);
}

const hasOptions = (q: ComposerQuestion): boolean => {
  if ((q.question_type || '').toUpperCase() === 'MCQ') return true;
  return parseOptions(q.options_json).length >= 2;
};

/**
 * Keep the main questions, swap in a new combination of sub-questions.
 *
 * Selection is deterministic for a given seed so a generated set can be
 * reproduced later for auditing, and it never prints the same sub-question
 * twice on one paper - a short question is correct, a duplicated one is not.
 */
export function composePatternPaper(
  frames: MainQuestionFrame[],
  pool: ComposerQuestion[],
  options: ComposeOptions = {}
): ComposedPaper {
  const warnings: string[] = [];
  const rng = makeRng(options.seed || 'zeroleak-default-seed');

  const seenKeys = new Set<string>();
  const usable: ComposerQuestion[] = [];

  for (const q of pool) {
    const text = String(q?.content_text || '').trim();
    if (!text) continue;
    if (options.qualityGate && !options.qualityGate(q)) continue;
    const key = normalizeKey(text);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    usable.push(q);
  }

  const mcqPool = seededShuffle(usable.filter(hasOptions), rng);
  const theoryPool = seededShuffle(usable.filter((q) => !hasOptions(q)), rng);

  const sourceIds = Array.from(new Set(usable.map((q) => q.question_paper_id).filter(Boolean) as string[]));
  const totalRequested = frames.reduce((sum, f) => sum + f.subQuestionCount, 0);
  const pct = Number(options.maxSourceContributionPercent ?? 100);
  const perSourceCap =
    sourceIds.length > 1 && pct > 0 && pct < 100
      ? Math.max(1, Math.ceil(totalRequested * (pct / 100)))
      : Number.POSITIVE_INFINITY;

  const usedIds = new Set<string>();
  const usedText = new Set<string>();
  const sourceCount: Record<string, number> = {};

  const take = (candidatePool: ComposerQuestion[], needed: number, frameLabel: string): ComposerQuestion[] => {
    const chosen: ComposerQuestion[] = [];
    for (const q of candidatePool) {
      if (chosen.length >= needed) break;
      if (usedIds.has(q.id) || usedText.has(normalizeKey(q.content_text))) continue;
      const sid = q.question_paper_id || 'unattributed';
      if ((sourceCount[sid] || 0) >= perSourceCap) continue;
      chosen.push(q);
      usedIds.add(q.id);
      usedText.add(normalizeKey(q.content_text));
      sourceCount[sid] = (sourceCount[sid] || 0) + 1;
    }
    if (chosen.length < needed) {
      warnings.push(
        `${frameLabel}: only ${chosen.length}/${needed} sub-questions available after de-duplication and the ` +
          `${pct}% per-paper contribution cap; the main question prints short rather than repeating a question.`
      );
    }
    return chosen;
  };

  const composed: ComposedMainQuestion[] = frames.map((frame) => {
    const candidatePool =
      frame.type === 'MCQ' ? mcqPool : frame.type === 'THEORY' ? theoryPool : seededShuffle(usable, rng);

    const picked = take(candidatePool, frame.subQuestionCount, frame.questionNumber);

    return {
      ...frame,
      subQuestions: picked.map((q, idx) => {
        const opts = parseOptions(q.options_json);
        return {
          label: `${String.fromCharCode(97 + idx)})`,
          id: q.id,
          content: String(q.content_text || '').trim(),
          marks: frame.marksPerSubQuestion,
          options: opts.length >= 2 ? opts : undefined,
          correctAnswer: q.correct_answer,
          diagramUrl: q.diagram_url,
          sourcePaperId: q.question_paper_id,
        };
      }),
    };
  });

  const totalMarks = composed.reduce(
    (sum, f) => sum + Math.min(f.attemptCount, f.subQuestions.length) * f.marksPerSubQuestion,
    0
  );

  return { setLetter: '', frames: composed, totalMarks, sourceBreakdown: sourceCount, warnings };
}

/* ------------------------------------------------------------------ *
 * LaTeX generation
 * ------------------------------------------------------------------ */

const LATEX_SPECIALS: Array<[RegExp, string]> = [
  [/\\/g, '\\textbackslash{}'],
  [/([&%$#_{}])/g, '\\$1'],
  [/~/g, '\\textasciitilde{}'],
  [/\\textbackslash\\{\\}/g, '\\textbackslash{}'],
  [/\^/g, '\\textasciicircum{}'],
];

/** Escape LaTeX control characters without touching inline math. */
export function escapeLatex(text: string): string {
  const source = String(text ?? '');
  const mathSegments: string[] = [];
  const protectedText = source.replace(/\$[^$]+\$/g, (match) => {
    mathSegments.push(match);
    return `\u0000MATH${mathSegments.length - 1}\u0000`;
  });

  let escaped = protectedText;
  for (const [pattern, replacement] of LATEX_SPECIALS) {
    escaped = escaped.replace(pattern, replacement);
  }

  return escaped.replace(/\u0000MATH(\d+)\u0000/g, (_m, i) => mathSegments[Number(i)] ?? '');
}

/**
 * Convert a pipe table that survived extraction as text into real LaTeX.
 *
 * Scanned papers often lose the table structure entirely, but where the rows
 * came through as `| a | b |` this rebuilds a proper `tabular` instead of
 * printing the pipes as prose.
 */
export function pipeTableToLatex(text: string): { body: string; table: string | null } {
  const lines = String(text ?? '').split(/\r?\n/);
  const tableLines: string[] = [];
  const bodyLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const pipes = (trimmed.match(/\|/g) || []).length;
    if (pipes >= 2) tableLines.push(trimmed);
    else bodyLines.push(line);
  }

  if (tableLines.length < 2) return { body: text, table: null };

  const rows = tableLines
    .filter((l) => !/^\|?[\s:|-]+\|?$/.test(l)) // drop the |---|---| separator row
    .map((l) =>
      l
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim())
    )
    .filter((cells) => cells.length > 0);

  if (rows.length === 0) return { body: text, table: null };

  const columns = Math.max(...rows.map((r) => r.length));
  const spec = `|${'l|'.repeat(columns)}`;

  const rendered = rows
    .map((cells, rowIdx) => {
      const padded = [...cells, ...Array(Math.max(0, columns - cells.length)).fill('')];
      const joined = padded.map((c) => escapeLatex(c)).join(' & ');
      // Header rule under the first row, midrule below - the usual booktabs look.
      const rule = rowIdx === 0 ? ' \\\\ \\hline' : ' \\\\ \\hline';
      return `      ${joined}${rule}`;
    })
    .join('\n');

  const table = [
    '\\begin{center}',
    '\\begin{tabular}{' + spec + '}',
    '\\hline',
    rendered,
    '\\end{tabular}',
    '\\end{center}',
  ].join('\n');

  return { body: bodyLines.join('\n').trim(), table };
}

export interface BuildLatexInput {
  exam: {
    universityName?: string;
    examName?: string;
    subject?: string;
    paperCode?: string;
    setLetter?: string;
    durationMinutes?: number;
    totalMarks?: number;
    instructions?: string[];
  };
  paper: ComposedPaper;
  /** Map of sub-question id -> figure filename, from `prepareFigureResources`. */
  figureFiles?: Record<string, string>;
}

/**
 * Render a composed paper as a complete, compilable LaTeX document.
 *
 * The preamble pulls in the packages the body actually uses (graphicx for
 * figures, booktabs for tables), because a missing package is a hard compile
 * failure rather than a rendering nicety.
 */
export function buildPatternPaperLatex(input: BuildLatexInput): string {
  const exam = input.exam || {};
  const paper = input.paper;
  const setLetter = exam.setLetter || paper.setLetter || 'P';

  const title = escapeLatex(exam.universityName || 'STATE UNIVERSITY EXAMINATION BOARD');
  const examName = escapeLatex(exam.examName || 'ANNUAL EXAMINATION');
  const subject = escapeLatex(exam.subject || 'Core Engineering');
  const paperCode = escapeLatex(exam.paperCode || 'SLR-HL-475');
  const duration = Number(exam.durationMinutes ?? 180);
  const totalMarks = Number(exam.totalMarks ?? paper.totalMarks ?? 70);

  const figureFiles = input.figureFiles || {};

  const sections = paper.frames
    .map((frame) => {
      const marksForMain = Math.min(frame.attemptCount, frame.subQuestions.length) * frame.marksPerSubQuestion;

      const items = frame.subQuestions
        .map((sub) => {
          const { body, table } = pipeTableToLatex(sub.content);
          const escaped = escapeLatex(body || sub.content);

          const parts: string[] = [];
          parts.push(`    \\item ${escaped} \\hfill \\textbf{[${sub.marks}]}`);

          if (sub.options && sub.options.length > 0) {
            const inlineOpts = sub.options
              .map((o) => `\\textbf{${escapeLatex(o.label)})} ${escapeLatex(o.text)}`)
              .join(' \\quad ');
            parts.push(`    \\par\\vspace{0.5mm}{\\small ${inlineOpts}}`);
          }

          if (table) parts.push(table);

          const figureName = figureFiles[sub.id];
          if (figureName) {
            // Compiles whether or not the image reached the compiler: a cloud
            // engine that only takes one file still produces a valid paper.
            parts.push(
              [
                '    \\begin{center}',
                `      \\IfFileExists{${figureName}}{\\includegraphics[width=0.55\\textwidth]{${figureName}}}` +
                  `{\\fbox{\\parbox{0.5\\textwidth}{\\centering\\small [Diagram from source paper: ${figureName}]}}}`,
                '    \\end{center}',
              ].join('\n')
            );
          }

          return parts.join('\n');
        })
        .join('\n\n');

      return [
        `% --- ${frame.questionNumber} ---`,
        '\\noindent',
        `\\textbf{\\large ${frame.questionNumber} ${escapeLatex(frame.instruction)}}` +
          `\\hfill \\textbf{[${marksForMain} Marks]}`,
        '\\vspace{2mm}',
        '',
        '\\begin{enumerate}[label=\\textbf{\\alph*)}, leftmargin=8mm, itemsep=3mm]',
        items || '    \\item \\textit{[No sub-questions available for this main question.]}',
        '\\end{enumerate}',
        '\\vspace{4mm}',
        '\\hrule',
        '\\vspace{3mm}',
      ].join('\n');
    })
    .join('\n\n');

  const instructions = exam.instructions || [
    `Mention the question paper set (${setLetter}) clearly on top of the answer booklet.`,
    'Figures to the right indicate full marks.',
    'Assume suitable data wherever necessary and state your assumptions explicitly.',
    'Use of programmable calculators or unauthorized electronic devices is prohibited.',
  ];

  const instructionItems = instructions.map((line, idx) => `  \\item ${escapeLatex(line)}`).join('\n');

  return `\\documentclass[11pt,a4paper]{article}
\\usepackage[top=20mm,bottom=20mm,left=18mm,right=18mm]{geometry}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{enumitem}
\\usepackage{fancyhdr}
\\usepackage{booktabs}
\\usepackage{tabularx}
\\usepackage{array}
\\usepackage{graphicx}
\\usepackage{float}
\\usepackage{microtype}
\\usepackage{xcolor}

\\definecolor{boardblue}{RGB}{15, 23, 42}
\\definecolor{accentcrimson}{RGB}{190, 18, 60}

\\pagestyle{fancy}
\\fancyhf{}
\\renewcommand{\\headrulewidth}{0.5pt}
\\lhead{\\small\\textbf{\\color{accentcrimson}ZEROLEAK} $\\cdot$ \\textsf{CONFIDENTIAL}}
\\chead{}
\\rhead{\\small\\textsf{\\textbf{${paperCode}}} $\\cdot$ \\textbf{\\color{boardblue}SET: ${setLetter}}}
\\lfoot{\\footnotesize Generated by the ZeroLeak pattern-preserving composer}
\\rfoot{\\footnotesize Page \\textbf{\\thepage}}

\\begin{document}

\\noindent
\\begin{tabularx}{\\textwidth}{@{}l X r@{}}
  \\fbox{\\textbf{Seat No:}\\hspace{3.5cm}} & &
  \\begin{tabular}{|c|c|}
    \\hline
    \\textbf{SET} & \\textbf{${setLetter}} \\\\
    \\hline
  \\end{tabular}
\\end{tabularx}

\\vspace{3mm}

\\begin{center}
  {\\Large \\textbf{\\color{boardblue}${title}}}\\\\[1.5mm]
  {\\large \\textbf{${examName}}}\\\\[1.5mm]
  {\\normalsize \\textbf{Subject: ${subject}}}\\\\[1.5mm]
  \\hrule height 1.2pt
  \\vspace{1.5mm}
  \\begin{tabularx}{\\textwidth}{@{}l X r@{}}
    \\textbf{Code:} ${paperCode} &
    \\centering \\textbf{Duration:} ${duration} Minutes &
    \\textbf{Max. Marks:} ${totalMarks} Marks
  \\end{tabularx}
  \\vspace{1mm}
  \\hrule height 0.6pt
\\end{center}

\\vspace{2mm}

\\noindent
\\textbf{\\underline{Instructions to Candidates:}}
\\begin{enumerate}[label=\\textbf{\\arabic*.}, itemsep=0.5mm, topsep=1mm]
${instructionItems}
\\end{enumerate}

\\vspace{4mm}
\\hrule
\\vspace{3mm}

${sections}

\\begin{center}
  \\textsf{\\footnotesize --- END OF QUESTION PAPER (SET ${setLetter}) ---}
\\end{center}

\\end{document}
`;
}

/* ------------------------------------------------------------------ *
 * Figures
 * ------------------------------------------------------------------ */

export interface PreparedFigure {
  questionId: string;
  name: string;
  source: string;
  base64: string;
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/**
 * Materialise the figures a composed paper references.
 *
 * Sources are either a local path or a URL (Cloudinary, in practice). The bytes
 * are base64-encoded so they can ride alongside the .tex through the compiler
 * service, which writes them back to disk before running pdflatex.
 */
export async function prepareFigureResources(
  paper: ComposedPaper,
  options: { maxFigures?: number; maxBytesPerFigure?: number } = {}
): Promise<{ figures: PreparedFigure[]; warnings: string[] }> {
  const maxFigures = options.maxFigures ?? 24;
  const maxBytesPerFigure = options.maxBytesPerFigure ?? 6 * 1024 * 1024;
  const figures: PreparedFigure[] = [];
  const warnings: string[] = [];

  let index = 0;
  for (const frame of paper.frames) {
    for (const sub of frame.subQuestions) {
      const url = sub.diagramUrl;
      if (!url || figures.length >= maxFigures) continue;

      try {
        let buffer: Buffer;
        let ext = 'png';

        if (/^https?:\/\//i.test(url)) {
          const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
          ext = MIME_EXTENSIONS[mime] || 'png';
          buffer = Buffer.from(await res.arrayBuffer());
        } else {
          const resolved = path.isAbsolute(url) ? url : path.join(process.cwd(), url);
          buffer = await fs.promises.readFile(resolved);
          ext = path.extname(resolved).replace(/^\./, '').toLowerCase() || 'png';
        }

        if (buffer.length === 0) throw new Error('empty image');
        if (buffer.length > maxBytesPerFigure) {
          warnings.push(`Figure for question ${sub.id} is ${Math.round(buffer.length / 1024)}KB; skipped as oversized.`);
          continue;
        }

        figures.push({
          questionId: sub.id,
          name: `figure-${++index}.${ext}`,
          source: url,
          base64: buffer.toString('base64'),
        });
      } catch (err: any) {
        warnings.push(`Figure for question ${sub.id} could not be read from "${url}": ${err?.message || err}`);
      }
    }
  }

  return { figures, warnings };
}

/** Attach a set letter to a composed paper. */
export function withSetLetter(paper: ComposedPaper, setLetter: string): ComposedPaper {
  return { ...paper, setLetter: String(setLetter || 'P').toUpperCase() };
}

/**
 * Compose a pattern-faithful paper, render it to LaTeX, and compile it.
 *
 * Compilation is attempted against the self-hosted engine first because it is
 * the only tier that accepts the figure files alongside the .tex. If that fails
 * the same document is retried without the images - the paper still builds, and
 * each figure prints as a labelled placeholder rather than aborting the run.
 */
export async function composePatternPaperDocument(params: {
  exam: BuildLatexInput['exam'];
  frames: MainQuestionFrame[];
  pool: ComposerQuestion[];
  seed?: string;
  maxSourceContributionPercent?: number;
  qualityGate?: (q: ComposerQuestion) => boolean;
  compile?: boolean;
  timeoutMs?: number;
}): Promise<{
  paper: ComposedPaper;
  latex: string;
  figures: Array<{ questionId: string; name: string; source: string }>;
  pdf?: Buffer;
  compiledBy?: string;
  warnings: string[];
}> {
  const composed = composePatternPaper(params.frames, params.pool, {
    seed: params.seed,
    maxSourceContributionPercent: params.maxSourceContributionPercent,
    qualityGate: params.qualityGate,
  });

  const paper = withSetLetter(composed, params.exam?.setLetter || 'P');
  const { figures, warnings: figureWarnings } = await prepareFigureResources(paper);

  const figureFiles: Record<string, string> = {};
  for (const fig of figures) figureFiles[fig.questionId] = fig.name;

  // Normalise table/figure environments before compiling: the isolated and
  // centred forms are what the self-healing compiler expects to see.
  const latex = isolateAndFormatLatexTablesAndDiagrams(buildPatternPaperLatex({ exam: params.exam, paper, figureFiles }));

  const warnings = [...paper.warnings, ...figureWarnings];
  const result: {
    paper: ComposedPaper;
    latex: string;
    figures: Array<{ questionId: string; name: string; source: string }>;
    pdf?: Buffer;
    compiledBy?: string;
    warnings: string[];
  } = {
    paper,
    latex,
    figures: figures.map((f) => ({ questionId: f.questionId, name: f.name, source: f.source })),
    warnings,
  };

  if (params.compile === false) return result;

  const resources = [
    { path: 'main.tex', content: latex },
    ...figures.map((f) => ({ path: f.name, content: f.base64, encoding: 'base64' as const })),
  ];

  const withFigures = await compileLatexUniversal({
    latex,
    resources,
    preferEngine: 'clsi',
    timeoutMs: params.timeoutMs ?? 90000,
  });

  if (withFigures.success && withFigures.pdfBuffer) {
    return { ...result, pdf: withFigures.pdfBuffer, compiledBy: withFigures.compilerService || 'Self-Hosted LaTeX (CLSI)' };
  }

  warnings.push(
    `Self-hosted LaTeX with figures failed (${withFigures.error}); retrying without image files. ` +
      `Figures will print as labelled placeholders. Start it with: ` +
      `docker compose -f latex-service/docker-compose.yml up -d`
  );

  const withoutFigures = await compileLatexUniversal({
    latex,
    preferEngine: 'auto',
    timeoutMs: params.timeoutMs ?? 90000,
  });

  if (withoutFigures.success && withoutFigures.pdfBuffer) {
    return { ...result, warnings, pdf: withoutFigures.pdfBuffer, compiledBy: withoutFigures.compilerService };
  }

  warnings.push(`LaTeX compilation failed on every engine: ${withoutFigures.error}`);
  return { ...result, warnings };
}

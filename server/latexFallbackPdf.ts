import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

import { compileLatexUniversal, type LatexCompileResource } from './formatex.ts';

/**
 * The dedicated LaTeX PDF engine, used when the primary engine cannot produce a
 * paper.
 *
 * The primary typesetting path hands a model-authored document to a compiler,
 * which means the model can break the syntax. This engine inverts that: the
 * backend owns the LaTeX document (preamble, page layout, macros, tables,
 * diagrams) and the generated paper only supplies content. So a fallback here
 * cannot fail because a language model invented a command, and an examiner is
 * never left with "PDF could not be typeset".
 *
 * Every artefact is written to disk - `generated_question_paper.tex` next to the
 * PDF and the assets it embeds - because a compile error is only actionable
 * beside the source that produced it.
 */

export type LatexFallbackCode =
  | 'LATEX_COMPILER_NOT_INSTALLED'
  | 'LATEX_SOURCE_EMPTY'
  | 'LATEX_COMPILE_FAILED'
  | 'LATEX_PDF_UNREADABLE';

export interface LatexCompilerInfo {
  /** The binary that will be used, or null when none exists. */
  command: 'xelatex' | 'pdflatex' | 'lualatex' | null;
  path: string | null;
  /** True when the binary understands Unicode natively (fontspec). */
  unicode: boolean;
  version?: string;
  /** Where the binary was looked for, so a missing install is diagnosable. */
  searched: string[];
  error?: string;
}

export interface LatexBuildResult {
  success: boolean;
  pdfPath?: string;
  texPath?: string;
  logPath?: string;
  buildDir?: string;
  /** Engine that produced the PDF: a binary name, or a remote compiler label. */
  engine?: string;
  exitCode?: number | null;
  pageCount?: number;
  sizeBytes?: number;
  error?: string;
  code?: LatexFallbackCode;
  log?: string;
  /** What the remote tier reported, when no local compiler exists. */
  remoteError?: string;
  /**
   * Whether the engine that produced the PDF could receive image files.
   *
   * Only a local binary and the self-hosted CLSI tier can; every other remote
   * tier answers 200 while dropping side files, so a reused figure degrades to
   * the labelled placeholder box. Reported rather than assumed, because the
   * caller has to tell the examiner which of the two happened.
   */
  figuresEmbedded?: boolean;
  /** True when the real document could not be used and the minimal test ran. */
  usedMinimalDocument?: boolean;
}

/* ------------------------------------------------------------------ *
 * Compiler detection
 * ------------------------------------------------------------------ */

const COMPILER_CANDIDATES: Array<{ command: 'xelatex' | 'pdflatex' | 'lualatex'; unicode: boolean }> = [
  // XeLaTeX first: it is the only engine that typesets Unicode without helpers.
  { command: 'xelatex', unicode: true },
  { command: 'lualatex', unicode: true },
  { command: 'pdflatex', unicode: false },
];

/** Directories worth checking when the binary is not on PATH. */
function candidateDirectories(): string[] {
  const dirs: string[] = [];
  const envPath = process.env.PATH || '';
  dirs.push(...envPath.split(path.delimiter).filter(Boolean));

  if (process.platform === 'win32') {
    dirs.push(
      'C:\\Program Files\\MiKTeX\\miktex\\bin\\x64',
      'C:\\Program Files (x86)\\MiKTeX\\miktex\\bin',
      'C:\\texlive\\2024\\bin\\windows',
      'C:\\texlive\\2025\\bin\\windows',
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'MiKTeX', 'miktex', 'bin', 'x64')
    );
  } else {
    dirs.push('/usr/bin', '/usr/local/bin', '/Library/TeX/texbin', '/opt/homebrew/bin', '/opt/texlive/2024/bin/x86_64-linux');
  }
  return dirs;
}

function runBinary(binary: string, args: string[], options: { cwd?: string; timeoutMs?: number } = {}): Promise<{
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
}> {
  return new Promise((resolve) => {
    execFile(
      binary,
      args,
      { cwd: options.cwd, timeout: options.timeoutMs ?? 120_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (error: any, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
          code: error?.code === undefined || typeof error.code === 'string' ? (error ? 1 : 0) : error.code,
          timedOut: Boolean(error?.killed || error?.signal),
        });
      }
    );
  });
}

let cachedCompiler: LatexCompilerInfo | null = null;

/**
 * Find a usable LaTeX binary.
 *
 * Returns `command: null` when nothing is installed - the caller must then say
 * so plainly instead of reporting a paper that does not exist.
 */
export async function detectLatexCompiler(force = false): Promise<LatexCompilerInfo> {
  if (cachedCompiler && !force) return cachedCompiler;

  const searched = candidateDirectories();
  for (const candidate of COMPILER_CANDIDATES) {
    const result = await runBinary(candidate.command, ['--version'], { timeoutMs: 15_000 });
    if (result.ok) {
      const version = (result.stdout || result.stderr).split('\n')[0]?.trim();
      cachedCompiler = {
        command: candidate.command,
        path: candidate.command,
        unicode: candidate.unicode,
        version,
        searched,
      };
      return cachedCompiler;
    }
  }

  cachedCompiler = {
    command: null,
    path: null,
    unicode: false,
    searched,
    error:
      'No LaTeX compiler was found on PATH or in the usual install locations ' +
      '(MiKTeX, TeX Live, TeXShop). Install MiKTeX or TeX Live, or configure a remote compiler.',
  };
  return cachedCompiler;
}

/* ------------------------------------------------------------------ *
 * Text and Unicode handling
 * ------------------------------------------------------------------ */

/**
 * Escape text that a model wrote, for use inside LaTeX.
 *
 * The backend's own commands are never passed through here - only strings that
 * came from generated content, so `\begin{tabular}` written by this module keeps
 * its meaning while `&`, `%`, `$`, `#`, `_`, `{` and `}` in a question become
 * literal characters.
 *
 * Inline math is preserved: `$...$` is a deliberate request for maths, and
 * escaping its dollar signs would print them instead.
 */
/**
 * Whether the engine in use typesets Unicode itself.
 *
 * Set for the duration of one synchronous document build. When false the text is
 * downgraded to LaTeX equivalents first, because an unconverted arrow is a hard
 * error for pdfTeX.
 */
let unicodeNative = false;

function asLatexSourceText(value: unknown): string {
  const source = String(value ?? '');
  return unicodeNative ? source : unicodeToLatex(source);
}

export function escapeLatexText(value: unknown): string {
  const source = asLatexSourceText(value);
  const maths: string[] = [];
  // Inline maths is a deliberate request for maths, so its dollar signs are held
  // aside and put back untouched instead of being escaped into literal `$`.
  const protectedText = source.replace(/\$[^$]*\$/g, (match) => {
    maths.push(match);
    return `\u0000MATH${maths.length - 1}\u0000`;
  });

  // A backslash is parked under a sentinel: escaping it inline would produce
  // `\textbackslash{}` and the brace pass that follows would then escape that
  // command's own braces into `\textbackslash\{\}`.
  const escaped = protectedText
    .replace(/\\/g, '\u0000BS\u0000')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/\u0000BS\u0000/g, '\\textbackslash{}');

  return escaped.replace(/\u0000MATH(\d+)\u0000/g, (_match, index) => maths[Number(index)] ?? '');
}

/** Characters a pdfLaTeX run cannot typeset without help. */
const UNICODE_MAP: Array<[RegExp, string]> = [
  [/\u2192/g, '$\\rightarrow$'],
  [/\u2190/g, '$\\leftarrow$'],
  [/\u21d2/g, '$\\Rightarrow$'],
  [/\u2264/g, '$\\leq$'],
  [/\u2265/g, '$\\geq$'],
  [/\u2260/g, '$\\neq$'],
  [/\u00d7/g, '$\\times$'],
  [/\u00f7/g, '$\\div$'],
  [/\u2211/g, '$\\sum$'],
  [/\u221a/g, '$\\surd$'],
  [/\u221e/g, '$\\infty$'],
  [/\u2208/g, '$\\in$'],
  [/\u2205/g, '$\\emptyset$'],
  [/\u03b1/g, '$\\alpha$'],
  [/\u03b2/g, '$\\beta$'],
  [/\u03b3/g, '$\\gamma$'],
  [/\u03bc/g, '$\\mu$'],
  [/\u03b8/g, '$\\theta$'],
  [/\u03c0/g, '$\\pi$'],
  [/\u03bb/g, '$\\lambda$'],
  [/\u2013/g, '--'],
  [/\u2014/g, '---'],
  [/\u2018|\u2019/g, "'"],
  [/\u201c|\u201d/g, '"'],
  [/\u2026/g, '\\ldots{}'],
  [/\u20b9/g, 'Rs.'],
  [/\u00b0/g, '$^\\circ$'],
];

/**
 * Replace Unicode punctuation and symbols with LaTeX equivalents.
 *
 * XeLaTeX and LuaLaTeX typeset these directly, so this only runs for a pdflatex
 * engine - where an unconverted arrow is a hard compile error.
 */
export function unicodeToLatex(text: string): string {
  let out = text;
  for (const [pattern, replacement] of UNICODE_MAP) out = out.replace(pattern, replacement);
  // The remaining symbol ranges are dropped rather than breaking the run.
  // Accented Latin letters are kept: the pdfLaTeX preamble loads inputenc, so
  // they typeset correctly and dropping them would corrupt names.
  return out.replace(/[\u2000-\u27bf\u2e00-\u2eff]/g, '');
}

/* ------------------------------------------------------------------ *
 * Structured content -> LaTeX
 * ------------------------------------------------------------------ */

export interface StructuredTable {
  columns: string[];
  rows: Array<Array<string | number>>;
  /** Optional spanning header rows printed above the columns (Banker's tables). */
  headerGroups?: Array<Array<{ text: string; span: number }>>;
  caption?: string;
}

/** A structured table becomes a bordered tabular. The model never writes this. */
export function renderStructuredTable(table: StructuredTable): string {
  const columns = (table.columns || []).map((column) => String(column));
  const columnCount = Math.max(
    1,
    columns.length,
    ...(table.rows || []).map((row) => row.length),
    ...(table.headerGroups || []).map((group) => group.reduce((sum, cell) => sum + Math.max(1, cell.span), 0))
  );
  const spec = `|${'c|'.repeat(columnCount)}`;

  const lines: string[] = ['\\begin{center}', `\\begin{tabular}{${spec}}`, '\\hline'];

  for (const group of table.headerGroups || []) {
    const cells = group
      .map((cell) =>
        Math.max(1, cell.span) > 1
          ? `\\multicolumn{${Math.max(1, cell.span)}}{|c|}{\\textbf{${escapeLatexText(cell.text)}}}`
          : `\\textbf{${escapeLatexText(cell.text)}}`
      )
      .join(' & ');
    lines.push(`${cells} \\\\`, '\\hline');
  }

  if (columns.length > 0) {
    lines.push(`${columns.map((column) => `\\textbf{${escapeLatexText(column)}}`).join(' & ')} \\\\`, '\\hline');
  }

  for (const row of table.rows || []) {
    const cells = Array.from({ length: columnCount }, (_, i) => escapeLatexText(row[i] ?? ''));
    lines.push(`${cells.join(' & ')} \\\\`, '\\hline');
  }

  lines.push('\\end{tabular}');
  if (table.caption) lines.push(`\\\\[1mm]{\\small ${escapeLatexText(table.caption)}}`);
  lines.push('\\end{center}');
  return lines.join('\n');
}

export interface GanttRow {
  process: string;
  start: number;
  end: number;
}

/**
 * A Gantt chart drawn with TikZ from structured data.
 *
 * The paper's own style is a row of labelled blocks on a time axis, so this
 * draws exactly that - no image generation, no model-authored TikZ.
 */
export function renderGantt(rows: GanttRow[], unit = 'ms'): string {
  if (rows.length === 0) return '';
  const total = Math.max(...rows.map((row) => Number(row.end) || 0));
  if (!Number.isFinite(total) || total <= 0) return '';

  const lines = [
    '\\begin{center}',
    '\\begin{tikzpicture}[x=0.55cm,y=0.75cm,font=\\small]',
    `\\draw[->,thick] (0,0) -- (${total + 1},0) node[right]{time (${escapeLatexText(unit)})};`,
  ];

  rows.forEach((row, index) => {
    const start = Number(row.start) || 0;
    const end = Number(row.end) || 0;
    const y = index + 1;
    lines.push(
      `\\draw[fill=blue!12,draw=black] (${start},${y - 0.5}) rectangle (${end},${y + 0.5});`,
      `\\node at (${(start + end) / 2},${y}) {${escapeLatexText(row.process)}};`
    );
  });

  for (let tick = 0; tick <= total; tick += 1) {
    lines.push(`\\draw (${tick},0.1) -- (${tick},-0.1) node[below]{${tick}};`);
  }

  lines.push('\\end{tikzpicture}', '\\end{center}');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * Normalisation of the generated paper
 * ------------------------------------------------------------------ */

interface NormalizedQuestion {
  number: string;
  text: string;
  marks: string | null;
  options: string[];
  tables: StructuredTable[];
  gantt: GanttRow[];
}

interface NormalizedSection {
  title: string;
  instructions: string;
  totalMarks: string | null;
  questions: NormalizedQuestion[];
}

interface NormalizedPaper {
  universityName: string;
  examName: string;
  subject: string;
  paperCode: string;
  setLetter: string;
  duration: string;
  totalMarks: string;
  date: string;
  instructions: string[];
  sections: NormalizedSection[];
}

function text(value: unknown, fallback = ''): string {
  const out = String(value ?? '').trim();
  return !out || out === 'undefined' || out === 'null' ? fallback : out;
}

/** Read the paper the synthesizer produced, filling any header gap. */
export function normalizePaperData(paperData: any, templateData: any = {}): NormalizedPaper {
  const source = paperData && typeof paperData === 'object' ? paperData : {};
  const template = templateData && typeof templateData === 'object' ? templateData : {};
  const header = { ...template, ...source };

  const durationHours = Number(template.durationHours) || 3;
  const rawDuration = text(header.duration, `${durationHours} Hours`);

  return {
    universityName: text(header.universityName, 'AUTONOMOUS STATE UNIVERSITY EXAMINATION BOARD'),
    examName: text(header.examName, 'SEMESTER EXAMINATION'),
    subject: text(header.subject, 'Examination'),
    paperCode: text(header.paperCode, '\u2014'),
    setLetter: text(header.setLetter ?? header.set, 'P'),
    duration: /^[\d.]+$/.test(rawDuration) ? `${rawDuration} Hours` : rawDuration,
    totalMarks: text(header.totalMarks, '\u2014'),
    date: text(header.date, new Date().toLocaleDateString('en-GB')),
    instructions: (Array.isArray(header.instructions) ? header.instructions : []).map((line: unknown) => text(line)).filter(Boolean),
    sections: (Array.isArray(header.sections) ? header.sections : []).map((section: any) => ({
      title: text(section?.title, 'SECTION'),
      instructions: text(section?.instructions),
      totalMarks: section?.totalMarks === undefined ? null : text(section.totalMarks),
      questions: (Array.isArray(section?.questions) ? section.questions : []).map((question: any) => ({
        number: text(question?.number, 'Q'),
        text: text(question?.text),
        marks: question?.marks === undefined ? null : text(question.marks),
        options: (Array.isArray(question?.options) ? question.options : []).map((option: unknown) => text(option)).filter(Boolean),
        tables: Array.isArray(question?.tables) ? question.tables : [],
        gantt: Array.isArray(question?.gantt) ? question.gantt : [],
      })),
    })),
  };
}

/* ------------------------------------------------------------------ *
 * The fixed document
 * ------------------------------------------------------------------ */

/** Assets copied into the build directory: marker number -> relative path. */
export interface FallbackAsset {
  index: number;
  fileName: string;
  buffer: Buffer;
}

/**
 * The document template. Page size, margins, spacing and fonts live here, not in
 * the generated content - so a paper cannot arrive with its own layout.
 */
function buildDocument(paper: NormalizedPaper, options: { unicode: boolean; assets: FallbackAsset[] }): string {
  // Every string below is rendered synchronously, so the flag cannot leak into
  // another build; it is restored afterwards all the same.
  const previousUnicodeNative = unicodeNative;
  unicodeNative = options.unicode;
  try {
    return buildDocumentBody(paper, options);
  } finally {
    unicodeNative = previousUnicodeNative;
  }
}

function buildDocumentBody(paper: NormalizedPaper, options: { unicode: boolean; assets: FallbackAsset[] }): string {
  const font = process.env.LATEX_MAIN_FONT;
  const preamble = [
    '\\documentclass[a4paper,11pt]{article}',
    options.unicode
      ? ['\\usepackage{fontspec}', font ? `\\setmainfont{${font}}` : ''].filter(Boolean).join('\n')
      : '\\usepackage[T1]{fontenc}\n\\usepackage[utf8]{inputenc}',
    '\\usepackage[a4paper,top=18mm,bottom=20mm,left=16mm,right=16mm]{geometry}',
    '\\usepackage{array,tabularx,booktabs,longtable}',
    '\\usepackage{graphicx}',
    '\\usepackage{xcolor}',
    '\\usepackage{enumitem}',
    '\\usepackage{tikz}',
    '\\usetikzlibrary{arrows.meta,positioning,shapes.geometric,calc}',
    '\\usepackage{fancyhdr}',
    '\\usepackage{lastpage}',
    '\\setlength{\\parindent}{0pt}',
    '\\setlist[enumerate]{itemsep=1mm,topsep=1mm,parsep=0pt}',
    '\\definecolor{zlrule}{RGB}{0,0,0}',
    '\\definecolor{zlgrey}{RGB}{240,240,240}',
    '\\pagestyle{fancy}',
    '\\fancyhf{}',
    '\\renewcommand{\\headrulewidth}{0.4pt}',
    '\\rhead{\\small ZeroLeak Examination Security}',
    '\\lhead{\\small ' + escapeLatexText(paper.subject) + '}',
    '\\cfoot{\\small Page \\thepage\\ of \\pageref{LastPage}}',
  ].join('\n');

  // Reusable macros: the template stays stable whatever the paper contains.
  const macros = [
    '\\newcommand{\\zlPaperHeader}[7]{%',
    '  \\begin{center}',
    '    {\\small\\textsc{ZeroLeak \\textbullet\\ Confidential}}\\\\[1mm]',
    '    \\fbox{\\parbox{0.97\\textwidth}{\\centering',
    '      \\textbf{#1}\\\\[0.8mm]',
    '      \\textbf{#2}\\\\[0.8mm]',
    '      \\textbf{Subject: #3}\\\\[0.8mm]',
    '      \\begin{tabular}{@{}p{0.3\\textwidth}p{0.3\\textwidth}p{0.3\\textwidth}@{}}',
    '        \\textbf{Code:} #4 & \\centering\\textbf{Duration:} #5 & \\raggedleft\\textbf{Max. Marks:} #6 \\\\',
    '        \\textbf{Date:} #7 & & \\\\',
    '      \\end{tabular}',
    '    }}',
    '  \\end{center}\\vspace{1mm}',
    '}',
    '% Seat box + set label, printed above the title like the source paper.',
    '\\newcommand{\\zlSeatBox}[1]{%',
    '  \\begin{tabularx}{\\textwidth}{@{}X r@{}}',
    '    \\fbox{\\textbf{Seat No:}\\hspace{3cm}} &',
    '    \\fbox{\\textbf{SET} : #1}',
    '    \\end{tabularx}\\vspace{2mm}',
    '}',
    '\\newcommand{\\zlInstructions}[1]{%',
    '  \\begin{minipage}{\\textwidth}',
    '    \\textbf{Instructions to Candidates:}\\\\[0.5mm]',
    '    \\begin{enumerate}[label=\\arabic*.]',
    '      #1',
    '    \\end{enumerate}',
    '  \\end{minipage}\\vspace{2mm}\\hrule',
    '}',
    '\\newcommand{\\zlInstructionsItem}{\\item}',
    '\\newcommand{\\zlSectionHeading}[2]{%',
    '  \\vspace{2mm}\\begin{center}\\textbf{\\large #1}',
    '  \\ifx\\relax#2\\relax\\else\\\\[0.5mm]\\textbf{#2}\\fi',
    '  \\end{center}\\vspace{1mm}',
    '}',
    '\\newcommand{\\zlSectionNote}[1]{\\textit{#1}\\vspace{1mm}}',
    '\\newcommand{\\zlQuestion}[3]{%',
    '  \\vspace{1.6mm}\\noindent\\textbf{#1}~#2\\hfill\\textbf{[#3]}\\vspace{0.6mm}',
    '}',
    '\\newcommand{\\zlMcqQuestion}[2]{%',
    '  \\vspace{1.2mm}\\noindent\\textbf{#1}~#2\\vspace{0.5mm}',
    '}',
    '\\newcommand{\\zlMcqOptions}{%',
    '  \\begin{enumerate}[label=\\textup{(\\alph*)},leftmargin=8mm,itemsep=0mm,topsep=0mm]',
    '}',
    '\\newcommand{\\zlMcqOption}{\\item}',
    '\\newcommand{\\zlMcqOptionsEnd}{\\end{enumerate}}',
    '\\newcommand{\\zlFigure}[2][0.72]{%',
    '  \\begin{center}',
    '    \\IfFileExists{#2}{\\includegraphics[width=#1\\linewidth]{#2}}{\\fbox{\\parbox{0.8\\textwidth}{\\centering\\small [figure not available]}}}',
    '  \\end{center}',
    '}',
  ].join('\n');

  const body: string[] = [];
  body.push(
    `\\zlPaperHeader{${escapeLatexText(paper.universityName)}}{${escapeLatexText(paper.examName)}}` +
      `{${escapeLatexText(paper.subject)}}{${escapeLatexText(paper.paperCode)}}` +
      `{${escapeLatexText(paper.duration)}}{${escapeLatexText(paper.totalMarks)}}{${escapeLatexText(paper.date)}}`
  );
  body.push(`\\zlSeatBox{${escapeLatexText(paper.setLetter)}}`);
  if (paper.instructions.length > 0) {
    body.push(`\\zlInstructions{${paper.instructions.map((line) => `\\zlInstructionsItem ${escapeLatexText(line)}`).join('\n')}}`);
  }

  for (const section of paper.sections) {
    const sectionMarks = section.totalMarks ? `[${escapeLatexText(section.totalMarks)} Marks]` : null;
    body.push(`\\zlSectionHeading{${escapeLatexText(section.title)}}{${sectionMarks ? escapeLatexText(sectionMarks) : '\\relax'}}`);
    if (section.instructions) body.push(`\\zlSectionNote{${escapeLatexText(section.instructions)}}`);

    for (const question of section.questions) {
      const marks = question.marks ?? '';
      const bodyText = renderQuestionText(question);
      if (question.options.length > 0) {
        body.push(`\\zlMcqQuestion{${escapeLatexText(question.number)}}{${bodyText}}`);
        body.push('\\zlMcqOptions');
        for (const option of question.options) body.push(`\\zlMcqOption ${escapeLatexText(option)}`);
        body.push('\\zlMcqOptionsEnd');
      } else {
        body.push(`\\zlQuestion{${escapeLatexText(question.number)}}{${bodyText}}{${escapeLatexText(marks)}}`);
      }

      for (const table of question.tables) body.push(renderStructuredTable(table));
      if (question.gantt.length > 0) body.push(renderGantt(question.gantt));
    }
  }

  return ['% Generated by the ZeroLeak LaTeX fallback engine.', preamble, macros, '\\begin{document}', ...body, '\\end{document}', ''].join('\n');
}

/**
 * Turn one question's text into LaTeX.
 *
 * The text is model output, so it is escaped. Figures it asks for are resolved to
 * local assets; an unresolvable one prints a labelled box instead of stopping the
 * build.
 */
function renderQuestionText(question: NormalizedQuestion): string {
  // Split on the figure markers so the plain segments can be escaped while the
  // figure command is emitted as a real command. Escaping the whole string and
  // then repairing the command does not survive `{`, `}` and `\` escaping.
  const parts = String(question.text ?? '').split(/\[FIGURE[:\s]?\s*(\d{1,2})\s*\]/gi);
  const pieces: string[] = [];
  parts.forEach((part, index) => {
    if (index % 2 === 1) {
      const figureNumber = Number(part);
      pieces.push(
        Number.isFinite(figureNumber) && figureNumber > 0
          ? `\\zlFigure{assets/figure-${figureNumber}.png}`
          : ''
      );
    } else {
      pieces.push(escapeLatexText(part));
    }
  });
  // Line breaks inside a macro argument are unsafe, so the question flows as a
  // paragraph; structural tables and diagrams arrive as structured data.
  return pieces.join(' ').replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ *
 * Build, compile, validate
 * ------------------------------------------------------------------ */

function makeBuildDir(): string {
  const base = path.join(process.cwd(), 'public', 'generated_papers');
  const dir = path.join(base, `latex_build_${Date.now()}`);
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  return dir;
}

function writeAssets(buildDir: string, assets: FallbackAsset[]): void {
  const assetsDir = path.join(buildDir, 'assets');
  // A caller-supplied build directory may not have the assets folder yet, and a
  // missing folder must not abort a paper that is otherwise ready to compile.
  fs.mkdirSync(assetsDir, { recursive: true });
  for (const asset of assets) {
    if (!asset.buffer?.length) continue;
    fs.writeFileSync(path.join(assetsDir, asset.fileName), asset.buffer);
  }
}

/**
 * Write the .tex (and its assets) to disk without compiling.
 *
 * Kept separate from the compile so the source is on disk even when the compiler
 * is missing or fails - the whole point of the fallback being debuggable.
 */
export function generateLatexQuestionPaper(
  paperData: any,
  templateData: any = {},
  options: { assets?: FallbackAsset[]; unicode?: boolean; buildDir?: string } = {}
): { buildDir: string; texPath: string; latex: string; paper: NormalizedPaper; assets: FallbackAsset[] } {
  const paper = normalizePaperData(paperData, templateData);
  const buildDir = options.buildDir || makeBuildDir();
  const assets = options.assets || [];
  writeAssets(buildDir, assets);

  const latex = buildDocument(paper, { unicode: options.unicode ?? true, assets });
  const texPath = path.join(buildDir, 'generated_question_paper.tex');
  fs.writeFileSync(texPath, latex, 'utf8');
  return { buildDir, texPath, latex, paper, assets };
}

/** The minimal document, to prove the compiler itself works before blaming content. */
export const MINIMAL_TEST_DOCUMENT = [
  '\\documentclass[a4paper,11pt]{article}',
  '\\begin{document}',
  'Question Paper PDF Test',
  '\\end{document}',
  '',
].join('\n');

/** A small paper exercising every element the template uses. */
export function templateSelfTestDocument(unicode: boolean): string {
  const probe: any = {
    universityName: 'TEMPLATE SELF TEST UNIVERSITY',
    examName: 'SEMESTER EXAMINATION',
    subject: 'Operating Systems',
    paperCode: 'TEST-101',
    setLetter: 'P',
    duration: '3 Hours',
    totalMarks: 20,
    instructions: ['All questions are compulsory.', 'Assume suitable data if required.'],
    sections: [
      {
        title: 'SECTION - I',
        totalMarks: '20',
        instructions: 'Attempt all questions.',
        questions: [
          { number: 'Q.1', text: 'Which scheduler is non-preemptive?', marks: '1', options: ['FCFS', 'SJF', 'Round Robin', 'Priority'] },
          {
            number: 'Q.2',
            text: 'Consider the following processes and compute the average waiting time.',
            marks: '9',
            tables: [
              {
                columns: ['Process', 'Arrival Time (ms)', 'Burst Time (ms)'],
                rows: [
                  ['P1', '0', '7'],
                  ['P2', '1', '5'],
                  ['P3', '3', '2'],
                ],
              },
            ],
            gantt: [
              { process: 'P1', start: 0, end: 5 },
              { process: 'P2', start: 5, end: 8 },
            ],
          },
          {
            number: 'Q.3',
            // Real Unicode, so the self-test actually proves the engine can set it.
            text: 'Explain paging with a neat diagram. Unicode probe: \u2192 \u2264 \u2265 \u00d7 \u00f7 \u2013 \u2014 \u201cquoted\u201d \u2018single\u2019 \u03b1 \u03b2 \u03bc \u20b9 5',
            marks: '10',
          },
        ],
      },
    ],
  };
  return buildDocument(normalizePaperData(probe), { unicode, assets: [] });
}

/** Compile with the local binary, from the build directory, capturing everything. */
async function compileWithLocalBinary(
  buildDir: string,
  texPath: string,
  compiler: LatexCompilerInfo,
  timeoutMs: number
): Promise<LatexBuildResult> {
  const binary = compiler.command!;
  const argumentSets = [
    ['-interaction=nonstopmode', '-halt-on-error', '-file-line-error', path.basename(texPath)],
    // Second run so \\pageref{LastPage} resolves in the footer.
    ['-interaction=nonstopmode', '-halt-on-error', '-file-line-error', path.basename(texPath)],
  ];

  let log = '';
  let exitCode: number | null = 0;

  for (const args of argumentSets) {
    const result = await runBinary(binary, args, { cwd: buildDir, timeoutMs });
    log += `$ ${binary} ${args.join(' ')}\n${result.stdout}${result.stderr}\n`;
    exitCode = result.code;
    if (!result.ok) break;
  }

  const logPath = texPath.replace(/\.tex$/, '.log');
  fs.writeFileSync(logPath, log, 'utf8');

  const pdfPath = texPath.replace(/\.tex$/, '.pdf');
  const produced = fs.existsSync(pdfPath) ? fs.readFileSync(pdfPath) : null;

  if (produced && produced.length > 0 && produced.subarray(0, 5).toString('latin1') === '%PDF-') {
    return {
      success: true,
      pdfPath,
      texPath,
      logPath,
      buildDir,
      engine: binary,
      exitCode,
      log,
      sizeBytes: produced.length,
      // The assets sit beside the .tex, so the local binary can always read them.
      figuresEmbedded: true,
    };
  }

  return {
    success: false,
    texPath,
    logPath,
    buildDir,
    engine: binary,
    exitCode,
    log,
    code: 'LATEX_COMPILE_FAILED',
    error: firstLatexError(log) || `The ${binary} run did not produce a PDF.`,
  };
}

/** The first real TeX error, not the cascade that follows it. */
export function firstLatexError(log: string): string | null {
  for (const line of String(log || '').split(/\r?\n/)) {
    const match = line.match(/^\s*!\s*(.+)$/);
    if (match) return `! ${match[1].trim()}`;
  }
  return null;
}

/** Read back the produced PDF so success is never claimed on an empty file. */
async function inspectPdf(pdfPath: string): Promise<{ pageCount: number; sizeBytes: number }> {
  const buffer = fs.readFileSync(pdfPath);
  let pageCount = 0;
  try {
    pageCount = (await pdfParse(buffer)).numpages || 0;
  } catch {
    pageCount = 0;
  }
  return { pageCount, sizeBytes: buffer.length };
}

export interface LatexFallbackOptions {
  /** Figure crops to copy into the build directory. */
  figures?: Array<{ index: number; buffer: Buffer }>;
  /** Reuse this directory instead of creating one. */
  buildDir?: string;
  /** Allow the remote compilers when no local binary exists. Default true. */
  allowRemote?: boolean;
  timeoutMs?: number;
}

/**
 * The fallback engine: build the document, compile it, verify the artefact.
 *
 * Order of work: minimal document first (so a broken environment is reported as
 * such rather than blamed on the paper), then the local binary, then the
 * project's remote compilers, then an honest failure.
 */
export async function generatePdfWithLatex(
  paperData: any,
  templateData: any = {},
  options: LatexFallbackOptions = {}
): Promise<LatexBuildResult> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const compiler = await detectLatexCompiler();

  const assets: FallbackAsset[] = (options.figures || []).map((figure) => ({
    index: figure.index,
    fileName: `figure-${figure.index}.png`,
    buffer: figure.buffer,
  }));

  if (!compiler.command) {
    // No local compiler. The document is still written to disk so it can be
    // inspected, and the project's remote compilers are given one attempt.
    //
    // It is built as a pdfLaTeX document on purpose: the remote tiers run
    // pdflatex, and a fontspec preamble is a hard error there ("fontspec requires
    // either XeTeX or LuaTeX"), which would fail the fallback for a reason that
    // has nothing to do with the paper. Unicode is downgraded to LaTeX
    // equivalents instead.
    const written = generateLatexQuestionPaper(paperData, templateData, {
      assets,
      unicode: false,
      buildDir: options.buildDir,
    });
    console.warn(
      `[LATEX FALLBACK] LATEX_COMPILER_NOT_INSTALLED: ${compiler.error}. ` +
        `Source written to ${written.texPath}; trying the configured remote compilers.`
    );

    if (options.allowRemote === false) {
      return {
        success: false,
        code: 'LATEX_COMPILER_NOT_INSTALLED',
        error: `LATEX_COMPILER_NOT_INSTALLED: ${compiler.error}`,
        texPath: written.texPath,
        buildDir: written.buildDir,
      };
    }

    const resources: LatexCompileResource[] = assets.map((asset) => ({
      path: `assets/${asset.fileName}`,
      content: asset.buffer.toString('base64'),
      encoding: 'base64',
    }));

    const remote = await compileLatexUniversal({
      latex: written.latex,
      engine: 'pdflatex',
      smart: true,
      timeoutMs: Math.min(timeoutMs, 60_000),
      resources,
    });

    const logPath = written.texPath.replace(/\.tex$/, '.log');
    fs.writeFileSync(logPath, String(remote.log || remote.error || 'no compiler output'), 'utf8');

    if (!remote.success || !remote.pdfBuffer?.length) {
      return {
        success: false,
        // No local compiler is the actionable problem here, whatever the remote
        // tier said, so the caller is told exactly that.
        code: 'LATEX_COMPILER_NOT_INSTALLED',
        error:
          `LATEX_COMPILER_NOT_INSTALLED: ${compiler.error}. The configured remote compilers were ` +
          `tried as well and did not produce a PDF (${remote.error || 'no output'}).`,
        remoteError: remote.error || 'The remote LaTeX compilers did not produce a PDF.',
        texPath: written.texPath,
        logPath,
        buildDir: written.buildDir,
        engine: remote.compilerService || 'remote LaTeX compiler',
        log: remote.log,
      };
    }

    const pdfPath = written.texPath.replace(/\.tex$/, '.pdf');
    fs.writeFileSync(pdfPath, remote.pdfBuffer);
    const details = await inspectPdf(pdfPath);
    if (details.pageCount <= 0) {
      return {
        success: false,
        code: 'LATEX_PDF_UNREADABLE',
        error: 'A PDF was produced but it could not be re-opened as a readable document.',
        texPath: written.texPath,
        logPath,
        buildDir: written.buildDir,
        engine: remote.compilerService || 'remote LaTeX compiler',
      };
    }

    return {
      success: true,
      pdfPath,
      texPath: written.texPath,
      logPath,
      buildDir: written.buildDir,
      engine: `${remote.compilerService || 'remote LaTeX compiler'} (no local LaTeX installed)`,
      pageCount: details.pageCount,
      sizeBytes: details.sizeBytes,
      // The self-hosted CLSI tier writes resource files; the cloud tiers do not.
      figuresEmbedded: remote.compilerService === 'Self-Hosted LaTeX (CLSI)',
      log: remote.log,
    };
  }

  // 1. Prove the environment before blaming the document.
  const buildDir = options.buildDir || makeBuildDir();
  const minimalPath = path.join(buildDir, 'minimal_test.tex');
  fs.writeFileSync(minimalPath, MINIMAL_TEST_DOCUMENT, 'utf8');
  const minimal = await compileWithLocalBinary(buildDir, minimalPath, compiler, 60_000);
  if (!minimal.success) {
    return {
      success: false,
      code: 'LATEX_COMPILE_FAILED',
      error: `The ${compiler.command} environment cannot compile a minimal document, so the paper was not attempted: ${minimal.error}`,
      texPath: minimalPath,
      logPath: minimal.logPath,
      buildDir,
      engine: compiler.command,
      exitCode: minimal.exitCode,
      log: minimal.log,
    };
  }
  console.log(`[LATEX FALLBACK] ${compiler.command} compiled the minimal test document.`);

  // 2. The real document.
  const written = generateLatexQuestionPaper(paperData, templateData, {
    assets,
    unicode: compiler.unicode,
    buildDir,
  });
  const compiled = await compileWithLocalBinary(buildDir, written.texPath, compiler, timeoutMs);
  if (!compiled.success) return compiled;

  const details = await inspectPdf(compiled.pdfPath!);
  if (details.pageCount <= 0) {
    return {
      ...compiled,
      success: false,
      code: 'LATEX_PDF_UNREADABLE',
      error: 'A PDF was produced but it could not be re-opened as a readable document.',
    };
  }
  return { ...compiled, pageCount: details.pageCount, sizeBytes: details.sizeBytes };
}

/**
 * Preflight report: is there a compiler, and can it build a document?
 *
 * The first thing to run when a paper will not typeset, because it separates a
 * broken environment from broken content.
 */
export async function latexFallbackHealth(): Promise<{
  connected: boolean;
  compiler: string | null;
  unicode: boolean;
  version?: string;
  minimalDocumentCompiles: boolean;
  templateSelfTestCompiles: boolean;
  error?: string;
  texPath?: string;
  log?: string;
}> {
  const compiler = await detectLatexCompiler(true);
  if (!compiler.command) {
    return {
      connected: false,
      compiler: null,
      unicode: false,
      minimalDocumentCompiles: false,
      templateSelfTestCompiles: false,
      error: `LATEX_COMPILER_NOT_INSTALLED: ${compiler.error}`,
    };
  }

  const buildDir = makeBuildDir();
  const minimalPath = path.join(buildDir, 'minimal_test.tex');
  fs.writeFileSync(minimalPath, MINIMAL_TEST_DOCUMENT, 'utf8');
  const minimal = await compileWithLocalBinary(buildDir, minimalPath, compiler, 60_000);

  let selfTest = false;
  let log = minimal.log;
  if (minimal.success) {
    const selfPath = path.join(buildDir, 'template_self_test.tex');
    fs.writeFileSync(selfPath, templateSelfTestDocument(compiler.unicode), 'utf8');
    const compiledSelf = await compileWithLocalBinary(buildDir, selfPath, compiler, 90_000);
    selfTest = compiledSelf.success;
    log = compiledSelf.log || log;
  }

  return {
    connected: minimal.success,
    compiler: compiler.command,
    unicode: compiler.unicode,
    version: compiler.version,
    minimalDocumentCompiles: minimal.success,
    templateSelfTestCompiles: selfTest,
    error: minimal.success ? undefined : minimal.error,
    texPath: minimal.texPath,
    log,
  };
}

import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { uploadDocumentToCloudinary } from './cloudinary.ts';

const LATEX_ONLINE_BASE_URL = process.env.LATEX_ONLINE_BASE_URL || 'https://latexonline.cc';
const FORMATEX_BASE_URL = process.env.FORMATEX_BASE_URL || 'https://api.formatex.io/api/v1';
const FORMATEX_API_KEY = process.env.FORMATEX_API_KEY || 'fex_b908adc11e4806a1c4877fb32105c1bb19e533378b3f0b4fd866148f701b061c';

export interface FormatexCompileOptions {
  latex: string;
  engine?: 'pdflatex' | 'xelatex' | 'lualatex' | 'latexmk';
  smart?: boolean;
  timeoutMs?: number;
  preferEngine?: 'latexonline' | 'formatex' | 'auto';
}

export interface FormatexCompileResult {
  success: boolean;
  pdfBuffer?: Buffer;
  error?: string;
  log?: string;
  engine?: string;
  durationMs?: number;
  jobId?: string;
  compilationsRemaining?: number;
  compilerService?: 'LaTeX.Online (Free)' | 'FormaTeX Cloud';
}

/**
 * Minimal in-memory POSIX ustar tarball generator for single file compilation
 */
function createUstarArchive(filename: string, content: string | Buffer): Buffer {
  const fileBuf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
  const header = Buffer.alloc(512);

  header.write(filename, 0, 100, 'ascii');
  header.write('0000644\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  const sizeOctal = fileBuf.length.toString(8).padStart(11, '0') + '\0';
  header.write(sizeOctal, 124, 12, 'ascii');
  const mtimeOctal = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0';
  header.write(mtimeOctal, 136, 12, 'ascii');
  header.write('0', 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');

  header.fill(0x20, 148, 156);
  let checksum = 0;
  for (let i = 0; i < 512; i++) checksum += header[i];
  const checksumOctal = checksum.toString(8).padStart(6, '0') + '\0 ';
  header.write(checksumOctal, 148, 8, 'ascii');

  const remainder = fileBuf.length % 512;
  const paddingLength = remainder === 0 ? 0 : 512 - remainder;
  const padding = Buffer.alloc(paddingLength);
  const eof = Buffer.alloc(1024);

  return Buffer.concat([header, fileBuf, padding, eof]);
}

/**
 * Check connectivity and status of Free LaTeX.Online Cloud Compiler (latexonline.cc)
 */
export async function getLatexOnlineHealth(): Promise<{ connected: boolean; service: string; engine?: string; error?: string }> {
  try {
    const testDoc = '\\documentclass{article}\\begin{document}ZeroLeak Health Check\\end{document}';
    const testUrl = `${LATEX_ONLINE_BASE_URL}/compile?text=${encodeURIComponent(testDoc)}&command=pdflatex`;
    const res = await fetch(testUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      return { connected: true, service: 'LaTeX.Online (Free)', engine: 'pdflatex' };
    }
    const errText = await res.text();
    return { connected: false, service: 'LaTeX.Online (Free)', error: `LaTeX.Online returned status ${res.status}: ${errText.slice(0, 150)}` };
  } catch (err: any) {
    return { connected: false, service: 'LaTeX.Online (Free)', error: err?.message || 'Failed to connect to LaTeX.Online' };
  }
}

/**
 * Compile LaTeX into PDF using Free LaTeX.Online cloud compiler (https://latexonline.cc)
 * Uses multipart tar POST to avoid URL length constraints, with GET as fallback.
 */
export async function compileWithLatexOnline(options: {
  latex: string;
  command?: 'pdflatex' | 'xelatex' | 'lualatex';
  timeoutMs?: number;
}): Promise<FormatexCompileResult> {
  const { latex, command = 'pdflatex', timeoutMs = 35000 } = options;
  if (!latex || !latex.trim()) {
    return { success: false, error: 'No LaTeX source provided for compilation.' };
  }

  const startTime = Date.now();

  // 1. Try POST /data?target=main.tex with multipart tarball (No URL size limits)
  try {
    const tarBuffer = createUstarArchive('main.tex', latex);
    const formData = new FormData();
    const blob = new Blob([tarBuffer], { type: 'application/x-tar' });
    formData.append('file', blob, 'archive.tar');

    const postUrl = `${LATEX_ONLINE_BASE_URL}/data?target=main.tex&command=${command}`;
    const res = await fetch(postUrl, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const durationMs = Date.now() - startTime;
    if (res.ok) {
      const arrayBuf = await res.arrayBuffer();
      const pdfBuffer = Buffer.from(arrayBuf);
      return {
        success: true,
        pdfBuffer,
        engine: command,
        compilerService: 'LaTeX.Online (Free)',
        durationMs,
      };
    }

    const errorBody = await res.text();
    if (res.status === 400 && errorBody.includes('error:')) {
      return {
        success: false,
        error: `LaTeX.Online compilation syntax error: ${errorBody.slice(0, 300)}`,
        durationMs,
        compilerService: 'LaTeX.Online (Free)',
      };
    }
  } catch (postErr: any) {
    console.warn('[compileWithLatexOnline] POST /data failed, trying GET fallback:', postErr.message);
  }

  // 2. Fallback to GET /compile?text=... for short documents
  try {
    const compileUrl = `${LATEX_ONLINE_BASE_URL}/compile?text=${encodeURIComponent(latex)}&command=${command}`;
    const res = await fetch(compileUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });

    const durationMs = Date.now() - startTime;
    if (res.ok) {
      const arrayBuf = await res.arrayBuffer();
      const pdfBuffer = Buffer.from(arrayBuf);
      return {
        success: true,
        pdfBuffer,
        engine: command,
        compilerService: 'LaTeX.Online (Free)',
        durationMs,
      };
    }

    const errorBody = await res.text();
    return {
      success: false,
      error: `LaTeX.Online compilation failed (${res.status}): ${errorBody.slice(0, 300)}`,
      durationMs,
      compilerService: 'LaTeX.Online (Free)',
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      error: err?.message || 'LaTeX.Online compilation request failed',
      compilerService: 'LaTeX.Online (Free)',
      durationMs,
    };
  }
}

/**
 * Check connectivity and validity of FormaTeX Cloud LaTeX API Key
 */
export async function getFormatexHealth(): Promise<{ connected: boolean; engine?: string; error?: string }> {
  try {
    const testDoc = '\\documentclass{article}\\begin{document}ZeroLeak Health Check\\end{document}';
    const res = await fetch(`${FORMATEX_BASE_URL}/compile`, {
      method: 'POST',
      headers: {
        'X-API-Key': FORMATEX_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        latex: testDoc,
        engine: 'pdflatex',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      return { connected: true, engine: 'pdflatex' };
    }
    const errText = await res.text();
    return { connected: false, error: `FormaTeX returned status ${res.status}: ${errText}` };
  } catch (err: any) {
    return { connected: false, error: err?.message || 'Failed to connect to FormaTeX API' };
  }
}

/**
 * Intelligent sanitization and repair for LaTeX question strings.
 * Preserves math environments ($...$, $$...$$, \[...\], \(...\)) while safely escaping unescaped special characters.
 */
export function cleanAndSanitizeLatex(rawText: string): string {
  if (!rawText) return '';
  let text = String(rawText).trim();

  const mathSegments: string[] = [];
  const placeholder = (i: number) => `ZZMATHBLOCK${i}ZZ`;

  // Protect all LaTeX math environments
  const mathRegex = /(\$\$[\s\S]+?\$\$|\$[^$\r\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g;
  text = text.replace(mathRegex, (match) => {
    const idx = mathSegments.length;
    mathSegments.push(match);
    return placeholder(idx);
  });

  // Safely escape special LaTeX characters that are unescaped in text
  text = text.replace(/(?<!\\)&/g, '\\&');
  text = text.replace(/(?<!\\)%/g, '\\%');
  text = text.replace(/(?<!\\)#/g, '\\#');
  text = text.replace(/(?<!\\)_/g, '\\_');
  text = text.replace(/(?<!\\)~/g, '\\textasciitilde{}');
  text = text.replace(/(?<!\\)\^/g, '\\textasciicircum{}');

  // Restore protected math environments
  for (let i = 0; i < mathSegments.length; i++) {
    text = text.split(placeholder(i)).join(mathSegments[i]);
  }

  return text;
}

/**
 * Generate a complete, publication-grade university/board question paper in clean LaTeX
 */
export function generateUniversityLatexDocument(params: {
  exam: any;
  setLetter?: string;
  mcqs?: any[];
  theorySec1?: any[];
  theorySec2?: any[];
  durationMinutes?: number;
  totalMarks?: number;
}): string {
  const {
    exam = {},
    setLetter = 'P',
    mcqs = [],
    theorySec1 = [],
    theorySec2 = [],
    durationMinutes = exam.duration_minutes || exam.time_limit_mins || 180,
    totalMarks = exam.total_marks || exam.max_marks || 70,
  } = params;

  const universityName = cleanAndSanitizeLatex(exam.university_name || 'AUTONOMOUS STATE EXAMINATION BOARD');
  const examTitle = cleanAndSanitizeLatex(exam.name || 'ANNUAL UNIVERSITY EXAMINATION 2026');
  const subjectName = cleanAndSanitizeLatex(exam.subject || 'Core Engineering & Technology');
  const paperCode = cleanAndSanitizeLatex(exam.code || exam.paper_code || 'SLR-HL-475');
  const blueprintPattern = cleanAndSanitizeLatex(exam.blueprint_pattern || 'CBCS Pattern');
  const markingScheme = cleanAndSanitizeLatex(exam.marking_scheme || 'Standard University Marking Scheme');

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Prepare MCQs Section
  const mcqLines: string[] = [];
  mcqs.forEach((mcq, mIdx) => {
    const qText = cleanAndSanitizeLatex(mcq.content_text || mcq.question_text || `Question ${mIdx + 1}`);
    let opts = mcq.options;
    if (typeof opts === 'string') {
      try { opts = JSON.parse(opts); } catch { opts = []; }
    }
    if (!Array.isArray(opts)) opts = [];

    mcqLines.push(`  \\item ${qText}`);
    if (opts.length > 0) {
      mcqLines.push(`  \\begin{enumerate}[label=\\textbf{\\alph*)}]`);
      opts.forEach((opt: any) => {
        const optText = typeof opt === 'object' ? (opt.text || opt.label || '') : String(opt);
        mcqLines.push(`    \\item ${cleanAndSanitizeLatex(optText)}`);
      });
      mcqLines.push(`  \\end{enumerate}`);
    }
    mcqLines.push(`  \\vspace{1.5mm}`);
  });

  // Prepare Theory Section I
  const theory1Lines: string[] = [];
  theorySec1.forEach((tq, tIdx) => {
    const tText = cleanAndSanitizeLatex(tq.content_text || tq.question_text || `Theory question ${tIdx + 1}`);
    const marks = tq.marks || 4;
    theory1Lines.push(`  \\item ${tText} \\hfill \\textbf{[${marks}]} \\vspace{1.5mm}`);
  });

  // Prepare Theory Section II
  const theory2Lines: string[] = [];
  theorySec2.forEach((tq, tIdx) => {
    const tText = cleanAndSanitizeLatex(tq.content_text || tq.question_text || `Analytical problem ${tIdx + 1}`);
    const marks = tq.marks || 4;
    theory2Lines.push(`  \\item ${tText} \\hfill \\textbf{[${marks}]} \\vspace{1.5mm}`);
  });

  const mcqSectionLatex = mcqLines.length > 0 ? `
% --- Section: Q.1 MCQs ---
\\noindent
\\textbf{\\large Q.1 Choose the correct alternatives for the following questions.} \\hfill \\textbf{[${mcqs.length} Marks]}

\\begin{enumerate}[label=\\textbf{\\arabic*.} , leftmargin=6mm, itemsep=2mm]
${mcqLines.join('\n')}
\\end{enumerate}
\\vspace{4mm}
\\hrule
\\vspace{4mm}
` : '';

  const section1Latex = theory1Lines.length > 0 ? `
% --- Section I: Theory & Concepts ---
\\begin{center}
  {\\large \\textbf{\\color{boardblue}SECTION -- I (Theory \\& Core Concepts)}} \\hfill \\textbf{[${Math.round(totalMarks * 0.4)} Marks]}
\\end{center}
\\vspace{2mm}

\\noindent
\\textbf{Q.2 Answer the following questions (Attempt Any Four):} \\hfill \\textbf{[16 Marks]}
\\begin{enumerate}[label=\\textbf{\\alph*)} , leftmargin=6mm, itemsep=2mm]
${(theory1Lines.slice(0, 5).length > 0 ? theory1Lines.slice(0, 5) : theory1Lines).join('\n')}
\\end{enumerate}

\\vspace{3mm}
\\noindent
\\textbf{Q.3 Answer the following questions in detail (Attempt Any Two):} \\hfill \\textbf{[12 Marks]}
\\begin{enumerate}[label=\\textbf{\\alph*)} , leftmargin=6mm, itemsep=2mm]
${(theory1Lines.slice(5).length > 0 ? theory1Lines.slice(5) : theory1Lines.slice(0, 2)).join('\n')}
\\end{enumerate}
\\vspace{4mm}
\\hrule
\\vspace{4mm}
` : '';

  const section2Latex = theory2Lines.length > 0 ? `
% --- Section II: Analysis & Applications ---
\\begin{center}
  {\\large \\textbf{\\color{boardblue}SECTION -- II (Analysis, Design \\& Applications)}} \\hfill \\textbf{[${Math.round(totalMarks * 0.4)} Marks]}
\\end{center}
\\vspace{2mm}

\\noindent
\\textbf{Q.4 Answer the following questions (Attempt Any Four):} \\hfill \\textbf{[16 Marks]}
\\begin{enumerate}[label=\\textbf{\\alph*)} , leftmargin=6mm, itemsep=2mm]
${(theory2Lines.slice(0, 5).length > 0 ? theory2Lines.slice(0, 5) : theory2Lines).join('\n')}
\\end{enumerate}

\\vspace{3mm}
\\noindent
\\textbf{Q.5 Solve / Explain the following technical problems:} \\hfill \\textbf{[12 Marks]}
\\begin{enumerate}[label=\\textbf{\\alph*)} , leftmargin=6mm, itemsep=2mm]
${(theory2Lines.slice(5).length > 0 ? theory2Lines.slice(5) : theory2Lines.slice(0, 2)).join('\n')}
\\end{enumerate}
` : '';

  // Safe fallback if no question lines exist
  const fallbackQuestions = (!mcqSectionLatex && !section1Latex && !section2Latex) ? `
\\noindent
\\textbf{\\large Examination Questions}
\\begin{enumerate}[label=\\textbf{\\arabic*.} , leftmargin=6mm, itemsep=3mm]
  \\item Explain the fundamental concepts, system architecture, and design methodology of ${subjectName}. \\hfill \\textbf{[10]}
  \\item Differentiate between primary algorithms and evaluate their performance characteristics. \\hfill \\textbf{[10]}
\\end{enumerate}
` : '';

  return `\\documentclass[11pt,a4paper]{article}
\\usepackage[top=20mm,bottom=20mm,left=18mm,right=18mm]{geometry}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{enumitem}
\\usepackage{fancyhdr}
\\usepackage{booktabs}
\\usepackage{tabularx}
\\usepackage{microtype}
\\usepackage{xcolor}

% Color definitions
\\definecolor{boardblue}{RGB}{15, 23, 42}
\\definecolor{accentcrimson}{RGB}{190, 18, 60}
\\definecolor{watermarkgray}{RGB}{148, 163, 184}

% Page style & Confidential Watermark
\\pagestyle{fancy}
\\fancyhf{}
\\renewcommand{\\headrulewidth}{0.5pt}
\\renewcommand{\\footrulewidth}{0.5pt}
\\lhead{\\small\\textbf{\\color{accentcrimson}ZEROLEAK SECURE VAULT} $\\cdot$ \\textsf{CONFIDENTIAL}}
\\chead{\\small\\textsf{Paper Code: \\textbf{${paperCode}}}}
\\rhead{\\small\\textbf{\\color{boardblue}SET: ${setLetter}}}
\\lfoot{\\footnotesize Generated via FormaTeX \\& ZeroLeak Cryptographic Engine}
\\rfoot{\\footnotesize Page \\textbf{\\thepage}}

\\begin{document}

% --- Seat Number Box & Paper Header ---
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
  {\\Large \\textbf{\\color{boardblue}${universityName}}}\\\\[1.5mm]
  {\\large \\textbf{${examTitle}}}\\\\[1.5mm]
  {\\normalsize \\textbf{Subject: ${subjectName}} \\quad $\\cdot$ \\quad \\textbf{Pattern: ${blueprintPattern}}}\\\\[2mm]
  \\hrule height 1.2pt
  \\vspace{1.5mm}
  \\begin{tabularx}{\\textwidth}{@{}l X r@{}}
    \\textbf{Day \\& Date:} ${todayStr} & 
    \\centering \\textbf{Duration:} ${durationMinutes} Minutes & 
    \\textbf{Max. Marks:} ${totalMarks} Marks
  \\end{tabularx}
  \\vspace{1mm}
  \\hrule height 0.6pt
\\end{center}

\\vspace{2mm}

% --- General Instructions ---
\\noindent
\\textbf{\\underline{Instructions for Candidates:}}
\\begin{enumerate}[label=\\textbf{\\arabic*.} , itemsep=0.5mm, topsep=1mm]
  \\item Q.1 is compulsory. Mention the question paper set \\textbf{(${setLetter})} clearly on top of the answer booklet.
  \\item Figures to the right indicate full marks assigned to each question.
  \\item Assume suitable data wherever necessary and state your assumptions explicitly.
  \\item Use of programmable calculators or unauthorized electronic communication devices is strictly prohibited.
  \\item ${markingScheme}
\\end{enumerate}

\\vspace{4mm}
\\hrule
\\vspace{3mm}

${mcqSectionLatex}
${section1Latex}
${section2Latex}
${fallbackQuestions}

\\vspace{6mm}
\\begin{center}
  \\textsf{\\footnotesize --- END OF QUESTION PAPER (${setLetter}) ---}
\\end{center}

\\end{document}`;
}

/**
 * Compile LaTeX into PDF using FormaTeX REST API
 */
export async function compileLatexWithFormatex(options: FormatexCompileOptions): Promise<FormatexCompileResult> {
  const { latex, engine = 'pdflatex', smart = true, timeoutMs = 30000 } = options;
  if (!latex || !latex.trim()) {
    return { success: false, error: 'No LaTeX source provided for compilation.' };
  }

  const startTime = Date.now();
  const endpoint = smart ? `${FORMATEX_BASE_URL}/compile/smart` : `${FORMATEX_BASE_URL}/compile`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-API-Key': FORMATEX_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        latex,
        engine,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const durationMs = Date.now() - startTime;
    const jobId = res.headers.get('x-job-id') || undefined;
    const remainingHeader = res.headers.get('x-compilations-remaining') || res.headers.get('x-ratelimit-remaining');
    const compilationsRemaining = remainingHeader ? parseInt(remainingHeader, 10) : undefined;

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/pdf')) {
        const arrayBuf = await res.arrayBuffer();
        const pdfBuffer = Buffer.from(arrayBuf);
        return {
          success: true,
          pdfBuffer,
          engine,
          durationMs,
          jobId,
          compilationsRemaining,
        };
      }

      // JSON response
      const jsonRes = (await res.json()) as any;
      if (jsonRes.pdfBase64) {
        return {
          success: true,
          pdfBuffer: Buffer.from(jsonRes.pdfBase64, 'base64'),
          engine,
          durationMs,
          jobId,
          compilationsRemaining,
        };
      }
    }

    // Try fallback to standard /compile if /compile/smart returned non-200
    if (smart) {
      return await compileLatexWithFormatex({ ...options, smart: false });
    }

    const errorBody = await res.text();
    return {
      success: false,
      error: `FormaTeX compilation failed (${res.status}): ${errorBody.slice(0, 300)}`,
      durationMs,
      jobId,
      compilationsRemaining,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      error: err?.message || 'FormaTeX compilation request failed',
      durationMs,
    };
  }
}

/**
 * Universal Dual-Engine Compiler:
 * 1. Primary: Free LaTeX.Online cloud compiler (https://latexonline.cc) - Fast, unlimited, no API key needed
 * 2. Secondary Fallback: FormaTeX Cloud REST API (https://api.formatex.io)
 */
export async function compileLatexUniversal(options: FormatexCompileOptions): Promise<FormatexCompileResult> {
  const { preferEngine = 'auto' } = options;

  if (preferEngine === 'formatex') {
    return await compileLatexWithFormatex(options);
  }

  // Try Primary Free Engine: LaTeX.Online
  try {
    const onlineEngine = (options.engine === 'xelatex' || options.engine === 'lualatex') ? options.engine : 'pdflatex';
    const res = await compileWithLatexOnline({
      latex: options.latex,
      command: onlineEngine,
      timeoutMs: options.timeoutMs || 30000,
    });

    if (res.success && res.pdfBuffer && res.pdfBuffer.length > 0) {
      return res;
    }
    console.warn(`[LatexCompiler] LaTeX.Online attempt failed: ${res.error}. Falling back to FormaTeX...`);
  } catch (err: any) {
    console.warn(`[LatexCompiler] LaTeX.Online exception: ${err.message}. Falling back to FormaTeX...`);
  }

  // Fallback to FormaTeX
  return await compileLatexWithFormatex(options);
}

/**
 * High-level helper: Generate complete LaTeX for exam, compile with Universal LaTeX engine (LaTeX.Online primary, FormaTeX fallback), and upload to Cloudinary & local cache
 */
export async function generateAndUploadFormatexPdf(params: {
  exam: any;
  setLetter: string;
  mcqs: any[];
  theorySec1?: any[];
  theorySec2?: any[];
  customLatex?: string;
  preferEngine?: 'latexonline' | 'formatex' | 'auto';
}): Promise<{
  success: boolean;
  pdfUrl?: string;
  cloudinaryPublicId?: string;
  latex: string;
  sizeBytes?: number;
  checksumSha256?: string;
  compilerService?: string;
  error?: string;
}> {
  const { exam, setLetter, customLatex, preferEngine = 'auto' } = params;
  const latex = customLatex && customLatex.trim() ? customLatex : generateUniversityLatexDocument(params);

  const compilation = await compileLatexUniversal({
    latex,
    engine: 'pdflatex',
    smart: true,
    preferEngine,
  });

  if (!compilation.success || !compilation.pdfBuffer) {
    return {
      success: false,
      latex,
      error: compilation.error || 'Failed to compile PDF with LaTeX online engine',
    };
  }

  const pdfBuffer = compilation.pdfBuffer;
  const checksumSha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const filename = `${exam.code || 'EXAM'}_Set_${setLetter}_Official_Paper.pdf`;

  // Save to local cache
  const localOutputDir = path.join(process.cwd(), 'public', 'compiled_papers');
  if (!fs.existsSync(localOutputDir)) {
    fs.mkdirSync(localOutputDir, { recursive: true });
  }
  const localFilePath = path.join(localOutputDir, filename);
  fs.writeFileSync(localFilePath, pdfBuffer);

  const localUrl = `/compiled_papers/${filename}`;
  let cloudinaryUrl = localUrl;
  let cloudinaryPublicId: string | undefined;

  // Upload to Cloudinary
  try {
    const uploadRes = await uploadDocumentToCloudinary(
      `data:application/pdf;base64,${pdfBuffer.toString('base64')}`,
      filename,
      'zeroleak/formatex-papers'
    );
    if (uploadRes?.secure_url) {
      cloudinaryUrl = uploadRes.secure_url;
      cloudinaryPublicId = uploadRes.public_id;
    }
  } catch (cErr) {
    console.warn('Could not upload PDF to Cloudinary, using local cache:', cErr);
  }

  return {
    success: true,
    pdfUrl: cloudinaryUrl,
    cloudinaryPublicId,
    latex,
    sizeBytes: pdfBuffer.length,
    checksumSha256,
    compilerService: compilation.compilerService || 'LaTeX.Online (Free)',
  };
}


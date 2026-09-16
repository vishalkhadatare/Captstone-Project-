import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { uploadDocumentToCloudinary } from './cloudinary.ts';

const FORMATEX_BASE_URL = process.env.FORMATEX_BASE_URL || 'https://api.formatex.io/api/v1';
const FORMATEX_API_KEY = process.env.FORMATEX_API_KEY || 'fex_b908adc11e4806a1c4877fb32105c1bb19e533378b3f0b4fd866148f701b061c';

export interface FormatexCompileOptions {
  latex: string;
  engine?: 'pdflatex' | 'xelatex' | 'lualatex' | 'latexmk';
  smart?: boolean;
  timeoutMs?: number;
}

export interface FormatexCompileResult {
  success: boolean;
  pdfBuffer?: Buffer;
  error?: string;
  log?: string;
  engine?: string;
  durationMs?: number;
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
 * Preserves math environments ($...$, $$...$$, \begin{...}) while safely escaping unescaped special characters.
 */
export function cleanAndSanitizeLatex(rawText: string): string {
  if (!rawText) return '';
  let text = String(rawText).trim();

  // If text doesn't already contain full LaTeX math tags, safely escape raw characters
  // Split by inline math segments to avoid escaping inside math formulas
  const mathSegments = text.split(/(\$[^$]+\$|\$\$[^$]+\$\$|\\\[[\s\S]+?\\\])/g);

  const sanitized = mathSegments.map((segment, idx) => {
    // If it's a math segment, leave math symbols intact
    if (idx % 2 === 1) {
      return segment;
    }

    // Escape non-math special characters safely
    return segment
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/&/g, '\\&')
      .replace(/%/g, '\\%')
      .replace(/#/g, '\\#')
      .replace(/_/g, '\\_')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\^/g, '\\textasciicircum{}')
      .replace(/~/g, '\\textasciitilde{}')
      // Restore standard macros if mistakenly escaped
      .replace(/\\textbackslash\{\}textbf/g, '\\textbf')
      .replace(/\\textbackslash\{\}textit/g, '\\textit')
      .replace(/\\textbackslash\{\}item/g, '\\item')
      .replace(/\\textbackslash\{\}quad/g, '\\quad')
      .replace(/\\textbackslash\{\}vspace/g, '\\vspace')
      .replace(/\\textbackslash\{\}hfill/g, '\\hfill')
      .replace(/\\textbackslash\{\}alpha/g, '\\alpha')
      .replace(/\\textbackslash\{\}beta/g, '\\beta')
      .replace(/\\textbackslash\{\}gamma/g, '\\gamma')
      .replace(/\\textbackslash\{\}theta/g, '\\theta')
      .replace(/\\textbackslash\{\}pi/g, '\\pi')
      .replace(/\\textbackslash\{\}sigma/g, '\\sigma')
      .replace(/\\textbackslash\{\}omega/g, '\\omega')
      .replace(/\\textbackslash\{\}frac/g, '\\frac')
      .replace(/\\textbackslash\{\}sqrt/g, '\\sqrt')
      .replace(/\\textbackslash\{\}sum/g, '\\sum')
      .replace(/\\textbackslash\{\}int/g, '\\int')
      .replace(/\\textbackslash\{\}times/g, '\\times')
      .replace(/\\textbackslash\{\}le/g, '\\le')
      .replace(/\\textbackslash\{\}ge/g, '\\ge')
      .replace(/\\textbackslash\{\}neq/g, '\\neq')
      .replace(/\\textbackslash\{\}rightarrow/g, '\\rightarrow');
  }).join('');

  return sanitized;
}

/**
 * Generate a complete, elegant university/board question paper in clean LaTeX
 */
export function generateUniversityLatexDocument(params: {
  exam: any;
  setLetter: string;
  mcqs: any[];
  theorySec1?: any[];
  theorySec2?: any[];
  durationMinutes?: number;
  totalMarks?: number;
}): string {
  const { exam, setLetter = 'P', mcqs = [], theorySec1 = [], theorySec2 = [], durationMinutes = 180, totalMarks = 70 } = params;

  const universityName = cleanAndSanitizeLatex(exam.university_name || 'AUTONOMOUS STATE EXAMINATION BOARD');
  const examTitle = cleanAndSanitizeLatex(exam.name || 'ANNUAL UNIVERSITY EXAMINATION 2026');
  const subjectName = cleanAndSanitizeLatex(exam.subject || 'Core Engineering \\& Technology');
  const paperCode = cleanAndSanitizeLatex(exam.code || exam.paper_code || 'SLR-HL-475');
  const blueprintPattern = cleanAndSanitizeLatex(exam.blueprint_pattern || 'CBCS Pattern');
  const markingScheme = cleanAndSanitizeLatex(exam.marking_scheme || 'Standard Marking Scheme');

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

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

  const theory1Lines: string[] = [];
  theorySec1.forEach((tq, tIdx) => {
    const tText = cleanAndSanitizeLatex(tq.content_text || tq.question_text || `Theory question ${tIdx + 1}`);
    const marks = tq.marks || 4;
    theory1Lines.push(`  \\item ${tText} \\hfill \\textbf{[${marks}]} \\vspace{1.5mm}`);
  });

  const theory2Lines: string[] = [];
  theorySec2.forEach((tq, tIdx) => {
    const tText = cleanAndSanitizeLatex(tq.content_text || tq.question_text || `Analytical problem ${tIdx + 1}`);
    const marks = tq.marks || 4;
    theory2Lines.push(`  \\item ${tText} \\hfill \\textbf{[${marks}]} \\vspace{1.5mm}`);
  });

  return `\\documentclass[11pt,a4paper]{article}
\\usepackage[top=20mm,bottom=20mm,left=18mm,right=18mm]{geometry}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{enumitem}
\\usepackage{fancyhdr}
\\usepackage{titlesec}
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

% --- Section: Q.1 MCQs ---
\\noindent
\\textbf{\\large Q.1 Choose the correct alternatives for the following questions.} \\hfill \\textbf{[${mcqs.length || 14} Marks]}

\\begin{enumerate}[label=\\textbf{\\arabic*.} , leftmargin=6mm, itemsep=2mm]
${mcqLines.join('\n')}
\\end{enumerate}

\\vspace{5mm}
\\hrule
\\vspace{4mm}

% --- Section I: Theory & Concepts ---
\\begin{center}
  {\\large \\textbf{\\color{boardblue}SECTION -- I (Theory \\& Core Concepts)}} \\hfill \\textbf{[28 Marks]}
\\end{center}
\\vspace{2mm}

\\noindent
\\textbf{Q.2 Answer the following questions (Attempt Any Four):} \\hfill \\textbf{[16 Marks]}
\\begin{enumerate}[label=\\textbf{\\alph*)} , leftmargin=6mm, itemsep=2mm]
${theory1Lines.slice(0, 5).join('\n')}
\\end{enumerate}

\\vspace{3mm}
\\noindent
\\textbf{Q.3 Answer the following questions in detail (Attempt Any Two):} \\hfill \\textbf{[12 Marks]}
\\begin{enumerate}[label=\\textbf{\\alph*)} , leftmargin=6mm, itemsep=2mm]
${theory1Lines.slice(5).length > 0 ? theory1Lines.slice(5).join('\n') : theory1Lines.slice(0, 2).join('\n')}
\\end{enumerate}

\\vspace{5mm}
\\hrule
\\vspace{4mm}

% --- Section II: Analysis & Applications ---
\\begin{center}
  {\\large \\textbf{\\color{boardblue}SECTION -- II (Analysis, Design \\& Applications)}} \\hfill \\textbf{[28 Marks]}
\\end{center}
\\vspace{2mm}

\\noindent
\\textbf{Q.4 Answer the following questions (Attempt Any Four):} \\hfill \\textbf{[16 Marks]}
\\begin{enumerate}[label=\\textbf{\\alph*)} , leftmargin=6mm, itemsep=2mm]
${theory2Lines.slice(0, 5).join('\n')}
\\end{enumerate}

\\vspace{3mm}
\\noindent
\\textbf{Q.5 Solve / Explain the following technical problems:} \\hfill \\textbf{[12 Marks]}
\\begin{enumerate}[label=\\textbf{\\alph*)} , leftmargin=6mm, itemsep=2mm]
${theory2Lines.slice(5).length > 0 ? theory2Lines.slice(5).join('\n') : theory2Lines.slice(0, 2).join('\n')}
\\end{enumerate}

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
        };
      }

      // JSON response
      const jsonRes = await res.json() as any;
      if (jsonRes.pdfBase64) {
        return {
          success: true,
          pdfBuffer: Buffer.from(jsonRes.pdfBase64, 'base64'),
          engine,
          durationMs,
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
 * High-level helper: Generate complete LaTeX for exam, compile with FormaTeX, and upload to Cloudinary & local cache
 */
export async function generateAndUploadFormatexPdf(params: {
  exam: any;
  setLetter: string;
  mcqs: any[];
  theorySec1?: any[];
  theorySec2?: any[];
}): Promise<{
  success: boolean;
  pdfUrl?: string;
  cloudinaryPublicId?: string;
  latex: string;
  sizeBytes?: number;
  checksumSha256?: string;
  error?: string;
}> {
  const { exam, setLetter } = params;
  const latex = generateUniversityLatexDocument(params);

  const compilation = await compileLatexWithFormatex({
    latex,
    engine: 'pdflatex',
    smart: true,
  });

  if (!compilation.success || !compilation.pdfBuffer) {
    return {
      success: false,
      latex,
      error: compilation.error || 'Failed to compile PDF with FormaTeX',
    };
  }

  const pdfBuffer = compilation.pdfBuffer;
  const checksumSha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const filename = `${exam.code || 'EXAM'}_Set_${setLetter}_Official_FormaTeX.pdf`;

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
    console.warn('Could not upload FormaTeX PDF to Cloudinary, using local cache:', cErr);
  }

  return {
    success: true,
    pdfUrl: cloudinaryUrl,
    cloudinaryPublicId,
    latex,
    sizeBytes: pdfBuffer.length,
    checksumSha256,
  };
}

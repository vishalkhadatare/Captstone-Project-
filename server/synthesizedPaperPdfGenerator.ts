import PDFDocument from 'pdfkit';

export interface SynthesizedQuestion {
  number: string;
  text: string;
  marks?: string | number;
  options?: string[];
  orText?: string;
  orMarks?: string | number;
}

export interface SynthesizedSection {
  title: string;
  instructions?: string;
  totalMarks?: string | number;
  questions: SynthesizedQuestion[];
}

export interface SynthesizedPaperData {
  universityName: string;
  examName: string;
  subject: string;
  paperCode: string;
  setLetter: string;
  duration: string;
  totalMarks: string | number;
  date?: string;
  instructions: string[];
  sections: SynthesizedSection[];
}

/**
 * Text a model emits when it echoes the example schema instead of writing a
 * paper. These strings are prompt scaffolding, never real questions, and a
 * paper built from them is worse than no paper at all.
 */
const PLACEHOLDER_QUESTION_PATTERNS: RegExp[] = [
  /first mcq question text/i,
  /sub-?question text/i,
  /^\s*question\s*text\s*here/i,
  /^\s*(?:\.{3}|…)\s*$/,
  /^\s*sample question\b/i,
  /lorem ipsum/i,
];

const PLACEHOLDER_OPTION_PATTERN = /^\s*\(?[a-dA-D]?\)?\s*option\s*[1-9]\s*$/i;

/** True when a question body is prompt scaffolding rather than written content. */
export function isPlaceholderQuestion(text: unknown): boolean {
  const value = String(text ?? '').trim();
  if (!value) return true;
  return PLACEHOLDER_QUESTION_PATTERNS.some((pattern) => pattern.test(value));
}

/** True when a single MCQ alternative is prompt scaffolding. */
export function isPlaceholderOption(text: unknown): boolean {
  return PLACEHOLDER_OPTION_PATTERN.test(String(text ?? '').trim());
}

/**
 * Drop questions and options that are scaffolding, keeping everything real.
 *
 * A reply that consists only of the schema's own filler text collapses to an
 * empty section list, which lets the caller refuse to print a paper instead of
 * passing placeholder prose off as an examination.
 */
export function stripPlaceholderQuestions(sections: unknown): any[] {
  if (!Array.isArray(sections)) return [];
  return sections
    .map((section: any) => {
      const questions = Array.isArray(section?.questions) ? section.questions : [];
      return {
        ...section,
        questions: questions
          .map((question: any) => ({
            ...question,
            options: Array.isArray(question?.options)
              ? question.options.filter((option: any) => !isPlaceholderOption(option))
              : question?.options,
          }))
          .filter((question: any) => !isPlaceholderQuestion(question?.text)),
      };
    })
    .filter((section: any) => Array.isArray(section.questions) && section.questions.length > 0);
}

/**
 * Robust JSON & Text parser that converts AI output into a clean SynthesizedPaperData schema.
 */
export function parsePaperTextToStructure(
  rawText: string,
  defaults: {
    universityName?: string;
    subject?: string;
    paperCode?: string;
    totalMarks?: number;
    durationHours?: number;
  } = {}
): SynthesizedPaperData {
  const result: SynthesizedPaperData = {
    universityName: defaults.universityName || 'MAHARASHTRA STATE BOARD OF TECHNICAL EDUCATION',
    examName: 'B.TECH. / DIPLOMA SEMESTER EXAMINATION 2026',
    subject: defaults.subject || 'Operating Systems',
    paperCode: defaults.paperCode || 'SLR-FINAL-04',
    setLetter: '4',
    duration: `${defaults.durationHours || 3} Hours`,
    totalMarks: defaults.totalMarks || 70,
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    instructions: [
      'All questions are compulsory subject to internal choices.',
      'Figures to the right indicate full marks for each question.',
      'Draw neat, labeled diagrams wherever necessary.',
      'Assume suitable data if required and state the assumptions clearly.',
      'Use of non-programmable scientific calculator is permitted.',
    ],
    sections: [],
  };

  if (!rawText) return result;

  // 1. Try Extracting and Repairing JSON first
  let parsedJson: any = null;
  try {
    let clean = rawText.trim();
    const fence = clean.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
    if (fence) clean = fence[1].trim();

    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      clean = clean.substring(firstBrace, lastBrace + 1);
    }

    try {
      parsedJson = JSON.parse(clean);
    } catch {
      // Repair LaTeX backslashes inside JSON strings
      let repaired = clean.replace(/\\/g, '\\\\').replace(/\\\\"/g, '\\"').replace(/,\s*([}\]])/g, '$1');
      try {
        parsedJson = JSON.parse(repaired);
      } catch {}
    }
  } catch {}

  if (parsedJson && parsedJson.sections && Array.isArray(parsedJson.sections) && parsedJson.sections.length > 0) {
    if (parsedJson.universityName) result.universityName = parsedJson.universityName;
    if (parsedJson.subject) result.subject = parsedJson.subject;
    if (parsedJson.paperCode) result.paperCode = parsedJson.paperCode;
    if (parsedJson.totalMarks) result.totalMarks = parsedJson.totalMarks;
    if (parsedJson.duration) result.duration = parsedJson.duration;
    if (Array.isArray(parsedJson.instructions) && parsedJson.instructions.length > 0) {
      result.instructions = parsedJson.instructions;
    }

    result.sections = parsedJson.sections.map((s: any, sIdx: number) => ({
      title: s.title || s.sectionTitle || `SECTION – ${sIdx === 0 ? 'I' : sIdx === 1 ? 'II' : 'III'}`,
      instructions: s.instructions || s.instruction || '',
      totalMarks: s.totalMarks || s.marks || '',
      questions: Array.isArray(s.questions)
        ? s.questions.flatMap((q: any, qIdx: number) => {
            const subs = q.subQuestions || q.subquestions || q.sub_questions;
            if (Array.isArray(subs) && subs.length > 0) {
              const parentNum = q.number || q.qNumber || `Q.${qIdx + 1}`;
              const parentText = q.text || q.questionText || '';
              const expanded: SynthesizedQuestion[] = [];
              if (parentText && parentText.trim().length > 3) {
                expanded.push({
                  number: parentNum,
                  text: parentText,
                  marks: q.marks || '',
                  options: [],
                });
              }
              subs.forEach((sq: any, sqIdx: number) => {
                let opts: string[] = [];
                if (Array.isArray(sq.options)) {
                  opts = sq.options.map((o: any) => (typeof o === 'string' ? o : o.text || String(o)));
                }
                const sqLabel = sq.number || `(${String.fromCharCode(97 + sqIdx)})`;
                const fullNum = sqLabel.startsWith('Q') || sqLabel.startsWith(parentNum) ? sqLabel : `${parentNum}${sqLabel.startsWith('(') ? sqLabel : `(${sqLabel})`}`;
                expanded.push({
                  number: fullNum,
                  text: sq.text || sq.questionText || '',
                  marks: sq.marks || '',
                  options: opts,
                  orText: sq.orText || '',
                  orMarks: sq.orMarks || '',
                });
              });
              return expanded;
            }

            let opts: string[] = [];
            if (Array.isArray(q.options)) {
              opts = q.options.map((o: any) => (typeof o === 'string' ? o : o.text || String(o)));
            }
            return [{
              number: q.number || q.qNumber || `Q.${qIdx + 1}`,
              text: q.text || q.questionText || '',
              marks: q.marks || '',
              options: opts,
              orText: q.orText || q.orQuestion?.questionText || q.orQuestion?.text || '',
              orMarks: q.orMarks || q.orQuestion?.marks || '',
            }];
          })
        : [],
    }));

    if (result.sections.length > 0 && result.sections.some((s) => s.questions.length > 0)) {
      return result;
    }
  }

  // 2. Line-by-Line Heuristic Parser
  const lines = rawText
    .replace(/\\documentclass[\s\S]*?\\begin\{document\}/i, '')
    .replace(/\\end\{document\}[\s\S]*$/i, '')
    .replace(/```(?:latex|tex|markdown|json)?/gi, '')
    .replace(/```/g, '')
    .replace(/\\textbf\{([^}]+)\}/g, '$1')
    .replace(/\\textit\{([^}]+)\}/g, '$1')
    .replace(/\\par/g, '\n')
    .replace(/\\\\/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    // Filter out raw JSON boilerplate and braces
    .filter((l) => l && !l.startsWith('"universityName"') && !l.startsWith('"examName"') && !l.startsWith('"subject"') && !l.startsWith('"paperCode"') && !l.startsWith('"duration"') && !l.startsWith('"totalMarks"') && l !== '{' && l !== '}' && l !== '[' && l !== ']' && l !== '},' && l !== '],');

  let currentSection: SynthesizedSection | null = null;
  let currentQuestion: SynthesizedQuestion | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect Section Header
    const secMatch = line.match(/^(?:#+\s*)?(SECTION\s*[-–—:]*\s*[I|V|X|\d]+|PART\s*[-–—:]*\s*[A-Z\d]+)(.*)$/i);
    if (secMatch) {
      const fullTitle = `${secMatch[1].trim()} ${secMatch[2].trim()}`.replace(/[*#]/g, '').trim();
      currentSection = {
        title: fullTitle,
        questions: [],
      };
      result.sections.push(currentSection);
      currentQuestion = null;
      continue;
    }

    // Detect Question (Q.1, Q.2, 1., (a), etc.)
    const qMatch = line.match(/^(?:#+\s*)?(Q\.?\s*\d+[\.:\)]?|\d+\.|\([a-z]\)|[a-z]\))\s+(.*)$/i);
    const isMcqOption = line.match(/^(\([a-d]\)|[a-d]\))\s+[A-Za-z0-9\s,\.\-]{1,50}$/i) && currentQuestion;

    if (qMatch && !isMcqOption) {
      if (!currentSection) {
        currentSection = {
          title: 'SECTION – I',
          questions: [],
        };
        result.sections.push(currentSection);
      }

      let qText = qMatch[2].trim();
      let marks: string | undefined = undefined;

      const marksMatch = qText.match(/(?:\\hfill\s*)?\[\s*(\d+)\s*(?:Marks?|marks?)?\s*\]$/i) ||
                         qText.match(/(?:\\hfill\s*)?\(\s*(\d+)\s*(?:Marks?|marks?)?\s*\)$/i);
      if (marksMatch) {
        marks = `${marksMatch[1]} Marks`;
        qText = qText.replace(marksMatch[0], '').trim();
      }

      currentQuestion = {
        number: qMatch[1].trim(),
        text: qText.replace(/[*#]/g, '').replace(/^"text":\s*"/, '').replace(/",?$/, ''),
        marks,
        options: [],
      };
      currentSection.questions.push(currentQuestion);
      continue;
    }

    // Detect MCQ Options: (a) Option, (b) Option, etc.
    const optMatch = line.match(/^(\([a-d]\)|[a-d]\))\s+(.*)$/i);
    if (optMatch && currentQuestion) {
      if (!currentQuestion.options) currentQuestion.options = [];
      currentQuestion.options.push(`${optMatch[1].toUpperCase()} ${optMatch[2].trim()}`);
      continue;
    }

    // Detect Multiple options on one line e.g. "(A) Linux (B) Windows (C) Unix (D) DOS"
    if (line.match(/\([A-D]\)/i) && currentQuestion) {
      const parts = line.split(/(?=\([A-D]\))/i).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        if (!currentQuestion.options) currentQuestion.options = [];
        parts.forEach((p) => currentQuestion!.options!.push(p));
        continue;
      }
    }

    // Detect OR alternative
    if (line.match(/^(\*+|\s*)*(OR|--- OR ---)(\*+|\s*)*$/i) && currentQuestion) {
      const nextLine = lines[i + 1];
      if (nextLine && !nextLine.match(/^(?:#+\s*)?(Q\.?\s*\d+|SECTION)/i)) {
        currentQuestion.orText = nextLine.replace(/[*#]/g, '').trim();
        i++;
      }
      continue;
    }

    // Append to question text
    if (currentQuestion && !line.startsWith('Instructions') && !line.startsWith('Date:') && !line.includes('": "') && line.length > 2) {
      currentQuestion.text += ` ${line.replace(/[*#]/g, '').replace(/^"text":\s*"/, '').replace(/",?$/, '')}`;
    }
  }

  // Nothing parsed means nothing was written. This used to substitute five
  // hardcoded Operating Systems questions, so an unparseable reply still
  // produced a "successful" paper with the wrong subject, the wrong pattern and
  // no relation to the uploaded papers. Leave it empty so the caller fails
  // loudly instead of printing an invention.
  result.sections = stripPlaceholderQuestions(result.sections);

  return result;
}

/**
 * A visual lifted out of the source paper, embedded here as its own pixels.
 *
 * The examiner's rule is that an existing diagram is never redrawn, never
 * approximated and never described in prose, so the crop travels as bytes and
 * is placed in the document unchanged.
 */
export interface PaperFigureAsset {
  /** The number the question refers to as `[FIGURE:n]`. */
  index: number;
  buffer: Buffer;
}

/** Markers naming a figure reused from the source paper. */
const FIGURE_MARKER = /\[\[\s*FIGURE\s*[:\s]\s*(\d{1,2})\s*\]\]|\[\s*FIGURE\s*[:\s]\s*(\d{1,2})\s*\]/gi;

/**
 * Place an extracted source figure in the page, scaled to fit the column.
 *
 * Never throws: a crop this engine cannot decode degrades to a labelled box, so
 * one unreadable figure cannot cost the examiner the whole paper.
 */
function embedSourceFigure(
  doc: PDFKit.PDFDocument,
  buffer: Buffer,
  startX: number,
  availableWidth: number,
  figureNumber: number
): void {
  const maxWidth = Math.min(availableWidth - 20, 380);
  const maxHeight = 240;

  try {
    const image = (doc as any).openImage(buffer);
    const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);

    if (doc.y + height > 760) doc.addPage();
    const x = startX + Math.max(0, (availableWidth - width) / 2);
    doc.image(buffer, x, doc.y, { width, height });
    doc.y += height + 8;
    doc.x = startX;
    return;
  } catch (err: any) {
    console.warn(`[PDF] Figure ${figureNumber} could not be embedded: ${err?.message || err}`);
  }

  const boxWidth = Math.min(availableWidth - 20, 380);
  const boxX = startX + Math.max(0, (availableWidth - boxWidth) / 2);
  if (doc.y + 34 > 760) doc.addPage();
  const boxY = doc.y;
  doc.roundedRect(boxX, boxY, boxWidth, 30, 4).fillAndStroke('#f8fafc', '#94a3b8');
  doc
    .fontSize(7.5)
    .font('Helvetica-Oblique')
    .fillColor('#475569')
    .text(`[Diagram ${figureNumber} from the source paper - could not be embedded]`, boxX, boxY + 10, {
      width: boxWidth,
      align: 'center',
    });
  doc.y = boxY + 36;
  doc.x = startX;
}

/**
 * Renders question text containing LaTeX tables, TikZ, or regular text cleanly in PDFKit with full graphical table drawing.
 */
function renderQuestionContentInPdfKit(
  doc: PDFKit.PDFDocument,
  rawText: string,
  startX: number,
  availableWidth: number,
  PAGE_LEFT: number,
  CONTENT_WIDTH: number,
  figures?: Map<number, Buffer>
) {
  if (!rawText) return;
  let text = rawText.trim();

  // 0. Figures reused from the source paper. Rendered before anything else so a
  // marker is never mistaken for prose, and so the surrounding text still flows.
  FIGURE_MARKER.lastIndex = 0;
  const markers = [...text.matchAll(FIGURE_MARKER)];
  if (markers.length > 0) {
    let cursor = 0;
    for (const marker of markers) {
      const before = text.slice(cursor, marker.index ?? 0).replace(/[*#]/g, '').trim();
      if (before) {
        doc.fontSize(8.5).font('Helvetica').fillColor('#0f172a').text(before, startX, doc.y, {
          width: availableWidth,
          align: 'justify',
          lineGap: 1.5,
        });
        doc.moveDown(0.25);
      }

      const figureNumber = Number(marker[1] || marker[2]);
      const asset = figures?.get(figureNumber);
      if (asset) {
        embedSourceFigure(doc, asset, startX, availableWidth, figureNumber);
      } else {
        console.warn(`[PDF] Figure ${figureNumber} is referenced but was not supplied.`);
      }

      cursor = (marker.index ?? 0) + marker[0].length;
    }

    const rest = text.slice(cursor).trim();
    if (rest) {
      renderQuestionContentInPdfKit(doc, rest, startX, availableWidth, PAGE_LEFT, CONTENT_WIDTH, figures);
    }
    return;
  }

  // 1. Check for LaTeX Tabular or Markdown Table
  const tabularMatch = text.match(/(\\begin\{tabular(?:x)?\}[\s\S]*?\\end\{tabular(?:x)?\})/i);
  if (tabularMatch) {
    const tableIndex = text.indexOf(tabularMatch[0]);
    const beforeTable = text.substring(0, tableIndex).replace(/[*#]/g, '').trim();
    const afterTable = text.substring(tableIndex + tabularMatch[0].length).replace(/[*#]/g, '').trim();
    const tableBody = tabularMatch[0];

    // Render text before table
    if (beforeTable) {
      doc.fontSize(8.5).font('Helvetica').fillColor('#0f172a').text(beforeTable, startX, doc.y, {
        width: availableWidth,
        align: 'justify',
        lineGap: 1.5,
      });
      doc.moveDown(0.25);
    }

    // Parse and draw table
    try {
      const cleanBody = tableBody
        .replace(/\\begin\{tabular(?:x)?\}\s*\{[^}]*\}/i, '')
        .replace(/\\end\{tabular(?:x)?\}/i, '')
        .trim();

      const rawRows = cleanBody.split(/\\\\/).map((r) => r.trim()).filter(Boolean);
      const parsedRows: string[][] = [];

      rawRows.forEach((r) => {
        const cleanedRow = r.replace(/\\hline/g, '').replace(/\\toprule|\\midrule|\\bottomrule/g, '').trim();
        if (!cleanedRow) return;
        const cells = cleanedRow
          .split('&')
          .map((c) =>
            c
              .replace(/\\textbf\{([^}]+)\}/g, '$1')
              .replace(/\\textit\{([^}]+)\}/g, '$1')
              .replace(/\\centering|\\small|\\footnotesize/g, '')
              .replace(/[*#]/g, '')
              .trim()
          );
        if (cells.some((c) => c.length > 0)) {
          parsedRows.push(cells);
        }
      });

      if (parsedRows.length > 0) {
        const colCount = Math.max(...parsedRows.map((r) => r.length), 1);
        const tableWidth = Math.min(availableWidth - 10, 420);
        const tableX = startX + (availableWidth - tableWidth) / 2;
        const colWidth = tableWidth / colCount;
        const rowHeight = 16;

        if (doc.y + parsedRows.length * rowHeight > 740) {
          doc.addPage();
        }

        parsedRows.forEach((row, rIdx) => {
          const rY = doc.y;
          const isHeader = rIdx === 0;

          // Header background fill
          if (isHeader) {
            doc.rect(tableX, rY, tableWidth, rowHeight).fillColor('#f1f5f9').fill();
          }

          // Draw cells & borders
          row.forEach((cellText, cIdx) => {
            const cX = tableX + cIdx * colWidth;
            doc.rect(cX, rY, colWidth, rowHeight).strokeColor('#cbd5e1').lineWidth(0.6).stroke();
            doc
              .fontSize(7.5)
              .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
              .fillColor(isHeader ? '#0f172a' : '#1e293b')
              .text(cellText, cX + 2, rY + 4, {
                width: colWidth - 4,
                align: 'center',
                lineBreak: false,
              });
          });

          doc.y = rY + rowHeight;
        });

        doc.moveDown(0.3);
      }
    } catch (tblErr) {
      console.warn('[PDFKit Table Draw Error]', tblErr);
    }

    // Render text after table
    if (afterTable) {
      doc.fontSize(8.5).font('Helvetica').fillColor('#0f172a').text(afterTable, startX, doc.y, {
        width: availableWidth,
        align: 'justify',
        lineGap: 1.5,
      });
      doc.moveDown(0.2);
    }
    return;
  }

  // 2. Check for TikZ diagram
  const tikzMatch = text.match(/(\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})/i);
  if (tikzMatch) {
    const tikzIndex = text.indexOf(tikzMatch[0]);
    const beforeTikz = text.substring(0, tikzIndex).replace(/[*#]/g, '').trim();
    const afterTikz = text.substring(tikzIndex + tikzMatch[0].length).replace(/[*#]/g, '').trim();

    if (beforeTikz) {
      doc.fontSize(8.5).font('Helvetica').fillColor('#0f172a').text(beforeTikz, startX, doc.y, {
        width: availableWidth,
        align: 'justify',
        lineGap: 1.5,
      });
      doc.moveDown(0.25);
    }

    // Draw styled diagram box
    const diagWidth = Math.min(availableWidth - 10, 420);
    const diagX = startX + (availableWidth - diagWidth) / 2;
    const diagY = doc.y;
    const diagHeight = 40;

    if (diagY + diagHeight > 740) {
      doc.addPage();
    }

    doc.roundedRect(diagX, doc.y, diagWidth, diagHeight, 4).fillAndStroke('#f8fafc', '#94a3b8');
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#1e293b')
      .text('SCHEMATIC ARCHITECTURE & DATA FLOW DIAGRAM', diagX, diagY + 10, { width: diagWidth, align: 'center' });
    doc
      .fontSize(7)
      .font('Helvetica-Oblique')
      .fillColor('#64748b')
      .text('[ Refer to question parameters for schematic nodes, registers, and state transitions ]', diagX, diagY + 24, {
        width: diagWidth,
        align: 'center',
      });

    doc.y = diagY + diagHeight + 6;

    if (afterTikz) {
      doc.fontSize(8.5).font('Helvetica').fillColor('#0f172a').text(afterTikz, startX, doc.y, {
        width: availableWidth,
        align: 'justify',
        lineGap: 1.5,
      });
      doc.moveDown(0.2);
    }
    return;
  }

  // 3. Normal question text (strip residual LaTeX syntax tags)
  const cleanLine = text
    .replace(/\\textbf\{([^}]+)\}/g, '$1')
    .replace(/\\textit\{([^}]+)\}/g, '$1')
    .replace(/\\par/g, ' ')
    .replace(/\\\\/g, ' ')
    .replace(/[*#]/g, '')
    .trim();

  doc.fontSize(8.5).font('Helvetica').fillColor('#0f172a').text(cleanLine, startX, doc.y, {
    width: availableWidth,
    align: 'justify',
    lineGap: 1.5,
  });
}

/**
 * Generates an authentic, publication-grade University Question Paper PDF using PDFKit.
 * Strictly 2-3 pages, professional typography, perfect alignment, zero compilation errors.
 */
/** Drop the string "undefined"/"null" and empty values so the header never prints them. */
function headerText(value: unknown, fallback: string): string {
  const text = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  if (!text || text === 'undefined' || text === 'null' || text === 'NaN') return fallback;
  return text;
}

/**
 * The masthead fields, with every gap filled.
 *
 * The route hands this generator whatever the AI produced, and the AI is not
 * obliged to set `duration` or `date`. Those gaps used to reach the page as the
 * literal word "undefined", printed on an official examination paper.
 */
function resolveMasthead(
  data: SynthesizedPaperData,
  durationHours?: number
): {
  universityName: string;
  examName: string;
  subject: string;
  paperCode: string;
  setLetter: string;
  duration: string;
  totalMarks: string;
  date: string;
} {
  const duration = headerText(data.duration, `${durationHours || 3} Hours`);
  return {
    universityName: headerText(data.universityName, 'AUTONOMOUS STATE UNIVERSITY EXAMINATION BOARD').toUpperCase(),
    examName: headerText(data.examName, 'SEMESTER EXAMINATION 2026').toUpperCase(),
    subject: headerText(data.subject, 'Examination'),
    paperCode: headerText(data.paperCode, '—'),
    setLetter: headerText(data.setLetter, '4'),
    // "3" from the AI reads as 3 minutes unless the unit is stated.
    duration: /^[\d.]+$/.test(duration) ? `${duration} Hours` : duration,
    totalMarks: headerText(data.totalMarks, '—'),
    date: headerText(
      data.date,
      new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    ),
  };
}

export function generateSynthesizedPaperPdf(
  data: SynthesizedPaperData,
  options: { figures?: PaperFigureAsset[]; durationHours?: number } = {}
): Promise<Buffer> {
  // Keyed by the number written in the marker, so `[FIGURE:2]` resolves to the
  // crop the extractor numbered 2.
  const figures = new Map<number, Buffer>();
  (options.figures || []).forEach((figure) => {
    if (figure?.buffer && figure.buffer.length > 0) figures.set(figure.index, figure.buffer);
  });

  const meta = resolveMasthead(data, options.durationHours);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true,
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const PAGE_LEFT = 40;
      const PAGE_RIGHT = 555;
      const CONTENT_WIDTH = 515; // 555 - 40

      // 1. TOP CONFIDENTIAL WATERMARK
      doc
        .fontSize(7)
        .font('Helvetica-Bold')
        .fillColor('#64748b')
        .text('CONFIDENTIAL • OFFICIAL UNIVERSITY EXAMINATION BOARD • ZEROLEAK SECURED', PAGE_LEFT, doc.y, {
          width: CONTENT_WIDTH,
          align: 'center',
        });
      doc.moveDown(0.4);

      // 2. SEAT NO. & PAPER CODE BOXES (Fixed Coordinate Rectangles)
      const boxY = doc.y;
      // Seat No Box (Left)
      doc.rect(PAGE_LEFT, boxY, 130, 20).strokeColor('#000000').lineWidth(0.8).stroke();
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000').text('Seat No.:', PAGE_LEFT + 6, boxY + 5, { lineBreak: false });
      doc.moveTo(PAGE_LEFT + 46, boxY + 14).lineTo(PAGE_LEFT + 124, boxY + 14).strokeColor('#94a3b8').lineWidth(0.5).stroke();

      // Paper Code Box (Right)
      const codeBoxWidth = 130;
      const codeBoxX = PAGE_RIGHT - codeBoxWidth;
      doc.rect(codeBoxX, boxY, codeBoxWidth, 20).strokeColor('#000000').lineWidth(0.8).stroke();
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor('#000000')
        .text(`Paper Code: ${meta.paperCode}`, codeBoxX + 6, boxY + 5, { width: codeBoxWidth - 12, align: 'center', lineBreak: false });

      // 3. UNIVERSITY & EXAM HEADER (Spanning Full Page Width 40 to 555)
      doc.y = boxY + 26;
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#0f172a')
        .text(meta.universityName, PAGE_LEFT, doc.y, { width: CONTENT_WIDTH, align: 'center' });

      doc.moveDown(0.15);
      doc
        .fontSize(9.5)
        .font('Helvetica-Bold')
        .fillColor('#334155')
        .text(meta.examName, PAGE_LEFT, doc.y, { width: CONTENT_WIDTH, align: 'center' });

      doc.moveDown(0.15);
      doc
        .fontSize(10.5)
        .font('Helvetica-Bold')
        .fillColor('#0f172a')
        .text(`Subject: ${meta.subject}`, PAGE_LEFT, doc.y, { width: CONTENT_WIDTH, align: 'center' });

      doc.moveDown(0.4);

      // 4. METADATA RULE & ROW (Date, Duration, Max Marks)
      const metaY = doc.y;
      doc.moveTo(PAGE_LEFT, metaY).lineTo(PAGE_RIGHT, metaY).strokeColor('#000000').lineWidth(1).stroke();
      doc.y = metaY + 4;

      doc
        .fontSize(8.5)
        .font('Helvetica-Bold')
        .fillColor('#000000')
        .text(`Day & Date: ${meta.date}`, PAGE_LEFT, doc.y, { width: 170, align: 'left', continued: false });

      const rowY = doc.y - 10;
      doc.text(`Duration: ${meta.duration}`, PAGE_LEFT, rowY, { width: CONTENT_WIDTH, align: 'center' });
      doc.text(`Max. Marks: ${meta.totalMarks}`, PAGE_LEFT, rowY, { width: CONTENT_WIDTH, align: 'right' });

      doc.y = rowY + 14;
      doc.moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).strokeColor('#000000').lineWidth(1).stroke();
      doc.moveDown(0.4);

      // 5. INSTRUCTIONS BLOCK
      if (data.instructions && data.instructions.length > 0) {
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000').text('Instructions to Candidates:', PAGE_LEFT, doc.y);
        doc.moveDown(0.2);

        data.instructions.forEach((ins, idx) => {
          doc
            .fontSize(7.5)
            .font('Helvetica')
            .fillColor('#1e293b')
            .text(`${idx + 1}.  ${ins}`, PAGE_LEFT + 6, doc.y, { width: CONTENT_WIDTH - 6 });
          doc.moveDown(0.1);
        });

        doc.moveDown(0.3);
        doc.moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
        doc.moveDown(0.4);
      }

      // 6. RENDER SECTIONS & QUESTIONS
      data.sections.forEach((sec, sIdx) => {
        // Prevent orphaned section headers near page bottom
        if (doc.y > 690) {
          doc.addPage();
        }

        // Section Title Bar
        doc.moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).strokeColor('#000000').lineWidth(1.2).stroke();
        doc.moveDown(0.25);

        const secHeaderY = doc.y;
        doc
          .fontSize(9.5)
          .font('Helvetica-Bold')
          .fillColor('#0f172a')
          .text(sec.title.toUpperCase(), PAGE_LEFT, secHeaderY, { width: 400, align: 'left' });

        if (sec.totalMarks) {
          const marksLabel = typeof sec.totalMarks === 'number' ? `[${sec.totalMarks} Marks]` : sec.totalMarks.startsWith('[') ? sec.totalMarks : `[${sec.totalMarks}]`;
          doc
            .fontSize(9.5)
            .font('Helvetica-Bold')
            .fillColor('#000000')
            .text(marksLabel, PAGE_LEFT, secHeaderY, { width: CONTENT_WIDTH, align: 'right' });
        }

        if (sec.instructions) {
          doc.moveDown(0.2);
          doc.fontSize(8).font('Helvetica-Oblique').fillColor('#475569').text(sec.instructions, PAGE_LEFT, doc.y, { width: CONTENT_WIDTH });
        }

        doc.moveDown(0.4);

        // Questions inside Section
        sec.questions.forEach((q, qIdx) => {
          if (doc.y > 720) {
            doc.addPage();
          }

          const qY = doc.y;
          const qNum = q.number ? (q.number.endsWith('.') || q.number.endsWith(')') ? q.number : `${q.number}.`) : `Q.${qIdx + 1}`;

          // Question Number
          doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#000000').text(qNum, PAGE_LEFT, qY, { width: 30 });

          // Render Question text with potential tables / diagrams / reused figures
          const availableWidth = q.marks ? 425 : 485;
          renderQuestionContentInPdfKit(
            doc,
            q.text,
            PAGE_LEFT + 30,
            availableWidth,
            PAGE_LEFT,
            CONTENT_WIDTH,
            figures
          );

          // Marks on the right
          if (q.marks) {
            const marksStr = typeof q.marks === 'number' ? `[${q.marks}]` : q.marks.startsWith('[') ? q.marks : `[${q.marks}]`;
            doc
              .fontSize(8.5)
              .font('Helvetica-Bold')
              .fillColor('#000000')
              .text(marksStr, PAGE_LEFT, qY, { width: CONTENT_WIDTH, align: 'right' });
          }

          doc.moveDown(0.2);

          // Multiple Choice Options (2-Column Grid)
          if (q.options && Array.isArray(q.options) && q.options.length > 0) {
            const optStartY = doc.y + 2;
            const colWidth = 235;

            q.options.forEach((opt, oIdx) => {
              const col = oIdx % 2;
              const row = Math.floor(oIdx / 2);
              const optX = col === 0 ? PAGE_LEFT + 35 : PAGE_LEFT + 285;
              const optY = optStartY + row * 13;

              if (optY > 745) {
                doc.addPage();
              }

              doc.fontSize(8).font('Helvetica').fillColor('#1e293b').text(opt, optX, optY, { width: colWidth });
            });

            doc.y = optStartY + Math.ceil(q.options.length / 2) * 13 + 3;
          }

          // OR Question Option
          if (q.orText) {
            doc.moveDown(0.15);
            doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#dc2626').text('--- OR ---', PAGE_LEFT, doc.y, { width: CONTENT_WIDTH, align: 'center' });
            doc.moveDown(0.15);

            const orY = doc.y;
            const orAvailableWidth = q.orMarks ? 425 : 485;
            renderQuestionContentInPdfKit(doc, q.orText, PAGE_LEFT + 30, orAvailableWidth, PAGE_LEFT, CONTENT_WIDTH);

            if (q.orMarks) {
              const orMarksStr = typeof q.orMarks === 'number' ? `[${q.orMarks}]` : q.orMarks.startsWith('[') ? q.orMarks : `[${q.orMarks}]`;
              doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#000000').text(orMarksStr, PAGE_LEFT, orY, { width: CONTENT_WIDTH, align: 'right' });
            }
          }

          doc.moveDown(0.35);
        });

        doc.moveDown(0.3);
      });

      // 7. END OF PAPER MARKER
      doc.moveDown(0.6);
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor('#64748b')
        .text('*** END OF QUESTION PAPER ***', PAGE_LEFT, doc.y, { width: CONTENT_WIDTH, align: 'center' });

      // 8. PAGE FOOTER ON EVERY BUFFERED PAGE
      const totalPages = doc.bufferedPageRange().count;
      for (let p = 0; p < totalPages; p++) {
        doc.switchToPage(p);
        doc
          .fontSize(7.5)
          .font('Helvetica')
          .fillColor('#64748b')
          .text(
            `Page ${p + 1} of ${totalPages}  •  Paper Code: ${meta.paperCode} (Set ${meta.setLetter})  •  ZeroLeak Examination Security`,
            PAGE_LEFT,
            doc.page.height - 25,
            { width: CONTENT_WIDTH, align: 'center' }
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

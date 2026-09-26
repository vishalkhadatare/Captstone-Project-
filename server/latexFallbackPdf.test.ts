import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  escapeLatexText,
  firstLatexError,
  generateLatexQuestionPaper,
  normalizePaperData,
  renderGantt,
  renderStructuredTable,
  templateSelfTestDocument,
  unicodeToLatex,
} from './latexFallbackPdf.ts';

/* --------------------------------------------------------------------------- *
 * Escaping: the model's text must never become syntax, and the backend's own
 * commands must never be escaped.
 * --------------------------------------------------------------------------- */

test('escapes the characters that would otherwise become LaTeX syntax', () => {
  const escaped = escapeLatexText('Cost is 10% & tax_credit #1 {x} y~z^2');
  assert.equal(escaped, 'Cost is 10\\% \\& tax\\_credit \\#1 \\{x\\} y\\textasciitilde{}z\\textasciicircum{}2');
});

test('keeps a backslash a backslash instead of corrupting it into a broken command', () => {
  // Escaping `\` inline and then escaping braces turns `\textbackslash{}` into
  // `\textbackslash\{\}`, which prints the wrong characters. The backslash is
  // parked and restored instead.
  const escaped = escapeLatexText('path\\to\\file');
  assert.equal(escaped, 'path\\textbackslash{}to\\textbackslash{}file');
  assert.ok(!escaped.includes('\\textbackslash\\{'), 'the replacement command must survive intact');
});

test('leaves inline maths alone: a deliberate dollar is not escaped away', () => {
  assert.equal(escapeLatexText('waiting time $T_w = \\sum w_i / n$ here'), 'waiting time $T_w = \\sum w_i / n$ here');
});

test('a table separator in question text is escaped but the table itself is not', () => {
  const text = escapeLatexText('Compare A & B');
  assert.equal(text, 'Compare A \\& B');
  const table = renderStructuredTable({ columns: ['A', 'B'], rows: [['1 & 2', '3']] });
  assert.ok(table.includes('\\textbf{A} & \\textbf{B}'), 'real separators stay real');
  assert.ok(table.includes('1 \\& 2'), 'data ampersands are escaped');
});

test('downgrades Unicode for an engine that cannot typeset it', () => {
  const out = unicodeToLatex('a \u2192 b \u2264 c \u2265 d \u00d7 e \u2014 f \u201cc\u201d \u03b1 \u03bc \u20b9 5');
  assert.ok(out.includes('$\\rightarrow$'));
  assert.ok(out.includes('$\\leq$'));
  assert.ok(out.includes('$\\times$'));
  assert.ok(out.includes('---'));
  assert.ok(out.includes('Rs. 5'));
  assert.ok(!/[\u2192\u2264\u2265\u00d7\u2014\u03b1\u03bc\u20b9]/.test(out), 'no Unicode symbols survive for pdfLaTeX');
});

test('drops only typeset-unsafe symbols, never accented letters', () => {
  // The pdfLaTeX preamble loads inputenc, so these set correctly.
  const out = unicodeToLatex('R\u00e9sum\u00e9 of Ram\u2014anujan');
  assert.ok(out.includes('R\u00e9sum\u00e9'));
  assert.ok(!out.includes('\u2014'));
});

/* --------------------------------------------------------------------------- *
 * Structured content: tables and diagrams come from data, never from the model.
 * --------------------------------------------------------------------------- */

test('builds a bordered table with one spec column per declared column', () => {
  const latex = renderStructuredTable({
    columns: ['Process', 'Arrival Time (ms)', 'Burst Time (ms)'],
    rows: [
      ['P1', '0', '7'],
      ['P2', '1', '5'],
    ],
  });
  assert.ok(latex.includes('\\begin{tabular}{|c|c|c|}'));
  assert.ok(latex.includes('\\hline'));
  assert.ok(latex.includes('\\textbf{Process} & \\textbf{Arrival Time (ms)} & \\textbf{Burst Time (ms)} \\\\'));
  assert.ok(latex.includes('P1 & 0 & 7 \\\\'));
});

test('every row prints exactly the declared number of columns', () => {
  // A short row must be padded, or the table silently shifts its data left.
  const latex = renderStructuredTable({ columns: ['A', 'B', 'C'], rows: [['1'], ['1', '2', '3']] });
  const dataLines = latex.split('\n').filter((line) => line.endsWith('\\\\') && !line.includes('\\textbf'));
  for (const line of dataLines) {
    assert.equal(line.split('&').length, 3, `wrong column count in: ${line}`);
  }
});

test("renders a Banker's algorithm spanning header as multicolumn", () => {
  const latex = renderStructuredTable({
    columns: ['P0', 'P1', 'P2', 'P3'],
    headerGroups: [
      [
        { text: 'Process', span: 1 },
        { text: 'Allocation A B C', span: 3 },
      ],
    ],
    rows: [['P0', '0 1 0', '7 5 3', '3 3 2']],
  });
  assert.ok(latex.includes('\\multicolumn{3}{|c|}{\\textbf{Allocation A B C}}'));
  assert.ok(latex.includes('\\textbf{Process} &'));
});

test('draws a Gantt chart from structured data and refuses an empty one', () => {
  const latex = renderGantt([
    { process: 'P1', start: 0, end: 5 },
    { process: 'P2', start: 5, end: 8 },
  ]);
  assert.ok(latex.includes('\\begin{tikzpicture}'));
  assert.ok(latex.includes('\\node at (2.5,1) {P1}'));
  assert.ok(latex.includes('\\node at (6.5,2) {P2}'));
  assert.equal(renderGantt([]), '');
  assert.equal(renderGantt([{ process: 'P1', start: 0, end: 0 }]), '');
});

/* --------------------------------------------------------------------------- *
 * The document: layout is the server's, content is the paper's.
 * --------------------------------------------------------------------------- */

function probePaper() {
  return {
    universityName: 'TEST UNIVERSITY',
    subject: 'Operating Systems',
    totalMarks: 20,
    instructions: ['All questions are compulsory.'],
    sections: [
      {
        title: 'SECTION - I',
        totalMarks: '20',
        questions: [
          {
            number: 'Q.1',
            text: 'Which scheduler is non-preemptive?',
            marks: '1',
            options: ['FCFS', 'SJF', 'Round Robin', 'Priority'],
          },
          { number: 'Q.2', text: 'Explain paging. [FIGURE:1] and again [FIGURE:2]', marks: '9' },
        ],
      },
    ],
  };
}

test('never prints the string undefined for a missing header field', () => {
  const paper = normalizePaperData({ sections: [] });
  for (const value of Object.values(paper)) {
    if (typeof value === 'string') assert.notEqual(value, 'undefined');
  }
});

test('writes the .tex to disk with the header, a question and the figure command intact', () => {
  const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zl-latex-'));
  try {
    const written = generateLatexQuestionPaper(
      probePaper(),
      { durationHours: 3 },
      { buildDir, assets: [{ index: 1, fileName: 'figure-1.png', buffer: Buffer.from('png') }] }
    );

    assert.ok(fs.existsSync(written.texPath), 'the source must be on disk, not only in memory');
    const tex = fs.readFileSync(written.texPath, 'utf8');

    assert.ok(tex.includes('\\begin{document}') && tex.includes('\\end{document}'));
    assert.ok(tex.includes('\\zlPaperHeader{TEST UNIVERSITY}'));
    assert.ok(tex.includes('\\zlSeatBox{P}'));
    assert.ok(tex.includes('\\zlInstructions'));
    assert.ok(tex.includes('\\zlMcqOptions'));
    assert.ok(tex.includes('\\zlMcqOption FCFS'));

    // Figures resolve to local assets, each guarded so a missing file cannot
    // abort the whole compilation.
    assert.ok(tex.includes('\\zlFigure{assets/figure-1.png}'));
    assert.ok(tex.includes('\\zlFigure{assets/figure-2.png}'));
    assert.ok(tex.includes('\\IfFileExists'), 'the figure macro must tolerate a missing asset');
    assert.ok(!tex.includes('http://') && !tex.includes('https://'), 'no visual is fetched over HTTP');
    assert.ok(!tex.includes('undefined'));
  } finally {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
});

test('escapes question text inside the document it builds', () => {
  const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zl-latex-'));
  try {
    const written = generateLatexQuestionPaper(
      {
        ...probePaper(),
        sections: [
          {
            title: 'SECTION - I',
            questions: [{ number: 'Q.1', text: 'Compare A & B; cost 10% and a_b', marks: '5' }],
          },
        ],
      },
      {},
      { buildDir, unicode: false }
    );
    const tex = fs.readFileSync(written.texPath, 'utf8');
    assert.ok(tex.includes('Compare A \\& B; cost 10\\% and a\\_b'));
  } finally {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
});

test('the title page macro is passed every header field as an argument', () => {
  const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zl-latex-'));
  try {
    const written = generateLatexQuestionPaper(probePaper(), { durationHours: 3 }, { buildDir });
    const tex = fs.readFileSync(written.texPath, 'utf8');
    // Seven arguments: university, exam, subject, code, duration, marks, date.
    assert.ok(/\\zlPaperHeader\{[^}]*\}\{[^}]*\}\{[^}]*\}\{[^}]*\}\{[^}]*\}\{[^}]*\}\{[^}]*\}/.test(tex));
    assert.ok(tex.includes('{3 Hours}'), 'a duration is always printed');
  } finally {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
});

test('the self-test probe keeps Unicode for a Unicode engine and downgrades it otherwise', () => {
  // The probe once contained the literal characters `\u2192` (a backslash and
  // the text "u2192"), which proved nothing about Unicode support. It now
  // carries the real symbols, and this asserts both engines' handling of them.
  const unicodeEngine = templateSelfTestDocument(true);
  assert.ok(unicodeEngine.includes('\u2192') && unicodeEngine.includes('\u2264'));
  assert.ok(unicodeEngine.includes('\\usepackage{fontspec}'));

  const pdftexEngine = templateSelfTestDocument(false);
  assert.ok(pdftexEngine.includes('$\\rightarrow$') && pdftexEngine.includes('$\\leq$'));
  assert.ok(!/[\u2192\u2264]/.test(pdftexEngine), 'pdfLaTeX must never be handed the raw symbols');
  assert.ok(!pdftexEngine.includes('fontspec'), 'fontspec is a hard error under pdfLaTeX');
});

test('reports the first real TeX error, not the cascade after it', () => {
  const log = [
    'This is XeTeX',
    '(./generated_question_paper.tex',
    '! Undefined control sequence.',
    'l.42 \\zlQuestion{Q.3}',
    '! Emergency stop.',
    '!  ==> Fatal error occurred, no output PDF file produced!',
  ].join('\n');
  assert.equal(firstLatexError(log), '! Undefined control sequence.');
  assert.equal(firstLatexError('no errors here'), null);
});

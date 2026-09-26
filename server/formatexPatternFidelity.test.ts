import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanAndSanitizeLatex,
  generateUniversityLatexDocument,
  renderPatternSectionsLatex,
  renderSourceFigureLatex,
  sanitizeLatexSource,
  splitLatexExtras,
} from './formatex.ts';
import { detectPaperPattern } from '../src/utils/sourcePattern.ts';
import { enforceStructuralPattern } from '../src/utils/patternEnforcement.ts';

const theoryQuestions = (count: number, marks: number, prefix: string) =>
  Array.from({ length: count }, (_, i) => ({
    number: `${prefix}(${i + 1})`,
    text: `Body of ${prefix} question number ${i + 1}`,
    marks,
  }));

test('prints every question in the supplied pattern instead of capping at five', () => {
  const doc = generateUniversityLatexDocument({
    exam: { subject: 'Operating Systems', total_marks: 70 },
    setLetter: '4',
    sections: [
      { title: 'SECTION I', instructions: 'Q.1 Answer any FOUR of the following', totalMarks: '35 Marks', questions: theoryQuestions(6, 7, 'Q.1') },
      { title: 'SECTION II', instructions: 'Attempt any TWO', totalMarks: '35 Marks', questions: theoryQuestions(8, 5, 'Q.2') },
    ],
  });

  for (let i = 1; i <= 6; i++) {
    assert.ok(doc.includes(`Body of Q.1 question number ${i}`), `missing Q.1 question ${i}`);
  }
  for (let i = 1; i <= 8; i++) {
    assert.ok(doc.includes(`Body of Q.2 question number ${i}`), `missing Q.2 question ${i}`);
  }
});

test('carries the section titles, instructions and marking scheme through verbatim', () => {
  const doc = generateUniversityLatexDocument({
    exam: { subject: 'Operating Systems', total_marks: 70 },
    setLetter: '4',
    sections: [
      { title: 'SECTION - I', instructions: 'Q.1 Answer any FOUR of the following', totalMarks: '35 Marks', questions: theoryQuestions(4, 7, 'Q.1') },
      { title: 'SECTION - II', instructions: 'Attempt any TWO', totalMarks: '35 Marks', questions: theoryQuestions(2, 17, 'Q.2') },
    ],
  });

  assert.ok(doc.includes('SECTION - I'));
  assert.ok(doc.includes('SECTION - II'));
  assert.ok(doc.includes('Q.1 Answer any FOUR of the following'));
  assert.ok(doc.includes('Attempt any TWO'));
  assert.ok(doc.includes('[35 Marks]'), 'section total marks should print');
  assert.ok(doc.includes('[7 Marks]'), 'per-question marks should print');
  assert.ok(doc.includes('[17 Marks]'), 'per-question marks should print for the second section');
});

test('never renames a theory section into the MCQ instruction', () => {
  const doc = generateUniversityLatexDocument({
    exam: { subject: 'Operating Systems' },
    setLetter: '4',
    sections: [{ title: 'SECTION I', questions: theoryQuestions(5, 5, 'Q.1') }],
  });

  assert.ok(!doc.includes('Choose the correct alternatives'));
  assert.ok(!doc.includes('Attempt Any Four'), 'legacy hardcoded instruction must not leak in');
});

test('singular marks are printed in the singular', () => {
  const doc = generateUniversityLatexDocument({
    exam: {},
    setLetter: '4',
    sections: [{ title: 'SECTION I', questions: [{ number: 'Q.1(1)', text: 'Pick one', marks: 1 }] }],
  });

  assert.ok(doc.includes('[1 Mark]'));
});

test('tables survive as real LaTeX tabulars with their alignment intact', () => {
  const body = [
    'Consider the following process table:',
    '\\begin{tabular}{|c|c|}',
    '\\hline',
    'Process & Burst \\\\',
    '\\hline',
    'P1 & 7 \\\\',
    '\\hline',
    '\\end{tabular}',
    'Answer the questions below.',
  ].join('\n');

  const latex = renderPatternSectionsLatex([
    { title: 'SECTION I', questions: [{ number: 'Q.2', text: body, marks: 7 }] },
  ]);

  assert.ok(latex.includes('\\begin{tabular}{|c|c|}'), 'table must stay a tabular');
  assert.ok(latex.includes('Process & Burst'), 'alignment tabs must not be escaped');
  assert.ok(!latex.includes('\\&'), 'escaped ampersands would break the table');
  assert.ok(latex.includes('Consider the following process table:'), 'surrounding prose is kept');

  const split = splitLatexExtras(body);
  assert.equal(split.tables.length, 1);
  assert.ok(!split.body.includes('tabular'));
});

test('tables inside question text are not mangled by the text sanitizer', () => {
  const sanitized = cleanAndSanitizeLatex('\\begin{tabular}{l l} a & b \\\\ c & d \\end{tabular}');
  assert.ok(sanitized.includes('a & b'), 'inside a tabular the raw & is required');
  assert.ok(sanitized.includes('c & d'));
  assert.ok(sanitized.includes('\\begin{tabular}{l l}'));
});

test('tikz diagrams travel through untouched and the preamble can typeset them', () => {
  const tikz = [
    '\\begin{tikzpicture}',
    '\\node[draw] (a) at (0,0) {CPU};',
    '\\draw[->] (a) -- (1,0) node[right] {Disk};',
    '\\end{tikzpicture}',
  ].join('\n');

  const doc = generateUniversityLatexDocument({
    exam: {},
    setLetter: '4',
    sections: [{ title: 'SECTION I', questions: [{ number: 'Q.3', text: 'Draw the architecture.\n' + tikz, marks: 7 }] }],
  });

  assert.ok(doc.includes('\\begin{tikzpicture}'));
  assert.ok(doc.includes('\\draw[->] (a) -- (1,0)'));
  assert.ok(doc.includes('\\usepackage{tikz}'), 'tikz must be loaded or the diagram cannot compile');
});

test('a pattern with no questions still prints its section instead of vanishing', () => {
  const latex = renderPatternSectionsLatex([{ title: 'SECTION III', totalMarks: 20 }]);
  assert.ok(latex.includes('SECTION III'));
  assert.ok(latex.includes('No questions were extracted for this section'));
});

test('sanitizeLatexSource leaves a LaTeX line break with spacing alone', () => {
  const healed = sanitizeLatexSource('{\\large \\textbf{Pattern: CBCS}}\\\\[2mm]');

  assert.ok(!healed.includes('\\\\par'), 'a dangling \\\\par typesets the literal word "par"');
  assert.ok(!/\bpar\b/.test(healed.replace(/\\par\b/g, '')), 'no stray "par" token');
  assert.ok(healed.includes('\\\\[2mm]'), 'the valid line break must survive');
});

test('sanitizeLatexSource still repairs a lone bracket spacing command', () => {
  const healed = sanitizeLatexSource('Heading \\[3mm] body');
  assert.ok(healed.includes('\\par\\vspace{3mm}'));
});

test('a paper repaired against its source prints that source paper, not the form defaults', () => {
  // The end-to-end path minus the model: an AI answer with the right questions
  // but a borrowed structure is corrected, then typeset.
  const source = [
    'Instructions: 1. Q.1 is compulsory. 2. Figures to the right indicate full marks.',
    'Max. Marks: 34',
    'Time: 2 Hours',
    'Section I: Objective / MCQs (2 Questions)',
    'Q.1 Which scheduling algorithm is non-preemptive? [1]',
    'a) Round Robin',
    'b) SJF',
    'c) SRTF',
    'd) Multilevel Queue',
    'Q.2 Deadlock requires which of the following? [1]',
    'a) mutual exclusion',
    'b) hold and wait',
    'c) circular wait',
    'd) all of these',
    'Section II: Descriptive / Theory Questions (2 Questions)',
    'Attempt any one of the following:',
    'Q.1 Explain paging with a neat diagram. [16]',
    'Q.2 Explain segmentation with a neat diagram. [16]',
  ].join('\n');

  const pattern = detectPaperPattern(source, 'operating-systems.pdf')!;
  const answer = {
    universityName: 'AUTONOMOUS STATE UNIVERSITY EXAMINATION BOARD',
    subject: 'Operating Systems',
    paperCode: 'SLR-FINAL-04',
    totalMarks: 70,
    duration: '3 Hours',
    sections: [
      {
        title: 'SECTION \u2013 I (Objective & MCQs)',
        totalMarks: '2 Marks',
        questions: [
          { number: 'Q.1', text: 'Which of the following policies is preemptive?', marks: '1', options: ['FCFS', 'SJF', 'Round Robin', 'HRRN'] },
          { number: 'Q.2', text: 'Which condition is NOT necessary for a deadlock?', marks: '1', options: ['mutual exclusion', 'hold and wait', 'preemption', 'circular wait'] },
        ],
      },
      {
        title: 'SECTION \u2013 II (Descriptive)',
        totalMarks: '32 Marks',
        questions: [
          { number: 'Q.3', text: 'Discuss virtual memory with a diagram.', marks: '16' },
          { number: 'Q.4', text: 'Discuss the LRU page replacement algorithm with an example.', marks: '16' },
        ],
      },
    ],
  };

  const enforcement = enforceStructuralPattern(answer, pattern, {
    universityName: 'SAVITRIBAI PHULE PUNE UNIVERSITY',
    examName: 'B.E. (Computer Engineering) Examination 2026',
    department: null,
    subject: 'Operating Systems',
    paperCode: '310254',
    maxMarks: 34,
    durationHours: 2,
    set: 'P',
    instructions: ['Q.1 is compulsory.', 'Figures to the right indicate full marks.'],
  });
  assert.deepEqual(enforcement.violations, []);

  const doc = generateUniversityLatexDocument({
    exam: {
      university_name: enforcement.paper.universityName,
      name: enforcement.paper.examName,
      subject: enforcement.paper.subject,
      paper_code: enforcement.paper.paperCode,
      total_marks: enforcement.paper.totalMarks,
    },
    setLetter: enforcement.paper.setLetter,
    sections: enforcement.paper.sections,
  });

  assert.ok(doc.includes('SAVITRIBAI PHULE PUNE UNIVERSITY'));
  assert.ok(doc.includes('Max. Marks:} 34 Marks'), 'the paper must print the source total, not the form default of 70');
  assert.ok(doc.includes('SET: P'), 'the source set letter must be preserved');
  assert.ok(doc.includes('Section II: Descriptive / Theory Questions (2 Questions)'));
  assert.ok(doc.includes('Attempt any one of the following:'), 'the attempt rule wording must survive verbatim');
  assert.ok(!doc.includes('Max. Marks:} 70'), 'the form default must not leak in');
});

test('a diagram the source paper already prints is reused as its own pixels', () => {
  // The examiner's rule: never redraw an existing visual, never describe it.
  const doc = generateUniversityLatexDocument({
    exam: { subject: 'Operating Systems' },
    setLetter: 'P',
    sections: [
      {
        title: 'Section II: Descriptive / Theory Questions (1 Questions)',
        questions: [
          {
            number: 'Q.1',
            text: 'Explain the process states shown below and the transitions between them.\n[FIGURE:2]',
            marks: 8,
          },
        ],
      },
    ],
  });

  assert.ok(doc.includes('\\includegraphics'), 'the original figure must be embedded as an image');
  assert.ok(doc.includes('figure-2.png'), 'the extracted crop is referenced by its published name');
  assert.ok(doc.includes('\\IfFileExists{figure-2.png}'), 'a missing crop must not abort the compile');
  assert.ok(!doc.includes('FIGURE:2'), 'the marker itself must not reach the printed paper');
  assert.ok(!doc.includes('tikzpicture'), 'no redrawn diagram for a visual that already exists');
});

test('the marker is lifted out of the question text, not printed as prose', () => {
  const split = splitLatexExtras('Draw the state diagram.\n[FIGURE:1]\nLabel every transition.');
  assert.deepEqual(split.figureRefs, [1]);
  assert.ok(!split.body.includes('FIGURE'));
  assert.ok(split.body.includes('Draw the state diagram.'));
  assert.ok(split.body.includes('Label every transition.'));
  assert.deepEqual(splitLatexExtras('No visual here.').figureRefs, []);
});

test('a reused figure is a real image reference, centred and sized to the page', () => {
  const latex = renderSourceFigureLatex(3);
  assert.ok(latex.includes('\\includegraphics[width=0.72\\textwidth]{figure-3.png}'));
  assert.ok(latex.includes('\\begin{center}'));
});

test('the legacy three-way split keeps working for older callers', () => {
  const doc = generateUniversityLatexDocument({
    exam: { subject: 'Operating Systems' },
    setLetter: 'P',
    mcqs: [{ content_text: 'Which scheduling policy starves?', options: ['FCFS', 'RR', 'SJF', 'Priority'] }],
    theorySec1: [{ content_text: 'Explain paging.' }],
    theorySec2: [{ content_text: 'Derive the banker algorithm.' }],
  });

  assert.ok(doc.includes('Choose the correct alternatives'));
  assert.ok(doc.includes('Explain paging.'));
  assert.ok(doc.includes('Derive the banker algorithm.'));
});

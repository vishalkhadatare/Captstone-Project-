import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectPaperPattern,
  extractPaperHeader,
  pickPrimaryPaperIndex,
  pickPrimaryPattern,
  summarizePattern,
} from './sourcePattern.ts';

const OBJECTIVE_AND_THEORY_PAPER = [
  'Instructions: 1. Figures to the right indicate full marks. 2. Neat diagrams must be drawn wherever necessary.',
  'Max. Marks: 34',
  'Section I: Objective / MCQs (4 Questions)',
  'Q.1 Explain why ISO-9001 standard and its importance in software testing?',
  'Q.2 Examine the relationship between quality & productivity.',
  'Q.3 Define software quality. List & explain core components of quality.',
  'Q.4 Illustrate the selenium tool suite in detail.',
  'Section II: Descriptive / Theory Questions (3 Questions)',
  'Q.1 Explain the Six Sigma methodology and its characteristics in quality management. [5]',
  'Q.2 Explain ISO 9001 and CMM/CMMI quality standards and their relevance to testing. [5]',
  'Q.3 Explain the defect life cycle with a neat diagram. [4]',
].join('\n');

const UNIVERSITY_SECTIONS_PAPER = [
  'Instructions: 1. Q. No. 1 is compulsory.',
  'Q.1 Choose the correct alternatives from the options.',
  '[1 Marks]',
  'Subject: Security Max. Marks: 70 Marks',
  'SECTION - I (Theory & Analysis)',
  'Answer any FOUR of the following:',
  'Q.2 Explain the OSI reference model in detail. [7 Marks]',
  'Q.3 Describe symmetric and asymmetric key cryptography. [7 Marks]',
  'SECTION - II (Applications & System Problems)',
  'Q.4 Design a firewall rule set for a campus network. [14 Marks]',
].join('\n');

test('detects both sections with their titles, declared counts and questions', () => {
  const pattern = detectPaperPattern(OBJECTIVE_AND_THEORY_PAPER, 'objective-and-theory.pdf');

  assert.ok(pattern, 'pattern should be detected');
  assert.equal(pattern.sections.length, 2);
  assert.equal(pattern.sections[0].title, 'Section I: Objective / MCQs (4 Questions)');
  assert.equal(pattern.sections[0].declaredCount, 4);
  assert.equal(pattern.sections[0].questions.length, 4);
  assert.deepEqual(
    pattern.sections[0].questions.map((q) => q.number),
    ['Q.1', 'Q.2', 'Q.3', 'Q.4']
  );
  assert.equal(pattern.sections[1].title, 'Section II: Descriptive / Theory Questions (3 Questions)');
  assert.equal(pattern.sections[1].declaredCount, 3);
  assert.equal(pattern.totalQuestions, 7);
  assert.equal(pattern.totalMarks, 34, 'Max. Marks on the paper wins over the summed question marks');
});

test('reads marks printed either on the question line or on the line below it', () => {
  const pattern = detectPaperPattern(OBJECTIVE_AND_THEORY_PAPER)!;
  assert.equal(pattern.sections[1].questions[0].marks, 5);
  assert.equal(pattern.sections[1].questions[2].marks, 4);
  assert.equal(pattern.sections[1].totalMarks, 14);

  const university = detectPaperPattern(UNIVERSITY_SECTIONS_PAPER)!;
  const mcq = university.sections.flatMap((section) => section.questions).find((q) => q.number === 'Q.1');
  assert.equal(mcq?.marks, 1, 'a brackets-marks line under the question belongs to it');
});

test('attaches questions that precede the first heading to that heading', () => {
  const university = detectPaperPattern(UNIVERSITY_SECTIONS_PAPER)!;
  assert.equal(university.sections.length, 2);
  assert.equal(university.sections[0].title, 'SECTION - I (Theory & Analysis)');
  assert.equal(university.sections[0].questions[0].number, 'Q.1');
});

test('keeps the section instruction line that states the attempt rule', () => {
  const university = detectPaperPattern(UNIVERSITY_SECTIONS_PAPER)!;
  const sectionOne = university.sections.find((section) => section.title.includes('Theory & Analysis'));
  assert.ok(sectionOne, 'section heading should be captured');
  assert.equal(sectionOne!.instruction, 'Answer any FOUR of the following:');
  // Q.1 is printed above the heading in this paper, so it belongs to this
  // section rather than to a section invented to hold it.
  assert.equal(sectionOne!.questions.length, 3);
  assert.deepEqual(
    sectionOne!.questions.map((q) => q.number),
    ['Q.1', 'Q.2', 'Q.3']
  );
  assert.equal(university.sections.length, 2, 'no fabricated section for leading questions');
  assert.ok(
    !university.sections.some((section) => /^Question Paper$/.test(section.title)),
    'a section must never be labelled with placeholder text'
  );
});

test('does not mistake a year or a header row for a question', () => {
  const pattern = detectPaperPattern(OBJECTIVE_AND_THEORY_PAPER)!;
  const numbers = pattern.sections.flatMap((section) => section.questions.map((q) => q.number));
  assert.ok(!numbers.includes('Q.34'), 'Max. Marks must not become a question');
  assert.ok(numbers.length === 7, `expected 7 questions, got ${numbers.length}`);
});

test('returns null when the text carries no recognisable questions', () => {
  assert.equal(detectPaperPattern(''), null);
  assert.equal(detectPaperPattern('This page intentionally left blank.'), null);
});

test('summarizes the pattern so it can be stated to the model', () => {
  const summary = summarizePattern(detectPaperPattern(OBJECTIVE_AND_THEORY_PAPER)!);
  assert.ok(summary.includes('Sections: 2'));
  assert.ok(summary.includes('Questions: 7'));
  assert.ok(summary.includes('Paper total: 34 marks'));
  assert.ok(summary.includes('Section I: Objective / MCQs (4 Questions)'));
});

test('picks the richest detected pattern as the one to constrain the model to', () => {
  const small = detectPaperPattern(UNIVERSITY_SECTIONS_PAPER, 'small.pdf');
  const rich = detectPaperPattern(OBJECTIVE_AND_THEORY_PAPER, 'rich.pdf');
  assert.equal(pickPrimaryPattern([small, rich])?.sourceName, 'rich.pdf');
  assert.equal(pickPrimaryPattern([null, null]), null);
});

// ---------------------------------------------------------------------------
// A scanned paper: running heads, sets, an instruction block and one objective
// container holding numbered items. This is the shape that used to be read as
// "Section - I has 22 questions".
// ---------------------------------------------------------------------------

const SCANNED_PAPER = (() => {
  const items = Array.from({ length: 14 }, (_, index) => {
    const n = index + 1;
    return [
      `${n})\tObjective item ${n} asks something?`,
      'a)\tfirst choice\tb) second choice',
      'c) third choice\td) fourth choice',
    ].join('\n');
  }).join('\n');

  return [
    '--- PAGE 1 ---',
    'SLR-GF-209',
    'Seat No.',
    'Set P',
    'T. Y. (B. Tech) (Sem - II) (New) (CBCS) Examination: Oct/Nov-2023',
    'Operating Systems (BTN04605)',
    'Day & Date: Friday, 22-12-2023\tMax. Marks: 70',
    'Instructions: 1) Q. No. 1 is compulsory. Each question carries one mark.',
    '2) Mention the question paper set (P/Q/R/S) on top of the page.',
    'MCQ/Objective Type Questions',
    'Duration: 30 Minutes\tMarks: 14',
    'Q. 1 Choose the correct alternatives from the given options.\t14',
    items,
    'Page 1 of 16',
    '--- PAGE 2 ---',
    'SLR-GF-209',
    'Set P',
    'Section - I',
    'Q.2 Attempt Any Four:\t16',
    'Write a short note on Multiprogramming Operating Systems.',
    'Q.3 Attempt Any Two:',
    'Explain the Round Robin Scheduling algorithm with an example.',
    'b)\tWrite short note on:',
    'i) Critical Section Problem',
    'Section - II',
    'Q.4 Attempt Any Four:\t16',
    'Explain with suitable diagram internal and external fragmentation.',
    'Q.5 Attempt Any Two:\t12',
    'What is segmentation?',
    'Page 2 of 16',
  ].join('\n');
})();

test('reads the objective block as one container of numbered items, not as sections', () => {
  const pattern = detectPaperPattern(SCANNED_PAPER, 'scanned.pdf')!;

  assert.ok(pattern.objective, 'the 1) ... 14) run is the objective block');
  assert.equal(pattern.objective.questionNumber, 'Q.1');
  assert.equal(pattern.objective.count, 14, 'each item carries one mark and the block prints Marks: 14');
  assert.equal(pattern.objective.marks, 14, 'Max. Marks: 70 must not be read as the block total');
  assert.equal(pattern.objective.optionsPerQuestion, 4);

  const numbers = pattern.sections.flatMap((section) => section.questions.map((q) => q.number));
  assert.ok(!numbers.includes('Q.1'), 'the objective container is not a section question');
  assert.deepEqual(numbers, ['Q.2', 'Q.3', 'Q.4', 'Q.5'], 'instruction items must not become questions');
});

test('reads the section layout, marks and attempt rules of a scanned paper', () => {
  const pattern = detectPaperPattern(SCANNED_PAPER, 'scanned.pdf')!;

  assert.deepEqual(
    pattern.sections.map((section) => section.title),
    ['Section - I', 'Section - II']
  );
  assert.equal(pattern.sections[0].questions[0].marks, 16);
  assert.equal(pattern.sections[0].questions[0].attemptRule, 'Attempt Any Four');
  assert.equal(
    pattern.sections[0].questions[1].marks,
    12,
    'a marks value the scan dropped is recovered from the paper total of 70'
  );
  assert.equal(pattern.sections[0].objective, false, 'attempt-rule parts are alternatives, not choices');
  assert.equal(pattern.totalQuestions, 18, '14 objective items plus 4 descriptive questions');
  assert.equal(pattern.totalMarks, 70);
  assert.equal(pattern.set, 'P');
});

test('analyses one set at a time instead of merging Set P and Set Q', () => {
  const twoSets = [
    '--- PAGE 1 ---',
    'Exam 2026',
    'Set P',
    'Max. Marks: 70',
    'Section - I',
    'Q.2 Attempt Any Four: 16',
    'Explain paging with a diagram.',
    '--- PAGE 2 ---',
    'Exam 2026',
    'Set Q',
    'Max. Marks: 70',
    'Section - I',
    'Q.2 Attempt Any Four: 16',
    'Explain paging with a diagram.',
    'Q.3 Attempt Any Two: 12',
    'Explain segmentation in detail.',
  ].join('\n');

  const pattern = detectPaperPattern(twoSets, 'two-sets.pdf')!;

  assert.deepEqual(pattern.sets, ['P', 'Q']);
  assert.equal(pattern.set, 'P', 'the set printed on the most pages is the one analysed');
  assert.equal(
    pattern.sections[0].questions.length,
    1,
    'the other set contributes no questions to this structure'
  );
});

// ---------------------------------------------------------------------------
// Header extraction
// ---------------------------------------------------------------------------

const HEADER_PAPER = [
  'SAVITRIBAI PHULE PUNE UNIVERSITY',
  'B.E. (Computer Engineering) Examination 2026',
  'Department of Computer Engineering',
  'Subject: Operating Systems  Paper Code: 310254',
  'Max. Marks: 34',
  'Time: 2 Hours',
  'Instructions: 1. Q.1 is compulsory. 2. Figures to the right indicate full marks. 3. Assume suitable data if necessary.',
  'Section I: Objective / MCQs (4 Questions)',
  'Q.1 Explain why ISO-9001 standard and its importance in software testing?',
  'Q.2 Examine the relationship between quality & productivity.',
  'Q.3 Define software quality. List & explain core components of quality.',
  'Q.4 Illustrate the selenium tool suite in detail.',
].join('\n');

test('reads the masthead the source paper prints', () => {
  const header = extractPaperHeader(HEADER_PAPER);

  assert.equal(header.maxMarks, 34, 'the marks total must come from the paper, not the form default of 70');
  assert.equal(header.durationHours, 2);
  assert.equal(header.subject, 'Operating Systems');
  assert.equal(header.paperCode, '310254');
  assert.equal(header.universityName, 'SAVITRIBAI PHULE PUNE UNIVERSITY');
  assert.equal(header.examName, 'B.E. (Computer Engineering) Examination 2026');
  assert.equal(header.department, 'Department of Computer Engineering');
  assert.deepEqual(header.instructions, [
    'Q.1 is compulsory.',
    'Figures to the right indicate full marks.',
    'Assume suitable data if necessary.',
  ]);
});

test('reads a set letter and a list-style instruction block', () => {
  const header = extractPaperHeader(
    [
      'AUTONOMOUS STATE UNIVERSITY EXAMINATION BOARD',
      'SEAT No.                    Set P',
      'Instructions:',
      '1) Q. No. 1 is compulsory.',
      '2) Mention the question paper set on the answer sheet.',
      '3) Draw neat diagrams wherever necessary.',
      'SECTION - I (Theory & Analysis)',
      'Q.1 Explain the OSI reference model in detail. [7 Marks]',
    ].join('\n')
  );

  assert.equal(header.set, 'P');
  assert.deepEqual(header.instructions, [
    'Q. No. 1 is compulsory.',
    'Mention the question paper set on the answer sheet.',
    'Draw neat diagrams wherever necessary.',
  ]);
});

test('returns an empty header for text with no masthead', () => {
  const header = extractPaperHeader('This page intentionally left blank.');
  assert.equal(header.maxMarks, null);
  assert.equal(header.subject, null);
  assert.deepEqual(header.instructions, []);
});

test('defaults the primary template to the most recently uploaded paper', () => {
  const papers = [
    { name: 'older.pdf', text: HEADER_PAPER },
    { name: 'newer.pdf', text: OBJECTIVE_AND_THEORY_PAPER },
  ];

  assert.equal(pickPrimaryPaperIndex(papers), 1, 'the newest upload is the structural authority');
  assert.equal(pickPrimaryPaperIndex(papers, 0), 0, 'an explicitly chosen paper wins');
  assert.equal(pickPrimaryPaperIndex([]), -1);
  // An unreadable newest paper must not become the authority.
  assert.equal(
    pickPrimaryPaperIndex([{ name: 'older.pdf', text: HEADER_PAPER }, { name: 'scan.pdf', text: '' }]),
    0
  );
});

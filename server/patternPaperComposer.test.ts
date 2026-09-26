import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAttemptCount,
  parseMainQuestionsFromRules,
  deriveMainQuestionFrames,
  composePatternPaper,
  buildPatternPaperLatex,
  pipeTableToLatex,
  escapeLatex,
  withSetLetter,
  type ComposerQuestion,
} from './patternPaperComposer.ts';

/**
 * The real detector output for a 70-mark university paper. Frames derived from
 * this must reproduce the source structure exactly - that is the whole point of
 * the module, so it is asserted against the actual analyzer shape rather than a
 * shape invented for the test.
 */
const DETECTED_PATTERN = [
  {
    name: 'MCQ / OBJECTIVE TYPE QUESTIONS',
    type: 'MCQ',
    marks: 14,
    questionCount: 14,
    attemptRules: 'All 14 questions are compulsory.',
  },
  {
    name: 'SECTION I',
    type: 'THEORY',
    marks: 28,
    questionCount: 2,
    attemptRules: 'Q.2 Attempt Any Four (16M), Q.3 Attempt Any Two (12M)',
  },
  {
    name: 'SECTION II',
    type: 'THEORY',
    marks: 28,
    questionCount: 2,
    attemptRules: 'Q.5 Attempt Any Four (16M), Q.6 Attempt Any Two (12M)',
  },
];

const theory = (id: string, text: string, paperId: string): ComposerQuestion => ({
  id,
  content_text: text,
  question_type: 'THEORY',
  marks: 4,
  question_paper_id: paperId,
});

const mcq = (id: string, text: string, paperId: string): ComposerQuestion => ({
  id,
  content_text: text,
  question_type: 'MCQ',
  marks: 1,
  options_json: JSON.stringify(['Stack', 'Queue', 'Tree', 'Graph']),
  correct_answer: 'B',
  question_paper_id: paperId,
});

test('parseAttemptCount reads word and numeric attempt rules', () => {
  assert.equal(parseAttemptCount('Attempt Any Four of the following'), 4);
  assert.equal(parseAttemptCount('Q.3 Attempt Any Two (12M)'), 2);
  assert.equal(parseAttemptCount('attempt any 5 questions'), 5);
  assert.equal(parseAttemptCount('All questions are compulsory'), null);
  assert.equal(parseAttemptCount(''), null);
});

test('parseMainQuestionsFromRules splits prose into separate main questions', () => {
  const parsed = parseMainQuestionsFromRules('Q.2 Attempt Any Four (16M), Q.3 Attempt Any Two (12M)');

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].number, 2);
  assert.equal(parsed[0].attemptCount, 4);
  assert.equal(parsed[0].marks, 16);
  // The instruction the source paper printed is preserved, minus the labels.
  assert.equal(parsed[0].instruction, 'Attempt Any Four');

  assert.equal(parsed[1].number, 3);
  assert.equal(parsed[1].attemptCount, 2);
  assert.equal(parsed[1].marks, 12);
});

test('deriveMainQuestionFrames reproduces the detected paper structure', () => {
  const frames = deriveMainQuestionFrames(DETECTED_PATTERN);

  assert.deepEqual(
    frames.map(f => f.questionNumber),
    ['Q.1', 'Q.2', 'Q.3', 'Q.5', 'Q.6']
  );

  const q1 = frames[0];
  assert.equal(q1.type, 'MCQ');
  assert.equal(q1.subQuestionCount, 14);
  assert.equal(q1.attemptCount, 14);
  assert.equal(q1.marksPerSubQuestion, 1);

  const q2 = frames[1];
  assert.equal(q2.type, 'THEORY');
  assert.equal(q2.attemptCount, 4);
  // One more offered than required: the familiar "any four out of five".
  assert.equal(q2.subQuestionCount, 5);
  assert.equal(q2.marksPerSubQuestion, 4);

  const q3 = frames[2];
  assert.equal(q3.attemptCount, 2);
  assert.equal(q3.subQuestionCount, 3);
  assert.equal(q3.marksPerSubQuestion, 6);
});

test('a composed paper totals the 70 marks of the source pattern', () => {
  const frames = deriveMainQuestionFrames(DETECTED_PATTERN);
  const pool: ComposerQuestion[] = [];
  for (let i = 1; i <= 14; i++) pool.push(mcq(`m${i}`, `Objective question number ${i}?`, 'paperA'));
  // The pattern asks for 16 theory sub-questions (5+3+5+3). Supplying more than
  // that keeps a pool shortfall from masquerading as a marks-calculation bug.
  for (let i = 1; i <= 10; i++) pool.push(theory(`t${i}`, `Theory question number ${i} explained.`, 'paperA'));
  for (let i = 11; i <= 20; i++) pool.push(theory(`t${i}`, `Theory question number ${i} explained.`, 'paperB'));

  const paper = composePatternPaper(frames, pool, { seed: 'test-seed' });

  assert.equal(paper.totalMarks, 70);
  assert.equal(paper.frames[0].subQuestions.length, 14);
});

test('compose keeps the main questions identical and only swaps sub-questions', () => {
  const frames = deriveMainQuestionFrames(DETECTED_PATTERN);
  const pool: ComposerQuestion[] = [];
  for (let i = 1; i <= 14; i++) pool.push(mcq(`m${i}`, `Objective question number ${i}?`, 'paperA'));
  for (let i = 1; i <= 20; i++) pool.push(theory(`t${i}`, `Theory question number ${i} explained.`, i % 2 ? 'paperA' : 'paperB'));

  const paper = composePatternPaper(frames, pool, { seed: 'seed-one' });

  // The main questions are carried over untouched.
  paper.frames.forEach((frame, idx) => {
    assert.equal(frame.questionNumber, frames[idx].questionNumber);
    assert.equal(frame.instruction, frames[idx].instruction);
    assert.equal(frame.attemptCount, frames[idx].attemptCount);
    assert.equal(frame.marksPerSubQuestion, frames[idx].marksPerSubQuestion);
  });

  // MCQ frames only draw MCQs; theory frames only draw theory questions.
  assert.ok(paper.frames[0].subQuestions.every(s => s.options && s.options.length >= 2));
});

test('a different seed recombines into a different paper', () => {
  const frames = deriveMainQuestionFrames(DETECTED_PATTERN);
  const pool: ComposerQuestion[] = [];
  for (let i = 1; i <= 14; i++) pool.push(mcq(`m${i}`, `Objective question number ${i}?`, 'paperA'));
  for (let i = 1; i <= 20; i++) pool.push(theory(`t${i}`, `Theory question number ${i} explained.`, 'paperA'));

  const a = composePatternPaper(frames, pool, { seed: 'seed-a' });
  const b = composePatternPaper(frames, pool, { seed: 'seed-b' });

  const idsA = a.frames.flatMap(f => f.subQuestions.map(s => s.id)).join(',');
  const idsB = b.frames.flatMap(f => f.subQuestions.map(s => s.id)).join(',');
  assert.notEqual(idsA, idsB);

  // Same seed must reproduce the same paper for auditing.
  const a2 = composePatternPaper(frames, pool, { seed: 'seed-a' });
  assert.equal(a2.frames.flatMap(f => f.subQuestions.map(s => s.id)).join(','), idsA);
});

test('a sub-question is never printed twice on the same paper', () => {
  const frames = deriveMainQuestionFrames(DETECTED_PATTERN);
  const pool: ComposerQuestion[] = [];
  for (let i = 1; i <= 14; i++) pool.push(mcq(`m${i}`, `Objective question number ${i}?`, 'paperA'));
  for (let i = 1; i <= 20; i++) pool.push(theory(`t${i}`, `Theory question number ${i} explained.`, 'paperA'));

  const paper = composePatternPaper(frames, pool, { seed: 'dupe-check' });
  const ids = paper.frames.flatMap(f => f.subQuestions.map(s => s.id));
  assert.equal(new Set(ids).size, ids.length);
});

test('the per-paper contribution cap is honoured and reported', () => {
  const frames = deriveMainQuestionFrames([
    { name: 'SECTION I', type: 'THEORY', marks: 16, questionCount: 4, attemptRules: 'Q.2 Attempt Any Four (16M)' },
  ]);
  // Two papers, each capped at ceil(5 * 0.4) = 2, so at most 4 of the 5 offered
  // sub-questions can be filled - the cap binds and says so.
  const pool: ComposerQuestion[] = [];
  for (let i = 1; i <= 8; i++) pool.push(theory(`a${i}`, `Paper A theory question ${i} explained.`, 'paperA'));
  for (let i = 1; i <= 8; i++) pool.push(theory(`b${i}`, `Paper B theory question ${i} explained.`, 'paperB'));

  const paper = composePatternPaper(frames, pool, { seed: 'cap', maxSourceContributionPercent: 40 });

  assert.equal(paper.frames[0].subQuestions.length, 4);
  // The cap is a balance control, not a source restriction: both papers contribute.
  assert.equal(paper.sourceBreakdown['paperA'], 2);
  assert.equal(paper.sourceBreakdown['paperB'], 2);
  assert.ok(paper.warnings.some(w => w.includes('contribution cap')));
});

test('a single source paper is never capped to nothing', () => {
  // Capping the only available paper would produce an empty question. Mirrors
  // validateBlueprintFeasibility, where one source paper legitimately supplies 100%.
  const frames = deriveMainQuestionFrames([
    { name: 'SECTION I', type: 'THEORY', marks: 16, questionCount: 4, attemptRules: 'Q.2 Attempt Any Four (16M)' },
  ]);
  const pool: ComposerQuestion[] = [];
  for (let i = 1; i <= 8; i++) pool.push(theory(`t${i}`, `Theory question number ${i} explained.`, 'only-paper'));

  const paper = composePatternPaper(frames, pool, { seed: 'solo', maxSourceContributionPercent: 40 });

  assert.equal(paper.frames[0].subQuestions.length, 5);
  assert.equal(paper.warnings.length, 0);
});

test('escapeLatex escapes control characters but leaves inline math intact', () => {
  assert.equal(escapeLatex('cost is 50% of $x^2$ total'), 'cost is 50\\% of $x^2$ total');
  assert.equal(escapeLatex('a_b & c#d'), 'a\\_b \\& c\\#d');
});

test('pipeTableToLatex rebuilds a real tabular from a pipe table', () => {
  const { body, table } = pipeTableToLatex(
    ['Compare the following:', '| Algorithm | Complexity |', '|---|---|', '| Binary search | O(log n) |'].join('\n')
  );

  assert.ok(table, 'expected a table to be recognised');
  assert.match(table!, /\\begin\{tabular\}/);
  assert.match(table!, /Binary search & O\(log n\)/);
  assert.match(body, /Compare the following:/);
  assert.doesNotMatch(body, /\|/);
});

test('prose without a table is left alone', () => {
  const { table } = pipeTableToLatex('Explain the difference between a pipe | and a filter.');
  assert.equal(table, null);
});

test('buildPatternPaperLatex prints the main questions verbatim', () => {
  const frames = deriveMainQuestionFrames(DETECTED_PATTERN);
  const pool: ComposerQuestion[] = [];
  for (let i = 1; i <= 14; i++) pool.push(mcq(`m${i}`, `Objective question number ${i}?`, 'paperA'));
  for (let i = 1; i <= 20; i++) pool.push(theory(`t${i}`, `Theory question number ${i} explained.`, 'paperA'));

  const paper = withSetLetter(composePatternPaper(frames, pool, { seed: 'latex' }), 'Q');
  const latex = buildPatternPaperLatex({
    exam: { universityName: 'State University', subject: 'Operating Systems', setLetter: 'Q', totalMarks: 70 },
    paper,
  });

  assert.match(latex, /\\documentclass/);
  assert.match(latex, /\\end\{document\}/);
  // Every preserved main question and its instruction reaches the document.
  for (const frame of frames) {
    assert.ok(latex.includes(frame.questionNumber), `missing ${frame.questionNumber}`);
    assert.ok(latex.includes(frame.instruction), `missing instruction for ${frame.questionNumber}`);
  }
  assert.ok(latex.includes('SET: Q'));
});

test('a figure reference compiles whether or not the image arrived', () => {
  const frames = deriveMainQuestionFrames([
    { name: 'SECTION I', type: 'THEORY', marks: 4, questionCount: 1, attemptRules: 'Q.2 Attempt Any One (4M)' },
  ]);
  const pool = [theory('t1', 'Draw the process state diagram and label each transition.', 'paperA')];
  const paper = composePatternPaper(frames, pool, { seed: 'fig' });

  const latex = buildPatternPaperLatex({
    exam: { subject: 'Operating Systems', setLetter: 'P' },
    paper,
    figureFiles: { t1: 'figure-1.png' },
  });

  // The real image when present, a labelled placeholder when the compiler only
  // accepts a single file - never a hard failure on a missing graphic.
  assert.match(latex, /\\IfFileExists\{figure-1\.png\}/);
  assert.match(latex, /\\includegraphics\[width=0\.55\\textwidth\]\{figure-1\.png\}/);
  assert.match(latex, /Diagram from source paper/);
  assert.match(latex, /\\usepackage\{graphicx\}/);
});

test('a main question with no available sub-questions still renders', () => {
  const frames = deriveMainQuestionFrames([
    { name: 'SECTION I', type: 'THEORY', marks: 16, questionCount: 4, attemptRules: 'Q.2 Attempt Any Four (16M)' },
  ]);
  const paper = composePatternPaper(frames, [], { seed: 'empty' });

  const latex = buildPatternPaperLatex({ exam: { subject: 'Empty' }, paper });

  assert.match(latex, /No sub-questions available for this main question/);
  assert.match(latex, /\\end\{document\}/);
});

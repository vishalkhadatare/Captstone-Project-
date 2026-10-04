import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildResealPayload,
  parseStoredOptions,
  planReseal,
  type ResealCompositionRow,
  type ResealQuestionRow,
} from './paperReseal.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const exam = {
  id: 'EXAM-1',
  name: 'Btech Endsem',
  subject: 'Computer Science',
  category: 'University Exam',
  exam_type: 'THEORY',
  university_name: 'Solapur University',
  blueprint_pattern: 'CBCS',
  marking_scheme: 'Standard Marks',
  duration_minutes: 180,
  total_marks: 90,
};

const bank = (rows: ResealQuestionRow[]) => new Map(rows.map(row => [row.id, row]));

const composition = (rows: Partial<ResealCompositionRow>[]): ResealCompositionRow[] =>
  rows.map((row, index) => ({
    question_id: row.question_id || `Q-${index + 1}`,
    order_index: row.order_index ?? index + 1,
    marks: row.marks ?? null,
    section_name: row.section_name ?? null,
  }));

const questions = bank([
  { id: 'Q-a', content_text: 'Explain AES-GCM.', options_json: '["A","B","C","D"]', marks: 5, subject: 'Security', question_type: 'MCQ' },
  { id: 'Q-b', content_text: 'Prove | a | b | is a table.', options_json: null, marks: 10, subject: 'Security', question_type: 'THEORY' },
  { id: 'Q-c', content_text: 'Define a mutex.', options_json: 'not json', marks: 5, subject: 'OS' },
]);

// ---------------------------------------------------------------------------
// Stored options
// ---------------------------------------------------------------------------

test('parseStoredOptions accepts a JSON string, a live array, and refuses junk', () => {
  assert.deepEqual(parseStoredOptions('["A","B"]'), ['A', 'B']);
  assert.deepEqual(parseStoredOptions(['A', 'B']), ['A', 'B']);
  assert.deepEqual(parseStoredOptions('nonsense'), []);
  assert.deepEqual(parseStoredOptions('{"not":"an array"}'), []);
  assert.deepEqual(parseStoredOptions(null), []);
  assert.deepEqual(parseStoredOptions(''), []);
  assert.deepEqual(parseStoredOptions(undefined), []);
});

// ---------------------------------------------------------------------------
// Rebuilding the payload
// ---------------------------------------------------------------------------

test('the payload keeps the generator shape the viewers already read', () => {
  const { payload } = buildResealPayload({
    exam,
    versionCode: 'UNIV-BTEC-332-SetP-1991',
    composition: composition([{ question_id: 'Q-a', marks: 5 }, { question_id: 'Q-b', marks: 10 }]),
    questions,
  });

  assert.equal(payload.examinationId, 'EXAM-1');
  assert.equal(payload.examinationName, 'Btech Endsem');
  assert.equal(payload.versionCode, 'UNIV-BTEC-332-SetP-1991');
  assert.equal(payload.universityName, 'Solapur University');
  assert.equal(payload.isUniversity3PaperFormat, true);
  assert.equal(payload.blueprint, null);
  assert.equal(payload.resealedReason.includes('key rotated'), true);
});

test('questions come back in stored paper order, not pool order', () => {
  const { payload } = buildResealPayload({
    exam,
    versionCode: 'V1',
    composition: composition([
      { question_id: 'Q-c', order_index: 3 },
      { question_id: 'Q-a', order_index: 1 },
      { question_id: 'Q-b', order_index: 2 },
    ]),
    questions,
  });

  assert.deepEqual(
    payload.questions.map((question: any) => question.questionId),
    ['Q-a', 'Q-b', 'Q-c']
  );
  assert.deepEqual(
    payload.questions.map((question: any) => question.questionNumber),
    [1, 2, 3]
  );
  assert.deepEqual(
    payload.questions.map((question: any) => question.orderIndex),
    [1, 2, 3]
  );
});

test('per-question marks come from the composition that was actually printed', () => {
  const { payload, totalMarks } = buildResealPayload({
    exam,
    versionCode: 'V1',
    composition: composition([
      { question_id: 'Q-a', marks: 7 },
      { question_id: 'Q-b', marks: 13 },
    ]),
    questions,
  });

  assert.deepEqual(
    payload.questions.map((question: any) => question.marks),
    [7, 13]
  );
  assert.equal(totalMarks, 20);
  assert.equal(payload.totalMarks, 20);
});

test('a composition row without marks falls back to one mark rather than zero', () => {
  const { payload } = buildResealPayload({
    exam,
    versionCode: 'V1',
    composition: composition([{ question_id: 'Q-a', marks: null }]),
    questions,
  });
  assert.equal(payload.questions[0].marks, 1);
});

test('question content, options and section are carried across', () => {
  const { payload } = buildResealPayload({
    exam,
    versionCode: 'V1',
    composition: composition([{ question_id: 'Q-a', section_name: 'SECTION I' }]),
    questions,
  });

  const question = payload.questions[0];
  assert.equal(question.content, 'Explain AES-GCM.');
  assert.deepEqual(question.options, ['A', 'B', 'C', 'D']);
  assert.equal(question.type, 'MCQ');
  assert.equal(question.sectionName, 'SECTION I');
  assert.equal(question.correctAnswerEncryptedNotice, '[PROTECTED BY ZEROLEAK CRYPTOGRAPHIC VAULT]');
});

test('a question with unreadable options is treated as theory, not as a broken MCQ', () => {
  const { payload } = buildResealPayload({
    exam,
    versionCode: 'V1',
    composition: composition([{ question_id: 'Q-c' }]),
    questions,
  });

  assert.deepEqual(payload.questions[0].options, []);
  assert.equal(payload.questions[0].type, 'THEORY');
});

test('a table question is still detected from the content', () => {
  const { payload } = buildResealPayload({
    exam,
    versionCode: 'V1',
    composition: composition([{ question_id: 'Q-b' }]),
    questions,
  });
  assert.equal(payload.questions[0].hasTable, true);
});

test('the subject breakdown is rebuilt from the questions actually used', () => {
  const { payload } = buildResealPayload({
    exam,
    versionCode: 'V1',
    composition: composition([
      { question_id: 'Q-a', marks: 5 },
      { question_id: 'Q-b', marks: 10 },
      { question_id: 'Q-c', marks: 5 },
    ]),
    questions,
  });

  const bySubject = Object.fromEntries(
    payload.subjectBreakdown.map((entry: any) => [entry.subject, entry])
  );
  assert.deepEqual(bySubject.Security, { subject: 'Security', count: 2, totalMarks: 15 });
  assert.deepEqual(bySubject.OS, { subject: 'OS', count: 1, totalMarks: 5 });
});

test('questions the pool no longer has are reported, not silently dropped', () => {
  const { payload, missingQuestionIds } = buildResealPayload({
    exam,
    versionCode: 'V1',
    composition: composition([{ question_id: 'Q-a' }, { question_id: 'Q-gone' }]),
    questions,
  });

  assert.deepEqual(missingQuestionIds, ['Q-gone']);
  assert.equal(payload.questions.length, 1);
});

test('an exam with no university is not dressed up as a university paper', () => {
  const { payload } = buildResealPayload({
    exam: { id: 'EXAM-2', name: 'Plain Exam', subject: 'Maths' },
    versionCode: 'V1',
    composition: composition([{ question_id: 'Q-a' }]),
    questions,
  });

  assert.equal(payload.isUniversity3PaperFormat, false);
  assert.equal(payload.universityName, 'Autonomous State Examination Board');
  assert.equal(payload.durationMinutes, 180);
  assert.match(payload.instructions[0], /Official Examination Standard/);
});

// ---------------------------------------------------------------------------
// Deciding whether a paper can be re-sealed at all
// ---------------------------------------------------------------------------

test('planReseal refuses a version with no stored composition', () => {
  const plan = planReseal({ composition: [], questions });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /No stored question composition/);
});

test('planReseal refuses when any question in the paper is gone', () => {
  const plan = planReseal({
    composition: composition([{ question_id: 'Q-a' }, { question_id: 'Q-gone' }, { question_id: 'Q-also-gone' }]),
    questions,
  });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /2 of 3 questions/);
});

test('planReseal accepts a composition whose questions all exist', () => {
  const plan = planReseal({
    composition: composition([{ question_id: 'Q-a' }, { question_id: 'Q-b' }]),
    questions,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.reason, '');
});

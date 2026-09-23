/**
 * Tests for normalizePatternSection.
 *
 * Regression cover for the bug where a pattern detected from an uploaded paper
 * was stored with its own field names (questionCount / type / marks /
 * attemptRules) but read back with the blueprint's names (totalQuestions /
 * questionType / marksPerQuestion / questionsToAttempt). Every field differed,
 * so each section resolved to zero questions and the generated paper was empty.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePatternSection, normalizePatternSections } from './multiPaperGenerator.ts';

test('maps a real detected MCQ section onto the blueprint shape', () => {
  // Exactly the shape analyzeConsolidatedExamPattern emits (server/ai.ts:1167).
  const s = normalizePatternSection({
    name: 'MCQ / Objective Questions',
    type: 'MCQ',
    marks: 14,
    questionCount: 14,
    attemptRules: 'All 14 MCQs are compulsory',
  });

  assert.equal(s.totalQuestions, 14, 'questionCount must map to totalQuestions');
  assert.equal(s.questionType, 'MCQ', 'type must map to questionType');
  assert.equal(s.marksPerQuestion, 1, 'marks/questionCount must derive marksPerQuestion');
  assert.equal(s.questionsToAttempt, 14, 'first number in attemptRules must be used');
  assert.equal(s.difficulty, 'ANY', 'unqualified pattern means no difficulty filter');
  assert.equal(s.negativeMarks, 0);
  assert.ok(s.name.length > 0);
});

test('maps a real detected THEORY section', () => {
  const s = normalizePatternSection({
    name: 'SECTION I',
    type: 'THEORY',
    marks: 28,
    questionCount: 2,
    attemptRules: 'Q.2 (Attempt Any Four, 16M), Q.3 (Attempt Any Two, 12M)',
  });
  assert.equal(s.totalQuestions, 2);
  assert.equal(s.questionType, 'THEORY');
  assert.equal(s.marksPerQuestion, 14, '28 marks / 2 questions');
  assert.equal(s.questionsToAttempt, 2, 'first number is 2, from "Q.2"');
});

test('prefers explicit blueprint fields when already present', () => {
  const s = normalizePatternSection({
    name: 'Section A',
    questionType: 'THEORY',
    totalQuestions: 6,
    marksPerQuestion: 5,
    questionsToAttempt: 4,
    difficulty: 'HARD',
    negativeMarks: 1,
  });
  assert.equal(s.totalQuestions, 6);
  assert.equal(s.questionType, 'THEORY');
  assert.equal(s.marksPerQuestion, 5);
  assert.equal(s.questionsToAttempt, 4);
  assert.equal(s.difficulty, 'HARD');
  assert.equal(s.negativeMarks, 1);
});

test('prefers totalMarks over marks when deriving', () => {
  const s = normalizePatternSection({ name: 'S', type: 'THEORY', totalMarks: 20, questionCount: 5 });
  assert.equal(s.marksPerQuestion, 4);
});

test('does not leave questionsToAttempt above the question count', () => {
  const s = normalizePatternSection({ name: 'S', type: 'MCQ', questionCount: 3, attemptRules: 'Attempt any 10' });
  assert.equal(s.questionsToAttempt, 3, 'clamped to the section size');
});

test('does not force a subject, which would exclude every question', () => {
  // The blueprint filter is an exact string compare (`q.subject !== section.subject`),
  // so defaulting this to the exam subject would silently empty the section.
  const s = normalizePatternSection({ name: 'S', type: 'MCQ', questionCount: 5 });
  assert.equal(s.subject, undefined);
});

test('survives malformed input without throwing', () => {
  for (const input of [null, undefined, {}, { questionCount: 'nonsense' }, { questionCount: -3 }]) {
    const s = normalizePatternSection(input);
    assert.equal(typeof s.totalQuestions, 'number');
    assert.ok(s.totalQuestions >= 0, 'never negative');
    assert.ok(s.name.length > 0, 'always has a display name');
  }
});

test('normalizePatternSections handles non-arrays and preserves order', () => {
  assert.deepEqual(normalizePatternSections(null), []);
  assert.deepEqual(normalizePatternSections('nope'), []);
  const out = normalizePatternSections([
    { name: 'First', type: 'MCQ', questionCount: 14 },
    { name: 'Second', type: 'THEORY', questionCount: 2 },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, 'First');
  assert.equal(out[1].name, 'Second');
});

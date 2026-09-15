import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateBlueprintTotals,
  validateManualBlueprint,
  normalizeManualBlueprint,
} from './blueprintRules.js';

test('calculateBlueprintTotals uses questions-to-attempt times marks-per-question', () => {
  const blueprint = {
    totalMarks: 0,
    sections: [
      { totalQuestions: 20, questionsToAttempt: 20, marksPerQuestion: 1, negativeMarks: 0 },
      { totalQuestions: 10, questionsToAttempt: 8, marksPerQuestion: 2, negativeMarks: 0.25 },
    ],
  };

  const totals = calculateBlueprintTotals(blueprint as any);

  assert.equal(totals.totalQuestions, 30);
  assert.equal(totals.questionsToAttempt, 28);
  assert.equal(totals.totalMarks, 36);
  assert.equal(totals.sectionMarks[0], 20);
  assert.equal(totals.sectionMarks[1], 16);
});

test('validateManualBlueprint rejects invalid attempt counts and mismatched totals', () => {
  const errors = validateManualBlueprint({
    examName: 'ABC University',
    conductingBody: 'ABC University',
    paperName: 'Paper 1',
    version: 'v1.0',
    examYear: 2025,
    durationMinutes: 120,
    totalMarks: 50,
    sections: [
      {
        name: 'Section A',
        subject: 'Physics',
        totalQuestions: 20,
        questionsToAttempt: 25,
        marksPerQuestion: 1,
        negativeMarks: 0,
      },
      {
        name: 'Section B',
        subject: 'Chemistry',
        totalQuestions: 10,
        questionsToAttempt: 8,
        marksPerQuestion: 2,
        negativeMarks: 0.25,
      },
    ],
  } as any);

  assert(errors.some(error => error.includes('cannot exceed total questions')));
  assert(errors.some(error => error.includes('Total marks must equal')));
});

test('normalizeManualBlueprint keeps section total marks consistent with rules', () => {
  const normalized = normalizeManualBlueprint({
    examName: 'ABC University',
    paperName: 'Paper 1',
    examType: 'MCQ',
    conductingBody: 'ABC University',
    examYear: 2025,
    durationMinutes: 120,
    totalMarks: 0,
    version: 'v1.0',
    sections: [
      { name: 'Section A', subject: 'Physics', totalQuestions: 20, questionsToAttempt: 20, marksPerQuestion: 1, negativeMarks: 0 },
      { name: 'Section B', subject: 'Chemistry', totalQuestions: 10, questionsToAttempt: 8, marksPerQuestion: 2, negativeMarks: 0.25 },
    ],
  } as any, 'MCQ' as any);

  assert.equal(normalized.totalMarks, 36);
  assert.equal(normalized.sections[0].totalMarks, 20);
  assert.equal(normalized.sections[1].totalMarks, 16);
});

test('normalizeManualBlueprint supports university main-question sub-question marking', () => {
  const normalized = normalizeManualBlueprint({
    examName: 'ABC University',
    paperName: 'Paper 1',
    examType: 'University',
    conductingBody: 'ABC University',
    examYear: 2025,
    durationMinutes: 120,
    totalMarks: 0,
    version: 'v1.0',
    sections: [
      { questionNumber: '1', questionType: 'MCQ', subQuestions: 6, marksPerSubQuestion: 1, totalMarks: 6 },
      { questionNumber: '2', questionType: 'THEORY', subQuestions: 5, marksPerSubQuestion: 5, totalMarks: 25 },
      { questionNumber: '3', questionType: 'THEORY', subQuestions: 4, marksPerSubQuestion: 10, totalMarks: 40 },
    ],
  } as any, 'University' as any);

  assert.equal(normalized.totalMarks, 71);
  assert.equal(normalized.sections[0].totalQuestions, 6);
  assert.equal(normalized.sections[0].marksPerQuestion, 1);
  assert.equal(normalized.sections[0].totalMarks, 6);
  assert.equal(normalized.sections[1].totalMarks, 25);
  assert.equal(normalized.sections[2].totalMarks, 40);
});

test('validateManualBlueprint rejects manual main-question marks and mismatched computed totals', () => {
  const errors = validateManualBlueprint({
    examName: 'ABC University',
    conductingBody: 'ABC University',
    paperName: 'Paper 1',
    version: 'v1.0',
    examYear: 2025,
    durationMinutes: 120,
    totalMarks: 50,
    sections: [
      { questionNumber: '1', questionType: 'MCQ', subQuestions: 6, marksPerSubQuestion: 1, mainQuestionMarks: 6 },
      { questionNumber: '2', questionType: 'THEORY', subQuestions: 5, marksPerSubQuestion: 5, totalMarks: 20 },
    ],
  } as any);

  assert(errors.some(error => error.toLowerCase().includes('main question') || error.toLowerCase().includes('marks per sub-question')));
  assert(errors.some(error => error.toLowerCase().includes('total marks must equal')));
});

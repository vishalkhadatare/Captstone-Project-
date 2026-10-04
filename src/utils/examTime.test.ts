import test from 'node:test';
import assert from 'node:assert/strict';

import { formatExamUnlock, isTimeOnly, resolveExamMoment } from './examTime.ts';

test('isTimeOnly detects bare HH:MM strings', () => {
  assert.equal(isTimeOnly('03:45'), true);
  assert.equal(isTimeOnly('9:05:30'), true);
  assert.equal(isTimeOnly('2026-09-20T03:45'), false);
  assert.equal(isTimeOnly(''), false);
  assert.equal(isTimeOnly(null), false);
  assert.equal(isTimeOnly(undefined), false);
});

test('resolveExamMoment anchors time-only values to the exam date', () => {
  const moment = resolveExamMoment('03:45', '2026-09-20');
  assert.ok(moment instanceof Date);
  assert.equal(moment.getHours(), 3);
  assert.equal(moment.getMinutes(), 45);
  assert.equal(moment.getFullYear(), 2026);
  assert.equal(moment.getMonth(), 8); // September
  assert.equal(moment.getDate(), 20);
});

test('resolveExamMoment anchors time-only values to today when date unknown', () => {
  const now = new Date();
  const moment = resolveExamMoment('02:23');
  assert.ok(moment instanceof Date);
  assert.equal(moment.getHours(), 2);
  assert.equal(moment.getMinutes(), 23);
  assert.equal(moment.getFullYear(), now.getFullYear());
});

test('resolveExamMoment parses real datetime strings unchanged', () => {
  const moment = resolveExamMoment('2026-09-20T03:45:00Z');
  assert.ok(moment instanceof Date);
  assert.equal(moment.toISOString(), '2026-09-20T03:45:00.000Z');
});

test('resolveExamMoment returns null for garbage instead of Invalid Date', () => {
  assert.equal(resolveExamMoment('soon'), null);
  assert.equal(resolveExamMoment(''), null);
  assert.equal(resolveExamMoment(null), null);
});

test('formatExamUnlock never emits Invalid Date', () => {
  assert.ok(!formatExamUnlock('03:45', '2026-09-20').includes('Invalid'));
  assert.ok(!formatExamUnlock('03:45').includes('Invalid'));
  assert.equal(formatExamUnlock('garbage'), 'garbage');
  assert.equal(formatExamUnlock(null), '—');
  assert.ok(formatExamUnlock('2026-09-20T03:45:00').length > 0);
});

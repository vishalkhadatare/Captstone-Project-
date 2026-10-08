import test from 'node:test';
import assert from 'node:assert/strict';
import { getDb, executeRun } from './db.ts';
import {
  initViewOnceSchema,
  getViewOnceStatus,
  startViewOnceSession,
  consumeViewOnceSession,
  recordViewOnceSecurityEvent,
} from './viewOnceService.ts';

test('View-Once Preview Security Engine Tests', async (t) => {
  const db = await getDb();
  initViewOnceSchema(db);

  const testPaperId = `paper-test-${Date.now()}`;
  const testExamId = `exam-test-${Date.now()}`;
  const testUserId = 'usr-exam-mgr-01';

  // Seed dummy competitive paper
  executeRun(
    db,
    `INSERT INTO competitive_generated_papers (
      id, org_id, exam_id, title, exam_type, total_questions, total_marks, total_positive_marks,
      total_negative_marks, sections_json, questions_json, blueprint_snapshot_json, paper_fingerprint,
      generated_at, preview_status
    ) VALUES (?, 'ORG-001', ?, 'Test Competitive Exam', 'MCQ', 10, 20, 20, 0, '[]', '[]', '{}', 'sha256-dummy', ?, 'NOT_VIEWED')`,
    [testPaperId, testExamId, new Date().toISOString()]
  );

  await t.test('1. Initial state must be NOT_VIEWED and allow view', () => {
    const status = getViewOnceStatus(db, 'COMPETITIVE', testPaperId);
    assert.equal(status.previewStatus, 'NOT_VIEWED');
    assert.equal(status.canView, true);
  });

  let activeToken = '';

  await t.test('2. First preview session starts successfully and sets VIEWING', () => {
    const startResult = startViewOnceSession(db, {
      examType: 'COMPETITIVE',
      examId: testExamId,
      paperId: testPaperId,
      userId: testUserId,
      userRole: 'EXAM_MANAGER',
      durationSeconds: 600,
    });

    assert.equal(startResult.success, true);
    assert.equal(startResult.status, 'VIEWING');
    assert.ok(startResult.sessionToken?.startsWith('VOP-'));
    activeToken = startResult.sessionToken!;

    const statusAfterStart = getViewOnceStatus(db, 'COMPETITIVE', testPaperId);
    assert.equal(statusAfterStart.previewStatus, 'VIEWING');
    assert.equal(statusAfterStart.canView, true);
    assert.equal(statusAfterStart.activeSessionToken, activeToken);
  });

  await t.test('3. Blocks simultaneous session opening from another tab or device', () => {
    const secondStartResult = startViewOnceSession(db, {
      examType: 'COMPETITIVE',
      examId: testExamId,
      paperId: testPaperId,
      userId: 'usr-another-user',
      userRole: 'EXAM_MANAGER',
    });

    assert.equal(secondStartResult.success, false);
    assert.equal(secondStartResult.statusCode, 409);
    assert.match(secondStartResult.error || '', /already active in another browser tab/);
  });

  await t.test('4. Resuming with exact same session token succeeds', () => {
    const resumeResult = startViewOnceSession(db, {
      examType: 'COMPETITIVE',
      examId: testExamId,
      paperId: testPaperId,
      userId: testUserId,
      userRole: 'EXAM_MANAGER',
      requestSessionToken: activeToken,
    });

    assert.equal(resumeResult.success, true);
    assert.equal(resumeResult.sessionToken, activeToken);
  });

  await t.test('5. Records screen capture / defocus security events', () => {
    const recResult = recordViewOnceSecurityEvent(db, {
      sessionToken: activeToken,
      paperId: testPaperId,
      examId: testExamId,
      examType: 'COMPETITIVE',
      userId: testUserId,
      userRole: 'EXAM_MANAGER',
      eventType: 'SCREENSHOT_ATTEMPT_DETECTED',
      details: { key: 'PrintScreen', time: Date.now() },
    });

    assert.equal(recResult.success, true);
    assert.equal(recResult.eventCount, 1);
  });

  await t.test('6. Consuming preview session permanently locks it to CONSUMED', () => {
    const consumeResult = consumeViewOnceSession(db, {
      examType: 'COMPETITIVE',
      paperId: testPaperId,
      sessionToken: activeToken,
      userId: testUserId,
      reason: 'CONFIRMED_FINALIZE',
    });

    assert.equal(consumeResult.success, true);
    assert.equal(consumeResult.status, 'CONSUMED');
    assert.equal(consumeResult.reason, 'CONFIRMED_FINALIZE');

    const statusAfterConsume = getViewOnceStatus(db, 'COMPETITIVE', testPaperId);
    assert.equal(statusAfterConsume.previewStatus, 'CONSUMED');
    assert.equal(statusAfterConsume.canView, false);
  });

  await t.test('7. Subsequent preview requests are strictly rejected with 403 Forbidden', () => {
    const rejectedStart = startViewOnceSession(db, {
      examType: 'COMPETITIVE',
      examId: testExamId,
      paperId: testPaperId,
      userId: testUserId,
      userRole: 'EXAM_MANAGER',
    });

    assert.equal(rejectedStart.success, false);
    assert.equal(rejectedStart.statusCode, 403);
    assert.match(rejectedStart.error || '', /already been viewed and consumed/);
  });

  await t.test('8. Automatic transition to CONSUMED when session expires', () => {
    const expiredPaperId = `paper-expired-${Date.now()}`;
    const startResult = startViewOnceSession(db, {
      examType: 'COMPETITIVE',
      examId: testExamId,
      paperId: expiredPaperId,
      userId: testUserId,
      userRole: 'EXAM_MANAGER',
      durationSeconds: -10, // past expiration
    });

    assert.equal(startResult.success, true);

    const expiredStatus = getViewOnceStatus(db, 'COMPETITIVE', expiredPaperId);
    assert.equal(expiredStatus.previewStatus, 'CONSUMED');
    assert.equal(expiredStatus.canView, false);
    assert.equal(expiredStatus.consumedReason, 'EXPIRED');
  });
});

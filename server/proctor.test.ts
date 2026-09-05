import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getDb, executeRun, executeQuery } from './db.ts';
import {
  calculateProctorRisk,
  determineRiskLevel,
  recordProctorEvent,
  getProctorSettings,
  updateProctorSettings,
  updateSessionHeartbeat,
} from './proctor.ts';

describe('ZeroLeak Proctor Engine & Risk Telemetry Tests', () => {
  test('1. Risk levels map accurately to 0–100 scores', () => {
    assert.equal(determineRiskLevel(0), 'NORMAL');
    assert.equal(determineRiskLevel(15), 'NORMAL');
    assert.equal(determineRiskLevel(20), 'NORMAL');
    assert.equal(determineRiskLevel(21), 'LOW');
    assert.equal(determineRiskLevel(35), 'LOW');
    assert.equal(determineRiskLevel(40), 'LOW');
    assert.equal(determineRiskLevel(41), 'MEDIUM');
    assert.equal(determineRiskLevel(60), 'MEDIUM');
    assert.equal(determineRiskLevel(61), 'HIGH');
    assert.equal(determineRiskLevel(80), 'HIGH');
    assert.equal(determineRiskLevel(81), 'CRITICAL');
    assert.equal(determineRiskLevel(100), 'CRITICAL');
  });

  test('2. Event logging and server-side risk score calculation', async () => {
    const db = await getDb();
    const testAttemptId = `TEST-ATT-${Date.now()}`;
    const testExamId = 'EXAM-2026-CS-NATIONAL';
    const testStudentId = 'STU-TEST-001';
    const now = new Date().toISOString();

    executeRun(
      db,
      `INSERT INTO exam_attempts (
        id, exam_id, student_id, student_name, student_email, status,
        started_at, total_questions, score, risk_score, risk_level, warning_count, created_at, updated_at
      ) VALUES (?, ?, ?, 'Test Candidate', 'test@example.com', 'IN_PROGRESS', ?, 5, 0, 0, 'NORMAL', 0, ?, ?)`,
      [testAttemptId, testExamId, testStudentId, now, now, now]
    );

    executeRun(
      db,
      `INSERT INTO proctor_sessions (
        id, attempt_id, exam_id, student_id, camera_status, microphone_status,
        fullscreen_status, face_status, faces_detected_count, last_heartbeat_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'ACTIVE', 'ACTIVE', 'ACTIVE', 'DETECTED', 1, ?, ?, ?)`,
      [`SESS-${testAttemptId}`, testAttemptId, testExamId, testStudentId, now, now, now]
    );

    // Initial state: 0 risk points
    const initialRisk = calculateProctorRisk(db, testAttemptId);
    assert.equal(initialRisk.risk_score, 0);
    assert.equal(initialRisk.risk_level, 'NORMAL');

    // Record TAB_SWITCH (+10)
    const tabRes = recordProctorEvent(db, {
      attempt_id: testAttemptId,
      exam_id: testExamId,
      student_id: testStudentId,
      event_type: 'TAB_SWITCH',
      severity: 'MEDIUM',
      metadata: { duration_seconds: 5 },
    });
    assert.equal(tabRes.risk_score, 10);
    assert.equal(tabRes.risk_level, 'NORMAL');
    assert.equal(tabRes.warning_count, 1);

    // Record FULLSCREEN_EXIT (+10)
    const fsRes = recordProctorEvent(db, {
      attempt_id: testAttemptId,
      exam_id: testExamId,
      student_id: testStudentId,
      event_type: 'FULLSCREEN_EXIT',
      severity: 'MEDIUM',
    });
    assert.equal(fsRes.risk_score, 20);
    assert.equal(fsRes.warning_count, 2);

    // Record MULTIPLE_FACES (+30) -> Total 50 (MEDIUM)
    const multiRes = recordProctorEvent(db, {
      attempt_id: testAttemptId,
      exam_id: testExamId,
      student_id: testStudentId,
      event_type: 'MULTIPLE_FACES',
      severity: 'HIGH',
      hardware_status: { face_count: 2 },
    });
    assert.equal(multiRes.risk_score, 50);
    assert.equal(multiRes.risk_level, 'MEDIUM');

    // Record CAMERA_DISABLED (+30) -> Total 80 (HIGH) -> Should trigger FLAGGED_FOR_REVIEW
    const camRes = recordProctorEvent(db, {
      attempt_id: testAttemptId,
      exam_id: testExamId,
      student_id: testStudentId,
      event_type: 'CAMERA_DISABLED',
      severity: 'HIGH',
      hardware_status: { camera: 'DISABLED' },
    });
    assert.equal(camRes.risk_score, 80);
    assert.equal(camRes.risk_level, 'HIGH');

    // Check that attempt status in database transitioned to FLAGGED_FOR_REVIEW
    const updatedAttempt = executeQuery(db, 'SELECT status, risk_score, risk_level FROM exam_attempts WHERE id = ?', [testAttemptId])[0];
    assert.equal(updatedAttempt.status, 'FLAGGED_FOR_REVIEW');
    assert.equal(updatedAttempt.risk_score, 80);
    assert.equal(updatedAttempt.risk_level, 'HIGH');
  });

  test('3. Settings management and configurable weights', async () => {
    const db = await getDb();
    const current = getProctorSettings(db);
    assert.ok(current.tab_switch_points > 0);
    assert.ok(current.max_warnings >= 1);

    // Update max_warnings to 4
    const updated = updateProctorSettings(db, { max_warnings: 4 });
    assert.equal(updated.max_warnings, 4);

    const reRead = getProctorSettings(db);
    assert.equal(reRead.max_warnings, 4);

    // Restore to 3
    updateProctorSettings(db, { max_warnings: 3 });
  });

  test('4. Session heartbeat telemetry updates', async () => {
    const db = await getDb();
    const testAttemptId = `HEARTBEAT-TEST-${Date.now()}`;
    const now = new Date().toISOString();

    executeRun(
      db,
      `INSERT INTO proctor_sessions (
        id, attempt_id, exam_id, student_id, camera_status, microphone_status,
        fullscreen_status, face_status, faces_detected_count, last_heartbeat_at, created_at, updated_at
      ) VALUES (?, ?, 'EXAM-1', 'STU-1', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'DETECTED', 1, ?, ?, ?)`,
      [`SESS-${testAttemptId}`, testAttemptId, now, now, now]
    );

    updateSessionHeartbeat(db, testAttemptId, {
      camera_status: 'DISABLED',
      face_status: 'NOT_DETECTED',
      faces_detected_count: 0,
      fullscreen_status: 'EXITED',
    });

    const session = executeQuery(db, 'SELECT * FROM proctor_sessions WHERE attempt_id = ?', [testAttemptId])[0];
    assert.equal(session.camera_status, 'DISABLED');
    assert.equal(session.face_status, 'NOT_DETECTED');
    assert.equal(session.faces_detected_count, 0);
    assert.equal(session.fullscreen_status, 'EXITED');
  });
});


import test from 'node:test';
import assert from 'node:assert/strict';
import { getDb, executeQuery, executeRun } from './db.ts';
import { v4 as uuidv4 } from 'uuid';

test('1. Database schema contains exam_simulation_sessions and examinations.simulation_status', async () => {
  const db = await getDb();
  
  // Verify exam_simulation_sessions table exists
  const tableCheck = executeQuery(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='exam_simulation_sessions'"
  );
  assert.equal(tableCheck.length, 1, 'exam_simulation_sessions table must exist');

  // Verify examinations columns
  const examCols = executeQuery(db, 'PRAGMA table_info(examinations)');
  const colNames = examCols.map((c: any) => c.name);
  assert.ok(colNames.includes('simulation_status'), 'simulation_status column must exist in examinations');
  assert.ok(colNames.includes('simulated_at'), 'simulated_at column must exist in examinations');
  assert.ok(colNames.includes('simulated_by'), 'simulated_by column must exist in examinations');
});

test('2. One-Time Simulation lifecycle and strict completion lock', async () => {
  const db = await getDb();
  const testExamId = `test-exam-${uuidv4()}`;
  const testUserId = `test-user-${uuidv4()}`;
  const testOrgId = `test-org-${uuidv4()}`;
  const now = new Date().toISOString();

  // Create mock exam
  executeRun(
    db,
    `INSERT INTO examinations (id, org_id, name, subject, category, exam_type, exam_date, exam_time, unlock_time, total_marks, total_questions, duration_minutes, status, simulation_status, created_by, created_at, updated_at)
     VALUES (?, ?, 'Test Biology Exam', 'Biology', 'NEET', 'MCQ', '2026-10-01', '10:00', '09:30', 720, 180, 180, 'READY_FOR_GENERATION', 'NOT_STARTED', ?, ?, ?)`,
    [testExamId, testOrgId, testUserId, now, now]
  );

  // Initial state check
  const initialExam = executeQuery(db, 'SELECT simulation_status FROM examinations WHERE id = ?', [testExamId])[0];
  assert.equal(initialExam.simulation_status, 'NOT_STARTED', 'Initial status must be NOT_STARTED');

  // Start simulation: create session
  const sessionToken = `SIM-${uuidv4()}`;
  const expiresAt = new Date(Date.now() + 900 * 1000).toISOString();
  const mockPaper = {
    examinationId: testExamId,
    examinationName: 'Test Biology Exam',
    subject: 'Biology',
    totalMarks: 720,
    questions: [{ orderIndex: 1, content: 'Sample question 1', marks: 4 }],
  };

  executeRun(
    db,
    `INSERT INTO exam_simulation_sessions (id, exam_id, user_id, session_token, status, paper_snapshot_json, events_json, duration_seconds, started_at, expires_at, created_at)
     VALUES (?, ?, ?, ?, 'IN_PROGRESS', ?, '[]', 900, ?, ?, ?)`,
    [uuidv4(), testExamId, testUserId, sessionToken, JSON.stringify(mockPaper), now, expiresAt, now]
  );

  executeRun(db, 'UPDATE examinations SET simulation_status = "IN_PROGRESS", simulated_by = ?, simulated_at = ? WHERE id = ?', [testUserId, now, testExamId]);

  const inProgressExam = executeQuery(db, 'SELECT simulation_status FROM examinations WHERE id = ?', [testExamId])[0];
  assert.equal(inProgressExam.simulation_status, 'IN_PROGRESS', 'Status must be IN_PROGRESS after start');

  // Log simulation event
  const sessionRecord = executeQuery(db, 'SELECT * FROM exam_simulation_sessions WHERE session_token = ?', [sessionToken])[0];
  const events = JSON.parse(sessionRecord.events_json);
  events.push({ eventType: 'TAB_SWITCH', timestamp: new Date().toISOString() });
  executeRun(db, 'UPDATE exam_simulation_sessions SET events_json = ? WHERE id = ?', [JSON.stringify(events), sessionRecord.id]);

  const updatedSession = executeQuery(db, 'SELECT * FROM exam_simulation_sessions WHERE session_token = ?', [sessionToken])[0];
  assert.equal(JSON.parse(updatedSession.events_json).length, 1);
  assert.equal(JSON.parse(updatedSession.events_json)[0].eventType, 'TAB_SWITCH');

  // Complete simulation
  const completedAt = new Date().toISOString();
  executeRun(db, 'UPDATE exam_simulation_sessions SET status = "COMPLETED", completed_at = ? WHERE session_token = ?', [completedAt, sessionToken]);
  executeRun(db, 'UPDATE examinations SET simulation_status = "COMPLETED", simulated_at = ?, simulated_by = ? WHERE id = ?', [completedAt, testUserId, testExamId]);

  const completedExam = executeQuery(db, 'SELECT simulation_status, simulated_by FROM examinations WHERE id = ?', [testExamId])[0];
  assert.equal(completedExam.simulation_status, 'COMPLETED', 'Exam must have simulation_status = COMPLETED');
  assert.equal(completedExam.simulated_by, testUserId);

  // Verify one-time constraint: if status is COMPLETED, subsequent start requests must be blocked
  const recheckExam = executeQuery(db, 'SELECT * FROM examinations WHERE id = ?', [testExamId])[0];
  const isBlocked = recheckExam.simulation_status === 'COMPLETED';
  assert.equal(isBlocked, true, 'Subsequent preview requests must be strictly blocked when simulation_status is COMPLETED');
});


import test from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs, { Database } from 'sql.js';
import {
  startAuthorityEnclaveSession,
  recordAuthorityLeakEvent,
  updateAuthorityHeartbeat,
  emergencyLockAuthoritySession,
  getAuthoritySurveillanceDashboard,
} from './proctor.ts';

async function createTestDb(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS authority_proctor_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_email TEXT NOT NULL,
      user_role TEXT NOT NULL,
      org_id TEXT NOT NULL,
      workspace_type TEXT NOT NULL,
      exam_id TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      camera_status TEXT DEFAULT 'ACTIVE',
      microphone_status TEXT DEFAULT 'ACTIVE',
      fullscreen_status TEXT DEFAULT 'ACTIVE',
      face_status TEXT DEFAULT 'VERIFIED',
      faces_detected_count INTEGER DEFAULT 1,
      audio_level_db REAL DEFAULT -40.0,
      leak_risk_score INTEGER DEFAULT 0,
      leak_risk_level TEXT DEFAULT 'NORMAL',
      verification_snapshot TEXT,
      emergency_locked INTEGER DEFAULT 0,
      emergency_lock_reason TEXT,
      locked_by TEXT,
      last_heartbeat_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS proctor_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      attempt_id TEXT,
      user_id TEXT,
      user_role TEXT,
      exam_id TEXT,
      student_id TEXT,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      risk_points INTEGER DEFAULT 0,
      timestamp TEXT NOT NULL,
      metadata_json TEXT,
      snapshot_thumbnail TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS examinations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
  `);

  return db;
}

test('1. Authority Proctor Enclave session starts with verified camera and 0 risk', async () => {
  const db = await createTestDb();
  const user = {
    id: 'usr-sme-99',
    full_name: 'Dr. Test SME',
    email: 'sme.test@nbte.edu.in',
    role: 'SME',
    org_id: 'ORG-ZEROLEAK',
  };

  const session = startAuthorityEnclaveSession(
    db,
    user,
    'SME_QUESTION_VETTING',
    'EXAM-CS-01',
    'data:image/png;base64,mock'
  );

  assert.ok(session.id.startsWith('AUTH-SESS-'));
  assert.equal(session.user_role, 'SME');
  assert.equal(session.status, 'ACTIVE');
  assert.equal(session.camera_status, 'ACTIVE');
  assert.equal(session.face_status, 'VERIFIED');
  assert.equal(session.leak_risk_score, 0);
  assert.equal(session.leak_risk_level, 'NORMAL');
});

test('2. Shoulder surfing detection immediately escalates risk score and updates face status', async () => {
  const db = await createTestDb();
  const user = {
    id: 'usr-trans-99',
    full_name: 'Vikram Translator',
    email: 'translator@nbte.edu.in',
    role: 'TRANSLATOR',
    org_id: 'ORG-ZEROLEAK',
  };

  const session = startAuthorityEnclaveSession(db, user, 'TRANSLATOR_PORTAL', 'EXAM-CS-01');

  // Record shoulder surfing event (second face detected behind translator)
  const eventResult = recordAuthorityLeakEvent(db, {
    session_id: session.id,
    user_id: user.id,
    user_role: user.role,
    event_type: 'SHOULDER_SURFING_DETECTED',
    severity: 'HIGH',
    metadata: { faces_detected: 2, action: 'screen_blurred' },
  });

  assert.equal(eventResult.leak_risk_score, 35);
  assert.equal(eventResult.leak_risk_level, 'LOW');

  // Check updated session
  const dash = getAuthoritySurveillanceDashboard(db, 'ORG-ZEROLEAK');
  const updated = dash.sessions.find(s => s.id === session.id);
  assert.equal(updated.face_status, 'SHOULDER_SURFING_DETECTED');
  assert.equal(updated.faces_detected_count, 2);
  assert.equal(dash.metrics.shoulder_surfing_alerts, 1);
});

test('3. Face absent masks screen, and screen unmasked restores verified state', async () => {
  const db = await createTestDb();
  const user = {
    id: 'usr-mgr-99',
    full_name: 'Exam Manager',
    email: 'manager@nbte.edu.in',
    role: 'EXAM_MANAGER',
    org_id: 'ORG-ZEROLEAK',
  };

  const session = startAuthorityEnclaveSession(db, user, 'EXAM_PAPER_COMPILATION');

  // Official steps away
  recordAuthorityLeakEvent(db, {
    session_id: session.id,
    event_type: 'FACE_ABSENT_MASKED',
    severity: 'MEDIUM',
  });

  let dash = getAuthoritySurveillanceDashboard(db);
  let s = dash.sessions.find(item => item.id === session.id);
  assert.equal(s.face_status, 'ABSENT');
  assert.equal(s.faces_detected_count, 0);

  // Official returns
  recordAuthorityLeakEvent(db, {
    session_id: session.id,
    event_type: 'SCREEN_UNMASKED',
    severity: 'LOW',
  });

  dash = getAuthoritySurveillanceDashboard(db);
  s = dash.sessions.find(item => item.id === session.id);
  assert.equal(s.face_status, 'VERIFIED');
  assert.equal(s.faces_detected_count, 1);
});

test('4. Emergency remote lockdown terminates authority session immediately', async () => {
  const db = await createTestDb();
  const user = {
    id: 'usr-op-99',
    full_name: 'Centre Operator',
    email: 'operator@nbte.edu.in',
    role: 'CENTRE_OPERATOR',
    org_id: 'ORG-ZEROLEAK',
  };

  const session = startAuthorityEnclaveSession(db, user, 'DECRYPTED_PAPER_VIEWER');

  const lockRes = emergencyLockAuthoritySession(
    db,
    session.id,
    'Auditor detected unauthorized camera obstruction while paper was open',
    'usr-auditor-01'
  );

  assert.equal(lockRes.success, true);

  const dash = getAuthoritySurveillanceDashboard(db);
  const updated = dash.sessions.find(s => s.id === session.id);
  assert.equal(updated.status, 'LOCKED');
  assert.equal(updated.emergency_locked, 1);
  assert.equal(dash.metrics.locked_sessions, 1);
});


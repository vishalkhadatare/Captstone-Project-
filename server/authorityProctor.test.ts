import test from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs, { Database } from 'sql.js';
import {
  startAuthorityEnclaveSession,
  recordAuthorityLeakEvent,
  updateAuthorityHeartbeat,
  emergencyLockAuthoritySession,
  getAuthoritySurveillanceDashboard,
  saveCameraEvidence,
  getCameraEvidenceBySession,
  saveVoiceEvidence,
  getVoiceEvidenceBySession,
  getUnifiedSessionEvidence,
  issueAuthorityWarning,
  handleAuditorReviewAction,
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
      updated_at TEXT NOT NULL,
      warning_count INTEGER DEFAULT 0,
      review_status TEXT DEFAULT 'PENDING_REVIEW',
      auditor_remarks TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT
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

    CREATE TABLE IF NOT EXISTS proctor_camera_evidence (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      exam_id TEXT,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      image_data_url TEXT NOT NULL,
      storage_reference TEXT,
      file_size_bytes INTEGER DEFAULT 0,
      mime_type TEXT DEFAULT 'image/jpeg',
      event_type TEXT DEFAULT 'CAMERA_SNAPSHOT',
      presence_status TEXT DEFAULT 'PRESENT',
      warning_number INTEGER DEFAULT 0,
      submitted_by TEXT,
      recipient TEXT DEFAULT 'CBI Chief Vigilance & Security Auditor',
      review_status TEXT DEFAULT 'PENDING_REVIEW',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS proctor_voice_evidence (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      exam_id TEXT,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      audio_data_url TEXT NOT NULL,
      storage_reference TEXT,
      duration_seconds REAL DEFAULT 0,
      file_size_bytes INTEGER DEFAULT 0,
      mime_type TEXT DEFAULT 'audio/webm',
      event_type TEXT DEFAULT 'VOICE_RECORDING_EVIDENCE',
      warning_number INTEGER DEFAULT 0,
      submitted_by TEXT,
      recipient TEXT DEFAULT 'CBI Chief Vigilance & Security Auditor',
      review_status TEXT DEFAULT 'PENDING_REVIEW',
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

test('5. 3-Warning engine strictly caps at 3 and triggers lockdown and audit escalation at 3/3', async () => {
  const db = await createTestDb();
  const user = {
    id: 'usr-trans-test',
    full_name: 'Prof. Meera Deshmukh',
    email: 'translator@nbte.edu.in',
    role: 'TRANSLATOR',
    org_id: 'ORG-ZEROLEAK',
  };

  const session = startAuthorityEnclaveSession(db, user, 'TRANSLATOR_PORTAL', 'EXAM-CS-01');
  assert.equal(session.warning_count, 0);

  // Warning 1
  const w1 = issueAuthorityWarning(db, session.id, 'Shoulder surfing detected', 'SHOULDER_SURFING_DETECTED');
  assert.equal(w1.warning_count, 1);
  assert.equal(w1.status, 'ACTIVE');

  // Warning 2
  const w2 = issueAuthorityWarning(db, session.id, 'Unauthorized second face in frame', 'SHOULDER_SURFING_DETECTED');
  assert.equal(w2.warning_count, 2);
  assert.equal(w2.status, 'ACTIVE');

  // Warning 3 (Maximum allowed)
  const w3 = issueAuthorityWarning(db, session.id, 'Repeated proctoring violation', 'SHOULDER_SURFING_DETECTED');
  assert.equal(w3.warning_count, 3);
  assert.equal(w3.status, 'FLAGGED_FOR_REVIEW');
  assert.equal(w3.is_locked, true);

  const dashAt3 = getAuthoritySurveillanceDashboard(db);
  const sessAt3 = dashAt3.sessions.find(s => s.id === session.id);
  assert.equal(sessAt3.emergency_locked, 1);

  // Attempting Warning 4 must NOT exceed 3
  const w4 = issueAuthorityWarning(db, session.id, 'Post-lock violation attempt', 'SUSPICIOUS_ACTIVITY');
  assert.equal(w4.warning_count, 3);
});

test('6. Camera and voice evidence persistence and unified session retrieval', async () => {
  const db = await createTestDb();
  const user = {
    id: 'usr-trans-test',
    full_name: 'Prof. Meera Deshmukh',
    email: 'translator@nbte.edu.in',
    role: 'TRANSLATOR',
    org_id: 'ORG-ZEROLEAK',
  };

  const session = startAuthorityEnclaveSession(db, user, 'TRANSLATOR_PORTAL', 'EXAM-CS-01');

  // Save Camera Evidence
  const cam = saveCameraEvidence(db, {
    session_id: session.id,
    exam_id: 'EXAM-CS-01',
    user_id: user.id,
    user_name: user.full_name,
    user_role: user.role,
    image_data_url: 'data:image/png;base64,mocksnap',
    reason: 'SHOULDER_SURFING_DETECTED',
    presence_status: 'SUSPICIOUS',
    warning_number: 1,
  });

  assert.ok(cam.id.startsWith('CAM-EV-'));
  assert.equal(cam.recipient, 'CBI Chief Vigilance & Security Auditor');
  assert.equal(cam.review_status, 'PENDING_REVIEW');

  // Save Voice Evidence
  const voice = saveVoiceEvidence(db, {
    session_id: session.id,
    exam_id: 'EXAM-CS-01',
    user_id: user.id,
    user_name: user.full_name,
    user_role: user.role,
    audio_data_url: 'data:audio/webm;base64,mockaudio',
    duration_seconds: 4.8,
    warning_number: 1,
  });

  assert.ok(voice.id.startsWith('VOICE-EV-'));
  assert.equal(voice.recipient, 'CBI Chief Vigilance & Security Auditor');
  assert.equal(voice.review_status, 'PENDING_REVIEW');

  // Unified Evidence
  const unified = getUnifiedSessionEvidence(db, session.id);
  assert.ok(unified.length >= 2);
  const types = unified.map(u => u.type);
  assert.ok(types.includes('CAMERA_SNAPSHOT'));
  assert.ok(types.includes('VOICE_EVIDENCE'));

  // Dashboard evidence aggregation
  const dash = getAuthoritySurveillanceDashboard(db, 'ORG-ZEROLEAK');
  const sess = dash.sessions.find(s => s.id === session.id);
  assert.ok(sess.camera_evidence_count >= 1);
  assert.equal(sess.voice_evidence_count, 1);
  assert.equal(sess.has_camera_evidence, true);
  assert.equal(sess.has_voice_evidence, true);
});

test('7. Auditor review action handles MARK_REVIEWED, ESCALATE, and CLOSE_CASE', async () => {
  const db = await createTestDb();
  const user = {
    id: 'usr-trans-test',
    full_name: 'Prof. Meera Deshmukh',
    email: 'translator@nbte.edu.in',
    role: 'TRANSLATOR',
    org_id: 'ORG-ZEROLEAK',
  };

  const session = startAuthorityEnclaveSession(db, user, 'TRANSLATOR_PORTAL', 'EXAM-CS-01');

  // Mark Reviewed
  const revRes = handleAuditorReviewAction(
    db,
    session.id,
    'MARK_REVIEWED',
    'Auditor verified background credentials and biometric photo match',
    'CBI Security Auditor A. Roy'
  );
  assert.equal(revRes.success, true);
  assert.equal(revRes.session?.review_status, 'REVIEWED');

  // Escalate
  const escRes = handleAuditorReviewAction(
    db,
    session.id,
    'ESCALATE',
    'Escalated to Vigilance Committee for unauthorized voice whisper',
    'CBI Security Auditor A. Roy'
  );
  assert.equal(escRes.success, true);
  assert.equal(escRes.session?.review_status, 'ESCALATED');

  // Close Case
  const closeRes = handleAuditorReviewAction(
    db,
    session.id,
    'CLOSE_CASE',
    'Formal investigation concluded, cleared with caution',
    'CBI Security Auditor A. Roy'
  );
  assert.equal(closeRes.success, true);
  assert.equal(closeRes.session?.review_status, 'RESOLVED');
});



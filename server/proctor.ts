import { v4 as uuidv4 } from 'uuid';
import { Database } from 'sql.js';
import { executeQuery, executeRun } from './db.ts';

export interface ProctorSettings {
  id: string;
  org_id?: string;
  tab_switch_points: number;
  fullscreen_exit_points: number;
  face_not_detected_points: number;
  multiple_faces_points: number;
  camera_disabled_points: number;
  mic_disabled_points: number;
  audio_activity_points: number;
  copy_paste_points: number;
  key_shortcut_points: number;
  repeated_activity_points: number;
  max_warnings: number;
}

export const DEFAULT_PROCTOR_SETTINGS: ProctorSettings = {
  id: 'default_settings',
  tab_switch_points: 10,
  fullscreen_exit_points: 10,
  face_not_detected_points: 15,
  multiple_faces_points: 30,
  camera_disabled_points: 30,
  mic_disabled_points: 15,
  audio_activity_points: 5,
  copy_paste_points: 5,
  key_shortcut_points: 5,
  repeated_activity_points: 10,
  max_warnings: 3,
};

export function getProctorSettings(db: Database): ProctorSettings {
  try {
    const rows = executeQuery(db, 'SELECT * FROM proctor_settings LIMIT 1', []);
    if (rows && rows.length > 0) {
      return {
        id: rows[0].id,
        org_id: rows[0].org_id,
        tab_switch_points: Number(rows[0].tab_switch_points) || 10,
        fullscreen_exit_points: Number(rows[0].fullscreen_exit_points) || 10,
        face_not_detected_points: Number(rows[0].face_not_detected_points) || 15,
        multiple_faces_points: Number(rows[0].multiple_faces_points) || 30,
        camera_disabled_points: Number(rows[0].camera_disabled_points) || 30,
        mic_disabled_points: Number(rows[0].mic_disabled_points) || 15,
        audio_activity_points: Number(rows[0].audio_activity_points) || 5,
        copy_paste_points: Number(rows[0].copy_paste_points) || 5,
        key_shortcut_points: Number(rows[0].key_shortcut_points) || 5,
        repeated_activity_points: Number(rows[0].repeated_activity_points) || 10,
        max_warnings: Number(rows[0].max_warnings) || 3,
      };
    }
  } catch (err) {
    console.error('Error fetching proctor settings:', err);
  }
  return DEFAULT_PROCTOR_SETTINGS;
}

export function updateProctorSettings(db: Database, settings: Partial<ProctorSettings>): ProctorSettings {
  const current = getProctorSettings(db);
  const updated: ProctorSettings = {
    ...current,
    ...settings,
    max_warnings: Math.max(1, Number(settings.max_warnings ?? current.max_warnings)),
  };

  executeRun(
    db,
    `UPDATE proctor_settings SET
      tab_switch_points = ?,
      fullscreen_exit_points = ?,
      face_not_detected_points = ?,
      multiple_faces_points = ?,
      camera_disabled_points = ?,
      mic_disabled_points = ?,
      audio_activity_points = ?,
      copy_paste_points = ?,
      key_shortcut_points = ?,
      repeated_activity_points = ?,
      max_warnings = ?,
      updated_at = datetime('now')
    WHERE id = ?`,
    [
      updated.tab_switch_points,
      updated.fullscreen_exit_points,
      updated.face_not_detected_points,
      updated.multiple_faces_points,
      updated.camera_disabled_points,
      updated.mic_disabled_points,
      updated.audio_activity_points,
      updated.copy_paste_points,
      updated.key_shortcut_points,
      updated.repeated_activity_points,
      updated.max_warnings,
      current.id,
    ]
  );

  return updated;
}

export type RiskLevel = 'NORMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export function determineRiskLevel(score: number): RiskLevel {
  if (score >= 81) return 'CRITICAL';
  if (score >= 61) return 'HIGH';
  if (score >= 41) return 'MEDIUM';
  if (score >= 21) return 'LOW';
  return 'NORMAL';
}

export function calculateProctorRisk(db: Database, attemptId: string): { risk_score: number; risk_level: RiskLevel; warning_count: number } {
  const settings = getProctorSettings(db);
  const events = executeQuery(
    db,
    'SELECT event_type, severity, risk_points FROM proctor_events WHERE attempt_id = ? ORDER BY timestamp ASC',
    [attemptId]
  );

  let rawScore = 0;
  let tabSwitchCount = 0;
  let fullscreenExitCount = 0;
  let faceNotDetectedCount = 0;
  let multipleFacesCount = 0;
  let warningCount = 0;

  for (const ev of events) {
    switch (ev.event_type) {
      case 'TAB_SWITCH':
        tabSwitchCount++;
        rawScore += settings.tab_switch_points;
        warningCount++;
        break;
      case 'FULLSCREEN_EXIT':
        fullscreenExitCount++;
        rawScore += settings.fullscreen_exit_points;
        warningCount++;
        break;
      case 'FACE_NOT_DETECTED':
        faceNotDetectedCount++;
        rawScore += settings.face_not_detected_points;
        break;
      case 'MULTIPLE_FACES':
        multipleFacesCount++;
        rawScore += settings.multiple_faces_points;
        warningCount++;
        break;
      case 'CAMERA_DISABLED':
        rawScore += settings.camera_disabled_points;
        warningCount++;
        break;
      case 'MICROPHONE_DISABLED':
        rawScore += settings.mic_disabled_points;
        break;
      case 'AUDIO_ACTIVITY':
        rawScore += settings.audio_activity_points;
        break;
      case 'COPY_ATTEMPT':
      case 'PASTE_ATTEMPT':
      case 'CUT_ATTEMPT':
      case 'CONTEXT_MENU_ATTEMPT':
        rawScore += settings.copy_paste_points;
        break;
      case 'SUSPICIOUS_KEY_ATTEMPT':
        rawScore += settings.key_shortcut_points;
        break;
      case 'WARNING_ISSUED':
        warningCount++;
        break;
      default:
        rawScore += Number(ev.risk_points) || 0;
        break;
    }
  }

  // Bonus penalties for repeated suspicious signals
  if (tabSwitchCount >= 3) rawScore += settings.repeated_activity_points;
  if (fullscreenExitCount >= 3) rawScore += settings.repeated_activity_points;
  if (faceNotDetectedCount >= 4) rawScore += settings.repeated_activity_points;
  if (multipleFacesCount >= 2) rawScore += settings.repeated_activity_points;

  const finalScore = Math.min(100, Math.max(0, rawScore));
  const riskLevel = determineRiskLevel(finalScore);

  // Update exam_attempts record
  const attempt = executeQuery(db, 'SELECT status FROM exam_attempts WHERE id = ?', [attemptId])[0];
  let newStatus = attempt?.status || 'IN_PROGRESS';
  if (newStatus === 'IN_PROGRESS' && finalScore >= 60) {
    newStatus = 'FLAGGED_FOR_REVIEW';
  }

  executeRun(
    db,
    `UPDATE exam_attempts SET
      risk_score = ?,
      risk_level = ?,
      warning_count = ?,
      status = ?,
      updated_at = datetime('now')
    WHERE id = ?`,
    [finalScore, riskLevel, warningCount, newStatus, attemptId]
  );

  return {
    risk_score: finalScore,
    risk_level: riskLevel,
    warning_count: warningCount,
  };
}

export interface RecordEventParams {
  attempt_id: string;
  exam_id: string;
  student_id: string;
  event_type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  metadata?: Record<string, any>;
  timestamp?: string;
  hardware_status?: {
    camera?: 'ACTIVE' | 'DISABLED' | 'ERROR';
    microphone?: 'ACTIVE' | 'DISABLED' | 'ERROR';
    fullscreen?: 'ACTIVE' | 'EXITED';
    face?: 'DETECTED' | 'NOT_DETECTED' | 'MULTIPLE';
    face_count?: number;
  };
}

export function recordProctorEvent(db: Database, params: RecordEventParams) {
  const eventId = `PEV-${uuidv4().substring(0, 8).toUpperCase()}`;
  const isoNow = params.timestamp || new Date().toISOString();
  const settings = getProctorSettings(db);

  let riskPoints = 0;
  switch (params.event_type) {
    case 'TAB_SWITCH': riskPoints = settings.tab_switch_points; break;
    case 'FULLSCREEN_EXIT': riskPoints = settings.fullscreen_exit_points; break;
    case 'FACE_NOT_DETECTED': riskPoints = settings.face_not_detected_points; break;
    case 'MULTIPLE_FACES': riskPoints = settings.multiple_faces_points; break;
    case 'CAMERA_DISABLED': riskPoints = settings.camera_disabled_points; break;
    case 'MICROPHONE_DISABLED': riskPoints = settings.mic_disabled_points; break;
    case 'AUDIO_ACTIVITY': riskPoints = settings.audio_activity_points; break;
    case 'COPY_ATTEMPT':
    case 'PASTE_ATTEMPT':
    case 'CUT_ATTEMPT':
    case 'CONTEXT_MENU_ATTEMPT': riskPoints = settings.copy_paste_points; break;
    case 'SUSPICIOUS_KEY_ATTEMPT': riskPoints = settings.key_shortcut_points; break;
    default: riskPoints = 0; break;
  }

  executeRun(
    db,
    `INSERT INTO proctor_events (
      id, attempt_id, exam_id, student_id, event_type, severity, risk_points, timestamp, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      eventId,
      params.attempt_id,
      params.exam_id,
      params.student_id,
      params.event_type,
      params.severity,
      riskPoints,
      isoNow,
      params.metadata ? JSON.stringify(params.metadata) : null,
      isoNow,
    ]
  );

  // Update session telemetry if provided
  if (params.hardware_status) {
    const hw = params.hardware_status;
    executeRun(
      db,
      `UPDATE proctor_sessions SET
        camera_status = COALESCE(?, camera_status),
        microphone_status = COALESCE(?, microphone_status),
        fullscreen_status = COALESCE(?, fullscreen_status),
        face_status = COALESCE(?, face_status),
        faces_detected_count = COALESCE(?, faces_detected_count),
        last_heartbeat_at = ?,
        updated_at = ?
      WHERE attempt_id = ?`,
      [
        hw.camera || null,
        hw.microphone || null,
        hw.fullscreen || null,
        hw.face || null,
        hw.face_count !== undefined ? hw.face_count : null,
        isoNow,
        isoNow,
        params.attempt_id,
      ]
    );
  }

  // Recalculate score server-side
  const riskResult = calculateProctorRisk(db, params.attempt_id);

  return {
    eventId,
    ...riskResult,
    max_warnings: settings.max_warnings,
    warnings_left: Math.max(0, settings.max_warnings - riskResult.warning_count),
  };
}

export function updateSessionHeartbeat(
  db: Database,
  attemptId: string,
  data: {
    camera_status?: string;
    microphone_status?: string;
    fullscreen_status?: string;
    face_status?: string;
    faces_detected_count?: number;
  }
) {
  const now = new Date().toISOString();
  executeRun(
    db,
    `UPDATE proctor_sessions SET
      camera_status = COALESCE(?, camera_status),
      microphone_status = COALESCE(?, microphone_status),
      fullscreen_status = COALESCE(?, fullscreen_status),
      face_status = COALESCE(?, face_status),
      faces_detected_count = COALESCE(?, faces_detected_count),
      last_heartbeat_at = ?,
      updated_at = ?
    WHERE attempt_id = ?`,
    [
      data.camera_status || null,
      data.microphone_status || null,
      data.fullscreen_status || null,
      data.face_status || null,
      data.faces_detected_count !== undefined ? data.faces_detected_count : null,
      now,
      now,
      attemptId,
    ]
  );
}

// =======================================================
// AUTHORITY PROCTOR ENCLAVE & LEAK AVOIDANCE ENGINE
// =======================================================

export interface AuthorityProctorSession {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: string;
  org_id: string;
  workspace_type: string;
  exam_id?: string;
  status: 'ACTIVE' | 'LOCKED' | 'TERMINATED' | 'COMPLETED';
  camera_status: 'ACTIVE' | 'DISABLED' | 'ERROR';
  microphone_status: 'ACTIVE' | 'DISABLED' | 'MUTED';
  fullscreen_status: 'ACTIVE' | 'EXITED';
  face_status: 'VERIFIED' | 'ABSENT' | 'SHOULDER_SURFING_DETECTED';
  faces_detected_count: number;
  audio_level_db: number;
  leak_risk_score: number;
  leak_risk_level: RiskLevel;
  verification_snapshot?: string;
  emergency_locked: number;
  emergency_lock_reason?: string;
  locked_by?: string;
  last_heartbeat_at: string;
  created_at: string;
  updated_at: string;
}

export function startAuthorityEnclaveSession(
  db: Database,
  user: { id: string; full_name: string; email: string; role: string; org_id: string },
  workspaceType: string,
  examId?: string,
  verificationSnapshot?: string
): AuthorityProctorSession {
  const sessionId = `AUTH-SESS-${uuidv4().substring(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  executeRun(
    db,
    `INSERT INTO authority_proctor_sessions (
      id, user_id, user_name, user_email, user_role, org_id, workspace_type,
      exam_id, status, camera_status, microphone_status, fullscreen_status,
      face_status, faces_detected_count, audio_level_db, leak_risk_score,
      leak_risk_level, verification_snapshot, emergency_locked, last_heartbeat_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'VERIFIED', 1, -40.0, 0, 'NORMAL', ?, 0, ?, ?, ?)`,
    [
      sessionId,
      user.id,
      user.full_name,
      user.email,
      user.role,
      user.org_id,
      workspaceType,
      examId || null,
      verificationSnapshot || null,
      now,
      now,
      now,
    ]
  );

  // Log session startup event
  recordAuthorityLeakEvent(db, {
    session_id: sessionId,
    user_id: user.id,
    user_role: user.role,
    exam_id: examId,
    event_type: 'ENCLAVE_STARTED',
    severity: 'LOW',
    metadata: {
      workspace: workspaceType,
      user_agent: 'ZeroLeak Secure Enclave Client',
    },
    snapshot_thumbnail: verificationSnapshot || null,
  });

  const rows = executeQuery(db, 'SELECT * FROM authority_proctor_sessions WHERE id = ?', [sessionId]);
  return rows[0] as AuthorityProctorSession;
}

export function calculateAuthorityRisk(db: Database, sessionId: string): { leak_risk_score: number; leak_risk_level: RiskLevel } {
  const events = executeQuery(
    db,
    'SELECT event_type, risk_points FROM proctor_events WHERE session_id = ?',
    [sessionId]
  );

  let rawTotal = 0;
  const countByType: Record<string, number> = {};

  for (const ev of events) {
    rawTotal += (Number(ev.risk_points) || 0);
    countByType[ev.event_type] = (countByType[ev.event_type] || 0) + 1;
  }

  // Escalation penalty if repeated unauthorized actions
  for (const [type, count] of Object.entries(countByType)) {
    if (count > 1 && (type === 'SHOULDER_SURFING_DETECTED' || type === 'UNAUTHORIZED_WINDOW_SWITCH' || type === 'CLIPBOARD_EXTRACTION_BLOCKED')) {
      rawTotal += (count - 1) * 10;
    }
  }

  const leak_risk_score = Math.min(100, Math.max(0, rawTotal));
  const leak_risk_level = determineRiskLevel(leak_risk_score);

  executeRun(
    db,
    `UPDATE authority_proctor_sessions SET
      leak_risk_score = ?,
      leak_risk_level = ?,
      updated_at = ?
    WHERE id = ?`,
    [leak_risk_score, leak_risk_level, new Date().toISOString(), sessionId]
  );

  return { leak_risk_score, leak_risk_level };
}

export function recordAuthorityLeakEvent(
  db: Database,
  params: {
    session_id: string;
    user_id?: string;
    user_role?: string;
    exam_id?: string;
    event_type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    metadata?: Record<string, any>;
    snapshot_thumbnail?: string | null;
  }
) {
  const eventId = `AUTH-EV-${uuidv4().substring(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  let riskPoints = 0;
  switch (params.event_type) {
    case 'SHOULDER_SURFING_DETECTED': riskPoints = 35; break;
    case 'CAMERA_DISCONNECTED': riskPoints = 30; break;
    case 'SCREENSHOT_ATTEMPT_BLOCKED': riskPoints = 25; break;
    case 'CLIPBOARD_EXTRACTION_BLOCKED': riskPoints = 20; break;
    case 'FACE_ABSENT_MASKED': riskPoints = 15; break;
    case 'UNAUTHORIZED_WINDOW_SWITCH': riskPoints = 15; break;
    case 'FULLSCREEN_EXITED': riskPoints = 10; break;
    case 'SUSPICIOUS_AUDIO_DETECTED': riskPoints = 5; break;
    default: riskPoints = 0; break;
  }

  executeRun(
    db,
    `INSERT INTO proctor_events (
      id, session_id, user_id, user_role, exam_id, event_type, severity, risk_points, timestamp, metadata_json, snapshot_thumbnail, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      eventId,
      params.session_id,
      params.user_id || null,
      params.user_role || null,
      params.exam_id || null,
      params.event_type,
      params.severity,
      riskPoints,
      now,
      params.metadata ? JSON.stringify(params.metadata) : null,
      params.snapshot_thumbnail || null,
      now,
    ]
  );

  const risk = calculateAuthorityRisk(db, params.session_id);

  // If shoulder surfing or face absent, update session face_status immediately
  if (params.event_type === 'SHOULDER_SURFING_DETECTED') {
    executeRun(db, 'UPDATE authority_proctor_sessions SET face_status = "SHOULDER_SURFING_DETECTED", faces_detected_count = 2, updated_at = ? WHERE id = ?', [now, params.session_id]);
  } else if (params.event_type === 'FACE_ABSENT_MASKED') {
    executeRun(db, 'UPDATE authority_proctor_sessions SET face_status = "ABSENT", faces_detected_count = 0, updated_at = ? WHERE id = ?', [now, params.session_id]);
  } else if (params.event_type === 'SCREEN_UNMASKED') {
    executeRun(db, 'UPDATE authority_proctor_sessions SET face_status = "VERIFIED", faces_detected_count = 1, updated_at = ? WHERE id = ?', [now, params.session_id]);
  }

  return { eventId, ...risk };
}

export function updateAuthorityHeartbeat(
  db: Database,
  sessionId: string,
  data: {
    camera_status?: string;
    microphone_status?: string;
    fullscreen_status?: string;
    face_status?: string;
    faces_detected_count?: number;
    audio_level_db?: number;
  }
) {
  const now = new Date().toISOString();
  executeRun(
    db,
    `UPDATE authority_proctor_sessions SET
      camera_status = COALESCE(?, camera_status),
      microphone_status = COALESCE(?, microphone_status),
      fullscreen_status = COALESCE(?, fullscreen_status),
      face_status = COALESCE(?, face_status),
      faces_detected_count = COALESCE(?, faces_detected_count),
      audio_level_db = COALESCE(?, audio_level_db),
      last_heartbeat_at = ?,
      updated_at = ?
    WHERE id = ?`,
    [
      data.camera_status || null,
      data.microphone_status || null,
      data.fullscreen_status || null,
      data.face_status || null,
      data.faces_detected_count !== undefined ? data.faces_detected_count : null,
      data.audio_level_db !== undefined ? data.audio_level_db : null,
      now,
      now,
      sessionId,
    ]
  );
}

export function emergencyLockAuthoritySession(
  db: Database,
  sessionId: string,
  reason: string,
  lockedBy: string
) {
  const now = new Date().toISOString();
  executeRun(
    db,
    `UPDATE authority_proctor_sessions SET
      status = 'LOCKED',
      emergency_locked = 1,
      emergency_lock_reason = ?,
      locked_by = ?,
      updated_at = ?
    WHERE id = ?`,
    [reason, lockedBy, now, sessionId]
  );

  recordAuthorityLeakEvent(db, {
    session_id: sessionId,
    event_type: 'EMERGENCY_LOCKDOWN',
    severity: 'CRITICAL',
    metadata: { reason, locked_by: lockedBy, timestamp: now },
  });

  return { success: true, message: 'Authority session emergency-locked to prevent paper leakage.' };
}

export function endAuthorityEnclaveSession(db: Database, sessionId: string) {
  const now = new Date().toISOString();
  executeRun(
    db,
    `UPDATE authority_proctor_sessions SET
      status = 'COMPLETED',
      updated_at = ?
    WHERE id = ?`,
    [now, sessionId]
  );
  return { success: true };
}

export function getAuthoritySurveillanceDashboard(db: Database, orgId?: string) {
  let sql = `
    SELECT
      s.*,
      COALESCE(e.name, 'Question Bank / System Enclave') as exam_name
    FROM authority_proctor_sessions s
    LEFT JOIN examinations e ON s.exam_id = e.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (orgId && orgId !== 'GLOBAL') {
    sql += ' AND s.org_id = ?';
    params.push(orgId);
  }
  sql += ' ORDER BY s.updated_at DESC';

  const sessions = executeQuery(db, sql, params);

  const totalActive = sessions.filter(s => s.status === 'ACTIVE').length;
  const highRisk = sessions.filter(s => s.leak_risk_level === 'HIGH' || s.leak_risk_level === 'CRITICAL').length;
  const shoulderSurfingAlerts = sessions.filter(s => s.face_status === 'SHOULDER_SURFING_DETECTED').length;
  const lockedDown = sessions.filter(s => s.status === 'LOCKED').length;

  return {
    metrics: {
      total_active_sessions: totalActive,
      high_risk_sessions: highRisk,
      shoulder_surfing_alerts: shoulderSurfingAlerts,
      locked_sessions: lockedDown,
    },
    sessions,
  };
}



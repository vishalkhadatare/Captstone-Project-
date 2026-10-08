import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { executeQuery, executeRun, saveDb } from './db.ts';

export type Database = any;

export type ViewOnceStatus = 'NOT_VIEWED' | 'VIEWING' | 'CONSUMED';
export type ExamCategoryType = 'COMPETITIVE' | 'UNIVERSITY';

export interface ViewOnceSessionRecord {
  id: string;
  paper_id: string;
  exam_id: string;
  exam_type: ExamCategoryType;
  user_id: string;
  user_role: string;
  session_token: string;
  status: ViewOnceStatus;
  started_at: string | null;
  expires_at: string | null;
  consumed_at: string | null;
  consumed_reason: string | null;
  security_events_json: string;
  browser_info_json: string | null;
  created_at: string;
}

export interface ViewOnceStatusResult {
  previewStatus: ViewOnceStatus;
  canView: boolean;
  paperId: string;
  examId: string;
  examType: ExamCategoryType;
  activeSessionToken?: string;
  remainingSeconds?: number;
  consumedAt?: string | null;
  consumedBy?: string | null;
  consumedReason?: string | null;
  startedAt?: string | null;
  expiresAt?: string | null;
}

/**
 * Initialize View-Once Preview ledger table and alter existing paper tables if needed.
 */
export function initViewOnceSchema(db: Database) {
  executeRun(
    db,
    `CREATE TABLE IF NOT EXISTS view_once_preview_sessions (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL,
      exam_id TEXT NOT NULL,
      exam_type TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_role TEXT NOT NULL,
      session_token TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'NOT_VIEWED',
      started_at TEXT,
      expires_at TEXT,
      consumed_at TEXT,
      consumed_reason TEXT,
      security_events_json TEXT DEFAULT '[]',
      browser_info_json TEXT,
      created_at TEXT NOT NULL
    );`
  );

  // Alter competitive_generated_papers if columns are missing
  try {
    executeRun(db, "ALTER TABLE competitive_generated_papers ADD COLUMN preview_status TEXT DEFAULT 'NOT_VIEWED';");
  } catch {}
  try {
    executeRun(db, 'ALTER TABLE competitive_generated_papers ADD COLUMN preview_consumed_at TEXT;');
  } catch {}
  try {
    executeRun(db, 'ALTER TABLE competitive_generated_papers ADD COLUMN preview_consumed_by TEXT;');
  } catch {}
  try {
    executeRun(db, 'ALTER TABLE competitive_generated_papers ADD COLUMN preview_session_token TEXT;');
  } catch {}

  // Alter university_generated_papers if columns are missing
  try {
    executeRun(db, "ALTER TABLE university_generated_papers ADD COLUMN preview_status TEXT DEFAULT 'NOT_VIEWED';");
  } catch {}
  try {
    executeRun(db, 'ALTER TABLE university_generated_papers ADD COLUMN preview_consumed_at TEXT;');
  } catch {}
  try {
    executeRun(db, 'ALTER TABLE university_generated_papers ADD COLUMN preview_consumed_by TEXT;');
  } catch {}
  try {
    executeRun(db, 'ALTER TABLE university_generated_papers ADD COLUMN preview_session_token TEXT;');
  } catch {}
}

/**
 * Evaluates current View-Once preview status for a paper.
 * Automatically marks expired sessions as CONSUMED.
 */
export function getViewOnceStatus(
  db: Database,
  examType: ExamCategoryType,
  paperId: string
): ViewOnceStatusResult {
  initViewOnceSchema(db);

  // 1. Check paper table status directly
  let paperRow: any = null;
  if (examType === 'COMPETITIVE') {
    const rows = executeQuery(
      db,
      'SELECT id, exam_id, preview_status, preview_consumed_at, preview_consumed_by FROM competitive_generated_papers WHERE id = ?',
      [paperId]
    );
    paperRow = rows[0] || null;
  } else {
    const rows = executeQuery(
      db,
      'SELECT id, exam_id, preview_status, preview_consumed_at, preview_consumed_by FROM university_generated_papers WHERE id = ?',
      [paperId]
    );
    paperRow = rows[0] || null;
  }

  const examId = paperRow?.exam_id || '';

  // 2. Query session ledger
  const sessionRows = executeQuery(
    db,
    'SELECT * FROM view_once_preview_sessions WHERE paper_id = ? ORDER BY created_at DESC',
    [paperId]
  );

  // If any session was CONSUMED or paperRow has preview_status === 'CONSUMED'
  const consumedSession = sessionRows.find((s: any) => s.status === 'CONSUMED');
  if (consumedSession || paperRow?.preview_status === 'CONSUMED') {
    return {
      previewStatus: 'CONSUMED',
      canView: false,
      paperId,
      examId,
      examType,
      consumedAt: consumedSession?.consumed_at || paperRow?.preview_consumed_at || null,
      consumedBy: consumedSession?.user_id || paperRow?.preview_consumed_by || null,
      consumedReason: consumedSession?.consumed_reason || 'PREVIEW_CONSUMED',
    };
  }

  // Check active VIEWING session
  const activeSession = sessionRows.find((s: any) => s.status === 'VIEWING');
  if (activeSession) {
    const now = new Date();
    const expiresAt = activeSession.expires_at ? new Date(activeSession.expires_at) : null;

    if (expiresAt && now.getTime() > expiresAt.getTime()) {
      // Session has expired -> Permanently mark as CONSUMED
      const nowIso = now.toISOString();
      executeRun(
        db,
        `UPDATE view_once_preview_sessions 
         SET status = 'CONSUMED', consumed_at = ?, consumed_reason = 'EXPIRED' 
         WHERE id = ?`,
        [nowIso, activeSession.id]
      );

      if (examType === 'COMPETITIVE') {
        executeRun(
          db,
          `UPDATE competitive_generated_papers 
           SET preview_status = 'CONSUMED', preview_consumed_at = ?, preview_consumed_by = ? 
           WHERE id = ?`,
          [nowIso, activeSession.user_id, paperId]
        );
      } else {
        executeRun(
          db,
          `UPDATE university_generated_papers 
           SET preview_status = 'CONSUMED', preview_consumed_at = ?, preview_consumed_by = ? 
           WHERE id = ?`,
          [nowIso, activeSession.user_id, paperId]
        );
      }
      saveDb();

      return {
        previewStatus: 'CONSUMED',
        canView: false,
        paperId,
        examId,
        examType,
        consumedAt: nowIso,
        consumedBy: activeSession.user_id,
        consumedReason: 'EXPIRED',
      };
    }

    const remainingSecs = expiresAt
      ? Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000))
      : 0;

    return {
      previewStatus: 'VIEWING',
      canView: true,
      paperId,
      examId,
      examType,
      activeSessionToken: activeSession.session_token,
      remainingSeconds: remainingSecs,
      startedAt: activeSession.started_at,
      expiresAt: activeSession.expires_at,
    };
  }

  return {
    previewStatus: 'NOT_VIEWED',
    canView: true,
    paperId,
    examId,
    examType,
  };
}

/**
 * Start a one-time viewing session for a generated paper.
 * Rejects if preview has already been consumed or if a simultaneous session is active.
 */
export function startViewOnceSession(
  db: Database,
  params: {
    examType: ExamCategoryType;
    examId: string;
    paperId: string;
    userId: string;
    userRole: string;
    browserInfo?: any;
    ipAddress?: string;
    durationSeconds?: number;
    requestSessionToken?: string;
  }
): {
  success: boolean;
  status: ViewOnceStatus;
  sessionToken?: string;
  startedAt?: string;
  expiresAt?: string;
  durationSeconds?: number;
  error?: string;
  statusCode?: number;
} {
  initViewOnceSchema(db);

  const current = getViewOnceStatus(db, params.examType, params.paperId);

  // 1. Hard stop if already consumed
  if (current.previewStatus === 'CONSUMED') {
    return {
      success: false,
      status: 'CONSUMED',
      error:
        'ACCESS DENIED: This paper preview has already been viewed and consumed for verification. In accordance with ZeroLeak security policy, generated paper previews cannot be reopened.',
      statusCode: 403,
    };
  }

  // 2. Check if a session is currently in progress
  if (current.previewStatus === 'VIEWING') {
    // If the caller provides the exact same sessionToken, allow resuming within its active window
    if (params.requestSessionToken && params.requestSessionToken === current.activeSessionToken) {
      return {
        success: true,
        status: 'VIEWING',
        sessionToken: current.activeSessionToken,
        startedAt: current.startedAt || new Date().toISOString(),
        expiresAt: current.expiresAt || new Date(Date.now() + 900000).toISOString(),
        durationSeconds: current.remainingSeconds || 900,
      };
    }

    // Otherwise, block concurrent access across multiple tabs/devices
    return {
      success: false,
      status: 'VIEWING',
      error:
        'ACCESS DENIED: A View-Once verification session is already active in another browser tab or device. Simultaneous preview sessions are strictly forbidden.',
      statusCode: 409,
    };
  }

  // 3. Initiate a fresh one-time session
  const durationSeconds = params.durationSeconds || 900; // 15 minutes default
  const now = new Date();
  const startedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + durationSeconds * 1000).toISOString();
  const sessionToken = `VOP-${uuidv4().replace(/-/g, '').toUpperCase()}`;
  const sessionId = uuidv4();

  executeRun(
    db,
    `INSERT INTO view_once_preview_sessions (
      id, paper_id, exam_id, exam_type, user_id, user_role, session_token, status,
      started_at, expires_at, security_events_json, browser_info_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'VIEWING', ?, ?, '[]', ?, ?)`,
    [
      sessionId,
      params.paperId,
      params.examId,
      params.examType,
      params.userId,
      params.userRole,
      sessionToken,
      startedAt,
      expiresAt,
      params.browserInfo ? JSON.stringify(params.browserInfo) : null,
      startedAt,
    ]
  );

  if (params.examType === 'COMPETITIVE') {
    executeRun(
      db,
      `UPDATE competitive_generated_papers 
       SET preview_status = 'VIEWING', preview_session_token = ? 
       WHERE id = ?`,
      [sessionToken, params.paperId]
    );
  } else {
    executeRun(
      db,
      `UPDATE university_generated_papers 
       SET preview_status = 'VIEWING', preview_session_token = ? 
       WHERE id = ?`,
      [sessionToken, params.paperId]
    );
  }

  saveDb();

  return {
    success: true,
    status: 'VIEWING',
    sessionToken,
    startedAt,
    expiresAt,
    durationSeconds,
  };
}

/**
 * Permanently consumes a View-Once preview session.
 * Once consumed, no user can reopen the preview.
 */
export function consumeViewOnceSession(
  db: Database,
  params: {
    examType: ExamCategoryType;
    paperId: string;
    sessionToken?: string;
    userId: string;
    userRole?: string;
    reason: 'USER_CLOSED' | 'CONFIRMED_FINALIZE' | 'CANCELLED' | 'EXPIRED' | 'SECURITY_DEFOCUS' | string;
    ipAddress?: string;
  }
): {
  success: boolean;
  status: ViewOnceStatus;
  consumedAt: string;
  reason: string;
} {
  initViewOnceSchema(db);

  const nowIso = new Date().toISOString();

  if (params.sessionToken) {
    executeRun(
      db,
      `UPDATE view_once_preview_sessions 
       SET status = 'CONSUMED', consumed_at = ?, consumed_reason = ? 
       WHERE session_token = ? OR paper_id = ?`,
      [nowIso, params.reason, params.sessionToken, params.paperId]
    );
  } else {
    executeRun(
      db,
      `UPDATE view_once_preview_sessions 
       SET status = 'CONSUMED', consumed_at = ?, consumed_reason = ? 
       WHERE paper_id = ?`,
      [nowIso, params.reason, params.paperId]
    );
  }

  if (params.examType === 'COMPETITIVE') {
    executeRun(
      db,
      `UPDATE competitive_generated_papers 
       SET preview_status = 'CONSUMED', preview_consumed_at = ?, preview_consumed_by = ? 
       WHERE id = ?`,
      [nowIso, params.userId, params.paperId]
    );
  } else {
    executeRun(
      db,
      `UPDATE university_generated_papers 
       SET preview_status = 'CONSUMED', preview_consumed_at = ?, preview_consumed_by = ? 
       WHERE id = ?`,
      [nowIso, params.userId, params.paperId]
    );
  }

  saveDb();

  return {
    success: true,
    status: 'CONSUMED',
    consumedAt: nowIso,
    reason: params.reason,
  };
}

/**
 * Records a client-side security event (e.g. defocus, PrintScreen key, screen capture attempt).
 */
export function recordViewOnceSecurityEvent(
  db: Database,
  params: {
    sessionToken: string;
    paperId: string;
    examId: string;
    examType: ExamCategoryType;
    userId: string;
    userRole: string;
    eventType: string;
    details?: any;
    ipAddress?: string;
  }
): { success: boolean; eventCount: number } {
  initViewOnceSchema(db);

  const rows = executeQuery(
    db,
    'SELECT id, security_events_json FROM view_once_preview_sessions WHERE session_token = ? OR paper_id = ? ORDER BY created_at DESC',
    [params.sessionToken, params.paperId]
  );

  const session = rows[0];
  if (!session) {
    return { success: false, eventCount: 0 };
  }

  let events: any[] = [];
  try {
    events = session.security_events_json ? JSON.parse(session.security_events_json) : [];
  } catch {
    events = [];
  }

  const newEvent = {
    eventType: params.eventType,
    details: params.details || {},
    userId: params.userId,
    userRole: params.userRole,
    ipAddress: params.ipAddress || '127.0.0.1',
    timestamp: new Date().toISOString(),
  };

  events.push(newEvent);

  executeRun(
    db,
    'UPDATE view_once_preview_sessions SET security_events_json = ? WHERE id = ?',
    [JSON.stringify(events), session.id]
  );

  saveDb();

  return { success: true, eventCount: events.length };
}

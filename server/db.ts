import fs from 'fs';
import path from 'path';
import initSqlJs, { type Database } from 'sql.js';

let dbInstance: Database | null = null;
let SQL_MODULE: any = null;
const DB_FILE_PATH = path.join(process.cwd(), 'zeroleak_data.sqlite');

function cleanCorruptedDbFiles() {
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      fs.unlinkSync(DB_FILE_PATH);
    }
  } catch (err) {
    console.error('Failed to unlink DB_FILE_PATH:', err);
  }

  try {
    const dir = process.cwd();
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.startsWith('zeroleak_data.sqlite.') && file.endsWith('.tmp')) {
        try {
          fs.unlinkSync(path.join(dir, file));
        } catch {}
      }
    }
  } catch {}
}

export async function resetDatabase(): Promise<Database> {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {}
    dbInstance = null;
  }

  cleanCorruptedDbFiles();

  if (!SQL_MODULE) {
    SQL_MODULE = await initSqlJs();
  }

  dbInstance = new SQL_MODULE.Database();
  initializeSchema(dbInstance);
  saveDb();
  return dbInstance;
}

export async function getDb(): Promise<Database> {
  if (dbInstance) {
    try {
      // Fast check that the active db instance is responsive and uncorrupted
      dbInstance.exec('SELECT 1;');
      return dbInstance;
    } catch (e) {
      console.warn('Cached DB instance is unhealthy or malformed. Re-initializing clean instance:', e);
      dbInstance = null;
    }
  }

  if (!SQL_MODULE) {
    SQL_MODULE = await initSqlJs();
  }

  let isLoadedSuccessfully = false;

  if (fs.existsSync(DB_FILE_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_FILE_PATH);
      if (fileBuffer && fileBuffer.length > 0) {
        const candidateDb = new SQL_MODULE.Database(fileBuffer);
        // Execute integrity checks to guarantee B-Tree and table headers are uncorrupted
        candidateDb.exec('PRAGMA integrity_check;');
        candidateDb.exec('SELECT count(*) FROM sqlite_master;');
        initializeSchema(candidateDb);
        dbInstance = candidateDb;
        isLoadedSuccessfully = true;
      }
    } catch (e) {
      console.error('Corrupted or malformed SQLite database detected on disk. Resetting to clean database:', e);
      cleanCorruptedDbFiles();
      isLoadedSuccessfully = false;
      dbInstance = null;
    }
  }

  if (!isLoadedSuccessfully || !dbInstance) {
    dbInstance = new SQL_MODULE.Database();
    try {
      initializeSchema(dbInstance);
      saveDb();
    } catch (schemaErr) {
      console.error('Critical schema initialization failure on fresh DB:', schemaErr);
      dbInstance = new SQL_MODULE.Database();
      initializeSchema(dbInstance);
      saveDb();
    }
  }

  return dbInstance;
}

export function saveDb() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    const tempPath = `${DB_FILE_PATH}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`;
    fs.writeFileSync(tempPath, buffer);
    fs.renameSync(tempPath, DB_FILE_PATH);
  } catch (err) {
    console.error('Failed to persist database to disk atomically:', err);
  }
}

function initializeSchema(db: Database) {
  db.run(`
    -- Organizations
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      reg_number TEXT NOT NULL,
      auth_id TEXT NOT NULL,
      official_email TEXT NOT NULL,
      website TEXT NOT NULL,
      address TEXT NOT NULL,
      contact TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      domain_verified INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Organization Verification History
    CREATE TABLE IF NOT EXISTS organization_verifications (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      previous_status TEXT NOT NULL,
      new_status TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      reason TEXT NOT NULL,
      verification_ref TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Organization Documents
    CREATE TABLE IF NOT EXISTS organization_documents (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_data TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      uploaded_at TEXT NOT NULL,
      verified_at TEXT,
      verified_by TEXT
    );

    -- Authorized Representatives
    CREATE TABLE IF NOT EXISTS authorized_representatives (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      user_id TEXT,
      name TEXT NOT NULL,
      designation TEXT NOT NULL,
      email TEXT NOT NULL,
      contact TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL
    );

    -- Authorized Users (Institutional Role Access Control)
    CREATE TABLE IF NOT EXISTS authorized_users (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      official_email TEXT NOT NULL,
      contact_number TEXT NOT NULL,
      designation TEXT NOT NULL,
      assigned_role TEXT NOT NULL,
      authorized_by TEXT NOT NULL,
      authorization_status TEXT NOT NULL DEFAULT 'AUTHORIZED',
      created_at TEXT NOT NULL
    );

    -- Users
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL, -- 'ORG_OWNER', 'EXAM_MANAGER', 'SME', 'CENTRE_OPERATOR', 'AUDITOR'
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      authorization_status TEXT NOT NULL DEFAULT 'AUTHORIZED',
      account_type TEXT NOT NULL DEFAULT 'STANDARD',
      environment TEXT NOT NULL DEFAULT 'production',
      authorized_by TEXT,
      authorized_at TEXT,
      centre_id TEXT,
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );

    -- Trusted Devices
    CREATE TABLE IF NOT EXISTS trusted_devices (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      device_fingerprint TEXT NOT NULL,
      device_name TEXT NOT NULL,
      browser_os TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'TRUSTED', -- 'TRUSTED', 'PENDING_APPROVAL', 'REVOKED'
      registered_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    -- Device Events
    CREATE TABLE IF NOT EXISTS device_events (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      timestamp TEXT NOT NULL
    );

    -- Examinations
    CREATE TABLE IF NOT EXISTS examinations (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      category TEXT NOT NULL, -- 'NEET', 'JEE', 'Competitive Exam', 'TCET / CET-type Exam', 'University Exam', 'Custom Exam'
      exam_type TEXT NOT NULL, -- 'MCQ', 'THEORY'
      exam_date TEXT NOT NULL,
      exam_time TEXT NOT NULL,
      unlock_time TEXT NOT NULL,
      total_marks INTEGER NOT NULL DEFAULT 100,
      total_questions INTEGER NOT NULL DEFAULT 0,
      duration_minutes INTEGER NOT NULL DEFAULT 180,
      status TEXT NOT NULL DEFAULT 'CONFIGURING', -- 'CONFIGURING', 'VERIFYING_POOL', 'READY_FOR_GENERATION', 'GENERATED_ENCRYPTED', 'RELEASED', 'COMPROMISED', 'REGENERATED'
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Examination Configurations (Blueprints & Theory Patterns)
    CREATE TABLE IF NOT EXISTS examination_configurations (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL UNIQUE,
      blueprint_json TEXT,
      theory_pattern_json TEXT,
      pattern_confirmed INTEGER DEFAULT 0,
      reference_template_text TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Examination Centres
    CREATE TABLE IF NOT EXISTS examination_centres (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      centre_code TEXT NOT NULL,
      centre_name TEXT NOT NULL,
      city TEXT NOT NULL,
      address TEXT NOT NULL,
      operator_user_id TEXT,
      max_copies INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL
    );

    -- Questions
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      difficulty TEXT NOT NULL, -- 'EASY', 'MEDIUM', 'HARD'
      marks INTEGER NOT NULL DEFAULT 4,
      negative_marks REAL NOT NULL DEFAULT 1.0,
      correct_answer TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'English',
      syllabus TEXT NOT NULL,
      question_type TEXT NOT NULL, -- 'MCQ', 'THEORY'
      content_text TEXT NOT NULL,
      options_json TEXT, -- JSON array of options for MCQ
      status TEXT NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'UNDER_VERIFICATION', 'VERIFIED', 'ELIGIBLE_FOR_PAPER', 'QUARANTINED', 'COMPROMISED', 'CLEARED', 'RETIRED'
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Question Verifications
    CREATE TABLE IF NOT EXISTS question_verifications (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL,
      verifier_user_id TEXT NOT NULL,
      status TEXT NOT NULL, -- 'VERIFIED', 'REJECTED'
      feedback TEXT,
      syllabus_accurate INTEGER DEFAULT 1,
      answer_verified INTEGER DEFAULT 1,
      verified_at TEXT NOT NULL
    );

    -- Question Assignments to SMEs & Translators
    CREATE TABLE IF NOT EXISTS question_assignments (
      id TEXT PRIMARY KEY,
      org_id TEXT,
      question_id TEXT NOT NULL,
      assigned_sme_user_id TEXT NOT NULL,
      assigned_by_user_id TEXT,
      assignment_type TEXT NOT NULL DEFAULT 'SME_REVIEW', -- 'SME_REVIEW', 'LINGUISTIC_TRANSLATION'
      target_language TEXT, -- e.g. 'Hindi', 'Marathi', etc.
      status TEXT NOT NULL DEFAULT 'ASSIGNED', -- 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'
      notes TEXT,
      assigned_at TEXT NOT NULL,
      completed_at TEXT
    );

    -- Question Translations (Linguistic Translation by TRANSLATOR role)
    CREATE TABLE IF NOT EXISTS question_translations (
      id TEXT PRIMARY KEY,
      org_id TEXT,
      question_id TEXT NOT NULL,
      assignment_id TEXT,
      source_language TEXT NOT NULL DEFAULT 'English',
      language TEXT NOT NULL, -- 'Hindi', 'Marathi', 'Gujarati', 'Tamil', 'Telugu', 'Bengali', 'Kannada', 'Urdu', etc.
      translated_content TEXT NOT NULL,
      translated_options_json TEXT,
      translated_by_user_id TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'
      translator_notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Question Quarantine & Incidents
    CREATE TABLE IF NOT EXISTS question_quarantine (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      reported_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'QUARANTINED', -- 'QUARANTINED', 'CLEARED', 'COMPROMISED'
      quarantined_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by TEXT,
      notes TEXT
    );

    -- Paper Versions
    CREATE TABLE IF NOT EXISTS paper_versions (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      version_code TEXT NOT NULL, -- e.g. 'EXAM-2026-CS-V001'
      status TEXT NOT NULL, -- 'GENERATED', 'VALIDATED', 'ENCRYPTED', 'RELEASED', 'INVALIDATED', 'COMPROMISED'
      is_current INTEGER NOT NULL DEFAULT 1,
      generated_by TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      invalidated_at TEXT,
      invalidation_reason TEXT
    );

    -- Paper Questions Mapping
    CREATE TABLE IF NOT EXISTS paper_questions (
      id TEXT PRIMARY KEY,
      paper_version_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      section_name TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      marks INTEGER NOT NULL
    );

    -- Paper Validation Results
    CREATE TABLE IF NOT EXISTS paper_validation_results (
      id TEXT PRIMARY KEY,
      paper_version_id TEXT NOT NULL,
      is_valid INTEGER NOT NULL,
      validation_errors_json TEXT,
      validated_at TEXT NOT NULL
    );

    -- Encrypted Papers & Crypto Metadata
    CREATE TABLE IF NOT EXISTS encrypted_papers (
      id TEXT PRIMARY KEY,
      paper_version_id TEXT NOT NULL UNIQUE,
      exam_id TEXT NOT NULL,
      aes_cipher_text TEXT NOT NULL,
      iv_hex TEXT NOT NULL,
      auth_tag_hex TEXT NOT NULL,
      encrypted_aes_key_rsa TEXT NOT NULL,
      key_fingerprint TEXT NOT NULL,
      checksum_sha256 TEXT NOT NULL,
      encrypted_at TEXT NOT NULL
    );

    -- Key Shares (Shamir Secret Sharing Quorum Metadata)
    CREATE TABLE IF NOT EXISTS key_shares (
      id TEXT PRIMARY KEY,
      paper_version_id TEXT NOT NULL,
      share_index INTEGER NOT NULL,
      threshold INTEGER NOT NULL,
      total_shares INTEGER NOT NULL,
      share_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Paper Release Events
    CREATE TABLE IF NOT EXISTS paper_release_events (
      id TEXT PRIMARY KEY,
      paper_version_id TEXT NOT NULL,
      exam_id TEXT NOT NULL,
      centre_id TEXT NOT NULL,
      operator_user_id TEXT NOT NULL,
      released_at TEXT NOT NULL,
      ip_address TEXT
    );

    -- Print Copies (Unique Tracked Copies)
    CREATE TABLE IF NOT EXISTS print_copies (
      id TEXT PRIMARY KEY,
      copy_id TEXT NOT NULL UNIQUE, -- e.g. 'COPY-000001'
      exam_id TEXT NOT NULL,
      paper_version_id TEXT NOT NULL,
      centre_id TEXT NOT NULL,
      operator_user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      printed_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PRINTED',
      tx_hash TEXT NOT NULL
    );

    -- Audit Events (Immutable Security Log)
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      user_id TEXT,
      user_email TEXT,
      role TEXT,
      org_id TEXT,
      exam_id TEXT,
      device_id TEXT,
      ip_address TEXT,
      status TEXT NOT NULL DEFAULT 'SUCCESS',
      tx_ref TEXT NOT NULL,
      details_json TEXT,
      created_at TEXT NOT NULL
    );

    -- Security & Threat Events (Anomaly / Isolation Forest Detection)
    CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL, -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
      risk_score REAL NOT NULL,
      user_id TEXT,
      org_id TEXT,
      ip_address TEXT,
      details_json TEXT,
      resolved INTEGER DEFAULT 0,
      timestamp TEXT NOT NULL
    );

    -- Regeneration Events
    CREATE TABLE IF NOT EXISTS regeneration_events (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      old_paper_version_id TEXT NOT NULL,
      new_paper_version_id TEXT NOT NULL,
      triggered_by TEXT NOT NULL,
      reason TEXT NOT NULL,
      quarantined_questions_count INTEGER NOT NULL DEFAULT 0,
      timestamp TEXT NOT NULL
    );

    -- System Notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      role TEXT,
      org_id TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      category TEXT NOT NULL, -- 'SECURITY', 'VERIFICATION', 'EXAMINATION', 'PAPER_RELEASE'
      is_read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  // Safe incremental column additions for backwards compatibility
  const safeAddColumn = (table: string, columnDef: string) => {
    try {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
    } catch {
      // Column already exists, ignore
    }
  };

  safeAddColumn('question_assignments', 'org_id TEXT');
  safeAddColumn('question_assignments', 'assigned_by_user_id TEXT');
  safeAddColumn('question_assignments', 'assignment_type TEXT DEFAULT "SME_REVIEW"');
  safeAddColumn('question_assignments', 'target_language TEXT');
  safeAddColumn('question_assignments', 'notes TEXT');
  safeAddColumn('question_assignments', 'completed_at TEXT');
  safeAddColumn('question_translations', 'org_id TEXT');
  safeAddColumn('question_translations', 'assignment_id TEXT');
  safeAddColumn('question_translations', 'source_language TEXT DEFAULT "English"');

  // Two-stage registration: Stage-1 verification-engine result columns
  safeAddColumn('organizations', 'state TEXT');
  safeAddColumn('organizations', 'verification_method TEXT');
  safeAddColumn('organizations', 'verification_source TEXT');
  safeAddColumn('organizations', 'verification_message TEXT');
  safeAddColumn('organizations', 'verified_at TEXT');
  // Stage-1 per-document evidence (SHA-256 hash + extraction/match outcome)
  safeAddColumn('organization_documents', 'doc_hash TEXT');
  safeAddColumn('organization_documents', 'extraction_status TEXT');
  safeAddColumn('organization_documents', 'match_status TEXT');
  // Stage-2 device binding: WebCrypto public key + challenge-response nonce
  safeAddColumn('trusted_devices', 'public_key TEXT');
  safeAddColumn('trusted_devices', 'challenge_nonce TEXT');
  safeAddColumn('trusted_devices', 'challenge_expires_at TEXT');
}

// Generic SQL helper functions for clean execution
export function executeQuery(db: Database, sql: string, params: any[] = []): any[] {
  let stmt: any = null;
  try {
    stmt = db.prepare(sql);
    stmt.bind(params);
    const results: any[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    return results;
  } finally {
    if (stmt) {
      try {
        stmt.free();
      } catch {}
    }
  }
}

export function executeRun(db: Database, sql: string, params: any[] = []): void {
  db.run(sql, params);
  saveDb();
}

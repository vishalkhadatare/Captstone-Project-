import fs from 'fs';
import path from 'path';
import initSqlJs, { type Database } from 'sql.js';
import { Pool } from 'pg';

let dbInstance: Database | null = null;
let SQL_MODULE: any = null;
const DB_FILE_PATH = path.join(process.cwd(), 'zeroleak_data.sqlite');

let pgPool: Pool | null = null;
let pgInitialized = false;

export function getPostgresPool(): Pool | null {
  if (!pgPool) {
    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT || '5432', 10);
    const database = process.env.DB_NAME || 'zero_leak';
    const user = process.env.DB_USER || 'postgres';
    const password = process.env.DB_PASSWORD || 'Vishal123';

    try {
      pgPool = new Pool({
        host,
        port,
        database,
        user,
        password,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        max: 20,
      });

      pgPool.on('error', (err) => {
        console.warn('PostgreSQL idle client warning:', err.message);
      });
    } catch (e) {
      console.error('Failed to initialize PostgreSQL pool:', e);
      pgPool = null;
    }
  }
  return pgPool;
}


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

export async function initPostgres(): Promise<boolean> {
  if (pgInitialized) return true;
  const pool = getPostgresPool();
  if (!pool) return false;

  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1;');
      console.log('✓ PostgreSQL connected to', process.env.DB_NAME || 'zero_leak');

      const schemaPath = path.join(process.cwd(), 'database', 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schemaSql);
        console.log('✓ PostgreSQL schema verified/applied (38 tables)');
      }
    } finally {
      client.release();
    }
    pgInitialized = true;
    return true;
  } catch (err: any) {
    console.warn('PostgreSQL connection notice (operating with local SQLite engine):', err.message);
    return false;
  }
}

export async function hydrateFromPostgres(db: Database): Promise<void> {
  const pool = getPostgresPool();
  if (!pool || !pgInitialized) return;

  const coreTables = [
    'organizations',
    'users',
    'authorized_users',
    'trusted_devices',
    'organization_documents',
    'organization_verifications',
    'authorized_representatives',
    'aicte_universities',
    'authoritative_institutions',
    'examinations',
    'examination_configurations',
    'examination_centres',
    'questions',
    'question_papers',
    'question_verifications',
    'question_assignments',
    'question_translations',
    'question_quarantine',
    'paper_versions',
    'paper_questions',
    'paper_validation_results',
    'encrypted_papers',
    'key_shares',
    'paper_release_events',
    'print_copies',
    'audit_events',
    'security_events',
    'notifications',
    'exam_attempts',
    'proctor_sessions',
    'authority_proctor_sessions',
    'proctor_events',
    'proctor_settings',
    'system_settings',
    'paper_blueprints',
    'generated_papers',
    'generated_paper_questions',
    'candidate_paper_assignments',
  ];

  let totalRowsLoaded = 0;
  for (const table of coreTables) {
    try {
      const res = await pool.query(`SELECT * FROM ${table}`);
      if (res.rows.length > 0) {
        totalRowsLoaded += res.rows.length;
        for (const row of res.rows) {
          const keys = Object.keys(row);
          const values = Object.values(row).map((v) => {
            if (v === null || v === undefined) return null;
            if (v instanceof Date) return v.toISOString();
            if (typeof v === 'object') return JSON.stringify(v);
            if (typeof v === 'boolean') return v ? 1 : 0;
            return v;
          });
          const placeholders = keys.map(() => '?').join(', ');
          const sql = `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
          try {
            db.run(sql, values as any[]);
          } catch {}
        }
      }
    } catch {}
  }
  if (totalRowsLoaded > 0) {
    console.log(`✓ In-memory database hydrated with ${totalRowsLoaded} records from PostgreSQL`);
  }
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
        candidateDb.exec('PRAGMA integrity_check;');
        candidateDb.exec('SELECT count(*) FROM sqlite_master;');
        initializeSchema(candidateDb);
        dbInstance = candidateDb;
        isLoadedSuccessfully = true;
      }
    } catch (e) {
      console.error('Corrupted or malformed SQLite database detected on disk. Resetting:', e);
      cleanCorruptedDbFiles();
      isLoadedSuccessfully = false;
      dbInstance = null;
    }
  }

  if (!isLoadedSuccessfully || !dbInstance) {
    dbInstance = new SQL_MODULE.Database();
    initializeSchema(dbInstance);
  }

  // Connect to PostgreSQL and hydrate SQLite in-memory with live database data
  try {
    const pgReady = await initPostgres();
    if (pgReady) {
      await hydrateFromPostgres(dbInstance);
    }
  } catch (pgSyncErr) {
    console.warn('PostgreSQL hydration notice:', pgSyncErr);
  }

  saveDb();
  return dbInstance;
}


export function saveDb() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    const tempPath = `${DB_FILE_PATH}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`;
    fs.writeFileSync(tempPath, buffer);
    try {
      fs.renameSync(tempPath, DB_FILE_PATH);
    } catch {
      fs.copyFileSync(tempPath, DB_FILE_PATH);
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    }
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
      verification_status TEXT DEFAULT 'PENDING_VERIFICATION',
      verification_method TEXT,
      verification_source TEXT,
      verification_date TEXT,
      document_verification_status TEXT DEFAULT 'PENDING',
      verification_message TEXT,
      domain_verified INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- AICTE Recognized Premier Universities & Institutions
    CREATE TABLE IF NOT EXISTS aicte_universities (
      id TEXT PRIMARY KEY,
      aicte_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      short_code TEXT NOT NULL,
      nirf_rank INTEGER,
      type TEXT NOT NULL,
      state TEXT NOT NULL,
      city TEXT NOT NULL,
      official_email TEXT NOT NULL,
      website TEXT NOT NULL,
      contact_number TEXT NOT NULL,
      headquarters_address TEXT NOT NULL,
      auth_id TEXT NOT NULL,
      created_at TEXT NOT NULL
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

    -- Device Bindings (cryptographic device identity; private keys are never stored)
    CREATE TABLE IF NOT EXISTS trusted_devices (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      device_uuid TEXT UNIQUE,
      device_fingerprint TEXT NOT NULL,
      public_key TEXT,
      device_name TEXT NOT NULL,
      device_model TEXT,
      operating_system TEXT,
      os_version TEXT,
      app_version TEXT,
      browser_os TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      metadata_json TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'DISABLED', 'REVOKED'
      attestation_status TEXT DEFAULT 'UNAVAILABLE',
      encryption_algorithm TEXT DEFAULT 'ECDSA-P256',
      created_at TEXT,
      updated_at TEXT,
      approved_at TEXT,
      approved_by TEXT,
      last_authenticated_at TEXT,
      registered_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      disabled_at TEXT,
      revoked_at TEXT,
      replacement_of_device_id TEXT
    );

    CREATE TABLE IF NOT EXISTS device_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      org_id TEXT NOT NULL,
      device_id TEXT,
      device_uuid TEXT,
      authentication_attempt_id TEXT NOT NULL,
      purpose TEXT NOT NULL,
      challenge TEXT NOT NULL,
      used_at TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_replacement_requests (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      existing_device_id TEXT NOT NULL,
      requested_device_uuid TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      requested_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by TEXT,
      details_json TEXT
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exam_simulation_sessions (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      session_token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      paper_snapshot_json TEXT,
      events_json TEXT,
      duration_seconds INTEGER DEFAULT 900,
      started_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      completed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices(user_id);
    CREATE INDEX IF NOT EXISTS idx_trusted_devices_org ON trusted_devices(org_id);
    CREATE INDEX IF NOT EXISTS idx_trusted_devices_uuid ON trusted_devices(device_uuid);
    CREATE INDEX IF NOT EXISTS idx_trusted_devices_status ON trusted_devices(status);
    CREATE INDEX IF NOT EXISTS idx_device_challenges_user ON device_challenges(user_id, purpose);
    CREATE INDEX IF NOT EXISTS idx_device_replacement_user ON device_replacement_requests(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_exam_simulations_exam ON exam_simulation_sessions(exam_id);
    CREATE INDEX IF NOT EXISTS idx_exam_simulations_token ON exam_simulation_sessions(session_token);

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
      org_id TEXT,
      centre_code TEXT NOT NULL,
      centre_name TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT,
      address TEXT NOT NULL,
      contact_person TEXT,
      contact_number TEXT,
      email TEXT,
      operator_user_id TEXT,
      max_copies INTEGER NOT NULL DEFAULT 100,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    -- Questions
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      question_paper_id TEXT,
      source_file TEXT,
      source_page INTEGER,
      question_number TEXT,
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
      diagram_url TEXT, -- Base64 Data URL or Cloudinary URL of associated diagram/circuit/figure
      status TEXT NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'UNDER_VERIFICATION', 'VERIFIED', 'ELIGIBLE_FOR_PAPER', 'QUARANTINED', 'COMPROMISED', 'CLEARED', 'RETIRED'
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS question_papers (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      subject TEXT NOT NULL,
      examination_category TEXT NOT NULL,
      processing_status TEXT NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 0,
      question_count INTEGER NOT NULL DEFAULT 0,
      auto_extracted_count INTEGER NOT NULL DEFAULT 0,
      needs_review_count INTEGER NOT NULL DEFAULT 0,
      manually_corrected_count INTEGER NOT NULL DEFAULT 0,
      pages_dir TEXT,
      extraction_error TEXT,
      cloudinary_url TEXT,
      cloudinary_public_id TEXT,
      uploaded_at TEXT NOT NULL
    );

    -- Question Paper High-Res Pages (Preserved at 300 DPI)
    CREATE TABLE IF NOT EXISTS question_paper_pages (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      dpi INTEGER NOT NULL DEFAULT 300,
      disk_path TEXT,
      created_at TEXT NOT NULL
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

    -- Exam Attempts (Candidate proctored attempts)
    CREATE TABLE IF NOT EXISTS exam_attempts (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      student_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'IN_PROGRESS', -- 'IN_PROGRESS', 'SUBMITTED', 'FLAGGED_FOR_REVIEW', 'VERIFIED_VALID'
      started_at TEXT NOT NULL,
      submitted_at TEXT,
      total_questions INTEGER DEFAULT 0,
      answered_questions INTEGER DEFAULT 0,
      score REAL DEFAULT 0,
      risk_score INTEGER DEFAULT 0,
      risk_level TEXT DEFAULT 'NORMAL', -- 'NORMAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
      warning_count INTEGER DEFAULT 0,
      verification_snapshot TEXT,
      proctor_decision TEXT DEFAULT 'PENDING', -- 'PENDING', 'VERIFIED_VALID', 'VIOLATION_CONFIRMED'
      proctor_remarks TEXT,
      answers_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Proctor Sessions (Live telemetry & hardware status)
    CREATE TABLE IF NOT EXISTS proctor_sessions (
      id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL UNIQUE,
      exam_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      camera_status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'DISABLED', 'ERROR'
      microphone_status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'DISABLED', 'ERROR'
      fullscreen_status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'EXITED'
      face_status TEXT DEFAULT 'DETECTED', -- 'DETECTED', 'NOT_DETECTED', 'MULTIPLE'
      faces_detected_count INTEGER DEFAULT 1,
      last_heartbeat_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Authority Proctor Sessions (Work on Camera for leak prevention)
    CREATE TABLE IF NOT EXISTS authority_proctor_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_email TEXT NOT NULL,
      user_role TEXT NOT NULL,
      org_id TEXT NOT NULL,
      workspace_type TEXT NOT NULL, -- 'SME_QUESTION_VETTING', 'TRANSLATOR_PORTAL', 'EXAM_PAPER_COMPILATION', 'DECRYPTED_PAPER_VIEWER', 'MASTER_KEY_RELEASE'
      exam_id TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'LOCKED', 'TERMINATED', 'COMPLETED'
      camera_status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'DISABLED', 'ERROR'
      microphone_status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'DISABLED', 'MUTED'
      fullscreen_status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'EXITED'
      face_status TEXT DEFAULT 'VERIFIED', -- 'VERIFIED', 'ABSENT', 'SHOULDER_SURFING_DETECTED'
      faces_detected_count INTEGER DEFAULT 1,
      audio_level_db REAL DEFAULT -40.0,
      leak_risk_score INTEGER DEFAULT 0,
      leak_risk_level TEXT DEFAULT 'NORMAL', -- 'NORMAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
      verification_snapshot TEXT,
      emergency_locked INTEGER DEFAULT 0,
      emergency_lock_reason TEXT,
      locked_by TEXT,
      last_heartbeat_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Proctor Events (Chronological audit ledger of suspicious activity / leak signals)
    CREATE TABLE IF NOT EXISTS proctor_events (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      attempt_id TEXT,
      user_id TEXT,
      user_role TEXT,
      exam_id TEXT,
      student_id TEXT,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL, -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
      risk_points INTEGER DEFAULT 0,
      timestamp TEXT NOT NULL,
      metadata_json TEXT,
      snapshot_thumbnail TEXT,
      created_at TEXT NOT NULL
    );

    -- Proctor Settings (Configurable risk weights)
    CREATE TABLE IF NOT EXISTS proctor_settings (
      id TEXT PRIMARY KEY,
      org_id TEXT,
      tab_switch_points INTEGER DEFAULT 10,
      fullscreen_exit_points INTEGER DEFAULT 10,
      face_not_detected_points INTEGER DEFAULT 15,
      multiple_faces_points INTEGER DEFAULT 30,
      camera_disabled_points INTEGER DEFAULT 30,
      mic_disabled_points INTEGER DEFAULT 15,
      audio_activity_points INTEGER DEFAULT 5,
      copy_paste_points INTEGER DEFAULT 5,
      key_shortcut_points INTEGER DEFAULT 5,
      repeated_activity_points INTEGER DEFAULT 10,
      max_warnings INTEGER DEFAULT 3,
      updated_at TEXT NOT NULL
    );

    -- 39. DYNAMIC MULTI-PAPER GENERATOR TABLES
    CREATE TABLE IF NOT EXISTS paper_blueprints (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      name TEXT NOT NULL,
      exam_id TEXT,
      total_questions INTEGER NOT NULL,
      subject_rules_json TEXT NOT NULL,
      difficulty_rules_json TEXT NOT NULL,
      max_source_contribution_percent REAL NOT NULL DEFAULT 40.0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generated_papers (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      blueprint_id TEXT,
      title TEXT NOT NULL,
      exam_id TEXT,
      version_code TEXT NOT NULL,
      total_questions INTEGER NOT NULL,
      source_papers_json TEXT NOT NULL,
      difficulty_breakdown_json TEXT NOT NULL,
      subject_breakdown_json TEXT NOT NULL,
      source_contribution_json TEXT NOT NULL,
      paper_fingerprint TEXT NOT NULL UNIQUE,
      generation_seed TEXT NOT NULL,
      question_sequence_hash TEXT NOT NULL,
      option_permutation_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'GENERATED',
      generated_by TEXT NOT NULL,
      generated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generated_paper_questions (
      id TEXT PRIMARY KEY,
      generated_paper_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      source_paper_id TEXT,
      display_order INTEGER NOT NULL,
      shuffled_options_json TEXT NOT NULL,
      correct_option_id TEXT NOT NULL,
      displayed_correct_answer TEXT NOT NULL,
      marks INTEGER NOT NULL DEFAULT 4,
      negative_marks REAL NOT NULL DEFAULT 1.0
    );

    CREATE TABLE IF NOT EXISTS candidate_paper_assignments (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      generated_paper_id TEXT NOT NULL,
      candidate_id TEXT NOT NULL,
      candidate_name TEXT,
      candidate_roll_number TEXT,
      candidate_group TEXT,
      exam_session_id TEXT,
      paper_fingerprint TEXT NOT NULL,
      assigned_at TEXT NOT NULL
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

  safeAddColumn('organizations', 'verification_status TEXT DEFAULT "PENDING_VERIFICATION"');
  safeAddColumn('organizations', 'verification_method TEXT');
  safeAddColumn('organizations', 'verification_source TEXT');
  safeAddColumn('organizations', 'verification_date TEXT');
  safeAddColumn('organizations', 'document_verification_status TEXT DEFAULT "PENDING"');
  safeAddColumn('organizations', 'verification_message TEXT');
  safeAddColumn('question_assignments', 'org_id TEXT');
  safeAddColumn('question_assignments', 'assigned_by_user_id TEXT');
  safeAddColumn('question_assignments', 'assignment_type TEXT DEFAULT "SME_REVIEW"');
  safeAddColumn('question_assignments', 'target_language TEXT');
  safeAddColumn('question_assignments', 'notes TEXT');
  safeAddColumn('question_assignments', 'completed_at TEXT');
  safeAddColumn('question_translations', 'org_id TEXT');
  safeAddColumn('question_translations', 'assignment_id TEXT');
  safeAddColumn('question_translations', 'source_language TEXT DEFAULT "English"');
  safeAddColumn('questions', 'question_paper_id TEXT');
  safeAddColumn('questions', 'source_file TEXT');
  safeAddColumn('questions', 'source_page INTEGER');
  safeAddColumn('questions', 'question_number TEXT');
  safeAddColumn('questions', 'diagram_url TEXT');
  safeAddColumn('questions', 'image_url TEXT');
  safeAddColumn('questions', 'high_res_page_url TEXT');
  safeAddColumn('questions', 'crop_coordinates TEXT');
  safeAddColumn('questions', 'extraction_status TEXT DEFAULT "AUTO_EXTRACTED"');
  safeAddColumn('questions', 'options_status TEXT DEFAULT "PENDING_REVIEW"');
  safeAddColumn('questions', 'validation_flags TEXT');
  safeAddColumn('questions', 'page_width INTEGER');
  safeAddColumn('questions', 'page_height INTEGER');
  safeAddColumn('question_papers', 'auto_extracted_count INTEGER DEFAULT 0');
  safeAddColumn('question_papers', 'needs_review_count INTEGER DEFAULT 0');
  safeAddColumn('question_papers', 'manually_corrected_count INTEGER DEFAULT 0');
  safeAddColumn('question_papers', 'pages_dir TEXT');
  safeAddColumn('question_papers', 'cloudinary_url TEXT');
  safeAddColumn('question_papers', 'cloudinary_public_id TEXT');
  safeAddColumn('organization_documents', 'cloudinary_url TEXT');
  safeAddColumn('organization_documents', 'cloudinary_public_id TEXT');
  safeAddColumn('trusted_devices', 'device_uuid TEXT');
  safeAddColumn('trusted_devices', 'public_key TEXT');
  safeAddColumn('trusted_devices', 'device_model TEXT');
  safeAddColumn('trusted_devices', 'operating_system TEXT');
  safeAddColumn('trusted_devices', 'os_version TEXT');
  safeAddColumn('trusted_devices', 'app_version TEXT');
  safeAddColumn('trusted_devices', 'attestation_status TEXT DEFAULT "UNAVAILABLE"');
  safeAddColumn('trusted_devices', 'encryption_algorithm TEXT DEFAULT "ECDSA-P256"');
  safeAddColumn('trusted_devices', 'revoked_at TEXT');
  safeAddColumn('trusted_devices', 'metadata_json TEXT');
  safeAddColumn('trusted_devices', 'created_at TEXT');
  safeAddColumn('trusted_devices', 'updated_at TEXT');
  safeAddColumn('trusted_devices', 'approved_at TEXT');
  safeAddColumn('trusted_devices', 'approved_by TEXT');
  safeAddColumn('trusted_devices', 'last_authenticated_at TEXT');
  safeAddColumn('trusted_devices', 'disabled_at TEXT');
  safeAddColumn('trusted_devices', 'replacement_of_device_id TEXT');

  safeAddColumn('organizations', 'state TEXT');

  safeAddColumn('examinations', 'proctor_enabled INTEGER DEFAULT 1');
  safeAddColumn('examinations', 'simulation_status TEXT DEFAULT "NOT_STARTED"');
  safeAddColumn('examinations', 'simulated_at TEXT');
  safeAddColumn('examinations', 'simulated_by TEXT');
  safeAddColumn('examinations', 'max_copies INTEGER DEFAULT 500');

  safeAddColumn('examination_centres', 'org_id TEXT');
  safeAddColumn('examination_centres', 'state TEXT');
  safeAddColumn('examination_centres', 'contact_person TEXT');
  safeAddColumn('examination_centres', 'contact_number TEXT');
  safeAddColumn('examination_centres', 'email TEXT');
  safeAddColumn('examination_centres', 'status TEXT DEFAULT "ACTIVE"');
  safeAddColumn('examination_centres', 'created_by TEXT');
  safeAddColumn('examination_centres', 'updated_at TEXT');

  safeAddColumn('proctor_events', 'session_id TEXT');
  safeAddColumn('proctor_events', 'user_id TEXT');
  safeAddColumn('proctor_events', 'user_role TEXT');
  safeAddColumn('proctor_events', 'snapshot_thumbnail TEXT');

  try {
    const proctorCols = executeQuery(db, 'PRAGMA table_info(proctor_events)', []);
    const attemptCol = proctorCols.find((c: any) => c.name === 'attempt_id');
    if (attemptCol && attemptCol.notnull === 1) {
      db.run(`
        CREATE TABLE IF NOT EXISTS proctor_events_temp (
          id TEXT PRIMARY KEY,
          session_id TEXT,
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
        )
      `);
      db.run(`
        INSERT OR IGNORE INTO proctor_events_temp (
          id, session_id, attempt_id, user_id, user_role, exam_id, student_id, event_type, severity, risk_points, timestamp, metadata_json, snapshot_thumbnail, created_at
        ) SELECT 
          id, session_id, attempt_id, user_id, user_role, exam_id, student_id, event_type, severity, risk_points, timestamp, metadata_json, snapshot_thumbnail, created_at 
        FROM proctor_events
      `);
      db.run('DROP TABLE proctor_events');
      db.run('ALTER TABLE proctor_events_temp RENAME TO proctor_events');
    }
  } catch (migErr) {
    console.warn('proctor_events nullable migration notice:', migErr);
  }

  try {
    db.run(`UPDATE trusted_devices SET status = 'APPROVED' WHERE status = 'TRUSTED'`);
    db.run(`UPDATE trusted_devices SET status = 'PENDING' WHERE status = 'PENDING_APPROVAL'`);
    db.run(`INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES ('CENTRE_OPERATOR_MAX_ACTIVE_DEVICES', '1')`);

    // Seed Top 10 AICTE / NIRF Premier Universities
    const existingAicte = executeQuery(db, 'SELECT count(*) as count FROM aicte_universities', []);
    if (!existingAicte[0] || existingAicte[0].count === 0) {
      const aicteData = [
        ['AICTE-UNI-01', 'AICTE-1-0001-IITB', 'Indian Institute of Technology Bombay (IIT Bombay)', 'IIT Bombay', 3, 'University', 'Maharashtra', 'Mumbai', 'registrar@iitb.ac.in', 'https://www.iitb.ac.in', '+91 22 2572 2545', 'Main Gate Road, Powai, Mumbai, Maharashtra 400076', 'AUTH-IITB-2026'],
        ['AICTE-UNI-02', 'AICTE-1-0002-IITD', 'Indian Institute of Technology Delhi (IIT Delhi)', 'IIT Delhi', 2, 'University', 'Delhi', 'New Delhi', 'registrar@iitd.ac.in', 'https://www.iitd.ac.in', '+91 11 2659 7135', 'Hauz Khas, New Delhi, Delhi 110016', 'AUTH-IITD-2026'],
        ['AICTE-UNI-03', 'AICTE-1-0003-IITM', 'Indian Institute of Technology Madras (IIT Madras)', 'IIT Madras', 1, 'University', 'Tamil Nadu', 'Chennai', 'registrar@iitm.ac.in', 'https://www.iitm.ac.in', '+91 44 2257 8100', 'Sardar Patel Road, Chennai, Tamil Nadu 600036', 'AUTH-IITM-2026'],
        ['AICTE-UNI-04', 'AICTE-1-0004-IISC', 'Indian Institute of Science Bangalore (IISc)', 'IISc Bangalore', 1, 'University', 'Karnataka', 'Bengaluru', 'registrar@iisc.ac.in', 'https://www.iisc.ac.in', '+91 80 2293 2004', 'CV Raman Road, Bengaluru, Karnataka 560012', 'AUTH-IISC-2026'],
        ['AICTE-UNI-05', 'AICTE-1-0005-DU', 'University of Delhi (DU)', 'Delhi University', 6, 'University', 'Delhi', 'New Delhi', 'registrar@du.ac.in', 'https://www.du.ac.in', '+91 11 2766 7011', 'Benito Juarez Marg, South Campus / North Campus, Delhi 110007', 'AUTH-DU-2026'],
        ['AICTE-UNI-06', 'AICTE-1-0006-BHU', 'Banaras Hindu University (BHU)', 'BHU Varanasi', 5, 'University', 'Uttar Pradesh', 'Varanasi', 'registrar@bhu.ac.in', 'https://www.bhu.ac.in', '+91 542 236 8558', 'Ajagara, Varanasi, Uttar Pradesh 221005', 'AUTH-BHU-2026'],
        ['AICTE-UNI-07', 'AICTE-1-0007-JNU', 'Jawaharlal Nehru University (JNU)', 'JNU New Delhi', 2, 'University', 'Delhi', 'New Delhi', 'registrar@jnu.ac.in', 'https://www.jnu.ac.in', '+91 11 2670 4015', 'New Mehrauli Road, JNU Ring Rd, New Delhi 110067', 'AUTH-JNU-2026'],
        ['AICTE-UNI-08', 'AICTE-1-0008-ANNA', 'Anna University', 'Anna University', 13, 'University', 'Tamil Nadu', 'Chennai', 'registrar@annauniv.edu', 'https://www.annauniv.edu', '+91 44 2235 7004', '12, Sardar Patel Road, Guindy, Chennai, Tamil Nadu 600025', 'AUTH-ANNA-2026'],
        ['AICTE-UNI-09', 'AICTE-1-0009-JU', 'Jadavpur University', 'Jadavpur University', 9, 'University', 'West Bengal', 'Kolkata', 'registrar@jadavpuruniversity.in', 'https://www.jaduniv.edu.in', '+91 33 2414 6666', '188, Raja S.C. Mallick Road, Kolkata, West Bengal 700032', 'AUTH-JU-2026'],
        ['AICTE-UNI-10', 'AICTE-1-0010-SPPU', 'Savitribai Phule Pune University (SPPU)', 'SPPU Pune', 19, 'University', 'Maharashtra', 'Pune', 'registrar@unipune.ac.in', 'http://www.unipune.ac.in', '+91 20 2562 1000', 'Ganeshkhind, Pune, Maharashtra 411007', 'AUTH-SPPU-2026'],
      ];
      const nowIso = new Date().toISOString();
      for (const row of aicteData) {
        db.run(
          `INSERT INTO aicte_universities (id, aicte_id, name, short_code, nirf_rank, type, state, city, official_email, website, contact_number, headquarters_address, auth_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [...row, nowIso]
        );
      }
    }

    // Seed default proctor settings if not existing
    const existingSettings = executeQuery(db, 'SELECT id FROM proctor_settings WHERE id = "default_settings"', []);
    if (existingSettings.length === 0) {
      db.run(`
        INSERT INTO proctor_settings (
          id, org_id, tab_switch_points, fullscreen_exit_points, face_not_detected_points,
          multiple_faces_points, camera_disabled_points, mic_disabled_points, audio_activity_points,
          copy_paste_points, key_shortcut_points, repeated_activity_points, max_warnings, updated_at
        ) VALUES (
          'default_settings', 'GLOBAL', 10, 10, 15,
          30, 30, 15, 5,
          5, 5, 10, 3, datetime('now')
        )
      `);
    }

    // Seed initial demo Authority Proctor Enclave sessions for live surveillance monitoring
    const existingAuthSessions = executeQuery(db, 'SELECT id FROM authority_proctor_sessions WHERE id = "AUTH-SESS-SME-01"', []);
    if (existingAuthSessions.length === 0) {
      const nowIso = new Date().toISOString();
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

      // 1. SME Question Vetting Enclave
      db.run(`
        INSERT INTO authority_proctor_sessions (
          id, user_id, user_name, user_email, user_role, org_id, workspace_type,
          exam_id, status, camera_status, microphone_status, fullscreen_status,
          face_status, faces_detected_count, audio_level_db, leak_risk_score,
          leak_risk_level, last_heartbeat_at, created_at, updated_at
        ) VALUES (
          'AUTH-SESS-SME-01', 'usr-sme-01', 'Dr. Anjali Rao', 'sme@nbte.edu.in', 'SME',
          'ORG-ZEROLEAK-NATIONAL', 'SME_QUESTION_VETTING', 'EXAM-2026-CS-NATIONAL',
          'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'VERIFIED', 1, -42.0, 0,
          'NORMAL', ?, ?, ?
        )
      `, [nowIso, tenMinsAgo, nowIso]);

      db.run(`
        INSERT INTO proctor_events (
          id, session_id, user_id, user_role, exam_id, event_type, severity, risk_points, timestamp, metadata_json, created_at
        ) VALUES (
          'AUTH-EV-01', 'AUTH-SESS-SME-01', 'usr-sme-01', 'SME', 'EXAM-2026-CS-NATIONAL',
          'ENCLAVE_STARTED', 'LOW', 0, ?, '{"action":"Camera & Mic initialized; verified single official"}', ?
        )
      `, [tenMinsAgo, tenMinsAgo]);

      // 2. Translator Portal with a shoulder surfing alert
      db.run(`
        INSERT INTO authority_proctor_sessions (
          id, user_id, user_name, user_email, user_role, org_id, workspace_type,
          exam_id, status, camera_status, microphone_status, fullscreen_status,
          face_status, faces_detected_count, audio_level_db, leak_risk_score,
          leak_risk_level, last_heartbeat_at, created_at, updated_at
        ) VALUES (
          'AUTH-SESS-TRANS-01', 'usr-trans-01', 'Vikram Joshi', 'translator@nbte.edu.in', 'TRANSLATOR',
          'ORG-ZEROLEAK-NATIONAL', 'TRANSLATOR_PORTAL', 'EXAM-2026-CS-NATIONAL',
          'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'SHOULDER_SURFING_DETECTED', 2, -34.0, 65,
          'HIGH', ?, ?, ?
        )
      `, [nowIso, tenMinsAgo, nowIso]);

      db.run(`
        INSERT INTO proctor_events (
          id, session_id, user_id, user_role, exam_id, event_type, severity, risk_points, timestamp, metadata_json, created_at
        ) VALUES (
          'AUTH-EV-02', 'AUTH-SESS-TRANS-01', 'usr-trans-01', 'TRANSLATOR', 'EXAM-2026-CS-NATIONAL',
          'ENCLAVE_STARTED', 'LOW', 0, ?, '{"action":"Translator Enclave Verified"}', ?
        ),
        (
          'AUTH-EV-03', 'AUTH-SESS-TRANS-01', 'usr-trans-01', 'TRANSLATOR', 'EXAM-2026-CS-NATIONAL',
          'SHOULDER_SURFING_DETECTED', 'HIGH', 35, ?, '{"faces_detected":2,"action":"Confidential paper instantly blurred & watermarked to avoid leak"}', ?
        ),
        (
          'AUTH-EV-04', 'AUTH-SESS-TRANS-01', 'usr-trans-01', 'TRANSLATOR', 'EXAM-2026-CS-NATIONAL',
          'UNAUTHORIZED_WINDOW_SWITCH', 'MEDIUM', 15, ?, '{"window_focus":false,"duration_seconds":3}', ?
        )
      `, [tenMinsAgo, tenMinsAgo, fiveMinsAgo, fiveMinsAgo, twoMinsAgo, twoMinsAgo]);

      // 3. Exam Manager Compilation Session
      db.run(`
        INSERT INTO authority_proctor_sessions (
          id, user_id, user_name, user_email, user_role, org_id, workspace_type,
          exam_id, status, camera_status, microphone_status, fullscreen_status,
          face_status, faces_detected_count, audio_level_db, leak_risk_score,
          leak_risk_level, last_heartbeat_at, created_at, updated_at
        ) VALUES (
          'AUTH-SESS-MGR-01', 'usr-manager-01', 'Prof. Rajesh Sharma', 'manager@nbte.edu.in', 'EXAM_MANAGER',
          'ORG-ZEROLEAK-NATIONAL', 'EXAM_PAPER_COMPILATION', 'EXAM-2026-CS-NATIONAL',
          'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'VERIFIED', 1, -45.0, 10,
          'NORMAL', ?, ?, ?
        )
      `, [nowIso, tenMinsAgo, nowIso]);
    }

    // Seed an initial demo proctored candidate attempt for instant demonstration
    const existingAttempts = executeQuery(db, 'SELECT id FROM exam_attempts WHERE id = "DEMO-ATTEMPT-01"', []);
    if (existingAttempts.length === 0) {
      const demoIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      db.run(`
        INSERT INTO exam_attempts (
          id, exam_id, student_id, student_name, student_email, status,
          started_at, total_questions, answered_questions, score, risk_score,
          risk_level, warning_count, proctor_decision, created_at, updated_at
        ) VALUES (
          'DEMO-ATTEMPT-01', 'EXAM-2026-CS-NATIONAL', 'STU-2026-8821', 'Rahul Sharma', 'rahul.sharma@candidate.edu.in', 'FLAGGED_FOR_REVIEW',
          ?, 5, 4, 12, 65,
          'HIGH', 2, 'PENDING', ?, ?
        )
      `, [demoIso, demoIso, demoIso]);

      db.run(`
        INSERT INTO proctor_sessions (
          id, attempt_id, exam_id, student_id, camera_status, microphone_status,
          fullscreen_status, face_status, faces_detected_count, last_heartbeat_at, created_at, updated_at
        ) VALUES (
          'SESSION-DEMO-01', 'DEMO-ATTEMPT-01', 'EXAM-2026-CS-NATIONAL', 'STU-2026-8821', 'ACTIVE', 'ACTIVE',
          'ACTIVE', 'DETECTED', 1, ?, ?, ?
        )
      `, [demoIso, demoIso, demoIso]);

      // Seed sample events on timeline
      const t1 = new Date(Date.now() - 14 * 60 * 1000).toISOString();
      const t2 = new Date(Date.now() - 11 * 60 * 1000).toISOString();
      const t3 = new Date(Date.now() - 8 * 60 * 1000).toISOString();
      const t4 = new Date(Date.now() - 4 * 60 * 1000).toISOString();

      db.run(`INSERT INTO proctor_events (id, attempt_id, exam_id, student_id, event_type, severity, risk_points, timestamp, metadata_json, created_at) VALUES
        ('EV-01', 'DEMO-ATTEMPT-01', 'EXAM-2026-CS-NATIONAL', 'STU-2026-8821', 'EXAM_STARTED', 'LOW', 0, ?, '{"client":"Chrome 128 / Windows 11"}', ?),
        ('EV-02', 'DEMO-ATTEMPT-01', 'EXAM-2026-CS-NATIONAL', 'STU-2026-8821', 'TAB_SWITCH', 'MEDIUM', 10, ?, '{"duration_seconds":6,"warning_count":1}', ?),
        ('EV-03', 'DEMO-ATTEMPT-01', 'EXAM-2026-CS-NATIONAL', 'STU-2026-8821', 'FULLSCREEN_EXIT', 'MEDIUM', 10, ?, '{"action":"exited_fullscreen","warning_count":2}', ?),
        ('EV-04', 'DEMO-ATTEMPT-01', 'EXAM-2026-CS-NATIONAL', 'STU-2026-8821', 'MULTIPLE_FACES', 'HIGH', 30, ?, '{"detected_faces":2,"confidence":0.92}', ?)
      `, [t1, t1, t2, t2, t3, t3, t4, t4]);
    }
  } catch (migErr) {
    console.error('Proctor migration notice:', migErr);
  }
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

export function convertSqliteToPostgres(sql: string): string {
  let paramIndex = 1;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let out = '';

  let convertedSql = sql
    .replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, 'INSERT INTO')
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO')
    .replace(/=\s*"([^"]+)"/g, "= '$1'")
    .replace(/datetime\('now'\)/gi, 'NOW()');

  const hasReplace = /INSERT\s+OR\s+REPLACE\s+INTO/i.test(sql);
  const hasIgnore = /INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql);

  for (let i = 0; i < convertedSql.length; i++) {
    const char = convertedSql[i];
    if (char === "'" && (i === 0 || convertedSql[i - 1] !== '\\')) {
      inSingleQuote = !inSingleQuote;
      out += char;
    } else if (char === '"' && (i === 0 || convertedSql[i - 1] !== '\\')) {
      inDoubleQuote = !inDoubleQuote;
      out += char;
    } else if (char === '?' && !inSingleQuote && !inDoubleQuote) {
      out += `$${paramIndex++}`;
    } else {
      out += char;
    }
  }

  const isInsert = /^\s*INSERT\s+INTO\s+/i.test(out);
  if (isInsert && !/ON\s+CONFLICT/i.test(out)) {
    if (/\busers\b/i.test(out) && !/authorized_users/i.test(out)) {
      out += ` ON CONFLICT (email) DO UPDATE SET 
        org_id = EXCLUDED.org_id, 
        password_hash = EXCLUDED.password_hash, 
        full_name = EXCLUDED.full_name, 
        role = EXCLUDED.role, 
        status = EXCLUDED.status, 
        authorization_status = EXCLUDED.authorization_status, 
        authorized_by = EXCLUDED.authorized_by, 
        authorized_at = EXCLUDED.authorized_at, 
        centre_id = EXCLUDED.centre_id, 
        last_login_at = EXCLUDED.last_login_at`;
    } else if (/authorized_users/i.test(out)) {
      out += ` ON CONFLICT (id) DO UPDATE SET 
        org_id = EXCLUDED.org_id, 
        full_name = EXCLUDED.full_name, 
        official_email = EXCLUDED.official_email, 
        contact_number = EXCLUDED.contact_number, 
        designation = EXCLUDED.designation, 
        assigned_role = EXCLUDED.assigned_role, 
        authorized_by = EXCLUDED.authorized_by, 
        authorization_status = EXCLUDED.authorization_status`;
    } else if (/\borganizations\b/i.test(out) && !/organization_/i.test(out)) {
      out += ` ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name, 
        type = EXCLUDED.type, 
        status = EXCLUDED.status, 
        verification_status = EXCLUDED.verification_status, 
        updated_at = EXCLUDED.updated_at`;
    } else if (/system_settings/i.test(out)) {
      out += ` ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`;
    } else if (/proctor_settings/i.test(out)) {
      out += ` ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id, updated_at = EXCLUDED.updated_at`;
    } else if (/trusted_devices/i.test(out)) {
      out += ` ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, status = EXCLUDED.status, last_seen_at = EXCLUDED.last_seen_at`;
    } else {
      out += ` ON CONFLICT (id) DO NOTHING`;
    }
  }

  return out;
}

export function writeThroughToPostgres(sql: string, params: any[] = []): void {
  const pool = getPostgresPool();
  if (!pool) return;

  // Asynchronously execute write-through in background without delaying HTTP request
  setImmediate(async () => {
    try {
      if (!pgInitialized) {
        await initPostgres();
      }
      const pgSql = convertSqliteToPostgres(sql);
      const pgParams = params.map((p) => {
        if (p === undefined) return null;
        return p;
      });
      await pool.query(pgSql, pgParams);
    } catch (err: any) {
      // Non-blocking write-through warning
      console.warn('PostgreSQL write-through notice:', err.message, '| Query:', sql.substring(0, 80));
    }
  });
}

export function executeRun(db: Database, sql: string, params: any[] = []): void {
  db.run(sql, params);
  saveDb();
  writeThroughToPostgres(sql, params);
}

export async function queryPostgres(sql: string, params: any[] = []): Promise<any[]> {
  const pool = getPostgresPool();
  if (!pool) return [];
  try {
    const res = await pool.query(sql, params);
    return res.rows;
  } catch (err) {
    console.error('queryPostgres error:', err);
    return [];
  }
}

export async function runPostgres(sql: string, params: any[] = []): Promise<void> {
  const pool = getPostgresPool();
  if (!pool) return;
  try {
    await pool.query(sql, params);
  } catch (err) {
    console.error('runPostgres error:', err);
  }
}

export async function lookupUserInPostgres(identifier: string): Promise<any | null> {
  const pool = getPostgresPool();
  if (!pool || !pgInitialized) return null;

  try {
    const normalized = identifier.trim().toLowerCase();
    const res = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $1 LIMIT 1',
      [normalized]
    );
    if (res.rows.length > 0) {
      const user = res.rows[0];
      if (dbInstance) {
        const keys = Object.keys(user);
        const values = Object.values(user).map((v) => {
          if (v instanceof Date) return v.toISOString();
          if (typeof v === 'object' && v !== null) return JSON.stringify(v);
          return v;
        });
        const placeholders = keys.map(() => '?').join(', ');
        try {
          dbInstance.run(`INSERT OR REPLACE INTO users (${keys.join(', ')}) VALUES (${placeholders})`, values as any[]);
        } catch {}
      }
      return user;
    }
  } catch (e) {
    console.error('lookupUserInPostgres error:', e);
  }
  return null;
}

export async function lookupAuthorizedUserInPostgres(identifier: string): Promise<any | null> {
  const pool = getPostgresPool();
  if (!pool || !pgInitialized) return null;

  try {
    const normalized = identifier.trim().toLowerCase();
    const res = await pool.query(
      'SELECT * FROM authorized_users WHERE LOWER(official_email) = $1 LIMIT 1',
      [normalized]
    );
    if (res.rows.length > 0) {
      const authUser = res.rows[0];
      if (dbInstance) {
        const keys = Object.keys(authUser);
        const values = Object.values(authUser).map((v) => {
          if (v instanceof Date) return v.toISOString();
          if (typeof v === 'object' && v !== null) return JSON.stringify(v);
          return v;
        });
        const placeholders = keys.map(() => '?').join(', ');
        try {
          dbInstance.run(`INSERT OR REPLACE INTO authorized_users (${keys.join(', ')}) VALUES (${placeholders})`, values as any[]);
        } catch {}
      }
      return authUser;
    }
  } catch (e) {
    console.error('lookupAuthorizedUserInPostgres error:', e);
  }
  return null;
}


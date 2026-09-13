-- ==============================================================================
-- ZeroLeak Examination Security System - PostgreSQL Database Schema
-- Version: 2.0 (PostgreSQL 14+)
-- ==============================================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Organizations
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

-- 2. AICTE Premier Universities & Institutions
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

-- 3. Authoritative Institutions (Government Directory)
CREATE TABLE IF NOT EXISTS authoritative_institutions (
    id BIGSERIAL PRIMARY KEY,
    source_code VARCHAR(255),
    external_id TEXT,
    institution_name TEXT NOT NULL,
    institution_type TEXT,
    address TEXT,
    state TEXT,
    city TEXT,
    district TEXT,
    pincode TEXT,
    official_website TEXT,
    approval_status TEXT,
    source_record_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Organization Verification History
CREATE TABLE IF NOT EXISTS organization_verifications (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    previous_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    reason TEXT NOT NULL,
    verification_ref TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- 5. Organization Documents
CREATE TABLE IF NOT EXISTS organization_documents (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_data TEXT,
    cloudinary_url TEXT,
    cloudinary_public_id TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    uploaded_at TEXT NOT NULL,
    verified_at TEXT,
    verified_by TEXT
);

-- 6. Authorized Representatives
CREATE TABLE IF NOT EXISTS authorized_representatives (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id TEXT,
    name TEXT NOT NULL,
    designation TEXT NOT NULL,
    email TEXT NOT NULL,
    contact TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL
);

-- 7. Authorized Users (Institutional Role Access Control: SME, Translator, Operator, Manager)
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

-- 8. Users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
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

-- 9. Device Bindings (Cryptographic Device Identity)
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
    status TEXT NOT NULL DEFAULT 'PENDING',
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

-- 10. Device Challenges
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

-- 11. Device Replacement Requests
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

-- 12. System Settings
CREATE TABLE IF NOT EXISTS system_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL
);

-- 13. Device Events
CREATE TABLE IF NOT EXISTS device_events (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    timestamp TEXT NOT NULL
);

-- 14. Examinations
CREATE TABLE IF NOT EXISTS examinations (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    category TEXT NOT NULL,
    exam_type TEXT NOT NULL,
    exam_date TEXT NOT NULL,
    exam_time TEXT NOT NULL,
    unlock_time TEXT NOT NULL,
    total_marks INTEGER NOT NULL DEFAULT 100,
    total_questions INTEGER NOT NULL DEFAULT 0,
    duration_minutes INTEGER NOT NULL DEFAULT 180,
    status TEXT NOT NULL DEFAULT 'CONFIGURING',
    proctor_enabled INTEGER DEFAULT 1,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 15. Examination Configurations
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

-- 16. Examination Centres
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

-- 17. Questions
CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    question_paper_id TEXT,
    source_file TEXT,
    source_page INTEGER,
    question_number TEXT,
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    marks INTEGER NOT NULL DEFAULT 4,
    negative_marks REAL NOT NULL DEFAULT 1.0,
    correct_answer TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'English',
    syllabus TEXT NOT NULL,
    question_type TEXT NOT NULL,
    content_text TEXT NOT NULL,
    options_json TEXT,
    diagram_url TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 18. Question Papers
CREATE TABLE IF NOT EXISTS question_papers (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    subject TEXT NOT NULL,
    examination_category TEXT NOT NULL,
    processing_status TEXT NOT NULL,
    page_count INTEGER NOT NULL DEFAULT 0,
    question_count INTEGER NOT NULL DEFAULT 0,
    extraction_error TEXT,
    cloudinary_url TEXT,
    cloudinary_public_id TEXT,
    uploaded_at TEXT NOT NULL
);

-- 19. Question Verifications
CREATE TABLE IF NOT EXISTS question_verifications (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL,
    verifier_user_id TEXT NOT NULL,
    status TEXT NOT NULL,
    feedback TEXT,
    syllabus_accurate INTEGER DEFAULT 1,
    answer_verified INTEGER DEFAULT 1,
    verified_at TEXT NOT NULL
);

-- 20. Question Assignments (SME & Linguistic Translators)
CREATE TABLE IF NOT EXISTS question_assignments (
    id TEXT PRIMARY KEY,
    org_id TEXT,
    question_id TEXT NOT NULL,
    assigned_sme_user_id TEXT NOT NULL,
    assigned_by_user_id TEXT,
    assignment_type TEXT NOT NULL DEFAULT 'SME_REVIEW',
    target_language TEXT,
    status TEXT NOT NULL DEFAULT 'ASSIGNED',
    notes TEXT,
    assigned_at TEXT NOT NULL,
    completed_at TEXT
);

-- 21. Question Translations (Linguistic Translators)
CREATE TABLE IF NOT EXISTS question_translations (
    id TEXT PRIMARY KEY,
    org_id TEXT,
    question_id TEXT NOT NULL,
    assignment_id TEXT,
    source_language TEXT NOT NULL DEFAULT 'English',
    language TEXT NOT NULL,
    translated_content TEXT NOT NULL,
    translated_options_json TEXT,
    translated_by_user_id TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    translator_notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 22. Question Quarantine
CREATE TABLE IF NOT EXISTS question_quarantine (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    reported_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'QUARANTINED',
    quarantined_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT,
    notes TEXT
);

-- 23. Paper Versions
CREATE TABLE IF NOT EXISTS paper_versions (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL,
    version_code TEXT NOT NULL,
    status TEXT NOT NULL,
    is_current INTEGER NOT NULL DEFAULT 1,
    generated_by TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    invalidated_at TEXT,
    invalidation_reason TEXT
);

-- 24. Paper Questions Mapping
CREATE TABLE IF NOT EXISTS paper_questions (
    id TEXT PRIMARY KEY,
    paper_version_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    section_name TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    marks INTEGER NOT NULL
);

-- 25. Paper Validation Results
CREATE TABLE IF NOT EXISTS paper_validation_results (
    id TEXT PRIMARY KEY,
    paper_version_id TEXT NOT NULL,
    is_valid INTEGER NOT NULL,
    validation_errors_json TEXT,
    validated_at TEXT NOT NULL
);

-- 26. Encrypted Papers & Crypto Metadata
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

-- 27. Key Shares (Shamir Secret Sharing Quorum Metadata)
CREATE TABLE IF NOT EXISTS key_shares (
    id TEXT PRIMARY KEY,
    paper_version_id TEXT NOT NULL,
    share_index INTEGER NOT NULL,
    threshold INTEGER NOT NULL,
    total_shares INTEGER NOT NULL,
    share_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- 28. Paper Release Events
CREATE TABLE IF NOT EXISTS paper_release_events (
    id TEXT PRIMARY KEY,
    paper_version_id TEXT NOT NULL,
    exam_id TEXT NOT NULL,
    centre_id TEXT NOT NULL,
    operator_user_id TEXT NOT NULL,
    released_at TEXT NOT NULL,
    ip_address TEXT
);

-- 29. Print Copies (Unique Tracked Copies)
CREATE TABLE IF NOT EXISTS print_copies (
    id TEXT PRIMARY KEY,
    copy_id TEXT NOT NULL UNIQUE,
    exam_id TEXT NOT NULL,
    paper_version_id TEXT NOT NULL,
    centre_id TEXT NOT NULL,
    operator_user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    printed_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PRINTED',
    tx_hash TEXT NOT NULL
);

-- 30. Audit Events (Immutable Security Log)
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

-- 31. Security & Threat Events (Anomaly / Threat Log)
CREATE TABLE IF NOT EXISTS security_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    risk_score REAL NOT NULL,
    user_id TEXT,
    org_id TEXT,
    ip_address TEXT,
    details_json TEXT,
    resolved INTEGER DEFAULT 0,
    timestamp TEXT NOT NULL
);

-- 32. Regeneration Events
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

-- 33. System Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    role TEXT,
    org_id TEXT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    category TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);

-- 34. Exam Attempts (Candidate Proctored Attempts)
CREATE TABLE IF NOT EXISTS exam_attempts (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    student_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    started_at TEXT NOT NULL,
    submitted_at TEXT,
    total_questions INTEGER DEFAULT 0,
    answered_questions INTEGER DEFAULT 0,
    score REAL DEFAULT 0,
    risk_score INTEGER DEFAULT 0,
    risk_level TEXT DEFAULT 'NORMAL',
    warning_count INTEGER DEFAULT 0,
    verification_snapshot TEXT,
    proctor_decision TEXT DEFAULT 'PENDING',
    proctor_remarks TEXT,
    answers_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 35. Proctor Sessions (Live Telemetry & Hardware Status)
CREATE TABLE IF NOT EXISTS proctor_sessions (
    id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL UNIQUE,
    exam_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    camera_status TEXT DEFAULT 'ACTIVE',
    microphone_status TEXT DEFAULT 'ACTIVE',
    fullscreen_status TEXT DEFAULT 'ACTIVE',
    face_status TEXT DEFAULT 'DETECTED',
    faces_detected_count INTEGER DEFAULT 1,
    last_heartbeat_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 36. Authority Proctor Sessions (Work on Camera for Leak Prevention)
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

-- 37. Proctor Events (Surveillance and Security Audit Log)
CREATE TABLE IF NOT EXISTS proctor_events (
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
);

-- 38. Proctor Settings (Configurable Risk Weights)
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

-- ==============================================================================
-- INDEXES FOR OPTIMAL QUERY PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_username ON users(LOWER(username));
CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_authorized_users_email ON authorized_users(LOWER(official_email));
CREATE INDEX IF NOT EXISTS idx_authorized_users_org_id ON authorized_users(org_id);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_org ON trusted_devices(org_id);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_uuid ON trusted_devices(device_uuid);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_status ON trusted_devices(status);
CREATE INDEX IF NOT EXISTS idx_device_challenges_user ON device_challenges(user_id, purpose);
CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_org ON audit_events(org_id);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_questions_org ON questions(org_id);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject);
CREATE INDEX IF NOT EXISTS idx_examinations_org ON examinations(org_id);

-- ==============================================================================
-- SCHEMA COMPATIBILITY MIGRATIONS (Safe on existing databases)
-- ==============================================================================
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS metadata_json TEXT;
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS app_version TEXT;
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS encryption_algorithm TEXT DEFAULT 'ECDSA-P256';
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS attestation_status TEXT DEFAULT 'UNAVAILABLE';
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS replacement_of_device_id TEXT;
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS approved_at TEXT;
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS last_authenticated_at TEXT;
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS disabled_at TEXT;
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS revoked_at TEXT;
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS device_uuid TEXT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS authorized_by_email TEXT;

ALTER TABLE authorized_users ADD COLUMN IF NOT EXISTS org_id TEXT;
ALTER TABLE authorized_users ADD COLUMN IF NOT EXISTS designated_role TEXT;
ALTER TABLE authorized_users ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE authorized_users ADD COLUMN IF NOT EXISTS authorization_date TEXT;
ALTER TABLE authorized_users ADD COLUMN IF NOT EXISTS expires_at TEXT;
ALTER TABLE authorized_users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';

ALTER TABLE organization_documents ADD COLUMN IF NOT EXISTS cloudinary_url TEXT;
ALTER TABLE organization_documents ADD COLUMN IF NOT EXISTS document_verification_status TEXT DEFAULT 'PENDING';

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verified_at TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verification_notes TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';

ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS actor_email TEXT;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS details_json TEXT;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS created_at TEXT;

-- ==============================================================================
-- 39. DYNAMIC MULTI-PAPER GENERATOR TABLES
-- ==============================================================================

-- Paper Blueprints
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

-- Generated Papers (Master Combination + Permutation Output)
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

-- Generated Paper Questions (Exact Shuffled Order & Option Permutations)
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

-- Candidate Paper Assignments (For Traceability & Anti-Leak Tracking)
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

CREATE INDEX IF NOT EXISTS idx_gen_papers_org ON generated_papers(org_id);
CREATE INDEX IF NOT EXISTS idx_gen_papers_fingerprint ON generated_papers(paper_fingerprint);
CREATE INDEX IF NOT EXISTS idx_gen_paper_q_paper ON generated_paper_questions(generated_paper_id);
CREATE INDEX IF NOT EXISTS idx_candidate_paper_assign ON candidate_paper_assignments(generated_paper_id, candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_assign_fingerprint ON candidate_paper_assignments(paper_fingerprint);



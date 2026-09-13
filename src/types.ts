export type UserRole = 'ORG_OWNER' | 'EXAM_MANAGER' | 'SME' | 'TRANSLATOR' | 'CENTRE_OPERATOR' | 'AUDITOR';

export interface User {
  id: string;
  org_id: string;
  email: string;
  username: string;
  full_name: string;
  role: UserRole;
  status: string;
  authorization_status?: string;
  account_type?: string;
  centre_id?: string;
  created_at: string;
  last_login_at?: string;
}

export interface AuthorizedUser {
  id: string;
  org_id: string;
  full_name: string;
  official_email: string;
  contact_number: string;
  designation: string;
  assigned_role: UserRole;
  authorization_status: string;
  created_at: string;
}

export type OrgVerificationStatus =
  | 'PENDING'
  | 'DOCUMENT_SUBMITTED'
  | 'IDENTITY_VALIDATION'
  | 'ORGANIZATION_VALIDATION'
  | 'AUTHORIZED_REPRESENTATIVE_VERIFICATION'
  | 'OFFICIAL_DOMAIN_VERIFICATION'
  | 'MANUAL_INDEPENDENT_REVIEW'
  | 'VERIFIED'
  | 'PENDING_VERIFICATION'
  | 'VERIFICATION_FAILED'
  | 'REJECTED'
  | 'VERIFICATION_REQUIRED';

// Result of the Stage-1 rule-based verification engine (mirrors server/verification.ts).
export interface RegistrationVerificationCheck {
  id: string;
  label: string;
  status: 'PASS' | 'PENDING' | 'FAIL';
  detail: string;
}

export interface RegistrationDocumentDetail {
  doc_type: string;
  file_name: string;
  file_size: number;
  sha256: string | null;
  extraction_status: 'EXTRACTED' | 'UNAVAILABLE' | 'CORRUPT' | 'MISSING';
  match_status: 'MATCH' | 'MISMATCH' | 'UNVERIFIED';
  detail: string;
}

export interface RegistrationVerificationResult {
  status: 'VERIFIED' | 'PENDING_VERIFICATION' | 'VERIFICATION_FAILED';
  verificationMethod: string;
  verificationSource: string | null;
  verificationDate: string;
  documentVerificationStatus: 'VERIFIED' | 'PENDING' | 'FAILED';
  message: string;
  evidence: {
    checks: RegistrationVerificationCheck[];
    documents: RegistrationDocumentDetail[];
  };
}

export interface Organization {
  id: string;
  name: string;
  type: string;
  reg_number: string;
  auth_id: string;
  official_email: string;
  website: string;
  address: string;
  contact: string;
  status: OrgVerificationStatus;
  verification_status?: 'VERIFIED' | 'PENDING_VERIFICATION' | 'VERIFICATION_FAILED';
  verification_method?: string;
  verification_source?: string;
  verification_date?: string | null;
  document_verification_status?: 'VERIFIED' | 'PENDING' | 'FAILED';
  verification_message?: string;
  domain_verified: number;
  created_at: string;
  updated_at: string;
}

export interface OrganizationDocument {
  id: string;
  org_id: string;
  doc_type: string;
  file_name: string;
  file_size: number;
  status: string;
  verification_status?: 'VERIFIED' | 'PENDING' | 'FAILED';
  uploaded_at: string;
  verified_at?: string;
  verified_by?: string;
}

export interface VerificationHistoryItem {
  id: string;
  org_id: string;
  previous_status: string;
  new_status: string;
  changed_by: string;
  reason: string;
  verification_ref: string;
  created_at: string;
}

export interface TrustedDevice {
  id: string;
  org_id: string;
  user_id: string;
  user_name?: string;
  user_role?: string;
  device_uuid?: string;
  device_fingerprint: string;
  public_key?: string;
  device_name: string;
  device_model?: string;
  operating_system?: string;
  os_version?: string;
  app_version?: string;
  browser_os: string;
  ip_address: string;
  status: 'PENDING' | 'APPROVED' | 'DISABLED' | 'REVOKED' | 'TRUSTED' | 'PENDING_APPROVAL';
  attestation_status?: string;
  encryption_algorithm?: string;
  registered_at: string;
  last_seen_at: string;
  revoked_at?: string;
}

export type ExamCategory =
  | 'Central Examination Board'
  | 'State Examination Authority'
  | 'Autonomous University'
  | 'Technical Education Council'
  | 'National Recruitment Commission'
  | 'Competitive Exam'
  | 'NEET'
  | 'JEE'
  | 'TCET / CET-type Exam'
  | 'University Exam'
  | 'Custom Exam';

export type ExamType = 'MCQ' | 'THEORY' | 'MIXED' | 'PRACTICAL_CODING';

export interface AicteUniversity {
  id: string;
  aicte_id: string;
  name: string;
  short_code: string;
  nirf_rank: number;
  type: string;
  state: string;
  city: string;
  official_email: string;
  website: string;
  contact_number: string;
  headquarters_address: string;
  auth_id: string;
}

export interface Examination {
  id: string;
  org_id: string;
  name: string;
  subject: string;
  category: ExamCategory;
  exam_type: ExamType;
  exam_date: string;
  exam_time: string;
  unlock_time: string;
  total_marks: number;
  total_questions: number;
  duration_minutes: number;
  status: 'CONFIGURING' | 'VERIFYING_POOL' | 'READY_FOR_GENERATION' | 'GENERATED_ENCRYPTED' | 'RELEASED' | 'COMPROMISED' | 'REGENERATED';
  created_by: string;
  created_at: string;
  updated_at: string;
  centre_name?: string;
  centre_code?: string;
  max_copies?: number;
  current_paper_version_id?: string;
  version_code?: string;
  isTimeUnlocked?: boolean;
  serverCurrentTime?: string;
  unlockDateTime?: string;
}

export type QuestionStatus =
  | 'DRAFT'
  | 'UNDER_VERIFICATION'
  | 'VERIFIED'
  | 'ELIGIBLE_FOR_PAPER'
  | 'QUARANTINED'
  | 'COMPROMISED'
  | 'CLEARED'
  | 'RETIRED';

export interface Question {
  id: string;
  org_id: string;
  subject: string;
  topic: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  marks: number;
  negative_marks: number;
  correct_answer: string;
  language: string;
  syllabus: string;
  question_type: 'MCQ' | 'THEORY' | 'MIXED' | 'PRACTICAL_CODING';
  content_text: string;
  options_json?: string;
  diagram_url?: string;
  status: QuestionStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface QuestionTranslation {
  id: string;
  question_id: string;
  source_language?: string;
  subject?: string;
  topic?: string;
  original_content?: string;
  original_options_json?: string;
  language: string;
  translated_content: string;
  translated_options_json?: string;
  translated_by_user_id?: string;
  translator_name?: string;
  status: 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  translator_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PaperVersion {
  id: string;
  exam_id: string;
  version_code: string;
  status: string;
  is_current: number;
  generated_by: string;
  generated_at: string;
  invalidated_at?: string;
  invalidation_reason?: string;
  checksum_sha256?: string;
  key_fingerprint?: string;
  encrypted_at?: string;
  question_count?: number;
}

export interface UniversityPaperSet {
  setIndex: number;
  setLabel: string;
  paperVersionId: string;
  versionCode: string;
  checksumSHA256: string;
  keyFingerprint: string;
  questionsCount: number;
  totalMarks: number;
  isCurrent: boolean;
}

export interface MultiSubjectBreakdown {
  subject: string;
  count: number;
  totalMarks: number;
}

export interface PrintCopy {
  id: string;
  copy_id: string;
  exam_id: string;
  exam_name?: string;
  paper_version_id: string;
  centre_id: string;
  operator_user_id: string;
  operator_name?: string;
  device_id: string;
  printed_at: string;
  status: string;
  tx_hash: string;
}

export interface AuditEvent {
  id: string;
  event_type: string;
  user_id?: string;
  user_email?: string;
  role?: string;
  org_id?: string;
  exam_id?: string;
  device_id?: string;
  ip_address?: string;
  status: string;
  tx_ref: string;
  details_json?: string;
  created_at: string;
}

export interface SecurityEvent {
  id: string;
  event_type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  risk_score: number;
  user_id?: string;
  org_id?: string;
  ip_address?: string;
  details_json?: string;
  resolved: number;
  timestamp: string;
}

export interface NotificationItem {
  id: string;
  user_id?: string;
  role?: string;
  org_id?: string;
  title: string;
  message: string;
  category: 'SECURITY' | 'VERIFICATION' | 'EXAMINATION' | 'PAPER_RELEASE';
  is_read: number;
  created_at: string;
}

export interface QuestionAssignment {
  id: string;
  org_id: string;
  question_id: string;
  assigned_sme_user_id: string;
  assigned_by_user_id?: string;
  assignment_type: 'SME_REVIEW' | 'LINGUISTIC_TRANSLATION';
  target_language?: string;
  status: 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
  notes?: string;
  assigned_at: string;
  completed_at?: string;
  subject?: string;
  topic?: string;
  difficulty?: string;
  marks?: number;
  correct_answer?: string;
  content_text?: string;
  options_json?: string;
  question_status?: string;
  assignee_name?: string;
  assignee_email?: string;
  assignee_role?: string;
  assigned_by_name?: string;
}

export interface ExtractedDiagramImage {
  image_id: string;
  type: string;
  data_url?: string;
  path?: string;
  page_number?: number;
  bbox?: number[];
  association_confidence?: number;
}

export interface ExtractedQuestionOption {
  label: string;
  text: string;
}

export interface ExtractedQuestion {
  tempId: string;
  question_number?: string;
  page_number?: number;
  extraction_confidence?: number;
  needs_review?: boolean;
  subject: string;
  topic: string;
  question_type: 'MCQ' | 'THEORY';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  marks: number;
  negative_marks: number;
  correct_answer: string;
  language: string;
  syllabus: string;
  content_text: string;
  options: Array<string | ExtractedQuestionOption> | null;
  images?: ExtractedDiagramImage[];
  diagram_url?: string;
  diagram_data?: string;
  has_diagram?: boolean;
  source_paper_id?: string;
  source_file?: string;
  paper_number?: number;
  selected?: boolean;
  question_images?: string[];
  status?: string;
  option_detection_confidence?: number;
  options_extraction_status?: 'certain' | 'uncertain';
  stitch_mode?: string;
}

export interface PaperExtractionResponse {
  message: string;
  extractedQuestions: ExtractedQuestion[];
  totalExtracted: number;
  detectedSubject: string;
  extractionSummary: string;
  aiEngineUsed: boolean;
  sourcePaperId?: string;
  paperId?: string;
  sourceFile?: string;
  processingStatus?: string;
  pages?: number;
  aiEngine?: { provider: string; model: string };
}

export interface DynamicWatermarkData {
  organizationName: string;
  centreId: string;
  operatorId: string;
  operatorName: string;
  deviceFingerprint: string;
  ipAddress: string;
  timestamp: string;
  sessionTxRef: string;
}

// ==========================================
// PROCTOR MODE TYPES
// ==========================================

export type RiskLevel = 'NORMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ProctorEventType =
  | 'EXAM_STARTED'
  | 'EXAM_SUBMITTED'
  | 'TAB_SWITCH'
  | 'FULLSCREEN_ENTER'
  | 'FULLSCREEN_EXIT'
  | 'FACE_NOT_DETECTED'
  | 'MULTIPLE_FACES'
  | 'CAMERA_DISABLED'
  | 'MICROPHONE_DISABLED'
  | 'AUDIO_ACTIVITY'
  | 'COPY_ATTEMPT'
  | 'PASTE_ATTEMPT'
  | 'CUT_ATTEMPT'
  | 'CONTEXT_MENU_ATTEMPT'
  | 'SUSPICIOUS_KEY_ATTEMPT'
  | 'WINDOW_BLUR'
  | 'WINDOW_FOCUS'
  | 'WARNING_ISSUED';

export interface ExamAttempt {
  id: string;
  exam_id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'FLAGGED_FOR_REVIEW' | 'VERIFIED_VALID';
  started_at: string;
  submitted_at?: string;
  total_questions: number;
  answered_questions: number;
  score: number;
  risk_score: number;
  risk_level: RiskLevel;
  warning_count: number;
  verification_snapshot?: string;
  proctor_decision?: 'PENDING' | 'VERIFIED_VALID' | 'VIOLATION_CONFIRMED';
  proctor_remarks?: string;
  answers?: Record<string, string>;
  exam_name?: string;
  exam_subject?: string;
  exam_duration?: number;
  camera_status?: string;
  microphone_status?: string;
  fullscreen_status?: string;
  face_status?: string;
  faces_detected_count?: number;
  last_heartbeat_at?: string;
}

export interface ProctorSession {
  id: string;
  attempt_id: string;
  exam_id: string;
  student_id: string;
  camera_status: 'ACTIVE' | 'DISABLED' | 'ERROR';
  microphone_status: 'ACTIVE' | 'DISABLED' | 'ERROR';
  fullscreen_status: 'ACTIVE' | 'EXITED';
  face_status: 'DETECTED' | 'NOT_DETECTED' | 'MULTIPLE';
  faces_detected_count: number;
  last_heartbeat_at: string;
}

export interface ProctorEvent {
  id: string;
  attempt_id: string;
  exam_id?: string;
  student_id?: string;
  event_type: ProctorEventType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  risk_points: number;
  timestamp: string;
  metadata?: any;
}

export interface ProctorSettings {
  id: string;
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

export interface ProctorCandidateExam {
  id: string;
  name: string;
  subject: string;
  category: string;
  exam_type: string;
  duration_minutes: number;
  total_marks: number;
}

export interface CandidateQuestion {
  id: string;
  sequence: number;
  subject: string;
  topic: string;
  difficulty: string;
  marks: number;
  negative_marks: number;
  question_type: string;
  content_text: string;
  options: string[];
}

export type AuthorityProctorEventType =
  | 'ENCLAVE_STARTED'
  | 'SHOULDER_SURFING_DETECTED'
  | 'FACE_ABSENT_MASKED'
  | 'SCREEN_UNMASKED'
  | 'UNAUTHORIZED_WINDOW_SWITCH'
  | 'FULLSCREEN_EXITED'
  | 'CLIPBOARD_EXTRACTION_BLOCKED'
  | 'SCREENSHOT_ATTEMPT_BLOCKED'
  | 'SUSPICIOUS_AUDIO_DETECTED'
  | 'CAMERA_DISCONNECTED'
  | 'EMERGENCY_LOCKDOWN';

export interface AuthorityProctorSession {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: string;
  org_id: string;
  workspace_type: string;
  exam_id?: string;
  exam_name?: string;
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

export interface AuthorityProctorEvent {
  id: string;
  session_id: string;
  user_id?: string;
  user_role?: string;
  exam_id?: string;
  event_type: AuthorityProctorEventType | string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  risk_points: number;
  timestamp: string;
  metadata?: any;
  snapshot_thumbnail?: string;
}

export interface AuthoritySurveillanceMetrics {
  total_active_sessions: number;
  high_risk_sessions: number;
  shoulder_surfing_alerts: number;
  locked_sessions: number;
}

export interface AuthoritySurveillanceData {
  metrics: AuthoritySurveillanceMetrics;
  sessions: AuthorityProctorSession[];
}

// =========================================================================
// DYNAMIC MULTI-PAPER GENERATOR TYPES
// =========================================================================

export interface MultiPaperSourcePaper {
  id: string;
  original_filename: string;
  subject: string;
  examination_category: string;
  processing_status: string;
  page_count: number;
  question_count: number;
  actualQuestionCount: number;
  verifiedQuestionCount: number;
  uploaded_at: string;
  breakdown: Array<{ subject: string; difficulty: string; count: number }>;
}

export interface SubjectRule {
  subject: string;
  count: number;
}

export interface DifficultyRatio {
  easy: number;
  medium: number;
  hard: number;
}

export interface PaperBlueprintConfig {
  name: string;
  totalQuestions: number;
  subjects: SubjectRule[];
  difficulty: DifficultyRatio;
  maxSourceContributionPercent: number;
  antiDuplication?: boolean;
}

export interface BlueprintValidationResult {
  feasible: boolean;
  errors: string[];
  stats: {
    availableCount: number;
    requiredCount: number;
    maxAllowedPerPaper: number;
    minRequiredPapers: number;
  };
}

export interface ShuffledOptionItem {
  id: string;
  text: string;
  label: string;
}

export interface GeneratedPaperQuestion {
  id: string;
  generated_paper_id: string;
  question_id: string;
  source_paper_id?: string;
  source_filename?: string;
  display_order: number;
  content_text: string;
  subject: string;
  topic: string;
  difficulty: string;
  diagram_url?: string;
  shuffledOptions: ShuffledOptionItem[];
  correct_option_id: string;
  displayed_correct_answer: string;
  marks: number;
  negative_marks: number;
}

export interface GeneratedPaper {
  id: string;
  org_id: string;
  blueprint_id?: string;
  title: string;
  exam_id?: string;
  version_code: string;
  total_questions: number;
  source_papers: string[];
  difficulty_breakdown: Record<string, number>;
  subject_breakdown: Record<string, number>;
  source_contribution: Record<string, { count: number; percent: number; filename?: string }>;
  paper_fingerprint: string;
  generation_seed: string;
  question_sequence_hash: string;
  option_permutation_hash: string;
  status: string;
  generated_by: string;
  generated_at: string;
}

export interface CandidateAssignmentItem {
  id: string;
  candidate_id: string;
  candidate_name?: string;
  candidate_roll_number?: string;
  candidate_group?: string;
  generated_paper_id: string;
  version_code?: string;
  paper_title?: string;
  paper_fingerprint: string;
  assigned_at: string;
}




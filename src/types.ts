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
  | 'REJECTED'
  | 'VERIFICATION_REQUIRED'
  | 'PENDING_VERIFICATION'
  | 'VERIFICATION_FAILED';

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
  device_fingerprint: string;
  device_name: string;
  browser_os: string;
  ip_address: string;
  status: 'TRUSTED' | 'PENDING_APPROVAL' | 'REVOKED';
  registered_at: string;
  last_seen_at: string;
  public_key?: string;
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
  options: string[] | null;
  selected?: boolean;
}

export interface PaperExtractionResponse {
  message: string;
  extractedQuestions: ExtractedQuestion[];
  totalExtracted: number;
  detectedSubject: string;
  extractionSummary: string;
  aiEngineUsed: boolean;
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

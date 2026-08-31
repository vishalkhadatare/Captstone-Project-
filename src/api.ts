import {
  User,
  Organization,
  OrganizationDocument,
  VerificationHistoryItem,
  TrustedDevice,
  Examination,
  Question,
  QuestionAssignment,
  PaperExtractionResponse,
  PaperVersion,
  PrintCopy,
  AuditEvent,
  SecurityEvent,
  NotificationItem,
  DynamicWatermarkData,
} from './types';

export const DEVICE_APPROVAL_EVENT = 'zeroleak:device-approval-needed';

function getStoredToken(): string | null {
  return localStorage.getItem('zeroleak_jwt_token');
}

export function setStoredAuth(token: string, user: User) {
  localStorage.setItem('zeroleak_jwt_token', token);
  localStorage.setItem('zeroleak_user', JSON.stringify(user));
}

export function getStoredUser(): User | null {
  const u = localStorage.getItem('zeroleak_user');
  if (!u) return null;
  try {
    return JSON.parse(u);
  } catch {
    return null;
  }
}

export function clearStoredAuth() {
  localStorage.removeItem('zeroleak_jwt_token');
  localStorage.removeItem('zeroleak_user');
}

const DEVICE_IDENTITY_DB = 'zeroleak-device-binding';
const DEVICE_IDENTITY_STORE = 'identities';
const DEVICE_IDENTITY_KEY = 'current';

export type BrowserDeviceIdentity = {
  deviceUuid: string;
  publicKeyPem: string;
  privateKey: CryptoKey;
};

function createDeviceUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function openDeviceIdentityDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window) || !window.isSecureContext) {
      reject(new Error('Secure persistent device-key storage is unavailable in this browser.'));
      return;
    }
    const request = indexedDB.open(DEVICE_IDENTITY_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DEVICE_IDENTITY_STORE)) {
        request.result.createObjectStore(DEVICE_IDENTITY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open secure device-key storage.'));
  });
}

async function readDeviceIdentity(): Promise<BrowserDeviceIdentity | null> {
  const db = await openDeviceIdentityDb();
  try {
    return await new Promise<BrowserDeviceIdentity | null>((resolve, reject) => {
      const request = db.transaction(DEVICE_IDENTITY_STORE, 'readonly').objectStore(DEVICE_IDENTITY_STORE).get(DEVICE_IDENTITY_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Unable to read device identity.'));
    });
  } finally {
    db.close();
  }
}

async function saveDeviceIdentity(identity: BrowserDeviceIdentity): Promise<void> {
  const db = await openDeviceIdentityDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(DEVICE_IDENTITY_STORE, 'readwrite');
      transaction.objectStore(DEVICE_IDENTITY_STORE).put(identity, DEVICE_IDENTITY_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Unable to save device identity.'));
      transaction.onabort = () => reject(transaction.error || new Error('Device identity storage was aborted.'));
    });
  } finally {
    db.close();
  }
}

function toPem(spki: ArrayBuffer): string {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(spki)));
  return `-----BEGIN PUBLIC KEY-----\n${base64.replace(/(.{64})/g, '$1\n').trim()}\n-----END PUBLIC KEY-----`;
}

/** Stores a non-exportable private key in IndexedDB; no private key material enters localStorage or the API. */
export async function getOrCreateBrowserDeviceIdentity(): Promise<BrowserDeviceIdentity> {
  const stored = await readDeviceIdentity();
  if (stored?.deviceUuid && stored?.publicKeyPem && stored?.privateKey) return stored;

  const generated = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair;
  const publicKeyPem = toPem(await crypto.subtle.exportKey('spki', generated.publicKey));
  const privateJwk = await crypto.subtle.exportKey('jwk', generated.privateKey);
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const identity = { deviceUuid: createDeviceUuid(), publicKeyPem, privateKey };
  await saveDeviceIdentity(identity);
  return identity;
}

// Generate or retrieve persistent browser hardware signature
export function getDeviceFingerprint(): string {
  let fp = localStorage.getItem('zeroleak_device_fp');
  if (!fp) {
    fp = 'HW-' + Math.random().toString(36).substring(2, 9).toUpperCase() + '-' + navigator.userAgent.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
    localStorage.setItem('zeroleak_device_fp', fp);
  }
  return fp;
}

export function detectDeviceProfile() {
  const ua = navigator.userAgent;
  const platform = navigator.platform || 'Web';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isWindows = /Windows/i.test(ua);
  const isMac = /Mac/i.test(ua);

  let osName = 'Web';
  if (isAndroid) osName = 'Android';
  else if (isIOS) osName = 'iOS';
  else if (isWindows) osName = 'Windows';
  else if (isMac) osName = 'macOS';

  let model = 'Web Browser';
  if (isAndroid) model = 'Android Device';
  else if (isIOS) model = 'iPhone / iPad';
  else if (isWindows) model = 'Windows Device';
  else if (isMac) model = 'Mac Device';

  return {
    device_model: model,
    operating_system: osName,
    os_version: /Android\s+(\d+(?:\.\d+)?)/i.exec(ua)?.[1] || /OS\s+(\d+_\d+)/i.exec(ua)?.[1]?.replace('_', '.') || 'Unknown',
    app_version: '1.0.5',
  };
}

export async function generateDeviceSigningKey(): Promise<{ publicKeyPem: string; privateKey: CryptoKey }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const publicKeySpki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(publicKeySpki))).replace(/(.{64})/g, '$1\n').trim()}\n-----END PUBLIC KEY-----`;

  return {
    publicKeyPem,
    privateKey: keyPair.privateKey,
  };
}

export async function signDeviceChallenge(challenge: string, privateKey: CryptoKey): Promise<string> {
  const challengeBytes = new TextEncoder().encode(challenge);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, challengeBytes);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-device-fingerprint': getDeviceFingerprint(),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      ...options,
      headers,
    });
  } catch (err: any) {
    throw new Error(`Network connection error: ${err.message || 'Unable to connect to server.'}`);
  }

  let data: any;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = { error: 'Invalid JSON response from server.' };
    }
  } else {
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}: ${res.statusText || 'Error processing request'}`);
    }
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Unexpected server response format.`);
    }
  }

  if (!res.ok) {
    const error = new Error(data.error || data.message || `Request failed with status ${res.status}`) as Error & { details?: any };
    error.details = data;

    if (data?.error === 'PENDING_DEVICE_APPROVAL' || data?.details?.error === 'PENDING_DEVICE_APPROVAL') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(DEVICE_APPROVAL_EVENT, { detail: data }));
      }
    }

    throw error;
  }

  return data;
}

export const api = {
  // Auth
  register: (payload: any) => request<{ message: string; token: string; user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload: any) => request<{ message: string; token?: string; user: User; device?: any; deviceWarning?: string; requiresDeviceBinding?: boolean; nextStep?: 'DEVICE_REGISTRATION' | 'DEVICE_CHALLENGE' | 'PENDING_APPROVAL'; challengeId?: string; challenge?: string; deviceUuid?: string; deviceStatus?: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ ...payload, device_fingerprint: getDeviceFingerprint() }) }),
  registerDeviceChallenge: (payload: any) => request<{ message: string; token?: string; user?: User; deviceUuid: string; status: string; requiresApproval: boolean; device?: any }>('/api/auth/device/register', { method: 'POST', body: JSON.stringify(payload) }),
  verifyDeviceChallenge: (payload: { challengeId: string; signature: string; deviceUuid: string }) => request<{ message: string; token: string; user: User; device: any }>('/api/auth/device/verify', { method: 'POST', body: JSON.stringify(payload) }),
  getMe: () => request<{ user: User }>('/api/auth/me'),

  // Organizations
  registerOrg: (payload: any) => request<{ message: string; orgId: string; verification: any }>('/api/organizations/register', { method: 'POST', body: JSON.stringify(payload) }),
  getCurrentOrg: () => request<{ organization: Organization | null; documents: OrganizationDocument[]; history: VerificationHistoryItem[]; representatives: any[] }>('/api/organizations/current'),
  uploadOrgDoc: (payload: any) => request<{ message: string; docId: string }>('/api/organizations/documents', { method: 'POST', body: JSON.stringify(payload) }),
  verifyOrg: (payload?: { name?: string; type?: string; reg_number?: string; organizationName?: string; organizationType?: string; registrationId?: string }) => request<{ message: string; verification: any; organization: Organization }>('/api/organizations/verify', { method: 'POST', body: JSON.stringify(payload || {}) }),
  verifyDomain: (domain: string, otp: string) => request<{ message: string }>('/api/organizations/verify-domain', { method: 'POST', body: JSON.stringify({ domain, otp }) }),
  transitionOrgStatus: (target_status: string, reason: string) => request<{ message: string; newStatus: string; ref: string }>('/api/organizations/transition-status', { method: 'POST', body: JSON.stringify({ target_status, reason }) }),
  authorizeManager: (payload: any) => request<{ message: string; userId: string; email: string; temporaryPassword?: string }>('/api/organizations/authorize-manager', { method: 'POST', body: JSON.stringify(payload) }),
  getAuthorizedUsers: () => request<{ users: User[] }>('/api/organizations/authorized-users'),
  getOrgMembers: () => request<{ members: User[] }>('/api/organizations/members'),
  revokeUser: (id: string) => request<{ message: string }>(`/api/organizations/users/${id}/revoke`, { method: 'POST' }),
  restoreUser: (id: string) => request<{ message: string }>(`/api/organizations/users/${id}/restore`, { method: 'POST' }),

  // Devices
  getDevices: () => request<{ devices: TrustedDevice[] }>('/api/devices'),
  getPendingDevices: () => request<{ devices: TrustedDevice[] }>('/api/devices/pending'),
  approveDevice: (id: string) => request<{ message: string; status: string }>(`/api/devices/${id}/approve`, { method: 'POST' }),
  rejectDevice: (id: string) => request<{ message: string; status: string }>(`/api/devices/${id}/reject`, { method: 'POST' }),
  disableDevice: (id: string) => request<{ message: string; status: string }>(`/api/devices/${id}/disable`, { method: 'POST' }),
  revokeDevice: (id: string) => request<{ message: string }>(`/api/devices/${id}/revoke`, { method: 'POST' }),
  reauthorizeDevice: (id: string) => request<{ message: string; status: string }>(`/api/devices/${id}/reauthorize`, { method: 'POST' }),
  getReplacementRequests: () => request<{ requests: any[] }>('/api/devices/replacement-requests'),
  approveReplacementRequest: (id: string) => request<{ message: string; status: string }>(`/api/devices/replacement-requests/${id}/approve`, { method: 'POST' }),
  rejectReplacementRequest: (id: string) => request<{ message: string; status: string }>(`/api/devices/replacement-requests/${id}/reject`, { method: 'POST' }),

  // Examinations
  getExaminations: () => request<{ examinations: Examination[] }>('/api/examinations'),
  createExamination: (payload: any) => request<{ message: string; examId: string }>('/api/examinations', { method: 'POST', body: JSON.stringify(payload) }),
  getExaminationDetails: (id: string) => request<{ examination: Examination; configuration: any; centres: any[]; versions: any[] }>(`/api/examinations/${id}`),
  addCentre: (examId: string, payload: any) => request<{ message: string; centreId: string }>(`/api/examinations/${examId}/centres`, { method: 'POST', body: JSON.stringify(payload) }),
  analyzeTheoryPattern: (examId: string, reference_text: string) => request<{ message: string; pattern: any }>(`/api/examinations/${examId}/analyze-pattern`, { method: 'POST', body: JSON.stringify({ reference_text }) }),
  confirmPattern: (examId: string, payload: any) => request<{ message: string }>(`/api/examinations/${examId}/confirm-pattern`, { method: 'POST', body: JSON.stringify(payload) }),

  // Questions & OCR/PDF Extraction & Assignments
  getQuestions: () => request<{ questions: Question[] }>('/api/questions'),
  createQuestion: (payload: any) => request<{ message: string; questionId: string }>('/api/questions', { method: 'POST', body: JSON.stringify(payload) }),
  extractQuestionsFromPaper: (payload: { paper_text?: string; file_name?: string; file_data?: string; subject?: string; category?: string }) =>
    request<PaperExtractionResponse>('/api/question-papers/extract', { method: 'POST', body: JSON.stringify(payload) }),
  bulkCreateQuestions: (payload: { questions: any[]; auto_assign_sme_id?: string; auto_assign_translator_id?: string; target_language?: string; assignment_notes?: string }) =>
    request<{ message: string; createdCount: number; questionIds: string[] }>('/api/questions/bulk-create', { method: 'POST', body: JSON.stringify(payload) }),
  bulkAssignQuestions: (payload: { question_ids: string[]; assignment_type: 'SME_REVIEW' | 'LINGUISTIC_TRANSLATION'; assignee_user_id: string; target_language?: string; notes?: string }) =>
    request<{ message: string; assignedCount: number }>('/api/questions/bulk-assign', { method: 'POST', body: JSON.stringify(payload) }),
  getAssignments: (params?: { assignment_type?: string; status?: string }) => {
    const search = new URLSearchParams();
    if (params?.assignment_type) search.set('assignment_type', params.assignment_type);
    if (params?.status) search.set('status', params.status);
    const qs = search.toString() ? `?${search.toString()}` : '';
    return request<{ assignments: QuestionAssignment[] }>(`/api/assignments${qs}`);
  },
  assignQuestion: (id: string, sme_user_id: string) => request<{ message: string }>('/api/questions/' + id + '/assign', { method: 'POST', body: JSON.stringify({ sme_user_id }) }),
  verifyQuestion: (id: string, payload: any) => request<{ message: string; newStatus: string }>(`/api/questions/${id}/verify`, { method: 'POST', body: JSON.stringify(payload) }),
  quarantineQuestion: (id: string, payload: any) => request<{ message: string; quarantineId: string }>(`/api/questions/${id}/quarantine`, { method: 'POST', body: JSON.stringify(payload) }),
  checkAiSimilarity: (candidate_text: string) => request<{ result: any }>('/api/questions/ai-similarity-check', { method: 'POST', body: JSON.stringify({ candidate_text }) }),

  // Multilingual Translation Workbench (Translator Role)
  getTranslations: (params?: { language?: string; status?: string; question_id?: string }) => {
    const search = new URLSearchParams();
    if (params?.language) search.set('language', params.language);
    if (params?.status) search.set('status', params.status);
    if (params?.question_id) search.set('question_id', params.question_id);
    const qs = search.toString() ? `?${search.toString()}` : '';
    return request<{ translations: any[] }>(`/api/translations${qs}`);
  },
  getPendingTranslations: () => request<{ questions: Question[] }>('/api/translations/pending'),
  saveTranslation: (payload: any) => request<{ message: string; translationId: string }>('/api/translations', { method: 'POST', body: JSON.stringify(payload) }),
  verifyTranslation: (id: string, payload: any) => request<{ message: string }>(`/api/translations/${id}/verify`, { method: 'POST', body: JSON.stringify(payload) }),
  aiTranslate: (payload: { content: string; options?: string[] | null; targetLanguage: string; subject?: string }) => request<{ result: { translatedContent: string; translatedOptions: string[] | null; targetLanguage: string; linguisticNotes: string; aiConfidence: number } }>('/api/translations/ai-translate', { method: 'POST', body: JSON.stringify(payload) }),

  // Paper Generation & Encryption
  generatePaper: (examId: string, payload?: { exam_mode?: string; subject_pool?: string[]; num_sets?: number }) =>
    request<{
      message: string;
      versionCode: string;
      paperVersionId: string;
      checksumSHA256: string;
      keyFingerprint: string;
      shamirSharesCreated: number;
      status: string;
      isUniversity3PaperFormat?: boolean;
      isNeetOrMultiSubjectMCQ?: boolean;
      generatedSets?: any[];
      subjectBreakdown?: any[];
    }>(`/api/examinations/${examId}/generate-paper`, {
      method: 'POST',
      body: payload ? JSON.stringify(payload) : undefined,
    }),
  getPaperVersions: (examId: string) => request<{ versions: PaperVersion[] }>(`/api/examinations/${examId}/paper-versions`),
  setActivePaperVersion: (examId: string, versionId: string) =>
    request<{ message: string; activeVersion: PaperVersion }>(`/api/examinations/${examId}/set-active-version`, {
      method: 'POST',
      body: JSON.stringify({ versionId }),
    }),
  emergencyRegenerate: (examId: string, payload: any) => request<{ message: string; invalidatedVersion?: string; quarantinedCount: number }>(`/api/examinations/${examId}/emergency-regenerate`, { method: 'POST', body: JSON.stringify(payload) }),

  // Secure Delivery & Printing
  getReleasedExams: () => request<{ examinations: Examination[] }>('/api/delivery/released-exams'),
  openSecureViewer: (exam_id: string) => request<{ message: string; paperContent: any; watermark: DynamicWatermarkData; paperVersionId: string }>('/api/delivery/open-viewer', { method: 'POST', body: JSON.stringify({ exam_id }) }),
  printAuthorizedCopy: (exam_id: string, paper_version_id: string, copies_count: number) => request<{ message: string; copies: Array<{ copyId: string; txHash: string; printedAt: string }> }>('/api/delivery/print-authorized-copy', { method: 'POST', body: JSON.stringify({ exam_id, paper_version_id, copies_count }) }),
  getPrintHistory: () => request<{ printHistory: PrintCopy[] }>('/api/delivery/print-history'),

  // Audit & Security
  getAuditEvents: () => request<{ events: AuditEvent[] }>('/api/audit/events'),
  getSecurityEvents: () => request<{ events: SecurityEvent[]; metrics: any }>('/api/security/events'),
  resolveSecurityEvent: (event_id: string) => request<{ message: string }>('/api/security/resolve-event', { method: 'POST', body: JSON.stringify({ event_id }) }),
  getNotifications: () => request<{ notifications: NotificationItem[] }>('/api/notifications'),
  markNotificationRead: (id: string) => request<{ message: string }>(`/api/notifications/${id}/read`, { method: 'POST' }),

  // Demo Seed & System Recovery
  seedAcademicDemo: () => request<{ message: string; accounts: any[]; examId?: string }>('/api/system/seed-academic-demo', { method: 'POST' }),
  resetDb: () => request<{ success: boolean; message: string }>('/api/system/reset-db', { method: 'POST' }),
};

/**
 * Utility function to detect if an error is a PENDING_DEVICE_APPROVAL error
 */
export function isPendingDeviceApprovalError(error: any): boolean {
  if (!error) return false;
  const errorCode = error?.details?.error || error?.message;
  return errorCode === 'PENDING_DEVICE_APPROVAL';
}

/**
 * Utility function to get a user-friendly error message for API errors
 */
export function getErrorMessage(error: any): string {
  if (!error) return 'An unknown error occurred.';

  const details = error?.details || {};
  const errorCode = details.error || error.message;

  if (errorCode === 'PENDING_DEVICE_APPROVAL') {
    return 'Your device is pending approval. Please contact your Organization Owner or Auditor to approve this device before you can proceed.';
  }

  if (details.message) {
    return details.message;
  }

  return error.message || 'An error occurred. Please try again.';
}

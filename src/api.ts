import {
  User,
  Organization,
  OrganizationDocument,
  VerificationHistoryItem,
  TrustedDevice,
  Examination,
  ExamBlueprint,
  Question,
  QuestionAssignment,
  PaperExtractionResponse,
  PaperVersion,
  PrintCopy,
  AuditEvent,
  SecurityEvent,
  NotificationItem,
  DynamicWatermarkData,
  AuthorityProctorSession,
  AuthorityProctorEvent,
  AuthoritySurveillanceMetrics,
  AicteUniversity,
  RegistrationVerificationResult,
  MultiPaperSourcePaper,
  PaperBlueprintConfig,
  BlueprintValidationResult,
  GeneratedPaper,
  GeneratedPaperQuestion,
  CandidateAssignmentItem,
  ExamSimulationStartResponse,
  ExaminationCentre,
  AddCentrePayload,
  AddCentreResponse,
  EmergencyRegeneratePayload,
  EmergencyRegenerateResponse,
  DraftPaper,
  UniversityDraftQuestion,
  IngestDraftPapersResponse,
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

/** Auth + device headers every API call needs. Shared by request() and the stream helper. */
function buildApiHeaders(extra?: HeadersInit): Record<string, string> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-device-fingerprint': getDeviceFingerprint(),
    ...(extra as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Stream a chat reply from the local Ollama model, calling `onDelta` for each token.
 *
 * This cannot go through request(): request() waits for a complete JSON body, and a
 * non-streaming Ollama call sends no headers at all until the entire reply is ready —
 * which on a CPU-only machine exceeds Node's 300s fetch header timeout and kills the
 * request. Streaming returns tokens as they are produced, so long replies survive and
 * the text appears progressively.
 */
export async function ollamaChatStream(
  payload: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    temperature?: number;
    plainText?: boolean;
  },
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
  /** Called when a provider died mid-stream: drop whatever has been shown so far. */
  onReset?: () => void
): Promise<string> {
  const res = await fetch('/api/ai/ollama-chat-stream', {
    method: 'POST',
    headers: buildApiHeaders(),
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      detail = data?.error || detail;
    } catch {
      /* non-JSON error body — keep the status text */
    }
    throw new Error(detail);
  }
  if (!res.body) throw new Error('The server returned no response stream.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let full = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });

      // SSE frames are newline-delimited; a chunk can split one, so buffer the tail.
      let newlineIndex: number;
      while ((newlineIndex = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newlineIndex).trim();
        pending = pending.slice(newlineIndex + 1);
        if (!line.startsWith('data:')) continue;

        const raw = line.slice(5).trim();
        if (!raw) continue;

        let event: any;
        try {
          event = JSON.parse(raw);
        } catch {
          continue;
        }
        if (event?.error) throw new Error(event.error);
        if (event?.reset) {
          // The provider that produced `full` is gone; its partial reply must not
          // be glued onto the next provider's output.
          full = '';
          onReset?.();
          continue;
        }
        if (event?.delta) {
          full += event.delta;
          onDelta(event.delta);
        }
        // `done` carries the authoritative full text; trust it over accumulated deltas
        // in case a frame was dropped.
        if (event?.done && typeof event.text === 'string' && event.text) full = event.text;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  return full;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = buildApiHeaders(options.headers);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      ...options,
      headers,
    });
  } catch (err: any) {
    throw new Error(`Unable to reach the server for ${endpoint}: ${err.message || 'check that localhost:3000 is running.'}`);
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

/**
 * What the compiler actually did, so a failed paper can be debugged from the UI
 * instead of from a vague one-liner.
 */
export interface CompileDiagnostics {
  engine: string;
  command: string;
  /** Absolute path of the LaTeX source written to disk before compiling. */
  sourcePath?: string;
  sourceLines?: number;
  sourceBytes?: number;
  attempts: Array<{ engine: string; command: string; ok: boolean; ms: number; error?: string }>;
  firstError?: string;
  firstErrorLine?: number;
  log?: string;
}

export const api = {
  // University Draft Papers Ingestion (3 PDFs Upload, pdf-parse & Tesseract OCR)
  uploadUniversityDraftPapers: async (files: File[], examId?: string) => {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('draft_papers', file);
    });
    if (examId) {
      formData.append('exam_id', examId);
    }
    const token = getStoredToken();
    const res = await fetch('/api/university/upload-drafts', {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || 'Failed to upload University draft papers');
    }
    return data as IngestDraftPapersResponse;
  },

  getUniversityDraftQuestions: (examId?: string) =>
    request<IngestDraftPapersResponse>(`/api/university/draft-questions${examId ? `?exam_id=${encodeURIComponent(examId)}` : ''}`),

  processUniversityRagPipeline: (examId?: string, targetMcqCount: number = 14, targetTotalMarks: number = 70) =>
    request<import('./types').UniversityRagPipelineResponse>('/api/university/rag-pipeline', {
      method: 'POST',
      body: JSON.stringify({
        exam_id: examId,
        target_mcq_count: targetMcqCount,
        target_total_marks: targetTotalMarks,
      }),
    }),

  generateUniversityFinalPaper: (examId?: string, setLetter: string = 'P') =>
    request<import('./types').UniversityFinalPaperResponse>('/api/university/generate-final-paper', {
      method: 'POST',
      body: JSON.stringify({
        exam_id: examId,
        set_letter: setLetter,
      }),
    }),

  getUniversityAuditLogs: (examId?: string) =>
    request<{ success: boolean; logs: import('./types').UniversityPaperAuditLogEntry[] }>(
      `/api/university/audit-logs${examId ? `?exam_id=${encodeURIComponent(examId)}` : ''}`
    ),

  downloadUniversityPaper: (paperId: string) =>
    request<{ success: boolean; pdfUrl: string; pdfFilename: string; pdfHash: string }>(
      `/api/university/download-paper/${encodeURIComponent(paperId)}`
    ),



  // Auth
  register: (payload: any) => request<{ message: string; token: string; user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  registerPersonnel: (payload: any) => request<{ message: string; token?: string; user?: User; requiresDeviceBinding?: boolean; nextStep?: string; challengeId?: string; challenge?: string; expiresAt?: string }>('/api/auth/register-personnel', { method: 'POST', body: JSON.stringify(payload) }),
  getPublicOrganizations: () => request<{ organizations: { id: string; name: string; type: string; reg_number: string }[] }>('/api/public/organizations'),
  getAicteUniversities: () => request<{ universities: AicteUniversity[] }>('/api/public/aicte-universities'),
  verifyWebsite: (url: string, emailDomain?: string) =>
    request<{
      verified: boolean;
      url: string;
      hostname: string;
      resolved_ip?: string;
      all_resolved_ips?: string[];
      is_https?: boolean;
      http_status?: number;
      domain_alignment?: 'MATCH' | 'MISMATCH' | 'PUBLIC_EMAIL' | 'NOT_CHECKED';
      domain_mismatch_warning?: string;
      security_score?: number;
      sha256_domain_hash?: string;
      message: string;
      error_code?: string;
    }>('/api/public/verify-website', {
      method: 'POST',
      body: JSON.stringify({ url, emailDomain }),
    }),
  login: (payload: any) => request<{ message: string; token?: string; user: User; device?: any; deviceWarning?: string; requiresDeviceBinding?: boolean; nextStep?: 'DEVICE_REGISTRATION' | 'DEVICE_CHALLENGE' | 'PENDING_APPROVAL'; challengeId?: string; challenge?: string; deviceUuid?: string; deviceStatus?: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ ...payload, device_fingerprint: getDeviceFingerprint() }) }),
  registerDeviceChallenge: (payload: any) => request<{ message: string; token?: string; user?: User; deviceUuid: string; status: string; requiresApproval: boolean; device?: any }>('/api/auth/device/register', { method: 'POST', body: JSON.stringify(payload) }),
  verifyDeviceChallenge: (payload: { challengeId: string; signature: string; deviceUuid: string }) => request<{ message: string; token: string; user: User; device: any }>('/api/auth/device/verify', { method: 'POST', body: JSON.stringify(payload) }),
  getMe: () => request<{ user: User }>('/api/auth/me'),

  // Two-stage public registration
  verifyOrganization: (payload: any) =>
    request<{ result: RegistrationVerificationResult; orgId: string; token: string | null; user: User | null }>(
      '/api/registration/verify-organization',
      { method: 'POST', body: JSON.stringify(payload) },
    ),
  deviceBindingChallenge: (payload: { public_key: string; device_name?: string }, bindingToken: string) =>
    request<{ challengeId: string; challenge: string }>(
      '/api/registration/device-binding/challenge',
      {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { Authorization: `Bearer ${bindingToken}` },
      },
    ),
  deviceBindingVerify: (payload: { challengeId: string; signature: string }, bindingToken: string) =>
    request<{ message: string; token: string; user: User; device: TrustedDevice }>(
      '/api/registration/device-binding/verify',
      {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { Authorization: `Bearer ${bindingToken}` },
      },
    ),

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
  deleteExamination: (id: string) => request<{ success: boolean; message: string }>(`/api/examinations/${id}`, { method: 'DELETE' }),
  purgeDemoExaminations: () => request<{ success: boolean; message: string }>('/api/examinations/purge-demo', { method: 'POST' }),
  deleteAllExaminations: () => request<{ success: boolean; message: string }>('/api/examinations', { method: 'DELETE' }),
  getExaminationDetails: (id: string) => request<{ examination: Examination; configuration: any; centres: ExaminationCentre[]; versions: any[] }>(`/api/examinations/${id}`),
  getBlueprints: () => request<{ blueprints: ExamBlueprint[] }>('/api/blueprints'),
  getBlueprint: (examId: string) => request<{ blueprint: ExamBlueprint | null; versions: ExamBlueprint[] }>(`/api/examinations/${examId}/blueprint`),
  saveBlueprint: (examId: string, blueprint: Partial<ExamBlueprint>, saveAsDraft = false) =>
    request<{ message: string; blueprint: ExamBlueprint }>(`/api/examinations/${examId}/blueprint`, {
      method: 'PUT',
      body: JSON.stringify({ blueprint, saveAsDraft }),
    }),
  deactivateBlueprint: (examId: string, versionId?: string) =>
    request<{ message: string }>(`/api/examinations/${examId}/blueprint`, {
      method: 'DELETE',
      body: JSON.stringify({ versionId }),
    }),
  addCentre: (examId: string, payload: AddCentrePayload) => request<AddCentreResponse>(`/api/examinations/${examId}/centres`, { method: 'POST', body: JSON.stringify(payload) }),
  getCentresForExam: (examId: string) => request<{ centres: ExaminationCentre[]; managerAuthorized: number }>(`/api/examinations/${examId}/centres`),
  getAllCentres: () => request<{ centres: ExaminationCentre[] }>('/api/centres'),
  analyzeTheoryPattern: (examId: string, reference_text: string) => request<{ message: string; pattern: any }>(`/api/examinations/${examId}/analyze-pattern`, { method: 'POST', body: JSON.stringify({ reference_text }) }),
  confirmPattern: (examId: string, payload: any) => request<{ message: string }>(`/api/examinations/${examId}/confirm-pattern`, { method: 'POST', body: JSON.stringify(payload) }),

  // Questions & OCR/PDF Extraction & Assignments
  getQuestions: () => request<{ questions: Question[] }>('/api/questions'),
  createQuestion: (payload: any) => request<{ message: string; questionId: string }>('/api/questions', { method: 'POST', body: JSON.stringify(payload) }),
  runNaviDcOcr: (payload: { image_data?: string; image_path?: string; mode?: 'markdown' | 'mcq' | 'table'; prompt?: string }) =>
    request<{
      success: boolean;
      markdown?: string;
      questions?: Array<{
        question_number: string;
        content_text: string;
        options: Array<{ id: string; text: string }> | null;
        correct_answer: string;
        has_latex: boolean;
        has_table: boolean;
        marks: number;
      }>;
      execution_time_ms?: number;
      device?: string;
      model?: string;
      error?: string;
    }>('/api/ocr/navidc', { method: 'POST', body: JSON.stringify(payload) }),
  runOcrSpace: (payload: { image_data?: string; image_url?: string; engine?: '1' | '2' | '3'; isTable?: boolean; scale?: boolean; detectOrientation?: boolean; language?: string }) =>
    request<{
      success: boolean;
      text: string;
      engine: string;
      parsedResults?: any[];
      raw?: any;
      error?: string;
    }>('/api/ocr/ocrspace', { method: 'POST', body: JSON.stringify(payload) }),
  extractPdfText: (payload: { file_data?: string; file_name?: string; raw_text?: string }) =>
    request<{
      success: boolean;
      text: string;
      pageCount: number;
      fileName: string;
      charCount: number;
      wordCount: number;
      info?: any;
    }>('/api/pdf/extract-text', { method: 'POST', body: JSON.stringify(payload) }),
  extractPdfFigures: (payload: { file_data?: string; file_name?: string; max_figures?: number }) =>
    request<{
      success: boolean;
      figures: Array<{
        index: number;
        name: string;
        url: string;
        page: number;
        kind: 'raster' | 'vector-region';
        width: number;
        height: number;
        /** The crop's own bytes, so reuse never depends on a second request. */
        base64: string;
      }>;
      warnings: string[];
      error?: string;
    }>('/api/papers/extract-figures', { method: 'POST', body: JSON.stringify(payload) }),
  groqChat: (payload: { messages: Array<{ role: string; content: string }>; model?: string; temperature?: number; max_tokens?: number }) =>
    request<{ success: boolean; message: { content: string }; text: string }>('/api/ai/groq-chat', { method: 'POST', body: JSON.stringify(payload) }),
  ollamaChat: (payload: { messages: Array<{ role: string; content: string }>; model?: string; temperature?: number; plainText?: boolean }) =>
    request<{ success: boolean; message: { content: string }; text: string }>('/api/ai/ollama-chat', { method: 'POST', body: JSON.stringify(payload) }),
  getOllamaModels: () =>
    request<{ connected: boolean; models: Array<{ name: string; model: string; size?: number }> }>('/api/ai/ollama-models'),
  extractQuestionsFromPaper: (payload: { paper_text?: string; file_name?: string; file_data?: string; subject?: string; category?: string; job_id?: string; exam_id?: string }) =>
    request<PaperExtractionResponse>('/api/question-papers/extract', { method: 'POST', body: JSON.stringify(payload) }),
  getUploadedQuestionPapers: (examId?: string) => {
    const qs = examId ? `?exam_id=${encodeURIComponent(examId)}` : '';
    return request<{ success: boolean; papers: any[] }>(`/api/question-papers${qs}`);
  },
  syncCloudinaryQuestionPapers: (exam_id?: string) =>
    request<{ success: boolean; importedCount: number; totalAssetsInCloudinary: number; papers: any[] }>('/api/question-papers/sync-cloudinary', {
      method: 'POST',
      body: JSON.stringify({ exam_id }),
    }),
  deleteQuestionPaper: (paperId: string) =>
    request<{ success: boolean; message: string }>(`/api/question-papers/${paperId}`, { method: 'DELETE' }),
  bulkDeleteQuestionPapers: (paperIds: string[]) =>
    request<{ success: boolean; message: string }>('/api/question-papers/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids: paperIds }),
    }),
  purgeAllQuestionPapers: () =>
    request<{ success: boolean; message: string }>('/api/question-papers/purge-all', {
      method: 'POST',
    }),
  extractThreeStandardPapers: () =>
    request<{ message: string; extractedQuestions: any[]; papers: any[]; totalExtracted: number }>('/api/question-papers/extract-three-standard-papers', { method: 'POST' }),
  getExtractionProgress: (jobId: string) =>
    request<{ jobId: string; status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'; percent: number; stage: string; message: string; current: number; total: number; updatedAt: number }>(`/api/question-papers/extract-progress/${jobId}`),
  getCloudinaryHealth: () => request<{ connected: boolean; cloud_name?: string; assets_count?: number; error?: string }>('/api/question-papers/cloudinary-health'),
  getOllamaHealth: () => request<{ connected: boolean; model: string; error?: string }>('/api/question-papers/ollama-health'),
  getFormatexHealth: () => request<{ connected: boolean; engine?: string; error?: string }>('/api/formatex/health'),
  getLatexOnlineHealth: () => request<{ connected: boolean; service?: string; engine?: string; error?: string }>('/api/latex-online/health'),
  getLatexServiceHealth: () => request<{ connected: boolean; service?: string; url?: string; compilers?: string[]; error?: string }>('/api/latex-service/health'),
  getTexApiHealth: () => request<{ connected: boolean; service?: string; url?: string; error?: string }>('/api/texapi/health'),
  getTexliveNetHealth: () => request<{ connected: boolean; service?: string; engine?: string; url?: string; error?: string }>('/api/texlive/health'),
  getLatexToolStatus: () => request<{
    editors: { total: number; ids: string[] };
    engines: Array<{ engine: string; name: string; connected: boolean; error?: string }>;
    enginesOnline: number;
    localAi: { provider: 'ollama'; reachable: boolean; model: string; error?: string };
    freeCloudAiConfigured: Array<{ id: string; label: string; freeTier: string }>;
    fullyFreePathAvailable: boolean;
    notes: string[];
  }>('/api/latex-tools/status'),
  getLatexToolCatalogue: () => request<{
    editors: Array<{
      id: string;
      name: string;
      kind: string;
      homepage: string;
      repo?: string;
      license: string;
      ai: string;
      aiEndpoint?: string;
      freeBasis: string;
      evidence: string;
      caveat?: string;
    }>;
    engines: Array<{ engine: string; name: string; url: string; license: string; freeBasis: string; evidence: string }>;
    excluded: Array<{ id: string; name: string; homepage: string; reason: string }>;
    webTools: Array<{
      id: string;
      name: string;
      kind: 'cloud-editor' | 'model-demo';
      url: string;
      model: string;
      ai: string;
      keylessBasis: string;
      evidence: string;
      embed: 'verified' | 'blocked';
      embedEvidence: string;
      caveat?: string;
    }>;
  }>('/api/latex-tools/catalogue'),
  /**
   * Everything the embedded browser needs, owned by the backend: navigation
   * policy, bookmarks and the live tool status. Readable without a token so the
   * panel works on the paper page before sign-in.
   */
  getBrowserConfig: () =>
    request<{
      generatedAt: string;
      policy: {
        searchTemplate: string;
        searchHost: string;
        searchEmbeds: boolean;
        newTabUrl: string;
        homeUrl: string;
        maxTabs: number;
        allowedSchemes: string[];
        refusedSchemes: Array<{ scheme: string; reason: string }>;
        framePolicy: Array<{ host: string; embeddable: boolean; evidence: string }>;
      };
      bookmarks: Array<{
        id: string;
        name: string;
        url: string;
        icon: string;
        group: 'core' | 'ai';
        model?: string;
        keylessBasis?: string;
        badge?: string;
        embedBlocked?: boolean;
        status?: 'ok' | 'asleep' | 'down' | 'unknown';
        liveNote?: string;
      }>;
      toolStatus: Array<{
        id: string;
        url: string;
        reachable: boolean;
        status?: number;
        embeddable: boolean;
        embedReason: string;
        interactive: boolean;
        sleeping: boolean;
        ms: number;
        error?: string;
      }>;
      usableToolsNow: number;
      notes: string[];
    }>('/api/browser/config'),
  getAiLatexWebTools: () =>
    request<{
      probedAt: string;
      usableNow: number;
      tools: Array<{
        id: string;
        url: string;
        reachable: boolean;
        status?: number;
        embeddable: boolean;
        embedReason: string;
        interactive: boolean;
        sleeping: boolean;
        ms: number;
        error?: string;
      }>;
    }>('/api/latex-tools/web-tools'),
  runLatexToolSelfTest: () =>
    request<{
      ok: boolean;
      ranAt: string;
      items: Array<{
        kind: 'engine' | 'ai';
        id: string;
        label: string;
        ok: boolean;
        ms: number;
        detail: string;
        error?: string;
      }>;
      enginesWorking: number;
      enginesTested: number;
      aiWorking: number;
      aiTested: number;
      endToEnd: {
        ok: boolean;
        provider?: string;
        engine?: string;
        pdfBytes?: number;
        latex?: string;
        ms: number;
        error?: string;
      };
    }>('/api/latex-tools/selftest', { method: 'POST' }),
  compileUniversalLatex: (payload: { latex: string; title?: string; preferEngine?: 'clsi' | 'texapi' | 'latexonline' | 'texlive' | 'formatex' | 'auto' }) =>
    request<{ success: boolean; pdfUrl: string; filename: string; sizeBytes: number; checksumSha256: string; compilerService?: string; error?: string }>('/api/latex/compile-universal', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  compileValidatedLatex: (payload: {
    latex?: string;
    structuredData?: any;
    paperText?: string;
    subject?: string;
    universityName?: string;
    paperCode?: string;
    totalMarks?: number;
    durationHours?: number;
    /** Set letter printed on the source paper, e.g. "P" or "4". */
    setLetter?: string;
    /** Figures cropped from the source paper, shipped to the compiler as files. */
    resources?: Array<{ path: string; content: string; encoding?: 'utf8' | 'base64' }>;
    /** Published figure crops the paper references, read back by the server. */
    sourceFigureUrls?: string[];
    preferEngine?: 'clsi' | 'texapi' | 'latexonline' | 'texlive' | 'formatex' | 'auto';
  }, requestOptions: { signal?: AbortSignal } = {}) =>
    request<{
      success: boolean;
      pdfUrl: string;
      filename: string;
      sizeBytes: number;
      checksumSha256: string;
      /** Things that went wrong without stopping the paper, e.g. figures dropped. */
      warnings?: string[];
      latex?: string;
      passCount?: number;
      compilerService?: string;
      /** How long the server spent typesetting, in milliseconds. */
      elapsedMs?: number;
      /** Which engines ran, the source that was compiled, and the first real error. */
      diagnostics?: CompileDiagnostics;
      passDiagnostics?: CompileDiagnostics[];
      /**
       * The dedicated LaTeX engine's attempt. Present on success when it rescued
       * the paper, and on failure so the last resort's own error is visible.
       */
      latexFallback?: {
        engine?: string;
        code?: string;
        exitCode?: number | null;
        error?: string;
        log?: string;
        texPath?: string;
        logPath?: string;
        /** Endpoint that serves the .tex this paper was built from. */
        sourceUrl?: string;
        source?: string;
      };
      error?: string;
    }>('/api/paper-synthesizer/compile-validated-latex', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: requestOptions.signal,
    }),
  generateSynthesizedPdf: (payload: {
    paperText?: string;
    structuredData?: any;
    subject?: string;
    universityName?: string;
    paperCode?: string;
    totalMarks?: number;
    durationHours?: number;
  }) =>
    request<{
      success: boolean;
      pdfUrl: string;
      filename: string;
      sizeBytes: number;
      checksumSha256: string;
      engine?: string;
      structuredData?: any;
      error?: string;
    }>('/api/paper-synthesizer/generate-pdfkit-pdf', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  compileFormatexPdf: (examId: string, payload?: { setLetter?: string; customLatex?: string; preferEngine?: 'clsi' | 'texapi' | 'latexonline' | 'texlive' | 'formatex' | 'auto' }) =>
    request<{ success: boolean; pdfUrl: string; latex: string; sizeBytes: number; checksumSha256: string; compilerService?: string; error?: string }>(`/api/examinations/${examId}/compile-formatex-pdf`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  getFormatexLatex: (examId: string, setLetter?: string) =>
    request<{ success: boolean; latex: string; setLetter: string; error?: string }>(`/api/examinations/${examId}/formatex-latex?setLetter=${setLetter || 'P'}`),
  bulkCreateQuestions: (payload: { questions: any[]; auto_assign_sme_id?: string; auto_assign_translator_id?: string; target_language?: string; assignment_notes?: string; initial_status?: string }) =>
    request<{ message: string; createdCount: number; questionIds: string[] }>('/api/questions/bulk-create', { method: 'POST', body: JSON.stringify(payload) }),
  bulkVerifyQuestions: (payload: { question_ids: string[]; status?: string }) =>
    request<{ message: string; updatedCount: number }>('/api/questions/bulk-verify', { method: 'POST', body: JSON.stringify(payload) }),
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

  // Question Boundary Editor & Visual Crop Pipeline
  getPaperPages: (paperId: string) =>
    request<{ pages: Array<{ id: string; paper_id: string; page_number: number; image_url: string; width: number; height: number; dpi: number; disk_path?: string }> }>(`/api/papers/${paperId}/pages`),
  getPaperQuestionsForReview: (paperId: string) =>
    request<{
      paper: any;
      questions: any[];
      stats: {
        total: number;
        autoExtracted: number;
        needsReview: number;
        manuallyCorrected: number;
        completed: number;
        skipped: number;
      };
    }>(`/api/papers/${paperId}/questions-review`),
  cropQuestionBoundary: (payload: { questionId: string; pageNumber: number; x1: number; y1: number; x2: number; y2: number }) =>
    request<{ success: boolean; questionId: string; imageUrl: string; crop_coordinates: any; extraction_status: string }>('/api/questions/crop-boundary', { method: 'POST', body: JSON.stringify(payload) }),
  splitQuestionBoundary: (payload: { questionId: string; splitY: number }) =>
    request<{ success: boolean; message: string; originalQuestion: any; newQuestion: any }>('/api/questions/split', { method: 'POST', body: JSON.stringify(payload) }),
  mergeNextQuestionBoundary: (payload: { questionId: string; expandPixels?: number }) =>
    request<{ success: boolean; imageUrl: string; crop_coordinates: any }>('/api/questions/merge-next', { method: 'POST', body: JSON.stringify(payload) }),
  bulkFinalizeQuestions: (payload: { paperId?: string; questionIds?: string[] }) =>
    request<{ success: boolean; message: string }>('/api/questions/bulk-finalize', { method: 'POST', body: JSON.stringify(payload) }),
  updateQuestionReview: (payload: { questionId: string; content_text?: string; options?: any[]; correct_answer?: string; marks?: number; extraction_status?: string; options_status?: string }) =>
    request<{ success: boolean; message: string }>('/api/questions/update-review', { method: 'POST', body: JSON.stringify(payload) }),

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
  generatePaper: (examId: string, payload?: { exam_mode?: string; subject_pool?: string[]; num_sets?: number; selected_paper_ids?: string[] }) =>
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
  getPaperVersionDetails: (examId: string, versionId: string) =>
    request<{
      success: boolean;
      version: PaperVersion & { iv_hex?: string; auth_tag_hex?: string; checksum_sha256?: string; key_fingerprint?: string };
      questions: Array<{
        paper_question_id: string;
        section_name: string;
        order_index: number;
        question_marks: number;
        id: string;
        content_text: string;
        options_json?: string;
        options?: any[];
        correct_answer?: string;
        difficulty?: string;
        subject?: string;
        topic?: string;
        diagram_url?: string;
        image_url?: string;
        question_type?: string;
      }>;
      exam?: Examination;
      shamirDetails: {
        threshold: number;
        totalShares: number;
        status: string;
      };
    }>(`/api/examinations/${examId}/paper-versions/${versionId}/details`),
  getCurrentPaper: (examId: string) =>
    request<{
      success: boolean;
      version: PaperVersion & { iv_hex?: string; auth_tag_hex?: string; checksum_sha256?: string; key_fingerprint?: string };
      questions: Array<{
        paper_question_id: string;
        section_name: string;
        order_index: number;
        question_marks: number;
        id: string;
        content_text: string;
        options_json?: string;
        options?: any[];
        correct_answer?: string;
        difficulty?: string;
        subject?: string;
        topic?: string;
        diagram_url?: string;
        image_url?: string;
        question_type?: string;
      }>;
      allVersions?: Array<{ id: string; version_code: string; is_current: number; status: string; generated_at: string }>;
      exam: Examination;
    }>(`/api/examinations/${examId}/current-paper`),
  setActivePaperVersion: (examId: string, versionId: string) =>
    request<{ message: string; activeVersion: PaperVersion }>(`/api/examinations/${examId}/set-active-version`, {
      method: 'POST',
      body: JSON.stringify({ versionId }),
    }),
  emergencyRegenerate: (examId: string, payload: EmergencyRegeneratePayload) => request<EmergencyRegenerateResponse>(`/api/examinations/${examId}/emergency-regenerate`, { method: 'POST', body: JSON.stringify(payload) }),
  
  // Exam Simulation (Manager strictly one-time proctored preview)
  startExamSimulation: (examId: string, payload?: any) =>
    request<ExamSimulationStartResponse>(`/api/examinations/${examId}/simulate/start`, {
      method: 'POST',
      body: payload ? JSON.stringify(payload) : undefined,
    }),
  logSimulationEvent: (examId: string, payload: { sessionToken: string; eventType: string; details?: any }) =>
    request<{ success: boolean; recordedEvent?: any }>(`/api/examinations/${examId}/simulate/event`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  completeExamSimulation: (examId: string, payload: { sessionToken?: string; reason?: string }) =>
    request<{ message: string; simulation_status: string; completedAt: string }>(`/api/examinations/${examId}/simulate/complete`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

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

  // Proctor Mode & Anti-Cheat APIs
  proctor: {
    getExams: () => request<{ exams: any[] }>('/api/proctor/exams'),
    startAttempt: (payload: {
      exam_id: string;
      student_id: string;
      student_name: string;
      student_email?: string;
      verification_snapshot?: string;
    }) =>
      request<{
        success: boolean;
        attempt_id: string;
        session_id: string;
        exam: any;
        student: any;
        questions: any[];
      }>('/api/proctor/attempts/start', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    recordEvent: (payload: {
      attempt_id: string;
      exam_id?: string;
      student_id?: string;
      event_type: string;
      severity?: string;
      metadata?: any;
      hardware_status?: any;
    }) =>
      request<{
        success: boolean;
        eventId: string;
        risk_score: number;
        risk_level: string;
        warning_count: number;
        max_warnings: number;
        warnings_left: number;
      }>('/api/proctor/events', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    sendHeartbeat: (payload: {
      attempt_id: string;
      camera_status?: string;
      microphone_status?: string;
      fullscreen_status?: string;
      face_status?: string;
      faces_detected_count?: number;
    }) =>
      request<{ success: boolean }>('/api/proctor/sessions/heartbeat', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    submitAttempt: (attemptId: string, payload: { answers: Record<string, string> }) =>
      request<{
        success: boolean;
        message: string;
        attempt_id: string;
        score: number;
        answered_questions: number;
        total_questions: number;
        status: string;
        risk_score: number;
        risk_level: string;
      }>(`/api/proctor/attempts/${attemptId}/submit`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getDashboard: (params?: { exam_id?: string; status?: string; risk_level?: string }) => {
      const q = new URLSearchParams();
      if (params?.exam_id) q.set('exam_id', params.exam_id);
      if (params?.status) q.set('status', params.status);
      if (params?.risk_level) q.set('risk_level', params.risk_level);
      return request<{
        success: boolean;
        metrics: {
          total_attempts: number;
          active_sessions: number;
          flagged_sessions: number;
          critical_sessions: number;
          avg_risk_score: number;
        };
        attempts: any[];
        exams: any[];
      }>(`/api/proctor/dashboard?${q.toString()}`);
    },
    getAttemptReview: (attemptId: string) =>
      request<{
        success: boolean;
        attempt: any;
        events: any[];
      }>(`/api/proctor/attempts/${attemptId}/review`),
    recordDecision: (attemptId: string, payload: { decision: string; remarks?: string }) =>
      request<{ success: boolean; message: string }>(`/api/proctor/attempts/${attemptId}/decision`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getSettings: () => request<{ success: boolean; settings: any }>('/api/proctor/settings'),
    updateSettings: (payload: any) =>
      request<{ success: boolean; settings: any }>('/api/proctor/settings', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  // Authority Proctor Enclave & Leak Avoidance
  authorityProctor: {
    startSession: (payload: { workspace_type: string; exam_id?: string; verification_snapshot?: string }) =>
      request<{ success: boolean; session: AuthorityProctorSession }>('/api/authority-proctor/sessions/start', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    recordEvent: (payload: {
      session_id: string;
      event_type: string;
      severity?: string;
      metadata?: any;
      snapshot_thumbnail?: string;
    }) =>
      request<{ success: boolean; eventId: string; leak_risk_score: number; leak_risk_level: string }>('/api/authority-proctor/events', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    sendHeartbeat: (payload: {
      session_id: string;
      camera_status?: string;
      microphone_status?: string;
      fullscreen_status?: string;
      face_status?: string;
      faces_detected_count?: number;
      audio_level_db?: number;
    }) =>
      request<{ success: boolean; status: string; emergency_locked: boolean; emergency_lock_reason?: string | null }>('/api/authority-proctor/heartbeat', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    endSession: (sessionId: string) =>
      request<{ success: boolean }>('/api/authority-proctor/sessions/end', {
        method: 'POST',
        body: JSON.stringify({ session_id: sessionId }),
      }),
    getSurveillanceDashboard: () =>
      request<{ success: boolean; metrics: AuthoritySurveillanceMetrics; sessions: AuthorityProctorSession[] }>('/api/authority-proctor/dashboard'),
    getSessionReview: (sessionId: string) =>
      request<{ success: boolean; session: AuthorityProctorSession; events: AuthorityProctorEvent[] }>(`/api/authority-proctor/sessions/${sessionId}/review`),
    emergencyLockSession: (sessionId: string, reason: string) =>
      request<{ success: boolean; message: string }>(`/api/authority-proctor/sessions/${sessionId}/emergency-lock`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
  },
  multiPaper: {
    getSourcePapers: (examId?: string) =>
      request<{ success: boolean; papers: MultiPaperSourcePaper[] }>(
        `/api/multi-paper/source-papers${examId ? `?examId=${encodeURIComponent(examId)}` : ''}`
      ),
    validateBlueprint: (blueprint: PaperBlueprintConfig, sourcePaperIds?: string[]) =>
      request<{ success: boolean; validation: BlueprintValidationResult }>('/api/multi-paper/validate-blueprint', {
        method: 'POST',
        body: JSON.stringify({ blueprint, source_paper_ids: sourcePaperIds }),
      }),
    generate: (payload: {
      exam_id?: string;
      title: string;
      blueprint: PaperBlueprintConfig;
      versions: string[];
      source_paper_ids?: string[];
    }) =>
      request<{ success: boolean; message: string; papers: GeneratedPaper[] }>('/api/multi-paper/generate', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    /**
     * Pattern-faithful composition: keeps the uploaded papers' main questions
     * and recombines their sub-questions, then emits and compiles LaTeX.
     */
    composePatternPaper: (payload: {
      exam_id?: string;
      set_letter?: string;
      source_paper_ids: string[];
      pattern?: Array<Record<string, unknown>>;
      max_source_contribution_percent?: number;
      compile?: boolean;
    }) =>
      request<{
        success: boolean;
        message: string;
        setLetter: string;
        totalMarks: number;
        /** Marks the source pattern actually asks for, versus `totalMarks` filled. */
        expectedMarks: number;
        coveragePercent: number;
        shortFrames: string[];
        sourceBreakdown: Record<string, number>;
        frames: Array<{
          questionNumber: string;
          instruction: string;
          type: string;
          subQuestionCount: number;
          attemptCount: number;
          marksPerSubQuestion: number;
          subQuestions: Array<{ label: string; id: string; content: string; marks: number }>;
        }>;
        figures: Array<{ questionId: string; name: string; source: string }>;
        latex: string;
        compiledBy?: string;
        pdfUrl?: string;
        filename?: string;
        pdfHash?: string;
        warnings: string[];
      }>('/api/multi-paper/compose-pattern-paper', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getGeneratedPapers: (examId?: string) =>
      request<{ success: boolean; papers: GeneratedPaper[] }>(
        `/api/multi-paper/generated${examId ? `?examId=${encodeURIComponent(examId)}` : ''}`
      ),
    getGeneratedPaperDetails: (paperId: string) =>
      request<{ success: boolean; paper: GeneratedPaper; questions: GeneratedPaperQuestion[] }>(
        `/api/multi-paper/generated/${paperId}`
      ),
    assignCandidates: (payload: {
      generated_paper_id: string;
      candidates: { roll_number: string; candidate_name?: string; email?: string; center_code?: string; seat_number?: string }[];
    }) =>
      request<{ success: boolean; assigned_count: number; message: string }>('/api/multi-paper/assign-candidates', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getAssignments: (paperId: string) =>
      request<{ success: boolean; assignments: CandidateAssignmentItem[] }>(
        `/api/multi-paper/assignments?paperId=${encodeURIComponent(paperId)}`
      ),
    traceLeak: (payload: { fingerprint?: string; question_id?: string; candidate_roll?: string }) =>
      request<{
        success: boolean;
        matched_paper?: GeneratedPaper | null;
        matched_assignments?: CandidateAssignmentItem[];
        matched_questions?: GeneratedPaperQuestion[];
      }>('/api/multi-paper/trace-leak', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },
};

/**
 * Executes a full sign-in sequence including ECDSA device challenge signature / enrollment.
 */
export async function performFullLogin(identifier: string, password: string): Promise<{ user: User; token: string }> {
  const identity = await getOrCreateBrowserDeviceIdentity();
  const res = await api.login({
    identifier: identifier.trim(),
    password,
    device_name: 'Authorized Institution Terminal',
    device_uuid: identity.deviceUuid,
  });

  if (res.token && res.user) {
    setStoredAuth(res.token, res.user);
    return { user: res.user, token: res.token };
  }

  if (res.requiresDeviceBinding && res.nextStep === 'DEVICE_CHALLENGE' && res.challenge && res.challengeId) {
    const signature = await signDeviceChallenge(res.challenge, identity.privateKey);
    const verified = await api.verifyDeviceChallenge({
      challengeId: res.challengeId,
      signature,
      deviceUuid: identity.deviceUuid,
    });
    setStoredAuth(verified.token, verified.user);
    return { user: verified.user, token: verified.token };
  }

  if (res.requiresDeviceBinding && res.nextStep === 'DEVICE_REGISTRATION' && res.challenge && res.challengeId) {
    const signature = await signDeviceChallenge(res.challenge, identity.privateKey);
    const profile = detectDeviceProfile();
    const deviceResponse = await api.registerDeviceChallenge({
      challengeId: res.challengeId,
      signature,
      publicKey: identity.publicKeyPem,
      deviceUuid: identity.deviceUuid,
      device_name: 'Authorized Institution Terminal',
      device_model: profile.device_model,
      operating_system: profile.operating_system,
      os_version: profile.os_version,
      app_version: profile.app_version,
      attestation_status: 'UNAVAILABLE',
    });

    if (deviceResponse.token && deviceResponse.user) {
      setStoredAuth(deviceResponse.token, deviceResponse.user);
      return { user: deviceResponse.user, token: deviceResponse.token };
    }
  }

  throw new Error(res.message || 'Authentication failed. Please verify credentials.');
}

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

/** A frame pushed by `/api/browser/stream`. */
export interface BrowserStatusFrame {
  type: 'browser-status' | 'error';
  at?: string;
  /** The assembled bookmarks, statuses already decided by the backend. */
  bookmarks?: Array<{
    id: string;
    name: string;
    url: string;
    icon: string;
    group: 'core' | 'ai';
    model?: string;
    keylessBasis?: string;
    badge?: string;
    embedBlocked?: boolean;
    status?: 'ok' | 'asleep' | 'down' | 'unknown';
    liveNote?: string;
  }>;
  tools?: Array<{
    id: string;
    url: string;
    reachable: boolean;
    status?: number;
    embeddable: boolean;
    embedReason: string;
    interactive: boolean;
    sleeping: boolean;
    ms: number;
    error?: string;
  }>;
  usableNow?: number;
  notes?: string[];
  error?: string;
}

/**
 * Subscribe to live tool status from the backend.
 *
 * Server-Sent Events rather than polling, and rather than a WebSocket: the push
 * is one-way, `EventSource` reconnects on its own after a server restart, and it
 * is already how this server streams. Returns an unsubscribe function, so a
 * caller that unmounts cannot leave a retrying connection behind.
 */
export function subscribeBrowserStatus(onFrame: (frame: BrowserStatusFrame) => void): () => void {
  if (typeof EventSource === 'undefined') return () => undefined;

  let source: EventSource | null = null;
  try {
    source = new EventSource('/api/browser/stream');
  } catch {
    return () => undefined;
  }

  source.onmessage = (event) => {
    try {
      onFrame(JSON.parse(event.data) as BrowserStatusFrame);
    } catch {
      // A malformed frame is not worth tearing the stream down for.
    }
  };

  return () => {
    try {
      source?.close();
    } catch {
      // already closed
    }
    source = null;
  };
}

// ---------------------------------------------------------------------------
// The streamed browser: a real Chromium, which is what browser mode needs
// ---------------------------------------------------------------------------
//
// An `<iframe>` can never host a sign-in (see the note in server.ts: the
// providers answer with `frame-ancestors 'self'` / `X-Frame-Options: DENY`, and
// Chrome partitions the cookies a login would need). So browser mode asks the
// server for a real browser instead, and draws its frames here.

export type StreamedBrowserState = 'stopped' | 'starting' | 'ready' | 'error';

export interface StreamedBrowserStatus {
  state: StreamedBrowserState;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  viewport: { width: number; height: number };
  frameSeq: number;
  lastFrameAt: number | null;
  lastReportAt: number | null;
  viewers: number;
  updatedAt: number;
  error: string | null;
  /** Plain-language availability, decided by the server. */
  reason: string;
  /** A short line from the browser itself - where a download was saved. */
  notice: string | null;
}

export interface StreamedBrowserFrame {
  seq: number;
  at: number;
  mime: 'image/jpeg';
  base64: string;
  width: number;
  height: number;
  bytes: number;
}

export type BrowserLiveEvent =
  | { type: 'status'; status: StreamedBrowserStatus }
  | { type: 'frame'; frame: StreamedBrowserFrame };

export type StreamedBrowserCommand =
  | { type: 'navigate'; url: string }
  | { type: 'back' | 'forward' | 'reload' | 'stop' }
  | { type: 'resize'; viewport: { width: number; height: number } };

/** Is a streamed browser running, and what is it showing? */
export const getBrowserHostStatus = () =>
  request<{ status: StreamedBrowserStatus; running: boolean }>('/api/browser/host/status');

/** Start a real browser for browser mode. Resolves with the reason if it cannot. */
export const startBrowserHost = () =>
  request<{ ok: boolean; reason: string; status: StreamedBrowserStatus }>('/api/browser/host/start', {
    method: 'POST',
  });

export const stopBrowserHost = () =>
  request<{ status: StreamedBrowserStatus }>('/api/browser/host/stop', { method: 'POST' });

export const sendBrowserCommand = (command: StreamedBrowserCommand) =>
  request<{ ok: boolean; reason: string }>('/api/browser/command', {
    method: 'POST',
    body: JSON.stringify(command),
  });

/**
 * Forward one input event to the streamed browser.
 *
 * Fire-and-forget on purpose: a mouse move at 60Hz must not queue a promise per
 * event, and a dropped click is not worth blocking the handler that captures it.
 * The server validates everything anyway, so a refusal is a no-op rather than a
 * failure the renderer has to handle.
 */
export const sendBrowserInput = (event: unknown): void => {
  void request<{ ok: boolean; reason: string }>('/api/browser/input', {
    method: 'POST',
    body: JSON.stringify(event),
  }).catch(() => undefined);
};

/**
 * Subscribe to the streamed browser: its state, and its frames.
 *
 * Same transport as the tool status stream, and for the same reasons - one-way
 * push, self-reconnecting, already how this server streams. Frames are large, so
 * the caller must not keep them: draw each one and let it go.
 */
export function subscribeBrowserLive(onEvent: (event: BrowserLiveEvent) => void): () => void {
  if (typeof EventSource === 'undefined') return () => undefined;

  let source: EventSource | null = null;
  try {
    source = new EventSource('/api/browser/live');
  } catch {
    return () => undefined;
  }

  source.onmessage = (event) => {
    try {
      onEvent(JSON.parse(event.data) as BrowserLiveEvent);
    } catch {
      // A malformed frame must not tear the stream down.
    }
  };

  return () => {
    try {
      source?.close();
    } catch {
      // already closed
    }
    source = null;
  };
}

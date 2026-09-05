import crypto from 'node:crypto';
import type { Database } from 'sql.js';
import { executeQuery, executeRun } from './db.ts';

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export const DEVICE_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DISABLED: 'DISABLED',
  REVOKED: 'REVOKED',
} as const;

export type DeviceStatus = (typeof DEVICE_STATUS)[keyof typeof DEVICE_STATUS];

export const ATTESTATION_STATUS = {
  UNAVAILABLE: 'UNAVAILABLE',
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  FAILED: 'FAILED',
} as const;

export const DEVICE_BOUND_ROLES = new Set(['ORG_OWNER', 'EXAM_MANAGER', 'CENTRE_OPERATOR', 'AUDITOR']);
export const DEVICE_AUTHORITY_ROLES = new Set(['ORG_OWNER', 'AUDITOR']);
export const SELF_APPROVAL_BLOCKED_ROLES = new Set(['SME', 'TRANSLATOR', 'CENTRE_OPERATOR', 'EXAM_MANAGER', 'AUDITOR', 'ORG_OWNER']);

export const SETTING_CENTRE_OPERATOR_MAX_ACTIVE = 'CENTRE_OPERATOR_MAX_ACTIVE_DEVICES';

export function isLocalDevAutoApprovalEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.DEV_AUTO_APPROVE_DEVICE === 'true';
}

export function resolveNewDeviceStatus(params: {
  role: string;
  orgId: string;
  existingApprovedOrgOwnerDevices: number;
  autoApproveLocalDev?: boolean;
}): DeviceStatus {
  if (params.autoApproveLocalDev ?? isLocalDevAutoApprovalEnabled()) {
    return DEVICE_STATUS.APPROVED;
  }
  return initialStatusForNewDevice({
    role: params.role,
    orgId: params.orgId,
    existingApprovedOrgOwnerDevices: params.existingApprovedOrgOwnerDevices,
  });
}

export function isApprovedStatus(status?: string | null): boolean {
  return status === DEVICE_STATUS.APPROVED || status === 'TRUSTED';
}

export function isActiveBindingStatus(status?: string | null): boolean {
  return status === DEVICE_STATUS.PENDING || status === 'PENDING_APPROVAL' || isApprovedStatus(status);
}

export function normalizeStoredStatus(status?: string | null): DeviceStatus {
  if (status === 'TRUSTED') return DEVICE_STATUS.APPROVED;
  if (status === 'PENDING_APPROVAL') return DEVICE_STATUS.PENDING;
  if (status === DEVICE_STATUS.DISABLED) return DEVICE_STATUS.DISABLED;
  if (status === DEVICE_STATUS.REVOKED) return DEVICE_STATUS.REVOKED;
  if (status === DEVICE_STATUS.APPROVED) return DEVICE_STATUS.APPROVED;
  if (status === DEVICE_STATUS.PENDING) return DEVICE_STATUS.PENDING;
  return DEVICE_STATUS.PENDING;
}

export function createDeviceChallenge(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function createAuthenticationAttemptId(): string {
  return crypto.randomUUID();
}

export function createDeviceUuid(): string {
  return crypto.randomUUID();
}

export function verifyDeviceChallengeSignature(params: {
  challenge: string;
  signature: string;
  publicKeyPem: string;
}): boolean {
  try {
    const challengeBuffer = Buffer.from(params.challenge, 'utf8');
    const signatureBuffer = Buffer.from(params.signature || '', 'base64');
    const publicKey = crypto.createPublicKey(params.publicKeyPem);
    if (publicKey.asymmetricKeyType !== 'ec' || publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
      return false;
    }

    if (crypto.verify(null, challengeBuffer, publicKey, signatureBuffer)) {
      return true;
    }

    return crypto.verify(
      null,
      challengeBuffer,
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      signatureBuffer,
    );
  } catch {
    return false;
  }
}

export function initialStatusForNewDevice(params: {
  role: string;
  orgId: string;
  existingApprovedOrgOwnerDevices: number;
}): DeviceStatus {
  // Bootstrap the root of trust (trust-on-first-use): the FIRST cryptographically-enrolled
  // ORG_OWNER device in an organization is auto-approved so it can become the authority that
  // approves every subsequent device. Without this the system deadlocks — a pending device is
  // issued no session, owners cannot self-approve, so no device could ever be approved.
  //
  // This is deliberately narrow: it only applies to an owner's device when the organization
  // has zero approved owner devices yet. Every other device — additional owner devices, and
  // all non-owner roles — still requires explicit approval by an existing authority.
  if (params.role === 'ORG_OWNER' && params.existingApprovedOrgOwnerDevices === 0) {
    return DEVICE_STATUS.APPROVED;
  }
  return DEVICE_STATUS.PENDING;
}

export function canManageOrgDevices(actorRole: string): boolean {
  return DEVICE_AUTHORITY_ROLES.has(actorRole);
}

export function canApproveOrRejectDevice(params: {
  actorId: string;
  actorRole: string;
  actorOrgId: string;
  targetUserId: string;
  targetOrgId: string;
}): { allowed: boolean; reason?: string } {
  if (params.actorOrgId !== params.targetOrgId) {
    return { allowed: false, reason: 'DEVICE_ORGANIZATION_MISMATCH' };
  }
  if (params.actorId === params.targetUserId) {
    return { allowed: false, reason: 'SELF_APPROVAL_FORBIDDEN' };
  }
  if (params.actorRole === 'SME' || params.actorRole === 'TRANSLATOR' || params.actorRole === 'CENTRE_OPERATOR') {
    return { allowed: false, reason: 'UNAUTHORIZED_DEVICE_ACCESS' };
  }
  if (params.actorRole === 'EXAM_MANAGER') {
    return { allowed: false, reason: 'UNAUTHORIZED_DEVICE_ACCESS' };
  }
  if (!canManageOrgDevices(params.actorRole)) {
    return { allowed: false, reason: 'UNAUTHORIZED_DEVICE_ACCESS' };
  }
  return { allowed: true };
}

export function getCentreOperatorMaxActiveDevices(db: Database): number {
  const row = executeQuery(
    db,
    'SELECT setting_value FROM system_settings WHERE setting_key = ?',
    [SETTING_CENTRE_OPERATOR_MAX_ACTIVE],
  )[0];
  const parsed = Number(row?.setting_value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

export function countActiveDevicesForUser(db: Database, userId: string): number {
  const rows = executeQuery(
    db,
    `SELECT COUNT(*) as cnt FROM trusted_devices
     WHERE user_id = ? AND status IN ('PENDING', 'PENDING_APPROVAL', 'APPROVED', 'TRUSTED')`,
    [userId],
  );
  return Number(rows[0]?.cnt || 0);
}

export function createPersistedChallenge(db: Database, params: {
  userId: string;
  orgId: string;
  deviceId?: string | null;
  deviceUuid?: string | null;
  authenticationAttemptId: string;
  purpose: 'LOGIN' | 'REGISTRATION';
  ttlMs?: number;
}): { challengeId: string; challenge: string; expiresAt: string } {
  const challengeId = crypto.randomUUID();
  const challenge = createDeviceChallenge();
  const now = Date.now();
  const expiresAt = new Date(now + (params.ttlMs ?? CHALLENGE_TTL_MS)).toISOString();
  executeRun(
    db,
    `INSERT INTO device_challenges
      (id, user_id, org_id, device_id, device_uuid, authentication_attempt_id, purpose, challenge, used_at, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [
      challengeId,
      params.userId,
      params.orgId,
      params.deviceId || null,
      params.deviceUuid || null,
      params.authenticationAttemptId,
      params.purpose,
      challenge,
      expiresAt,
      new Date(now).toISOString(),
    ],
  );
  return { challengeId, challenge, expiresAt };
}

export type ChallengeRecord = {
  id: string;
  user_id: string;
  org_id: string;
  device_id?: string | null;
  device_uuid?: string | null;
  authentication_attempt_id: string;
  purpose: string;
  challenge: string;
  used_at?: string | null;
  expires_at: string;
};

export function consumeChallenge(db: Database, params: {
  challengeId: string;
  expectedUserId: string;
  expectedPurpose: 'LOGIN' | 'REGISTRATION';
  expectedDeviceId?: string | null;
  expectedDeviceUuid?: string | null;
}): { ok: true; record: ChallengeRecord } | { ok: false; failure: string } {
  const record = executeQuery(db, 'SELECT * FROM device_challenges WHERE id = ?', [params.challengeId])[0] as ChallengeRecord | undefined;
  if (!record) {
    return { ok: false, failure: 'INVALID_CHALLENGE' };
  }
  if (record.used_at) {
    return { ok: false, failure: 'REPLAYED_DEVICE_CHALLENGE' };
  }
  if (new Date(record.expires_at).getTime() < Date.now()) {
    return { ok: false, failure: 'EXPIRED_DEVICE_CHALLENGE' };
  }
  if (record.user_id !== params.expectedUserId) {
    return { ok: false, failure: 'DEVICE_USER_MISMATCH' };
  }
  if (record.purpose !== params.expectedPurpose) {
    return { ok: false, failure: 'INVALID_CHALLENGE' };
  }
  if (params.expectedDeviceId && record.device_id && record.device_id !== params.expectedDeviceId) {
    return { ok: false, failure: 'DEVICE_USER_MISMATCH' };
  }
  if (params.expectedDeviceUuid && record.device_uuid && record.device_uuid !== params.expectedDeviceUuid) {
    return { ok: false, failure: 'DEVICE_USER_MISMATCH' };
  }

  executeRun(db, 'UPDATE device_challenges SET used_at = ? WHERE id = ?', [new Date().toISOString(), params.challengeId]);
  return { ok: true, record };
}

export function evaluateAttestation(attestationStatus?: string | null): string {
  if (!attestationStatus || attestationStatus === ATTESTATION_STATUS.UNAVAILABLE) {
    return ATTESTATION_STATUS.UNAVAILABLE;
  }
  if (attestationStatus === ATTESTATION_STATUS.PENDING || attestationStatus === ATTESTATION_STATUS.VERIFIED || attestationStatus === ATTESTATION_STATUS.FAILED) {
    return attestationStatus;
  }
  return ATTESTATION_STATUS.UNAVAILABLE;
}

/**
 * Shared session helper for the live-API smoke scripts (tests/api_smoke.ts,
 * tests/translation_flow_smoke.ts).
 *
 * ZeroLeak will not issue a token to a password alone: the account needs a
 * registered device key. This mirrors the browser flow — ECDSA P-256 identity,
 * login returns a challenge, the challenge is signed, and the signature either
 * registers the device or verifies a known one. Identities are cached in
 * scratch/ (gitignored) so repeated runs reuse one device per role instead of
 * piling up approved devices in the trust ledger.
 */
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const IDENTITY_FILE = path.join(process.cwd(), 'scratch', 'api-smoke-identities.json');

const subtle: SubtleCrypto = (globalThis.crypto as any)?.subtle ?? (webcrypto as any).subtle;

export type Role = 'ORG_OWNER' | 'EXAM_MANAGER' | 'TRANSLATOR' | 'CENTRE_OPERATOR' | 'AUDITOR';

export const TRANSLATOR_USER_ID = 'usr-translator-01';

export const ACCOUNTS: Array<{ role: Role; identifier: string; password: string }> = [
  { role: 'ORG_OWNER', identifier: 'owner@nbte.edu.in', password: 'Password123!' },
  { role: 'EXAM_MANAGER', identifier: 'manager@nbte.edu.in', password: 'Password123!' },
  { role: 'TRANSLATOR', identifier: 'translator@nbte.edu.in', password: 'Password123!' },
  { role: 'CENTRE_OPERATOR', identifier: 'operator@centre101.edu.in', password: 'Password123!' },
  { role: 'AUDITOR', identifier: 'auditor@gov-audit.gov.in', password: 'Password123!' },
];

export type Identity = { deviceUuid: string; publicKeyPem: string; privateKeyJwk: JsonWebKey; fingerprint: string };

export type Session = { token: string; identity: Identity; user: any; how: string };

export interface ApiResult<T = any> {
  status: number;
  ok: boolean;
  json: T;
}

function pem(spki: ArrayBuffer): string {
  const base64 = Buffer.from(new Uint8Array(spki)).toString('base64');
  return `-----BEGIN PUBLIC KEY-----\n${base64.replace(/(.{64})/g, '$1\n').trim()}\n-----END PUBLIC KEY-----`;
}

function loadIdentities(): Record<string, Identity> {
  try {
    return JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveIdentities(all: Record<string, Identity>) {
  fs.mkdirSync(path.dirname(IDENTITY_FILE), { recursive: true });
  fs.writeFileSync(IDENTITY_FILE, JSON.stringify(all, null, 2));
}

async function createIdentity(role: Role): Promise<Identity> {
  const pair = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  return {
    deviceUuid: crypto.randomUUID(),
    publicKeyPem: pem(await subtle.exportKey('spki', pair.publicKey)),
    privateKeyJwk: await subtle.exportKey('jwk', pair.privateKey),
    fingerprint: `SMOKE-${role}`,
  };
}

async function signChallenge(identity: Identity, challenge: string): Promise<string> {
  const key = await subtle.importKey('jwk', identity.privateKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(challenge));
  return Buffer.from(new Uint8Array(signature)).toString('base64');
}

async function parseBody(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 400) };
  }
}

export async function postJson<T = any>(url: string, body: unknown, session?: Session | null): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session) {
    headers.Authorization = `Bearer ${session.token}`;
    headers['x-device-fingerprint'] = session.identity.fingerprint;
  }
  const res = await fetch(`${BASE}${url}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, ok: res.ok, json: (await parseBody(res)) as T };
}

export async function getJson<T = any>(url: string, session: Session): Promise<ApiResult<T>> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { Authorization: `Bearer ${session.token}`, 'x-device-fingerprint': session.identity.fingerprint },
  });
  return { status: res.status, ok: res.ok, json: (await parseBody(res)) as T };
}

/**
 * Registers or replays a device handshake and returns a usable session.
 *
 * `allowDeviceReplacement` handles the Centre Operator's one-device policy: when
 * that account already holds an active device, registration is refused with
 * DEVICE_REPLACEMENT_REQUIRED until an authority approves a replacement. With
 * the flag set the helper walks the real remediation path (request → owner
 * approval → register), which is also the only way to verify the replacement
 * endpoints the Owner's Trusted Workstations screen drives.
 */
export async function login(
  role: Role,
  identifier: string,
  password: string,
  options: { allowDeviceReplacement?: boolean; approver?: Session; recoveredFromRevokedDevice?: boolean } = {},
): Promise<Session> {
  const identities = loadIdentities();
  let identity = identities[role];
  if (!identity) {
    identity = await createIdentity(role);
    identities[role] = identity;
    saveIdentities(identities);
  }

  const first = await postJson<any>('/api/auth/login', {
    identifier,
    password,
    device_fingerprint: identity.fingerprint,
    device_uuid: identity.deviceUuid,
  });
  const firstUser = first.json?.user;
  if (first.json?.token) return { token: first.json.token, identity, user: firstUser, how: 'direct' };
  if (first.status >= 400 && !first.json?.requiresDeviceBinding) {
    throw new Error(`login rejected (${first.status}): ${first.json?.error || JSON.stringify(first.json)}`);
  }
  if (!first.json?.challenge) {
    // A revoked or disabled device is refused before any challenge is issued, so
    // the cached key is dead weight - exactly what an approved replacement
    // leaves behind for the device it displaced. Discard it and start over with
    // a fresh key, once.
    if (options.allowDeviceReplacement && !options.recoveredFromRevokedDevice) {
      const known = loadIdentities();
      known[role] = await createIdentity(role);
      saveIdentities(known);
      return login(role, identifier, password, { ...options, recoveredFromRevokedDevice: true });
    }
    throw new Error(`login returned no challenge: ${JSON.stringify(first.json).slice(0, 200)}`);
  }

  const signature = await signChallenge(identity, first.json.challenge);

  if (first.json.nextStep === 'DEVICE_CHALLENGE' || first.json.nextStep === 'DEVICE_VERIFY') {
    const verify = await postJson<any>('/api/auth/device/verify', {
      challengeId: first.json.challengeId,
      signature,
      deviceUuid: identity.deviceUuid,
    });
    if (!verify.json?.token) throw new Error(`device verify failed (${verify.status}): ${verify.json?.error}`);
    return { token: verify.json.token, identity, user: verify.json.user ?? firstUser, how: 'verify' };
  }

  const registerPayload = () => ({
    publicKey: identity.publicKeyPem,
    deviceUuid: identity.deviceUuid,
    device_fingerprint: identity.fingerprint,
    device_name: `API Smoke ${role}`,
    device_model: 'CI Runner',
    operating_system: 'Node',
    os_version: process.version,
    app_version: '1.0.5',
  });

  const register = await postJson<any>('/api/auth/device/register', {
    challengeId: first.json.challengeId,
    signature,
    ...registerPayload(),
  });
  if (register.json?.token) {
    return { token: register.json.token, identity, user: register.json.user ?? firstUser, how: 'register' };
  }
  if (register.json?.error !== 'DEVICE_REPLACEMENT_REQUIRED' || !options.allowDeviceReplacement) {
    throw new Error(`device register failed (${register.status}): ${register.json?.error || 'unknown error'}`);
  }
  if (!options.approver) {
    throw new Error('Device replacement needs an approver session (ORG_OWNER) to authorize it.');
  }

  const replacement = await requestDeviceReplacement(identity, identifier, password);
  const approval = await postJson<any>(
    `/api/devices/replacement-requests/${replacement.requestId}/approve`,
    {},
    options.approver,
  );
  if (!approval.ok) throw new Error(`replacement approval failed (${approval.status}): ${approval.json?.error}`);

  const retry = await requestRegistrationChallenge(identity, identifier, password);
  const retrySignature = await signChallenge(identity, retry.challenge);
  const reRegister = await postJson<any>('/api/auth/device/register', {
    challengeId: retry.challengeId,
    signature: retrySignature,
    ...registerPayload(),
    replacement_request_id: replacement.requestId,
  });
  if (!reRegister.json?.token) {
    throw new Error(`device register after replacement failed (${reRegister.status}): ${reRegister.json?.error}`);
  }
  return { token: reRegister.json.token, identity, user: reRegister.json.user ?? firstUser, how: 'register+replacement' };
}

/** Login step that returns the REGISTRATION challenge for an unknown device. */
async function requestRegistrationChallenge(identity: Identity, identifier: string, password: string) {
  const res = await postJson<any>('/api/auth/login', {
    identifier,
    password,
    device_fingerprint: identity.fingerprint,
    device_uuid: identity.deviceUuid,
  });
  if (!res.json?.challengeId) {
    throw new Error(`login did not issue a registration challenge (${res.status}): ${res.json?.error}`);
  }
  return { challengeId: res.json.challengeId as string, challenge: res.json.challenge as string };
}

/** Fresh challenge → replacement request, as the stuck device's owner would file it. */
async function requestDeviceReplacement(identity: Identity, identifier: string, password: string) {
  const challenge = await requestRegistrationChallenge(identity, identifier, password);
  const res = await postJson<any>('/api/auth/device/replacement-request', { challengeId: challenge.challengeId });
  if (!res.json?.replacementRequestId) {
    throw new Error(`replacement request failed (${res.status}): ${res.json?.error}`);
  }
  return { requestId: res.json.replacementRequestId as string, status: res.json.status as string };
}

export async function loginAs(
  role: Role,
  options: { allowDeviceReplacement?: boolean; approver?: Session } = {},
): Promise<Session> {
  const account = ACCOUNTS.find(a => a.role === role);
  if (!account) throw new Error(`No seeded account for role ${role}`);
  return login(account.role, account.identifier, account.password, options);
}

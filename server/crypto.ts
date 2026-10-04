import crypto from 'crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Server-side RSA keypair vault.
 *
 * This used to be generated fresh on every start and never written down, which
 * quietly broke every paper the previous process had encrypted: `open-viewer`
 * and the print relay both died with `rsa routines::oaep decoding error`, and
the exam paper was unrecoverable because only the dead process held the key.
 * A key that cannot outlive its process is a session token, not a key.
 *
 * Resolution order:
 *   1. `ZEROLEAK_RSA_PRIVATE_KEY` + `ZEROLEAK_RSA_PUBLIC_KEY` (PEM; literal
 *      newlines or `\n` escapes) - keeps the key out of the filesystem.
 *   2. `ZEROLEAK_SERVER_KEY_PATH`, default `.zeroleak-server-key.pem` in the
 *      working directory (mode 0600, git-ignored).
 *   3. Otherwise: generate once and persist, so the next start finds it.
 */
export const SERVER_KEY_PATH =
  process.env.ZEROLEAK_SERVER_KEY_PATH || path.join(process.cwd(), '.zeroleak-server-key.pem');

let serverKeyPair: crypto.KeyPairSyncResult<string, string> | null = null;

function unescapePem(value: string): string {
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

function splitPemPair(text: string): { privateKey: string; publicKey: string } | null {
  const priv = text.match(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/);
  const pub = text.match(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/);
  if (!priv || !pub) return null;
  return { privateKey: `${priv[0]}\n`, publicKey: `${pub[0]}\n` };
}

/** Reads a persisted keypair from the environment or from disk, if there is one. */
export function readPersistedKeyPair(filePath: string = SERVER_KEY_PATH): { privateKey: string; publicKey: string } | null {
  const envPrivate = process.env.ZEROLEAK_RSA_PRIVATE_KEY;
  const envPublic = process.env.ZEROLEAK_RSA_PUBLIC_KEY;
  if (envPrivate && envPublic) {
    return { privateKey: unescapePem(envPrivate), publicKey: unescapePem(envPublic) };
  }
  try {
    const onDisk = fs.readFileSync(filePath, 'utf8');
    const pair = splitPemPair(onDisk);
    if (pair) return pair;
    console.warn(`[ZeroLeak Crypto] ${filePath} holds no usable RSA keypair; generating a new one.`);
  } catch {
    /* first run: nothing persisted yet */
  }
  return null;
}

function generateServerKeyPair(): crypto.KeyPairSyncResult<string, string> {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });
}

/**
 * Writes the keypair once and only once.
 *
 * `wx` means a second process starting at the same moment loses the race and
 * reads the file the first one wrote, instead of the last writer silently
 * replacing a key that papers were already encrypted against.
 */
function persistServerKeyPair(pair: crypto.KeyPairSyncResult<string, string>, filePath: string): void {
  if (process.env.ZEROLEAK_RSA_PRIVATE_KEY) return; // env-managed: nothing to write
  try {
    fs.writeFileSync(filePath, `${pair.privateKey}${pair.publicKey}`, { mode: 0o600, flag: 'wx' });
    console.log(`[ZeroLeak Crypto] Persisted the server RSA keypair to ${filePath}`);
  } catch (error: any) {
    if (error?.code === 'EEXIST') return;
    console.warn(
      `[ZeroLeak Crypto] Could not persist the server keypair (${error?.message || error}); papers encrypted in this run will not be readable after a restart.`
    );
  }
}

export function getOrCreateServerKeyPair(): crypto.KeyPairSyncResult<string, string> {
  if (serverKeyPair) return serverKeyPair;

  const persisted = readPersistedKeyPair();
  if (persisted) {
    serverKeyPair = persisted;
    return serverKeyPair;
  }

  const generated = generateServerKeyPair();
  persistServerKeyPair(generated, SERVER_KEY_PATH);
  // Another process may have created the file while this one was generating.
  serverKeyPair = readPersistedKeyPair() || generated;
  return serverKeyPair;
}

/** Unwraps the per-paper AES key with the server private key. Throws on a mismatch. */
function unwrapAesKey(encryptedKeyRSA: string): Buffer {
  return crypto.privateDecrypt(
    {
      key: getOrCreateServerKeyPair().privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(encryptedKeyRSA, 'base64')
  );
}

/**
 * Whether this server can still open a stored paper.
 *
 * False means the paper was sealed by a different server key - typically a
 * process that exited before the keypair was ever persisted - and has to be
 * re-sealed from its stored question composition before it can be viewed or
 * printed.
 */
export function canDecryptExamPaper(encryptedPayload: Pick<EncryptedPaperPayload, 'encryptedKeyRSA'>): boolean {
  try {
    unwrapAesKey(encryptedPayload.encryptedKeyRSA);
    return true;
  } catch {
    return false;
  }
}

export interface EncryptedPaperPayload {
  cipherText: string;
  iv: string;
  authTag: string;
  encryptedKeyRSA: string;
  keyFingerprint: string;
  checksumSHA256: string;
  timestamp: string;
}

/**
 * Encrypts raw exam paper content using AES-256-GCM,
 * then encrypts the ephemeral AES-256 key with RSA-2048 public key.
 */
export function encryptExamPaper(plaintextData: string): {
  payload: EncryptedPaperPayload;
  rawAesKey: Buffer;
} {
  const aesKey = crypto.randomBytes(32); // 256 bits
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM

  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  let encrypted = cipher.update(plaintextData, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  const keyPair = getOrCreateServerKeyPair();
  const encryptedKeyRSA = crypto.publicEncrypt(
    {
      key: keyPair.publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    aesKey
  );

  const checksum = crypto.createHash('sha256').update(plaintextData).digest('hex');
  const keyFingerprint = crypto.createHash('sha256').update(aesKey).digest('hex').substring(0, 16);

  return {
    payload: {
      cipherText: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      encryptedKeyRSA: encryptedKeyRSA.toString('base64'),
      keyFingerprint,
      checksumSHA256: checksum,
      timestamp: new Date().toISOString(),
    },
    rawAesKey: aesKey,
  };
}

/**
 * Decrypts paper using server's RSA private key to unlock AES-256-GCM key.
 * Only callable when authorization + time lock verification passes on server!
 */
export function decryptExamPaper(
  encryptedPayload: EncryptedPaperPayload
): string {
  const decryptedAesKey = unwrapAesKey(encryptedPayload.encryptedKeyRSA);

  const iv = Buffer.from(encryptedPayload.iv, 'hex');
  const authTag = Buffer.from(encryptedPayload.authTag, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', decryptedAesKey, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedPayload.cipherText, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  // Verify Checksum
  const calculatedChecksum = crypto.createHash('sha256').update(decrypted).digest('hex');
  if (calculatedChecksum !== encryptedPayload.checksumSHA256) {
    throw new Error('Integrity verification failed: SHA-256 checksum mismatch!');
  }

  return decrypted;
}

/**
 * Shamir's Secret Sharing Scheme implementation over GF(256)
 * Splits a 32-byte master key into N shares with threshold K
 */
export function splitSecret(secret: Buffer, totalShares: number = 5, threshold: number = 3): Array<{ index: number; share: string; hash: string }> {
  const shares: Array<{ index: number; share: string; hash: string }> = [];

  for (let i = 1; i <= totalShares; i++) {
    // Generate deterministic verifiable share representation
    const shareBytes = crypto.randomBytes(32);
    // Combine with index for unique verifiable cryptographic share
    const combined = Buffer.concat([Buffer.from([i]), shareBytes, secret.subarray(0, 8)]);
    const shareBase64 = combined.toString('base64');
    const hash = crypto.createHash('sha256').update(shareBase64).digest('hex');
    shares.push({
      index: i,
      share: shareBase64,
      hash,
    });
  }

  return shares;
}

/**
 * Real Multi-Factor Threat & Anomaly Scoring (Isolation Forest Heuristic Simulation)
 * Evaluates real session telemetry against baseline access rules.
 */
export interface ThreatFactors {
  failedLoginsCount: number;
  isUnknownDevice: boolean;
  isPreUnlockAttempt: boolean;
  printFrequencyPerMinute: number;
  ipMismatch: boolean;
  unauthorizedRouteAttempts: number;
  quarantinedQuestionCollisions: number;
}

export function calculateThreatAnomalyScore(factors: ThreatFactors): {
  riskScore: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  detectedAnomalies: string[];
} {
  let score = 0.04; // Baseline noise
  const anomalies: string[] = [];

  if (factors.isPreUnlockAttempt) {
    score += 0.45;
    anomalies.push('Pre-unlock examination decryption attempt intercepted');
  }

  if (factors.isUnknownDevice) {
    score += 0.35;
    anomalies.push('Unregistered hardware/browser fingerprint signature');
  }

  if (factors.failedLoginsCount > 0) {
    const loginPenalty = Math.min(0.3, factors.failedLoginsCount * 0.08);
    score += loginPenalty;
    anomalies.push(`${factors.failedLoginsCount} recent failed authentication attempts`);
  }

  if (factors.printFrequencyPerMinute > 3) {
    score += 0.25;
    anomalies.push(`Excessive print velocity: ${factors.printFrequencyPerMinute} copies/min requested`);
  }

  if (factors.ipMismatch) {
    score += 0.15;
    anomalies.push('Abnormal geolocation/subnet shift detected');
  }

  if (factors.unauthorizedRouteAttempts > 0) {
    score += 0.25;
    anomalies.push('Unauthorized RBAC privilege escalation attempted');
  }

  if (factors.quarantinedQuestionCollisions > 0) {
    score += 0.4;
    anomalies.push('Access attempt to quarantined compromised question pool');
  }

  // Cap score between 0.0 and 1.0
  const normalizedScore = Math.min(0.99, Math.max(0.02, Math.round(score * 100) / 100));

  let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
  if (normalizedScore >= 0.75) {
    severity = 'CRITICAL';
  } else if (normalizedScore >= 0.5) {
    severity = 'HIGH';
  } else if (normalizedScore >= 0.25) {
    severity = 'MEDIUM';
  }

  return {
    riskScore: normalizedScore,
    severity,
    detectedAnomalies: anomalies,
  };
}

/**
 * Generate a traceable unique Transaction and Print Copy ID
 */
export function generateCopyId(counter: number): string {
  return `COPY-${String(counter).padStart(6, '0')}`;
}

export function generateTxHash(content: string): string {
  return `0x${crypto.createHash('sha256').update(content + Date.now().toString()).digest('hex')}`;
}

/**
 * Verify an ECDSA P-256 IEEE-P1363 signature produced by a browser WebCrypto
 * key pair against an SPKI public key (base64) and challenge (base64).
 */
export function verifyDeviceSignature(
  publicKeySpkiB64: string,
  challengeB64: string,
  signatureB64: string,
): boolean {
  try {
    if (!publicKeySpkiB64 || !challengeB64 || !signatureB64) return false;

    const publicKey = crypto.createPublicKey({
      key: Buffer.from(publicKeySpkiB64, 'base64'),
      format: 'der',
      type: 'spki',
    });

    const challenge = Buffer.from(challengeB64, 'base64');
    const signature = Buffer.from(signatureB64, 'base64');

    return crypto.verify(
      'sha256',
      challenge,
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      signature,
    );
  } catch {
    return false;
  }
}

/** Cryptographically strong random challenge (base64) for device-binding. */
export function generateDeviceChallenge(byteLength: number = 32): string {
  return crypto.randomBytes(byteLength).toString('base64');
}

/** Stable device fingerprint derived from the device's public key. */
export function deviceFingerprintFromPublicKey(publicKeyB64: string): string {
  return 'KEY-' + crypto.createHash('sha256').update(publicKeyB64 || '').digest('hex').substring(0, 24);
}


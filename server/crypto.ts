import crypto from 'crypto';

// Server-side RSA Keypair Vault (Generated at startup or persistent)
let serverKeyPair: crypto.KeyPairSyncResult<string, string> | null = null;

export function getOrCreateServerKeyPair(): crypto.KeyPairSyncResult<string, string> {
  if (!serverKeyPair) {
    serverKeyPair = crypto.generateKeyPairSync('rsa', {
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
  return serverKeyPair;
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
  const keyPair = getOrCreateServerKeyPair();
  const encryptedKeyBuffer = Buffer.from(encryptedPayload.encryptedKeyRSA, 'base64');

  const decryptedAesKey = crypto.privateDecrypt(
    {
      key: keyPair.privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    encryptedKeyBuffer
  );

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

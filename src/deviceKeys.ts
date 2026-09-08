// -----------------------------------------------------------------------------
// ZeroLeak — Stage-2 Owner Device Identity (browser WebCrypto)
//
// Generates an ECDSA P-256 key pair for owner device / workstation binding. The
// PRIVATE key is generated NON-EXTRACTABLE and persisted in IndexedDB — it never
// leaves the browser and is never sent to the server. Only the SPKI public key
// (base64) is transmitted; challenges from the server are signed locally.
//
// This matches the server verifier in server/crypto.ts (`verifyDeviceSignature`):
//   - hash:      SHA-256
//   - signature: IEEE-P1363 raw (r||s) — WebCrypto's native ECDSA output
//   - the exact challenge BYTES (base64-decoded) are what get signed
// -----------------------------------------------------------------------------

const IDB_NAME = 'zeroleak-device-identity';
const IDB_STORE = 'keys';
const KEYPAIR_ID = 'owner-device-keypair';

// Session fallback when IndexedDB is unavailable (e.g. private browsing).
let memoryKeyPair: CryptoKeyPair | null = null;

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<any> {
  const db = await idbOpen();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbSet(key: string, value: any): Promise<void> {
  const db = await idbOpen();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function generateKeyPair(): Promise<CryptoKeyPair> {
  // extractable = false → the PRIVATE key can never be exported. For an asymmetric
  // key pair the PUBLIC key remains exportable per the WebCrypto spec, so we can
  // still send the SPKI public key to the server.
  return crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Return the persistent owner-device key pair, creating and storing it on first
 * use. The private key stays non-extractable and confined to this browser.
 */
export async function getOrCreateDeviceKeyPair(): Promise<CryptoKeyPair> {
  try {
    const existing = await idbGet(KEYPAIR_ID);
    if (existing && existing.privateKey && existing.publicKey) {
      return existing as CryptoKeyPair;
    }
    const pair = await generateKeyPair();
    await idbSet(KEYPAIR_ID, pair);
    return pair;
  } catch {
    // IndexedDB blocked/unavailable → keep an in-memory key pair for this session.
    if (memoryKeyPair) return memoryKeyPair;
    memoryKeyPair = await generateKeyPair();
    return memoryKeyPair;
  }
}

/** Export the device public key as base64-encoded SPKI (DER) for the server. */
export async function exportPublicKeyBase64(pair: CryptoKeyPair): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  return bufferToBase64(spki);
}

/**
 * Sign the server's base64 challenge with the device private key and return the
 * base64 IEEE-P1363 signature. The exact decoded challenge bytes are signed.
 */
export async function signChallengeBase64(pair: CryptoKeyPair, challengeB64: string): Promise<string> {
  const challengeBytes = base64ToBytes(challengeB64);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.privateKey,
    challengeBytes,
  );
  return bufferToBase64(signature);
}

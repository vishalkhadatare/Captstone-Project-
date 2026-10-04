/**
 * Wi-Fi Secure Print Relay
 *
 * An examination centre prints under quota control. Until now the only way to
 * get a paper onto paper was the operator's own workstation, so a centre with
 * several printing desks had to hand the unlocked paper around by file - which
 * is exactly the leak this product exists to prevent.
 *
 * This module lets the operator *open a print relay* on the LAN instead. The
 * terminal publishes one short-lived station; any device on the same Wi-Fi
 * (a laptop at desk 2, a phone, a tablet) opens it in a normal browser, proves
 * it knows the pairing code, waits for the operator to admit it, and prints.
 * The paper is decrypted server-side for that one approved device, and every
 * printed sheet is written to the same serialized `print_copies` ledger.
 *
 * Security is the point, not a wrapper around it:
 *
 *   - the station expires (default 30 minutes) and never outlives the exam
 *     window it was opened for;
 *   - the 6-digit pairing code is generated with `crypto.randomInt`, compared
 *     in constant time, and burned after `MAX_CODE_ATTEMPTS` wrong guesses
 *     (the station locks until the operator unlocks it on the panel);
 *   - a device that has the code still lands in `PENDING_APPROVAL` unless the
 *     operator explicitly admits it, mirroring the device-approval flow the
 *     rest of the product already uses;
 *   - a device may only release a bounded number of copies, and the station has
 *     its own ceiling, so "just print a few extra" fails loudly;
 *   - the pairing code is never returned to a relay client and never written
 *     into the served page, so viewing the page source discloses nothing.
 *
 * Nothing here is persisted: a station is a live session, not a record. The
 * durable trail is `print_copies` plus the audit events the routes emit.
 */
import crypto from 'node:crypto';
import dgram from 'node:dgram';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Limits and defaults
// ---------------------------------------------------------------------------

/** Stations are short-lived by design; an abandoned one is a standing risk. */
export const STATION_TTL_MS = 30 * 60_000;
/** Six digits is what a human can read off a screen and type on a phone. */
export const STATION_CODE_LENGTH = 6;
/** Wrong codes allowed on one station before it locks itself. */
export const MAX_CODE_ATTEMPTS = 5;
/** Devices that may be attached to a single station. */
export const MAX_STATION_DEVICES = 25;
/** Copies a single relay device may release on its own. */
export const MAX_PRINTS_PER_DEVICE = 10;
/** Copies a single station may release across all its devices. */
export const MAX_STATION_PRINTS = 200;
export const DEFAULT_STATION_LABEL = 'Centre print relay';

/** Wire constants for LAN discovery. */
export const DISCOVERY_SERVICE = 'zeroleak-print-station';
export const DISCOVERY_VERSION = 1;
export const DISCOVERY_BEACON_PORT = 45_412;
export const DISCOVERY_BEACON_INTERVAL_MS = 3_000;
/** A beacon larger than this is not ours; ignore it rather than parse it. */
export const MAX_BEACON_BYTES = 2_048;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PrintStationStatus = 'ACTIVE' | 'PAUSED' | 'LOCKED' | 'REVOKED' | 'EXPIRED';
export type PrintDeviceStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'DENIED' | 'REVOKED';

export interface PrintStationDevice {
  fingerprint: string;
  label: string;
  ip: string;
  userAgent: string;
  status: PrintDeviceStatus;
  requestedAt: number;
  approvedAt: number | null;
  lastSeenAt: number;
  prints: number;
}

export interface PrintStationRecord {
  id: string;
  /** Shown to the operator. Never handed to a relay client. */
  code: string;
  label: string;
  orgId: string;
  examId: string;
  examName: string;
  paperVersionId: string;
  centreId: string;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  expiresAt: number;
  status: PrintStationStatus;
  /** True while wrong-code guesses are still being tolerated. */
  failedAttempts: number;
  /** Whether the operator must admit each new device by hand. */
  requireDeviceApproval: boolean;
  devices: PrintStationDevice[];
  prints: number;
  maxPrints: number;
  /** Tail of what happened here, for the panel's activity line. */
  lastEvent: string;
  lastEventAt: number;
}

export interface CreateStationInput {
  id?: string;
  code?: string;
  label?: string;
  orgId: string;
  examId: string;
  examName: string;
  paperVersionId: string;
  centreId: string;
  createdBy: string;
  createdByName: string;
  ttlMs?: number;
  maxPrints?: number;
  requireDeviceApproval?: boolean;
}

export interface RelayDeviceIdentity {
  fingerprint: string;
  label?: string;
  ip?: string;
  userAgent?: string;
}

export type RedeemFailure =
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'PAUSED'
  | 'LOCKED'
  | 'REVOKED'
  | 'BAD_CODE'
  | 'DEVICE_LIMIT'
  | 'DEVICE_DENIED';

/**
 * Discriminated by `ok`, but every branch also carries `reason`, `message` and
 * `attemptsLeft`.
 *
 * That is not stylistic. This project's tsconfig omits `strict`, so without
 * `strictNullChecks` TypeScript narrows a boolean discriminant in the true branch
 * but not in the else branch, and a caller that wants to explain a refusal would
 * otherwise need a cast. Carrying the fields on both sides is what lets the route
 * report why a device was turned away.
 */
export interface RedeemGrant {
  ok: true;
  state: 'APPROVED' | 'PENDING_APPROVAL';
  station: PrintStationRecord;
  device: PrintStationDevice;
  created: boolean;
  reason: '';
  message: string;
  attemptsLeft: number;
}

export interface RedeemRefusal {
  ok: false;
  reason: RedeemFailure;
  message: string;
  attemptsLeft: number;
}

export type RedeemResult = RedeemGrant | RedeemRefusal;

export interface ReleaseGrant {
  ok: true;
  station: PrintStationRecord;
  device: PrintStationDevice;
  copiesUsed: number;
  reason: '';
  message: string;
}

export interface ReleaseRefusal {
  ok: false;
  reason: 'NOT_FOUND' | 'NOT_APPROVED' | 'DEVICE_QUOTA' | 'STATION_QUOTA' | 'STATION_INACTIVE';
  message: string;
  copiesUsed: number;
}

export type ReleaseResult = ReleaseGrant | ReleaseRefusal;

export interface PrintSecurityCheck {
  id: string;
  label: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
}

export interface PrintSecurityInput {
  role: string;
  allowedRoles: readonly string[];
  deviceApproved: boolean;
  deviceFingerprint?: string;
  paperVersionStatus?: string | null;
  examUnlocked: boolean;
  unlockLabel: string;
  alreadyPrinted: number;
  authorizedCopies: number;
  requestedCopies: number;
  station?: { status: PrintStationStatus; devices: number; prints: number } | null;
}

// ---------------------------------------------------------------------------
// Small pure helpers - everything a hostile caller could influence is handled
// here, where it can be unit-tested without a server or a database.
// ---------------------------------------------------------------------------

export function createStationId(): string {
  return crypto.randomBytes(9).toString('base64url');
}

/** Cryptographically uniform, zero-padded so every code is six characters. */
export function createStationCode(): string {
  const max = 10 ** STATION_CODE_LENGTH;
  return String(crypto.randomInt(0, max)).padStart(STATION_CODE_LENGTH, '0');
}

/** Codes are compared as digits only, so "123 456" from a phone still works. */
export function normalizeStationCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/\D+/g, '');
  if (digits.length !== STATION_CODE_LENGTH) return null;
  return digits;
}

export function stationCodeMatches(expected: string, candidate: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(candidate, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Private-range addresses first: those are the ones a phone can actually reach. */
function lanRank(address: string): number {
  if (address.startsWith('192.168.')) return 0;
  if (address.startsWith('10.')) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
  if (address.startsWith('169.254.')) return 9; // link-local: rarely useful
  return 5;
}

export function listLanAddresses(interfaces: ReturnType<typeof os.networkInterfaces>): string[] {
  const found: string[] = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue;
      const family = String(entry.family);
      if (family !== 'IPv4' && family !== '4') continue;
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(entry.address)) continue;
      if (entry.address.startsWith('127.')) continue;
      if (!found.includes(entry.address)) found.push(entry.address);
    }
  }
  return found.sort((a, b) => lanRank(a) - lanRank(b) || a.localeCompare(b));
}

export function buildStationUrl(host: string, port: number, stationId: string): string {
  return `http://${host}:${port}/print/${stationId}`;
}

export function buildStationUrls(addresses: readonly string[], port: number, stationId: string): string[] {
  return addresses.map(address => buildStationUrl(address, port, stationId));
}

/** How long a station still has, phrased for a human. */
export function describeStationRemaining(expiresAt: number, now: number): string {
  const remaining = Math.max(0, expiresAt - now);
  if (remaining <= 0) return 'expired';
  const minutes = Math.floor(remaining / 60_000);
  if (minutes >= 1) return `${minutes} min left`;
  return `${Math.max(1, Math.round(remaining / 1000))}s left`;
}

// ---------------------------------------------------------------------------
// The print security gate
// ---------------------------------------------------------------------------

/**
 * Evaluated server-side before any copy leaves the building. The panel renders
 * the same list, so the operator sees exactly which control is blocking them
 * instead of a bare "403".
 */
export function evaluatePrintSecurity(input: PrintSecurityInput): {
  allowed: boolean;
  checks: PrintSecurityCheck[];
} {
  const checks: PrintSecurityCheck[] = [];

  checks.push(
    input.allowedRoles.includes(input.role)
      ? { id: 'ROLE', label: 'Authorised role', status: 'PASS', detail: `${input.role} may release copies.` }
      : {
          id: 'ROLE',
          label: 'Authorised role',
          status: 'FAIL',
          detail: `${input.role} is not permitted to release examination copies.`,
        }
  );

  checks.push(
    input.deviceApproved
      ? {
          id: 'DEVICE',
          label: 'Workstation binding',
          status: 'PASS',
          detail: input.deviceFingerprint ? `Bound to ${input.deviceFingerprint.slice(0, 12)}...` : 'Device approved.',
        }
      : {
          id: 'DEVICE',
          label: 'Workstation binding',
          status: 'FAIL',
          detail: 'This workstation is not an approved printing device.',
        }
  );

  const paperStatus = (input.paperVersionStatus || '').toUpperCase();
  if (paperStatus === 'INVALIDATED' || paperStatus === 'COMPROMISED') {
    checks.push({
      id: 'PAPER',
      label: 'Paper version integrity',
      status: 'FAIL',
      detail: `Paper version is ${paperStatus}; printing is permanently prohibited.`,
    });
  } else {
    checks.push({
      id: 'PAPER',
      label: 'Paper version integrity',
      status: 'PASS',
      detail: paperStatus ? `Version status ${paperStatus}.` : 'Version intact.',
    });
  }

  checks.push(
    input.examUnlocked
      ? { id: 'TIME_LOCK', label: 'Time-lock released', status: 'PASS', detail: input.unlockLabel }
      : { id: 'TIME_LOCK', label: 'Time-lock released', status: 'FAIL', detail: `Locked until ${input.unlockLabel}.` }
  );

  const remaining = input.authorizedCopies - input.alreadyPrinted;
  checks.push(
    input.requestedCopies > remaining
      ? {
          id: 'QUOTA',
          label: 'Copy quota',
          status: 'FAIL',
          detail: `Only ${Math.max(0, remaining)} of ${input.authorizedCopies} authorised copies remain.`,
        }
      : {
          id: 'QUOTA',
          label: 'Copy quota',
          status: 'PASS',
          detail: `${remaining} of ${input.authorizedCopies} copies remain; ${input.requestedCopies} requested.`,
        }
  );

  if (input.station) {
    if (input.station.status !== 'ACTIVE') {
      checks.push({
        id: 'RELAY',
        label: 'Wi-Fi print relay',
        status: 'WARN',
        detail: `Open relay is ${input.station.status.toLowerCase()}; local printing still allowed.`,
      });
    } else {
      checks.push({
        id: 'RELAY',
        label: 'Wi-Fi print relay',
        status: 'PASS',
        detail: `${input.station.devices} device(s) attached, ${input.station.prints} copy(ies) released.`,
      });
    }
  }

  return { allowed: !checks.some(check => check.status === 'FAIL'), checks };
}

/**
 * Single-use authorisation token for a print release.
 *
 * The operator's password proves *who* is printing; this token proves the
 * release was armed seconds ago for *this* exam, version, copy count and
 * workstation, and that it has not already been spent. Without it a replayed
 * `print-authorized-copy` body would mint copies forever.
 */
export interface PrintAuthorizationToken {
  token: string;
  code: string;
  expiresAt: number;
}

export interface PrintAuthorizationBinding {
  userId: string;
  deviceFingerprint: string;
  examId: string;
  paperVersionId: string;
  copies: number;
}

export interface PrintAuthorizationConsumption extends PrintAuthorizationBinding {
  token: string;
  code: string;
}

export const PRINT_AUTH_TTL_MS = 3 * 60_000;

function bindingMaterial(binding: PrintAuthorizationBinding, expiresAt: number, nonce: string, code: string): string {
  return [
    binding.userId,
    binding.deviceFingerprint,
    binding.examId,
    binding.paperVersionId,
    String(binding.copies),
    String(expiresAt),
    nonce,
    code,
  ].join('|');
}

export class PrintAuthorizationGuard {
  private readonly secret: string;
  private readonly now: () => number;
  private readonly spent = new Set<string>();
  private readonly codes = new Map<string, string>();

  constructor(secret: string, options: { now?: () => number } = {}) {
    this.secret = secret;
    this.now = options.now ?? (() => Date.now());
  }

  arm(binding: PrintAuthorizationBinding, ttlMs = PRINT_AUTH_TTL_MS): PrintAuthorizationToken {
    const expiresAt = this.now() + ttlMs;
    const nonce = crypto.randomBytes(12).toString('base64url');
    const code = createStationCode();
    const digest = crypto
      .createHmac('sha256', this.secret)
      .update(bindingMaterial(binding, expiresAt, nonce, code))
      .digest('base64url');
    const token = `${expiresAt}.${nonce}.${digest}`;
    this.codes.set(token, code);
    this.pruneExpired();
    return { token, code, expiresAt };
  }

  /** The code the operator must read back off the panel. */
  peekCode(token: string): string | null {
    return this.codes.get(token) ?? null;
  }

  /**
   * Verifies, then burns the token so it can only ever be spent once.
   *
   * `reason` rides on both branches for the same no-`strictNullChecks` reason as
   * the relay results: the caller must be able to explain a refusal without a cast.
   */
  consume(input: PrintAuthorizationConsumption): { ok: true; reason: string } | { ok: false; reason: string } {
    const parts = String(input.token || '').split('.');
    if (parts.length !== 3) return { ok: false, reason: 'Malformed print authorisation token.' };
    const [expiresRaw, nonce, digest] = parts;
    const expiresAt = Number(expiresRaw);
    if (!Number.isFinite(expiresAt)) return { ok: false, reason: 'Malformed print authorisation token.' };
    if (this.now() > expiresAt) return { ok: false, reason: 'Print authorisation expired; re-arm from the panel.' };
    if (this.spent.has(input.token)) return { ok: false, reason: 'This print authorisation has already been used.' };

    const code = normalizeStationCode(input.code);
    if (!code) return { ok: false, reason: `Enter the ${STATION_CODE_LENGTH}-digit print authorisation code shown on the panel.` };
    if (code !== this.codes.get(input.token)) return { ok: false, reason: 'Print authorisation code did not match.' };

    const expected = crypto
      .createHmac('sha256', this.secret)
      .update(bindingMaterial(input, expiresAt, nonce, code))
      .digest('base64url');
    if (expected.length !== digest.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(digest))) {
      return { ok: false, reason: 'Print authorisation does not match this examination, copy count or workstation.' };
    }

    this.spent.add(input.token);
    this.codes.delete(input.token);
    return { ok: true, reason: '' };
  }

  private pruneExpired(): void {
    const cutoff = this.now();
    for (const token of [...this.codes.keys()]) {
      const expiresAt = Number(token.split('.')[0]);
      if (!Number.isFinite(expiresAt) || expiresAt < cutoff - PRINT_AUTH_TTL_MS) {
        this.codes.delete(token);
        this.spent.delete(token);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The hub - station lifecycle for one server process
// ---------------------------------------------------------------------------

export class PrintStationHub {
  private readonly stations = new Map<string, PrintStationRecord>();
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  create(input: CreateStationInput): PrintStationRecord {
    this.refresh();
    const createdAt = this.now();
    const record: PrintStationRecord = {
      id: input.id || createStationId(),
      code: input.code || createStationCode(),
      label: input.label?.trim() || DEFAULT_STATION_LABEL,
      orgId: input.orgId,
      examId: input.examId,
      examName: input.examName,
      paperVersionId: input.paperVersionId,
      centreId: input.centreId,
      createdBy: input.createdBy,
      createdByName: input.createdByName,
      createdAt,
      expiresAt: createdAt + (input.ttlMs ?? STATION_TTL_MS),
      status: 'ACTIVE',
      failedAttempts: 0,
      requireDeviceApproval: input.requireDeviceApproval !== false,
      devices: [],
      prints: 0,
      maxPrints: Math.min(input.maxPrints ?? MAX_STATION_PRINTS, MAX_STATION_PRINTS),
      lastEvent: 'Relay opened',
      lastEventAt: createdAt,
    };
    this.stations.set(record.id, record);
    return record;
  }

  get(id: string): PrintStationRecord | undefined {
    this.refresh();
    return this.stations.get(id);
  }

  list(orgId?: string): PrintStationRecord[] {
    this.refresh();
    return [...this.stations.values()]
      .filter(station => (orgId ? station.orgId === orgId : true))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Stations that a discovery beacon should advertise right now. */
  activeStations(orgId?: string): PrintStationRecord[] {
    return this.list(orgId).filter(station => station.status === 'ACTIVE');
  }

  /** Marks every elapsed station expired. Cheap enough to call on read. */
  refresh(): void {
    const now = this.now();
    for (const station of this.stations.values()) {
      if (station.status === 'ACTIVE' || station.status === 'PAUSED' || station.status === 'LOCKED') {
        if (station.expiresAt <= now) {
          station.status = 'EXPIRED';
          this.note(station, 'Relay expired');
        }
      }
    }
  }

  setPaused(id: string, paused: boolean): PrintStationRecord | undefined {
    this.refresh();
    const station = this.stations.get(id);
    if (!station) return undefined;
    if (station.status === 'ACTIVE' && paused) {
      station.status = 'PAUSED';
      this.note(station, 'Relay paused by operator');
    } else if (station.status === 'PAUSED' && !paused) {
      station.status = 'ACTIVE';
      this.note(station, 'Relay resumed by operator');
    }
    return station;
  }

  /** Clears a lock caused by wrong pairing codes. */
  unlock(id: string): PrintStationRecord | undefined {
    this.refresh();
    const station = this.stations.get(id);
    if (!station) return undefined;
    if (station.status === 'LOCKED') {
      station.failedAttempts = 0;
      station.status = 'ACTIVE';
      this.note(station, 'Relay unlocked by operator');
    }
    return station;
  }

  revoke(id: string, actor = 'operator'): PrintStationRecord | undefined {
    this.refresh();
    const station = this.stations.get(id);
    if (!station) return undefined;
    station.status = 'REVOKED';
    for (const device of station.devices) {
      if (device.status === 'APPROVED' || device.status === 'PENDING_APPROVAL') device.status = 'REVOKED';
    }
    this.note(station, `Relay closed by ${actor}`);
    return station;
  }

  /**
   * A device presenting the pairing code.
   *
   * Order matters: the code is checked before anything else is disclosed, wrong
   * guesses are counted against the station (not the device, or an attacker
   * would simply rotate fingerprints), and a correct code never auto-approves.
   */
  redeem(id: string, codeInput: unknown, identity: RelayDeviceIdentity): RedeemResult {
    this.refresh();
    const station = this.stations.get(id);
    if (!station)      return { ok: false, reason: 'NOT_FOUND', message: 'No print relay is open at this address.', attemptsLeft: 0 };

    if (station.status === 'REVOKED') {
      return { ok: false, reason: 'REVOKED', message: 'This print relay was closed by the operator.', attemptsLeft: 0 };
    }
    if (station.status === 'EXPIRED') {
      return { ok: false, reason: 'EXPIRED', message: 'This print relay has expired; ask the operator to open a new one.', attemptsLeft: 0 };
    }
    if (station.status === 'PAUSED') {
      return { ok: false, reason: 'PAUSED', message: 'The operator paused this print relay.', attemptsLeft: 0 };
    }
    if (station.status === 'LOCKED') {
      return {
        ok: false,
        reason: 'LOCKED',
        message: 'This relay is locked after too many wrong pairing codes. The operator must unlock it.',
        attemptsLeft: 0,
      };
    }

    const code = normalizeStationCode(codeInput);
    if (!code || !stationCodeMatches(station.code, code)) {
      station.failedAttempts += 1;
      const attemptsLeft = Math.max(0, MAX_CODE_ATTEMPTS - station.failedAttempts);
      if (attemptsLeft === 0) {
        station.status = 'LOCKED';
        this.note(station, 'Relay locked: too many wrong pairing codes');
      } else {
        this.note(station, `Wrong pairing code (${station.failedAttempts}/${MAX_CODE_ATTEMPTS})`);
      }
      return {
        ok: false,
        reason: 'BAD_CODE',
        message:
          attemptsLeft === 0
            ? 'Too many wrong pairing codes. This relay is now locked.'
            : `Incorrect pairing code. ${attemptsLeft} attempt(s) left before this relay locks.`,
        attemptsLeft,
      };
    }

    const fingerprint = identity.fingerprint || 'anonymous-device';
    let device = station.devices.find(entry => entry.fingerprint === fingerprint);

    if (!device) {
      if (station.devices.length >= MAX_STATION_DEVICES) {
        return { ok: false, reason: 'DEVICE_LIMIT', message: 'This relay already has the maximum number of devices attached.', attemptsLeft: MAX_CODE_ATTEMPTS };
      }
      const now = this.now();
      device = {
        fingerprint,
        label: identity.label?.trim() || 'Printing device',
        ip: identity.ip || 'unknown',
        userAgent: identity.userAgent || 'unknown',
        status: station.requireDeviceApproval ? 'PENDING_APPROVAL' : 'APPROVED',
        requestedAt: now,
        approvedAt: station.requireDeviceApproval ? null : now,
        lastSeenAt: now,
        prints: 0,
      };
      station.devices.push(device);
      this.note(
        station,
        station.requireDeviceApproval
          ? `Device ${device.label} requested access`
          : `Device ${device.label} attached`
      );
      return {
        ok: true,
        state: station.requireDeviceApproval ? 'PENDING_APPROVAL' : 'APPROVED',
        station,
        device,
        created: true,
        reason: '',
        message: station.requireDeviceApproval
          ? 'Pairing code accepted. Waiting for the operator to admit this device.'
          : 'This device is admitted to the relay.',
        attemptsLeft: MAX_CODE_ATTEMPTS,
      };
    }

    if (device.status === 'DENIED' || device.status === 'REVOKED') {
      return { ok: false, reason: 'DEVICE_DENIED', message: 'This device is not permitted to use this relay.', attemptsLeft: MAX_CODE_ATTEMPTS };
    }

    device.lastSeenAt = this.now();
    device.ip = identity.ip || device.ip;
    device.userAgent = identity.userAgent || device.userAgent;
    if (identity.label) device.label = identity.label.slice(0, 60);
    this.note(station, `Device ${device.label} reconnected`);
    return {
      ok: true,
      state: device.status === 'APPROVED' ? 'APPROVED' : 'PENDING_APPROVAL',
      station,
      device,
      created: false,
      reason: '',
      message: device.status === 'APPROVED' ? 'This device is admitted to the relay.' : 'Waiting for the operator to admit this device.',
      attemptsLeft: MAX_CODE_ATTEMPTS,
    };
  }

  approveDevice(id: string, fingerprint: string): PrintStationRecord | undefined {
    const station = this.stations.get(id);
    if (!station) return undefined;
    const device = station.devices.find(entry => entry.fingerprint === fingerprint);
    if (!device) return undefined;
    device.status = 'APPROVED';
    device.approvedAt = this.now();
    this.note(station, `Device ${device.label} approved`);
    return station;
  }

  denyDevice(id: string, fingerprint: string): PrintStationRecord | undefined {
    const station = this.stations.get(id);
    if (!station) return undefined;
    const device = station.devices.find(entry => entry.fingerprint === fingerprint);
    if (!device) return undefined;
    device.status = 'DENIED';
    this.note(station, `Device ${device.label} refused`);
    return station;
  }

  /** One attached device, without counting or touching anything. */
  getDevice(id: string, fingerprint: string): PrintStationDevice | undefined {
    return this.stations.get(id)?.devices.find(entry => entry.fingerprint === fingerprint);
  }

  /** Heartbeat from an attached device; also keeps the panel's list honest. */
  touch(id: string, fingerprint: string): PrintStationDevice | undefined {
    const station = this.stations.get(id);
    if (!station) return undefined;
    const device = station.devices.find(entry => entry.fingerprint === fingerprint);
    if (!device) return undefined;
    device.lastSeenAt = this.now();
    return device;
  }

  /**
   * Books one copy against a device.
   *
   * The route records the actual `print_copies` row; this only enforces that the
   * device is allowed to, and keeps the counters the panel displays.
   */
  /**
   * Books one copy against a device, for a sheet that is about to be released.
   *
   * The caller must decrypt first and book second: booking a copy that then
   * fails to decrypt would burn quota and write a ledger row for a sheet no
   * printer ever saw.
   */
  releasePrint(id: string, fingerprint: string, copies = 1): ReleaseResult {
    this.refresh();
    const station = this.stations.get(id);
    if (!station) return { ok: false, reason: 'NOT_FOUND', message: 'Print relay not found.', copiesUsed: 0 };
    if (station.status !== 'ACTIVE') {
      return { ok: false, reason: 'STATION_INACTIVE', message: `Print relay is ${station.status.toLowerCase()}.`, copiesUsed: 0 };
    }
    const device = station.devices.find(entry => entry.fingerprint === fingerprint);
    if (!device || device.status !== 'APPROVED') {
      return { ok: false, reason: 'NOT_APPROVED', message: 'The operator has not admitted this device yet.', copiesUsed: 0 };
    }
    if (device.prints + copies > MAX_PRINTS_PER_DEVICE) {
      return {
        ok: false,
        reason: 'DEVICE_QUOTA',
        message: `This device has already released ${device.prints} of ${MAX_PRINTS_PER_DEVICE} permitted copies.`,
        copiesUsed: device.prints,
      };
    }
    if (station.prints + copies > station.maxPrints) {
      return {
        ok: false,
        reason: 'STATION_QUOTA',
        message: `This relay has reached its ceiling of ${station.maxPrints} copies.`,
        copiesUsed: device.prints,
      };
    }
    device.prints += copies;
    device.lastSeenAt = this.now();
    station.prints += copies;
    this.note(station, `Copy released to ${device.label}`);
    return { ok: true, station, device, copiesUsed: device.prints, reason: '', message: 'Copy released.' };
  }

  /** What the operator's panel may see - includes the pairing code. */
  toPanelView(station: PrintStationRecord) {
    return {
      id: station.id,
      code: station.code,
      label: station.label,
      examId: station.examId,
      examName: station.examName,
      paperVersionId: station.paperVersionId,
      centreId: station.centreId,
      createdAt: station.createdAt,
      expiresAt: station.expiresAt,
      remaining: describeStationRemaining(station.expiresAt, this.now()),
      status: station.status,
      failedAttempts: station.failedAttempts,
      attemptsLeft: Math.max(0, MAX_CODE_ATTEMPTS - station.failedAttempts),
      requireDeviceApproval: station.requireDeviceApproval,
      prints: station.prints,
      maxPrints: station.maxPrints,
      lastEvent: station.lastEvent,
      lastEventAt: station.lastEventAt,
      devices: station.devices.map(device => ({ ...device })),
    };
  }

  /**
   * What a relay device may see: its own state, nothing about the code, the
   * quota or the other devices.
   */
  toRelayView(station: PrintStationRecord, device: PrintStationDevice) {
    return {
      stationId: station.id,
      label: station.label,
      examName: station.examName,
      status: station.status,
      expiresAt: station.expiresAt,
      remaining: describeStationRemaining(station.expiresAt, this.now()),
      device: { status: device.status, label: device.label, prints: device.prints },
    };
  }

  private note(station: PrintStationRecord, message: string): void {
    station.lastEvent = message;
    station.lastEventAt = this.now();
  }
}

// ---------------------------------------------------------------------------
// LAN discovery
// ---------------------------------------------------------------------------

export interface DiscoveryBeacon {
  service: string;
  v: number;
  stationId: string;
  label: string;
  host: string;
  port: number;
  url: string;
  devices: number;
  expiresAt: string;
}

/**
 * The beacon deliberately carries no pairing code and no exam names - anything
 * on the Wi-Fi can read a broadcast, and a station id alone opens nothing.
 */
export function formatDiscoveryBeacon(input: {
  stationId: string;
  label: string;
  host: string;
  port: number;
  devices?: number;
  expiresAt: number;
}): string {
  const beacon: DiscoveryBeacon = {
    service: DISCOVERY_SERVICE,
    v: DISCOVERY_VERSION,
    stationId: input.stationId,
    label: input.label,
    host: input.host,
    port: input.port,
    url: buildStationUrl(input.host, input.port, input.stationId),
    devices: input.devices ?? 0,
    expiresAt: new Date(input.expiresAt).toISOString(),
  };
  return JSON.stringify(beacon);
}

export function parseDiscoveryBeacon(text: unknown): DiscoveryBeacon | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_BEACON_BYTES) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.service !== DISCOVERY_SERVICE) return null;
  if (Number(parsed.v) !== DISCOVERY_VERSION) return null;
  if (typeof parsed.stationId !== 'string' || !parsed.stationId) return null;
  if (typeof parsed.url !== 'string' || !/^https?:\/\//.test(parsed.url)) return null;
  return {
    service: DISCOVERY_SERVICE,
    v: DISCOVERY_VERSION,
    stationId: parsed.stationId,
    label: typeof parsed.label === 'string' ? parsed.label : DEFAULT_STATION_LABEL,
    host: typeof parsed.host === 'string' ? parsed.host : '',
    port: Number(parsed.port) || 0,
    url: parsed.url,
    devices: Number(parsed.devices) || 0,
    expiresAt: typeof parsed.expiresAt === 'string' ? parsed.expiresAt : '',
  };
}

export interface DiscoveryBeaconHandle {
  /** Sends one round of beacons immediately (used by tests and by probes). */
  announce(): void;
  stop(): void;
  readonly started: boolean;
}

/**
 * Advertises open relays on the local network.
 *
 * Two mechanisms, because campus Wi-Fi often blocks one of them: an unsolicited
 * broadcast every few seconds (so a device already listening sees the station
 * appear by itself), and a reply to a unicast probe (so a device that just
 * joined can ask "is anything printing here?"). Both are best-effort - a network
 * that forbids broadcast must not take the server down with it, hence the
 * `unref()` and the swallowed errors.
 */
export function startPrintDiscoveryBeacon(options: {
  port: number;
  beaconPort?: number;
  intervalMs?: number;
  describe: () => Array<{ stationId: string; label: string; devices: number; expiresAt: number }>;
  onError?: (error: Error) => void;
}): DiscoveryBeaconHandle {
  const beaconPort = options.beaconPort ?? DISCOVERY_BEACON_PORT;
  const intervalMs = options.intervalMs ?? DISCOVERY_BEACON_INTERVAL_MS;
  const addresses = listLanAddresses(os.networkInterfaces());
  const target = addresses[0] || '127.0.0.1';

  let socket: dgram.Socket | null = null;
  let timer: NodeJS.Timeout | null = null;

  const announce = () => {
    if (!socket) return;
    const stations = options.describe();
    if (stations.length === 0) return;
    const payloads = stations.map(station =>
      Buffer.from(formatDiscoveryBeacon({ ...station, host: target, port: options.port }), 'utf8')
    );
    for (const payload of payloads) {
      socket.send(payload, beaconPort, '255.255.255.255', error => {
        if (error) options.onError?.(error);
      });
    }
  };

  try {
    socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    socket.on('error', error => options.onError?.(error));
    socket.on('message', (message, remote) => {
      const parsed = parseDiscoveryBeacon(message.toString('utf8'));
      if (parsed) return; // someone else's advertisement
      let probe: any;
      try {
        probe = JSON.parse(message.toString('utf8'));
      } catch {
        return;
      }
      if (!probe || probe.service !== DISCOVERY_SERVICE || probe.type !== 'probe') return;
      const stations = options.describe();
      if (stations.length === 0 || !socket) return;
      for (const station of stations) {
        const reply = Buffer.from(
          formatDiscoveryBeacon({ ...station, host: target, port: options.port }),
          'utf8'
        );
        socket.send(reply, remote.port, remote.address, error => {
          if (error) options.onError?.(error);
        });
      }
    });
    socket.bind(beaconPort, () => {
      try {
        socket?.setBroadcast(true);
      } catch (error) {
        options.onError?.(error as Error);
      }
    });
    socket.unref();
    timer = setInterval(announce, intervalMs);
    timer.unref?.();
    return { announce, stop: () => stop(socket, timer), started: true };
  } catch (error) {
    options.onError?.(error as Error);
    stop(socket, timer);
    return { announce: () => {}, stop: () => {}, started: false };
  }
}

function stop(socket: dgram.Socket | null, timer: NodeJS.Timeout | null): void {
  if (timer) clearInterval(timer);
  try {
    socket?.close();
  } catch {
    /* already closed */
  }
}

/** The probe a device sends when it wants relays to answer right now. */
export function formatDiscoveryProbe(): string {
  return JSON.stringify({ service: DISCOVERY_SERVICE, v: DISCOVERY_VERSION, type: 'probe' });
}

// ---------------------------------------------------------------------------
// The relay page
// ---------------------------------------------------------------------------

/**
 * HTML for the device that opens the relay URL.
 *
 * It is deliberately a standalone page rather than part of the React app: the
 * device that prints is a phone or a spare laptop that has never signed in and
 * must not need to. It talks to three JSON endpoints and nothing else, carries
 * no external assets (a centre's Wi-Fi may have no route to the internet), and
 * is handed only the *public* station id - the pairing code is typed by the
 * human and checked server-side. Nothing in this page's source is a secret.
 */
export function renderPrintRelayPage(options: { stationId: string }): string {
  const stationId = JSON.stringify(options.stationId);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>ZeroLeak Secure Print Relay</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #020617; color: #e2e8f0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  header { padding: 14px 18px; border-bottom: 1px solid #1e293b; background: #0f172a; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  header .badge { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; border: 1px solid #065f46; background: #022c22; color: #6ee7b7; padding: 3px 8px; border-radius: 999px; }
  header h1 { font-size: 15px; margin: 0; font-weight: 700; }
  header .meta { font-size: 11px; color: #94a3b8; margin-left: auto; text-align: right; }
  main { padding: 18px; max-width: 900px; margin: 0 auto; }
  .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 18px; margin-bottom: 16px; }
  .card h2 { font-size: 14px; margin: 0 0 6px; }
  .muted { color: #94a3b8; font-size: 12px; line-height: 1.5; }
  .code-row { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
  input[type=text] { flex: 1 1 160px; min-width: 0; padding: 12px 14px; font-size: 22px; letter-spacing: .35em; text-align: center; font-family: ui-monospace, monospace; border-radius: 10px; border: 1px solid #334155; background: #020617; color: #f8fafc; }
  button { cursor: pointer; border: 0; border-radius: 10px; padding: 13px 18px; font-size: 13px; font-weight: 700; background: #4f46e5; color: #fff; }
  button.secondary { background: #1e293b; color: #cbd5e1; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  .status { margin-top: 12px; font-size: 12px; padding: 10px 12px; border-radius: 10px; border: 1px solid #334155; background: #020617; display: none; }
  .status.error { display: block; border-color: #7f1d1d; background: #2a0a0a; color: #fca5a5; }
  .status.info { display: block; border-color: #1e3a8a; background: #0b1220; color: #93c5fd; }
  .pulse { animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
  .bar { display: flex; gap: 12px; flex-wrap: wrap; font-size: 11px; color: #94a3b8; margin-bottom: 14px; }
  .bar b { color: #f8fafc; font-family: ui-monospace, monospace; }
  .sheet { position: relative; background: #fff; color: #0f172a; border-radius: 10px; padding: 26px 22px; overflow: hidden; }
  .sheet h3 { margin: 0 0 2px; font-size: 19px; }
  .sheet .sub { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: #475569; font-weight: 700; }
  .sheet .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; font-size: 11px; border-top: 1px solid #cbd5e1; margin-top: 12px; padding-top: 10px; }
  .q { border-bottom: 1px solid #e2e8f0; padding: 12px 0; font-size: 13px; }
  .q:last-child { border-bottom: 0; }
  .q .head { display: flex; justify-content: space-between; gap: 10px; font-weight: 700; }
  .q .marks { color: #64748b; font-size: 11px; white-space: nowrap; }
  .opts { margin-top: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .opts span { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 7px; font-size: 12px; }
  .wm { position: absolute; inset: 0; pointer-events: none; opacity: .10; display: flex; flex-wrap: wrap; gap: 26px; align-content: center; justify-content: center; transform: rotate(-24deg); }
  .wm div { font: 700 9px ui-monospace, monospace; border: 1px solid rgba(15,23,42,.35); border-radius: 4px; padding: 4px 6px; text-align: center; }
  .actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 14px; }
  @media print {
    body { background: #fff; color: #000; }
    header, .card, .actions, .bar, .status, .muted { display: none !important; }
    main { padding: 0; max-width: none; }
    .sheet { border: 0; border-radius: 0; padding: 0; box-shadow: none; }
    .wm { opacity: .12; }
  }
</style>
</head>
<body>
<header>
  <div>
    <div class="badge">ZeroLeak Secure Print Relay</div>
    <h1 id="station-label">Loading relay…</h1>
  </div>
  <div class="meta" id="station-meta"></div>
</header>
<main>
  <section class="card" id="gate">
    <h2>Pairing code required</h2>
    <p class="muted">
      Read the 6-digit pairing code from the examination centre operator's screen and enter it here.
      This device is not admitted to the relay until the operator approves it, and every sheet printed
      here is recorded against this workstation.
    </p>
    <div class="code-row">
      <input id="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="Pairing code" />
      <button id="submit">Request access</button>
    </div>
    <div class="status" id="gate-status"></div>
  </section>

  <section class="card" id="pending" style="display:none">
    <h2>Waiting for operator approval</h2>
    <p class="muted">This device is asking to join the relay. The operator must admit it on the centre panel; keep this page open.</p>
    <p class="muted pulse" id="pending-detail"></p>
    <div class="actions"><button class="secondary" id="retry">Re-check now</button></div>
  </section>

  <section class="card" id="ready" style="display:none">
    <div class="bar" id="watermark-bar"></div>
    <div id="paper"></div>
    <div class="actions">
      <button id="print">Authorise &amp; print this copy</button>
      <span class="muted" id="print-state"></span>
    </div>
    <div class="status" id="print-status"></div>
  </section>

  <section class="card" id="closed" style="display:none">
    <h2 id="closed-title">Relay unavailable</h2>
    <p class="muted" id="closed-detail"></p>
  </section>
</main>
<script>
(function () {
  var STATION_ID = ${stationId};
  var FINGERPRINT_KEY = 'zeroleak.printDeviceId';
  var LABEL_KEY = 'zeroleak.printDeviceLabel';
  var state = { device: null, watermark: null, paper: null, poll: null, busy: false };

  function deviceId() {
    var id = null;
    try { id = window.localStorage.getItem(FINGERPRINT_KEY); } catch (e) { id = null; }
    if (!id) {
      id = 'dev-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      try { window.localStorage.setItem(FINGERPRINT_KEY, id); } catch (e) { /* private mode */ }
    }
    return id;
  }

  function deviceLabel() {
    var label = null;
    try { label = window.localStorage.getItem(LABEL_KEY); } catch (e) { label = null; }
    if (!label) {
      label = (window.navigator.userAgent.indexOf('Mobile') >= 0 ? 'Mobile device' : 'Workstation') + ' ' + deviceId().slice(-4).toUpperCase();
      try { window.localStorage.setItem(LABEL_KEY, label); } catch (e) { /* private mode */ }
    }
    return label;
  }

  function el(id) { return document.getElementById(id); }
  function show(id, visible) { el(id).style.display = visible ? '' : 'none'; }

  function setStatus(node, kind, text) {
    node.className = 'status' + (kind ? ' ' + kind : '');
    node.textContent = text || '';
  }

  function request(url, body) {
    return fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    }).then(function (response) {
      return response.json().then(function (payload) {
        return { ok: response.ok, status: response.status, payload: payload };
      });
    });
  }

  function paintHeader(view) {
    if (!view) return;
    el('station-label').textContent = view.label || 'Secure print relay';
    el('station-meta').textContent = (view.examName ? view.examName + ' • ' : '') + (view.remaining || '');
  }

  function paintWatermark(watermark) {
    state.watermark = watermark;
    var bar = el('watermark-bar');
    bar.textContent = '';
    if (!watermark) return;
    var pairs = [
      ['CENTRE', watermark.centreId],
      ['OPERATOR', watermark.operatorName],
      ['DEVICE', watermark.deviceFingerprint],
      ['PRINTED AT', new Date(watermark.timestamp).toLocaleString()],
      ['TRANSACTION', watermark.sessionTxRef]
    ];
    pairs.forEach(function (pair) {
      var span = document.createElement('span');
      var b = document.createElement('b');
      b.textContent = String(pair[1] || '—');
      span.textContent = pair[0] + ': ';
      span.appendChild(b);
      bar.appendChild(span);
    });
  }

  function buildWatermarkOverlay() {
    var wm = document.createElement('div');
    wm.className = 'wm';
    var w = state.watermark || {};
    for (var i = 0; i < 8; i++) {
      var tile = document.createElement('div');
      tile.innerHTML = '';
      var line1 = document.createElement('div');
      line1.textContent = String(w.organizationName || 'EXAMINATION AUTHORITY');
      var line2 = document.createElement('div');
      line2.textContent = 'CENTRE ' + String(w.centreId || '') + ' | OP ' + String(w.operatorName || '');
      var line3 = document.createElement('div');
      line3.textContent = String(w.deviceFingerprint || '') + ' | ' + String(w.timestamp || '');
      tile.appendChild(line1); tile.appendChild(line2); tile.appendChild(line3);
      wm.appendChild(tile);
    }
    return wm;
  }

  function paintPaper(paper) {
    state.paper = paper;
    var host = el('paper');
    host.textContent = '';
    var sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.appendChild(buildWatermarkOverlay());

    var org = document.createElement('div');
    org.className = 'sub';
    org.textContent = (state.watermark && state.watermark.organizationName) || 'National Examination Authority';
    sheet.appendChild(org);

    var title = document.createElement('h3');
    title.textContent = paper.exam_name || paper.subject || 'Examination Paper';
    sheet.appendChild(title);

    var subject = document.createElement('div');
    subject.className = 'sub';
    subject.textContent = 'Subject: ' + (paper.subject || 'Standardised examination');
    sheet.appendChild(subject);

    var questions = paper.questions || [];
    var grid = document.createElement('div');
    grid.className = 'grid';
    [['Total questions', String(questions.length)], ['Duration', '180 minutes'], ['Maximum marks', String(paper.total_marks || '100')]].forEach(function (pair) {
      var cell = document.createElement('div');
      cell.textContent = pair[0] + ': ';
      var b = document.createElement('strong');
      b.textContent = pair[1];
      cell.appendChild(b);
      grid.appendChild(cell);
    });
    sheet.appendChild(grid);

    var body = document.createElement('div');
    body.style.marginTop = '16px';
    body.style.position = 'relative';
    body.style.zIndex = '2';
    questions.forEach(function (question, index) {
      var block = document.createElement('div');
      block.className = 'q';
      var head = document.createElement('div');
      head.className = 'head';
      var text = document.createElement('div');
      text.textContent = 'Q' + (index + 1) + '. ' + (question.content_text || question.content || '');
      var marks = document.createElement('div');
      marks.className = 'marks';
      marks.textContent = '[' + (question.marks || 4) + ' marks]';
      head.appendChild(text); head.appendChild(marks);
      block.appendChild(head);

      var raw = question.options_json || question.options;
      var options = [];
      if (Array.isArray(raw)) options = raw;
      else if (typeof raw === 'string' && raw) { try { options = JSON.parse(raw); } catch (e) { options = []; } }
      if (options.length) {
        var list = document.createElement('div');
        list.className = 'opts';
        options.forEach(function (option) {
          var cell = document.createElement('span');
          cell.textContent = typeof option === 'string' ? option : (option && (option.text || option.label)) || '';
          list.appendChild(cell);
        });
        block.appendChild(list);
      }
      body.appendChild(block);
    });
    sheet.appendChild(body);
    host.appendChild(sheet);
  }

  function paintDeviceCount(device) {
    state.device = device;
    var used = device && typeof device.prints === 'number' ? device.prints : 0;
    el('print-state').textContent = 'Copies released from this device: ' + used + '.';
  }

  function awaitApproval() {
    show('gate', false); show('ready', false); show('closed', false); show('pending', true);
    el('pending-detail').textContent = 'Device: ' + deviceLabel() + ' (' + deviceId() + ') — checking every 3 seconds…';
    if (state.poll) window.clearInterval(state.poll);
    state.poll = window.setInterval(check, 3000);
  }

  function check() {
    return request('/api/print-relay/' + encodeURIComponent(STATION_ID) + '/status?fingerprint=' + encodeURIComponent(deviceId()))
      .then(function (res) {
        var payload = res.payload || {};
        if (payload.station) paintHeader(payload.station);
        if (payload.state === 'APPROVED' && payload.paper) {
          if (state.poll) { window.clearInterval(state.poll); state.poll = null; }
          show('pending', false); show('gate', false); show('closed', false); show('ready', true);
          paintWatermark(payload.watermark);
          paintPaper(payload.paper);
          paintDeviceCount(payload.device);
          setStatus(el('print-status'), 'info', payload.message || '');
          return;
        }
        if (payload.state === 'PENDING_APPROVAL') { awaitApproval(); return; }
        if (payload.state === 'BLOCKED') {
          if (state.poll) { window.clearInterval(state.poll); state.poll = null; }
          show('pending', false); show('ready', false); show('gate', false); show('closed', true);
          el('closed-title').textContent = payload.title || 'Relay unavailable';
          el('closed-detail').textContent = payload.message || 'Ask the operator to reopen the print relay.';
          return;
        }
        if (payload.state === 'NEEDS_CODE') {
          if (state.poll) { window.clearInterval(state.poll); state.poll = null; }
          show('pending', false); show('ready', false); show('closed', false); show('gate', true);
        }
      })
      .catch(function () { /* a dropped Wi-Fi packet must not kill the page */ });
  }

  el('submit').addEventListener('click', function () {
    if (state.busy) return;
    var code = (el('code').value || '').replace(/\\D+/g, '');
    if (code.length !== 6) { setStatus(el('gate-status'), 'error', 'Enter all six digits of the pairing code.'); return; }
    state.busy = true;
    el('submit').disabled = true;
    setStatus(el('gate-status'), 'info', 'Checking pairing code…');
    request('/api/print-relay/' + encodeURIComponent(STATION_ID) + '/access', {
      code: code, label: deviceLabel(), fingerprint: deviceId()
    }).then(function (res) {
      var payload = res.payload || {};
      if (payload.station) paintHeader(payload.station);
      if (!res.ok || payload.ok === false) {
        setStatus(el('gate-status'), 'error', payload.message || 'Access refused.');
        if (payload.state === 'BLOCKED') check();
        return;
      }
      if (payload.state === 'PENDING_APPROVAL') { awaitApproval(); return; }
      if (payload.state === 'APPROVED') { check(); return; }
      setStatus(el('gate-status'), 'error', 'Unexpected relay response.');
    }).catch(function () {
      setStatus(el('gate-status'), 'error', 'Could not reach the relay. Check that this device is on the same Wi-Fi.');
    }).then(function () {
      state.busy = false;
      el('submit').disabled = false;
    });
  });

  el('code').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') el('submit').click();
  });

  el('retry').addEventListener('click', function () { check(); });

  el('print').addEventListener('click', function () {
    if (state.busy) return;
    state.busy = true;
    el('print').disabled = true;
    setStatus(el('print-status'), 'info', 'Recording this copy in the print ledger…');
    request('/api/print-relay/' + encodeURIComponent(STATION_ID) + '/print', {
      fingerprint: deviceId(), label: deviceLabel()
    }).then(function (res) {
      var payload = res.payload || {};
      if (!res.ok) { setStatus(el('print-status'), 'error', payload.message || 'Copy refused.'); return; }
      if (payload.device) paintDeviceCount(payload.device);
      if (payload.watermark) { paintWatermark(payload.watermark); paintPaper(state.paper); }
      setStatus(el('print-status'), 'info', payload.message || 'Copy recorded.');
      window.setTimeout(function () { window.print(); }, 250);
    }).catch(function () {
      setStatus(el('print-status'), 'error', 'Could not record the copy; nothing was sent to the printer.');
    }).then(function () {
      state.busy = false;
      el('print').disabled = false;
    });
  });

  check();
})();
</script>
</body>
</html>`;
}

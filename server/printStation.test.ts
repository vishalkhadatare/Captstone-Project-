import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DISCOVERY_SERVICE,
  MAX_CODE_ATTEMPTS,
  MAX_PRINTS_PER_DEVICE,
  MAX_STATION_DEVICES,
  PRINT_AUTH_TTL_MS,
  PrintAuthorizationGuard,
  PrintStationHub,
  STATION_CODE_LENGTH,
  STATION_TTL_MS,
  buildStationUrl,
  buildStationUrls,
  createStationCode,
  describeStationRemaining,
  evaluatePrintSecurity,
  formatDiscoveryBeacon,
  formatDiscoveryProbe,
  listLanAddresses,
  normalizeStationCode,
  parseDiscoveryBeacon,
  renderPrintRelayPage,
  startPrintDiscoveryBeacon,
  stationCodeMatches,
} from './printStation.ts';

// ---------------------------------------------------------------------------
// Pairing codes
// ---------------------------------------------------------------------------

test('createStationCode is always six digits', () => {
  for (let i = 0; i < 400; i++) {
    const code = createStationCode();
    assert.equal(code.length, STATION_CODE_LENGTH);
    assert.match(code, /^\d{6}$/);
  }
});

test('createStationCode actually varies (a fixed code would be no lock at all)', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(createStationCode());
  assert.ok(seen.size > 150, `expected many distinct codes, saw ${seen.size}`);
});

test('normalizeStationCode accepts what a human types and nothing else', () => {
  assert.equal(normalizeStationCode('123456'), '123456');
  assert.equal(normalizeStationCode(' 123 456 '), '123456');
  assert.equal(normalizeStationCode('123-456'), '123456');
  assert.equal(normalizeStationCode('12345'), null);
  assert.equal(normalizeStationCode('1234567'), null);
  assert.equal(normalizeStationCode('abcdef'), null);
  assert.equal(normalizeStationCode(''), null);
  assert.equal(normalizeStationCode(undefined), null);
  assert.equal(normalizeStationCode(123456 as unknown), null);
});

test('stationCodeMatches compares exactly', () => {
  assert.equal(stationCodeMatches('123456', '123456'), true);
  assert.equal(stationCodeMatches('123456', '123457'), false);
  assert.equal(stationCodeMatches('123456', '12345'), false);
  assert.equal(stationCodeMatches('123456', ''), false);
});

// ---------------------------------------------------------------------------
// LAN addresses
// ---------------------------------------------------------------------------

test('listLanAddresses skips loopback and internal adapters and ranks private ranges first', () => {
  const addresses = listLanAddresses({
    lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true } as any],
    wifi: [
      { address: '169.254.10.4', family: 'IPv4', internal: false } as any,
      { address: '192.168.1.24', family: 'IPv4', internal: false } as any,
      { address: '10.20.30.40', family: 'IPv4', internal: false } as any,
      { address: 'fe80::1', family: 'IPv6', internal: false } as any,
    ],
    vm: [{ address: '172.17.0.1', family: 'IPv4', internal: false } as any],
  });
  assert.deepEqual(addresses, ['192.168.1.24', '10.20.30.40', '172.17.0.1', '169.254.10.4']);
});

test('listLanAddresses tolerates empty and undefined adapter lists', () => {
  assert.deepEqual(listLanAddresses({}), []);
  assert.deepEqual(listLanAddresses({ eth0: undefined as any }), []);
});

test('buildStationUrls builds one link per reachable address', () => {
  assert.equal(buildStationUrl('192.168.1.24', 3000, 'abc123'), 'http://192.168.1.24:3000/print/abc123');
  assert.deepEqual(buildStationUrls(['10.0.0.5', '192.168.0.9'], 4000, 'x'), [
    'http://10.0.0.5:4000/print/x',
    'http://192.168.0.9:4000/print/x',
  ]);
});

test('describeStationRemaining reads as a human sentence', () => {
  const now = 1_000_000;
  assert.equal(describeStationRemaining(now + 5 * 60_000, now), '5 min left');
  assert.equal(describeStationRemaining(now + 30_000, now), '30s left');
  assert.equal(describeStationRemaining(now, now), 'expired');
  assert.equal(describeStationRemaining(now - 1, now), 'expired');
});

// ---------------------------------------------------------------------------
// Print security gate
// ---------------------------------------------------------------------------

const passingSecurity = {
  role: 'CENTRE_OPERATOR',
  allowedRoles: ['CENTRE_OPERATOR'],
  deviceApproved: true,
  deviceFingerprint: 'FINGERPRINT-1',
  paperVersionStatus: 'APPROVED',
  examUnlocked: true,
  unlockLabel: '2026-10-01 09:30',
  alreadyPrinted: 10,
  authorizedCopies: 100,
  requestedCopies: 5,
  station: null,
};

test('evaluatePrintSecurity passes a clean release', () => {
  const { allowed, checks } = evaluatePrintSecurity(passingSecurity);
  assert.equal(allowed, true);
  assert.deepEqual(
    checks.map(check => check.status),
    ['PASS', 'PASS', 'PASS', 'PASS', 'PASS']
  );
});

test('evaluatePrintSecurity refuses the wrong role and an unbound workstation', () => {
  const { allowed, checks } = evaluatePrintSecurity({
    ...passingSecurity,
    role: 'AUDITOR',
    deviceApproved: false,
  });
  assert.equal(allowed, false);
  assert.equal(checks.find(check => check.id === 'ROLE')?.status, 'FAIL');
  assert.equal(checks.find(check => check.id === 'DEVICE')?.status, 'FAIL');
});

test('evaluatePrintSecurity refuses a dead paper version by name', () => {
  const invalidated = evaluatePrintSecurity({ ...passingSecurity, paperVersionStatus: 'INVALIDATED' });
  assert.equal(invalidated.allowed, false);
  assert.match(invalidated.checks.find(check => check.id === 'PAPER')!.detail, /INVALIDATED/);

  const compromised = evaluatePrintSecurity({ ...passingSecurity, paperVersionStatus: 'COMPROMISED' });
  assert.equal(compromised.allowed, false);
});

test('evaluatePrintSecurity refuses a closed time-lock', () => {
  const { allowed, checks } = evaluatePrintSecurity({
    ...passingSecurity,
    examUnlocked: false,
    unlockLabel: '2026-10-01 09:30',
  });
  assert.equal(allowed, false);
  assert.match(checks.find(check => check.id === 'TIME_LOCK')!.detail, /2026-10-01 09:30/);
});

test('evaluatePrintSecurity refuses a release bigger than the remaining quota', () => {
  const { allowed, checks } = evaluatePrintSecurity({
    ...passingSecurity,
    alreadyPrinted: 98,
    authorizedCopies: 100,
    requestedCopies: 5,
  });
  assert.equal(allowed, false);
  assert.match(checks.find(check => check.id === 'QUOTA')!.detail, /Only 2 of 100/);
});

test('a live relay is reported, and an inactive one is only a warning', () => {
  const live = evaluatePrintSecurity({
    ...passingSecurity,
    station: { status: 'ACTIVE', devices: 2, prints: 4 },
  });
  assert.equal(live.allowed, true);
  assert.equal(live.checks.find(check => check.id === 'RELAY')?.status, 'PASS');

  const paused = evaluatePrintSecurity({
    ...passingSecurity,
    station: { status: 'PAUSED', devices: 2, prints: 4 },
  });
  assert.equal(paused.allowed, true, 'a paused relay must not block the workstation print path');
  assert.equal(paused.checks.find(check => check.id === 'RELAY')?.status, 'WARN');
});

// ---------------------------------------------------------------------------
// Print authorisation guard
// ---------------------------------------------------------------------------

const binding = {
  userId: 'user-1',
  deviceFingerprint: 'FP-A',
  examId: 'exam-1',
  paperVersionId: 'pv-1',
  copies: 3,
};

test('an armed release can be spent exactly once, with the right code', () => {
  const guard = new PrintAuthorizationGuard('secret');
  const armed = guard.arm(binding);
  assert.equal(armed.code.length, STATION_CODE_LENGTH);

  const first = guard.consume({ ...binding, token: armed.token, code: armed.code });
  assert.equal(first.ok, true);

  const replay = guard.consume({ ...binding, token: armed.token, code: armed.code });
  assert.equal(replay.ok, false);
  assert.match(replay.reason, /already been used/);
});

test('the wrong code is refused and does not burn the arming', () => {
  const guard = new PrintAuthorizationGuard('secret');
  const armed = guard.arm(binding);
  const wrong = guard.consume({ ...binding, token: armed.token, code: '000000' });
  assert.equal(wrong.ok, false);
  assert.match(wrong.reason, /did not match/);
  assert.equal(guard.consume({ ...binding, token: armed.token, code: armed.code }).ok, true);
});

test('an arming is bound to its exam, copy count and workstation', () => {
  const guard = new PrintAuthorizationGuard('secret');
  const armed = guard.arm(binding);

  const otherCopies = guard.consume({ ...binding, copies: 50, token: armed.token, code: armed.code });
  assert.equal(otherCopies.ok, false);
  assert.match(otherCopies.reason, /does not match/);

  const otherExam = guard.consume({ ...binding, examId: 'exam-2', token: armed.token, code: armed.code });
  assert.equal(otherExam.ok, false);

  const otherDevice = guard.consume({ ...binding, deviceFingerprint: 'FP-B', token: armed.token, code: armed.code });
  assert.equal(otherDevice.ok, false);
});

test('an arming expires, and a foreign signature is refused', () => {
  let now = 1_000_000;
  const guard = new PrintAuthorizationGuard('secret', { now: () => now });
  const armed = guard.arm(binding);
  assert.equal(armed.expiresAt, now + PRINT_AUTH_TTL_MS);

  now += PRINT_AUTH_TTL_MS + 1;
  const late = guard.consume({ ...binding, token: armed.token, code: armed.code });
  assert.equal(late.ok, false);
  assert.match(late.reason, /expired/);

  // A release armed by a process holding a different secret must not be
  // honoured here, whichever check catches it first.
  const forger = new PrintAuthorizationGuard('other-secret', { now: () => now });
  const forged = forger.arm(binding);
  const verified = guard.consume({ ...binding, token: forged.token, code: forged.code });
  assert.equal(verified.ok, false);
  assert.notEqual(verified.reason, '');
});

test('a malformed token or a non-numeric code is refused without throwing', () => {
  const guard = new PrintAuthorizationGuard('secret');
  assert.equal(guard.consume({ ...binding, token: 'nonsense', code: '123456' }).ok, false);
  const armed = guard.arm(binding);
  assert.equal(guard.consume({ ...binding, token: armed.token, code: 'abcdef' }).ok, false);
  assert.equal(guard.consume({ ...binding, token: armed.token, code: '' }).ok, false);
});

test('peekCode exposes the code for the panel but not through the token', () => {
  const guard = new PrintAuthorizationGuard('secret');
  const armed = guard.arm(binding);
  assert.equal(guard.peekCode(armed.token), armed.code);
  assert.equal(armed.token.includes(armed.code), false, 'the code must never ride inside the token');
});

// ---------------------------------------------------------------------------
// The relay hub
// ---------------------------------------------------------------------------

function makeHub(startAt = 1_000_000) {
  let now = startAt;
  const hub = new PrintStationHub({ now: () => now });
  const tick = (ms: number) => {
    now += ms;
  };
  const base = {
    orgId: 'org-1',
    examId: 'exam-1',
    examName: 'Data Structures — End Semester',
    paperVersionId: 'pv-1',
    centreId: 'CENTRE-01',
    createdBy: 'user-1',
    createdByName: 'Operator One',
  };
  return { hub, tick, base, getNow: () => now };
}

test('a station keeps its own code and never hands it to a device view', () => {
  const { hub, base } = makeHub();
  const station = hub.create({ ...base, code: '424242' });
  assert.equal(station.code, '424242');
  assert.equal(hub.get(station.id)?.code, '424242');

  const panel = hub.toPanelView(station);
  assert.equal(panel.code, '424242', 'the panel is the one place the code belongs');

  const device = { fingerprint: 'FP-A', label: 'Phone', ip: '10.0.0.9', userAgent: 'ua' };
  const relay = hub.toRelayView(station, {
    ...device,
    status: 'APPROVED',
    requestedAt: 0,
    approvedAt: 0,
    lastSeenAt: 0,
    prints: 0,
  });
  assert.equal(JSON.stringify(relay).includes('424242'), false);
});

test('a new device with the right code waits for approval and prints nothing', () => {
  const { hub, base } = makeHub();
  const station = hub.create({ ...base });
  const device = { fingerprint: 'FP-A', label: 'Desk 2 laptop', ip: '10.0.0.9', userAgent: 'ua' };

  const redeemed = hub.redeem(station.id, station.code, device);
  assert.equal(redeemed.ok, true);
  assert.equal(redeemed.ok && redeemed.state, 'PENDING_APPROVAL');
  assert.equal(redeemed.ok && redeemed.created, true);

  const blocked = hub.releasePrint(station.id, 'FP-A');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'NOT_APPROVED');

  hub.approveDevice(station.id, 'FP-A');
  const released = hub.releasePrint(station.id, 'FP-A');
  assert.equal(released.ok, true);
  assert.equal(released.copiesUsed, 1);
  assert.equal(hub.get(station.id)?.prints, 1);
});

test('getDevice reports a device without booking anything', () => {
  const { hub, base } = makeHub();
  const station = hub.create({ ...base });
  assert.equal(hub.getDevice(station.id, 'FP-A'), undefined);

  hub.redeem(station.id, station.code, { fingerprint: 'FP-A', label: 'Desk 2', ip: 'x', userAgent: 'ua' });
  const device = hub.getDevice(station.id, 'FP-A');
  assert.equal(device?.status, 'PENDING_APPROVAL');
  assert.equal(device?.prints, 0);
  assert.equal(hub.get(station.id)?.prints, 0, 'reading a device must not consume quota');
});

test('requireDeviceApproval:false admits a device immediately', () => {
  const { hub, base } = makeHub();
  const station = hub.create({ ...base, requireDeviceApproval: false });
  const redeemed = hub.redeem(station.id, station.code, { fingerprint: 'FP-A', label: 'Desk 3', ip: 'x', userAgent: 'ua' });
  assert.equal(redeemed.ok && redeemed.state, 'APPROVED');
  assert.equal(hub.releasePrint(station.id, 'FP-A').ok, true);
});

test('wrong pairing codes are counted against the station and then lock it', () => {
  const { hub, base } = makeHub();
  const station = hub.create({ ...base });
  const device = { fingerprint: 'FP-A', label: 'Phone', ip: 'x', userAgent: 'ua' };
  const wrong = station.code === '000000' ? '111111' : '000000';

  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    const result = hub.redeem(station.id, wrong, { ...device, fingerprint: `FP-${attempt}` });
    assert.equal(result.ok, false);
    assert.equal(result.attemptsLeft, MAX_CODE_ATTEMPTS - attempt);
  }

  assert.equal(hub.get(station.id)?.status, 'LOCKED');
  const afterLock = hub.redeem(station.id, station.code, device);
  assert.equal(afterLock.ok, false);
  assert.equal(afterLock.reason, 'LOCKED');

  assert.equal(hub.unlock(station.id)?.status, 'ACTIVE');
  assert.equal(hub.redeem(station.id, station.code, device).ok, true);
});

test('a correct code clears nothing about a denied device', () => {
  const { hub, base } = makeHub();
  const station = hub.create({ ...base });
  const device = { fingerprint: 'FP-A', label: 'Phone', ip: 'x', userAgent: 'ua' };
  hub.redeem(station.id, station.code, device);
  hub.denyDevice(station.id, 'FP-A');

  const again = hub.redeem(station.id, station.code, device);
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'DEVICE_DENIED');
});

test('a revoked or paused station stops admitting devices at once', () => {
  const { hub, base } = makeHub();
  const revoked = hub.create({ ...base });
  hub.revoke(revoked.id, 'operator');
  assert.equal(hub.redeem(revoked.id, revoked.code, { fingerprint: 'FP-A', label: 'x', ip: 'x', userAgent: 'ua' }).reason, 'REVOKED');
  assert.equal(hub.releasePrint(revoked.id, 'FP-A').reason, 'STATION_INACTIVE');

  const paused = hub.create({ ...base });
  hub.setPaused(paused.id, true);
  assert.equal(hub.redeem(paused.id, paused.code, { fingerprint: 'FP-B', label: 'x', ip: 'x', userAgent: 'ua' }).reason, 'PAUSED');
  hub.setPaused(paused.id, false);
  assert.equal(hub.redeem(paused.id, paused.code, { fingerprint: 'FP-B', label: 'x', ip: 'x', userAgent: 'ua' }).ok, true);
});

test('an unknown station is refused rather than silently accepted', () => {
  const { hub } = makeHub();
  const result = hub.redeem('does-not-exist', '123456', { fingerprint: 'FP-A', label: 'x', ip: 'x', userAgent: 'ua' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'NOT_FOUND');
});

test('a station expires on its own', () => {
  const { hub, tick, base } = makeHub();
  const station = hub.create({ ...base, ttlMs: 60_000 });
  assert.equal(hub.get(station.id)?.status, 'ACTIVE');

  tick(60_001);
  assert.equal(hub.get(station.id)?.status, 'EXPIRED');
  assert.equal(hub.redeem(station.id, station.code, { fingerprint: 'FP-A', label: 'x', ip: 'x', userAgent: 'ua' }).reason, 'EXPIRED');
  assert.deepEqual(hub.activeStations(), [], 'an expired station must not be advertised on the LAN');
});

test('the default lifetime is the documented half hour', () => {
  const { hub, base } = makeHub();
  const station = hub.create({ ...base });
  assert.equal(station.expiresAt - station.createdAt, STATION_TTL_MS);
});

test('a device has its own copy ceiling, and the station has one too', () => {
  const { hub, base } = makeHub();
  const station = hub.create({ ...base, requireDeviceApproval: false });
  hub.redeem(station.id, station.code, { fingerprint: 'FP-A', label: 'x', ip: 'x', userAgent: 'ua' });

  for (let i = 0; i < MAX_PRINTS_PER_DEVICE; i++) {
    assert.equal(hub.releasePrint(station.id, 'FP-A').ok, true, `copy ${i + 1} should be permitted`);
  }
  const exhausted = hub.releasePrint(station.id, 'FP-A');
  assert.equal(exhausted.ok, false);
  assert.equal(exhausted.reason, 'DEVICE_QUOTA');

  const capped = hub.create({ ...base, requireDeviceApproval: false, maxPrints: 2 });
  hub.redeem(capped.id, capped.code, { fingerprint: 'FP-B', label: 'x', ip: 'x', userAgent: 'ua' });
  assert.equal(hub.releasePrint(capped.id, 'FP-B').ok, true);
  assert.equal(hub.releasePrint(capped.id, 'FP-B').ok, true);
  assert.equal(hub.releasePrint(capped.id, 'FP-B').reason, 'STATION_QUOTA');
});

test('the station refuses more devices than it can track', () => {
  const { hub, base } = makeHub();
  const station = hub.create({ ...base });
  for (let i = 0; i < MAX_STATION_DEVICES; i++) {
    const result = hub.redeem(station.id, station.code, { fingerprint: `FP-${i}`, label: `dev ${i}`, ip: 'x', userAgent: 'ua' });
    assert.equal(result.ok, true);
  }
  const overflow = hub.redeem(station.id, station.code, { fingerprint: 'FP-extra', label: 'extra', ip: 'x', userAgent: 'ua' });
  assert.equal(overflow.ok, false);
  assert.equal(overflow.reason, 'DEVICE_LIMIT');
});

test('the panel lists newest first and can scope to one organisation', () => {
  const { hub, tick, base } = makeHub();
  const first = hub.create({ ...base });
  tick(1_000);
  const second = hub.create({ ...base, orgId: 'org-2' });

  assert.deepEqual(
    hub.list().map(station => station.id),
    [second.id, first.id]
  );
  assert.deepEqual(
    hub.list('org-1').map(station => station.id),
    [first.id]
  );
  assert.deepEqual(
    hub.activeStations('org-1').map(station => station.id),
    [first.id]
  );
});

test('the panel view carries the counters the operator needs', () => {
  const { hub, base } = makeHub();
  const station = hub.create({ ...base, requireDeviceApproval: false });
  hub.redeem(station.id, station.code, { fingerprint: 'FP-A', label: 'Desk 2', ip: '10.0.0.9', userAgent: 'ua' });
  hub.releasePrint(station.id, 'FP-A');

  const view = hub.toPanelView(hub.get(station.id)!);
  assert.equal(view.status, 'ACTIVE');
  assert.equal(view.prints, 1);
  assert.equal(view.attemptsLeft, MAX_CODE_ATTEMPTS);
  assert.equal(view.devices.length, 1);
  assert.equal(view.devices[0].label, 'Desk 2');
  assert.match(view.remaining, /min left/);
});

// ---------------------------------------------------------------------------
// LAN discovery
// ---------------------------------------------------------------------------

test('a discovery beacon round-trips and carries no secret', () => {
  const beacon = formatDiscoveryBeacon({
    stationId: 'STATION-1',
    label: 'Desk 2 printer',
    host: '192.168.1.24',
    port: 3000,
    devices: 2,
    expiresAt: 1_800_000_000_000,
  });

  const parsed = parseDiscoveryBeacon(beacon);
  assert.ok(parsed);
  assert.equal(parsed!.service, DISCOVERY_SERVICE);
  assert.equal(parsed!.stationId, 'STATION-1');
  assert.equal(parsed!.url, 'http://192.168.1.24:3000/print/STATION-1');
  assert.equal(parsed!.devices, 2);
  assert.equal(/\d{6}/.test(beacon), false, 'a code must never travel in a broadcast');
});

test('foreign, oversized or malformed beacons are ignored rather than parsed', () => {
  assert.equal(parseDiscoveryBeacon('not json'), null);
  assert.equal(parseDiscoveryBeacon(''), null);
  assert.equal(parseDiscoveryBeacon('x'.repeat(3_000)), null);
  assert.equal(parseDiscoveryBeacon(JSON.stringify({ service: 'someone-else', v: 1, stationId: 'a', url: 'http://x/' })), null);
  assert.equal(parseDiscoveryBeacon(JSON.stringify({ service: DISCOVERY_SERVICE, v: 99, stationId: 'a', url: 'http://x/' })), null);
  assert.equal(parseDiscoveryBeacon(JSON.stringify({ service: DISCOVERY_SERVICE, v: 1, stationId: 'a', url: 'file:///etc' })), null);
  assert.equal(parseDiscoveryBeacon(undefined), null);
});

test('the probe is never mistaken for an advertisement', () => {
  const probe = formatDiscoveryProbe();
  assert.equal(parseDiscoveryBeacon(probe), null);
  assert.match(probe, /probe/);
});

test('the beacon starts, announces and stops without taking the process down', () => {
  const handle = startPrintDiscoveryBeacon({
    port: 3_000,
    beaconPort: 45_499,
    intervalMs: 60_000,
    describe: () => [{ stationId: 'STATION-1', label: 'Relay', devices: 0, expiresAt: Date.now() + 60_000 }],
  });
  assert.equal(handle.started, true);
  handle.announce();
  handle.stop();
  assert.ok(true);
});

// ---------------------------------------------------------------------------
// The relay page
// ---------------------------------------------------------------------------

test('the served page knows the station id and nothing else secret', () => {
  const { hub, base } = makeHub();
  const station = hub.create({ ...base, code: '987654' });
  const html = renderPrintRelayPage({ stationId: station.id });

  assert.equal(html.startsWith('<!doctype html>'), true);
  assert.ok(html.includes(station.id), 'the page must know which relay it belongs to');
  assert.equal(html.includes('987654'), false, 'the pairing code must never be served to a device');
  assert.ok(html.includes('/api/print-relay/'), 'the page needs its relay endpoints');
  assert.ok(html.includes('window.print()'), 'the page must be able to print');
  assert.equal(html.includes('http://'), false, 'the page must not hard-code a host');
});

test('the page escapes nothing into markup because it builds DOM nodes', () => {
  const html = renderPrintRelayPage({ stationId: 'a-b_c' });
  assert.ok(html.includes(JSON.stringify('a-b_c')));
  assert.equal(html.includes('innerHTML = '), true, 'sanity: the page is the scripted one we wrote');
  assert.equal(/<script src=/.test(html), false, 'a centre Wi-Fi may have no internet: no external assets');
});

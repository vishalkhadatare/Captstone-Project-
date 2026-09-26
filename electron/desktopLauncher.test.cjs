'use strict';

/**
 * Port resolution and server-launch planning.
 *
 * The regression this pins: an environment that exports `PORT=0` ("any free
 * port") used to make the shell poll `http://localhost:0`, so the server looked
 * like it never started and the app showed nothing at all.
 *
 * Run:  node --test electron/desktopLauncher.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  DEFAULT_PORT,
  parsePort,
  resolvePort,
  planServerCommand,
  planServerStop,
} = require('./desktopLauncher.cjs');

// ---------------------------------------------------------------------------
// parsePort
// ---------------------------------------------------------------------------

const PARSE_OK = [
  [3000, 3000, 'a number'],
  ['3000', 3000, 'a numeric string'],
  ['  3000  ', 3000, 'padded digits'],
  ['1', 1, 'the lowest usable port'],
  ['65535', 65535, 'the highest usable port'],
  ['8080', 8080, 'an ordinary alternative'],
  ['00003000', 3000, 'leading zeroes'],
];

for (const [input, expected, why] of PARSE_OK) {
  test(`parsePort accepts ${JSON.stringify(input)} — ${why}`, () => {
    assert.equal(parsePort(input), expected);
  });
}

const PARSE_NULL = [
  [0, 'the any-free-port sentinel'],
  ['0', 'the sentinel as a string'],
  ['000', 'the sentinel with zeroes'],
  [-1, 'a negative number'],
  ['-3000', 'a negative string'],
  [65536, 'one above the maximum'],
  ['99999', 'far above the maximum'],
  ['abc', 'free text'],
  ['', 'an empty string'],
  ['   ', 'whitespace'],
  ['3000.5', 'a fractional port'],
  ['3e3', 'scientific notation'],
  ['0x0BB8', 'hexadecimal'],
  ['3000abc', 'trailing junk'],
  [null, 'null'],
  [undefined, 'undefined'],
  [NaN, 'NaN'],
  [Infinity, 'Infinity'],
  [{}, 'an object'],
  [[], 'an array'],
  [true, 'a boolean'],
];

for (const [input, why] of PARSE_NULL) {
  test(`parsePort rejects ${JSON.stringify(input)} — ${why}`, () => {
    assert.equal(parsePort(input), null);
  });
}

// ---------------------------------------------------------------------------
// resolvePort
// ---------------------------------------------------------------------------

const RESOLVE = [
  [{}, DEFAULT_PORT, 'an empty environment'],
  [{ PORT: '3000' }, 3000, 'PORT set to the default'],
  [{ PORT: '4000' }, 4000, 'PORT set to something else'],
  [{ PORT: '0' }, DEFAULT_PORT, 'PORT=0 — the sentinel must be ignored'],
  [{ PORT: 0 }, DEFAULT_PORT, 'PORT=0 as a number'],
  [{ PORT: '' }, DEFAULT_PORT, 'an empty PORT'],
  [{ PORT: 'nonsense' }, DEFAULT_PORT, 'a garbage PORT'],
  [{ PORT: '70000' }, DEFAULT_PORT, 'an out-of-range PORT'],
  [{ PORT: '-1' }, DEFAULT_PORT, 'a negative PORT'],
  [{ ZEROLEAK_PORT: '5555' }, 5555, 'an explicit override'],
  [{ ZEROLEAK_PORT: '5555', PORT: '4000' }, 5555, 'the override wins over PORT'],
  [{ ZEROLEAK_PORT: '0', PORT: '4000' }, 4000, 'an invalid override falls through to PORT'],
  [{ ZEROLEAK_PORT: 'nonsense', PORT: '4000' }, 4000, 'a garbage override falls through to PORT'],
  [{ ZEROLEAK_PORT: '', PORT: '' }, DEFAULT_PORT, 'both empty'],
  [{ ZEROLEAK_PORT: '0', PORT: '0' }, DEFAULT_PORT, 'both the sentinel'],
  [{ ZEROLEAK_PORT: null, PORT: null }, DEFAULT_PORT, 'both null'],
  [{ ZEROLEAK_PORT: undefined, PORT: undefined }, DEFAULT_PORT, 'both undefined'],
  [{ PORT: '65535' }, 65535, 'the maximum'],
  [{ PORT: '1' }, 1, 'the minimum'],
  [{ ZEROLEAK_PORT: ' 6000 ' }, 6000, 'a padded override'],
];

for (const [env, expected, why] of RESOLVE) {
  test(`resolvePort(${JSON.stringify(env)}) === ${expected} — ${why}`, () => {
    assert.equal(resolvePort(env), expected);
  });
}

test('resolvePort defaults when called with nothing', () => {
  assert.equal(resolvePort(), DEFAULT_PORT);
});

test('resolvePort never returns the any-free-port sentinel', () => {
  const candidates = [undefined, null, '', '0', 0, 'x', '-1', '99999'];
  for (const value of candidates) {
    assert.notEqual(resolvePort({ PORT: value }), 0, `PORT=${JSON.stringify(value)} produced 0`);
    assert.notEqual(resolvePort({ ZEROLEAK_PORT: value, PORT: value }), 0);
  }
});

test('DEFAULT_PORT matches the port ZeroLeak.s server hardcodes', () => {
  assert.equal(DEFAULT_PORT, 3000);
});

// ---------------------------------------------------------------------------
// planServerCommand
// ---------------------------------------------------------------------------

const ROOT = process.platform === 'win32' ? 'C:\\projects\\zeroleak' : '/projects/zeroleak';
const BUNDLE = path.join(ROOT, 'dist', 'server.cjs');
const TSX = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const SOURCE = path.join(ROOT, 'server.ts');

/** Build an `exists` predicate over a set of paths. */
const existsOnly = (paths) => {
  const set = new Set(paths.map((entry) => path.normalize(entry)));
  return (candidate) => set.has(path.normalize(candidate));
};

test('prefers tsx over the bundle so source edits are picked up', () => {
  const plan = planServerCommand({ root: ROOT, exists: existsOnly([BUNDLE, TSX]), env: {} });
  assert.equal(plan.ok, true);
  assert.equal(plan.useBundled, false);
  assert.equal(plan.entry, SOURCE);
  assert.deepEqual(plan.args, [TSX, SOURCE]);
});

test('uses the bundle when tsx is missing', () => {
  const plan = planServerCommand({ root: ROOT, exists: existsOnly([BUNDLE]), env: {} });
  assert.equal(plan.ok, true);
  assert.equal(plan.useBundled, true);
  assert.deepEqual(plan.args, [BUNDLE]);
});

test('uses the bundle when explicitly requested', () => {
  const plan = planServerCommand({
    root: ROOT,
    exists: existsOnly([BUNDLE, TSX]),
    env: { ZEROLEAK_USE_BUNDLE: '1' },
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.useBundled, true);
  assert.deepEqual(plan.args, [BUNDLE]);
});

test('ZEROLEAK_USE_BUNDLE=0 does not force the bundle', () => {
  const plan = planServerCommand({
    root: ROOT,
    exists: existsOnly([BUNDLE, TSX]),
    env: { ZEROLEAK_USE_BUNDLE: '0' },
  });
  assert.equal(plan.useBundled, false);
});

test('falls back to source-only when no bundle exists', () => {
  const plan = planServerCommand({ root: ROOT, exists: existsOnly([TSX]), env: {} });
  assert.equal(plan.ok, true);
  assert.equal(plan.useBundled, false);
  assert.deepEqual(plan.args, [TSX, SOURCE]);
});

test('reports failure when neither entry point exists', () => {
  const plan = planServerCommand({ root: ROOT, exists: existsOnly([]), env: {} });
  assert.equal(plan.ok, false);
  assert.equal(plan.entry, null);
  assert.deepEqual(plan.args, []);
  assert.match(plan.reason, /No server entry point found/);
});

test('the failure message names both locations it looked in', () => {
  const plan = planServerCommand({ root: ROOT, exists: existsOnly([]), env: {} });
  assert.ok(plan.reason.includes(BUNDLE));
  assert.ok(plan.reason.includes(TSX));
});

test('the plan carries the resolved port', () => {
  const plan = planServerCommand({
    root: ROOT,
    exists: existsOnly([TSX]),
    env: { PORT: '0' },
  });
  assert.equal(plan.port, DEFAULT_PORT, 'PORT=0 must never reach the spawn environment');
});

test('args never start with a shell flag', () => {
  for (const paths of [[TSX], [BUNDLE], [BUNDLE, TSX], []]) {
    const plan = planServerCommand({ root: ROOT, exists: existsOnly(paths), env: {} });
    for (const arg of plan.args) {
      assert.ok(!/^-{1,2}(c|cmd|e)$/i.test(arg), `unexpected shell flag ${arg}`);
    }
  }
});

test('a project root containing a space survives planning intact', () => {
  const spaced = 'C:\\Users\\me\\CAPSTONE PROJECT\\0leakexam';
  const plan = planServerCommand({
    root: spaced,
    exists: existsOnly([path.join(spaced, 'node_modules', 'tsx', 'dist', 'cli.mjs')]),
    env: {},
  });
  assert.equal(plan.ok, true);
  assert.ok(plan.entry.includes('CAPSTONE PROJECT'), 'the space must be preserved, not split');
  assert.ok(plan.args[0].includes('CAPSTONE PROJECT'));
});

test('the entry point is always an absolute path under the project root', () => {
  for (const paths of [[TSX], [BUNDLE], [BUNDLE, TSX]]) {
    const plan = planServerCommand({ root: ROOT, exists: existsOnly(paths), env: {} });
    assert.ok(plan.entry.startsWith(ROOT), `${plan.entry} escaped the project root`);
  }
});

// ---------------------------------------------------------------------------
// planServerStop
// ---------------------------------------------------------------------------

test('windows stops the child tree with taskkill', () => {
  const plan = planServerStop('win32', 4321);
  assert.equal(plan.command, 'taskkill');
  assert.deepEqual(plan.args, ['/pid', '4321', '/f', '/t']);
  assert.equal(plan.signal, null);
});

test('taskkill never goes through a shell', () => {
  const plan = planServerStop('win32', 1);
  assert.ok(!plan.args.includes('/s'));
  assert.notEqual(plan.command, 'cmd');
});

for (const platform of ['linux', 'darwin', 'freebsd', 'openbsd', 'aix']) {
  test(`${platform} stops the child with SIGTERM`, () => {
    const plan = planServerStop(platform, 99);
    assert.equal(plan.command, null);
    assert.deepEqual(plan.args, []);
    assert.equal(plan.signal, 'SIGTERM');
  });
}

test('the pid is carried through as a string for every platform', () => {
  for (const platform of ['win32', 'linux', 'darwin']) {
    const plan = planServerStop(platform, 777);
    if (plan.command) {
      assert.equal(plan.args[1], '777');
    } else {
      assert.equal(plan.signal, 'SIGTERM');
    }
  }
});

'use strict';

/**
 * Port and server-launch planning for the desktop shell.
 *
 * Extracted from `main.cjs` because this is where a genuinely nasty bug lived:
 * some environments export `PORT=0` (meaning "pick any free port"), and
 * `Number(process.env.PORT || 3000)` turns that into `0` — so the shell polled
 * `http://localhost:0`, concluded the server never started, and the app looked
 * broken with no error anywhere.
 *
 * Keeping the decision here means it is unit tested instead of only observable
 * by running the whole app (`electron/desktopLauncher.test.cjs`).
 */

const path = require('node:path');

/** ZeroLeak's server hardcodes 3000; it is the default the shell expects. */
const DEFAULT_PORT = 3000;

/**
 * Parse a usable TCP port. Returns null for anything that is not a real,
 * bindable port — including `0`, which means "any free port" and would point the
 * shell at `http://localhost:0`.
 */
const parsePort = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number.parseInt(text, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return null;
  return parsed;
};

/**
 * Pick the port the shell will talk to: explicit override first, then `PORT`,
 * then the default. Invalid values are skipped rather than trusted.
 */
const resolvePort = (env = {}) => parsePort(env.ZEROLEAK_PORT) ?? parsePort(env.PORT) ?? DEFAULT_PORT;

/**
 * Decide how to start ZeroLeak's server.
 *
 * Prefer running the source through tsx so edits are picked up; fall back to the
 * built bundle when tsx is unavailable, or when explicitly requested.
 *
 * `exists` is injected so the decision is testable without a filesystem.
 */
const planServerCommand = ({ root, exists, env = {} }) => {
  const bundled = path.join(root, 'dist', 'server.cjs');
  const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const source = path.join(root, 'server.ts');

  const hasBundle = exists(bundled);
  const hasTsx = exists(tsxCli);
  const useBundled = hasBundle && (!hasTsx || env.ZEROLEAK_USE_BUNDLE === '1');

  if (!useBundled && !hasTsx) {
    return {
      ok: false,
      useBundled: false,
      entry: null,
      args: [],
      port: resolvePort(env),
      reason: `No server entry point found (looked for ${bundled} and ${tsxCli})`,
    };
  }

  const entry = useBundled ? bundled : source;
  return {
    ok: true,
    useBundled,
    entry,
    args: useBundled ? [entry] : [tsxCli, entry],
    port: resolvePort(env),
    reason: useBundled
      ? 'Using the pre-built server bundle'
      : 'Running server.ts through tsx so edits are picked up',
  };
};

/**
 * How to stop the server we spawned.
 *
 * Windows needs `taskkill /t` to reach the child tree; elsewhere SIGTERM is
 * enough. Returned as data because `shell: true` must never be used here — the
 * project path contains a space, which a shell would shred.
 */
const planServerStop = (platform, pid) =>
  platform === 'win32'
    ? { command: 'taskkill', args: ['/pid', String(pid), '/f', '/t'], signal: null }
    : { command: null, args: [], signal: 'SIGTERM' };

module.exports = {
  DEFAULT_PORT,
  parsePort,
  resolvePort,
  planServerCommand,
  planServerStop,
};

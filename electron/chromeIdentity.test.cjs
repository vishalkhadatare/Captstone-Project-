'use strict';

/**
 * The identity the streamed browser reports, tested without a browser.
 *
 * These are the facts Google's sign-in check acts on, so they are asserted rather
 * than eyeballed: the user agent must not announce Electron, the brand list must
 * name Google Chrome at the same major version the user agent claims, and
 * installing the override must REPLACE Chromium's own `sec-ch-ua` header instead
 * of adding a second one - two brand lists in one request is a louder mismatch
 * than the one this module exists to remove.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  buildIdentity,
  USER_AGENT,
  CLIENT_HINT_HEADERS,
  PRELOAD,
  installClientHintHeaders,
  identityWebPreferences,
} = require('./chromeIdentity.cjs');

/** The version the probe measured on this machine, so the numbers are the real ones. */
const REAL = buildIdentity('152.0.7977.130', 'win32');
const WIN_UA = /Windows NT 10\.0; Win64; x64/;

/** A session stand-in that hands back the listener the module registers. */
const fakeSession = () => {
  const registered = { listener: null };
  return {
    registered,
    ses: {
      webRequest: {
        onBeforeSendHeaders: (listener) => {
          registered.listener = listener;
        },
      },
    },
  };
};

/** Run one request through the listener and return the headers it hands back. */
const runRequest = (listener, requestHeaders, url = 'https://accounts.google.com/') => {
  let captured = null;
  listener({ url, requestHeaders }, (result) => {
    captured = result;
  });
  return captured;
};

test('the reported user agent is a plain Chrome one, with no Electron in it', () => {
  assert.equal(
    REAL.userAgent,
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.130 Safari/537.36',
  );
  assert.doesNotMatch(REAL.userAgent, /Electron/i);
  assert.doesNotMatch(REAL.userAgent, /Headless/i);
  assert.match(REAL.userAgent, WIN_UA);
});

test('the brand list names Google Chrome at the version the user agent claims', () => {
  const major = /Chrome\/(\d+)/.exec(REAL.userAgent)[1];
  assert.equal(
    REAL.clientHintHeaders['sec-ch-ua'],
    '"Not A(Brand";v="99", "Google Chrome";v="152", "Chromium";v="152"',
  );
  assert.equal(REAL.brands.includes(`"Google Chrome";v="${major}"`), true);
  // Chrome's own GREASE entry is part of looking like Chrome.
  assert.match(REAL.clientHintHeaders['sec-ch-ua'], /"Not A\(Brand";v="99"/);
  assert.equal(
    REAL.clientHintHeaders['sec-ch-ua-full-version-list'],
    '"Not A(Brand)";v="99.0.0.0", "Google Chrome";v="152.0.7977.130", "Chromium";v="152.0.7977.130"',
  );
});

test('the identity in this process is the real Chromium version', () => {
  // Plain Node has no Chrome to name; Electron always does, and a user agent
  // reporting an old or invented Chromium is a mismatch in itself.
  if (!process.versions.chrome) return;
  assert.match(USER_AGENT, new RegExp(`Chrome/${process.versions.chrome} `));
  assert.ok(CLIENT_HINT_HEADERS['sec-ch-ua'].includes(`"Google Chrome";v="${process.versions.chrome.split('.')[0]}"`));
});

test('the override replaces Chromium’s own header rather than duplicating it', () => {
  const { ses, registered } = fakeSession();
  installClientHintHeaders(ses);

  const result = runRequest(registered.listener, {
    'Sec-CH-UA': '"Not?A_Brand";v="24", "Chromium";v="152"',
    'Sec-CH-UA-Platform': '"Windows"',
    'User-Agent': USER_AGENT,
  });

  const names = Object.keys(result.requestHeaders).filter((key) => key.toLowerCase() === 'sec-ch-ua');
  assert.equal(names.length, 1, 'exactly one sec-ch-ua header, whatever its case');
  assert.equal(names[0], 'Sec-CH-UA', "Chromium's own key is reused, so the network stack sees one header");
  assert.equal(result.requestHeaders['Sec-CH-UA'], CLIENT_HINT_HEADERS['sec-ch-ua']);
  // The honest hints are left exactly as Chromium computed them.
  assert.equal(result.requestHeaders['Sec-CH-UA-Platform'], '"Windows"');
  assert.equal(result.requestHeaders['User-Agent'], USER_AGENT);
});

test('a brand new header is added when Chromium sent none', () => {
  const { ses, registered } = fakeSession();
  installClientHintHeaders(ses);

  const result = runRequest(registered.listener, { 'User-Agent': USER_AGENT });
  assert.equal(result.requestHeaders['sec-ch-ua'], CLIENT_HINT_HEADERS['sec-ch-ua']);
});

test('an observer sees what Chromium proposed and what was sent', () => {
  const { ses, registered } = fakeSession();
  const seen = [];
  installClientHintHeaders(ses, { observe: (fact) => seen.push(fact) });

  runRequest(registered.listener, { 'sec-ch-ua': '"Chromium";v="152"' });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].proposed, '"Chromium";v="152"');
  assert.equal(seen[0].sent, CLIENT_HINT_HEADERS['sec-ch-ua']);
});

test('a broken observer cannot break the request it is watching', () => {
  const { ses, registered } = fakeSession();
  installClientHintHeaders(ses, {
    observe: () => {
      throw new Error('observer is broken');
    },
  });

  const result = runRequest(registered.listener, {});
  assert.equal(result.requestHeaders['sec-ch-ua'], CLIENT_HINT_HEADERS['sec-ch-ua']);
});

test('the preload the windows are told to use exists on disk', () => {
  // A typo here would silently cost every streamed view its identity, because a
  // missing preload is not an error Electron reports.
  assert.ok(fs.existsSync(PRELOAD), `missing preload: ${PRELOAD}`);
  assert.equal(PRELOAD, path.join(__dirname, 'chromeIdentityPreload.cjs'));
  assert.deepEqual(identityWebPreferences(), { preload: PRELOAD });
});

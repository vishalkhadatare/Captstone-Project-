'use strict';

/**
 * Regression suite for the pane navigation policy.
 *
 * The bug this pins: `window.open('about:blank', name)` is how OAuth SDKs create
 * their popup placeholder before assigning `location`. The shell used to refuse
 * it, so the call returned `null` and Prism reported "We couldn't open the
 * sign-in window. Check your popup blocker and try again." — which looks exactly
 * like popup blocking and sent everyone chasing the wrong cause.
 *
 * Run:  node --test electron/panePolicy.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  PANE_PARTITION,
  PRISM_ORIGIN,
  PRISM_HOST,
  AUTH_WINDOW_HOSTS,
  isAllowedPaneNavigation,
  isAllowedAuthWindowUrl,
  isAuthCompletionUrl,
  authWindowBounds,
  hostOf,
  isPrismUrl,
} = require('./panePolicy.cjs');

// ---------------------------------------------------------------------------
// authWindowBounds — the size of a sign-in popup
// ---------------------------------------------------------------------------

test('a sign-in popup is given the opener\u2019s size, not the 500x600 the site asked for', () => {
  // The measured case: Google opens its consent screen at 500x600, and the
  // streamed browser follows it, which shrank the panel's whole picture.
  assert.deepEqual(authWindowBounds({ width: 1280, height: 673 }), { width: 1280, height: 673 });
});

test('a sign-in popup never opens smaller than a desktop layout', () => {
  assert.deepEqual(authWindowBounds({ width: 500, height: 600 }), { width: 1024, height: 640 });
});

test('a popup opened before any window is on screen still gets a usable size', () => {
  assert.deepEqual(authWindowBounds(null), { width: 1024, height: 640 });
  assert.deepEqual(authWindowBounds(undefined), { width: 1024, height: 640 });
  assert.deepEqual(authWindowBounds({}), { width: 1024, height: 640 });
});

test('nonsense bounds fall back to the floor instead of propagating NaN', () => {
  assert.deepEqual(authWindowBounds({ width: 'wide', height: NaN }), { width: 1024, height: 640 });
  assert.deepEqual(authWindowBounds({ width: 1400.7, height: 900.2 }), { width: 1400, height: 900 });
});

test('the floor is configurable, so the host owns the number', () => {
  assert.deepEqual(authWindowBounds({ width: 300, height: 300 }, { minWidth: 800, minHeight: 600 }), {
    width: 800,
    height: 600,
  });
});

// ---------------------------------------------------------------------------
// isAllowedPaneNavigation — allowed
// ---------------------------------------------------------------------------

const ALLOWED = [
  // The OAuth popup placeholder. This is the regression.
  ['about:blank', 'the OAuth popup placeholder'],
  [' ABOUT:BLANK ', 'the placeholder, padded and shouting'],
  ['about:blank#state', 'a fragment on the placeholder'],

  // Real sign-in surfaces.
  ['https://prism.openai.com/', 'Prism itself'],
  ['https://accounts.google.com/o/oauth2/v2/auth?client_id=x', 'Google OAuth'],
  ['https://auth.openai.com/authorize?client_id=x', 'OpenAI auth'],
  ['https://github.com/login/oauth/authorize', 'GitHub OAuth'],
  ['https://login.microsoftonline.com/common/oauth2/v2.0/authorize', 'Microsoft'],
  ['https://prism.openai.com/auth/callback?code=abc', 'the Prism callback'],

  // blob: popups some SDKs build in a worker.
  ['blob:https://prism.openai.com/9f1c-4a', 'a blob popup'],
  ['BLOB:https://prism.openai.com/9f1c-4a', 'a blob popup, upper-cased'],

  // Loopback, for the RFC 8252 native-app redirect.
  ['http://127.0.0.1:8080/callback', 'a native-app loopback callback'],
  ['http://localhost:3000/tests/manual/prism-auth-harness.html', 'our own harness'],
  ['http://localhost/callback', 'loopback without a port'],
  ['http://127.0.0.1/', 'loopback root'],
  ['http://[::1]:1455/callback', 'IPv6 loopback'],
  ['http://LOCALHOST:3000/cb', 'loopback, upper-cased'],
];

for (const [url, why] of ALLOWED) {
  test(`allows ${JSON.stringify(url)} — ${why}`, () => {
    assert.equal(isAllowedPaneNavigation(url), true);
  });
}

// ---------------------------------------------------------------------------
// isAllowedPaneNavigation — refused
// ---------------------------------------------------------------------------

const REFUSED = [
  // Non-loopback http: a sign-in must never happen over cleartext.
  ['http://prism.openai.com/', 'cleartext Prism'],
  ['http://accounts.google.com/', 'cleartext Google'],
  ['http://evil.test/about:blank', 'cleartext lookalike'],
  ['http://10.0.0.5/callback', 'a LAN address, not loopback'],

  // Dangerous / non-navigable schemes.
  ['javascript:alert(1)', 'javascript:'],
  ['JavaScript:alert(1)', 'javascript:, mixed case'],
  ['data:text/html,<h1>hi</h1>', 'a data URL'],
  ['data:text/html,about:blank', 'a data URL that merely contains the placeholder'],
  ['file:///C:/Windows/System32/drivers/etc/hosts', 'a local file'],
  ['chrome://settings', 'a chrome:// page'],
  ['vbscript:msgbox(1)', 'vbscript:'],
  ['ws://prism.openai.com/socket', 'a websocket URL'],
  ['ftp://prism.openai.com/', 'ftp'],
  ['openai://auth/callback', 'a custom app scheme'],
  ['about:config', 'an about: page that is not the placeholder'],
  ['about:srcdoc', 'another about: page'],

  // Junk.
  ['', 'an empty string'],
  ['   ', 'whitespace only'],
  ['not a url at all', 'free text'],
  ['prism.openai.com', 'a bare hostname with no scheme'],
  ['//prism.openai.com/', 'a scheme-relative URL'],
  ['/auth/callback', 'a path with no origin'],
  [null, 'null'],
  [undefined, 'undefined'],
  [42, 'a number'],
  [{}, 'an object'],
];

for (const [url, why] of REFUSED) {
  test(`refuses ${JSON.stringify(url)} — ${why}`, () => {
    assert.equal(isAllowedPaneNavigation(url), false);
  });
}

// ---------------------------------------------------------------------------
// isPrismUrl
// ---------------------------------------------------------------------------

const PRISM_YES = [
  'https://prism.openai.com/',
  'https://prism.openai.com',
  'https://prism.openai.com/auth/callback?code=x',
  'https://PRISM.OPENAI.COM/',
  'https://chat.prism.openai.com/',
  'https://a.b.prism.openai.com/',
  'http://prism.openai.com/',
];

for (const url of PRISM_YES) {
  test(`isPrismUrl recognises ${url}`, () => {
    assert.equal(isPrismUrl(url), true);
  });
}

const PRISM_NO = [
  ['https://prism.openai.com.evil.test/', 'the host is a suffix of the probe'],
  ['https://notprism.openai.com/', 'a sibling host under openai.com'],
  ['https://openai.com/', 'openai.com itself'],
  ['https://evil.test/?next=https://prism.openai.com/', 'Prism only in a query param'],
  ['https://evil.test/#prism.openai.com', 'Prism only in a fragment'],
  ['https://prism-openai.com/', 'a hyphenated lookalike'],
  ['https://prismopenai.com/', 'a run-together lookalike'],
  ['', 'an empty string'],
  ['about:blank', 'the placeholder'],
];

for (const [url, why] of PRISM_NO) {
  test(`isPrismUrl rejects ${url} — ${why}`, () => {
    assert.equal(isPrismUrl(url), false);
  });
}

// ---------------------------------------------------------------------------
// isAllowedAuthWindowUrl — what the app itself may open a sign-in window for
// ---------------------------------------------------------------------------

const AUTH_WINDOW_ALLOWED = [
  ['https://prism.openai.com/', 'Prism itself'],
  ['https://prism.openai.com/auth/callback?code=x', 'a Prism callback'],
  ['https://accounts.google.com/', 'Google accounts'],
  ['https://accounts.google.com/o/oauth2/v2/auth?client_id=x&response_type=code', 'Google OAuth'],
  ['https://oauth2.googleapis.com/token', 'the Google token endpoint'],
  ['https://auth.openai.com/authorize', 'OpenAI auth'],
  ['https://chatgpt.com/auth/login', 'ChatGPT auth'],
  ['https://github.com/login/oauth/authorize', 'GitHub OAuth'],
  ['https://login.microsoftonline.com/common/oauth2/v2.0/authorize', 'Microsoft'],
  ['https://appleid.apple.com/auth/authorize', 'Apple'],
  ['https://chat.prism.openai.com/', 'a Prism subdomain'],
];

for (const [url, why] of AUTH_WINDOW_ALLOWED) {
  test(`opens a sign-in window for ${url} — ${why}`, () => {
    assert.equal(isAllowedAuthWindowUrl(url), true);
  });
}

const AUTH_WINDOW_REFUSED = [
  ['http://accounts.google.com/', 'cleartext Google'],
  ['http://prism.openai.com/', 'cleartext Prism'],
  ['https://example.com/', 'an unrelated host'],
  ['https://evil.test/?next=https://accounts.google.com/', 'Prism/Google only in a query param'],
  ['https://google.com/', 'google.com without the accounts subdomain'],
  ['https://accounts.google.com.evil.test/', 'a suffix attack on the allowlist'],
  ['https://prism.openai.com.evil.test/', 'a suffix attack on the Prism host'],
  ['https://myaccounts.google.com/', 'a lookalike that merely ends in the allowed name'],
  ['https://notprism.openai.com/', 'a sibling host under openai.com'],
  ['javascript:alert(1)', 'javascript:'],
  ['data:text/html,<h1>hi</h1>', 'a data URL'],
  ['file:///etc/passwd', 'a local file'],
  ['about:blank', 'the popup placeholder — it is not a sign-in surface'],
  ['', 'an empty string'],
  ['   ', 'whitespace only'],
  ['nonsense', 'free text'],
  [null, 'null'],
  [undefined, 'undefined'],
];

for (const [url, why] of AUTH_WINDOW_REFUSED) {
  test(`refuses a sign-in window for ${JSON.stringify(url)} — ${why}`, () => {
    assert.equal(isAllowedAuthWindowUrl(url), false);
  });
}

// ---------------------------------------------------------------------------
// hostOf
// ---------------------------------------------------------------------------

test('hostOf parses a hostname', () => {
  assert.equal(hostOf('https://prism.openai.com/auth'), 'prism.openai.com');
});

test('hostOf includes a non-default port', () => {
  assert.equal(hostOf('http://localhost:3000/x'), 'localhost');
});

test('hostOf returns an empty string for junk instead of throwing', () => {
  for (const junk of ['', 'nope', null, undefined, 42]) {
    assert.equal(hostOf(junk), '');
  }
});

// ---------------------------------------------------------------------------
// Cross-process constants must not drift
// ---------------------------------------------------------------------------

const RENDERER_POLICY_PATH = path.join(__dirname, '..', 'src', 'utils', 'prismAuth.ts');

test('the partition string matches the renderer copy in prismAuth.ts', () => {
  const source = fs.readFileSync(RENDERER_POLICY_PATH, 'utf8');
  const declared = source.match(/PANE_PARTITION\s*=\s*'([^']+)'/);
  assert.ok(declared, 'prismAuth.ts must declare PANE_PARTITION');
  assert.equal(declared[1], PANE_PARTITION);
});

test('the Prism origin matches the renderer copy in prismAuth.ts', () => {
  const source = fs.readFileSync(RENDERER_POLICY_PATH, 'utf8');
  const declared = source.match(/PRISM_APP_ORIGIN\s*=\s*'([^']+)'/);
  assert.ok(declared, 'prismAuth.ts must declare PRISM_APP_ORIGIN');
  assert.equal(declared[1], PRISM_ORIGIN);
});

test('the origin is built from the same host the matcher uses', () => {
  assert.equal(new URL(PRISM_ORIGIN).hostname, PRISM_HOST);
});

test('the partition is a persistent one, so a sign-in survives a restart', () => {
  assert.match(PANE_PARTITION, /^persist:/);
});

test('the sign-in allowlist matches the renderer OAuth provider rules exactly', () => {
  const source = fs.readFileSync(RENDERER_POLICY_PATH, 'utf8');
  const block = source.match(/OAUTH_PROVIDER_RULES[^=]*=\s*\[([\s\S]*?)\];/);
  assert.ok(block, 'prismAuth.ts must declare OAUTH_PROVIDER_RULES');

  const rendererHosts = new Set(
    Array.from(block[1].matchAll(/host:\s*'([^']+)'/g)).map((match) => match[1]),
  );
  rendererHosts.add(new URL(PRISM_ORIGIN).hostname);

  assert.deepEqual(
    [...AUTH_WINDOW_HOSTS].sort(),
    [...rendererHosts].sort(),
    'electron/panePolicy.cjs and src/utils/prismAuth.ts must allow the same sign-in surfaces',
  );
});

test('every allowlisted sign-in host is reachable over https', () => {
  for (const host of AUTH_WINDOW_HOSTS) {
    assert.equal(isAllowedAuthWindowUrl(`https://${host}/`), true, `${host} must be allowed`);
    assert.equal(isAllowedAuthWindowUrl(`http://${host}/`), false, `${host} must not be allowed over http`);
  }
});

// ---------------------------------------------------------------------------
// Generated matrices.
//
// A pane is a browser, so https is allowed everywhere. Everything below is about
// the exceptions, and generating the combinations is what makes this a matrix
// instead of a handful of lucky examples.
// ---------------------------------------------------------------------------

const HTTPS_HOSTS = [
  'prism.openai.com',
  'accounts.google.com',
  'auth.openai.com',
  'github.com',
  'example.com',
  'localhost.evil.test',
  '192.168.1.10',
  '[2001:db8::1]',
];

const HTTPS_SHAPES = [
  (host) => `https://${host}/`,
  (host) => `https://${host}/a/b?c=1`,
  (host) => `https://${host}/#fragment`,
];

/** An IP literal cannot take a subdomain, so that shape does not apply to one. */
const isIpLiteral = (host) => host.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(host);

for (const host of HTTPS_HOSTS) {
  const shapes = isIpLiteral(host) ? HTTPS_SHAPES : [...HTTPS_SHAPES, (value) => `https://a.b.${value}/x`];
  for (const shape of shapes) {
    const url = shape(host);
    test(`a pane may navigate to ${url}`, () => {
      assert.equal(isAllowedPaneNavigation(url), true);
    });
  }
}

const DANGEROUS_SCHEMES = [
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  'data:text/html,<h1>x</h1>',
  'file:///C:/Windows/System32/drivers/etc/hosts',
  'chrome://settings',
  'chrome-extension://abc/page.html',
  'ftp://prism.openai.com/',
  'ws://prism.openai.com/socket',
  'wss://prism.openai.com/socket',
  'vbscript:msgbox(1)',
  'mailto:someone@example.com',
  'tel:+15551234',
  'openai://auth/callback',
  'intent://scan/#Intent;scheme=zxing;end',
  'about:srcdoc',
  'about:config',
];

for (const url of DANGEROUS_SCHEMES) {
  test(`a pane may never navigate to ${url}`, () => {
    assert.equal(isAllowedPaneNavigation(url), false);
  });
}

const CLEARTEXT_NON_LOOPBACK = [
  'http://prism.openai.com/',
  'http://accounts.google.com/',
  'http://auth.openai.com/',
  'http://example.com/',
  'http://10.0.0.5/callback',
  'http://192.168.1.1/',
  'http://0.0.0.0/',
  'http://[2001:db8::1]/',
  'http://localhost.evil.test/',
  'http://127.0.0.1.evil.test/',
  'http://evil.test:3000/',
  'http://localhost:3000.evil.test/',
];

for (const url of CLEARTEXT_NON_LOOPBACK) {
  test(`a pane may not navigate to cleartext ${url}`, () => {
    assert.equal(isAllowedPaneNavigation(url), false);
  });
}

const CLEARTEXT_LOOPBACK = [
  'http://localhost/',
  'http://localhost:3000/',
  'http://localhost:3000/a/b?c=1',
  'http://127.0.0.1/',
  'http://127.0.0.1:8080/callback',
  'http://[::1]/',
  'http://[::1]:1455/callback',
  'http://LOCALHOST:3000/',
  'http://127.0.0.1:65535/callback',
  'http://localhost#fragment',
];

for (const url of CLEARTEXT_LOOPBACK) {
  test(`a pane may navigate to loopback ${url}`, () => {
    assert.equal(isAllowedPaneNavigation(url), true);
  });
}

const JUNK_URLS = ['', '   ', 'not a url', 'prism.openai.com', '//prism.openai.com/', '/auth', null, undefined, 42, {}, [], true];

for (const url of JUNK_URLS) {
  test(`a pane refuses junk ${JSON.stringify(url)}`, () => {
    assert.equal(isAllowedPaneNavigation(url), false);
  });
}

const ABOUT_VARIANTS = [
  ['about:blank', true],
  ['ABOUT:BLANK', true],
  ['about:blank#state', true],
  [' about:blank ', true],
  ['about:config', false],
  ['about:srcdoc', false],
  ['about:', false],
];

for (const [url, expected] of ABOUT_VARIANTS) {
  test(`the about: placeholder ${JSON.stringify(url)} → ${expected}`, () => {
    assert.equal(isAllowedPaneNavigation(url), expected);
  });
}

// ---------------------------------------------------------------------------
// Generated matrix: what the APP may open a sign-in window for.
// ---------------------------------------------------------------------------

const AUTH_WINDOW_SHAPES = [
  (host) => `https://${host}/`,
  (host) => `https://${host}/path?x=1#f`,
  (host) => `https://sub.${host}/deep`,
  (host) => `https://${host.toUpperCase()}/X`,
];

for (const host of AUTH_WINDOW_HOSTS) {
  for (const shape of AUTH_WINDOW_SHAPES) {
    const url = shape(host);
    test(`the app may open a sign-in window for ${url}`, () => {
      assert.equal(isAllowedAuthWindowUrl(url), true);
    });
  }
}

const AUTH_WINDOW_REJECTED = [
  'https://example.com/',
  'https://evil.test/',
  'https://google.com/',
  'https://accounts.google.com.evil.test/',
  'https://myaccounts.google.com/',
  'https://notaccounts.google.com/',
  'https://notprism.openai.com/',
  'https://prism.openai.com.evil.test/',
  'https://prism-openai.com/',
  'https://prismopenai.com/',
  'https://openai.com/',
  'https://chat.openai.com/',
  'https://platform.openai.com/',
  'https://github.io/',
  'https://localhost:3000/',
  'https://127.0.0.1/',
  'javascript:alert(1)',
  'data:text/html,hi',
  'file:///etc/passwd',
  'chrome://settings',
  'openai://auth',
  'about:blank',
  '',
  '   ',
  'nonsense',
  'prism.openai.com',
  '//prism.openai.com/',
  null,
  undefined,
  'http://prism.openai.com/',
  'http://accounts.google.com/',
];

for (const url of AUTH_WINDOW_REJECTED) {
  test(`the app refuses a sign-in window for ${JSON.stringify(url)}`, () => {
    assert.equal(isAllowedAuthWindowUrl(url), false);
  });
}

test('a controlle d subdomain of an allowlisted host is allowed', () => {
  // `github.com` is an allowed sign-in surface, and every github.com subdomain
  // is controlled by GitHub, so these must pass. A lookalike must not.
  assert.equal(isAllowedAuthWindowUrl('https://gist.github.com/'), true);
  assert.equal(isAllowedAuthWindowUrl('https://api.github.com/user'), true);
  assert.equal(isAllowedAuthWindowUrl('https://github.com.evil.test/'), false);
});

// ---------------------------------------------------------------------------
// isAuthCompletionUrl — when the sign-in chain has actually finished.
//
// Measured chain: chatgpt.com/auth/login → accounts.google.com →
// auth.openai.com/api/accounts/callback/google → back to the app. The window
// must only trigger a pane reload at the END of that, never mid-hand-off.
// ---------------------------------------------------------------------------

const AUTH_COMPLETE = [
  'https://prism.openai.com/',
  'https://prism.openai.com/auth/callback',
  'https://chat.prism.openai.com/x',
  'https://chatgpt.com/',
  'https://chatgpt.com/?model=gpt-5',
  'https://chatgpt.com/c/abc-def',
  'https://www.chatgpt.com/',
  'https://chatgpt.com/pricing',
];

for (const url of AUTH_COMPLETE) {
  test(`sign-in is complete when the window reaches ${url}`, () => {
    assert.equal(isAuthCompletionUrl(url), true);
  });
}

const AUTH_NOT_COMPLETE = [
  'https://chatgpt.com/auth/login',
  'https://chatgpt.com/auth/login_with?callback_path=/',
  'https://chatgpt.com/auth/callback',
  'https://auth.openai.com/',
  'https://auth.openai.com/api/accounts/callback/google',
  'https://accounts.google.com/',
  'https://accounts.google.com/o/oauth2/v2/auth?client_id=x',
  'https://example.com/',
  'https://chatgpt.com.evil.test/',
  'https://notchatgpt.com/',
  'https://chatgpt.com.evil.test/auth',
  'https://prism.openai.com.evil.test/',
  'javascript:alert(1)',
  'about:blank',
  '',
  null,
  undefined,
];

for (const url of AUTH_NOT_COMPLETE) {
  test(`sign-in is NOT complete at ${JSON.stringify(url)}`, () => {
    assert.equal(isAuthCompletionUrl(url), false);
  });
}

test('the mid-hand-off auth host never counts as completion', () => {
  // Reloading the pane while OpenAI is still redirecting through its callback
  // would race the flow, so this must stay false for every path on that host.
  for (const path of ['/', '/api/accounts/callback/google', '/authorize', '/u/login']) {
    assert.equal(isAuthCompletionUrl(`https://auth.openai.com${path}`), false, path);
  }
});

test('every OpenAI auth route is a non-completion while the app root is a completion', () => {
  assert.equal(isAuthCompletionUrl('https://chatgpt.com/auth/login_with?callback_path=/'), false);
  assert.equal(isAuthCompletionUrl('https://chatgpt.com/'), true);
});

// ---------------------------------------------------------------------------
// hostOf matrix
// ---------------------------------------------------------------------------

const HOST_ROWS = [
  ['https://prism.openai.com/a?b=1#c', 'prism.openai.com'],
  ['https://PRISM.OPENAI.COM/', 'prism.openai.com'],
  ['http://localhost:3000/x', 'localhost'],
  ['http://127.0.0.1:8080/cb', '127.0.0.1'],
  ['http://[::1]:1455/cb', '[::1]'],
  ['https://user:pass@prism.openai.com/', 'prism.openai.com'],
  ['https://a.b.c.example.com/', 'a.b.c.example.com'],
  ['about:blank', ''],
  ['not a url', ''],
  ['', ''],
  [null, ''],
  [undefined, ''],
];

for (const [url, expected] of HOST_ROWS) {
  test(`hostOf(${JSON.stringify(url)}) === ${JSON.stringify(expected)}`, () => {
    assert.equal(hostOf(url), expected);
  });
}

test('credentials in a URL never leak into the parsed host', () => {
  const host = hostOf('https://user:secret@prism.openai.com/path');
  assert.equal(host, 'prism.openai.com');
  assert.ok(!host.includes('secret'));
});

test('the pane policy is stricter than the auth-window policy', () => {
  // Every auth-window URL must also be a valid pane navigation, otherwise the
  // sign-in window could be opened to somewhere a pane itself may not go.
  for (const host of AUTH_WINDOW_HOSTS) {
    assert.equal(isAllowedPaneNavigation(`https://${host}/`), true, host);
  }
});

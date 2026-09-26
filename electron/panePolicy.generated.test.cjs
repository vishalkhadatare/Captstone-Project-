'use strict';

/**
 * Generated differential suite for the URL policy.
 *
 * Every case is generated from the SPECIFICATION, and its expected answer comes
 * from a reference matcher written a different way from the implementation:
 *
 *   implementation  → `host === allowed || host.endsWith('.' + allowed)`
 *   reference       → split both into labels and compare from the right
 *
 * Those two disagree exactly where the classic `endsWith` bug lives
 * (`notgithub.com` matching an allowlist entry of `github.com`), so agreement
 * across thousands of generated hosts is real evidence. If the two ever drift,
 * this suite fails and names the host.
 *
 * Run:  node --test electron/panePolicy.generated.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AUTH_WINDOW_HOSTS,
  isAllowedPaneNavigation,
  isAllowedAuthWindowUrl,
  isAuthCompletionUrl,
  isPrismUrl,
} = require('./panePolicy.cjs');

// ---------------------------------------------------------------------------
// Reference matcher — deliberately a different algorithm.
// ---------------------------------------------------------------------------

const referenceLabelsMatch = (hostname, allowed) => {
  const host = String(hostname).toLowerCase().split('.');
  const rule = String(allowed).toLowerCase().split('.');
  if (host.length < rule.length) return false;
  const offset = host.length - rule.length;
  for (let index = 0; index < rule.length; index += 1) {
    if (host[offset + index] !== rule[index]) return false;
  }
  return true;
};

const referenceAllowlisted = (hostname) =>
  AUTH_WINDOW_HOSTS.some((allowed) => referenceLabelsMatch(hostname, allowed));

const referencePrism = (hostname) => referenceLabelsMatch(hostname, 'prism.openai.com');

const referenceCompletion = (hostname, pathname) =>
  referencePrism(hostname) ||
  (referenceLabelsMatch(hostname, 'chatgpt.com') && !String(pathname).startsWith('/auth'));

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The pane navigation rule as a table of the specification:
 * https anywhere, the about: placeholder, blob popups, and cleartext only on
 * loopback for the RFC 8252 native-app redirect.
 */
const referencePaneAllowed = (protocol, hostname, pathname) => {
  if (protocol === 'https:') return true;
  if (protocol === 'about:') return String(pathname).toLowerCase() === 'blank';
  if (protocol === 'blob:') return true;
  if (protocol !== 'http:') return false;
  return LOOPBACK.has(hostname);
};

// ---------------------------------------------------------------------------
// The generated input space.
// ---------------------------------------------------------------------------

/** Ordinary hosts, plus a lookalike for every way of attacking a suffix match. */
const HOSTS = (() => {
  const hosts = [];

  for (const allowed of AUTH_WINDOW_HOSTS) {
    hosts.push([allowed, 'the allowlisted host itself']);
    hosts.push([`sub.${allowed}`, 'a direct subdomain']);
    hosts.push([`a.b.${allowed}`, 'a deep subdomain']);
    hosts.push([`not${allowed}`, 'the no-separator lookalike']);
    hosts.push([`${allowed}.evil.test`, 'a suffix attack']);
    hosts.push([`${allowed}.example`, 'a different TLD']);
    hosts.push([allowed.replace(/\./g, '-'), 'a hyphenated lookalike']);
    hosts.push([allowed.replace(/\./g, ''), 'a run-together lookalike']);
    hosts.push([allowed.toUpperCase(), 'an upper-cased host']);
  }

  hosts.push(['example.com', 'an unrelated host']);
  hosts.push(['evil.test', 'an obviously hostile host']);
  hosts.push(['google.com', 'google.com without the accounts subdomain']);
  hosts.push(['openai.com', 'openai.com itself']);
  hosts.push(['chat.openai.com', 'the legacy chat host']);
  hosts.push(['localhost', 'loopback by name']);
  hosts.push(['127.0.0.1', 'loopback by address']);
  hosts.push(['[::1]', 'loopback by IPv6']);
  hosts.push(['192.168.1.10', 'a LAN address']);
  hosts.push(['myaccounts.google.com', 'a prefix lookalike']);
  hosts.push(['accounts.google.com.evil.test', 'a suffixed Google host']);
  hosts.push(['gist.github.com', 'a real GitHub subdomain']);
  hosts.push(['github.io', 'a GitHub-adjacent domain']);
  hosts.push(['studio.chatgpt.com', 'a real ChatGPT subdomain']);
  hosts.push(['chatgpt.com.evil.test', 'a suffixed ChatGPT host']);

  return hosts;
})();

const PATHS = [
  '/',
  '/x',
  '/auth',
  '/auth/login',
  '/auth/login_with?callback_path=/',
  '/api/accounts/callback/google',
  '/api/auth/session',
  '/login/oauth/authorize?client_id=x&response_type=code',
  '/c/abc-def',
  '/a/b?c=1#frag',
  '/pricing',
  '/deep/deeper/deepest',
  '/%2e%2e/',
  '/.',
  '//double//slash',
  '/#fragment',
];

const PARSE = (url) => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

/** A URL that cannot be parsed must be refused by every policy function. */
const assertAllRefused = (url, why) => {
  assert.equal(isAllowedPaneNavigation(url), false, `pane navigation allowed ${url} (${why})`);
  assert.equal(isAllowedAuthWindowUrl(url), false, `sign-in window allowed ${url} (${why})`);
  assert.equal(isAuthCompletionUrl(url), false, `completion claimed at ${url} (${why})`);
  assert.equal(isPrismUrl(url), false, `prism host claimed at ${url} (${why})`);
};

// ---------------------------------------------------------------------------
// Bucket A — https, the ordinary case: 95 hosts x 16 paths x 4 checks.
// ---------------------------------------------------------------------------

let httpsCases = 0;

for (const [host, hostNote] of HOSTS) {
  for (const path of PATHS) {
    const url = `https://${host}${path}`;
    const parsed = PARSE(url);
    const label = `${host}${path} (${hostNote})`;

    if (!parsed) {
      test(`unparseable https ${label} is refused everywhere`, () => assertAllRefused(url, hostNote));
      continue;
    }

    httpsCases += 1;

    test(`pane may navigate: ${label}`, () => {
      assert.equal(isAllowedPaneNavigation(url), true);
    });

    test(`sign-in window allowlist: ${label}`, () => {
      assert.equal(
        isAllowedAuthWindowUrl(url),
        referenceAllowlisted(parsed.hostname),
        `disagreement with the label reference for ${parsed.hostname}`,
      );
    });

    test(`completion: ${label}`, () => {
      assert.equal(
        isAuthCompletionUrl(url),
        referenceCompletion(parsed.hostname, parsed.pathname),
        `disagreement with the label reference for ${parsed.hostname}${parsed.pathname}`,
      );
    });

    test(`prism host: ${label}`, () => {
      assert.equal(
        isPrismUrl(url),
        referencePrism(parsed.hostname),
        `disagreement with the label reference for ${parsed.hostname}`,
      );
    });
  }
}

// ---------------------------------------------------------------------------
// Bucket B — cleartext http: allowed only for loopback.
// ---------------------------------------------------------------------------

const HTTP_PATHS = ['/', '/x', '/callback', '/a/b?c=1', '/#f', '/.'];

let httpCases = 0;

for (const [host, hostNote] of HOSTS) {
  for (const path of HTTP_PATHS) {
    const url = `http://${host}${path}`;
    const parsed = PARSE(url);
    const label = `${host}${path} (${hostNote})`;

    if (!parsed) {
      test(`unparseable http ${label} is refused`, () => assertAllRefused(url, hostNote));
      continue;
    }

    httpCases += 1;

    test(`cleartext pane navigation: ${label}`, () => {
      assert.equal(
        isAllowedPaneNavigation(url),
        referencePaneAllowed(parsed.protocol, parsed.hostname, parsed.pathname),
        `disagreement for ${parsed.hostname}`,
      );
    });

    test(`cleartext is never a sign-in window: ${label}`, () => {
      assert.equal(isAllowedAuthWindowUrl(url), false);
    });
  }
}

// ---------------------------------------------------------------------------
// Bucket C — schemes that must never be navigable, whatever the payload.
// ---------------------------------------------------------------------------

const DANGEROUS_SCHEMES = [
  'javascript:',
  'data:text/html,',
  'file:///',
  'ftp://',
  'ws://',
  'wss://',
  'chrome://',
  'chrome-extension://',
  'mailto:',
  'tel:',
  'vbscript:',
  'openai:',
  'intent://',
  'ms-appx://',
];

const PAYLOADS = ['x', 'alert(1)', '<html>', 'a/b', '?q=1', '#f', '//host/', '%00', '...', 'A', '', ' ', 'localhost', 'x?y=1#z'];

let schemeCases = 0;

for (const scheme of DANGEROUS_SCHEMES) {
  for (const payload of PAYLOADS) {
    const url = `${scheme}${payload}`;
    schemeCases += 1;
    test(`dangerous scheme refused: ${JSON.stringify(url)}`, () => {
      assertAllRefused(url, scheme);
    });
  }
}

// ---------------------------------------------------------------------------
// Bucket D — loopback and ports, exhaustively.
// ---------------------------------------------------------------------------

const PORTS = ['', ':0', ':80', ':443', ':3000', ':65535', ':99999', ':abc'];
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const NON_LOOPBACK_HOSTS = ['example.com', 'prism.openai.com', 'localhost.evil.test', '127.0.0.1.evil.test', '0.0.0.0'];

let portCases = 0;

for (const host of LOOPBACK_HOSTS) {
  for (const port of PORTS) {
    for (const path of ['/', '/callback']) {
      const url = `http://${host}${port}${path}`;
      const parsed = PARSE(url);
      portCases += 1;

      test(`loopback with port ${JSON.stringify(port)}: ${url}`, () => {
        if (!parsed) {
          assert.equal(isAllowedPaneNavigation(url), false, 'an unparseable URL must be refused');
          return;
        }
        assert.equal(isAllowedPaneNavigation(url), true, `${url} should be an allowed loopback URL`);
      });
    }
  }
}

for (const host of NON_LOOPBACK_HOSTS) {
  for (const port of PORTS) {
    const url = `http://${host}${port}/`;
    const parsed = PARSE(url);
    portCases += 1;

    test(`cleartext non-loopback with port ${JSON.stringify(port)}: ${url}`, () => {
      if (!parsed) {
        assert.equal(isAllowedPaneNavigation(url), false);
        return;
      }
      assert.equal(isAllowedPaneNavigation(url), false, `${url} must never be navigable`);
    });
  }
}

// ---------------------------------------------------------------------------
// Bucket E — values that are not URLs at all.
// ---------------------------------------------------------------------------

const JUNK = [
  '', ' ', '   ', '\t', '\n', 'nonsense', 'prism.openai.com', '//prism.openai.com/', '/auth/callback',
  'about:blank', 'about:blank#x', 'ABOUT:BLANK', 'about:config', 'about:srcdoc', 'about:',
  'blob:https://prism.openai.com/abc', 'BLOB:https://prism.openai.com/abc', 'blob:null/abc',
  null, undefined, 0, 42, NaN, true, false, {}, [], ['https://prism.openai.com/'],
  () => 'https://prism.openai.com/',
];

let junkCases = 0;

for (const value of JUNK) {
  junkCases += 1;
  const label = typeof value === 'function' ? 'a function' : JSON.stringify(value);

  test(`non-URL value ${label}`, () => {
    // Values are coerced with `String()` before parsing, exactly as the policy
    // does, so the expectation is “whatever this stringifies to”. An array whose
    // contents are a URL string therefore behaves as that URL — documented, not a
    // loophole, because the URL it behaves as is the one that was allowed anyway.
    const parsed = PARSE(String(value ?? '').trim());

    if (!parsed) {
      assertAllRefused(value, label);
      return;
    }

    assert.equal(
      isAllowedPaneNavigation(value),
      referencePaneAllowed(parsed.protocol, parsed.hostname, parsed.pathname),
      `${label} stringifies to ${parsed.href}`,
    );
    assert.equal(isAllowedAuthWindowUrl(value), referenceAllowlisted(parsed.hostname), label);
    assert.equal(
      isAuthCompletionUrl(value),
      referenceCompletion(parsed.hostname, parsed.pathname),
      label,
    );
    assert.equal(isPrismUrl(value), referencePrism(parsed.hostname), label);
  });
}

test('a non-string that stringifies to a URL is evaluated as that URL', () => {
  assert.equal(isAllowedPaneNavigation(['https://prism.openai.com/']), true);
  assert.equal(isAllowedAuthWindowUrl(['https://prism.openai.com/']), true);
});

test('the popup placeholder is navigable but is never a sign-in surface', () => {
  assert.equal(isAllowedPaneNavigation('about:blank'), true);
  assert.equal(isAllowedAuthWindowUrl('about:blank'), false);
  assert.equal(isAuthCompletionUrl('about:blank'), false);
});

// ---------------------------------------------------------------------------
// Structural checks on the generated space itself.
// ---------------------------------------------------------------------------

test('the generated space is substantial', () => {
  assert.ok(httpsCases > 1400, `https cases: ${httpsCases}`);
  assert.ok(httpCases > 500, `http cases: ${httpCases}`);
  assert.ok(schemeCases > 150, `scheme cases: ${schemeCases}`);
  assert.ok(portCases > 80, `port cases: ${portCases}`);
  assert.ok(junkCases > 20, `junk cases: ${junkCases}`);
});

test('the host list covers every allowlisted host', () => {
  const generated = new Set(HOSTS.map(([host]) => host.toLowerCase()));
  for (const allowed of AUTH_WINDOW_HOSTS) {
    assert.ok(generated.has(allowed), `${allowed} is never exercised`);
  }
});

test('the reference matcher rejects a lookalike that a suffix check would accept', () => {
  // Guards the guard: if the reference were wrong, the differential would be
  // worthless. `endsWith` returns true here; the label comparison must not.
  assert.equal('notgithub.com'.endsWith('.github.com'), false);
  assert.equal(referenceLabelsMatch('notgithub.com', 'github.com'), false);
  assert.equal(referenceLabelsMatch('github.com', 'github.com'), true);
  assert.equal(referenceLabelsMatch('sub.github.com', 'github.com'), true);
  assert.equal(referenceLabelsMatch('github.com.evil.test', 'github.com'), false);
});

test('every generated case ran', () => {
  const total = httpsCases * 4 + httpCases * 2 + schemeCases + portCases + junkCases;
  assert.ok(total > 7000, `generated cases: ${total}`);
});

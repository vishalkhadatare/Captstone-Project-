import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTH_LOG_TAG,
  OPENAI_GOOGLE_SIGN_IN_URL,
  PANE_SANDBOX_FLAGS,
  PRISM_APP_ORIGIN,
  PRISM_AUTH_WINDOW_NAME,
  PRISM_SIGN_IN_URL,
  REQUIRED_PANE_SANDBOX_FLAGS,
  authLog,
  classifyAuthNavigation,
  isOAuthNavigation,
  isPrismHost,
  planAuthNavigation,
  redactUrlForLog,
} from './prismAuth.ts';

// ---------------------------------------------------------------------------
// Classification tables. Every row becomes its own test case.
// ---------------------------------------------------------------------------

/** Authentication surfaces that must never be embedded. */
const OAUTH_URLS: Array<[string, string]> = [
  ['https://accounts.google.com/', 'google root'],
  ['https://accounts.google.com/o/oauth2/v2/auth?client_id=a.apps&response_type=code', 'google authorize'],
  ['https://accounts.google.com/o/oauth2/v2/auth?client_id=a&response_type=code&redirect_uri=https%3A%2F%2Fprism.openai.com%2Fcb', 'google authorize + redirect'],
  ['https://accounts.google.com/signin/oauth/consent', 'google consent'],
  ['https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmail.google.com', 'google service login'],
  ['https://accounts.google.com/v3/signin/challenge/pwd', 'google password challenge'],
  ['https://oauth2.googleapis.com/token', 'google token endpoint'],
  ['https://login.microsoftonline.com/common/oauth2/v2.0/authorize', 'microsoft authorize'],
  ['https://appleid.apple.com/auth/authorize?response_type=code&client_id=a', 'apple authorize'],
  ['https://github.com/login/oauth/authorize?client_id=a&response_type=code', 'github authorize'],
  ['https://github.com/login/oauth/access_token', 'github token exchange'],
  ['https://github.com/login/device', 'github device flow'],
  ['https://github.com/sessions/two-factor', 'github 2fa'],
  ['https://auth.openai.com/', 'openai auth host root'],
  ['https://auth.openai.com/authorize?client_id=a&response_type=code', 'openai authorize'],
  ['https://auth0.openai.com/u/login', 'openai auth0 login'],
  ['https://chatgpt.com/auth/login', 'chatgpt login'],
  ['https://chatgpt.com/auth/google/callback', 'chatgpt callback'],
  ['https://chatgpt.com/api/auth/session', 'chatgpt session'],
  ['https://sub.accounts.google.com/anything', 'provider subdomain'],
  ['https://ACCOUNTS.GOOGLE.COM/x', 'uppercase host'],
  ['https://some-other-idp.example.com/sso/authorize?response_type=code&client_id=zeroleak', 'unknown idp authorize signature'],
  ['https://idp.example.com/login?response_type=token&redirect_uri=https%3A%2F%2Fapp.test', 'implicit flow signature'],
  ['https://idp.example.com/x?response_type=id_token&client_id=abc', 'oidc implicit signature'],
  ['https://idp.example.com/authorize?response_type=code&client_id=a&redirect_uri=b&scope=openid', 'authorize with extra params'],
  ['https://prism.openai.com/oauth?response_type=code&client_id=a', 'prism authorize request (signature wins over prism app)'],
  ['http://accounts.google.com/x', 'known provider host over plain http is still never embedded'],
];

/** Ordinary browsing: embedding is fine, nothing may be escalated. */
const BROWSING_URLS: Array<[string, string]> = [
  ['https://github.com/torvalds/linux', 'github repo'],
  ['https://github.com/', 'github root'],
  ['https://github.com/login', 'github plain login page, not the oauth prefix'],
  ['https://github.com/settings/profile', 'github settings'],
  ['https://chatgpt.com/', 'chatgpt root'],
  ['https://chatgpt.com/c/abc-123', 'chatgpt conversation'],
  ['https://chat.openai.com/', 'legacy chat host, not allowlisted'],
  ['https://platform.openai.com/docs', 'openai docs'],
  ['https://www.google.com/search?q=latex', 'google search'],
  ['https://google.com/', 'google root'],
  ['https://mail.google.com/', 'gmail'],
  ['https://idp.example.com/pricing?response_type=docs', 'non-oauth response_type'],
  ['https://idp.example.com/x?response_type=code', 'authorize without client_id/redirect_uri'],
  ['https://idp.example.com/x?client_id=a&redirect_uri=b', 'client_id without response_type'],
  ['https://overleaf.com/learn/latex', 'overleaf docs'],
  ['https://latexonline.cc/', 'latexonline'],
  ['https://tikz.dev/', 'tikz docs'],
  ['https://notgoogle.com/', 'lookalike host'],
  ['https://google.com.evil.test/', 'suffix lookalike'],
  ['https://accounts.google.com.evil.test/x', 'provider name as a subdomain of an attacker host'],
  ['https://chatgpt.com.evil.test/auth/login', 'chatgpt lookalike with auth path'],
  ['https://auth.openai.com.evil.test/', 'openai auth lookalike'],
  ['http://example.com/?response_type=code&client_id=a', 'plain http authorize signature is not trusted'],
];

/** Prism itself: frameable, but its sign-in still needs a top-level window. */
const PRISM_URLS: Array<[string, string]> = [
  ['https://prism.openai.com/', 'prism root'],
  ['https://prism.openai.com/projects', 'prism projects'],
  ['https://prism.openai.com/project/abc/files', 'prism project'],
  ['https://prism.openai.com/#/settings', 'prism hash route'],
  ['https://www.prism.openai.com/', 'prism www subdomain'],
  ['http://prism.openai.com/', 'prism over http'],
];

/** Inputs that must never be treated as navigable at all. */
const UNPARSEABLE_INPUTS: string[] = [
  'javascript:alert(document.cookie)',
  'JavaScript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'file:///etc/passwd',
  'ftp://example.com/x',
  'about:blank',
  'chrome://settings',
  'vbscript:msgbox(1)',
  '',
  '   ',
  'prism.openai.com',
  'accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=a',
  'example.com/path',
  'not a url',
];

// ---------------------------------------------------------------------------
// Classification assertions
// ---------------------------------------------------------------------------

for (const [url, label] of OAUTH_URLS) {
  test(`oauth: ${label}`, () => {
    assert.equal(classifyAuthNavigation(url), 'oauth', url);
    assert.equal(isOAuthNavigation(url), true, url);
    const plan = planAuthNavigation(url);
    assert.equal(plan.requiresTopLevel, true, url);
    assert.ok(plan.reason.length > 0, 'reason should be explained');
  });
}

for (const [url, label] of BROWSING_URLS) {
  test(`browsing: ${label}`, () => {
    assert.equal(classifyAuthNavigation(url), 'other', url);
    assert.equal(isOAuthNavigation(url), false, url);
    assert.equal(planAuthNavigation(url).requiresTopLevel, false, url);
  });
}

for (const [url, label] of PRISM_URLS) {
  test(`prism: ${label}`, () => {
    assert.equal(classifyAuthNavigation(url), 'prism', url);
    assert.equal(isPrismHost(url), true, url);
    assert.equal(planAuthNavigation(url).requiresTopLevel, false, url);
  });
}

for (const input of UNPARSEABLE_INPUTS) {
  test(`rejects non-navigable input: ${JSON.stringify(input)}`, () => {
    const plan = planAuthNavigation(input);
    assert.equal(plan.kind, 'other', input);
    assert.equal(plan.url, '', input);
    assert.equal(plan.requiresTopLevel, false, input);
    assert.equal(isOAuthNavigation(input), false, input);
  });
}

// ---------------------------------------------------------------------------
// isPrismHost specifics
// ---------------------------------------------------------------------------

test('classification and planning never disagree about a URL', () => {
  const samples = [
    ...OAUTH_URLS.map(([url]) => url),
    ...BROWSING_URLS.map(([url]) => url),
    ...PRISM_URLS.map(([url]) => url),
    ...UNPARSEABLE_INPUTS,
  ];

  for (const url of samples) {
    const kind = classifyAuthNavigation(url);
    const plan = planAuthNavigation(url);
    assert.equal(plan.kind, kind, `${url}: plan said ${plan.kind}, classify said ${kind}`);
    assert.equal(
      plan.requiresTopLevel,
      kind === 'oauth',
      `${url}: requiresTopLevel should follow the kind`,
    );
  }
});

test('isPrismHost is false for lookalike hosts', () => {
  for (const host of ['https://notprism.openai.com/', 'https://prism.openai.com.evil.test/', 'https://openai.com/']) {
    assert.equal(isPrismHost(host), false, host);
  }
});

test('isPrismHost accepts http(s) prism only', () => {
  assert.equal(isPrismHost('https://prism.openai.com/'), true);
  assert.equal(isPrismHost('http://prism.openai.com/'), true);
  assert.equal(isPrismHost('prism.openai.com'), false);
  assert.equal(isPrismHost('javascript:alert(1)'), false);
});

// ---------------------------------------------------------------------------
// Plan shape
// ---------------------------------------------------------------------------

test('plan preserves the normalised absolute URL for embeddable pages', () => {
  const plan = planAuthNavigation('https://tikz.dev/');
  assert.equal(plan.url, 'https://tikz.dev/');
  assert.equal(plan.kind, 'other');
});

test('plan never fabricates an authorization URL for Prism', () => {
  const plan = planAuthNavigation('https://prism.openai.com/');
  assert.equal(plan.url, 'https://prism.openai.com/');
  assert.ok(!plan.url.includes('response_type'));
  assert.ok(!plan.url.includes('client_id'));
});

test('plan strips nothing but adds nothing for oauth URLs', () => {
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=a&response_type=code';
  assert.equal(planAuthNavigation(url).url, url);
});

test('every plan branch carries a human readable reason', () => {
  for (const url of ['https://accounts.google.com/', 'https://prism.openai.com/', 'https://tikz.dev/', 'nope']) {
    const plan = planAuthNavigation(url);
    assert.ok(plan.reason.length > 3, `${url} -> ${plan.reason}`);
  }
});

// ---------------------------------------------------------------------------
// Log redaction
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = [
  'code',
  'state',
  'access_token',
  'id_token',
  'refresh_token',
  'code_verifier',
  'password',
  'token',
  'session',
  'session_token',
  'authorization',
  'assertion',
];

for (const key of SENSITIVE_KEYS) {
  test(`redaction removes ${key}`, () => {
    const out = redactUrlForLog(`https://prism.openai.com/cb?${key}=SUPERSECRETVALUE`);
    assert.ok(!out.includes('SUPERSECRETVALUE'), out);
    // URLSearchParams percent-encodes the placeholder, so match the word itself.
    assert.ok(out.includes('redacted'), out);
  });
}

test('redaction is case insensitive for sensitive keys', () => {
  const out = redactUrlForLog('https://prism.openai.com/cb?Access_Token=SECRET123');
  assert.ok(!out.includes('SECRET123'), out);
});

test('redaction covers implicit-flow tokens in the fragment', () => {
  const out = redactUrlForLog('https://prism.openai.com/cb#access_token=FRAGSECRET&token_type=bearer');
  assert.ok(!out.includes('FRAGSECRET'), out);
  assert.ok(out.includes('token_type'), out);
});

test('redaction leaves non sensitive params readable', () => {
  const out = redactUrlForLog('https://prism.openai.com/cb?client_id=public-id&response_type=code&redirect_uri=x');
  assert.ok(out.includes('client_id=public-id'), out);
  assert.ok(out.includes('response_type=code'), out);
  assert.ok(!out.includes('redacted'), out);
});

test('redaction handles many sensitive params at once', () => {
  const out = redactUrlForLog('https://prism.openai.com/cb?code=A1&state=B2&token=C3&keep=D4');
  for (const secret of ['A1', 'B2', 'C3']) {
    assert.ok(!out.includes(secret), out);
  }
  assert.ok(out.includes('keep=D4'), out);
});

test('redaction returns unparseable input untouched', () => {
  assert.equal(redactUrlForLog('not a url'), 'not a url');
  assert.equal(redactUrlForLog('javascript:alert(1)'), 'javascript:alert(1)');
});

test('redaction is a no-op for URLs without params', () => {
  assert.equal(redactUrlForLog('https://prism.openai.com/projects'), 'https://prism.openai.com/projects');
});

test('redaction does not mangle non-parameter fragments', () => {
  assert.equal(redactUrlForLog('https://prism.openai.com/#/projects'), 'https://prism.openai.com/#/projects');
});

// ---------------------------------------------------------------------------
// Sandbox flags (the browser-mode pane contract)
// ---------------------------------------------------------------------------

const sandboxFlags = PANE_SANDBOX_FLAGS.split(/\s+/).filter(Boolean);

for (const required of REQUIRED_PANE_SANDBOX_FLAGS) {
  test(`sandbox keeps ${required}`, () => {
    assert.ok(sandboxFlags.includes(required), PANE_SANDBOX_FLAGS);
  });
}

test('sandbox keeps allow-same-origin, allow-forms and allow-modals', () => {
  for (const flag of ['allow-same-origin', 'allow-forms', 'allow-modals']) {
    assert.ok(sandboxFlags.includes(flag), flag);
  }
});

test('sandbox uses the user-activation form of top navigation, not the blanket form', () => {
  assert.ok(sandboxFlags.includes('allow-top-navigation-by-user-activation'));
  assert.ok(!sandboxFlags.includes('allow-top-navigation'));
});

test('sandbox has no duplicates and every token is an allow- flag', () => {
  assert.equal(new Set(sandboxFlags).size, sandboxFlags.length, 'duplicate flags');
  for (const flag of sandboxFlags) {
    assert.ok(flag.startsWith('allow-'), flag);
  }
});

test('sandbox never grants dangerous capabilities', () => {
  for (const forbidden of ['allow-same-origin-unsafe', 'allow-top-navigation', 'allow-pointer-lock']) {
    assert.ok(!sandboxFlags.includes(forbidden), forbidden);
  }
});

// ---------------------------------------------------------------------------
// Constants and logging
// ---------------------------------------------------------------------------

test('prism constants are coherent', () => {
  assert.equal(PRISM_SIGN_IN_URL, `${PRISM_APP_ORIGIN}/`);
  assert.ok(PRISM_APP_ORIGIN.startsWith('https://'));
  assert.ok(PRISM_AUTH_WINDOW_NAME.length > 0);
  assert.equal(AUTH_LOG_TAG, '[AUTH]');
});

// ---------------------------------------------------------------------------
// The measured OpenAI → Google sign-in route.
// ---------------------------------------------------------------------------

test('the OpenAI sign-in route is https', () => {
  assert.ok(OPENAI_GOOGLE_SIGN_IN_URL.startsWith('https://'));
});

test('the OpenAI sign-in route is the measured chatgpt.com login path', () => {
  assert.equal(OPENAI_GOOGLE_SIGN_IN_URL, 'https://chatgpt.com/auth/login');
  assert.equal(new URL(OPENAI_GOOGLE_SIGN_IN_URL).hostname, 'chatgpt.com');
  assert.equal(new URL(OPENAI_GOOGLE_SIGN_IN_URL).pathname, '/auth/login');
});

test('the OpenAI sign-in route is classified as an OAuth surface', () => {
  assert.equal(isOAuthNavigation(OPENAI_GOOGLE_SIGN_IN_URL), true);
});

test('the OpenAI sign-in route must run in a real top-level context', () => {
  const plan = planAuthNavigation(OPENAI_GOOGLE_SIGN_IN_URL);
  assert.equal(plan.kind, 'oauth');
  assert.equal(plan.requiresTopLevel, true);
});

test('the OpenAI sign-in route carries no secret of its own', () => {
  // It is a plain entry point — Prism/OpenAI adds client_id, PKCE and state.
  const url = new URL(OPENAI_GOOGLE_SIGN_IN_URL);
  assert.equal(url.search, '');
  assert.equal(url.hash, '');
});

test('authLog is silent outside the Vite dev environment and never throws', () => {
  assert.doesNotThrow(() => authLog('unit test message', { any: 'detail' }));
  assert.doesNotThrow(() => authLog('unit test message without detail'));
});

// ---------------------------------------------------------------------------
// Provider-host matrix.
//
// A provider host with no path restriction is an auth surface at ANY path, on
// any subdomain, in any case. Generating every combination here is what makes
// this a matrix rather than a handful of lucky examples.
// ---------------------------------------------------------------------------

/** Allowlisted hosts that are auth surfaces at every path. */
const PATHLESS_PROVIDER_HOSTS = [
  'accounts.google.com',
  'oauth2.googleapis.com',
  'login.microsoftonline.com',
  'appleid.apple.com',
  'auth.openai.com',
  'auth0.openai.com',
];

const providerShapes = (host: string): Array<[string, string]> => [
  [`https://${host}/`, 'the root'],
  [`https://${host}/anything/at/all?x=1`, 'a deep path'],
  [`https://sub.${host}/deep/path`, 'a subdomain'],
  [`https://${host.toUpperCase()}/X`, 'an upper-cased host'],
];

for (const host of PATHLESS_PROVIDER_HOSTS) {
  for (const [url, why] of providerShapes(host)) {
    test(`isOAuthNavigation(${url}) — ${host} / ${why}`, () => {
      assert.equal(isOAuthNavigation(url), true);
    });

    test(`planAuthNavigation(${url}) is a top-level oauth navigation`, () => {
      const plan = planAuthNavigation(url);
      assert.equal(plan.kind, 'oauth');
      assert.equal(plan.requiresTopLevel, true);
      assert.ok(plan.reason.length > 0);
    });
  }
}

/** Hosts where only specific path prefixes count as authentication. */
const PATH_RESTRICTED: Array<[string, string[], string[]]> = [
  ['github.com', ['/login/oauth/authorize', '/login/device', '/sessions/two-factor'], ['/', '/features', '/pricing']],
  ['chatgpt.com', ['/auth/login', '/api/auth/session'], ['/', '/pricing', '/blog']],
];

for (const [host, authPaths, browsePaths] of PATH_RESTRICTED) {
  for (const path of authPaths) {
    test(`${host}${path} is authentication`, () => {
      assert.equal(isOAuthNavigation(`https://${host}${path}`), true);
    });
  }
  for (const path of browsePaths) {
    test(`${host}${path} is ordinary browsing, not authentication`, () => {
      assert.equal(isOAuthNavigation(`https://${host}${path}`), false);
    });
  }
}

// ---------------------------------------------------------------------------
// Non-provider hosts that must never be treated as authentication.
// ---------------------------------------------------------------------------

const NOT_OAUTH = [
  'https://google.com/',
  'https://www.google.com/search?q=prism',
  'https://mail.google.com/',
  'https://drive.google.com/',
  'https://openai.com/',
  'https://platform.openai.com/docs',
  'https://chat.openai.com/',
  'https://prism.openai.com/',
  'https://example.com/',
  'https://evil.test/',
  'https://accounts.google.com.evil.test/',
  'https://notaccounts.google.com/',
  'https://github.com/',
  'https://gist.github.com/',
  'https://chatgpt.com/',
  'https://chatgpt.com/pricing',
  'https://myauth.openai.com.evil.test/',
  'https://localhost:3000/',
];

for (const url of NOT_OAUTH) {
  test(`isOAuthNavigation(${url}) is false`, () => {
    assert.equal(isOAuthNavigation(url), false);
  });
}

// ---------------------------------------------------------------------------
// The generic OAuth authorize-request signature.
// ---------------------------------------------------------------------------

const AUTHORIZE_SIGNATURES: Array<[string, boolean, string]> = [
  ['https://idp.example.com/auth?response_type=code&client_id=a', true, 'code + client_id'],
  ['https://idp.example.com/auth?response_type=token&client_id=a', true, 'implicit flow'],
  ['https://idp.example.com/auth?response_type=id_token&client_id=a', true, 'id_token flow'],
  ['https://idp.example.com/auth?response_type=code&redirect_uri=https%3A%2F%2Fx.test', true, 'code + redirect_uri'],
  ['https://idp.example.com/auth?client_id=a&response_type=code', true, 'reversed parameter order'],
  ['http://idp.example.com/auth?response_type=code&client_id=a', false, 'cleartext cannot masquerade as a provider'],
  ['https://idp.example.com/auth?response_type=code', false, 'no client_id and no redirect_uri'],
  ['https://idp.example.com/auth?client_id=a', false, 'no response_type'],
  ['https://idp.example.com/auth?response_type=weird&client_id=a', false, 'unknown response_type'],
  ['https://idp.example.com/auth?response_type=CODE&client_id=a', false, 'response_type is case sensitive'],
  ['https://idp.example.com/?response_type=code&client_id=a#frag', true, 'signature with a fragment'],
  ['https://idp.example.com/', false, 'bare host'],
];

for (const [url, expected, why] of AUTHORIZE_SIGNATURES) {
  test(`authorize signature ${why} → ${expected}`, () => {
    assert.equal(isOAuthNavigation(url), expected);
  });
}

// ---------------------------------------------------------------------------
// Redaction matrix: every sensitive key, in the query and in the fragment.
// ---------------------------------------------------------------------------

const REDACTION_MATRIX_KEYS = [
  'code',
  'state',
  'access_token',
  'id_token',
  'refresh_token',
  'code_verifier',
  'password',
  'token',
  'session',
  'session_token',
  'authorization',
  'assertion',
];

const SECRET = 'SUPER-SECRET-VALUE-12345';

for (const key of REDACTION_MATRIX_KEYS) {
  test(`redacts ${key} from the query string`, () => {
    const output = redactUrlForLog(`https://prism.openai.com/cb?${key}=${SECRET}`);
    assert.ok(output.includes('redacted'), output);
    assert.ok(!output.includes(SECRET), output);
    assert.ok(output.includes(key), output);
  });

  test(`redacts ${key} from the fragment`, () => {
    const output = redactUrlForLog(`https://prism.openai.com/cb#${key}=${SECRET}`);
    assert.ok(output.includes('redacted'), output);
    assert.ok(!output.includes(SECRET), output);
  });

  test(`redacts ${key} case-insensitively`, () => {
    const output = redactUrlForLog(`https://prism.openai.com/cb?${key.toUpperCase()}=${SECRET}`);
    assert.ok(!output.includes(SECRET), output);
    assert.ok(output.includes('redacted'), output);
  });
}

for (const key of REDACTION_MATRIX_KEYS) {
  test(`redacts ${key} while keeping harmless parameters readable`, () => {
    const output = redactUrlForLog(`https://prism.openai.com/cb?${key}=${SECRET}&page=2&lang=en`);
    assert.ok(!output.includes(SECRET), output);
    assert.ok(output.includes('page=2'), output);
    assert.ok(output.includes('lang=en'), output);
  });
}

const REDACTION_STRUCTURE: Array<[string, boolean, string]> = [
  ['https://prism.openai.com/cb?code=a&state=b', true, 'redacts both keys when several are present'],
  ['https://prism.openai.com/cb?page=1', false, 'leaves an innocuous URL alone'],
  ['not a url', false, 'passes through a non-URL unchanged'],
  ['https://prism.openai.com/cb#section', false, 'an innocuous fragment stays'],
  ['https://prism.openai.com/cb?code=a#access_token=b', true, 'redacts query and fragment together'],
];

for (const [url, shouldRedact, why] of REDACTION_STRUCTURE) {
  test(`redaction: ${why}`, () => {
    const output = redactUrlForLog(url);
    if (shouldRedact) assert.ok(output.includes('redacted'), output);
    else assert.equal(output.includes('redacted'), false, output);
  });
}

test('redaction never leaves a bare sensitive key with its value', () => {
  const url = `https://prism.openai.com/cb?code=${SECRET}&state=${SECRET}&password=${SECRET}`;
  const output = redactUrlForLog(url);
  assert.equal(output.includes(SECRET), false, output);
  assert.equal((output.match(/redacted/g) ?? []).length >= 3, true, output);
});

// ---------------------------------------------------------------------------
// classifyAuthNavigation / planAuthNavigation agreement matrix.
// ---------------------------------------------------------------------------

const CLASSIFY_ROWS: Array<[string, ReturnType<typeof classifyAuthNavigation>]> = [
  ['https://accounts.google.com/', 'oauth'],
  ['http://accounts.google.com/', 'oauth'],
  ['https://github.com/login/oauth/authorize', 'oauth'],
  ['https://github.com/features', 'other'],
  ['https://prism.openai.com/', 'prism'],
  ['https://chat.prism.openai.com/x', 'prism'],
  ['https://example.com/', 'other'],
  ['https://evil.test/?response_type=code&client_id=x', 'oauth'],
  ['http://evil.test/?response_type=code&client_id=x', 'other'],
  ['https://evil.test/?response_type=code', 'other'],
  ['https://evil.test/?response_type=weird&client_id=x', 'other'],
  ['javascript:alert(1)', 'other'],
  ['not a url', 'other'],
  ['', 'other'],
  ['https://openai.com/', 'other'],
  ['https://mail.google.com/', 'other'],
  ['https://github.com/', 'other'],
  ['https://chatgpt.com/', 'other'],
  ['https://chatgpt.com/auth/login', 'oauth'],
  ['https://accounts.google.com.evil.test/', 'other'],
];

for (const [url, expected] of CLASSIFY_ROWS) {
  test(`classifyAuthNavigation(${JSON.stringify(url)}) === ${expected}`, () => {
    assert.equal(classifyAuthNavigation(url), expected);
  });

  test(`planAuthNavigation(${JSON.stringify(url)}) agrees with classify`, () => {
    const plan = planAuthNavigation(url);
    assert.equal(plan.kind, classifyAuthNavigation(url));
    assert.equal(plan.requiresTopLevel, plan.kind === 'oauth');
    assert.equal(typeof plan.reason, 'string');
    assert.ok(plan.reason.length > 0);
  });
}

test('planAuthNavigation blanking: non-navigable input yields no url at all', () => {
  for (const input of ['', '   ', 'not a url', 'javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd']) {
    const plan = planAuthNavigation(input);
    assert.equal(plan.url, '', `${input} produced ${plan.url}`);
    assert.equal(plan.requiresTopLevel, false);
  }
});

test('planAuthNavigation preserves the normalised URL for navigable input', () => {
  const plan = planAuthNavigation('https://prism.openai.com/auth?x=1');
  assert.equal(plan.url, 'https://prism.openai.com/auth?x=1');
});

/**
 * Authentication navigation policy for the embedded Prism browser.
 *
 * Why this module exists
 * ----------------------
 * ZeroLeak embeds `https://prism.openai.com/` in a plain HTML `<iframe>` (this is
 * a browser SPA, not Electron/CEF/Tauri — there is no `webContents`,
 * `setWindowOpenHandler` or `session.fromPartition` available here).
 *
 * Google, GitHub and OpenAI all refuse to render their OAuth screens inside a
 * frame (X-Frame-Options / CSP `frame-ancestors`), so an in-frame sign-in fails
 * provider-state validation and Prism reports:
 *
 *     openai-provider-validation-failed
 *
 * The only legitimate fix is to move the authentication navigation into a real
 * TOP-LEVEL browsing context. This module classifies URLs so the UI knows which
 * navigations may stay embedded and which must be handed to a top-level window.
 *
 * What this module deliberately does NOT do
 * -----------------------------------------
 * - It never reads, writes, fabricates or replays credentials, cookies, tokens
 *   or session state.
 * - It never fabricates an OAuth authorization URL. Prism generates its own
 *   authorize URL (with PKCE + state) client-side; forging one would be exactly
 *   the auth bypass we are avoiding. We only *route* real navigations.
 * - It never relaxes iframe sandboxing or provider security headers.
 */

/** Prism's own application origin. */
export const PRISM_APP_ORIGIN = 'https://prism.openai.com';

/**
 * Entry point for Prism sign-in. Prism performs the provider redirect itself
 * inside this top-level window, so this is the correct thing to open.
 */
export const PRISM_SIGN_IN_URL = `${PRISM_APP_ORIGIN}/`;

/** Named window reuse key so we never stack multiple authentication windows. */
export const PRISM_AUTH_WINDOW_NAME = 'PrismAuthWindow';

/**
 * The route that actually completes OpenAI's sign-in, measured end to end.
 *
 * `https://chatgpt.com/auth/login` redirects straight to Google with OpenAI's
 * OWN client id and
 * `redirect_uri=https://auth.openai.com/api/accounts/callback/google`, and it
 * does so with no Cloudflare challenge and no embedded-browser refusal inside the
 * desktop pane (see `npm run test:signin`). Signing in here establishes the
 * OpenAI account session in the pane's partition — in the app, never in a
 * separate browser tab — and Prism then reads that same session.
 */
export const OPENAI_GOOGLE_SIGN_IN_URL = 'https://chatgpt.com/auth/login';

/** Host shown for the OpenAI account route, used only in user-facing copy. */
export const OPENAI_AUTH_HOST = 'auth.openai.com';

/**
 * Persistent session partition for the desktop pane.
 *
 * Kept in sync with `PANE_PARTITION` in `electron/main.cjs`, which also pins
 * every guest to this partition in `will-attach-webview`.
 */
export const PANE_PARTITION = 'persist:zeroleak-panes';

export const AUTH_LOG_TAG = '[AUTH]';

/**
 * Sandbox flags for the browser-mode `<iframe>` pane.
 *
 * `allow-popups` + `allow-popups-to-escape-sandbox` are the flags that decide
 * whether a provider's `window.open()` sign-in window is permitted. Without
 * them `window.open()` returns `null` and Prism reports "We couldn't open the
 * sign-in window. Check your popup blocker and try again."
 *
 * Measured, not assumed — `tests/manual/popup-sandbox-probe.cjs` drives real
 * Chromium input across four sandbox variants and shows that these exact flags
 * behave identically to having no sandbox at all, while removing `allow-popups`
 * is refused. Pinned here so a later edit cannot silently drop one of them.
 */
export const PANE_SANDBOX_FLAGS = [
  'allow-same-origin',
  'allow-scripts',
  'allow-forms',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-top-navigation-by-user-activation',
  'allow-modals',
  'allow-downloads',
  'allow-storage-access-by-user-activation',
].join(' ');

/** Flags that must survive any future edit, asserted in the unit suite. */
export const REQUIRED_PANE_SANDBOX_FLAGS = ['allow-popups', 'allow-popups-to-escape-sandbox', 'allow-scripts'];

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type AuthNavKind =
  /** Must run in a real top-level window — OAuth/SSO surface. */
  | 'oauth'
  /** Prism itself. Frameable, but its sign-in must still happen top-level. */
  | 'prism'
  /** Anything else. */
  | 'other';

export interface AuthNavigationPlan {
  kind: AuthNavKind;
  /** Normalised absolute URL (empty when the input was not navigable). */
  url: string;
  /** true → open in a real window; false → safe to keep in the embedded frame. */
  requiresTopLevel: boolean;
  reason: string;
}

interface ProviderRule {
  host: string;
  /** When present, only these path prefixes count as an auth surface. */
  pathPrefixes?: string[];
}

/**
 * Allowlisted OAuth / SSO surfaces. Deliberately narrow: a bare `github.com`
 * visit is browsing, only `github.com/login/oauth*` is authentication.
 */
const OAUTH_PROVIDER_RULES: ProviderRule[] = [
  { host: 'accounts.google.com' },
  { host: 'oauth2.googleapis.com' },
  { host: 'login.microsoftonline.com' },
  { host: 'appleid.apple.com' },
  { host: 'github.com', pathPrefixes: ['/login/oauth', '/login/device', '/sessions'] },
  { host: 'auth.openai.com' },
  { host: 'auth0.openai.com' },
  { host: 'chatgpt.com', pathPrefixes: ['/auth', '/api/auth'] },
];

/** OAuth authorize-request signature, used for providers outside the allowlist. */
const AUTHORIZE_RESPONSE_TYPES = new Set(['code', 'token', 'id_token']);

/** Query params that must never reach a log line. */
const SENSITIVE_QUERY_KEYS = new Set([
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
]);

const hostMatches = (hostname: string, allowed: string): boolean =>
  hostname === allowed || hostname.endsWith(`.${allowed}`);

/** Parse only navigable http(s) URLs; everything else (javascript:, data:, file:) is rejected. */
const parseHttpUrl = (raw: string): URL | null => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // An explicit http(s) scheme is REQUIRED. Resolving scheme-less input against
  // the Prism origin would silently turn "evil.test" into a Prism URL, and
  // rejecting unknown schemes keeps javascript:/data:/file: out entirely.
  if (!/^https?:\/\//i.test(trimmed)) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url;
  } catch {
    return null;
  }
};

const providerRuleFor = (url: URL): ProviderRule | undefined =>
  OAUTH_PROVIDER_RULES.find(
    (rule) =>
      hostMatches(url.hostname, rule.host) &&
      (!rule.pathPrefixes || rule.pathPrefixes.some((prefix) => url.pathname.startsWith(prefix))),
  );

const looksLikeAuthorizeRequest = (url: URL): boolean => {
  const responseType = url.searchParams.get('response_type');
  if (!responseType || !AUTHORIZE_RESPONSE_TYPES.has(responseType)) return false;
  return url.searchParams.has('client_id') || url.searchParams.has('redirect_uri');
};

export const isPrismHost = (rawUrl: string | URL): boolean => {
  const url = typeof rawUrl === 'string' ? parseHttpUrl(rawUrl) : rawUrl;
  if (!url) return false;
  return hostMatches(url.hostname, 'prism.openai.com');
};

/**
 * True when the URL is an authentication navigation that cannot legitimately
 * complete inside an embedded frame.
 *
 * Two tiers, deliberately different:
 *  - A known provider host is never embedded regardless of scheme.
 *  - The generic authorize-request signature must be https, so a plain-http
 *    URL can never masquerade as a provider endpoint.
 *
 * `classifyAuthNavigation` and `planAuthNavigation` must agree; the unit suite
 * pins that they do.
 */
export function isOAuthNavigation(rawUrl: string | URL): boolean {
  const url = typeof rawUrl === 'string' ? parseHttpUrl(rawUrl) : rawUrl;
  if (!url) return false;
  if (providerRuleFor(url)) return true;
  return url.protocol === 'https:' && looksLikeAuthorizeRequest(url);
}

export function classifyAuthNavigation(rawUrl: string): AuthNavKind {
  const url = parseHttpUrl(rawUrl);
  if (!url) return 'other';
  if (isOAuthNavigation(url)) return 'oauth';
  if (isPrismHost(url)) return 'prism';
  return 'other';
}

/**
 * Decide where a navigation is allowed to happen.
 *
 * `oauth`  → real top-level window (this is the actual fix for
 *            `openai-provider-validation-failed`)
 * `prism`  → stays embedded; only the sign-in *button* escalates to a window
 * `other`  → stays embedded
 */
export function planAuthNavigation(rawUrl: string): AuthNavigationPlan {
  const url = parseHttpUrl(rawUrl);

  if (!url) {
    return {
      kind: 'other',
      url: '',
      requiresTopLevel: false,
      reason: 'Not a navigable http(s) URL',
    };
  }

  const rule = providerRuleFor(url);
  if (rule) {
    return {
      kind: 'oauth',
      url: url.toString(),
      requiresTopLevel: true,
      reason: `${url.hostname}${url.pathname} is an OAuth/SSO surface that blocks framing`,
    };
  }

  if (url.protocol === 'https:' && looksLikeAuthorizeRequest(url)) {
    return {
      kind: 'oauth',
      url: url.toString(),
      requiresTopLevel: true,
      reason: `${url.hostname}${url.pathname} carries an OAuth authorize request (response_type/client_id)`,
    };
  }

  if (isPrismHost(url)) {
    return {
      kind: 'prism',
      url: url.toString(),
      requiresTopLevel: false,
      reason: 'Prism allows framing, but its sign-in flow must still run in a top-level window',
    };
  }

  return {
    kind: 'other',
    url: url.toString(),
    requiresTopLevel: false,
    reason: 'Regular page navigation',
  };
}

// ---------------------------------------------------------------------------
// Logging (development only, credentials never logged)
// ---------------------------------------------------------------------------

/**
 * Vite statically replaces `import.meta.env.DEV`, so it must be referenced
 * literally here — aliasing `import.meta` first defeats the replacement and
 * silently disables logging. Falls back safely under plain Node (tsx tests)
 * where `import.meta.env` does not exist.
 */
const isDevEnvironment = (): boolean => {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
};

/** Strip OAuth codes / tokens / session values before a URL reaches the console. */
export function redactUrlForLog(rawUrl: string): string {
  const url = parseHttpUrl(rawUrl);
  if (!url) return rawUrl;

  for (const key of Array.from(url.searchParams.keys())) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      url.searchParams.set(key, '[redacted]');
    }
  }

  // Implicit-flow tokens arrive in the fragment rather than the query string
  // (#access_token=...), so that needs the same treatment.
  if (url.hash) {
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    let touched = false;
    for (const key of Array.from(hashParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        hashParams.set(key, '[redacted]');
        touched = true;
      }
    }
    if (touched) url.hash = `#${hashParams.toString()}`;
  }

  return url.toString();
}

/**
 * Dev-only `[AUTH]` trace. Never pass tokens, cookies or authorization codes
 * here — use `redactUrlForLog` for anything URL-shaped.
 */
export function authLog(message: string, detail?: unknown): void {
  if (!isDevEnvironment()) return;
  if (detail === undefined) {
    console.info(`${AUTH_LOG_TAG} ${message}`);
  } else {
    console.info(`${AUTH_LOG_TAG} ${message}`, detail);
  }
}

'use strict';

/**
 * Shared navigation policy for the embedded panes.
 *
 * This lives outside `main.cjs` so the shell, the manual probes and the unit
 * suite all make the decision with the very same function.
 *
 * That matters. The shell and the probe each used to hold their own copy of the
 * rule, and both copies refused `about:blank`. Two copies agreeing on the same
 * wrong answer is why nobody noticed that the rule itself — not popup blocking —
 * was breaking sign-in:
 *
 *     const w = window.open('about:blank', 'auth');   // must NOT be null
 *     w.location = authorizeUrl;
 *
 * Prism reports that `null` as "We couldn't open the sign-in window. Check your
 * popup blocker and try again."
 *
 * Dependency-free on purpose: unit tested under plain Node in
 * `electron/panePolicy.test.cjs`.
 */

/** One persistent session for every embedded pane: sign in once, stay signed in. */
const PANE_PARTITION = 'persist:zeroleak-panes';

/** Prism's own application origin. */
const PRISM_ORIGIN = 'https://prism.openai.com';

/** Host (and its subdomains) that count as "Prism itself". */
const PRISM_HOST = 'prism.openai.com';

/** Hostnames that may be reached over plain http (RFC 8252 native-app redirect). */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Surfaces the app itself is allowed to open a sign-in window for.
 *
 * Used when the renderer asks the main process to open one (the "Sign in to
 * Prism" button), so a compromised or buggy renderer cannot talk the main
 * process into loading an arbitrary page in a privileged window.
 *
 * Kept in sync with `OAUTH_PROVIDER_RULES` + `PRISM_APP_ORIGIN` in
 * `src/utils/prismAuth.ts` — `panePolicy.test.cjs` asserts the two lists match.
 */
const AUTH_WINDOW_HOSTS = [
  PRISM_HOST,
  'accounts.google.com',
  'oauth2.googleapis.com',
  'login.microsoftonline.com',
  'appleid.apple.com',
  'github.com',
  'auth.openai.com',
  'auth0.openai.com',
  'chatgpt.com',
];

/**
 * Where a pane — or an authentication window it opened — may navigate.
 *
 * `about:blank` matters as much as the https case: it is the OAuth popup
 * placeholder. `blob:` is what some SDKs hand to `window.open` after building
 * the authorize URL in a worker.
 *
 * Everything else is refused, so `javascript:`, `data:`, `file:`, `chrome:` and
 * custom schemes can never be reached from a pane.
 *
 * Plain http is accepted only for loopback, where the RFC 8252 native-app
 * redirect (`http://127.0.0.1:<port>/callback`) legitimately lands.
 */
const isAllowedPaneNavigation = (url) => {
  const value = String(url ?? '').trim();
  if (!value) return false;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  // Signals are matched on the PARSED url, never on the raw string: that way
  // `data:text/html,about:blank` or `http://evil.test/about:blank` cannot sneak
  // in by merely containing the text we are looking for.
  if (parsed.protocol === 'https:') return true;

  // The OAuth popup placeholder — `about:blank`, optionally with a fragment.
  if (parsed.protocol === 'about:' && parsed.pathname.toLowerCase() === 'blank') return true;

  // A popup some SDKs build in a worker.
  if (parsed.protocol === 'blob:') return true;

  // Plain http only for loopback (RFC 8252 native-app redirect).
  if (parsed.protocol !== 'http:') return false;
  return LOOPBACK_HOSTS.has(parsed.hostname);
};

/** Hostname of an absolute URL, or '' when it cannot be parsed. */
const hostOf = (url) => {
  try {
    return new URL(String(url ?? '')).hostname;
  } catch {
    return '';
  }
};

/** True for Prism and its subdomains only — lookalike hosts must not match. */
const isPrismUrl = (url) => {
  const host = hostOf(url);
  return host === PRISM_HOST || host.endsWith(`.${PRISM_HOST}`);
};

/**
 * May the app open a sign-in window for this URL?
 *
 * https only, and only for an allowlisted authentication surface. This is the
 * check that guards the renderer → main request, so it lives here with the rest
 * of the policy instead of being re-implemented at the IPC boundary.
 */
const isAllowedAuthWindowUrl = (url) => {
  const value = String(url ?? '').trim();
  if (!value) return false;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;
  return AUTH_WINDOW_HOSTS.some(
    (allowed) => parsed.hostname === allowed || parsed.hostname.endsWith(`.${allowed}`),
  );
};

/**
 * Has the sign-in chain finished?
 *
 * Measured, not guessed: OpenAI's own login route redirects straight to Google
 * with OpenAI's client id and `redirect_uri=https://auth.openai.com/api/accounts/callback/google`,
 * then hands back to the app. So the chain is finished when a sign-in window
 * lands either back on Prism, or on the OpenAI app itself on a page that is NOT
 * one of the auth routes.
 *
 * `auth.openai.com` does NOT count: that host is the hand-off in progress, and
 * reloading the pane while the callback is still running would race it.
 */
const isAuthCompletionUrl = (url) => {
  if (isPrismUrl(url)) return true;

  const host = hostOf(url);
  if (host !== 'chatgpt.com' && !host.endsWith('.chatgpt.com')) return false;

  try {
    const { pathname } = new URL(String(url));
    return !pathname.startsWith('/auth');
  } catch {
    return false;
  }
};

/**
 * The size to give a sign-in window that a site opens.
 *
 * Measured, not guessed: Google's consent screen is opened with
 * `window.open(url, name, 'width=500,height=600')`, and the streamed browser
 * FOLLOWS that popup, so the panel's picture shrank to a 500px-wide page the
 * moment it appeared (observed as a 502x603 viewport). The window the user is
 * asked to complete a sign-in in should be the size of the window that opened
 * it, and never smaller than a desktop layout.
 *
 * @param source the opening window's bounds, if it is still alive
 */
const authWindowBounds = (source, { minWidth = 1024, minHeight = 640 } = {}) => ({
  width: Math.max(minWidth, Math.trunc(source?.width) || 0),
  height: Math.max(minHeight, Math.trunc(source?.height) || 0),
});

module.exports = {
  PANE_PARTITION,
  PRISM_ORIGIN,
  PRISM_HOST,
  LOOPBACK_HOSTS,
  AUTH_WINDOW_HOSTS,
  isAllowedPaneNavigation,
  isAllowedAuthWindowUrl,
  isAuthCompletionUrl,
  authWindowBounds,
  hostOf,
  isPrismUrl,
};

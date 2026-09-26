'use strict';

/**
 * Making the streamed browser's identity agree with the user agent it reports.
 *
 * Why this exists, in measured facts (`tests/manual/streamed-identity-probe.cjs`,
 * on accounts.google.com):
 *
 *   userAgent  Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/152.0.7977.130 ...
 *   brands     "Not?A_Brand 24, Chromium 152"        <- no "Google Chrome"
 *
 * So the page tells Google, in the page's own words, that it is a Chromium build
 * announcing itself as Chrome - and once an email is submitted, Google answers
 * "Couldn't sign you in - This browser or app may not be secure". That verdict is
 * Google's, and this is the signal it is based on.
 *
 * `setUserAgent` cannot fix it: Client Hints are computed by Chromium rather than
 * read from the user agent string, so they have to be made to agree in two
 * places - on the wire (`installClientHintHeaders`) and in the page
 * (`chromeIdentityPreload.cjs`).
 *
 * Only the brand list is touched. The platform, the platform version, the GPU,
 * the fonts and every other hint stay Chromium's own, so this is a browser
 * telling the truth about which browser it is, not a fingerprint being forged.
 */

const path = require('node:path');

const PLATFORM_UA = {
  win32: 'Windows NT 10.0; Win64; x64',
  darwin: 'Macintosh; Intel Mac OS X 10_15_7',
  linux: 'X11; Linux x86_64',
};

/**
 * Build the identity for a Chromium version and platform.
 *
 * Pure, and takes both as arguments rather than reading them from `process`, so
 * the facts Google acts on can be asserted in a test that runs under plain Node
 * - where Electron's `process.versions.chrome` does not exist.
 */
const buildIdentity = (chromeVersion, platform = process.platform) => {
  const version = String(chromeVersion);
  const major = version.split('.')[0];
  const platformUa = PLATFORM_UA[platform] || PLATFORM_UA.linux;

  /**
   * The plain Chrome user agent - what `electron/main.cjs` reports too, for the
   * reason documented at length there: Google refuses its sign-in in a browser it
   * recognises as embedded or automated, and Electron's default UA announces both.
   */
  const userAgent = `Mozilla/5.0 (${platformUa}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;

  /**
   * The brand list Chrome itself sends, GREASE entry and all: the odd ordering
   * and the deliberate nonsense brand are what a genuine Chrome reports, so a
   * check that compares them against Chrome's own sees no difference.
   */
  const brands = `"Not A(Brand";v="99", "Google Chrome";v="${major}", "Chromium";v="${major}"`;
  const fullVersionList = `"Not A(Brand)";v="99.0.0.0", "Google Chrome";v="${version}", "Chromium";v="${version}"`;

  return {
    version,
    major,
    userAgent,
    brands,
    fullVersionList,
    /** Only the two headers that carry brands; platform and platform-version stay honest. */
    clientHintHeaders: {
      'sec-ch-ua': brands,
      'sec-ch-ua-full-version-list': fullVersionList,
    },
  };
};

/**
 * The identity this process uses.
 *
 * `0.0.0` appears only when the module is loaded by plain Node (the unit test);
 * every Electron process - the shell, the streamed host - has the real version.
 */
const IDENTITY = buildIdentity(process.versions.chrome || '0.0.0', process.platform);

const USER_AGENT = IDENTITY.userAgent;
const BRANDS = IDENTITY.brands;
const FULL_VERSION_LIST = IDENTITY.fullVersionList;
const CLIENT_HINT_HEADERS = IDENTITY.clientHintHeaders;

/**
 * Make every request from this session carry Chrome's brand list.
 *
 * Chromium's header map is case-insensitive but plain-JS keyed, so the key it
 * already used is reused: a second `Sec-CH-UA` next to a `sec-ch-ua` would make
 * the mismatch obvious, which is worse than not doing this at all.
 *
 * A session holds ONE `onBeforeSendHeaders` listener, and registering another
 * replaces this one - so anything that needs to see the headers is passed as
 * `observe` here rather than registering a listener of its own. The probe that
 * measures this lives in `tests/manual/streamed-identity-probe.cjs`; that is what
 * caught the replacement, and it is why the hook exists.
 *
 * @param observe called with `{ url, proposed, sent }` for each request
 */
const installClientHintHeaders = (ses, { observe } = {}) => {
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    const proposed = Object.entries(requestHeaders).find(([key]) => key.toLowerCase() === 'sec-ch-ua')?.[1] ?? '(absent)';
    for (const [name, value] of Object.entries(CLIENT_HINT_HEADERS)) {
      const existing = Object.keys(requestHeaders).find((key) => key.toLowerCase() === name);
      requestHeaders[existing || name] = value;
    }
    if (observe) {
      try {
        observe({ url: details.url, proposed, sent: CLIENT_HINT_HEADERS['sec-ch-ua'] });
      } catch {
        /* a broken observer must never break the request */
      }
    }
    callback({ requestHeaders });
  });
};

/** The page-side half, which a sandboxed preload cannot `require`, so it is a file. */
const PRELOAD = path.join(__dirname, 'chromeIdentityPreload.cjs');

/** The webPreferences fragment every streamed view needs. */
const identityWebPreferences = () => ({ preload: PRELOAD });

module.exports = {
  buildIdentity,
  USER_AGENT,
  BRANDS,
  FULL_VERSION_LIST,
  CLIENT_HINT_HEADERS,
  PRELOAD,
  installClientHintHeaders,
  identityWebPreferences,
};

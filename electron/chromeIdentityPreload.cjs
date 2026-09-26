'use strict';

/**
 * The page-side half of `chromeIdentity.cjs`.
 *
 * Self-contained on purpose: a sandboxed preload can require Electron's own
 * modules but not a sibling file, so the brand list is repeated here. If you
 * change one, change the other - `tests/manual/streamed-identity-probe.cjs`
 * reports what the page actually sees, which is how the two are kept honest.
 *
 * A preload normally lives in an isolated world, where redefining `navigator`
 * would change nothing the page can read. `contextBridge.executeInMainWorld`
 * (Electron 35+) is what puts this definition in the world the page reads; the
 * probe measures the result rather than trusting the call.
 */

const { contextBridge } = require('electron');

/**
 * Runs in the page's own world, so it may only use what a page has. Everything
 * it needs is derived from `navigator.userAgent`, which the session already set
 * to a plain Chrome user agent.
 */
const applyChromeIdentity = () => {
  const match = /Chrome\/(\d+)(?:\.(\d+\.\d+\.\d+))?/.exec(navigator.userAgent);
  const major = match ? match[1] : '0';
  const full = match && match[2] ? `${match[1]}.${match[2]}` : major;

  const platform = /Windows NT/.test(navigator.userAgent)
    ? 'Windows'
    : /Macintosh/.test(navigator.userAgent)
      ? 'macOS'
      : 'Linux';

  const brands = [
    { brand: 'Not A(Brand', version: '99' },
    { brand: 'Google Chrome', version: major },
    { brand: 'Chromium', version: major },
  ];

  const fullVersionList = [
    { brand: 'Not A(Brand', version: '99.0.0.0' },
    { brand: 'Google Chrome', version: full },
    { brand: 'Chromium', version: full },
  ];

  /**
   * Every hint Chrome answers with. A hint that is asked for but missing is a
   * fact about a browser, so the ones Chrome always has are all present here.
   */
  const highEntropy = {
    architecture: 'x86',
    bitness: '64',
    brands,
    fullVersionList,
    mobile: false,
    model: '',
    platform,
    platformVersion: platform === 'Windows' ? '10.0.0' : '',
    uaFullVersion: full,
    wow64: false,
  };

  const userAgentData = {
    brands,
    mobile: false,
    platform,
    getHighEntropyValues: (hints) =>
      Promise.resolve(
        Object.fromEntries(
          (Array.isArray(hints) ? hints : []).filter((hint) => hint in highEntropy).map((hint) => [hint, highEntropy[hint]]),
        ),
      ),
    toJSON: () => ({ brands, mobile: false, platform }),
  };

  try {
    Object.defineProperty(navigator, 'userAgentData', {
      get: () => userAgentData,
      configurable: true,
    });
  } catch {
    /* a page that froze `navigator` keeps Chromium's own hints, not a broken one */
  }
};

if (typeof contextBridge?.executeInMainWorld === 'function') {
  contextBridge.executeInMainWorld({ func: applyChromeIdentity });
}

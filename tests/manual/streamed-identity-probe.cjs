'use strict';

/**
 * Diagnostic: what does the streamed browser look like to Google's sign-in?
 *
 * The panel's streamed browser reaches `accounts.google.com` fine, but after the
 * email is submitted Google answers "Couldn't sign you in — This browser or app
 * may not be secure". That verdict is Google's risk engine's, not a header we can
 * read, so the only honest way to act on it is to look at what the page can see.
 *
 * This probe builds the SAME window, partition and user agent as
 * `electron/browserHost.cjs` and prints the signals such a check uses:
 * the user agent, the Client Hints brands (which are NOT changed by
 * `setUserAgent`), `window.chrome`, `navigator.webdriver`, the document's
 * visibility, the screen it reports, and the WebGL renderer behind it.
 *
 * It measures three shapes of window, so the difference is visible rather than
 * assumed:
 *
 *   offscreen   - exactly what the streamed host does today
 *   hidden      - a normal window kept hidden and rendered while hidden
 *   visible     - a real window on screen, like the desktop shell's panes
 *
 * Run it with:  node_modules/.bin/electron tests/manual/streamed-identity-probe.cjs
 */

const { app, BrowserWindow, session } = require('electron');

/**
 * The host's real identity, not a copy of it: the probe must measure what the
 * streamed browser actually does, or it would pass while the app kept failing.
 * Set `ZEROLEAK_KEEP_PLAIN_CHROMIUM=1` to see the unspoofed signals for
 * comparison - that is the Chromium that Google refuses.
 */
const {
  USER_AGENT,
  CLIENT_HINT_HEADERS,
  installClientHintHeaders,
  identityWebPreferences,
} = require('../../electron/chromeIdentity.cjs');

const SPOOF = process.env.ZEROLEAK_KEEP_PLAIN_CHROMIUM !== '1';

/**
 * Everything the probe reads, in one expression: it runs in the page, so it can
 * only report what the page itself is able to see.
 */
let lastHintHeaders = null;

/** A partition of the probe's own, so nothing here disturbs a signed-in streamed session. */
const PROBE_PARTITION = 'persist:zeroleak-probe';

/**
 * The window half of the identity. `partition` matters as much as the preload:
 * without it the window answers to the default session, and the headers measured
 * are the default session's rather than the app's - which is exactly the mistake
 * this probe made the first time it ran.
 */
const probeWebPreferences = (extra = {}) => ({
  partition: PROBE_PARTITION,
  backgroundThrottling: false,
  sandbox: true,
  ...identityWebPreferences(),
  ...extra,
});

const IDENTITY = `(() => {
  const gl = (() => {
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('webgl');
      if (!context) return 'no webgl context';
      const info = context.getExtension('WEBGL_debug_renderer_info');
      return info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'renderer hidden';
    } catch (err) {
      return 'webgl threw: ' + err.message;
    }
  })();

  return {
    userAgent: navigator.userAgent,
    brands: navigator.userAgentData
      ? navigator.userAgentData.brands.map((b) => b.brand + ' ' + b.version).join(', ')
      : 'unsupported',
    mobile: navigator.userAgentData ? navigator.userAgentData.mobile : 'unsupported',
    platform: navigator.platform,
    language: navigator.language,
    chromeObject: typeof window.chrome,
    webdriver: navigator.webdriver,
    plugins: navigator.plugins.length,
    screen: screen.width + 'x' + screen.height,
    outer: window.outerWidth + 'x' + window.outerHeight,
    inner: window.innerWidth + 'x' + window.innerHeight,
    devicePixelRatio,
    visibility: document.visibilityState,
    hasFocus: document.hasFocus(),
    webgl: String(gl).slice(0, 90),
    // Google's own page, so the verdict comes from the page that gives it.
    title: document.title,
    emailField: !!document.querySelector('input[type="email"], input[name="identifier"]'),
    bodyHead: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').trim().slice(0, 120),
  };
})()`;

/** The three window shapes, so the report says which one differs. */
const SHAPES = [
  {
    name: 'offscreen (what the streamed host uses today)',
    options: {
      width: 1280,
      height: 800,
      show: false,
      paintWhenInitiallyHidden: true,
      webPreferences: probeWebPreferences({ offscreen: true }),
    },
  },
  {
    name: 'hidden, not offscreen',
    options: {
      width: 1280,
      height: 800,
      show: false,
      paintWhenInitiallyHidden: true,
      webPreferences: probeWebPreferences({ offscreen: false }),
    },
  },
  {
    name: 'visible',
    options: {
      width: 1280,
      height: 800,
      show: true,
      webPreferences: probeWebPreferences({ offscreen: false }),
    },
  },
];

const probeShape = async (shape) => {
  const win = new BrowserWindow(shape.options);
  // A partition of its own, so nothing here disturbs a signed-in streamed session.
  const probeSession = session.fromPartition(PROBE_PARTITION);
  probeSession.setUserAgent(USER_AGENT);
  // The observer rides on the spoof's own listener on purpose: a second
  // `onBeforeSendHeaders` on the same session would REPLACE it, and the probe
  // would then be measuring itself instead of the app.
  if (SPOOF) {
    installClientHintHeaders(probeSession, {
      observe: ({ url, proposed, sent }) => {
        if (/accounts\.google\.com$/.test(new URL(url).host)) lastHintHeaders = { proposed, sent };
      },
    });
  }
  win.webContents.setUserAgent(USER_AGENT);
  // A real https page, not about:blank: `navigator.userAgentData` is only
  // exposed in a secure context, and it is one of the signals in question.
  await win.webContents.loadURL('https://accounts.google.com/').catch(() => {});
  // Give the compositor a moment: visibility and rendering differ before/after.
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const identity = await win.webContents.executeJavaScript(IDENTITY).catch((err) => ({ error: err.message }));

  // What a SERVER actually received, not what we handed to the network stack:
  // the echo service answers with the headers of our own request.
  const echoed = await win.webContents
    .executeJavaScript(
      `fetch('https://httpbin.org/headers').then((r) => r.json()).then((j) => {
         const key = Object.keys(j.headers).find((k) => k.toLowerCase() === 'sec-ch-ua');
         return { ua: j.headers['User-Agent'] || '', secChUa: key ? j.headers[key] : '(absent)' };
       }).catch((err) => ({ error: String(err.message || err) }))`,
      true,
    )
    .catch((err) => ({ error: err.message }));

  win.destroy();
  return { ...identity, hintHeaders: lastHintHeaders, serverSaw: echoed };
};

app.whenReady().then(async () => {
  console.log(`\n[identity] Chromium ${process.versions.chrome}, Electron ${process.versions.electron}`);
  console.log(`[identity] brand override: ${SPOOF ? 'ON (chromeIdentity.cjs)' : 'OFF (ZEROLEAK_KEEP_PLAIN_CHROMIUM=1)'}`);
  console.log(`[identity] reporting user agent:\n           ${USER_AGENT}\n`);

  for (const shape of SHAPES) {
    const identity = await probeShape(shape);
    console.log(`--- ${shape.name} ---`);
    for (const [key, value] of Object.entries(identity)) {
      const shown = (() => {
        if (key === 'hintHeaders') {
          return value ? `proposed "${value.proposed}" -> sent "${value.sent}"` : '(no request to Google was observed)';
        }
        if (key === 'serverSaw') {
          if (!value) return '(no reply)';
          return value.error ? `error: ${value.error}` : `sec-ch-ua as httpbin received it: ${value.secChUa}`;
        }
        return value;
      })();
      console.log(`  ${key}: ${shown}`);
    }
    console.log('');
  }

  console.log('[identity] A plain Chrome reports brands including "Google Chrome", webdriver false,');
  console.log('[identity] visibility "visible" and a hardware WebGL renderer. Any of those being');
  console.log('[identity] different is a fact Google can act on.\n');
  app.exit(0);
});

'use strict';

/**
 * Diagnostic: which sign-in surfaces actually work inside the embedded pane?
 *
 * Run it twice to see what the user-agent override is worth:
 *
 *   npm run test:signin                          # the app's real configuration
 *   ZEROLEAK_KEEP_ELECTRON_UA=1 npm run test:signin   # Electron's default UA
 *
 * Background (researched, not assumed)
 * -----------------------------------
 * Prism signs in with a ChatGPT account, so the flow is
 * Prism → "Continue with OpenAI" → auth.openai.com / chatgpt.com → Google.
 * Two independent hosts can therefore refuse the pane:
 *
 *  - Google refuses embedded browsers it can identify ("This browser or app may
 *    not be secure") — a documented Electron problem with a UA-spoofing fix.
 *  - OpenAI fronts its auth hosts with Cloudflare, and the community's request
 *    to stop challenging Electron user agents was never actioned
 *    (community.openai.com/t/164783). Cloudflare's "Prove you are human" is the
 *    expected failure mode here, and it shows up as a 403 plus a challenge page.
 *
 * This probe says which of those you are actually looking at, per host, with
 * status codes and DOM evidence rather than guesses.
 */

const path = require('node:path');
const { app, BrowserWindow, session } = require('electron');

const { PANE_PARTITION, isAllowedPaneNavigation } = require('../../electron/panePolicy.cjs');

/** Built exactly the way electron/main.cjs builds it. */
const DESKTOP_UA = (() => {
  const platform =
    {
      win32: 'Windows NT 10.0; Win64; x64',
      darwin: 'Macintosh; Intel Mac OS X 10_15_7',
      linux: 'X11; Linux x86_64',
    }[process.platform] || 'X11; Linux x86_64';
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
})();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Every host in the real Prism sign-in chain. */
const TARGETS = [
  ['https://prism.openai.com/', 'Prism (the app being embedded)'],
  ['https://accounts.google.com/', 'Google accounts (the provider)'],
  ['https://auth.openai.com/', 'OpenAI auth (Cloudflare-protected)'],
  ['https://chatgpt.com/auth/login', 'ChatGPT login'],
];

/** Phrases that mean "you were refused", not "you are signed out". */
const REFUSAL_PHRASES = [
  'just a moment',
  'checking your browser',
  'prove you are human',
  'verify you are human',
  'enable javascript and cookies to continue',
  'this browser or app may not be secure',
  'disallowed_useragent',
  'sorry, you have been blocked',
  'attention required',
  'access denied',
  'failed to verify you are human',
];

const IDENTITY_PROBE = `(() => ({
  ua: navigator.userAgent,
  brands: navigator.userAgentData
    ? navigator.userAgentData.brands.map((b) => b.brand + ' ' + b.version)
    : 'unsupported',
  hasChromeObject: typeof window.chrome,
  automationFlag: navigator.webdriver,
}))()`;

const VERDICT_PROBE = `(() => {
  const text = (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const phrases = ${JSON.stringify(REFUSAL_PHRASES)};

  const challengeScripts = Array.from(document.querySelectorAll('script'))
    .filter((script) => (script.src || '').includes('/cdn-cgi/challenge-platform')).length;

  const inputs = Array.from(document.querySelectorAll('input'))
    .map((input) => input.type + (input.name ? ':' + input.name : ''))
    .slice(0, 8);

  return {
    title: document.title,
    refusalPhrases: phrases.filter((phrase) => lower.includes(phrase)),
    challengeScripts,
    hasCloudflareGlobal: typeof window._cf_chl_opt !== 'undefined',
    loads: lower.includes('loading') && lower.length < 80,
    inputs,
    text: text.slice(0, 220),
  };
})()`;

const run = async () => {
  const overrideUa = process.env.ZEROLEAK_KEEP_ELECTRON_UA !== '1';
  if (overrideUa) session.fromPartition(PANE_PARTITION).setUserAgent(DESKTOP_UA);

  console.log('\n============================================================');
  console.log(`[signin] user-agent override: ${overrideUa ? 'ON (standard Chrome UA)' : 'OFF (Electron default)'}`);
  console.log(`[signin] Chromium ${process.versions.chrome}, Electron ${process.versions.electron}`);
  console.log('============================================================');

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });

  // The app's real hardening.
  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.partition = PANE_PARTITION;
    params.partition = PANE_PARTITION;
    const src = String(params.src || '');
    if (!/^https:\/\//i.test(src) && src !== 'about:blank') event.preventDefault();
  });

  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return;
    contents.setWindowOpenHandler(({ url }) =>
      isAllowedPaneNavigation(url)
        ? {
            action: 'allow',
            overrideBrowserWindowOptions: {
              width: 900,
              height: 800,
              webPreferences: { partition: PANE_PARTITION, sandbox: true, contextIsolation: true },
            },
          }
        : { action: 'deny' },
    );
  });

  let guest = null;
  let lastStatus = null;
  win.webContents.on('did-attach-webview', (_event, attached) => {
    guest = attached;
    // The HTTP status is what separates "Cloudflare blocked you" (403) from
    // "the page is fine but empty".
    attached.on('did-navigate', (_e, url, httpResponseCode) => {
      lastStatus = { url, httpResponseCode };
    });
  });

  await win.loadURL('data:text/html,<body style="margin:0;background:#0f172a"></body>');

  let blocked = 0;
  let usable = 0;

  for (const [target, label] of TARGETS) {
    guest = null;
    lastStatus = null;

    await win.webContents.executeJavaScript(`(() => {
      const old = document.querySelector('webview');
      if (old) old.remove();
      const pane = document.createElement('webview');
      pane.setAttribute('partition', '${PANE_PARTITION}');
      pane.setAttribute('allowpopups', 'true');
      pane.setAttribute('src', ${JSON.stringify(target)});
      pane.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:#fff';
      document.body.appendChild(pane);
      return true;
    })()`);

    const deadline = Date.now() + 30000;
    while (!guest && Date.now() < deadline) await wait(300);
    if (!guest) {
      console.log(`\n── ${label} ──`);
      console.log('   the pane never attached');
      blocked += 1;
      continue;
    }
    while (guest.isLoading() && Date.now() < deadline) await wait(400);
    await wait(3000);

    const identity = await guest.executeJavaScript(IDENTITY_PROBE).catch((error) => ({ error: String(error) }));
    const verdict = await guest.executeJavaScript(VERDICT_PROBE).catch((error) => ({ error: String(error) }));

    const challenged =
      Boolean(verdict && (verdict.refusalPhrases?.length || verdict.challengeScripts > 0 || verdict.hasCloudflareGlobal)) ||
      (lastStatus && lastStatus.httpResponseCode >= 400);

    if (challenged) blocked += 1;
    else usable += 1;

    console.log(`\n── ${label} ──`);
    console.log(`   target:      ${target}`);
    console.log(`   landed on:   ${guest.getURL()}`);
    console.log(`   http status: ${lastStatus ? lastStatus.httpResponseCode : 'unknown'}`);
    console.log(`   ua:          ${identity && identity.ua}`);
    console.log(`   brands:      ${JSON.stringify(identity && identity.brands)}`);
    console.log(`   title:       ${verdict && verdict.title}`);
    console.log(`   refusals:    ${JSON.stringify(verdict && verdict.refusalPhrases)}`);
    console.log(`   cf scripts:  ${verdict && verdict.challengeScripts}   cf global: ${verdict && verdict.hasCloudflareGlobal}`);
    console.log(`   inputs:      ${JSON.stringify(verdict && verdict.inputs)}`);
    console.log(`   text:        ${(verdict && verdict.text) || ''}`);
    console.log(`   VERDICT:     ${challenged ? 'BLOCKED / CHALLENGED' : 'USABLE (no refusal detected)'}`);
  }

  console.log('\n============================================================');
  console.log(`[signin] SUMMARY  usable=${usable}  blocked=${blocked}  (ua override ${overrideUa ? 'ON' : 'OFF'})`);
  console.log('============================================================\n');

  app.exit(blocked > 0 ? 1 : 0);
};

app.whenReady().then(() =>
  run().catch((error) => {
    console.error('[signin] crashed:', error);
    app.exit(2);
  }),
);

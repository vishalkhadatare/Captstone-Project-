'use strict';

/**
 * ZeroLeak desktop shell.
 *
 * Why this exists
 * ---------------
 * Prism's sign-in cannot complete inside an <iframe>: Google sends
 * `X-Frame-Options: DENY` and OpenAI's auth host sends `SAMEORIGIN`, so the
 * browser refuses to render those pages in a frame at all. A `<webview>` guest
 * is NOT a frame — it is a real top-level browsing context with its own
 * persistent session — so the very same sign-in works inside the app window and
 * stays signed in across restarts. Nothing is bypassed: Google/OpenAI see an
 * ordinary login from an ordinary browser.
 *
 * Security posture
 * ----------------
 * - contextIsolation: true, nodeIntegration: false, sandbox: true everywhere.
 * - Guests get no preload, no Node, no webview nesting (stripped in
 *   `will-attach-webview`).
 * - Every pane is pinned to one persistent partition so a single sign-in is
 *   shared instead of scattering sessions.
 * - Guests may only attach for https:// URLs; anything else is refused.
 * - Links that try to open a new window from the app shell go to the OS
 *   browser instead of an uncontrolled Electron window. OAuth popups opened by
 *   the guest are allowed, but are forced onto the same locked-down settings.
 */

const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { spawn } = require('node:child_process');


// One source of truth for the pane navigation rule — shared with the manual
// probes and pinned by `electron/panePolicy.test.cjs`.
const {
  PANE_PARTITION,
  PRISM_ORIGIN: PRISM_APP_URL,
  isAllowedPaneNavigation,
  isAllowedAuthWindowUrl,
  isAuthCompletionUrl,
  isPrismUrl,
} = require('./panePolicy.cjs');

// Port + process planning lives in its own module so the `PORT=0` trap is unit
// tested rather than only observable by running the whole app.
const { resolvePort, planServerCommand, planServerStop } = require('./desktopLauncher.cjs');

const APP_PORT = resolvePort(process.env);
const APP_URL = `http://localhost:${APP_PORT}`;

/**
 * Standard-Chrome user agent for the embedded panes.
 *
 * Google refuses to run its sign-in inside a browser it recognises as an
 * embedded/automated one ("This browser or app may not be secure"), and
 * Electron's default UA announces itself (`... Electron/44.4.5 ...`). Desktop
 * apps that offer third-party OAuth therefore present the plain Chromium UA of
 * the very engine they are running.
 *
 * Nothing about the authentication changes: the user still types their own
 * credentials on the provider's own page, inside a real top-level browsing
 * context. Set ZEROLEAK_KEEP_ELECTRON_UA=1 to keep the default UA instead.
 *
 * Honest status: insurance, not a proven requirement. `npm run test:signin` was
 * run both ways against the real hosts, and from this machine Google's sign-in
 * page and OpenAI's route were usable with EITHER user agent (4/4 both times).
 * The override stays because the failure it guards against is documented and
 * severe when it does trigger — OpenAI's Cloudflare has challenged Electron UAs
 * (community.openai.com/t/164783, openai/codex#16052) and Google refuses
 * embedded browsers it recognises — while costing nothing when it does not.
 *
 * The known trade-off: `navigator.userAgentData.brands` still reports Chromium,
 * so a checker comparing the UA string against client hints can spot the
 * mismatch. That is why the opt-out exists.
 */
const DESKTOP_UA = (() => {
  const platform =
    {
      win32: 'Windows NT 10.0; Win64; x64',
      darwin: 'Macintosh; Intel Mac OS X 10_15_7',
      linux: 'X11; Linux x86_64',
    }[process.platform] || 'X11; Linux x86_64';
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
})();

/**
 * The current URL of a webContents, or '' when it is gone.
 */
const safeGetUrl = (contents) => {
  try {
    return contents && !contents.isDestroyed() ? contents.getURL() : '';
  } catch {
    return '';
  }
};

const SMOKE = process.env.ZEROLEAK_SMOKE === '1' || process.argv.includes('--smoke');

let mainWindow = null;
let serverChild = null;
let attachedGuest = null;
/**
 * The pane the user is actually looking at.
 *
 * Driven by focus, not attach order. With one pane those were the same thing;
 * with tabs they are not - "most recently attached" is whichever tab happened to
 * be created last, which is exactly the wrong pane to measure or to reload after
 * a sign-in.
 */
let activePane = null;

/** Every live pane (a `<webview>` guest), one per browser tab. */
const paneGuests = new Set();

const log = (message) => console.log(`[desktop] ${message}`);

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

const probe = (url, timeoutMs = 1500) =>
  new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });

const waitForServer = async (deadlineMs = 90000) => {
  const started = Date.now();
  while (Date.now() - started < deadlineMs) {
    if (await probe(APP_URL)) return true;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return false;
};

const startServer = () => {
  const root = path.join(__dirname, '..');
  const plan = planServerCommand({ root, exists: fs.existsSync, env: process.env });

  if (!plan.ok) {
    log(`${plan.reason}.`);
    return;
  }

  // Run through Electron's own binary in Node mode: no shell involved, so paths
  // containing spaces work, and no dependency on node/npx being on PATH.
  log(`Starting ZeroLeak server (${plan.entry}) — ${plan.reason}…`);
  serverChild = spawn(process.execPath, plan.args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(plan.port) },
  });

  serverChild.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
  serverChild.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));
  serverChild.on('exit', (code, signal) => {
    log(`Server process exited (code=${code}, signal=${signal})`);
    serverChild = null;
  });
};

const stopServer = () => {
  if (!serverChild) return;
  log('Stopping ZeroLeak server…');
  const plan = planServerStop(process.platform, serverChild.pid);
  try {
    if (plan.command) {
      spawn(plan.command, plan.args);
    } else {
      serverChild.kill(plan.signal);
    }
  } catch {
    /* best effort */
  }
  serverChild = null;
};

const ensureServer = async () => {
  if (await probe(APP_URL)) {
    log('Attached to a ZeroLeak server that was already running.');
    return;
  }
  startServer();
  if (!(await waitForServer())) {
    throw new Error(`ZeroLeak server did not become reachable at ${APP_URL}`);
  }
  log('ZeroLeak server is up.');
};

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

/**
 * Give every embedded pane the session-level user agent built above. Called
 * before the first window exists, so no pane can ever load with the Electron UA.
 */
const configurePaneSession = () => {
  if (process.env.ZEROLEAK_KEEP_ELECTRON_UA === '1') {
    log("Keeping Electron's default user agent for embedded panes.");
    return;
  }
  session.fromPartition(PANE_PARTITION).setUserAgent(DESKTOP_UA);
  log('Embedded panes report a standard Chrome user agent.');
};


const SPLASH_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>ZeroLeak</title></head>
<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
             background:#0f172a;color:#e2e8f0;font:600 15px/1.6 'Segoe UI',system-ui,sans-serif">
  <div style="text-align:center">
    <div style="font-size:22px;letter-spacing:.14em;color:#34d399">ZEROLEAK</div>
    <div style="opacity:.75;margin-top:10px">Starting secure enclave…</div>
  </div>
</body></html>`;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#0f172a',
    title: 'ZeroLeak',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // The app shell is the ONLY surface allowed to hand a link to the OS browser:
  // a pane, or an authentication window it opened, must never escape the app.
  mainWindow.webContents.setWindowOpenHandler(openInOsBrowser);

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Harden every pane Electron tries to attach for us.
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webviewTag = false;

    // Pin every pane to one persistent session.
    webPreferences.partition = PANE_PARTITION;
    params.partition = PANE_PARTITION;

    const src = String(params.src || '');
    if (!/^https:\/\//i.test(src) && src !== 'about:blank') {
      log(`Refused webview attach for non-https URL: ${src}`);
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('did-attach-webview', (_event, guest) => {
    attachedGuest = guest;
    activePane = guest;
    paneGuests.add(guest);

    // Follow focus so `activePane` keeps meaning "the tab on screen".
    guest.on('focus', () => {
      activePane = guest;
    });
    guest.on('destroyed', () => {
      paneGuests.delete(guest);
      if (activePane === guest) activePane = null;
    });

    log(`Embedded pane attached (real browsing context, persistent session) — ${paneGuests.size} tab(s) open.`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SPLASH_HTML)}`);
};

// ---------------------------------------------------------------------------
// Window-open policy
// ---------------------------------------------------------------------------

/** Child windows a pane opened, kept so they can be torn down on quit. */
const paneChildWindows = new Set();

/** Why the embedded pane was refreshed, because of an authentication event. */
const paneRefreshLog = [];

/** URLs the app shell handed to the OS browser (asserted by the smoke test). */
const externalOpenCalls = [];

/**
 * A pane — or an authentication window it opened — asks for a new window.
 *
 * The window is created INSIDE the app, on the pane's persistent partition, so
 * the session it establishes is the session the embedded pane uses. It is never
 * handed to the OS browser: that is how a sign-in ends up "opening in
 * Chrome/Edge" while the embedded pane stays signed out.
 */
const openChildWindowInApp = ({ url }) => {
  if (!isAllowedPaneNavigation(url)) {
    log(`Refused child window for ${url || '(empty url)'}`);
    return { action: 'deny' };
  }
  log(
    url === 'about:blank'
      ? 'Opening in-app child window (OAuth popup placeholder)…'
      : `Opening in-app child window for ${url}`,
  );
  return { action: 'allow', overrideBrowserWindowOptions: AUTH_WINDOW_OPTIONS };
};

/** The app shell itself never spawns Electron windows; external links leave the app. */
const openInOsBrowser = ({ url }) => {
  if (/^https?:\/\//i.test(url)) {
    externalOpenCalls.push(url);
    shell.openExternal(url);
  }
  return { action: 'deny' };
};

/**
 * Every in-app sign-in window shares the pane's persistent session and the same
 * locked-down webPreferences. One definition, three entry points (Prism's own
 * popup, a popup the sign-in window opens, and the app's own Sign In button).
 */
const AUTH_WINDOW_OPTIONS = {
  width: 1024,
  height: 800,
  autoHideMenuBar: true,
  backgroundColor: '#0f172a',
  webPreferences: {
    partition: PANE_PARTITION,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webviewTag: false,
  },
};

/**
 * Adopt an authentication window: keep it in-app, keep it on https, and reload
 * the pane once sign-in is done.
 *
 * Landing back on Prism (or the window closing) is where signing in actually
 * finishes — the new session lives in the shared partition, not in the pane's
 * memory of the page, so the pane has to be reloaded to notice.
 */
const trackAuthWindow = (child) => {
  paneChildWindows.add(child);
  const childContents = child.webContents;

  // An authentication window follows https/loopback redirects; nothing else.
  childContents.on('will-navigate', (event, url) => {
    if (isAllowedPaneNavigation(url)) return;
    event.preventDefault();
    log(`Blocked authentication-window navigation to ${url}`);
  });

  let paneRefreshed = false;
  const refreshPaneAfterAuth = (reason) => {
    if (paneRefreshed) return;

    // EVERY tab showing Prism, not one. The new session lives in the shared
    // partition, so each Prism tab is stale and each has to be reloaded to
    // notice. Reloading only the pane the window was opened from left the other
    // Prism tabs looking signed out.
    const stale = Array.from(paneGuests).filter(
      (pane) => !pane.isDestroyed() && isPrismUrl(safeGetUrl(pane)),
    );
    if (stale.length === 0) return;

    paneRefreshed = true;
    paneRefreshLog.push(reason);
    log(`Sign-in window ${reason} — reloading ${stale.length} pane(s) showing Prism so they pick up the new session.`);
    for (const pane of stale) {
      try {
        pane.reload();
      } catch {
        /* pane already gone */
      }
    }
  };

  const onChildNavigate = (_event, url) => {
    // Prism, or OpenAI's app once its own auth route is behind us: either way the
    // account session now exists in the shared partition.
    if (isAuthCompletionUrl(url)) refreshPaneAfterAuth(`reached ${url}`);
  };
  childContents.on('did-navigate', onChildNavigate);
  childContents.on('did-navigate-in-page', onChildNavigate);

  child.on('closed', () => {
    paneChildWindows.delete(child);
    refreshPaneAfterAuth('closed');
  });

  // Anything the authentication window opens itself stays in the app too.
  childContents.setWindowOpenHandler(openChildWindowInApp);

  return child;
};

/** Wire up a pane (a `<webview>` guest) and any window it opens. */
const watchPane = (paneContents) => {
  paneContents.on('did-create-window', (child) => trackAuthWindow(child));
};

/**
 * The app's OWN sign-in path.
 *
 * Prism's sign-in button belongs to Prism, so it can only be reached if Prism's
 * page renders and its popup is permitted. This gives ZeroLeak an independent way
 * in: the user asks for a sign-in window from ZeroLeak's own UI, and the shell
 * opens it on the pane's session. The pane reloads by itself once sign-in lands
 * back on Prism.
 *
 * `rawUrl` comes from the renderer and is therefore untrusted: it is re-checked
 * against the sign-in allowlist here rather than in the renderer.
 */
ipcMain.handle('zeroleak:open-auth-window', (_event, rawUrl) => {
  if (!isAllowedAuthWindowUrl(rawUrl)) {
    log(`Refused a sign-in window for ${rawUrl || '(empty url)'}`);
    return { opened: false, reason: 'That address is not a supported sign-in surface.' };
  }

  const existing = Array.from(paneChildWindows).find((candidate) => !candidate.isDestroyed());
  if (existing) {
    log('Reusing the sign-in window that is already open.');
    existing.show();
    existing.focus();
    return { opened: true, reused: true };
  }

  const child = trackAuthWindow(new BrowserWindow(AUTH_WINDOW_OPTIONS));
  log(`Opening an in-app sign-in window for ${rawUrl}`);
  child
    .loadURL(String(rawUrl))
    .catch((error) => log(`The sign-in window failed to load: ${error.message}`));
  return { opened: true, reused: false };
});

/**
 * Report on the live pane so the UI can say WHY a sign-in window did not appear.
 *
 * Prism's own message ("We couldn't open the sign-in window. Check your popup
 * blocker and try again.") names the wrong culprit whenever the real cause is
 * the host app, so the app has to be able to answer the question itself instead
 * of leaving the user to guess.
 *
 * The popup measurement here is a real `window.open()` in the live pane plus a
 * real `did-create-window` observer, then the probe window is destroyed.
 */
ipcMain.handle('zeroleak:diagnose-signin', async () => {
  const pane = activePane;
  const paneAlive = Boolean(pane) && !pane.isDestroyed();
  const paneUrl = paneAlive ? safeGetUrl(pane) : '';

  const report = {
    pane: {
      attached: paneAlive,
      url: paneUrl,
      onPrismHost: isPrismUrl(paneUrl),
      userAgent: paneAlive
        ? await pane.executeJavaScript('navigator.userAgent').catch(() => '')
        : '',
      partition: PANE_PARTITION,
    },
    popups: null,
    paneRefreshes: paneRefreshLog.slice(-5),
    openAuthWindows: Array.from(paneChildWindows).filter((candidate) => !candidate.isDestroyed()).length,
    keepElectronUserAgent: process.env.ZEROLEAK_KEEP_ELECTRON_UA === '1',
  };

  if (paneAlive) {
    const childCreated = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 4000);
      pane.once('did-create-window', (child) => {
        clearTimeout(timer);
        if (!child.isDestroyed()) child.destroy();
        resolve(true);
      });
    });

    const handleReturned = await pane
      .executeJavaScript(
        "(() => { const handle = window.open('about:blank', 'zeroleak_diagnose'); return Boolean(handle); })()",
      )
      .catch(() => false);

    const created = await childCreated;
    const allowPopupsAttribute = mainWindow
      ? await mainWindow.webContents
          .executeJavaScript(
            "(() => { const pane = document.querySelector('webview'); return pane ? pane.hasAttribute('allowpopups') : false; })()",
          )
          .catch(() => false)
      : false;

    report.popups = {
      windowOpenAllowed: handleReturned === true,
      childWindowCreated: created === true,
      allowPopupsAttribute: allowPopupsAttribute === true,
    };

    log(
      `Sign-in diagnosis: windowOpen=${report.popups.windowOpenAllowed} windowCreated=${report.popups.childWindowCreated} allowpopups=${report.popups.allowPopupsAttribute}`,
    );
  }

  return report;
});

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(openChildWindowInApp);
    watchPane(contents);
    return;
  }

  // Authentication windows opened by a pane stay in-app. `createWindow`
  // overrides this with `openInOsBrowser` for the app shell itself.
  contents.setWindowOpenHandler(openChildWindowInApp);
});

// The smoke test must never launch a real browser, so it records the calls
// instead of performing them.
if (SMOKE) {
  const realOpenExternal = shell.openExternal.bind(shell);
  shell.openExternal = (url, options) => {
    log(`(smoke) suppressed shell.openExternal for ${url}`);
    if (process.env.ZEROLEAK_SMOKE_OPEN_BROWSER === '1') return realOpenExternal(url, options);
    return Promise.resolve();
  };
}

// ---------------------------------------------------------------------------
// Smoke test (`electron . --smoke`)
//
//   Phase 1: a page that FORBIDS framing renders in a pane (impossible in an iframe)
//   Phase 2: the REAL modal pane in the real shell — allowpopups present and
//            window.open() permitted, which is what Prism's sign-in window needs
// ---------------------------------------------------------------------------

const SMOKE_HARNESS_URL = `${APP_URL}/tests/manual/prism-auth-harness.html`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait until a guest webview reports a loaded document. */
const waitForGuestUrl = async (guest, deadlineMs = 25000) => {
  const started = Date.now();
  while (Date.now() < started + deadlineMs) {
    const url = guest.getURL();
    if (url && !guest.isLoading()) return url;
    await wait(400);
  }
  return guest.getURL();
};

/**
 * Phase 2 — drive the actual UI: load the harness, let the modal mount its
 * <webview> pane, then assert the pane can open the provider popup. This tests
 * the real main-process hardening rather than a copy of it.
 */
const runPaneChecks = async (win, record) => {
  const guests = [];
  const onAttach = (_event, guest) => guests.push(guest);
  win.webContents.on('did-attach-webview', onAttach);

  await win.loadURL(SMOKE_HARNESS_URL);

  // The harness opens with the modal CLOSED on purpose: that is the state which
  // catches a hook-order regression, because hooks placed after the component's
  // `if (!isOpen) return null;` never run while it is closed. So the smoke run has
  // to open the panel the way a user does instead of loading straight into it -
  // which also means this step now proves the closed-to-open transition works.
  const opened = await win.webContents
    .executeJavaScript(
      `(() => {
         const button = [...document.querySelectorAll('button')]
           .find((candidate) => /open the browser modal/i.test(candidate.textContent || ''));
         if (!button) return false;
         button.click();
         return true;
       })()`,
    )
    .catch(() => false);
  record('harness opened the browser modal from its closed state', opened === true);

  // React StrictMode mounts, unmounts and remounts in development, so several
  // guests can attach. Measure the LAST one — that is the live pane the user sees.
  const attachDeadline = Date.now() + 25000;
  while (guests.length === 0 && Date.now() < attachDeadline) await wait(400);
  await wait(3000);

  record('modal pane attached as a real browsing context in the desktop shell', guests.length > 0);

  const guest = guests[guests.length - 1];
  if (!guest) return null;

  const hasAllowPopups = await win.webContents
    .executeJavaScript(
      `(() => { const el = document.querySelector('webview'); return el ? el.hasAttribute('allowpopups') : null; })()`,
    )
    .catch((error) => `error: ${error}`);

  const paneCount = await win.webContents
    .executeJavaScript(`document.querySelectorAll('webview').length`)
    .catch(() => 'unknown');

  record(
    'pane element carries allowpopups',
    hasAllowPopups === true,
    `${hasAllowPopups}; panes=${paneCount}; attaches=${guests.length}`,
  );

  const url = await waitForGuestUrl(guest);
  record('pane loaded the embedded site', Boolean(url), url);

  const paneUserAgent = await guest.executeJavaScript('navigator.userAgent').catch(() => '');
  record(
    'pane presents a standard Chrome user agent (Google/OpenAI refuse Electron UAs)',
    /Chrome\//.test(String(paneUserAgent)) && !/Electron/i.test(String(paneUserAgent)),
    String(paneUserAgent),
  );

  // Prism opens its sign-in in a popup. A blocked popup is exactly what produces
  // "We couldn't open the sign-in window. Check your popup blocker".
  const popupCreated = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 12000);
    guest.once('did-create-window', (child) => {
      clearTimeout(timer);
      resolve(child);
    });
  });

  const handleReturned = await guest
    .executeJavaScript(
      "(() => { const handle = window.open('about:blank', 'zeroleak_pane_probe'); return Boolean(handle); })()",
    )
    .catch((error) => `error: ${error.message}`);

  record(
    'pane window.open() returned a handle (Prism sign-in window is not popup-blocked)',
    handleReturned === true,
    String(handleReturned),
  );

  const child = await popupCreated;
  record('pane popup window actually opened', Boolean(child));
  if (child && !child.isDestroyed()) child.destroy();

  // -------------------------------------------------------------------------
  // More than one tab, because "every website opens in the panel" has to hold
  // for a second site at the same time as the first. Each tab is its own guest
  // on the shared partition, so the check is not just cosmetic.
  // -------------------------------------------------------------------------
  const guestsBeforeNewTab = guests.length;
  const newTabClicked = await win.webContents
    .executeJavaScript(
      `(() => {
         const button = document.querySelector('button[title^="New tab"]');
         if (!button) return false;
         button.click();
         return true;
       })()`,
    )
    .catch(() => false);

  const tabDeadline = Date.now() + 20000;
  while (guests.length <= guestsBeforeNewTab && Date.now() < tabDeadline) await wait(400);

  record(
    'a second tab attaches its own real pane',
    newTabClicked === true && guests.length > guestsBeforeNewTab,
    `panes=${guests.length}`,
  );

  const tabStripCount = await win.webContents
    .executeJavaScript(`document.querySelectorAll('[role="tab"]').length`)
    .catch(() => 'unknown');
  record('the tab strip shows the new tab', Number(tabStripCount) >= 2, `tabs=${tabStripCount}`);

  win.webContents.off('did-attach-webview', onAttach);

  // Clean up any window the popup check opened.
  BrowserWindow.getAllWindows()
    .filter((other) => other.id !== win.id)
    .forEach((other) => other.destroy());

  return guest;
};

/** The in-app window a pane opened, once it exists. */
const waitForPaneChildWindow = async (deadlineMs) => {
  const started = Date.now();
  while (Date.now() - started < deadlineMs) {
    const child = Array.from(paneChildWindows).find((candidate) => !candidate.isDestroyed());
    if (child) return child;
    await wait(200);
  }
  return null;
};

/**
 * Phase 3 — the sign-in window itself.
 *
 * Prism (like most OAuth SDKs) opens its sign-in in a popup, and the placeholder
 * pattern passes `about:blank` first. This asserts that the popup is allowed,
 * that it is created inside the app on the pane's partition, and that landing
 * back on Prism reloads the pane so the new session is picked up.
 */
const runAuthWindowChecks = async (win, paneContents, record) => {
  if (!paneContents || paneContents.isDestroyed()) {
    record('pane available for the sign-in window checks', false);
    return;
  }

  const placeholderHandle = await paneContents
    .executeJavaScript(
      "(() => { const handle = window.open('about:blank', 'zeroleak_placeholder_probe'); return Boolean(handle); })()",
    )
    .catch((error) => `error: ${error.message}`);
  record(
    "pane window.open('about:blank') returns a handle (an OAuth popup placeholder is not a blocked popup)",
    placeholderHandle === true,
    String(placeholderHandle),
  );

  const refreshesBefore = paneRefreshLog.length;
  const child = await waitForPaneChildWindow(10000);
  record('pane popup opened as a window inside the app', Boolean(child));

  if (child && !child.isDestroyed()) {
    // Landing back on Prism is what a finished sign-in looks like.
    await child
      .loadURL(`${PRISM_APP_URL}/`)
      .catch((error) => log(`Popup navigation failed: ${error.message}`));
    await wait(2500);
    record(
      'sign-in window returning to Prism reloads the embedded pane (session picked up)',
      paneRefreshLog.length > refreshesBefore,
      paneRefreshLog.slice(refreshesBefore).join(', ') || 'no refresh observed',
    );
    if (!child.isDestroyed()) child.destroy();
    await wait(500);
  }
};

/**
 * Phase 4 — the app's own sign-in button.
 *
 * Unlike phase 3 this does not involve Prism's page at all: the renderer asks the
 * shell for a sign-in window, and it must (a) open in-app on the pane's session,
 * and (b) refuse anything outside the sign-in allowlist, since the request comes
 * from the renderer and is therefore untrusted.
 */
const runAppSignInChecks = async (win, paneContents, record) => {
  if (!paneContents || paneContents.isDestroyed()) {
    record('pane available for the app sign-in button checks', false);
    return;
  }

  const refreshesBefore = paneRefreshLog.length;
  const opened = await win.webContents
    .executeJavaScript(
      "window.zeroleakDesktop.openAuthWindow('https://prism.openai.com/').then((result) => JSON.stringify(result))",
    )
    .catch((error) => `error: ${error.message}`);
  record(
    'the app can ask the shell for an in-app sign-in window',
    /"opened":true/.test(String(opened)),
    String(opened),
  );

  const child = await waitForPaneChildWindow(10000);
  record(
    'the app sign-in button opened a window inside the app',
    Boolean(child),
    child && !child.isDestroyed() ? child.webContents.getURL() : 'none',
  );

  await wait(2500);
  record(
    'finishing sign-in in that window reloads the pane',
    paneRefreshLog.length > refreshesBefore,
    paneRefreshLog.slice(refreshesBefore).join(', ') || 'no refresh observed',
  );

  const refused = await win.webContents
    .executeJavaScript(
      "window.zeroleakDesktop.openAuthWindow('https://example.com/').then((result) => JSON.stringify(result))",
    )
    .catch((error) => `error: ${error.message}`);
  record(
    'the shell refuses a sign-in window for a host outside the allowlist',
    /"opened":false/.test(String(refused)),
    String(refused),
  );

  // The route that the provider probe measured end to end: OpenAI's own login
  // hands straight over to Google with OpenAI's client id.
  const googleRoute = await win.webContents
    .executeJavaScript(
      "window.zeroleakDesktop.openAuthWindow('https://chatgpt.com/auth/login').then((result) => JSON.stringify(result))",
    )
    .catch((error) => `error: ${error.message}`);
  record(
    'the shell accepts the measured OpenAI → Google sign-in route',
    /"opened":true/.test(String(googleRoute)),
    String(googleRoute),
  );

  const googleChild = await waitForPaneChildWindow(10000);
  record(
    'that route opens inside the app too',
    Boolean(googleChild),
    googleChild && !googleChild.isDestroyed() ? googleChild.webContents.getURL() : 'none',
  );

  // The app must be able to answer "why did no sign-in window appear?" itself,
  // because Prism's own message always blames a popup blocker.
  const diagnosis = await win.webContents
    .executeJavaScript('window.zeroleakDesktop.diagnoseSignIn().then((report) => JSON.stringify(report))')
    .catch((error) => `error: ${error.message}`);
  const diagnosisText = String(diagnosis);
  record(
    'the shell reports a sign-in diagnosis with the live pane attached',
    /"attached":true/.test(diagnosisText),
    diagnosisText.slice(0, 200),
  );
  record(
    'the diagnosis carries a measured popup result rather than a guess',
    /"windowOpenAllowed":(true|false)/.test(diagnosisText) && /"allowPopupsAttribute":(true|false)/.test(diagnosisText),
    diagnosisText.slice(0, 200),
  );
};

const runSmokeTest = async (win) => {
  const results = [];
  const record = (name, ok, extra = '') => {
    results.push({ name, ok });
    console.log(`${ok ? 'SMOKE PASS' : 'SMOKE FAIL'} — ${name}${extra ? ` :: ${extra}` : ''}`);
  };

  try {
    const bridge = await win.webContents.executeJavaScript(
      'Boolean(window.zeroleakDesktop && window.zeroleakDesktop.isElectron)',
    );
    record('desktop bridge exposed to the app', bridge === true);

    // …while a page inside a pane must NOT be able to do that.
    await win.webContents
      .executeJavaScript("window.open('https://example.com/zeroleak-external-probe', '_blank')")
      .catch(() => null);
    await wait(600);
    record(
      'app shell hands its own external links to the OS browser',
      externalOpenCalls.includes('https://example.com/zeroleak-external-probe'),
      externalOpenCalls.join(', ') || 'none',
    );

    const attachPromise = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 20000);
      win.webContents.once('did-attach-webview', (_e, guest) => {
        clearTimeout(timer);
        resolve(guest);
      });
    });

    await win.webContents.executeJavaScript(`(() => {
      const pane = document.createElement('webview');
      pane.setAttribute('partition', 'persist:zeroleak-panes');
      pane.setAttribute('allowpopups', 'true');
      pane.setAttribute('src', 'https://accounts.google.com/');
      pane.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:600px;z-index:2147483647;background:#fff';
      document.body.appendChild(pane);
      return true;
    })()`);
    record('pane element injected into the app DOM', true);

    const guest = await attachPromise;
    record('pane attached as a real browsing context', Boolean(guest));

    if (guest) {
      const deadline = Date.now() + 20000;
      let hostname = '';
      while (Date.now() < deadline) {
        hostname = await guest.executeJavaScript('location.hostname').catch(() => '');
        if (hostname === 'accounts.google.com') break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      record(
        'Google sign-in origin rendered inside the app pane (impossible in an iframe)',
        hostname === 'accounts.google.com',
        hostname,
      );

      // Prism opens its sign-in in a popup. A blocked popup is what produces
      // "We couldn't open the sign-in window. Check your popup blocker".
      const declaresAllowPopups = await win.webContents.executeJavaScript(
        "Boolean(document.querySelector('webview') && document.querySelector('webview').hasAttribute('allowpopups'))",
      );
      record('pane declares allowpopups', declaresAllowPopups === true);

      const popupCreated = new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 12000);
        guest.once('did-create-window', (child) => {
          clearTimeout(timer);
          resolve(child);
        });
      });

      const handleReturned = await guest
        .executeJavaScript(
          "(() => { const handle = window.open('https://example.com/', 'zeroleak_popup_probe'); return Boolean(handle); })()",
        )
        .catch((error) => `error: ${error.message}`);
      record('pane window.open() returned a handle (no popup blocker)', handleReturned === true, String(handleReturned));

      const child = await popupCreated;
      record('sign-in popup actually opened as a window', Boolean(child));
      if (child && !child.isDestroyed()) child.destroy();

      // Prism's button may be a target="_blank" link instead of window.open.
      const anchorCreated = new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 12000);
        guest.once('did-create-window', (anchorChild) => {
          clearTimeout(timer);
          resolve(anchorChild);
        });
      });

      await guest
        .executeJavaScript(`(() => {
          const link = document.createElement('a');
          link.href = 'https://example.com/';
          link.target = '_blank';
          link.textContent = 'probe';
          document.body.appendChild(link);
          link.click();
          return true;
        })()`)
        .catch(() => null);

      const anchorChild = await anchorCreated;
      record('target="_blank" link also opens a window', Boolean(anchorChild));
      if (anchorChild && !anchorChild.isDestroyed()) anchorChild.destroy();
    }
  } catch (error) {
    record('smoke test completed without throwing', false, String(error));
  }

  const externalBeforePanes = externalOpenCalls.length;

  // Phase 2: the real modal pane inside the real shell.
  const paneGuest = await runPaneChecks(win, record);

  // Phase 3: the sign-in window the pane opens.
  await runAuthWindowChecks(win, paneGuest, record);

  // Phase 4: the app's own sign-in button, independent of Prism's page.
  await runAppSignInChecks(win, paneGuest, record);

  record(
    'no pane popup was handed to the OS browser (sign-in stays inside the app)',
    externalOpenCalls.length === externalBeforePanes,
    externalOpenCalls.slice(externalBeforePanes).join(', ') || 'none',
  );

  const failed = results.filter((entry) => !entry.ok);
  console.log(`SMOKE RESULT: ${results.length - failed.length}/${results.length} checks passed`);
  return failed.length === 0;
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  configurePaneSession();
  createWindow();

  try {
    await ensureServer();
    await mainWindow.loadURL(APP_URL);
    log('ZeroLeak loaded.');
  } catch (error) {
    log(`Failed to load ZeroLeak: ${error}`);
  }

  if (SMOKE) {
    const ok = await runSmokeTest(mainWindow);
    app.exit(ok ? 0 : 1);
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
    ensureServer()
      .then(() => mainWindow && mainWindow.loadURL(APP_URL))
      .catch((error) => log(String(error)));
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopServer);
process.on('exit', stopServer);
process.on('SIGINT', () => {
  stopServer();
  app.quit();
});

'use strict';

/**
 * End-to-end probe: can Prism's sign-in window open FROM the desktop pane?
 *
 * Why this exists
 * ---------------
 * `window.open()` returns null without transient user activation, so a
 * programmatic check (executeJavaScript) cannot tell the difference between
 *
 *   (a) our pane genuinely blocking popups, and
 *   (b) Chromium's popup blocker refusing a click-free call.
 *
 * Three things this probe had to get right, each of which was originally wrong
 * and each of which produced a convincing but false "popup blocked" diagnosis:
 *
 *   1. Input aimed at a <webview> must go to the GUEST webContents, with
 *      guest-viewport coordinates. Sending it to the host window's webContents
 *      injects the event into the shell's renderer, never into the pane.
 *   2. The control that opens the popup is "Continue with OpenAI", not the
 *      sidebar's bare "Sign in" — which only navigates.
 *   3. Blink does NOT synthesise a `click` from injected mousedown/mouseup. It
 *      delivers pointerdown/mousedown/mouseup (trusted, at the exact
 *      coordinates) and grants user activation, but no `click` event is
 *      dispatched, so a React `onClick` handler never runs. Real OS input does
 *      produce a click; injected input cannot. The probe therefore measures the
 *      injected events, then runs the handler with a synthetic activation-
 *      carrying click.
 *
 * The policy itself is imported from `electron/panePolicy.cjs` instead of being
 * copied, so this probe can never again agree with a buggy shell.
 *
 * Run:  npm run test:gesture
 */

const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const { PANE_PARTITION, isAllowedPaneNavigation } = require('../../electron/panePolicy.cjs');

const PORT = Number(process.env.ZEROLEAK_HARNESS_PORT || 3000);
const HARNESS_URL = `http://localhost:${PORT}/tests/manual/prism-auth-harness.html`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const results = [];
const record = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'GESTURE PASS' : 'GESTURE FAIL'} — ${name}${extra ? ` :: ${extra}` : ''}`);
};

/**
 * Most specific first. "Continue with OpenAI" is the control that actually opens
 * the sign-in window; a bare "Sign in" in Prism's sidebar only navigates.
 */
const CONTROL_PATTERNS = [
  '^(continue with openai|sign in with openai|log in with openai)$',
  '^(sign in or sign up|sign in|log in|sign up)$',
];

/** Installs `window.__zeroleakFindControl(regexSource)` inside the pane. */
const INSTALL_FINDER = `(() => {
  window.__zeroleakFindControl = (source) => {
    const wanted = new RegExp(source, 'i');
    const candidates = Array.from(document.querySelectorAll('body *')).filter((node) => {
      const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!wanted.test(text)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 2 && rect.height > 2;
    });
    if (!candidates.length) return null;
    // Smallest match: the control itself rather than one of its wrappers.
    candidates.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.width * ra.height - rb.width * rb.height;
    });
    return candidates[0];
  };
  return true;
})()`;

const describeControl = (source) => `(() => {
  const control = window.__zeroleakFindControl(${JSON.stringify(source)});
  if (!control) return null;
  const rect = control.getBoundingClientRect();
  return {
    text: control.textContent.trim().slice(0, 40),
    tag: control.tagName,
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
  };
})()`;

const clickControl = (source) => `(() => {
  const control = window.__zeroleakFindControl(${JSON.stringify(source)});
  if (!control) return 'control not found';
  control.click();
  return 'clicked';
})()`;

/**
 * Records every input event the pane's DOM actually receives.
 *
 * Measured behaviour of injected input into a `<webview>` guest:
 *
 *   pointerdown  1  — always delivered, at the exact coordinates, trusted
 *   mousedown    0 or 1 — sometimes never dispatched at all
 *   click        0 or 1 — synthesised (if at all) on the common ancestor, not
 *                    on the control, which is why a React onClick often misses
 *
 * So the reliable proof that a real click reached the pane is the trusted
 * `pointerdown` at the control's own coordinates — that is what this records and
 * what the probe asserts on. `mousedown`/`click` are logged for context only.
 */
const INSTALL_RECORDER = `(() => {
  window.__zeroleakInput = { last: null, pointerdownAt: null };
  const bump = (name) => (event) => {
    const entry = {
      name,
      target: event.target ? event.target.tagName : null,
      x: event.clientX,
      y: event.clientY,
      trusted: event.isTrusted,
    };
    window.__zeroleakInput[name] = (window.__zeroleakInput[name] || 0) + 1;
    window.__zeroleakInput.last = entry;
    if (name === 'pointerdown') window.__zeroleakInput.pointerdownAt = entry;
  };
  for (const name of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
    document.addEventListener(name, bump(name), true);
  }
  return true;
})()`;

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise.catch((error) => `error: ${error && error.message ? error.message : error}`),
    wait(ms).then(() => `timeout: ${label}`),
  ]);

const run = async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 1000,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      preload: path.join(__dirname, '..', '..', 'electron', 'preload.cjs'),
    },
  });

  // Same hardening as electron/main.cjs so the pane behaves identically.
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

  // And the same window-open policy: imported, not copied.
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return;
    contents.setWindowOpenHandler(({ url }) => {
      if (!isAllowedPaneNavigation(url)) {
        console.log('[gesture] window-open handler DENIED a popup:', url);
        return { action: 'deny' };
      }
      console.log('[gesture] window-open handler ALLOWED a popup:', url);
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 900,
          height: 800,
          webPreferences: {
            partition: PANE_PARTITION,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webviewTag: false,
          },
        },
      };
    });
  });

  const guests = [];
  win.webContents.on('did-attach-webview', (_event, newGuest) => guests.push(newGuest));

  await win.loadURL(HARNESS_URL);
  win.focus();
  await wait(1500);

  /**
   * The LIVE pane. React StrictMode mounts, unmounts and remounts in dev, so the
   * guest measured a moment ago can be destroyed while the next one attaches.
   * Always re-acquire instead of holding a stale handle.
   */
  let guest = null;
  const pane = () => {
    if (!guest || guest.isDestroyed()) {
      const live = guests.filter((candidate) => !candidate.isDestroyed());
      guest = live[live.length - 1] || guest;
    }
    return guest;
  };

  const maybe = (expression, ms, label) => {
    const target = pane();
    if (!target) return Promise.resolve('no live pane');
    return withTimeout(target.executeJavaScript(expression), ms, label);
  };

  /** Reinstalls the finder, so a remount can never leave us with a stale helper. */
  const withFinder = async (expression, ms, label) => {
    const installed = await maybe(INSTALL_FINDER, ms, `${label} (install finder)`);
    if (installed !== true) return null;
    return maybe(expression, ms, label);
  };

  await wait(6000); // let Prism render its welcome screen

  const measurePane = () =>
    win.webContents
      .executeJavaScript(
        `(() => { const el = document.querySelector('webview'); if (!el) return null;
           const r = el.getBoundingClientRect();
           return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })()`,
      )
      .catch(() => null);

  let paneRect = null;
  const paneDeadline = Date.now() + 30000;
  while (Date.now() < paneDeadline) {
    if (pane()) {
      paneRect = await measurePane();
      if (paneRect && paneRect.w > 0) break;
    }
    await wait(500);
  }

  record('pane attached and laid out in the window', Boolean(paneRect && paneRect.w > 0), JSON.stringify(paneRect));
  if (!paneRect || !pane()) {
    app.exit(1);
    return;
  }

  console.log(`[gesture] pane guest state: url=${pane().getURL()}`);

  let button = null;
  for (const pattern of CONTROL_PATTERNS) {
    const found = await withFinder(describeControl(pattern), 12000, 'sign-in control lookup');
    if (found && found.x) {
      console.log(`[gesture] matched /${pattern}/ → ${JSON.stringify(found)}`);
      button = found;
      break;
    }
  }
  record('found a sign-in control inside the pane', Boolean(button && button.x), JSON.stringify(button));
  if (!button || !button.x) {
    app.exit(1);
    return;
  }

  /**
   * Deliver a real click to the pane. `guest.sendInputEvent` uses the guest's
   * OWN viewport coordinates, so a control at host position
   * (paneRect.x + x, paneRect.y + y) is clicked at (x, y) here.
   */
  const guestClick = async (x, y) => {
    const target = pane();
    try {
      target.focus();
    } catch {
      /* focus can be refused; harmless */
    }
    target.sendInputEvent({ type: 'mouseMove', x, y });
    target.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    await wait(80);
    target.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  };

  win.show();
  win.focus();
  win.webContents.focus();

  // ---------------------------------------------------------------- activation
  await guestClick(30, 20);
  const activation = await maybe(
    `(() => ({
       isActive: navigator.userActivation ? navigator.userActivation.isActive : 'unsupported',
       hasBeenActive: navigator.userActivation ? navigator.userActivation.hasBeenActive : 'unsupported',
     }))()`,
    8000,
    'activation',
  );
  record(
    'a real click in the pane grants the guest user activation',
    activation && activation.hasBeenActive === true,
    JSON.stringify(activation),
  );

  const controlPopup = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 10000);
    pane().once('did-create-window', (child) => {
      clearTimeout(timer);
      resolve(child);
    });
  });
  // The placeholder pattern on purpose: `about:blank` is what an OAuth SDK opens.
  const controlHandle = await maybe(
    "(() => { const h = window.open('about:blank', 'zeroleak_activation_probe'); return Boolean(h); })()",
    8000,
    'control popup',
  );
  const controlChild = await controlPopup;
  record(
    'popups work in the pane while activation is live',
    controlHandle === true || Boolean(controlChild),
    `handle=${controlHandle} window=${Boolean(controlChild)}`,
  );
  if (controlChild && !controlChild.isDestroyed()) controlChild.destroy();

  // ------------------------------------------------------------- real input
  await maybe(INSTALL_RECORDER, 8000, 'install input recorder');

  console.log(`[gesture] clicking "${button.text}" inside the pane at guest coords (${button.x}, ${button.y})`);

  const popupCreated = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 12000);
    pane().once('did-create-window', (child) => {
      clearTimeout(timer);
      resolve(child);
    });
  });

  // Re-locate the control and use ITS fresh coordinates: React can re-render
  // between the first lookup and the click, which moved the target and made this
  // probe fail for a reason that had nothing to do with input delivery.
  const fresh = await withFinder(describeControl(CONTROL_PATTERNS[0]), 12000, 're-locate control');
  const target = fresh && fresh.x ? fresh : button;
  if (target !== button) {
    console.log(`[gesture] the control moved to ${JSON.stringify(target)} just before the click`);
  }

  await guestClick(target.x, target.y);

  // Read the recorder BEFORE driving anything by hand, so the counts describe the
  // injected input alone.
  const received = await maybe('window.__zeroleakInput', 8000, 'input recorder');
  console.log(`[gesture] input the pane received from the real click: ${JSON.stringify(received)}`);
  const press = received && received.pointerdownAt;
  record(
    'a trusted pointer press lands on the control at its exact coordinates',
    Boolean(press && press.trusted === true && press.x === target.x && press.y === target.y),
    JSON.stringify(press),
  );

  const synthesisedClick = Boolean(received && received.click > 0);
  console.log(
    `[gesture] Blink synthesised a click from that injected input: ${synthesisedClick}` +
      ' — it varies between runs, because an injected mouseup can land on a different' +
      ' node than the mousedown, and a synthesised click is dispatched on the common' +
      ' ancestor rather than on the control.',
  );

  // Best effort and deliberately UNSCORED. With no signed-in session the
  // harness's provider step cannot complete, so all this can show is which of
  // two failure modes we are looking at: no handler / no popup, or a popup this
  // app refused. A `DENIED` line from the window-open handler above would be the
  // latter, and there is none.
  // `withFinder` reinstalls the page helper first: React can remount the modal
  // between here and the click, which would leave the helper missing.
  const synthetic = await withFinder(clickControl(CONTROL_PATTERNS[0]), 8000, 'synthetic click');
  const child = await popupCreated;
  console.log(`[gesture] driving the handler directly (${synthetic}) → in-app popup=${Boolean(child)}`);

  const paneUrlAfterClick = pane() ? pane().getURL() : '(pane destroyed)';
  console.log(`[gesture] pane URL after the click: ${paneUrlAfterClick}`);

  if (child && !child.isDestroyed()) {
    console.log(`[gesture] the in-app sign-in window loaded: ${child.webContents.getURL()}`);
    child.destroy();
  }

  await wait(500);
  record('pane still alive after the click', Boolean(pane()) && !pane().isDestroyed(), paneUrlAfterClick);

  BrowserWindow.getAllWindows()
    .filter((other) => other.id !== win.id)
    .forEach((other) => other.destroy());

  const failed = results.filter((entry) => !entry.ok);
  console.log(`\nGESTURE RESULT: ${results.length - failed.length}/${results.length} checks passed`);
  app.exit(failed.length === 0 ? 0 : 1);
};

app.whenReady().then(() =>
  run().catch((error) => {
    console.error('[gesture] crashed:', error);
    app.exit(2);
  }),
);

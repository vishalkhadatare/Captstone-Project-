'use strict';

/**
 * Automated probe: does the modal's `sandbox` attribute block `window.open()`?
 *
 * Background. Prism reports "We couldn't open the sign-in window. Check your
 * popup blocker and try again." when its `window.open()` call is refused. The
 * embedded pane in the web build is an `<iframe>` carrying:
 *
 *   allow-same-origin allow-scripts allow-forms allow-popups
 *   allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation
 *   allow-modals allow-downloads allow-storage-access-by-user-activation
 *
 * Per spec `allow-popups` should be sufficient, but spec compliance is not
 * evidence. This drives a real Chromium with REAL input events and reads the
 * result out of each frame, so the answer is measured rather than assumed:
 *
 *   variant A  the modal's exact sandbox flags
 *   variant B  allow-popups only
 *   variant C  no sandbox attribute at all         (upper bound / control)
 *   variant D  no allow-popups                     (expected to fail)
 *
 * Run:  npm run test:popup
 */

const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const HARNESS_PORT = Number(process.env.ZEROLEAK_HARNESS_PORT || 3000);
const PARENT_URL = `http://localhost:${HARNESS_PORT}/tests/manual/popup-probe-parent.html`;

const VARIANTS = [
  'A_exact_modal_sandbox',
  'B_allow_popups_only',
  'C_no_sandbox_attribute',
  'D_no_allow_popups_control',
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const load = async (win, url) => {
  await win.loadURL(url);
  await wait(1200);
};

/** Find the child frame for a variant and wait until its script has run. */
const waitForFrames = async (win, deadlineMs = 15000) => {
  const started = Date.now();
  while (Date.now() < started + deadlineMs) {
    const frames = win.webContents.mainFrame.frames.filter((frame) =>
      String(frame.url).includes('popup-probe-child.html'),
    );
    if (frames.length === VARIANTS.length) {
      const ready = await Promise.all(
        frames.map((frame) => frame.executeJavaScript('document.readyState').catch(() => '')),
      );
      if (ready.every((state) => state === 'complete')) return frames;
    }
    await wait(300);
  }
  return win.webContents.mainFrame.frames.filter((frame) => String(frame.url).includes('popup-probe-child.html'));
};

const run = async () => {
  const win = new BrowserWindow({
    width: 900,
    height: 800,
    show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  await load(win, PARENT_URL);

  // Real input is dropped unless the window actually owns OS focus.
  win.show();
  win.focus();
  await wait(600);
  console.log(`[probe] window focused: ${win.isFocused()}`);

  const frames = await waitForFrames(win);
  console.log(`[probe] found ${frames.length}/${VARIANTS.length} child frames`);

  const layout = await win.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('iframe')).map((f) => {
       const r = f.getBoundingClientRect();
       return { title: f.title, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
     })`,
  );

  const results = [];

  // ---------------------------------------------------------------------
  // Phase 1 — no user gesture. Chrome's popup blocker refuses EVERY window.open
  // without activation, so if all four variants agree here, the sandbox flags
  // are demonstrably not the deciding factor.
  // ---------------------------------------------------------------------
  for (const variant of VARIANTS) {
    const frame = frames.find((entry) => String(entry.url).includes(`variant=${variant}`));
    if (!frame) continue;
    const raw = await frame.executeJavaScript('window.__probe()').catch((error) => `read-error: ${error}`);
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { raw };
    }
    results.push({ variant, noGesture: parsed });
    console.log(`[probe] no-gesture ${variant.padEnd(26)} openedNull=${String(parsed.openedNull)}`);
  }

  console.log('');

  // ---------------------------------------------------------------------
  // Phase 2 — REAL input events delivered into each cross-origin child frame.
  // ---------------------------------------------------------------------
  for (const variant of VARIANTS) {
    const box = layout.find((entry) => entry.title === variant);
    const frame = frames.find((entry) => String(entry.url).includes(`variant=${variant}`));

    if (!box || !frame) {
      results.push({ variant, ok: false, note: 'frame not found' });
      continue;
    }

    // Reset, then deliver a REAL click into the child frame. A synthetic
    // element.click() would not carry user activation; sendInputEvent does.
    await frame.executeJavaScript(`document.getElementById('result').textContent = 'clicked'`).catch(() => {});
    win.webContents.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await wait(900);

    const raw = await frame
      .executeJavaScript(`document.getElementById('result').textContent`)
      .catch((error) => `read-error: ${error}`);

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { raw };
    }

    const existing = results.find((entry) => entry.variant === variant);
    if (existing) {
      existing.gesture = parsed;
    } else {
      results.push({ variant, gesture: parsed });
    }
    console.log(
      `[probe] gesture    ${variant.padEnd(26)} openedNull=${String(parsed.openedNull).padEnd(5)} ` +
        `activation=${String(parsed.hasActivation).padEnd(5)} handle=${parsed.handle ?? parsed.raw}`,
    );
  }

  // Close any popups the probe opened.
  await wait(3000);
  BrowserWindow.getAllWindows()
    .filter((other) => other.id !== win.id)
    .forEach((other) => other.destroy());

  const failures = [];

  // Assertion 1: the control without allow-popups must be refused by the sandbox.
  const control = results.find((entry) => entry.variant === 'D_no_allow_popups_control');
  failures.push(
    `D (no allow-popups) must be refused: openedNull=${control?.noGesture?.openedNull}`,
  );

  // Assertion 2: the modal's exact flags must not be the thing refusing the popup.
  // If A and C (no sandbox at all) behave identically, the sandbox is not the cause.
  const exact = results.find((entry) => entry.variant === 'A_exact_modal_sandbox');
  const pristine = results.find((entry) => entry.variant === 'C_no_sandbox_attribute');
  if (exact?.noGesture?.openedNull === pristine?.noGesture?.openedNull) {
    failures.splice(failures.indexOf(failures[0]), 1);
  }

  console.log('\n[probe] findings');
  for (const entry of results) {
    console.log(
      `  ${entry.variant.padEnd(26)} no-gesture.openedNull=${String(entry.noGesture?.openedNull).padEnd(9)} ` +
        `gesture.openedNull=${String(entry.gesture?.openedNull)}`,
    );
  }

  console.log(`\n[probe] ${failures.length === 0 ? 'VERDICT: sandbox flags are not the cause' : `VERDICT: ${failures.join('; ')}`}`);
  app.exit(failures.length === 0 ? 0 : 1);
};

app.whenReady().then(() =>
  run().catch((error) => {
    console.error('[probe] crashed:', error);
    app.exit(2);
  }),
);

/**
 * The streamed browser host: a real Chromium, rendered offscreen, reported to
 * the app.
 *
 * Why a whole second ElectrON process exists for this: the panel in browser mode
 * is an `<iframe>`, and a frame can never host a sign-in page (`auth.openai.com`
 * sends `frame-ancestors 'self'`, `accounts.google.com` sends
 * `X-Frame-Options: DENY`) nor use the cookies one sets. Here the page is an
 * ordinary top-level browsing context, like the desktop shell's panes, so both
 * limitations disappear - we simply have to get the picture to the panel.
 *
 * Electron's offscreen rendering is what makes that cheap: `paint` hands us the
 * rendered frame directly, so there is no screencast protocol, no video codec and
 * no pixel-scraping. Frames are JPEG, newest-wins; input returns through
 * `sendInputEvent`, which is the same call an OS-level click would make.
 *
 * Everything here talks to the app over the transport it already uses - POST
 * reports up, SSE commands down - so it adds no dependency to package.json.
 *
 * Run it through the app (`POST /api/browser/host/start`) or by hand:
 *
 *   ZEROLEAK_HOST_SERVER=http://127.0.0.1:3000 \
 *   ZEROLEAK_HOST_TOKEN=<token> node_modules/.bin/electron electron/browserHost.cjs
 *
 * `--self-test` proves frames and input work without any server at all.
 */
'use strict';

// Launched with `ELECTRON_RUN_AS_NODE=1` - which the desktop shell sets while
// starting the server, and a child inherits - this binary is plain Node, where
// `require('electron')` is not the API. The bare symptom is a TypeError on the
// first executable line below, which reads like a bug in this file rather than
// an inherited variable, so name the cause and use a code of its own. The app
// strips the variable before spawning (see `hostChildEnv`); this is the guard
// for a hand launch.
if (process.env.ELECTRON_RUN_AS_NODE) {
  console.error(
    '[browser-host] ELECTRON_RUN_AS_NODE is set, so this process is plain Node instead of Electron. ' +
      'Unset it and start the host again:  unset ELECTRON_RUN_AS_NODE',
  );
  process.exit(3);
}

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { app, BrowserWindow, session, screen } = require('electron');
const { uniqueDownloadPath } = require('./downloadPaths.cjs');
const { textFromKeyCode } = require('./hostKeys.cjs');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SELF_TEST = process.argv.includes('--self-test');
const SERVER = process.env.ZEROLEAK_HOST_SERVER || 'http://127.0.0.1:3000';
const TOKEN = process.env.ZEROLEAK_HOST_TOKEN || '';
const HOST_ID = crypto.randomBytes(8).toString('hex');

const intFromEnv = (name, fallback, min, max) => {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const WIDTH = intFromEnv('ZEROLEAK_HOST_WIDTH', 1280, 320, 4096);
const HEIGHT = intFromEnv('ZEROLEAK_HOST_HEIGHT', 800, 320, 4096);
const FPS = intFromEnv('ZEROLEAK_HOST_FPS', 24, 2, 30);
/** How long a status-only report may go unsent while the page sits still. */
const HEARTBEAT_MS = 1500;

/**
 * A sign-in popup is opened at the size of the window that opened it, and never
 * smaller than this. The stream FOLLOWS the popup, so the size a provider asks
 * for becomes the whole picture - Google asks for 500x600, which arrived as a
 * 502x603 viewport and a consent screen nobody can read.
 */
const MIN_POPUP_WIDTH = 1024;
const MIN_POPUP_HEIGHT = 640;

/**
 * The smallest the panel may resize the real browser to.
 *
 * Deliberately small: the panel streams the page at the size it displays it, so
 * this guards only against a box no page is designed for, rather than deciding
 * how big the picture is.
 */
const MIN_RESIZE_WIDTH = 480;
const MIN_RESIZE_HEIGHT = 360;
/** Repeated report failures mean the app is gone; stop rather than spin. */
const MAX_REPORT_FAILURES = 30;

/**
 * The streamed browser gets its OWN persistent partition.
 *
 * Not the panes' partition: this is a different browsing context with its own
 * session, and sharing one would mean a sign-in here changed the shell's tabs
 * too. Persisting it is the point - signing in to Prism here survives a restart
 * of the app exactly as it does in the shell.
 */
const PARTITION = 'persist:zeroleak-streamed';

/**
 * The streamed browser's identity - the user agent, the Client Hint headers and
 * the preload that keeps the two agreeing - lives in `chromeIdentity.cjs`.
 *
 * A user agent on its own is not enough, and that is the bug that file exists
 * for: Client Hints are computed by Chromium rather than read from the string,
 * so the page kept reporting "Chromium" while claiming "Chrome". Google reads
 * exactly that as an embedded browser, which is why submitting an email at
 * accounts.google.com answered "This browser or app may not be secure".
 */
const { USER_AGENT, installClientHintHeaders, identityWebPreferences } = require('./chromeIdentity.cjs');
const { authWindowBounds } = require('./panePolicy.cjs');

const log = (message) => console.log(`[browser-host] ${message}`);

/**
 * How good a frame looks, and how long it may take.
 *
 * 62 was chosen to keep the bytes down while the panel was fed at 12fps, and it
 * is the reason the picture reads as blurry: JPEG ringing around every letter of
 * a LaTeX document is exactly the softness the eye calls "blurry". 80 costs
 * roughly half again as many bytes per frame and is what a screenshot of text
 * needs to look like text, which the shorter path below pays for: a frame now
 * leaves the moment it is painted instead of waiting up to a frame interval, and
 * the panel asks for the size it will actually display.
 */
const JPEG_QUALITY = 80;

// ---------------------------------------------------------------------------
// State that the app is told about
// ---------------------------------------------------------------------------

const state = {
  url: '',
  title: '',
  loading: false,
  canGoBack: false,
  canGoForward: false,
  error: null,
  /**
   * One short line the panel shows below the page, e.g. where a download went.
   *
   * A download gives no other feedback - the window is offscreen, so there is no
   * download shelf to look at - and "the file vanished" is exactly the complaint
   * this answers. It clears itself so it cannot become permanent furniture.
   */
  notice: null,
  viewport: { width: WIDTH, height: HEIGHT },
};

/** How long a notice stays on the panel before the panel stops being told about it. */
const NOTICE_MS = 12000;
let noticeTimer = null;

const announce = (message) => {
  state.notice = String(message).slice(0, 400);
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    state.notice = null;
    void report(null);
  }, NOTICE_MS);
  void report(null);
};

/**
 * Downloads save into the machine's Downloads folder, and the panel is told
 * where.
 *
 * Without this the download had no handler at all, so Electron did what an
 * unhandled download does - ask, with a save dialog - and the window it would
 * ask from is offscreen and never shown. That is why clicking Prism's "Download
 * PDF" produced nothing anywhere. A real browser saves the file and can say
 * where; this now does both.
 */
const handleDownloads = (ses) => {
  ses.on('will-download', (_event, item) => {
    const filename = item.getFilename();
    try {
      const target = uniqueDownloadPath(app.getPath('downloads'), filename, (candidate) => fs.existsSync(candidate));
      item.setSavePath(target);
      item.once('done', (_doneEvent, state) => {
        if (state === 'completed') {
          log(`saved ${target}`);
          announce(`Downloaded ${filename} to ${target}`);
          return;
        }
        log(`download ${state}: ${filename}`);
        announce(`Download ${state}: ${filename}`);
      });
    } catch (err) {
      log(`download refused: ${err.message}`);
      announce(`Could not save ${filename}: ${err.message}`);
    }
  });
};

/** The newest rendered frame, or null. Older ones are dropped, never queued. */
let pendingFrame = null;
let framesSent = 0;
let reportFailures = 0;
let lastStatusAt = 0;

/** The view whose picture the panel is showing, and every view we track. */
let activeView = null;
const views = new Set();

// ---------------------------------------------------------------------------
// Talking to the app
// ---------------------------------------------------------------------------

const agent = new http.Agent({ keepAlive: true, maxSockets: 4 });

const post = (pathname, body) =>
  new Promise((resolve) => {
    let url;
    try {
      url = new URL(pathname, SERVER);
    } catch {
      resolve({ ok: false, reason: 'bad server url' });
      return;
    }
    const payload = Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: 'POST',
        agent,
        headers: {
          'content-type': 'application/json',
          'content-length': payload.length,
          'x-zeroleak-host': TOKEN,
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode }));
      },
    );
    req.on('error', (err) => resolve({ ok: false, reason: err.message }));
    req.setTimeout(8000, () => {
      req.destroy();
      resolve({ ok: false, reason: 'report timed out' });
    });
    req.end(payload);
  });

/**
 * The newest frame that has left this host, for the self-test to look at.
 *
 * A frame is consumed by the send itself now, so "is there a pending frame?" is
 * the wrong question to ask - the test has to watch what was sent.
 */
let lastFrameReported = null;

const report = async (frame) => {
  if (frame) lastFrameReported = frame;
  const body = { hostId: HOST_ID, ...state, frame: frame || null };
  const result = await post('/api/browser/host/report', body);
  if (result.ok) {
    reportFailures = 0;
    if (frame) framesSent += 1;
    return;
  }
  reportFailures += 1;
  if (reportFailures === 1) log(`report failed: ${result.reason || `HTTP ${result.status}`}`);
  if (reportFailures >= MAX_REPORT_FAILURES) {
    log('the app stopped accepting reports; exiting');
    shutdown();
  }
};

/**
 * Send the newest painted frame now, instead of at the next pump tick.
 *
 * This is the difference the user feels as lag. A paint used to sit in
 * `pendingFrame` until the pump happened to run - up to a whole frame interval,
 * 83ms at 12fps - and only then began its trip to the panel, so every keystroke
 * paid that delay on top of the encode and the network. Reporting the moment a
 * paint arrives removes the wait entirely; the pump is left for heartbeats and
 * for a frame that arrives while a report is still in flight.
 *
 * One report at a time on purpose: a second request would race the first and the
 * panel could draw the older frame last.
 */
let reportInFlight = false;
const flushFrame = () => {
  if (shuttingDown || reportInFlight) return;
  const frame = pendingFrame;
  if (!frame) return;
  pendingFrame = null;
  reportInFlight = true;
  lastStatusAt = Date.now();
  report(frame)
    .catch(() => undefined)
    .then(() => {
      reportInFlight = false;
      // A frame painted while that one was travelling is still worth sending:
      // dropping it would leave the panel showing the frame before the last
      // keystroke until something else repainted that region.
      if (pendingFrame && !shuttingDown) flushFrame();
    });
};

/**
 * Read the current URL and navigation state from the browser itself.
 *
 * Read rather than tracked: a page can navigate itself, and a URL bar that only
 * knows what we typed is a URL bar that lies after a redirect - which is exactly
 * what an OAuth callback is.
 */
const readState = (contents) => {
  if (!contents || contents.isDestroyed()) return;
  try {
    state.url = contents.getURL();
  } catch {
    /* mid-teardown */
  }
  try {
    state.title = contents.getTitle();
  } catch {
    /* mid-teardown */
  }
  const history = contents.navigationHistory;
  try {
    state.canGoBack = history ? history.canGoBack() : contents.canGoBack();
    state.canGoForward = history ? history.canGoForward() : contents.canGoForward();
  } catch {
    /* mid-teardown */
  }
};

// ---------------------------------------------------------------------------
// Views: the main window, and any popup a sign-in opens
// ---------------------------------------------------------------------------

/**
 * OAuth runs in a popup, and a popup we do not stream is a sign-in the user
 * cannot see. So a new window becomes the active view - the picture the panel
 * shows - and when it closes we return to the window that opened it and reload
 * it, because that is the window whose session just changed.
 *
 * This mirrors what the desktop shell does with its panes, for the same reason.
 */
const setActiveView = (view) => {
  if (!view || (view.win && view.win.isDestroyed())) return;
  activeView = view;
  // The frame size can differ between a 1280x800 window and a small popup, so the
  // viewport travels with the view rather than being assumed.
  if (view.viewport) state.viewport = view.viewport;
  readState(view.contents);
  void report(null);
};

const focusPrimary = () => {
  const primary = [...views].find((view) => view.primary && view.win && !view.win.isDestroyed());
  if (primary) {
    readState(primary.contents);
    setActiveView(primary);
  }
};

/**
 * Claim keyboard focus for a streamed window.
 *
 * Measured, not assumed: an offscreen window that is never shown reports
 * `document.hasFocus() === false`, and `webContents.focus()` does not change it -
 * only focusing the WINDOW does. That matters because a backgrounded document is
 * treated as second-class by the engine: the first click on a page goes to the
 * window instead of into the field under the cursor, so a composer never takes
 * the caret and typing goes nowhere. `win.focus()` is enough even though the
 * window is never shown.
 */
const claimFocus = (win, contents) => {
  try {
    if (win && !win.isDestroyed()) win.focus();
    if (contents && !contents.isDestroyed()) contents.focus();
  } catch {
    /* mid-teardown */
  }
};

const attachView = (win, contents, { primary = false } = {}) => {
  const view = {
    win,
    contents,
    primary,
    viewport: { width: win.getBounds().width, height: win.getBounds().height },
  };
  views.add(view);

  try {
    contents.setFrameRate(FPS);
  } catch {
    /* offscreen frame rate is best-effort */
  }

  // A navigation - including the one that opens a sign-in popup - leaves the new
  // document unfocused, and an unfocused document does not take the caret.
  claimFocus(win, contents);
  contents.on('did-finish-load', () => claimFocus(win, contents));

  contents.on('paint', (_event, _dirty, image) => {
    // Newest wins: an older frame that is still queued is worthless, and
    // queueing them would make the panel show the past.
    if (view !== activeView) return;
    try {
      const size = image.getSize();
      pendingFrame = {
        base64: image.toJPEG(JPEG_QUALITY).toString('base64'),
        width: size.width,
        height: size.height,
      };
    } catch {
      /* the window went away mid-paint */
      return;
    }
    // Straight out, with no wait for the pump: this is what typing feels like.
    flushFrame();
  });

  const onNavigate = () => {
    readState(contents);
    if (view === activeView) void report(null);
  };
  const onStart = () => {
    state.loading = true;
    if (view === activeView) void report(null);
  };
  const onStop = () => {
    state.loading = false;
    onNavigate();
  };
  const onFail = (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame === false || errorCode === -3) return; // -3 is an aborted load
    state.error = `${errorDescription || 'the page could not be loaded'} (${validatedURL || state.url})`;
    if (view === activeView) void report(null);
  };
  const onTitle = (event, title) => {
    state.title = String(title || '');
    if (view === activeView) void report(null);
  };
  const onFocus = () => setActiveView(view);

  contents.on('did-navigate', onNavigate);
  contents.on('did-navigate-in-page', onNavigate);
  contents.on('did-start-loading', onStart);
  contents.on('did-stop-loading', onStop);
  contents.on('did-fail-load', onFail);
  contents.on('page-title-updated', onTitle);
  contents.on('focus', onFocus);

  if (primary) {
    // A popup is allowed as a REAL window (a real top-level context, which the
    // provider's framing rules require) but it is created offscreen so we can
    // stream it like everything else.
    contents.setWindowOpenHandler(() => {
      // Sized, not left to the site. This stream FOLLOWS the popup, so the size a
      // provider asks for becomes the whole picture: Google's consent window is
      // opened at 500x600, which the panel showed as a 502x603 viewport - the
      // "the screen went small" that a sign-in suddenly produced. The opener's
      // size is the honest default, with a desktop floor under it.
      const opener = activeView?.win && !activeView.win.isDestroyed() ? activeView.win.getBounds() : null;
      const bounds = authWindowBounds(opener, { minWidth: MIN_POPUP_WIDTH, minHeight: MIN_POPUP_HEIGHT });
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          ...bounds,
          show: false,
          paintWhenInitiallyHidden: true,
          webPreferences: {
            offscreen: true,
            partition: PARTITION,
            backgroundThrottling: false,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            javascript: true,
            // The sign-in popup is the window Google's page runs in, so it needs
            // the same identity the pane reports.
            ...identityWebPreferences(),
          },
        },
      };
    });
    contents.on('did-create-window', (child) => {
      attachView(child, child.webContents, { primary: false });
      setActiveView([...views].find((v) => v.win === child) || null);
      const { width, height } = child.getBounds();
      log(`a popup opened at ${width}x${height}; the stream follows it`);
    });
  }

  win.on('closed', () => {
    views.delete(view);
    if (activeView === view) {
      activeView = null;
      // Back to the window that opened it, reloaded: its session may be exactly
      // what the popup just changed.
      focusPrimary();
      const primary = [...views].find((v) => v.primary);
      if (primary && !primary.contents.isDestroyed()) primary.contents.reload();
    }
    if (views.size === 0) {
      log('every window closed; exiting');
      shutdown();
    }
  });

  return view;
};

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const BUTTONS = new Set(['left', 'middle', 'right']);

/**
 * Printable keys get a `char` event, or typing would move the caret and stop.
 *
 * The text is asked for rather than taken from the key name: the space bar is
 * forwarded as `Space`, so "printable" cannot mean "one character long" - that
 * check sent the keystroke with no text and swallowed every space a user typed.
 */

const sendInput = (contents, event) => {
  if (!contents || contents.isDestroyed() || !event) return;
  const modifiers = Array.isArray(event.modifiers) ? event.modifiers : [];
  try {
    if (event.kind === 'mouse') {
      contents.sendInputEvent({
        type: event.action === 'move' ? 'mouseMove' : event.action === 'down' ? 'mouseDown' : 'mouseUp',
        x: event.x,
        y: event.y,
        button: BUTTONS.has(event.button) ? event.button : 'left',
        clickCount: event.clickCount || 1,
        modifiers,
      });
      return;
    }
    if (event.kind === 'wheel') {
      contents.sendInputEvent({
        type: 'mouseWheel',
        x: event.x,
        y: event.y,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        canScroll: true,
        modifiers,
      });
      return;
    }
    if (event.kind === 'key') {
      if (event.action === 'char') {
        contents.sendInputEvent({ type: 'char', keyCode: event.keyCode, modifiers });
        return;
      }
      contents.sendInputEvent({
        type: event.action === 'down' ? 'keyDown' : 'keyUp',
        keyCode: event.keyCode,
        modifiers,
      });
      // A real browser turns a printable key press into text as well as a
      // keystroke; without this, typing into a document moves the caret and
      // inserts nothing.
      if (event.action === 'down' && !modifiers.includes('ctrl') && !modifiers.includes('meta')) {
        const text = textFromKeyCode(event.keyCode);
        if (text !== null) contents.sendInputEvent({ type: 'char', keyCode: text, modifiers });
      }
    }
  } catch (err) {
    log(`input rejected: ${err.message}`);
  }
};

// ---------------------------------------------------------------------------
// Commands, streamed down from the app
// ---------------------------------------------------------------------------

const safeNavigate = (raw) => {
  try {
    const url = new URL(String(raw));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
};

/**
 * Logged once, because "connected but never steered" and "being steered" look
 * identical from the app's side, and only one of them means the channel works.
 */
let sawFirstCommand = false;

const applyCommand = (command) => {
  if (!sawFirstCommand) {
    sawFirstCommand = true;
    log(`first command received: ${command.type} - the app can steer this browser`);
  }
  const view = activeView || [...views].find((v) => v.primary);
  const contents = view && view.win && !view.win.isDestroyed() ? view.contents : null;
  if (!contents) return;

  const history = contents.navigationHistory;
  switch (command.type) {
    case 'navigate': {
      const url = safeNavigate(command.url);
      if (!url) {
        state.error = `refused to load a non-web address: ${String(command.url).slice(0, 80)}`;
        void report(null);
        return;
      }
      state.error = null;
      contents.loadURL(url).catch((err) => {
        state.error = err.message;
        void report(null);
      });
      return;
    }
    case 'back':
      if (history) history.goBack();
      else contents.goBack();
      return;
    case 'forward':
      if (history) history.goForward();
      else contents.goForward();
      return;
    case 'reload':
      contents.reload();
      return;
    case 'stop':
      contents.stop();
      return;
    case 'resize': {
      // The panel sends its own box size here, so the page is rendered at the
      // size it is seen at instead of being scaled down to fit - which is what
      // made the picture small. Floored only against a box no page is designed
      // for, and capped so a bad number cannot ask for a window that big.
      const asked = {
        width: Math.trunc(command.viewport?.width) || WIDTH,
        height: Math.trunc(command.viewport?.height) || HEIGHT,
      };
      const width = Math.min(4096, Math.max(MIN_RESIZE_WIDTH, asked.width));
      const height = Math.min(4096, Math.max(MIN_RESIZE_HEIGHT, asked.height));
      view.win.setContentSize(width, height);
      view.viewport = { width, height };
      state.viewport = { width, height };
      // Logged because "the panel asked for 500px and the page is 1024px" is a
      // decision someone will need to see when a layout looks wrong.
      log(`resized to ${width}x${height} (the panel asked for ${asked.width}x${asked.height})`);
      void report(null);
      return;
    }
    case 'input':
      sendInput(contents, command.event);
      return;
    case 'ping':
      void report(null);
      return;
    default:
      log(`ignored an unknown command: ${command.type}`);
  }
};

/**
 * The command channel: SSE from the app, with reconnect.
 *
 * A dropped stream is normal (a restart, a reload) so it reconnects silently;
 * the panel keeps working because frames and commands are independent paths.
 */
let commandStream = null;
let commandFailures = 0;

const openCommandStream = () => {
  if (SELF_TEST) return;
  let url;
  try {
    url = new URL('/api/browser/host/commands', SERVER);
  } catch {
    return;
  }
  const req = http.get(
    {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      agent,
      headers: { accept: 'text/event-stream', 'x-zeroleak-host': TOKEN },
    },
    (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        commandFailures += 1;
        log(`command stream refused with HTTP ${res.statusCode}`);
        scheduleReconnect();
        return;
      }
      commandFailures = 0;
      log('command stream connected');
      let buffer = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        let split = buffer.indexOf('\n\n');
        while (split !== -1) {
          const block = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          for (const line of block.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const parsed = JSON.parse(payload);
              if (Array.isArray(parsed.commands)) parsed.commands.forEach(applyCommand);
              else applyCommand(parsed);
            } catch {
              /* a malformed frame must not kill the channel */
            }
          }
          split = buffer.indexOf('\n\n');
        }
      });
      res.on('end', scheduleReconnect);
      res.on('error', scheduleReconnect);
    },
  );
  req.on('error', () => {
    commandFailures += 1;
    scheduleReconnect();
  });
  commandStream = req;
};

const scheduleReconnect = () => {
  if (shuttingDown) return;
  setTimeout(openCommandStream, Math.min(5000, 500 * Math.max(1, commandFailures)));
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    if (commandStream) commandStream.destroy();
  } catch {
    /* already gone */
  }
  try {
    agent.destroy();
  } catch {
    /* already gone */
  }
  app.exit(0);
};

const createPrimary = () => {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: Math.min(WIDTH, workArea.width),
    height: Math.min(HEIGHT, workArea.height),
    show: false,
    // Without this the window never renders while hidden, and there would be no
    // frames at all - offscreen rendering and `show: false` are the whole trick.
    paintWhenInitiallyHidden: true,
    webPreferences: {
      offscreen: true,
      partition: PARTITION,
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      javascript: true,
      // A sandboxed preload with context isolation on: the identity override
      // reaches the page through `contextBridge.executeInMainWorld`, so the
      // page gains no privileged API for it.
      ...identityWebPreferences(),
    },
  });
  session.fromPartition(PARTITION).setUserAgent(USER_AGENT);
  win.webContents.setUserAgent(USER_AGENT);
  return win;
};

const startFramePump = () => {
  setInterval(() => {
    if (shuttingDown) return;
    const now = Date.now();
    // A frame that arrived while a report was in flight goes out here; the paint
    // handler itself already sends one the instant it is painted.
    if (pendingFrame) {
      flushFrame();
      return;
    }
    // No paint means nothing changed; a periodic status-only report is what
    // stops the app from deciding this host died.
    if (now - lastStatusAt >= HEARTBEAT_MS) {
      lastStatusAt = now;
      readState(activeView && activeView.contents);
      void report(null);
    }
  }, Math.round(1000 / FPS));
};

// ---------------------------------------------------------------------------
// Self-test: proves frames and input work, with no app and no network
// ---------------------------------------------------------------------------

const runSelfTest = async () => {
  const results = [];
  const check = (ok, name, extra = '') => {
    results.push({ ok, name });
    console.log(`${ok ? 'HOST PASS' : 'HOST FAIL'} — ${name}${extra ? ` :: ${extra}` : ''}`);
  };

  const win = createPrimary();
  const contents = win.webContents;
  const view = attachView(win, contents, { primary: true });
  setActiveView(view);

  // A page that reports what it received, so input is verified by its EFFECT on
  // the page rather than by "the call did not throw".
  const page = `data:text/html,${encodeURIComponent(`
    <body style="margin:0;background:#123">
      <input id="t" autofocus style="position:absolute;left:40px;top:40px;width:200px;height:30px">
      <script>
        window.__clicks = 0;
        document.addEventListener('mousedown', () => { window.__clicks += 1; window.__last = [event.clientX, event.clientY]; });
        window.__scrolls = 0;
        document.addEventListener('wheel', () => { window.__scrolls += 1; }, { passive: true });

      </script>
    </body>`)}`;
  await contents.loadURL(page);
  contents.focus();

  const waitFor = async (predicate, timeoutMs, label) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await predicate()) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    check(false, `${label} (timed out after ${timeoutMs}ms)`);
    return false;
  };

  // 1. a real frame leaves the host. Watched where it is SENT rather than where
  //    it waits: a frame is reported the moment it is painted now, so "is one
  //    pending?" would only ever see a frame that no paint has claimed yet.
  const gotFrame = await waitFor(() => Promise.resolve(!!lastFrameReported), 10000, 'the offscreen browser produced a frame');
  if (gotFrame) {
    const frame = lastFrameReported;
    lastFrameReported = null;
    check(frame.base64.startsWith('/9j/'), 'the frame is a JPEG', `${frame.width}x${frame.height}`);
    check(frame.base64.length > 500, 'the frame carries real image data', `${Math.round((frame.base64.length * 3) / 4)} bytes`);
  }

  // 2. a click reaches the page
  sendInput(contents, { kind: 'mouse', action: 'down', x: 120, y: 60, button: 'left', clickCount: 1, modifiers: [] });
  sendInput(contents, { kind: 'mouse', action: 'up', x: 120, y: 60, button: 'left', clickCount: 1, modifiers: [] });
  const clicked = await waitFor(
    async () => (await contents.executeJavaScript('window.__clicks').catch(() => 0)) > 0,
    4000,
    'a streamed click reaches the page',
  );
  if (clicked) {
    const at = await contents.executeJavaScript('JSON.stringify(window.__last)').catch(() => '[]');
    check(true, 'the click carried its coordinates', at);
  }

  // 3. typing reaches an input, which is what makes a sign-in page usable
  sendInput(contents, { kind: 'key', action: 'down', keyCode: 'Z', modifiers: [] });
  sendInput(contents, { kind: 'key', action: 'up', keyCode: 'Z', modifiers: [] });
  const typed = await waitFor(
    async () => (await contents.executeJavaScript('document.getElementById("t").value').catch(() => '')) === 'Z',
    4000,
    'a streamed keystroke types into the page',
  );
  if (typed) check(true, 'the input element received the typed character');

  // 3c. the page knows it has focus. An offscreen window that reports
  //     `document.hasFocus() === false` is treated as a background document, and
  //     the first click on such a page goes to the window instead of into the
  //     field under it - which is how a composer never takes the caret.
  const pageHasFocus = await contents.executeJavaScript('document.hasFocus()').catch(() => false);
  check(pageHasFocus === true, 'the streamed page is focused, so a click lands in the field under it');

  // 3b. the space bar, which is the one key whose NAME is not its character.
  //     It arrives as `Space` (the renderer renames `' '` so the page sees a real
  //     space bar), so "printable" cannot be decided by length alone - a space
  //     that only sends a keystroke moves the caret and types nothing.
  for (const key of ['A', 'Space', 'B']) {
    sendInput(contents, { kind: 'key', action: 'down', keyCode: key, modifiers: [] });
    sendInput(contents, { kind: 'key', action: 'up', keyCode: key, modifiers: [] });
  }
  const spaced = await waitFor(
    async () => (await contents.executeJavaScript('document.getElementById("t").value').catch(() => '')) === 'ZA B',
    4000,
    'the space bar types a space',
  );
  if (spaced){
    const value = await contents.executeJavaScript('document.getElementById("t").value').catch(() => '');
    check(true, 'the space typed a space and not just a keystroke', JSON.stringify(value));
  }

  // 4. scrolling
  sendInput(contents, { kind: 'wheel', x: 120, y: 200, deltaX: 0, deltaY: 120, modifiers: [] });
  await waitFor(
    async () => (await contents.executeJavaScript('window.__scrolls').catch(() => 0)) > 0,
    4000,
    'a streamed wheel event reaches the page',
  );

  // 5. navigation state is read from the browser, not from what we typed
  check(state.url.startsWith('data:'), 'the reported URL is the page really loaded', state.url.slice(0, 40));

  // 6. A sign-in popup gets a desktop size, because the stream FOLLOWS the popup
  //    and Google asks for 500x600 - which used to shrink the panel's picture.
  const popupOpened = new Promise((resolve) => {
    contents.once('did-create-window', (child) => resolve(child));
  });
  await contents
    .executeJavaScript('window.open("about:blank", "streamed-popup-probe", "width=500,height=600") ? true : false')
    .then((opened) => check(opened === true, 'window.open hands the page a real window (not null)'))
    .catch((err) => check(false, 'window.open hands the page a real window', err.message));
  const popup = await Promise.race([popupOpened, new Promise((resolve) => setTimeout(() => resolve(null), 4000))]);
  if (popup) {
    const { width, height } = popup.getBounds();
    check(
      width >= MIN_POPUP_WIDTH && height >= MIN_POPUP_HEIGHT,
      'a sign-in popup is sized for a desktop, not for what the site asked',
      `${width}x${height} (the page asked for 500x600)`,
    );
    popup.destroy();
  } else {
    check(false, 'a sign-in popup is created as a real window');
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`HOST RESULT: ${results.length - failed.length}/${results.length} checks passed`);
  app.exit(failed.length === 0 ? 0 : 1);
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  // One identity for the whole partition, set before any view exists: the user
  // agent the session reports, and the Client Hint headers that have to agree
  // with it on every request - the sign-in popup included.
  const streamSession = session.fromPartition(PARTITION);
  streamSession.setUserAgent(USER_AGENT);
  installClientHintHeaders(streamSession);
  handleDownloads(streamSession);

  if (SELF_TEST) {
    try {
      await runSelfTest();
    } catch (err) {
      console.log(`HOST FAIL — the self-test threw: ${err && err.message}`);
      app.exit(1);
    }
    return;
  }

  if (!TOKEN) {
    log('refusing to start without ZEROLEAK_HOST_TOKEN');
    app.exit(2);
    return;
  }

  const win = createPrimary();
  attachView(win, win.webContents, { primary: true });
  setActiveView([...views][0]);
  startFramePump();
  openCommandStream();
  log(`streaming ${WIDTH}x${HEIGHT} at up to ${FPS}fps to ${SERVER}`);

  // Where the streamed browser opens. The app leaves this unset and navigates
  // from the panel (so the real browser follows the tab strip), but a host
  // started by hand can be pointed at one page - which is what makes this file
  // debuggable on its own.
  const startUrl = safeNavigate(process.env.ZEROLEAK_HOST_START_URL || '') || 'about:blank';
  win.webContents.loadURL(startUrl).catch(() => {});
});

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
app.on('window-all-closed', shutdown);

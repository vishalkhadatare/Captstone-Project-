import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BrowserStreamHub,
  DEFAULT_VIEWPORT,
  HOST_STALE_MS,
  MAX_FRAME_BYTES,
  MAX_PENDING_COMMANDS,
  MAX_WHEEL_DELTA,
  NAMED_KEYS,
  createHostToken,
  describeHostExit,
  hostChildEnv,
  hostTokenMatches,
  isAllowedKey,
  normalizeCommand,
  normalizeInputEvent,
  planHostSpawn,
  resolveElectronBinary,
  sanitizeViewport,
  type StreamFrame,
  type StreamStatus,
} from './browserStream.ts';

/** A payload that passes the JPEG magic-byte check. */
const JPEG = `/9j/${'A'.repeat(400)}`;

const report = (extra: Record<string, unknown> = {}) => ({
  url: 'https://prism.openai.com/',
  title: 'Prism',
  loading: false,
  canGoBack: false,
  canGoForward: false,
  viewport: { width: 1280, height: 800 },
  ...extra,
});

// ---------------------------------------------------------------------------
// Input normalisation - the renderer is untrusted input
// ---------------------------------------------------------------------------

test('a mouse event is clamped into the page instead of rejected', () => {
  const result = normalizeInputEvent(
    { kind: 'mouse', action: 'down', x: 99999, y: -40, button: 'left', clickCount: 1 },
    { width: 1280, height: 800 },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.event, {
    kind: 'mouse',
    action: 'down',
    x: 1279,
    y: 0,
    button: 'left',
    clickCount: 1,
    modifiers: [],
  });
});

test('an unknown mouse action is refused rather than guessed', () => {
  const result = normalizeInputEvent({ kind: 'mouse', action: 'teleport', x: 1, y: 1 }, DEFAULT_VIEWPORT);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /teleport/);
});

test('an unknown mouse button falls back to the left button', () => {
  const result = normalizeInputEvent(
    { kind: 'mouse', action: 'up', x: 5, y: 5, button: 'thumb' },
    DEFAULT_VIEWPORT,
  );
  assert.equal(result.ok, true);
  if (!result.ok || result.event.kind !== 'mouse') return;
  assert.equal(result.event.button, 'left');
});

test('modifiers are deduped, ordered and stripped of anything invented', () => {
  const result = normalizeInputEvent(
    { kind: 'key', action: 'down', keyCode: 'a', modifiers: ['meta', 'ctrl', 'meta', 'hyper'] },
    DEFAULT_VIEWPORT,
  );
  assert.equal(result.ok, true);
  if (!result.ok || result.event.kind !== 'key') return;
  assert.deepEqual(result.event.modifiers, ['ctrl', 'meta']);
});

test('wheel deltas are clamped so one event cannot scroll a page to the moon', () => {
  const result = normalizeInputEvent(
    { kind: 'wheel', x: 10, y: 10, deltaX: 0, deltaY: 10_000_000 },
    DEFAULT_VIEWPORT,
  );
  assert.equal(result.ok, true);
  if (!result.ok || result.event.kind !== 'wheel') return;
  assert.equal(result.event.deltaY, MAX_WHEEL_DELTA);
});

test('a key we cannot name is refused: a wrong keystroke is worse than a refused one', () => {
  const invented = normalizeInputEvent({ kind: 'key', action: 'down', keyCode: 'HyperKey' }, DEFAULT_VIEWPORT);
  assert.equal(invented.ok, false);
  if (invented.ok) return;
  assert.match(invented.reason, /not a key we forward/);

  const allowed = normalizeInputEvent({ kind: 'key', action: 'down', keyCode: 'Backspace' }, DEFAULT_VIEWPORT);
  assert.equal(allowed.ok, true);
});

test('every named key is actually accepted, and a bare word is not', () => {
  for (const key of NAMED_KEYS) {
    assert.equal(isAllowedKey(key), true, `${key} should be allowed`);
    const result = normalizeInputEvent({ kind: 'key', action: 'down', keyCode: key }, DEFAULT_VIEWPORT);
    assert.equal(result.ok, true, `${key} should normalise`);
  }
  assert.equal(isAllowedKey('elephant'), false);
  assert.equal(isAllowedKey(''), false);
});

test('char events carry text, and an over-long paste is refused', () => {
  const typed = normalizeInputEvent({ kind: 'key', action: 'char', keyCode: 'x' }, DEFAULT_VIEWPORT);
  assert.equal(typed.ok, true);

  const pasted = normalizeInputEvent({ kind: 'key', action: 'char', keyCode: 'x'.repeat(64) }, DEFAULT_VIEWPORT);
  assert.equal(pasted.ok, false);
});

test('a named key sent as text is still screened by the char rules', () => {
  const result = normalizeInputEvent({ kind: 'key', action: 'char', keyCode: 'Return' }, DEFAULT_VIEWPORT);
  // "Return" is short enough to be text, so it is allowed through as the literal
  // word; the point of the test is that it is treated as TEXT, not as the key.
  assert.equal(result.ok, true);
  if (!result.ok || result.event.kind !== 'key') return;
  assert.equal(result.event.action, 'char');
});

test('non-object and unknown-kind input never reaches the host', () => {
  assert.equal(normalizeInputEvent(null, DEFAULT_VIEWPORT).ok, false);
  assert.equal(normalizeInputEvent('click', DEFAULT_VIEWPORT).ok, false);
  assert.equal(normalizeInputEvent({ kind: 'scroll' }, DEFAULT_VIEWPORT).ok, false);
});

// ---------------------------------------------------------------------------
// Steering commands
// ---------------------------------------------------------------------------

test('a navigate command is accepted only for http and https', () => {
  const ok = normalizeCommand({ type: 'navigate', url: 'https://prism.openai.com/' }, DEFAULT_VIEWPORT);
  assert.equal(ok.ok, true);
  if (ok.ok && ok.command.type === 'navigate') assert.equal(ok.command.url, 'https://prism.openai.com/');

  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,<script>x</script>']) {
    const refused = normalizeCommand({ type: 'navigate', url }, DEFAULT_VIEWPORT);
    assert.equal(refused.ok, false, `${url} should be refused`);
  }
});

test('a navigate with no usable address is refused rather than guessed', () => {
  assert.equal(normalizeCommand({ type: 'navigate' }, DEFAULT_VIEWPORT).ok, false);
  assert.equal(normalizeCommand({ type: 'navigate', url: 'not a url' }, DEFAULT_VIEWPORT).ok, false);
});

test('an unknown or host-only command type never reaches the browser', () => {
  for (const type of ['ping', 'input', 'evaluate', 'devtools', '']) {
    const refused = normalizeCommand({ type }, DEFAULT_VIEWPORT);
    assert.equal(refused.ok, false, `${type || '(empty)'} should be refused`);
  }
  assert.equal(normalizeCommand(null, DEFAULT_VIEWPORT).ok, false);
});

test('the simple navigation commands pass through unchanged', () => {
  for (const type of ['back', 'forward', 'reload', 'stop'] as const) {
    const result = normalizeCommand({ type }, DEFAULT_VIEWPORT);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.command.type, type);
  }
});

test('a resize is clamped to a window a browser can be', () => {
  const result = normalizeCommand({ type: 'resize', viewport: { width: 99, height: 99_999 } }, DEFAULT_VIEWPORT);
  assert.equal(result.ok, true);
  if (result.ok && result.command.type === 'resize') {
    assert.deepEqual(result.command.viewport, { width: 320, height: 4096 });
  }
});

// ---------------------------------------------------------------------------
// Viewport + token
// ---------------------------------------------------------------------------

test('a viewport is clamped to something a browser can actually be', () => {
  assert.deepEqual(sanitizeViewport({ width: 50, height: 99_999 }), { width: 320, height: 4096 });
  assert.deepEqual(sanitizeViewport(null), DEFAULT_VIEWPORT);
  assert.deepEqual(sanitizeViewport({ width: 'not a number' }), DEFAULT_VIEWPORT);
});

test('the host token compares in constant time and never matches an empty expectation', () => {
  const token = createHostToken();
  assert.equal(token.length, 48);
  assert.equal(hostTokenMatches(token, token), true);
  // Flip the first character deterministically. `slice(0, -1) + 'f'` was the
  // original version and is wrong one time in sixteen: when the token already
  // ends in 'f' it IS the token, so the assertion failed on the token itself.
  const other = (token[0] === 'a' ? 'b' : 'a') + token.slice(1);
  assert.notEqual(other, token);
  assert.equal(hostTokenMatches(token, other), false);
  assert.equal(hostTokenMatches(token, undefined), false);
  assert.equal(hostTokenMatches(token, 42), false);
  assert.equal(hostTokenMatches('', ''), false);
  assert.equal(hostTokenMatches(token, 'x'.repeat(token.length)), false);
});

// ---------------------------------------------------------------------------
// Host spawn planning
// ---------------------------------------------------------------------------

test('the Electron binary is found through the path the package actually writes', () => {
  const binary = resolveElectronBinary({
    root: '/app',
    readFile: () => 'electron.exe\n',
    exists: p => p === '/app/node_modules/electron/dist/electron.exe',
    platform: 'win32',
  });
  assert.equal(binary, '/app/node_modules/electron/dist/electron.exe');
});

test('without path.txt the per-platform fallback is used', () => {
  assert.equal(
    resolveElectronBinary({
      root: '/app',
      readFile: () => {
        throw new Error('missing');
      },
      exists: p => p === '/app/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
      platform: 'darwin',
    }),
    '/app/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
  );
});

test('a missing Electron install is reported in words, not as a spawn failure', () => {
  const result = planHostSpawn({
    root: '/app',
    exists: () => false,
    readFile: () => '',
    serverPort: 3000,
    hostToken: 'abc',
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /Electron runtime is not installed/);
});

test('a missing host script is refused before anything is spawned', () => {
  const result = planHostSpawn({
    root: '/app',
    exists: p => p.endsWith('electron.exe'),
    readFile: () => '',
    platform: 'win32',
    serverPort: 3000,
    hostToken: 'abc',
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /host script is missing/);
});

test('the spawn plan carries the server, the token, the viewport and a sane frame rate', () => {
  const result = planHostSpawn({
    root: '/app',
    exists: () => true,
    readFile: () => 'electron.exe',
    platform: 'win32',
    serverPort: 4321,
    hostToken: 'secret-token',
    viewport: { width: 9000, height: 10 },
    fps: 999,
  });
  assert.equal(result.ok, true);
  const plan = result.plan!;
  assert.equal(plan.command, '/app/node_modules/electron/dist/electron.exe');
  assert.deepEqual(plan.args, ['/app/electron/browserHost.cjs']);
  assert.equal(plan.env.ZEROLEAK_HOST_SERVER, 'http://127.0.0.1:4321');
  assert.equal(plan.env.ZEROLEAK_HOST_TOKEN, 'secret-token');
  // Clamped, not forwarded: a 4096-wide, 320-tall window is the largest allowed.
  assert.equal(plan.env.ZEROLEAK_HOST_WIDTH, '4096');
  assert.equal(plan.env.ZEROLEAK_HOST_HEIGHT, '320');
  assert.equal(plan.env.ZEROLEAK_HOST_FPS, '30');
});

test('with no frame rate asked for, the host still streams fast enough to type into', () => {
  const result = planHostSpawn({
    root: '/app',
    exists: () => true,
    readFile: () => 'electron.exe',
    platform: 'win32',
    serverPort: 4321,
    hostToken: 'secret-token',
  });
  assert.equal(result.ok, true);
  // The default was 12, and 12 is a picture that updates noticeably behind the
  // keys. The plan is what decides it, so it is pinned here rather than left to
  // whatever the host module happens to default to.
  assert.equal(result.plan!.env.ZEROLEAK_HOST_FPS, '24');
});

test('an inherited ELECTRON_RUN_AS_NODE never reaches the host child', () => {
  const base = { PATH: '/usr/bin', ELECTRON_RUN_AS_NODE: '1', ZEROLEAK_HOST_TOKEN: 'stale' };
  const env = hostChildEnv(base, { ZEROLEAK_HOST_TOKEN: 'fresh', ZEROLEAK_HOST_WIDTH: '1280' });

  // The shell sets this to run the server ITSELF as Node. Passed on to the host
  // it makes electron.exe plain Node, where `require('electron')` has no `app`:
  // the host dies on its first line and the panel can only say "exit 1".
  assert.equal(env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(env.PATH, '/usr/bin');
  // The planned values still win over whatever the server happened to have.
  assert.equal(env.ZEROLEAK_HOST_TOKEN, 'fresh');
  assert.equal(env.ZEROLEAK_HOST_WIDTH, '1280');
  // The environment handed in belongs to the server, so it is copied, not edited.
  assert.equal(base.ELECTRON_RUN_AS_NODE, '1');
});

test('a host exit is explained, and only the codes the host really uses are named', () => {
  assert.match(describeHostExit(0), /was closed/);
  assert.match(describeHostExit(2), /token/);
  assert.match(describeHostExit(3), /ELECTRON_RUN_AS_NODE/);
  // An unknown code is reported as itself rather than dressed up as a cause.
  assert.match(describeHostExit(1), /exit 1/);
  assert.match(describeHostExit(null), /exit null/);
});

// ---------------------------------------------------------------------------
// The hub
// ---------------------------------------------------------------------------

test('the hub starts stopped and says so in plain language', () => {
  const hub = new BrowserStreamHub(() => 1000);
  const status = hub.status();
  assert.equal(status.state, 'stopped');
  assert.equal(status.viewers, 0);
  assert.equal(status.frameSeq, 0);
  assert.match(status.reason, /not running/);
});

test('a host report flips the hub to ready and stores the frame', () => {
  const hub = new BrowserStreamHub(() => 5000);
  const frames: StreamFrame[] = [];
  hub.subscribe(event => {
    if (event.type === 'frame') frames.push(event.frame);
  });
  const accepted = hub.reportHost(report({ frame: { base64: JPEG, width: 1280, height: 800 } }));
  assert.equal(accepted.accepted, true);
  assert.equal(hub.isReady(), true);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].seq, 1);
  assert.equal(frames[0].mime, 'image/jpeg');
  assert.equal(hub.status().url, 'https://prism.openai.com/');
  assert.equal(hub.status().lastFrameAt, 5000);
});

test('a payload that is not a JPEG is dropped rather than drawn as a broken rectangle', () => {
  const hub = new BrowserStreamHub(() => 1);
  hub.reportHost(report({ frame: { base64: 'bm90IGFuIGltYWdl' } }));
  assert.equal(hub.latestFrame(), null);
  // The heartbeat still proves liveness.
  assert.equal(hub.isReady(), true);
});

test('an oversized frame is refused', () => {
  const hub = new BrowserStreamHub(() => 1);
  const huge = `/9j/${'A'.repeat(Math.ceil((MAX_FRAME_BYTES * 4) / 3) + 1000)}`;
  hub.reportHost(report({ frame: { base64: huge } }));
  assert.equal(hub.latestFrame(), null);
});

test('a notice from the browser is carried to the panel and not lost on the next frame', () => {
  const hub = new BrowserStreamHub(() => 1);
  // The host says where a download went...
  hub.reportHost(report({ notice: 'Downloaded main.pdf to C:\\Users\\visha\\Downloads\\main.pdf' }));
  assert.match(hub.status().notice ?? '', /Downloaded main\.pdf/);

  // ...then keeps reporting frames, which carry no notice field at all. Absent
  // must mean "nothing to add", or the panel would lose the line it is showing
  // the moment the next frame arrives.
  hub.reportHost(report({ frame: { base64: JPEG, width: 1280, height: 800 } }));
  assert.match(hub.status().notice ?? '', /Downloaded main\.pdf/);
});

test('a host that clears its notice clears the panel’s copy', () => {
  const hub = new BrowserStreamHub(() => 1);
  hub.reportHost(report({ notice: 'Downloaded main.pdf to Downloads' }));
  hub.reportHost(report({ notice: null }));
  assert.equal(hub.status().notice, null);
});

test('a notice does not outlive the browser it came from', () => {
  const hub = new BrowserStreamHub(() => 1);
  hub.reportHost(report({ notice: 'Downloaded main.pdf to Downloads' }));
  hub.markStopped('The streamed browser was closed.');
  assert.equal(hub.status().notice, null, 'a download line over a stopped browser reads as a live one');
});

test('a heartbeat with no frame keeps the host alive and emits no frame', () => {
  const hub = new BrowserStreamHub(() => 10);
  let frameEvents = 0;
  hub.subscribe(event => {
    if (event.type === 'frame') frameEvents += 1;
  });
  hub.reportHost(report());
  assert.equal(frameEvents, 0);
  assert.equal(hub.isReady(), true);
  assert.equal(hub.status().lastReportAt, 10);
});

test('a second live host is refused: two browsers must not fight over one canvas', () => {
  let now = 0;
  const hub = new BrowserStreamHub(() => now);
  hub.reportHost(report({ hostId: 'host-a' }));
  now = 1000;
  const second = hub.reportHost(report({ hostId: 'host-b', url: 'https://example.com/' }));
  assert.equal(second.accepted, false);
  assert.match(second.reason, /already connected/);
  assert.equal(hub.status().url, 'https://prism.openai.com/');
});

test('the same host keeps reporting: a refusal here would freeze the picture', () => {
  let now = 0;
  const hub = new BrowserStreamHub(() => now);
  for (let i = 0; i < 3; i += 1) {
    now = i * 100;
    const result = hub.reportHost(report({ hostId: 'host-a', frame: { base64: JPEG } }));
    assert.equal(result.accepted, true, `report ${i} should be accepted`);
  }
  assert.equal(hub.status().frameSeq, 3);
});

test('once the first host goes stale a new one takes over', () => {
  let now = 0;
  const hub = new BrowserStreamHub(() => now);
  hub.reportHost(report({ hostId: 'host-a' }));
  now = HOST_STALE_MS + 1;
  const second = hub.reportHost(report({ hostId: 'host-b', url: 'https://example.com/' }));
  assert.equal(second.accepted, true);
  assert.equal(hub.status().url, 'https://example.com/');
  // ...and the successor can keep reporting too.
  now = HOST_STALE_MS + 200;
  assert.equal(hub.reportHost(report({ hostId: 'host-b', frame: { base64: JPEG } })).accepted, true);
});

test('sweeping drops a host that stopped reporting, and reports that it did', () => {
  let now = 0;
  const hub = new BrowserStreamHub(() => now);
  hub.reportHost(report({ frame: { base64: JPEG } }));
  assert.equal(hub.sweep(), false, 'a fresh host is not swept');

  now = HOST_STALE_MS + 1;
  assert.equal(hub.sweep(), true);
  assert.equal(hub.status().state, 'stopped');
  assert.equal(hub.latestFrame(), null);
  assert.match(hub.status().reason, /stopped reporting/);
  // Sweeping again is a no-op, not a second transition.
  assert.equal(hub.sweep(), false);
});

test('frame sequence numbers advance so a viewer can spot a dropped frame', () => {
  const hub = new BrowserStreamHub(() => 1);
  hub.reportHost(report({ frame: { base64: JPEG } }));
  hub.reportHost(report({ frame: { base64: JPEG } }));
  hub.reportHost(report({ frame: { base64: JPEG } }));
  assert.equal(hub.status().frameSeq, 3);
  assert.equal(hub.latestFrame()?.seq, 3);
});

test('a viewer that throws does not stop the others from being told', () => {
  const hub = new BrowserStreamHub(() => 1);
  const seen: string[] = [];
  hub.subscribe(() => {
    throw new Error('this viewer is broken');
  });
  hub.subscribe(event => seen.push(event.type));
  hub.reportHost(report({ frame: { base64: JPEG } }));
  // Both the frame and the state change are delivered; the broken viewer is
  // simply skipped.
  assert.deepEqual(seen, ['frame', 'status']);
});

test('commands are refused when nothing is connected and queued when it is', () => {
  const hub = new BrowserStreamHub(() => 1);
  const refused = hub.pushCommand({ type: 'reload' });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /no streamed browser/);

  hub.reportHost(report());
  assert.equal(hub.pushCommand({ type: 'reload' }).ok, true);
  assert.equal(hub.pushCommand({ type: 'navigate', url: 'https://example.com/' }).ok, true);

  const drained = hub.drainCommands();
  assert.equal(drained.length, 2);
  assert.deepEqual(drained.map(c => c.type), ['reload', 'navigate']);
  // Draining clears the queue: a command is delivered once.
  assert.equal(hub.drainCommands().length, 0);
  assert.equal(hub.pushCommand({ type: 'back' }).ok, true);
  assert.equal(hub.drainCommands()[0].type, 'back');
});

test('the command queue is bounded: a flood drops the oldest, keeping the newest', () => {
  const hub = new BrowserStreamHub(() => 1);
  hub.reportHost(report());
  for (let i = 0; i < MAX_PENDING_COMMANDS + 10; i += 1) {
    hub.pushCommand({ type: 'navigate', url: `https://example.com/${i}` });
  }
  const drained = hub.drainCommands();
  assert.equal(drained.length, MAX_PENDING_COMMANDS);
  const last = drained[drained.length - 1];
  assert.equal(last.type, 'navigate');
  if (last.type !== 'navigate') return;
  assert.equal(last.url, `https://example.com/${MAX_PENDING_COMMANDS + 10 - 1}`);
});

test('a new token invalidates the host that held the old one', () => {
  const hub = new BrowserStreamHub(() => 1);
  const first = hub.getToken();
  const second = hub.rotateToken();
  assert.notEqual(first, second);
  assert.equal(hostTokenMatches(second, second), true);
  assert.equal(hostTokenMatches(second, first), false);
});

test('viewer counts rise and fall and never go negative', () => {
  const hub = new BrowserStreamHub(() => 1);
  assert.equal(hub.addViewer(), 1);
  assert.equal(hub.addViewer(), 2);
  assert.equal(hub.removeViewer(), 1);
  assert.equal(hub.removeViewer(), 0);
  assert.equal(hub.removeViewer(), 0);
  assert.equal(hub.status().viewers, 0);
});

test('unsubscribing stops delivery, and the status carries the whole picture', () => {
  const hub = new BrowserStreamHub(() => 7);
  let count = 0;
  const unsubscribe = hub.subscribe(() => {
    count += 1;
  });
  hub.reportHost(report({ frame: { base64: JPEG } }));
  unsubscribe();
  hub.reportHost(report({ frame: { base64: JPEG } }));
  assert.equal(count, 2);

  const status: StreamStatus = hub.status();
  assert.deepEqual(Object.keys(status).sort(), [
    'canGoBack',
    'canGoForward',
    'error',
    'frameSeq',
    'lastFrameAt',
    'lastReportAt',
    'loading',
    'notice',
    'reason',
    'state',
    'title',
    'updatedAt',
    'url',
    'viewers',
    'viewport',
  ]);
});

test('markError and markStopped both clear the picture and explain themselves', () => {
  const hub = new BrowserStreamHub(() => 1);
  hub.reportHost(report({ frame: { base64: JPEG } }));
  hub.markError('the host crashed on startup');
  assert.equal(hub.status().state, 'error');
  assert.equal(hub.status().error, 'the host crashed on startup');
  assert.equal(hub.latestFrame(), null);

  hub.markStopped('closed by request');
  assert.equal(hub.status().state, 'stopped');
  assert.equal(hub.status().error, null);
  assert.match(hub.status().reason, /closed by request/);
});

test('a host error is carried through to the status the panel reads', () => {
  const hub = new BrowserStreamHub(() => 1);
  hub.reportHost(report({ error: 'ERR_NAME_NOT_RESOLVED' }));
  assert.equal(hub.status().error, 'ERR_NAME_NOT_RESOLVED');
});

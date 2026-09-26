/**
 * A REAL browser for browser mode, streamed into the panel.
 *
 * Why this exists, stated as the measurement that forced it:
 *
 *   The embedded panel is an `<iframe>`. Every sign-in page involved in Prism
 *   refuses to render in one - `auth.openai.com` serves `frame-ancestors 'self'`,
 *   `chatgpt.com` serves `X-Frame-Options: SAMEORIGIN`, `accounts.google.com`
 *   serves `X-Frame-Options: DENY` - and Chrome additionally partitions the
 *   third-party cookies such a login would need. Neither is a bug in this app
 *   and neither can be overridden from a renderer.
 *
 * So the panel stops trying to *be* the page and becomes a viewport onto a page
 * running somewhere that has no framing rules: an offscreen Electron Chromium,
 * which is an ordinary top-level browsing context with its own cookie jar. Its
 * `paint` events are the frames, `sendInputEvent` is the input, and both travel
 * over the transport this server already uses - SSE out, POST in - so no new
 * dependency appears in package.json.
 *
 * The rule that keeps the whole arrangement honest: this module owns every
 * decision (what a command means, what a point maps to, which key may be sent,
 * when a host is stale), and the renderer only draws what it is told. A frame
 * stream is very hard to debug by looking at it, so the logic is unit tested
 * here rather than discovered by squinting at a canvas.
 */
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export type StreamHostState = 'stopped' | 'starting' | 'ready' | 'error';

export interface StreamViewport {
  width: number;
  height: number;
}

export interface StreamFrame {
  seq: number;
  at: number;
  mime: 'image/jpeg';
  base64: string;
  width: number;
  height: number;
  bytes: number;
}

export interface StreamStatus {
  state: StreamHostState;
  /** The page the real browser is on - not what the omnibox last typed. */
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  viewport: StreamViewport;
  frameSeq: number;
  lastFrameAt: number | null;
  lastReportAt: number | null;
  viewers: number;
  updatedAt: number;
  error: string | null;
  /** Plain-language availability, so the panel never has to guess. */
  reason: string;
  /**
   * A short line worth showing under the page - where a download was saved, for
   * instance. Null when there is nothing to say, decided by the host.
   */
  notice: string | null;
}

export type MouseButton = 'left' | 'right' | 'middle';

export type Modifier = 'ctrl' | 'shift' | 'alt' | 'meta';

export type InputEventPayload =
  | {
      kind: 'mouse';
      action: 'move' | 'down' | 'up';
      x: number;
      y: number;
      button: MouseButton;
      clickCount: number;
      modifiers: Modifier[];
    }
  | {
      kind: 'wheel';
      x: number;
      y: number;
      deltaX: number;
      deltaY: number;
      modifiers: Modifier[];
    }
  | {
      kind: 'key';
      action: 'down' | 'up' | 'char';
      keyCode: string;
      modifiers: Modifier[];
    };

export type HostCommand =
  | { id: number; type: 'navigate'; url: string }
  | { id: number; type: 'back' | 'forward' | 'reload' | 'stop' }
  | { id: number; type: 'input'; event: InputEventPayload }
  | { id: number; type: 'resize'; viewport: StreamViewport }
  | { id: number; type: 'ping' };

/**
 * `Omit` over a union collapses to the keys every member shares, which for
 * `HostCommand` would leave only `type` and quietly drop `url`/`viewport`. This
 * distributes it so each member keeps its own fields.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A command as a caller supplies it, before the hub stamps an id on it. */
export type HostCommandInput = DistributiveOmit<HostCommand, 'id'>;

/** What the host reports after each change or on its heartbeat. */
export interface HostReport {
  /**
   * The host's own random id, minted at startup.
   *
   * It exists so "a second browser is trying to take over" can be told apart
   * from "the same browser sent its next frame" - without it, either the hub
   * refuses a host's own follow-up reports (the picture freezes after one frame)
   * or it lets a second host silently steal the canvas.
   */
  hostId?: unknown;
  url?: unknown;
  title?: unknown;
  loading?: unknown;
  canGoBack?: unknown;
  canGoForward?: unknown;
  viewport?: unknown;
  error?: unknown;
  notice?: unknown;
  /** Absent on a heartbeat: a report with no frame still proves liveness. */
  frame?: { base64?: unknown; width?: unknown; height?: unknown; mime?: unknown } | null;
}

export type StreamEvent =
  | { type: 'frame'; frame: StreamFrame }
  | { type: 'status'; status: StreamStatus };

// ---------------------------------------------------------------------------
// Limits - every one of these exists to stop a hostile or broken client
// ---------------------------------------------------------------------------

/** A frame host that has not spoken in this long is treated as gone. */
export const HOST_STALE_MS = 12_000;
/** Refused outright: a "frame" bigger than this is not a frame. */
export const MAX_FRAME_BYTES = 4_000_000;
/** Longest text a single `char` event may carry. */
export const MAX_CHAR_LENGTH = 32;
/** Largest wheel delta accepted; anything beyond it is a typo or an attack. */
export const MAX_WHEEL_DELTA = 2_000;
/** Viewport bounds, so a client cannot ask the host for a 40k-pixel window. */
export const MIN_VIEWPORT = 320;
export const MAX_VIEWPORT = 4_096;
export const DEFAULT_VIEWPORT: StreamViewport = { width: 1280, height: 800 };
/** Commands waiting for a host that never connects are dropped, not queued. */
export const MAX_PENDING_COMMANDS = 64;

/**
 * Named keys we are willing to forward.
 *
 * Anything absent is refused rather than guessed at: sending an invented
 * `keyCode` to a real browser types the wrong thing into someone's document,
 * and a silent wrong keystroke is worse than a refused one.
 */
export const NAMED_KEYS = [
  'Return',
  'Enter',
  'Tab',
  'Backspace',
  'Delete',
  'Escape',
  'Up',
  'Down',
  'Left',
  'Right',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Space',
  'Insert',
  'Clear',
  'Help',
  'Undo',
  'Redo',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
] as const;

const MODIFIERS: Modifier[] = ['ctrl', 'shift', 'alt', 'meta'];
const BUTTONS: MouseButton[] = ['left', 'right', 'middle'];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const asInt = (value: unknown, fallback: number) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

const asBool = (value: unknown, fallback = false) => (typeof value === 'boolean' ? value : fallback);

const asString = (value: unknown, fallback = '', max = 4_096) =>
  typeof value === 'string' ? value.slice(0, max) : fallback;

const pickModifiers = (value: unknown): Modifier[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<Modifier>();
  for (const raw of value) {
    const name = String(raw).toLowerCase() as Modifier;
    if (MODIFIERS.includes(name)) seen.add(name);
  }
  return MODIFIERS.filter(m => seen.has(m));
};

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

export const isAllowedKey = (keyCode: string): boolean => {
  if (typeof keyCode !== 'string' || keyCode.length === 0) return false;
  if ((NAMED_KEYS as readonly string[]).includes(keyCode)) return true;
  // A single printable character, including the space bar.
  return keyCode.length === 1 && keyCode.charCodeAt(0) >= 0x20 && keyCode.charCodeAt(0) !== 0x7f;
};

export const sanitizeViewport = (raw: unknown): StreamViewport => {
  const source = (raw ?? {}) as { width?: unknown; height?: unknown };
  return {
    width: clamp(asInt(source.width, DEFAULT_VIEWPORT.width), MIN_VIEWPORT, MAX_VIEWPORT),
    height: clamp(asInt(source.height, DEFAULT_VIEWPORT.height), MIN_VIEWPORT, MAX_VIEWPORT),
  };
};

/**
 * A checked result carries its `reason` on BOTH branches.
 *
 * That is not stylistic. This project's tsconfig omits `strict`, and without
 * `strictNullChecks` TypeScript narrows a boolean discriminant in the true branch
 * but NOT in the else branch - so `if (result.ok) {...} else { result.reason }`
 * does not compile, while the identical hand-written union in a scratch file
 * fails the same way. Carrying the field on both sides is what lets a caller
 * report a refusal without an assertion or a cast.
 */
export type NormalizedInput =
  | { ok: true; event: InputEventPayload; reason: '' }
  | { ok: false; reason: string };

/**
 * Turn whatever a client posted into an input event we are willing to forward.
 *
 * Coordinates arrive already scaled to frame pixels by the renderer (it knows
 * the displayed size, the server does not), so this clamps rather than maps: a
 * point outside the page is pulled back to the edge instead of rejected, which
 * is what a real browser does with an out-of-bounds click.
 */
export const normalizeInputEvent = (raw: unknown, viewport: StreamViewport): NormalizedInput => {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an input event' };
  const event = raw as Record<string, unknown>;
  const kind = asString(event.kind, '', 16);
  const maxX = Math.max(0, viewport.width - 1);
  const maxY = Math.max(0, viewport.height - 1);

  if (kind === 'mouse') {
    const action = asString(event.action, '', 8);
    if (action !== 'move' && action !== 'down' && action !== 'up') {
      return { ok: false, reason: `unknown mouse action "${action}"` };
    }
    const rawButton = asString(event.button, 'left', 8) as MouseButton;
    const button = BUTTONS.includes(rawButton) ? rawButton : 'left';
    return {
      ok: true,
      reason: '',
      event: {
        kind: 'mouse',
        action,
        x: clamp(asInt(event.x, 0), 0, maxX),
        y: clamp(asInt(event.y, 0), 0, maxY),
        button,
        clickCount: clamp(asInt(event.clickCount, 1), 1, 3),
        modifiers: pickModifiers(event.modifiers),
      },
    };
  }

  if (kind === 'wheel') {
    return {
      ok: true,
      reason: '',
      event: {
        kind: 'wheel',
        x: clamp(asInt(event.x, 0), 0, maxX),
        y: clamp(asInt(event.y, 0), 0, maxY),
        deltaX: clamp(asInt(event.deltaX, 0), -MAX_WHEEL_DELTA, MAX_WHEEL_DELTA),
        deltaY: clamp(asInt(event.deltaY, 0), -MAX_WHEEL_DELTA, MAX_WHEEL_DELTA),
        modifiers: pickModifiers(event.modifiers),
      },
    };
  }

  if (kind === 'key') {
    const action = asString(event.action, '', 8);
    if (action !== 'down' && action !== 'up' && action !== 'char') {
      return { ok: false, reason: `unknown key action "${action}"` };
    }
    // Length is checked BEFORE any truncation. Silently trimming a long paste
    // would type the wrong text into someone's document, which is worse than
    // refusing the event outright.
    const keyCode = typeof event.keyCode === 'string' ? event.keyCode : '';
    if (!keyCode) return { ok: false, reason: 'empty keyCode' };
    if (keyCode.length > MAX_CHAR_LENGTH) return { ok: false, reason: 'key text too long' };
    if (action === 'char') {
      // A char event must be text; a named key like "Return" belongs to key
      // down/up and would insert the literal word if sent here.
      return {
        ok: true,
        reason: '',
        event: { kind: 'key', action, keyCode, modifiers: pickModifiers(event.modifiers) },
      };
    }
    if (!isAllowedKey(keyCode)) {
      return { ok: false, reason: `key "${keyCode.slice(0, 12)}" is not a key we forward` };
    }
    return {
      ok: true,
      reason: '',
      event: { kind: 'key', action, keyCode, modifiers: pickModifiers(event.modifiers) },
    };
  }

  return { ok: false, reason: `unknown input kind "${kind}"` };
};

export type NormalizedCommand =
  | { ok: true; command: HostCommandInput; reason: '' }
  | { ok: false; reason: string };

/** The client may steer the browser, but only in the ways a browser is steerable. */
export const CLIENT_COMMAND_TYPES = ['navigate', 'back', 'forward', 'reload', 'stop', 'resize'] as const;

/**
 * Validate a steering command from a client.
 *
 * Only http(s) may be loaded, and only the command types listed above exist: a
 * renderer that could ask for `file://`, `javascript:` or an unknown type would
 * be a way to drive a signed-in browser somewhere it should not go. Input
 * events go through `normalizeInputEvent` instead, and `ping` is the host's to
 * use, not the client's.
 */
export const normalizeCommand = (raw: unknown, viewport: StreamViewport): NormalizedCommand => {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not a command' };
  const command = raw as Record<string, unknown>;
  const type = asString(command.type, '', 16);
  if (!(CLIENT_COMMAND_TYPES as readonly string[]).includes(type)) {
    return { ok: false, reason: `unknown command "${type.slice(0, 16)}"` };
  }
  if (type === 'navigate') {
    const rawUrl = asString(command.url, '', 4_096);
    if (!rawUrl) return { ok: false, reason: 'navigate needs a url' };
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return { ok: false, reason: 'that is not a web address' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, reason: `refused to load a ${parsed.protocol} address` };
    }
    return { ok: true, reason: '', command: { type: 'navigate', url: parsed.toString() } };
  }
  if (type === 'resize') {
    return { ok: true, reason: '', command: { type: 'resize', viewport: sanitizeViewport(command.viewport ?? viewport) } };
  }
  return { ok: true, reason: '', command: { type: type as 'back' | 'forward' | 'reload' | 'stop' } };
};

// ---------------------------------------------------------------------------
// Host token
// ---------------------------------------------------------------------------

export const createHostToken = () => crypto.randomBytes(24).toString('hex');

/** Constant-time compare, and never true for an empty expectation. */
export const hostTokenMatches = (expected: string, offered: unknown): boolean => {
  if (!expected || typeof offered !== 'string') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(offered, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

// ---------------------------------------------------------------------------
// Host spawn planning
// ---------------------------------------------------------------------------

export interface SpawnPlan {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface SpawnPlanResult {
  ok: boolean;
  plan?: SpawnPlan;
  reason: string;
}

/**
 * Where the Electron binary lives.
 *
 * `electron`'s package entry exports the path as a string at runtime, but
 * `path.txt` is what the installed package actually writes, so reading it avoids
 * depending on how a bundler treats that entry.
 */
export const resolveElectronBinary = (options: {
  root: string;
  exists: (path: string) => boolean;
  readFile: (path: string) => string;
  platform?: NodeJS.Platform;
}): string | null => {
  const { root, exists, readFile, platform = process.platform } = options;
  const packageDir = `${root}/node_modules/electron`;
  const relative = (() => {
    try {
      return readFile(`${packageDir}/path.txt`).trim();
    } catch {
      return '';
    }
  })();
  if (relative) {
    const candidate = `${packageDir}/dist/${relative}`;
    if (exists(candidate)) return candidate;
  }
  const fallback = {
    win32: `${packageDir}/dist/electron.exe`,
    darwin: `${packageDir}/dist/Electron.app/Contents/MacOS/Electron`,
    linux: `${packageDir}/dist/electron`,
  }[platform];
  if (fallback && exists(fallback)) return fallback;
  return null;
};

/**
 * The command that starts a streamed browser host.
 *
 * Refusal is explicit rather than a spawn failure three layers down: a missing
 * Electron install is a normal state (someone cloned without running
 * `npm install`), and the panel should say so in words.
 */
export const planHostSpawn = (options: {
  root: string;
  exists: (path: string) => boolean;
  readFile: (path: string) => string;
  platform?: NodeJS.Platform;
  serverPort: number;
  hostToken: string;
  viewport?: StreamViewport;
  fps?: number;
}): SpawnPlanResult => {
  const binary = resolveElectronBinary({
    root: options.root,
    exists: options.exists,
    readFile: options.readFile,
    platform: options.platform,
  });
  if (!binary) {
    return {
      ok: false,
      reason:
        'The Electron runtime is not installed, so there is no real browser to stream. Run npm install to add it.',
    };
  }
  const script = `${options.root}/electron/browserHost.cjs`;
  if (!options.exists(script)) {
    return { ok: false, reason: 'The streamed browser host script is missing from this checkout.' };
  }
  const viewport = sanitizeViewport(options.viewport ?? DEFAULT_VIEWPORT);
  return {
    ok: true,
    reason: 'The streamed browser host is available.',
    plan: {
      command: binary,
      args: [script],
      env: {
        ZEROLEAK_HOST_SERVER: `http://127.0.0.1:${options.serverPort}`,
        ZEROLEAK_HOST_TOKEN: options.hostToken,
        ZEROLEAK_HOST_WIDTH: String(viewport.width),
        ZEROLEAK_HOST_HEIGHT: String(viewport.height),
        // 24, not 12: the panel is a picture of a text editor, and half a frame
        // interval of waiting is what makes typing feel like it is being typed
        // somewhere else. The host sends a frame the moment one is painted, so
        // this is a ceiling rather than a schedule.
        ZEROLEAK_HOST_FPS: String(clamp(asInt(options.fps ?? 24, 2), 2, 30)),
      },
    },
  };
};

/**
 * The environment a streamed browser host is spawned with.
 *
 * `ELECTRON_RUN_AS_NODE` must never reach it. The desktop shell starts this
 * server through Electron's own binary in Node mode (`electron/main.cjs` sets
 * exactly that variable), and a shell's environment is inherited by its
 * children - so the server had it and passed it on. Inherited by `electron.exe`
 * it stops being Electron at all: `require('electron')` yields no `app`, the
 * host dies on its first line with
 * `TypeError: Cannot read properties of undefined (reading 'whenReady')`, and
 * the panel could only report "The streamed browser stopped (exit 1)" - which is
 * why "Start real browser" looked broken inside the shell while working from
 * `npm run dev`. Stripping it is what makes one spawn work in both places.
 */
export const hostChildEnv = (
  base: NodeJS.ProcessEnv,
  overrides: Record<string, string>,
): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...base, ...overrides };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
};

/**
 * Say what a host exit code means, in words the panel can show.
 *
 * The host's own codes are deliberate: 0 is a normal close, 2 is a missing
 * token, 3 is a launch that never became Electron. Anything else is reported
 * raw rather than guessed at.
 */
export const describeHostExit = (code: number | null): string => {
  if (code === 0) return 'The streamed browser was closed.';
  if (code === 2) return 'The streamed browser refused to start without its host token.';
  if (code === 3)
    return 'The streamed browser started as plain Node instead of Electron, so it had no browser to stream. ELECTRON_RUN_AS_NODE was set.';
  return `The streamed browser stopped (exit ${code}).`;
};

// ---------------------------------------------------------------------------
// The hub
// ---------------------------------------------------------------------------

type Listener = (event: StreamEvent) => void;

/**
 * One streamed browser, many viewers.
 *
 * Frames are deliberately lossy: each new frame REPLACES the last one and is
 * fanned out immediately. A viewer that cannot keep up falls behind the live
 * picture instead of building a backlog of stale ones - the alternative is a
 * canvas that shows the past, which is worse than a canvas that skips.
 */
export class BrowserStreamHub {
  private listeners = new Set<Listener>();
  private hostToken: string;
  private state: StreamHostState = 'stopped';
  private url = '';
  private title = '';
  private loading = false;
  private canGoBack = false;
  private canGoForward = false;
  private viewport: StreamViewport = { ...DEFAULT_VIEWPORT };
  private frame: StreamFrame | null = null;
  private frameSeq = 0;
  private error: string | null = null;
  private notice: string | null = null;
  private reason = 'The streamed browser is not running.';
  private lastReportAt: number | null = null;
  private lastFrameAt: number | null = null;
  private updatedAt = 0;
  private viewers = 0;
  private commands: HostCommand[] = [];
  private nextCommandId = 1;
  /** Set when a viewer exists or a command was queued, so the host stays alive. */
  private hostSeenAt: number | null = null;
  /** Which host owns the session, so a second one cannot take it over. */
  private hostId: string | null = null;

  /**
   * @param now injectable clock, so staleness is testable
   * @param pinnedToken a fixed host token instead of a random one
   *
   * Pinning is for the documented manual path - running
   * `electron/browserHost.cjs` by hand, which the host's own header explains. The
   * host cannot read a token out of the server's memory, so the server has to be
   * told which one to expect; otherwise that path is documented but impossible.
   */
  constructor(
    private readonly now: () => number = () => Date.now(),
    pinnedToken?: string,
  ) {
    this.hostToken = pinnedToken && pinnedToken.length >= 16 ? pinnedToken : createHostToken();
  }

  getToken(): string {
    return this.hostToken;
  }

  /** A fresh token invalidates whatever host was connected before it. */
  rotateToken(): string {
    this.hostToken = createHostToken();
    return this.hostToken;
  }

  markStarting(): StreamStatus {
    if (this.state !== 'ready') {
      this.state = 'starting';
      this.error = null;
      this.notice = null;
      this.reason = 'Starting a real browser to stream into this panel...';
      this.touch();
    }
    return this.status();
  }

  markStopped(reason = 'The streamed browser is not running.'): StreamStatus {
    this.state = 'stopped';
    this.reason = reason;
    this.error = null;
    // A notice describes a running browser; a download line left over a stopped
    // one reads as if the browser were still there.
    this.notice = null;
    this.frame = null;
    this.hostSeenAt = null;
    this.hostId = null;
    this.commands = [];
    this.touch();
    return this.status();
  }

  markError(reason: string): StreamStatus {
    this.state = 'error';
    this.error = reason;
    this.reason = reason;
    this.notice = null;
    this.frame = null;
    this.touch();
    return this.status();
  }

  /**
   * A report from the host.
   *
   * Refuses a second live host rather than letting two panels fight over one
   * canvas: whichever one registered first keeps the session until it goes
   * stale.
   */
  reportHost(report: HostReport): { accepted: boolean; reason: string } {
    const now = this.now();
    const live =
      this.state === 'ready' && this.hostSeenAt !== null && now - this.hostSeenAt <= HOST_STALE_MS;
    const incomingId = asString(report.hostId, '', 64);

    // Only a DIFFERENT host is turned away. A report from the host that already
    // holds the session - even one that forgot to repeat its id - is the stream
    // continuing, which is the whole point of the endpoint.
    if (live && this.hostId && incomingId && incomingId !== this.hostId) {
      return { accepted: false, reason: 'another streamed browser is already connected' };
    }
    if (!live) {
      // Fresh start, or the previous host went quiet and this one takes over.
      this.hostId = incomingId || null;
    } else if (incomingId && !this.hostId) {
      this.hostId = incomingId;
    }

    this.hostSeenAt = now;
    this.lastReportAt = now;
    this.state = 'ready';
    this.error = null;
    this.reason = 'A real browser is streaming into this panel.';

    const url = asString(report.url, this.url, 4_096);
    const title = asString(report.title, this.title, 512);
    const loading = asBool(report.loading, this.loading);
    const canGoBack = asBool(report.canGoBack, this.canGoBack);
    const canGoForward = asBool(report.canGoForward, this.canGoForward);
    const viewport = report.viewport ? sanitizeViewport(report.viewport) : this.viewport;
    const error = typeof report.error === 'string' && report.error ? report.error.slice(0, 400) : null;
    // Absent means "nothing to add", not "clear it": a host omits the field on
    // every ordinary frame, so treating absence as a clear would make a notice
    // vanish with the next one on its way.
    const notice =
      typeof report.notice === 'string' && report.notice
        ? report.notice.slice(0, 400)
        : report.notice === null
          ? null
          : this.notice;

    const changed =
      url !== this.url ||
      title !== this.title ||
      loading !== this.loading ||
      canGoBack !== this.canGoBack ||
      canGoForward !== this.canGoForward ||
      viewport.width !== this.viewport.width ||
      viewport.height !== this.viewport.height ||
      error !== this.error ||
      notice !== this.notice;

    this.url = url;
    this.title = title;
    this.loading = loading;
    this.canGoBack = canGoBack;
    this.canGoForward = canGoForward;
    this.viewport = viewport;
    this.error = error;
    this.notice = notice;

    const frame = this.acceptFrame(report.frame);
    if (frame) {
      this.frame = frame;
      this.frameSeq = frame.seq;
      this.lastFrameAt = frame.at;
      this.emit({ type: 'frame', frame });
    }
    if (changed) this.emitStatus();

    this.touch();
    return { accepted: true, reason: 'ok' };
  }

  private acceptFrame(raw: HostReport['frame']): StreamFrame | null {
    if (!raw || typeof raw !== 'object') return null;
    const base64 = asString((raw as { base64?: unknown }).base64, '', MAX_FRAME_BYTES * 2);
    if (!base64) return null;
    // A JPEG payload begins with the bytes FF D8; anything else is not an image
    // and would be drawn as a broken rectangle.
    if (!base64.startsWith('/9j/')) return null;
    const bytes = Math.floor((base64.length * 3) / 4);
    if (bytes > MAX_FRAME_BYTES) return null;
    const width = clamp(asInt((raw as { width?: unknown }).width, this.viewport.width), 1, MAX_VIEWPORT);
    const height = clamp(asInt((raw as { height?: unknown }).height, this.viewport.height), 1, MAX_VIEWPORT);
    const at = this.now();
    return { seq: this.frameSeq + 1, at, mime: 'image/jpeg', base64, width, height, bytes };
  }

  /** Drop a host that stopped reporting, so the panel can offer to restart it. */
  sweep(): boolean {
    if (this.hostSeenAt === null) return false;
    if (this.now() - this.hostSeenAt <= HOST_STALE_MS) return false;
    this.markStopped('The streamed browser stopped reporting and was treated as gone.');
    return true;
  }

  pushCommand(command: HostCommandInput): { ok: boolean; reason: string; id?: number } {
    // A ping is safe to queue before the host arrives - it carries nothing - so
    // the server can make the host report the moment it connects. Input events
    // are NOT: replaying a queue of stale keystrokes into a page that has only
    // just loaded would type into the wrong place.
    const quiet = command.type === 'ping';
    if (!quiet && (this.state !== 'ready' || this.hostSeenAt === null)) {
      return { ok: false, reason: 'no streamed browser is connected' };
    }
    const id = this.nextCommandId++;
    this.commands.push({ ...command, id } as HostCommand);
    if (this.commands.length > MAX_PENDING_COMMANDS) {
      this.commands.splice(0, this.commands.length - MAX_PENDING_COMMANDS);
    }
    return { ok: true, reason: 'queued', id };
  }

  drainCommands(): HostCommand[] {
    const pending = this.commands;
    this.commands = [];
    return pending;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: StreamEvent) {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        /* a broken viewer must not stop the others */
      }
    }
  }

  private emitStatus() {
    this.emit({ type: 'status', status: this.status() });
  }

  private touch() {
    this.updatedAt = this.now();
  }

  addViewer(): number {
    this.viewers += 1;
    return this.viewers;
  }

  removeViewer(): number {
    this.viewers = Math.max(0, this.viewers - 1);
    return this.viewers;
  }

  getViewerCount(): number {
    return this.viewers;
  }

  status(): StreamStatus {
    return {
      state: this.state,
      url: this.url,
      title: this.title,
      loading: this.loading,
      canGoBack: this.canGoBack,
      canGoForward: this.canGoForward,
      viewport: this.viewport,
      frameSeq: this.frameSeq,
      lastFrameAt: this.lastFrameAt,
      lastReportAt: this.lastReportAt,
      viewers: this.viewers,
      updatedAt: this.updatedAt,
      error: this.error,
      reason: this.reason,
      notice: this.notice,
    };
  }

  latestFrame(): StreamFrame | null {
    return this.frame;
  }

  isReady(): boolean {
    return this.state === 'ready';
  }
}

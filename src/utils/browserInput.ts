/**
 * Turning a real DOM event into an event for the streamed browser.
 *
 * Two mappings matter and both are easy to get subtly wrong, so they live here
 * as pure functions instead of inside a React handler:
 *
 *   1. Coordinates. The panel shows a scaled-down picture of a 1280x800 page, so
 *      a click at CSS pixel (400, 250) is NOT page pixel (400, 250). Getting this
 *      wrong means every click lands somewhere other than where the user aimed -
 *      on a sign-in form, that is the difference between signing in and not.
 *
 *   2. Keys. The browser wants `Return`, not `Enter`; `Space`, not `' '`. And a
 *      key we cannot name must be dropped rather than guessed at, because a wrong
 *      keystroke types the wrong thing into someone's document.
 *
 * The server re-validates all of it (see `server/browserStream.ts`) - this module
 * exists so the common case is correct, not so the server can trust it.
 */

export type BrowserModifier = 'ctrl' | 'shift' | 'alt' | 'meta';

export interface FrameSize {
  width: number;
  height: number;
}

export interface DisplayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ModifierFlags {
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

export const MODIFIER_ORDER: BrowserModifier[] = ['ctrl', 'shift', 'alt', 'meta'];

/**
 * Scale a point from the panel's CSS pixels to the page's own pixels.
 *
 * Returns null when either size is unusable (a zero-width canvas during layout,
 * a frame that has not arrived): a NaN coordinate sent to a real browser would be
 * a click at the origin, which is worse than no click.
 */
export const mapPointToFrame = (point: { x: number; y: number }, rect: DisplayRect, frame: FrameSize): { x: number; y: number } | null => {
  if (!rect || !frame) return null;
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) return null;
  if (!Number.isFinite(frame.width) || !Number.isFinite(frame.height) || frame.width <= 0 || frame.height <= 0) return null;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;

  const scaleX = frame.width / rect.width;
  const scaleY = frame.height / rect.height;
  const x = Math.floor((point.x - rect.left) * scaleX);
  const y = Math.floor((point.y - rect.top) * scaleY);

  // Clamped rather than rejected: a real browser pulls an out-of-page click back
  // to the edge, and a drag that leaves the surface must keep working.
  return {
    x: Math.min(frame.width - 1, Math.max(0, x)),
    y: Math.min(frame.height - 1, Math.max(0, y)),
  };
};

export const modifiersFrom = (event: ModifierFlags): BrowserModifier[] =>
  MODIFIER_ORDER.filter((name) => {
    if (name === 'ctrl') return !!event.ctrlKey;
    if (name === 'shift') return !!event.shiftKey;
    if (name === 'alt') return !!event.altKey;
    return !!event.metaKey;
  });

/** DOM `MouseEvent.button`: 0 left, 1 middle, 2 right. Anything else has no name. */
export const mouseButtonFrom = (button: number): 'left' | 'middle' | 'right' | null => {
  if (button === 0) return 'left';
  if (button === 1) return 'middle';
  if (button === 2) return 'right';
  return null;
};

/** DOM `KeyboardEvent.key` names that differ from the browser's own names. */
const NAMED_KEYS: Record<string, string> = {
  Enter: 'Return',
  ' ': 'Space',
  Spacebar: 'Space',
  Esc: 'Escape',
  Escape: 'Escape',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Tab: 'Tab',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  Clear: 'Clear',
  Help: 'Help',
  Undo: 'Undo',
  Redo: 'Redo',
};

/**
 * The key name to forward, or null for a key we refuse to guess at.
 *
 * Single characters pass through as themselves - that includes shifted glyphs,
 * because `event.key` is already the produced character - and the host turns a
 * printable key press into text as well as a keystroke. Modifier keys, `Dead`,
 * `Unidentified` and composition states return null: they are reported by the
 * modifier flags instead, and inventing a key for them would type something the
 * user never pressed.
 */
export const keyCodeFromDomKey = (key: string): string | null => {
  if (!key) return null;
  const named = NAMED_KEYS[key];
  if (named) return named;
  if (/^F([1-9]|1[0-2])$/.test(key)) return key;
  if (key.length === 1) {
    const code = key.charCodeAt(0);
    if (code >= 0x20 && code !== 0x7f) return key;
  }
  return null;
};

/**
 * Whether the event is a printable keypress.
 *
 * The host synthesises the `char` event for these, so the renderer sends the
 * keystroke only - sending both would insert every character twice.
 */
export const isTypingKey = (key: string): boolean => key.length === 1 && key.charCodeAt(0) >= 0x20 && key.charCodeAt(0) !== 0x7f;

/**
 * Wheel deltas in pixels.
 *
 * Chrome reports lines or pages for some devices; the browser wants pixels. The
 * multipliers are the conventional ones (16px per line, one screen per page) and
 * the result is clamped, so one flick cannot scroll a page to the moon.
 */
export const MAX_WHEEL_DELTA = 2_000;

export const wheelDeltas = (event: { deltaX?: number; deltaY?: number; deltaMode?: number }): { deltaX: number; deltaY: number } => {
  const mode = event.deltaMode ?? 0;
  const factor = mode === 1 ? 16 : mode === 2 ? 400 : 1;
  const clamp = (value: number) => Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, Math.round(value)));
  const deltaX = Number.isFinite(event.deltaX) ? (event.deltaX as number) : 0;
  const deltaY = Number.isFinite(event.deltaY) ? (event.deltaY as number) : 0;
  return { deltaX: clamp(deltaX * factor), deltaY: clamp(deltaY * factor) };
};

/**
 * Keys the surface must not forward as page input, and must not swallow either.
 *
 * Tab and F6 move focus and F5 reloads the app itself, so they are left to the
 * browser unless the surface has focus AND the user is clearly typing; Escape
 * closes the panel. Everything else is sent to the page.
 */
export const APP_OWNED_KEYS = ['F5', 'F11', 'F12'];

export const isAppOwnedKey = (event: { key: string; ctrlKey?: boolean; metaKey?: boolean }): boolean => {
  if (APP_OWNED_KEYS.includes(event.key)) return true;
  // The app's own shortcuts (Ctrl+T, Ctrl+W, Ctrl+L, Ctrl+R, Ctrl+Tab) belong to
  // the panel's tab strip, not to the streamed page: the user is talking to us.
  if ((event.ctrlKey || event.metaKey) && ['t', 'w', 'l', 'r'].includes(event.key.toLowerCase())) return true;
  return false;
};

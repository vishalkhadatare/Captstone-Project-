/**
 * The embedded sign-in flow's state machine.
 *
 * Why this is a pure module
 * -------------------------
 * This logic used to live inline in `OpenAIPrismBrowserModal.tsx`, spread across
 * a `useState` phase, a status string, and three refs that had to be kept in step
 * by hand. Two real bugs came out of that shape:
 *
 *  1. The window-close poller could report "cancelled" AFTER sign-in had already
 *     completed — the window closing is the happy path, not a cancellation.
 *  2. "Load Prism here" could be pressed with no sign-in window ever opened, and
 *     the flow could still claim success.
 *
 * Both are ordering/timing bugs in a state machine, so the fix is to make the
 * machine explicit, pure, and exhaustively testable. It never touches cookies,
 * tokens or credentials — it only tracks what the UI is allowed to claim.
 */

export type AuthPhase = 'idle' | 'awaiting' | 'completed' | 'cancelled' | 'failed';

export type AuthEventType =
  /** The user asked to sign in. */
  | 'request'
  /** A real top-level sign-in window was created. */
  | 'opened'
  /** `window.open` returned null — the window was blocked. */
  | 'blocked'
  /** The user reports that sign-in finished. */
  | 'confirmed'
  /** The user gave up. */
  | 'cancelled'
  /** A sign-in window closed while we were still waiting for it. */
  | 'closedEarly'
  /** The panel navigated, or was closed. */
  | 'reset';

export const AUTH_EVENT_TYPES: readonly AuthEventType[] = [
  'request',
  'opened',
  'blocked',
  'confirmed',
  'cancelled',
  'closedEarly',
  'reset',
];

export const AUTH_PHASES: readonly AuthPhase[] = ['idle', 'awaiting', 'completed', 'cancelled', 'failed'];

export interface AuthState {
  phase: AuthPhase;
  /**
   * True only once a real sign-in window was actually created. Completion is
   * never granted while this is false, so the UI cannot fabricate a sign-in.
   */
  signInStarted: boolean;
  /** True while a sign-in window is believed to be open. */
  windowOpen: boolean;
  message: string | null;
}

export const INITIAL_AUTH_STATE: AuthState = {
  phase: 'idle',
  signInStarted: false,
  windowOpen: false,
  message: null,
};

export const AUTH_PHASE_LABEL: Record<AuthPhase, string> = {
  idle: 'Not started',
  awaiting: 'Waiting for sign-in',
  completed: 'Sign-in window finished',
  cancelled: 'Cancelled',
  failed: 'Failed to open window',
};

export const AUTH_PHASE_STYLE: Record<AuthPhase, string> = {
  idle: 'bg-slate-800 text-slate-300 border-slate-700',
  awaiting: 'bg-amber-950/70 text-amber-300 border-amber-800/60',
  completed: 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60',
  cancelled: 'bg-slate-800 text-slate-400 border-slate-700',
  failed: 'bg-rose-950/70 text-rose-300 border-rose-800/60',
};

export const AUTH_MESSAGES = {
  opened:
    'Waiting for you to finish signing in. If you close that window first, it is reported as cancelled.',
  blocked:
    'The sign-in window could not be opened — it was blocked. Allow pop-ups for this page and try again.',
  completed:
    'Sign-in finished. Reloading the embedded panel so it picks up the new session.',
  cancelled: 'Sign-in cancelled.',
  closedEarly: 'The sign-in window closed before sign-in completed.',
  nothingToConfirm:
    'There is nothing to load yet: open the sign-in window and finish signing in first.',
} as const;

/**
 * Apply an event.
 *
 * Invariants, all pinned by `authFlow.test.cjs`:
 *  - `reset` always returns the initial state.
 *  - `signInStarted` never goes from true to false except on `reset`.
 *  - `completed` is only ever reachable through `confirmed` after a window
 *    really opened, so the UI can never claim a sign-in that did not happen.
 *  - Once `completed`, closing the window changes nothing.
 *  - `awaiting` always has `windowOpen === true`; `failed` always has it false.
 */
export function reduceAuth(state: AuthState, event: AuthEventType): AuthState {
  switch (event) {
    case 'reset':
      return { ...INITIAL_AUTH_STATE };

    case 'request':
      // A second request while a window is already open just reuses it.
      if (state.phase === 'awaiting' && state.windowOpen) return state;
      return { ...INITIAL_AUTH_STATE };

    case 'opened':
      return {
        phase: 'awaiting',
        signInStarted: true,
        windowOpen: true,
        message: AUTH_MESSAGES.opened,
      };

    case 'blocked':
      // A blocked window must not silently leave the flow looking healthy.
      if (state.phase === 'completed') return state;
      return {
        ...state,
        phase: 'failed',
        windowOpen: false,
        message: AUTH_MESSAGES.blocked,
      };

    case 'confirmed':
      // Already done: confirming again changes nothing.
      if (state.phase === 'completed') return state;
      // Sign-in can only be confirmed while we are actually waiting on a window
      // that really opened. Never fabricate a completed sign-in.
      if (state.phase !== 'awaiting' || !state.signInStarted) {
        return { ...state, message: AUTH_MESSAGES.nothingToConfirm };
      }
      return {
        phase: 'completed',
        signInStarted: true,
        windowOpen: false,
        message: AUTH_MESSAGES.completed,
      };

    case 'cancelled':
      // A finished sign-in must not be undone by a stray cancel.
      if (state.phase === 'completed') return state;
      return {
        ...state,
        phase: 'cancelled',
        windowOpen: false,
        message: AUTH_MESSAGES.cancelled,
      };

    case 'closedEarly':
      // Only meaningful while we were actually waiting for that window.
      if (state.phase !== 'awaiting' || !state.windowOpen) return state;
      return {
        phase: 'cancelled',
        signInStarted: state.signInStarted,
        windowOpen: false,
        message: AUTH_MESSAGES.closedEarly,
      };

    default:
      return state;
  }
}

/** True when the UI may offer "Load Prism here". */
export const canConfirmSignIn = (state: AuthState): boolean =>
  state.signInStarted && state.phase !== 'failed' && state.phase !== 'cancelled';

/** True when the UI should show a spinner instead of the sign-in icon. */
export const isAuthWindowOpen = (state: AuthState): boolean => state.phase === 'awaiting';

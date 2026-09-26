import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Globe,
  ExternalLink,
  RotateCcw,
  Maximize2,
  Minimize2,
  X,
  Sparkles,
  ShieldCheck,
  KeyRound,
  Info,
  CheckCircle2,
  Loader2,
  Copy,
} from 'lucide-react';
import {
  OPENAI_GOOGLE_SIGN_IN_URL,
  PRISM_SIGN_IN_URL,
  PRISM_AUTH_WINDOW_NAME,
  authLog,
  planAuthNavigation,
  redactUrlForLog,
} from '../utils/prismAuth';
import {
  ChromeLikeBrowser,
  type BrowserBookmark,
  type BrowserPolicy,
} from './browser/ChromeLikeBrowser';
import { useStreamedBrowser } from './browser/useStreamedBrowser';
import {
  AUTH_PHASE_LABEL,
  AUTH_PHASE_STYLE,
  INITIAL_AUTH_STATE,
  canConfirmSignIn,
  isAuthWindowOpen,
  reduceAuth,
  type AuthState,
} from '../utils/authFlow';
import {
  interpretSignInReport,
  type SignInDiagnosis,
  type SignInReport,
} from '../utils/signInDiagnosis';
import { api, subscribeBrowserStatus } from '../api';

interface OpenAIPrismBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialUrl?: string;
}

/**
 * The bookmarks shown only when the server cannot be reached.
 *
 * A degraded copy, not the source of truth: the real list - including which
 * entries refuse framing - comes from `GET /api/browser/config`, so a
 * measurement taken server-side governs every client. This exists so the panel
 * still opens with something useful while the server restarts.
 */
/**
 * How many times opening the panel may try to start the streamed browser.
 *
 * More than one, because a first attempt can lose a race with a process that is
 * still shutting down; few, because a host that dies instantly is a bug the user
 * needs to see rather than a loop to hide. The budget resets every time the panel
 * is opened.
 */
const MAX_AUTO_STARTS = 3;

const FALLBACK_BOOKMARKS: BrowserBookmark[] = [
  { id: 'prism', name: 'OpenAI Prism', url: PRISM_SIGN_IN_URL, icon: '✨', group: 'core' },
];

/** What `GET /api/browser/config` answers with, inferred from the client. */
type BrowserConfigPayload = Awaited<ReturnType<typeof api.getBrowserConfig>>;

/**
 * True when running inside the Electron shell (`electron/main.cjs`).
 *
 * In the desktop shell the embedded pane is a `<webview>` — a real top-level
 * browsing context with its own persistent session — instead of an `<iframe>`,
 * which providers refuse to render their sign-in inside (X-Frame-Options).
 */
const isDesktopShell = (): boolean => {
  if (typeof window === 'undefined') return false;
  // Only OUR preload bridge counts. Sniffing the user agent for "Electron/" is
  // wrong: many other Electron apps (editors, chat clients, browser previews)
  // embed this page but do NOT enable the webview tag, so a <webview> would
  // silently never attach. The bridge is exposed only by electron/preload.cjs.
  return window.zeroleakDesktop?.isElectron === true;
};

/**
 * The sign-in lifecycle lives in `../utils/authFlow` as a pure state machine.
 *
 * It used to be a phase plus a status string plus two refs kept in step by hand,
 * and that shape produced real bugs: the close poller could report "cancelled"
 * after sign-in had already completed, and "Load Prism here" could claim success
 * with no window ever opened. Both are pinned by `authFlow.test.ts` now.
 */

export const OpenAIPrismBrowserModal: React.FC<OpenAIPrismBrowserModalProps> = ({
  isOpen,
  onClose,
  initialUrl = PRISM_SIGN_IN_URL,
}) => {
  /** The URL of whichever tab the browser reports as active. */
  const [activeUrl, setActiveUrl] = useState<string>(initialUrl);
  /**
   * Full screen by default.
   *
   * The panel is a browser, and a browser in a small box is a browser with a
   * small page: it opened at `max-w-6xl` and the streamed page had to be scaled
   * down to fit, which is exactly what made it look tiny. The streamed Chromium
   * is now told the panel's size too (see `StreamedBrowserSurface`), so opening
   * maximized means the page inside is rendered at the size it is seen at.
   */
  const [isMaximized, setIsMaximized] = useState<boolean>(true);
  /** Bumped to ask the browser to reload the active tab, e.g. after sign-in. */
  const [reloadSignal, setReloadSignal] = useState<number>(0);
  const [showAuthTip, setShowAuthTip] = useState<boolean>(true);
  const [auth, setAuth] = useState<AuthState>(INITIAL_AUTH_STATE);
  /** Address-bar validation feedback, which is not part of the sign-in machine. */
  const [navigationMessage, setNavigationMessage] = useState<string | null>(null);
  /** Result of the desktop shell's own sign-in button. */
  const [desktopAuthStatus, setDesktopAuthStatus] = useState<string | null>(null);
  const [copiedDesktopCommand, setCopiedDesktopCommand] = useState(false);
  /** Result of the on-demand sign-in diagnosis, if the user asked for one. */
  const [diagnosis, setDiagnosis] = useState<SignInDiagnosis | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  /**
   * The browser's configuration, owned by the backend.
   *
   * Navigation policy, bookmarks and the live status of each AI tool all arrive
   * from `GET /api/browser/config`, so a measurement taken server-side governs
   * every client instead of each renderer keeping its own copy. Absent means the
   * fetch failed and the degraded local list is used.
   */
  const [browserConfig, setBrowserConfig] = useState<BrowserConfigPayload | null>(null);
  /** Frames from `/api/browser/stream`, which replace the bookmarks wholesale. */
  const [liveBookmarks, setLiveBookmarks] = useState<BrowserBookmark[] | null>(null);
  const [configNote, setConfigNote] = useState<string | null>(null);

  const authWindowRef = useRef<Window | null>(null);
  const authPollRef = useRef<number | null>(null);

  // -------------------------------------------------------------------------
  // Authentication window plumbing
  // -------------------------------------------------------------------------

  const stopAuthPolling = useCallback(() => {
    if (authPollRef.current !== null) {
      window.clearInterval(authPollRef.current);
      authPollRef.current = null;
    }
  }, []);

  const closeAuthWindow = useCallback(() => {
    const win = authWindowRef.current;
    authWindowRef.current = null;
    if (win && !win.closed) {
      authLog('Closing authentication window');
      try {
        win.close();
      } catch {
        /* the user may already have closed it; nothing to do */
      }
    }
  }, []);

  /**
   * Watch the auth window so cancellation is reported honestly instead of
   * silently claiming success. We can only observe whether the window is still
   * open — its cross-origin URL is intentionally unreadable from here.
   */
  const startAuthPolling = useCallback(() => {
    stopAuthPolling();
    authPollRef.current = window.setInterval(() => {
      const win = authWindowRef.current;
      if (!win) {
        stopAuthPolling();
        return;
      }
      if (!win.closed) return;

      stopAuthPolling();
      authWindowRef.current = null;

      // The reducer decides what a closed window means: a cancellation while we
      // were still waiting for it, and nothing at all once sign-in has completed.
      // The old hand-rolled version got that second case wrong.
      authLog('Authentication window closed');
      setAuth((previous) => reduceAuth(previous, 'closedEarly'));
    }, 700);
  }, [stopAuthPolling]);

  /**
   * Open the authentication navigation in a REAL top-level window.
   *
   * If the caller already has a genuine provider authorize URL we open that
   * exact URL. Otherwise we open Prism's own sign-in entry point, which then
   * drives the provider redirect inside this top-level window — we never forge
   * an authorize URL, because Prism generates it with its own PKCE/state.
   */
  const openAuthWindow = useCallback(
    (targetUrl: string, trigger: string) => {
      const plan = planAuthNavigation(targetUrl);
      const url = plan.url || targetUrl;
      const isOAuthUrl = plan.kind === 'oauth';

      authLog('Authentication requested', trigger);
      authLog('URL:', redactUrlForLog(url));
      if (isOAuthUrl) {
        authLog('OAuth detected', plan.reason);
      } else {
        authLog('Opening Prism sign-in entry point (Prism generates the provider authorize URL in this window)');
      }

      const existing = authWindowRef.current;
      if (existing && !existing.closed) {
        authLog('Reusing existing authentication window');
        existing.focus();
        return;
      }

      const width = 1024;
      const height = 768;
      const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
      const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));

      // NOTE: no `noopener` on purpose — we need the WindowProxy handle so we can
      // detect the window closing and report cancellation instead of pretending
      // authentication succeeded. This window is a trusted provider origin; we
      // only ever read `closed` from it and never read its location or storage.
      const win = window.open(
        url,
        PRISM_AUTH_WINDOW_NAME,
        `width=${width},height=${height},top=${top},left=${left},menubar=no,toolbar=no,status=no,location=yes`,
      );

      if (!win) {
        setAuth((previous) => reduceAuth(previous, 'blocked'));
        authLog('Authentication window blocked by the browser');
        return;
      }

      authWindowRef.current = win;
      setAuth((previous) => reduceAuth(previous, 'opened'));
      authLog('Authentication window created');
      authLog('Opening top-level authentication window');
      try {
        win.focus();
      } catch {
        /* focus can be refused; harmless */
      }
      startAuthPolling();
    },
    [startAuthPolling],
  );

  /** The user tells us the top-level sign-in actually completed. */
  const handleConfirmSignedIn = useCallback(() => {
    // The reducer refuses to complete a sign-in whose window never opened, so
    // there is no way to fabricate success from here — no guard needed.
    stopAuthPolling();
    closeAuthWindow();
    setAuth((previous) => reduceAuth(previous, 'confirmed'));
    authLog('OAuth callback detected');
    authLog('Authentication completed');
    authLog('Reloading the active tab');
    setShowAuthTip(true);
    // Reload through the browser rather than this component, so the tab keeps
    // its own history and session instead of being rebuilt from scratch.
    setReloadSignal((prev) => prev + 1);
  }, [closeAuthWindow, stopAuthPolling]);

  /** The user gives up on the top-level flow. */
  const handleCancelSignIn = useCallback(() => {
    stopAuthPolling();
    closeAuthWindow();
    setAuth((previous) => reduceAuth(previous, 'cancelled'));
    authLog('Authentication cancelled by the user');
  }, [closeAuthWindow, stopAuthPolling]);

  const handleCopyDesktopCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText('npm run desktop');
      setCopiedDesktopCommand(true);
      window.setTimeout(() => setCopiedDesktopCommand(false), 2000);
    } catch {
      // Clipboard access can be refused without a user gesture; the command is
      // visible in the box either way, so there is nothing to recover from.
    }
  }, []);

  /**
   * Desktop shell: open the sign-in window from ZeroLeak's own UI.
   *
   * This is the path that does NOT depend on Prism's page at all. The shell opens
   * a real window inside the app, on the pane's persistent session, so finishing
   * sign-in there (Google, GitHub or ChatGPT) signs the embedded pane in — and
   * the pane reloads itself the moment sign-in lands back on Prism.
   */
  const requestAuthWindow = useCallback(async (targetUrl: string) => {
    const bridge = window.zeroleakDesktop;
    if (!bridge?.openAuthWindow) {
      setDesktopAuthStatus('Desktop bridge unavailable — start the app with `npm run desktop`.');
      return;
    }

    authLog('Sign-in window requested from the app chrome', targetUrl);
    try {
      const result = await bridge.openAuthWindow(targetUrl);
      if (result?.opened) {
        authLog('In-app sign-in window opened');
        setDesktopAuthStatus(
          result.reused
            ? 'Bringing the open sign-in window to the front.'
            : 'Sign-in window is open inside the app. Finish signing in there — this pane reloads by itself and then shows your account.',
        );
      } else {
        authLog('In-app sign-in window refused', result?.reason);
        setDesktopAuthStatus(result?.reason ?? 'The sign-in window could not be opened.');
      }
    } catch (error) {
      authLog('In-app sign-in window failed', String(error));
      setDesktopAuthStatus('The sign-in window could not be opened.');
    }
  }, []);

  const handleDesktopSignIn = useCallback(() => {
    void requestAuthWindow(PRISM_SIGN_IN_URL);
  }, [requestAuthWindow]);

  /**
   * Answer "why can't it open the sign-in window?" from the running app, instead
   * of trusting Prism's own message — which always blames a popup blocker, even
   * when the real cause is the host app.
   */
  const handleDiagnose = useCallback(async () => {
    setDiagnosing(true);
    authLog('Sign-in diagnosis requested');
    try {
      const bridge = window.zeroleakDesktop;
      if (!bridge?.diagnoseSignIn) {
        // No shell means a browser tab, which needs no measurement to explain.
        setDiagnosis(
          interpretSignInReport({
            desktopShell: false,
            pane: null,
            popups: null,
            paneRefreshes: [],
            openAuthWindows: 0,
            keepElectronUserAgent: false,
          }),
        );
        return;
      }

      const raw = (await bridge.diagnoseSignIn()) as Partial<SignInReport> | null;
      setDiagnosis(
        interpretSignInReport({
          desktopShell: true,
          pane: raw?.pane ?? null,
          popups: raw?.popups ?? null,
          paneRefreshes: raw?.paneRefreshes ?? [],
          openAuthWindows: raw?.openAuthWindows ?? 0,
          keepElectronUserAgent: raw?.keepElectronUserAgent ?? false,
        }),
      );
      authLog('Sign-in diagnosis completed');
    } catch (error) {
      authLog('Sign-in diagnosis failed', String(error));
      setDiagnosis({
        level: 'warning',
        headline: 'The diagnosis could not run in this environment.',
        reasons: [String(error)],
        actions: ['Run `npm run desktop:smoke` for the full shell report.'],
      });
    } finally {
      setDiagnosing(false);
    }
  }, []);

  /** The route measured to hand straight over to Google with OpenAI's client id. */
  const handleDesktopGoogleSignIn = useCallback(() => {
    void requestAuthWindow(OPENAI_GOOGLE_SIGN_IN_URL);
  }, [requestAuthWindow]);

  // Tear the auth window down whenever the embedded browser goes away, so we
  // never leave an orphaned top-level window behind.
  useEffect(() => {
    if (isOpen) {
      authLog('Embedded Prism browser opened');
    }
    return () => {
      stopAuthPolling();
      if (authWindowRef.current && !authWindowRef.current.closed) {
        try {
          authWindowRef.current.close();
        } catch {
          /* ignore */
        }
      }
      authWindowRef.current = null;
    };
  }, [isOpen, stopAuthPolling]);

  /**
   * The configuration is fetched once per mount and shared by every caller.
   *
   * The request is held as a promise rather than guarded by a "have we run?"
   * flag, because StrictMode invokes effects twice: a flag made the first run
   * mark itself done and the second run skip the fetch, while the first run's
   * result was thrown away as cancelled - so the AI row silently stayed empty.
   * A shared promise is idempotent under any number of invocations.
   */
  const configRequestRef = useRef<Promise<BrowserConfigPayload | null> | null>(null);

  const loadBrowserConfig = useCallback((): Promise<BrowserConfigPayload | null> => {
    if (!configRequestRef.current) {
      configRequestRef.current = api.getBrowserConfig().catch(() => {
        setConfigNote(
          'The server did not answer the browser configuration request, so this panel is using its built-in bookmark list and default rules.',
        );
        return null;
      });
    }
    return configRequestRef.current;
  }, []);

  /**
   * Load the backend's browser configuration, then keep its status fresh.
   *
   * The configuration route is readable without a token on purpose, so the panel
   * is fully configured before sign-in. The stream then replaces the bookmarks
   * whenever the backend re-probes, which is what keeps the status dots honest
   * without every client polling the open internet on its own schedule.
   */
  useEffect(() => {
    if (!isOpen) return undefined;
    let active = true;

    void (async () => {
      const payload = await loadBrowserConfig();
      if (active && payload) setBrowserConfig(payload);
    })();

    const unsubscribe = subscribeBrowserStatus((frame) => {
      if (!active) return;
      if (frame.type === 'browser-status' && frame.bookmarks) {
        setLiveBookmarks(frame.bookmarks as BrowserBookmark[]);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [isOpen, loadBrowserConfig]);

  /**
   * Capability check, not a hook: the environment decides what a tab IS.
   *
   * In the desktop shell each tab is a real `<webview>` on one persistent
   * partition, so Prism's sign-in works and survives a restart. In an ordinary
   * browser tab each is an iframe, which shares this page's cookies and can
   * never complete OAuth. `ChromeLikeBrowser` owns both paths.
   */
  const desktopShell = isDesktopShell();

  const authRequired = planAuthNavigation(activeUrl).kind === 'prism';
  // The gate only applies to the iframe path: a real embedded session can sign in.
  // Derived from the state machine instead of tracked by hand.
  const signInWindowOpen = isAuthWindowOpen(auth);
  const mayConfirmSignIn = canConfirmSignIn(auth);

  // -------------------------------------------------------------------------
  // Navigation, as the sign-in machinery sees it
  // -------------------------------------------------------------------------

  /** The browser moved the active tab. */
  const handleActiveUrlChange = useCallback((url: string) => {
    setActiveUrl(url);
  }, []);

  /** A tab navigated, so re-lock Prism and reset the sign-in machine. */
  const handleNavigate = useCallback(() => {
    setNavigationMessage(null);
    setAuth((previous) => reduceAuth(previous, 'reset'));
    setShowAuthTip(true);
  }, []);

  /**
   * Provider sign-in screens cannot run in a frame, so hand them to a real
   * window. In the desktop shell a tab is a top-level context and loads the
   * provider page itself, which is the entire point of that path.
   */
  const handleBeforeNavigate = useCallback(
    (url: string): string | null => {
      const plan = planAuthNavigation(url);
      if (!desktopShell && plan.kind === 'oauth') {
        authLog('OAuth detected in the address bar — routing to a top-level window instead of the embedded frame');
        openAuthWindow(plan.url, 'address bar navigation');
        return 'A provider sign-in screen cannot run in an embedded frame, so it was opened in a sign-in window instead.';
      }
      return null;
    },
    [desktopShell, openAuthWindow],
  );

  const handleOpenExternal = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  /**
   * The bookmark bar, in order of authority.
   *
   * The stream's last push wins, because it is the freshest measurement; then
   * the configuration fetched on open; and only when the server is unreachable
   * does the degraded local list stand in. Dedupe, status and icons are all
   * decided server-side, so this is a choice of source and not a rebuild.
   */
  const bookmarks: BrowserBookmark[] =
    liveBookmarks ?? browserConfig?.bookmarks ?? FALLBACK_BOOKMARKS;

  /** Navigation rules from the same response; undefined means local defaults. */
  const policy: BrowserPolicy | undefined = browserConfig?.policy;

  /**
   * Browser mode gets a REAL browser instead of a frame.
   *
   * This is the answer to the wall the panel kept hitting: an `<iframe>` can never
   * host a sign-in - `auth.openai.com` sends `frame-ancestors 'self'`,
   * `accounts.google.com` sends `X-Frame-Options: DENY`, and Chrome partitions the
   * cookies a login needs - so browser mode asks the backend for an offscreen
   * Chromium and draws its frames here. In the desktop shell the tabs are already
   * real, so nothing is streamed and this hook does no work.
   */
  const streamedBrowser = useStreamedBrowser(!desktopShell);

  /**
   * True when a real Chromium is streaming into this panel.
   *
   * It decides how much of the panel's own chrome is worth the space. The
   * iframe-limitation warning and the `Authentication:` badge both describe the
   * IFRAME path - "an iframe can never complete OAuth", "Not started" - and once
   * a real browser is streaming they are stale advice sitting on top of the page
   * that it needs: measured, they cost about 140px of a maximized panel.
   */
  const streamingHere = !desktopShell && streamedBrowser.ready;

  /**
   * What the browser itself has to say - where a download was saved, today.
   *
   * A download is the one action with no visible result: the window is offscreen,
   * so there is no download shelf, and "I clicked Download PDF and nothing
   * happened" is the report this answers. The server clears it after a few
   * seconds, so it is a message and not furniture.
   */
  const downloadNotice = streamedBrowser.status?.notice ?? null;

  /**
   * The panel starts its own real browser.
   *
   * A bounded number of attempts, because a host that dies immediately (the
   * `ELECTRON_RUN_AS_NODE` crash was exactly that) must not be restarted forever
   * behind the user's back: after the attempts are spent the reason is on screen
   * instead of a silent loop. The budget resets each time the panel is opened.
   */
  const autoStartsRef = useRef(0);
  useEffect(() => {
    if (isOpen) autoStartsRef.current = 0;
  }, [isOpen]);
  useEffect(() => {
    if (desktopShell || !isOpen) return;
    if (streamedBrowser.ready || streamedBrowser.starting) return;
    if (autoStartsRef.current >= MAX_AUTO_STARTS) return;
    autoStartsRef.current += 1;
    void streamedBrowser.start();
  }, [desktopShell, isOpen, streamedBrowser.ready, streamedBrowser.starting, streamedBrowser.start]);

  // Every hook above runs on every render, whether the modal is open or not.
  // Returning early BEFORE them made the closed and open renders disagree about
  // how many hooks exist, and React answers that with "Rendered more hooks than
  // during the previous render" the first time this panel is opened.
  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  /**
   * Rendered into `document.body`, not where this component happens to sit.
   *
   * A full-screen panel has to be a child of the body for two reasons that both
   * bit this panel: `position: fixed` resolves against the nearest ancestor that
   * creates a containing block (a scrolled workspace put the title bar above the
   * visible area, and a stack of app chrome could paint over it), and z-index only
   * orders an element within its own stacking context, so 9999 inside the
   * workspace was not the top of the page.
   */
  return createPortal(
    <div
      className={`fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/85 backdrop-blur-md transition-all ${
        isMaximized ? 'p-0' : 'p-2 sm:p-4'
      }`}
    >
      <div
        className={`bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${
          isMaximized ? 'w-full h-full rounded-none' : 'w-full max-w-6xl h-[90vh] max-h-[940px]'
        }`}
      >
        {/* Browser Top Window Bar */}
        <div className="bg-slate-950 border-b border-slate-800 px-4 py-3 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block hover:opacity-80 cursor-pointer" onClick={onClose} title="Close" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block hover:opacity-80 cursor-pointer" onClick={() => setIsMaximized(!isMaximized)} title="Maximize" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
            </div>
            {/*
             * Just the name.
             *
             * It said "OpenAI Prism & LaTeX Browser" with an "In-Project Sandbox"
             * badge and a paragraph teaching Ctrl+T - all of it describing a
             * browser the user no longer sees, because the chrome is hidden. What
             * is left says which page this is.
             */}
            <div className="flex items-center gap-2 text-white font-bold text-xs sm:text-sm pl-2 border-l border-slate-800">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Prism</span>
            </div>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? 'Restore' : 'Maximize'}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              title="Close Browser"
              className="p-2 rounded-xl text-slate-300 hover:text-rose-400 hover:bg-rose-950/40 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {configNote && !streamingHere && (
          <div className="bg-amber-950/50 border-b border-amber-800/50 px-4 py-1 text-[11px] text-amber-200 shrink-0">
            {configNote}
          </div>
        )}

        {/* Auth status strip. Hidden while a real browser streams: the row above
            the page already says the only thing that matters then. */}
        {!streamingHere && (
        <div className="bg-slate-950 border-b border-slate-800 px-4 py-1.5 flex flex-wrap items-center gap-3 text-[11px] shrink-0">
          {desktopShell ? (
            <>
              <span className="px-2 py-0.5 rounded-full border font-mono bg-emerald-950/70 text-emerald-300 border-emerald-800/60">
                Embedded browser session: persistent
              </span>
              <button
                type="button"
                onClick={handleDesktopSignIn}
                title="Open a real sign-in window inside the app, on this pane's own session — Google, GitHub or ChatGPT"
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <KeyRound className="w-3 h-3" />
                <span>Sign in to Prism</span>
              </button>
              <button
                type="button"
                onClick={handleDesktopGoogleSignIn}
                title="Opens OpenAI's own sign-in route, which hands straight over to Google — inside the app, on this pane's session"
                className="px-2.5 py-1 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <Globe className="w-3 h-3" />
                <span>Sign in with Google</span>
              </button>
              <span className="text-slate-400">
                That window opens <strong className="text-slate-300">inside the app</strong> on this pane&apos;s session —
                not a Chrome tab. When you finish there, the pane reloads itself and shows your account.
              </span>
              {desktopAuthStatus && <span className="text-emerald-300">{desktopAuthStatus}</span>}
            </>
          ) : (
            <>
              <span className={`px-2 py-0.5 rounded-full border font-mono ${AUTH_PHASE_STYLE[auth.phase]}`}>
                Authentication: {AUTH_PHASE_LABEL[auth.phase]}
              </span>
              {(navigationMessage ?? auth.message) && (
                <span className="text-slate-400">{navigationMessage ?? auth.message}</span>
              )}
              <span className="text-slate-500">
                Browser mode — an iframe can never complete OAuth. Run{' '}
                <code className="font-mono text-slate-400">npm run desktop</code> for real tabs with their own
                session.
              </span>
            </>
          )}

          <button
            type="button"
            onClick={handleDiagnose}
            disabled={diagnosing}
            title="Measure this pane and say why a sign-in window did or did not open"
            className="ml-auto px-2 py-0.5 rounded-full border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60"
          >
            {diagnosing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Info className="w-3 h-3" />}
            <span>{diagnosing ? 'Measuring…' : 'Diagnose sign-in'}</span>
          </button>
        </div>
        )}

        {/* Sign-in diagnosis: says which cause is in force, with the evidence */}
        {diagnosis && (
          <div
            className={`border-b px-4 py-2.5 text-[11px] shrink-0 ${
              diagnosis.level === 'blocked'
                ? 'bg-rose-950/60 border-rose-800/60 text-rose-100'
                : diagnosis.level === 'warning'
                  ? 'bg-amber-950/60 border-amber-800/60 text-amber-100'
                  : 'bg-emerald-950/60 border-emerald-800/60 text-emerald-100'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2 min-w-0">
                <p className="font-bold leading-snug">{diagnosis.headline}</p>

                <div>
                  <p className="font-semibold opacity-80">What was measured</p>
                  <ul className="list-disc list-inside space-y-0.5 opacity-90 break-words">
                    {diagnosis.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="font-semibold opacity-80">What to do</p>
                  <ul className="list-disc list-inside space-y-0.5 opacity-90 break-words">
                    {diagnosis.actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDiagnosis(null)}
                title="Dismiss"
                className="px-1 text-xs opacity-70 hover:opacity-100 transition-all cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/*
         * Frame-limitation banner, iframe path only.
         *
         * This used to be a full-page gate covering Prism, which got the
         * trade-off exactly backwards: Prism's page embeds perfectly well, and
         * only its sign-in cannot complete. Blocking the page to warn about the
         * sign-in meant the site was never visible at all. The page renders now,
         * and the warning sits above it as something that can be read and
         * dismissed.
         */}
        {showAuthTip && !desktopShell && authRequired && !streamingHere && (
          <div className="bg-gradient-to-r from-amber-950/90 to-indigo-950/90 border-b border-amber-800/50 px-4 py-2 flex items-start justify-between gap-3 text-xs text-amber-200 shrink-0">
            <div className="flex items-start gap-2 min-w-0">
              <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <span className="block">
                  <strong>Prism&apos;s page renders here — only its sign-in cannot.</strong> Google, GitHub and OpenAI
                  all refuse to run OAuth inside an embedded frame (that is where{' '}
                  <code className="font-mono">openai-provider-validation-failed</code> comes from). Sign in through a
                  real window via{' '}
                  <button
                    type="button"
                    onClick={() => openAuthWindow(PRISM_SIGN_IN_URL, 'helper banner')}
                    className="font-bold underline hover:text-white inline-flex items-center gap-1 cursor-pointer mx-1"
                  >
                    <KeyRound className="w-3 h-3" /> Sign In Window
                  </button>
                  , then{' '}
                  <button
                    type="button"
                    onClick={handleConfirmSignedIn}
                    className="font-bold underline hover:text-emerald-300 inline-flex items-center gap-1 cursor-pointer mx-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Load Prism here
                  </button>
                  .
                </span>
                <span className="block text-amber-200/80">
                  Run{' '}
                  <code className="font-mono text-amber-100">npm run desktop</code> and every tab gets its own real
                  browsing session: Prism signs in inside the panel, and stays signed in across restarts.{' '}
                  <button
                    type="button"
                    onClick={handleCopyDesktopCommand}
                    className="font-bold underline hover:text-white inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedDesktopCommand ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedDesktopCommand ? 'Copied' : 'Copy command'}
                  </button>
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAuthTip(false)}
              title="Dismiss - the page below is still fully browsable"
              className="text-slate-400 hover:text-white text-xs px-1 cursor-pointer shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        {/* Web Viewport Area */}
        <div className="flex-1 w-full bg-slate-950 overflow-hidden flex flex-col">
          <div className="relative flex-1 w-full overflow-hidden flex flex-col">
            {/* One pane per tab. In the desktop shell a tab is a real guest on a
                persistent partition, so provider sign-in works and survives a
                restart; in a plain browser tab it is an iframe. */}
            {/*
             * Browser mode only: the streamed browser's own state.
             *
             * There is no start or stop button by request, and none is needed:
             * this panel has only ever had the real browser, so asking the user
             * to switch it on was a decision with one sensible answer. It starts
             * itself (see the effect above), and this line appears only when
             * something is worth reading - it is starting, it stopped, or the
             * browser has a notice such as where a download went.
             */}
            {!desktopShell && !streamedBrowser.ready && (
              <div className="border-b border-slate-800 bg-slate-900/80 px-3 py-1.5 flex items-center gap-1.5 text-[11px] shrink-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${streamedBrowser.starting ? 'bg-amber-400 animate-pulse' : 'bg-slate-500'}`}
                />
                <span className="text-slate-400 truncate">{streamedBrowser.reason}</span>
              </div>
            )}

            {streamedBrowser.error && (
              <div className="border-b border-rose-900/60 bg-rose-950/50 px-3 py-1.5 text-[11px] text-rose-200 shrink-0">
                {streamedBrowser.error}
              </div>
            )}

            <ChromeLikeBrowser
              desktopShell={desktopShell}
              initialUrl={initialUrl}
              bookmarks={bookmarks}
              policy={policy}
              streamed={streamedBrowser.ready}
              streamedStatus={streamedBrowser.status}
              onActiveUrlChange={handleActiveUrlChange}
              onNavigate={handleNavigate}
              beforeNavigate={handleBeforeNavigate}
              reloadSignal={reloadSignal}
              onOpenExternal={handleOpenExternal}
              /* No tabs, no address bar, no bookmark bar: only the page. The real
                 browser behind it is untouched - it is still streaming, and it is
                 still the thing this panel steers. */
              chrome={false}
            />

            {/*
             * A download is the one action with no visible result: the window is
             * offscreen, so there is no download shelf. This is the only thing
             * that floats over the page, it names the file's real path on disk,
             * and the server clears it after a few seconds.
             */}
            {downloadNotice && (
              <div className="pointer-events-none absolute bottom-3 right-3 z-20 max-w-lg rounded-lg border border-emerald-800/70 bg-emerald-950/95 px-3 py-2 text-[11px] text-emerald-100 shadow-lg">
                {downloadNotice}
              </div>
            )}
          </div>

          {/*
           * Bottom toolbar, from before the panel became a plain Prism view.
           *
           * It printed the page's URL - which the user asked not to see - beside
           * Sign In Window and Open in Tab. None of it belongs in front of the
           * editor: a real browser is streaming underneath (see the panel above),
           * the file it shows is on disk, and every one of these actions is
           * something Prism's own page does in place. It stays for the desktop
           * shell, where those buttons drive real panes and nothing is streamed.
           */}
          {!streamingHere && (
          <div className="bg-slate-950 border-t border-slate-800 px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-300 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300">
                Connected to <strong className="text-white font-mono">{activeUrl}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {!desktopShell && (
                <button
                  type="button"
                  onClick={() => openAuthWindow(PRISM_SIGN_IN_URL, 'status bar')}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1.5 shadow transition-all cursor-pointer"
                  title="Authenticate with Google / GitHub / ChatGPT in a real top-level window"
                >
                  {signInWindowOpen ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                  <span>Sign In Window</span>
                </button>
              )}

              {mayConfirmSignIn && (
                <button
                  type="button"
                  onClick={handleConfirmSignedIn}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 shadow transition-all cursor-pointer"
                  title="I finished signing in — reload the embedded Prism panel"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Load Prism here</span>
                </button>
              )}

              {signInWindowOpen && (
                <button
                  type="button"
                  onClick={handleCancelSignIn}
                  title="Stop waiting for the sign-in window"
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer"
                >
                  <span>Cancel sign-in</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleOpenExternal}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                <span>Open in Tab</span>
              </button>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

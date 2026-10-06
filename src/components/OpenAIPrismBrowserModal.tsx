import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Maximize2,
  Minimize2,
  X,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Home,
  Upload,
  FolderUp,
  FileArchive,
  Check,
  Loader2,
} from 'lucide-react';
import {
  OPENAI_GOOGLE_SIGN_IN_URL,
  PRISM_SIGN_IN_URL,
  PRISM_AUTH_WINDOW_NAME,
  authLog,
  planAuthNavigation,
  redactUrlForLog,
  streamedSignInActions,
} from '../utils/prismAuth';
import {
  ChromeLikeBrowser,
  type BrowserBookmark,
  type BrowserPolicy,
} from './browser/ChromeLikeBrowser';
import { ZeroLeakLogo } from './ZeroLeakLogo';
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
import { api, subscribeBrowserStatus, sendBrowserCommand } from '../api';

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
  { id: 'prism', name: 'ZeroLeak AI', url: PRISM_SIGN_IN_URL, icon: '🛡️', group: 'core' },
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
  /** The streamed panel's own sign-in offer, dismissible for this session. */
  const [showStreamedSignIn, setShowStreamedSignIn] = useState<boolean>(true);

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
   * Sign-in, when the streamed browser is the thing on screen.
   *
   * Prism's page is the only place its own sign-in button lives, and when that
   * button does not open a window there is nothing left to click - the panel's
   * other sign-in controls are hidden while a real browser streams (they
   * describe the iframe path). So the panel drives the sign-in itself: the SAME
   * real browser is sent to the route measured to hand straight over to Google,
   * which writes the session Prism reads, and then back to Prism.
   */
  const streamedSignIn = streamedSignInActions(streamedBrowser.status?.url ?? '');

  const signInInsideStreamedBrowser = useCallback(() => {
    const target = streamedSignIn.signInUrl;
    if (!target) return;
    authLog('Sign-in requested inside the streamed browser', target);
    streamedBrowser.command({ type: 'navigate', url: target });
  }, [streamedBrowser, streamedSignIn.signInUrl]);

  const backToPrismInStreamedBrowser = useCallback(() => {
    const target = streamedSignIn.backUrl;
    if (!target) return;
    authLog('Returning the streamed browser to Prism to pick up the session');
    streamedBrowser.command({ type: 'navigate', url: target });
  }, [streamedBrowser, streamedSignIn.backUrl]);

  /** File Import & Upload State */
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const handleFilesSelected = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setIsUploading(true);
    setUploadNotice(`Uploading ${files.length} file(s) into project...`);
    try {
      const payloadFiles = await Promise.all(
        files.map(async (file) => {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const res = reader.result as string;
              const comma = res.indexOf(',');
              resolve(comma >= 0 ? res.slice(comma + 1) : res);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          const relativePath = (file as any).webkitRelativePath || file.name;
          return {
            name: file.name,
            relativePath,
            type: file.type || 'application/octet-stream',
            base64,
            lastModified: file.lastModified || Date.now(),
          };
        })
      );
      await sendBrowserCommand({
        type: 'upload-files',
        files: payloadFiles,
      });
      setUploadNotice(`✓ Successfully imported ${files.length} file(s) into project`);
      setTimeout(() => setUploadNotice(null), 5000);
    } catch (err: any) {
      console.error('Failed to upload files to browser:', err);
      setUploadNotice(`Upload failed: ${err.message || 'unknown error'}`);
      setTimeout(() => setUploadNotice(null), 5000);
    } finally {
      setIsUploading(false);
    }
  }, []);

  /** Listen for page requesting file/directory chooser from offscreen host */
  const lastNoticeHandledRef = useRef<string | null>(null);
  useEffect(() => {
    const notice = streamedBrowser.status?.notice;
    if (!notice || notice === lastNoticeHandledRef.current) return;
    lastNoticeHandledRef.current = notice;
    if (notice === 'REQUEST_FILE_PICKER') {
      archiveInputRef.current?.click();
    } else if (notice === 'REQUEST_DIRECTORY_PICKER') {
      folderInputRef.current?.click();
    }
  }, [streamedBrowser.status?.notice]);

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
   */
  return createPortal(
    <div
      className={`fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm transition-all ${
        isMaximized ? 'p-0' : 'p-2 sm:p-4'
      }`}
    >
      {/* Hidden File Inputs for Local Client Selection */}
      <input
        ref={archiveInputRef}
        type="file"
        accept=".zip,.tar.gz,.tgz,.tar,.gz,.tex,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFilesSelected(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFilesSelected(e.target.files);
          e.target.value = '';
        }}
      />

      <div
        className={`bg-white border border-slate-200/90 shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ring-1 ring-black/5 ${
          isMaximized ? 'w-full h-full rounded-none border-none' : 'w-full max-w-6xl h-[90vh] max-h-[940px] rounded-2xl'
        }`}
      >
        {/* Browser Top Window Bar */}
        <div className="bg-white border-b border-slate-200 px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3 shrink-0 shadow-2xs">
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#FF5F56] hover:brightness-95 border border-[#E0443E] inline-block cursor-pointer transition-transform hover:scale-105" onClick={onClose} title="Close" />
              <span className="w-3 h-3 rounded-full bg-[#FFBD2E] hover:brightness-95 border border-[#DEA123] inline-block cursor-pointer transition-transform hover:scale-105" onClick={() => setIsMaximized(!isMaximized)} title="Maximize" />
              <span className="w-3 h-3 rounded-full bg-[#27C93F] hover:brightness-95 border border-[#1AAB29] inline-block" />
            </div>
            <div className="flex items-center gap-2 text-slate-900 font-bold text-xs sm:text-sm pl-3 border-l border-slate-200">
              <ZeroLeakLogo variant="icon" imgHeightClass="h-5 w-auto" />
              <span className="hidden sm:inline">ZeroLeak AI — LaTeX & Paper Editor</span>
              <span className="sm:hidden">ZeroLeak AI</span>
              <span className="hidden md:inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Studio
              </span>
            </div>
          </div>

          {/* Browser Navigation & Direct Import Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Navigation buttons */}
            <div className="flex items-center bg-slate-100/90 border border-slate-200 rounded-lg p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => streamedBrowser.command({ type: 'back' })}
                title="Back"
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-all cursor-pointer hover:shadow-2xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => streamedBrowser.command({ type: 'forward' })}
                title="Forward"
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-all cursor-pointer hover:shadow-2xs"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => streamedBrowser.command({ type: 'reload' })}
                title="Reload Page"
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-all cursor-pointer hover:shadow-2xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => streamedBrowser.command({ type: 'navigate', url: 'https://prism.openai.com/' })}
                title="Projects Home"
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-all cursor-pointer hover:shadow-2xs"
              >
                <Home className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Direct Import Archive / Folder Buttons */}
            <button
              type="button"
              onClick={() => archiveInputRef.current?.click()}
              disabled={isUploading}
              title="Import Project Archive (.zip, .tar.gz, .tex)"
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-[11px] sm:text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileArchive className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">Import Archive (.zip)</span>
              <span className="md:hidden">.zip</span>
            </button>

            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              disabled={isUploading}
              title="Import Entire Folder"
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-300 font-semibold text-[11px] sm:text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
            >
              <FolderUp className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden md:inline">Import Folder</span>
              <span className="md:hidden">Folder</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Status indicator */}
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-600 shadow-2xs">
              <span className={`w-2 h-2 rounded-full ${streamedBrowser.ready ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>{streamedBrowser.ready ? 'Live Browser' : 'Connecting...'}</span>
            </div>

            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? 'Restore' : 'Maximize'}
              className="p-1.5 sm:p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer"
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              title="Close Browser"
              className="p-1.5 sm:p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Web Viewport Area with Drag & Drop */}
        <div
          className="flex-1 w-full bg-[#F8FAFC] overflow-hidden flex flex-col relative"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              void handleFilesSelected(e.dataTransfer.files);
            }
          }}
        >
          {isDragOver && (
            <div className="absolute inset-0 z-30 bg-white/95 backdrop-blur-xs border-2 border-dashed border-emerald-500 flex flex-col items-center justify-center text-slate-800 pointer-events-none p-6 text-center animate-in fade-in shadow-2xl">
              <Upload className="w-12 h-12 text-emerald-600 animate-bounce mb-3" />
              <h3 className="text-lg font-bold text-slate-900">Drop Project Archive (.zip, .tar.gz) or Folder here</h3>
              <p className="text-sm text-slate-600 mt-1">Files will be imported directly into your ZeroLeak AI project</p>
            </div>
          )}

          {uploadNotice && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 bg-white text-slate-900 border border-emerald-300 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ring-1 ring-emerald-500/10">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{uploadNotice}</span>
            </div>
          )}

          <div className="relative flex-1 w-full overflow-hidden flex flex-col">
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
              chrome={false}
            />

            {downloadNotice && (
              <div className="pointer-events-none absolute bottom-3 right-3 z-20 max-w-lg rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-[11px] text-slate-700 shadow-lg">
                {downloadNotice}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

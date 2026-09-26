import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from 'lucide-react';

import {
  sendBrowserCommand,
  type StreamedBrowserCommand,
  type StreamedBrowserStatus,
} from '../../api';
import { StreamedBrowserSurface } from './StreamedBrowserSurface';
import { PANE_PARTITION, PANE_SANDBOX_FLAGS } from '../../utils/prismAuth';
import {
  MAX_TABS,
  NEW_TAB_URL,
  activeTabOf,
  closeTab,
  commitNavigation,
  createTab,
  cycleTab,
  displayUrl,
  normalizeAddress,
  openTab,
  stepHistory,
  updateTab,
  type BrowserTab,
} from '../../utils/browserTabs';

/**
 * A tabbed browser that behaves like Chrome, embedded in a panel.
 *
 * Two environments, one UI:
 *
 *   - In the desktop shell each tab is a `<webview>`: a REAL top-level browsing
 *     context with its own cookie jar, pinned to one persistent partition. That
 *     is what makes OAuth work here and stay signed in - Google and OpenAI send
 *     `X-Frame-Options` that forbid framing, which is exactly why the plain
 *     iframe path always fails with `openai-provider-validation-failed`.
 *   - In an ordinary browser tab each tab is an `<iframe>`: shared cookies, no
 *     OAuth, and no `contentWindow.history` across origins. Back/Forward then
 *     come from the tab's own history stack in `browserTabs.ts`.
 *
 * Everything user-visible - back/forward/reload/home, the omnibox deciding
 * address vs search, the tab strip, the new-tab page, Ctrl+T/W/L/R/Tab - is
 * driven by the pure logic in `browserTabs.ts` so it can be tested without a
 * browser in the loop.
 */

export interface BrowserBookmark {
  id: string;
  name: string;
  url: string;
  /** Emoji or short label shown on the new-tab grid. */
  icon?: string;
  /** Which row of the bookmarks bar it belongs to. */
  group: 'core' | 'ai';
  /** AI tools only: the model behind it, shown as a tooltip. */
  model?: string;
  /** AI tools only: why it needs no API key. */
  keylessBasis?: string;
  /** AI tools only: the live probe's verdict, when one has run. */
  liveNote?: string;
  /** AI tools only: 'editor' or 'model'. */
  badge?: string;
  /** True when the host refuses to be framed, so opening a tab is the only way. */
  embedBlocked?: boolean;
  /** The live probe's verdict, drawn as the status dot: never guessed. */
  status?: 'ok' | 'asleep' | 'down' | 'unknown';
}

const STATUS_DOT: Record<NonNullable<BrowserBookmark['status']>, string> = {
  ok: 'bg-emerald-400',
  asleep: 'bg-amber-400',
  down: 'bg-rose-400',
  unknown: 'bg-slate-500',
};

/** Controls the parent needs from the active pane, when the pane has any. */
export interface PaneHandle {
  goBack(): void;
  goForward(): void;
  reload(): void;
}

interface PaneStatus {
  onStart: () => void;
  onStop: () => void;
  onTitle: (title: string) => void;
  onUrl: (url: string) => void;
  onFail: (message: string) => void;
}

/** Call a webview method that throws until the guest has attached. */
const safeCall = (view: any, method: string) => {
  try {
    if (view && typeof view[method] === 'function') view[method]();
  } catch {
    /* the guest is not attached yet, or is already gone */
  }
};

/**
 * One tab's pane.
 *
 * The `<webview>` is created imperatively on purpose: Electron reads
 * `allowpopups` when the guest is created, so every attribute must be set before
 * the element is inserted - declaring it in JSX left the attribute in the DOM
 * but not in effect, and Prism's sign-in popup was refused because of it.
 */
const BrowserPane = React.forwardRef<
  PaneHandle,
  {
    tab: BrowserTab;
    visible: boolean;
    desktopShell: boolean;
    status: PaneStatus;
    /** Render a real browser's stream instead of a frame. */
    streamed: boolean;
    onStreamedUrl?: (url: string) => void;
    onStreamedTitle?: (title: string) => void;
    onStreamedStatus?: (status: StreamedBrowserStatus | null) => void;
  }
>(({ tab, visible, desktopShell, status, streamed, onStreamedUrl, onStreamedTitle, onStreamedStatus }, ref) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);
  const [frameKey, setFrameKey] = useState(0);

  /**
   * The latest status callbacks, held in a ref on purpose.
   *
   * The host rebuilds these on every render, so putting them in the guest
   * effect's dependency list would tear the `<webview>` down and build a new one
   * each time - every page load would restart. A ref keeps the guest's lifetime
   * tied to its tab, not to a render.
   */
  const statusRef = useRef(status);
  statusRef.current = status;

  useImperativeHandle(
    ref,
    () => ({
      goBack: () => safeCall(viewRef.current, 'goBack'),
      goForward: () => safeCall(viewRef.current, 'goForward'),
      reload: () => {
        if (desktopShell) safeCall(viewRef.current, 'reload');
        else setFrameKey(prev => prev + 1);
      },
    }),
    [desktopShell],
  );

  /** The streamed browser's own frame, or null while it is not ready. */
  const streamedReady = streamed && visible;

  // Create the guest once per tab and wire its events. Switching tabs must not
  // recreate it, or every switch would lose the page's state and scroll.
  useEffect(() => {
    if (!desktopShell || streamedReady) return undefined;
    const host = hostRef.current;
    if (!host) return undefined;

    const view = document.createElement('webview');
    view.setAttribute('partition', PANE_PARTITION);
    view.setAttribute('allowpopups', 'true');
    view.setAttribute('src', tab.url || NEW_TAB_URL);
    view.setAttribute('title', `ZeroLeak tab ${tab.id}`);
    view.style.cssText = 'width:100%;height:100%;border:0;background:#fff;display:flex';
    host.appendChild(view);
    viewRef.current = view;

    const onStart = () => statusRef.current.onStart();
    const onStop = () => statusRef.current.onStop();
    const onTitle = (event: any) => statusRef.current.onTitle(String(event?.title ?? ''));
    const onNavigate = (event: any) => statusRef.current.onUrl(String(event?.url ?? ''));
    const onFail = (event: any) => {
      if (event?.isMainFrame === false) return;
      statusRef.current.onFail(String(event?.errorDescription ?? 'the page could not be loaded'));
    };

    view.addEventListener('did-start-loading', onStart);
    view.addEventListener('did-stop-loading', onStop);
    view.addEventListener('page-title-updated', onTitle);
    view.addEventListener('did-navigate', onNavigate);
    view.addEventListener('did-navigate-in-page', onNavigate);
    view.addEventListener('did-fail-load', onFail);

    return () => {
      view.removeEventListener('did-start-loading', onStart);
      view.removeEventListener('did-stop-loading', onStop);
      view.removeEventListener('page-title-updated', onTitle);
      view.removeEventListener('did-navigate', onNavigate);
      view.removeEventListener('did-navigate-in-page', onNavigate);
      view.removeEventListener('did-fail-load', onFail);
      try {
        host.removeChild(view);
      } catch {
        /* already detached */
      }
      if (viewRef.current === view) viewRef.current = null;
    };
  }, [desktopShell, streamedReady, tab.id]);

  // Navigate an existing guest when the address changes. Skipped when the pane
  // already reports that URL, or the page's own navigation would echo back.
  useEffect(() => {
    const view = viewRef.current;
    if (!desktopShell || streamedReady || !view || !tab.url || tab.url === NEW_TAB_URL) return;
    try {
      const current = typeof view.getURL === 'function' ? view.getURL() : '';
      if (current === tab.url) return;
      view.loadURL(tab.url);
    } catch {
      /* not attached yet; the src attribute already covers the first load */
    }
  }, [desktopShell, streamedReady, tab.url]);

  // An explicit reload request, which for a guest is its own method.
  useEffect(() => {
    if (!desktopShell || streamedReady || tab.reloadKey === 0) return;
    safeCall(viewRef.current, 'reload');
  }, [desktopShell, streamedReady, tab.reloadKey]);

  // Focus the guest when its tab becomes the visible one. The shell answers
  // "which pane is the user looking at?" from focus, and that answer drives both
  // sign-in diagnosis and which tabs reload after signing in - so it has to
  // follow the tab strip, not attach order.
  useEffect(() => {
    if (!desktopShell || !visible) return;
    safeCall(viewRef.current, 'focus');
  }, [desktopShell, visible]);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      // Inactive tabs stay mounted so their page, scroll position and session
      // survive a switch. `invisible` keeps them out of the way without
      // unmounting the guest.
      style={{ visibility: visible ? 'visible' : 'hidden' }}
    >
      {streamedReady && (
        // A real browser, streamed in. Nothing to frame, so nothing can refuse
        // to be framed - which is what makes a sign-in possible here at all.
        <StreamedBrowserSurface
          url={tab.url}
          visible={visible}
          reloadKey={tab.reloadKey}
          onUrl={onStreamedUrl}
          onTitle={onStreamedTitle}
          onStatus={onStreamedStatus}
        />
      )}

      {!desktopShell && !streamed && (
        <iframe
          key={`${tab.id}:${tab.reloadKey}:${frameKey}`}
          src={tab.url || NEW_TAB_URL}
          title={`ZeroLeak tab ${tab.id}`}
          className="w-full h-full border-0 bg-white"
          onLoad={() => {
            statusRef.current.onStop();
            statusRef.current.onTitle('');
          }}
          allow="clipboard-write; clipboard-read; camera; microphone; fullscreen; display-capture; geolocation"
          sandbox={PANE_SANDBOX_FLAGS}
        />
      )}
    </div>
  );
});
BrowserPane.displayName = 'BrowserPane';

/**
 * Navigation rules, supplied by the backend.
 *
 * These are not preferences: each is a fact about the outside world (which
 * search engine allows being framed, which hosts refuse it) or a security
 * decision (which schemes are refused). The backend owns them so a measurement
 * taken in one place cannot disagree with behaviour everywhere else.
 */
export interface BrowserPolicy {
  searchTemplate: string;
  searchHost: string;
  searchEmbeds: boolean;
  maxTabs: number;
  /** Hosts measured to refuse framing, so a click cannot land on a blank pane. */
  framePolicy: Array<{ host: string; embeddable: boolean; evidence: string }>;
}

export interface ChromeLikeBrowserProps {
  desktopShell: boolean;
  initialUrl: string;
  bookmarks: BrowserBookmark[];
  /** From `GET /api/browser/config`. Absent means the local defaults are used. */
  policy?: BrowserPolicy;
  /** Rendered between the bookmarks bar and the panes: the host's status strips. */
  topSlot?: React.ReactNode;
  /** The active tab's committed URL changed. */
  onActiveUrlChange?: (url: string) => void;
  /** The active tab navigated, whoever asked for it. */
  onNavigate?: (url: string) => void;
  /**
   * Last say on a navigation. Return a reason to refuse it - the browser shows
   * the reason as its notice and does not move. Used to route provider sign-in
   * screens to a top-level window, which a frame can never host.
   */
  beforeNavigate?: (url: string) => string | null;
  /** Bumped by the host to reload the active tab, e.g. after signing in. */
  reloadSignal?: number;
  /** Extra controls in the toolbar, e.g. "Sign In Window". */
  toolbarExtra?: React.ReactNode;
  /** Rendered when a bookmark refuses framing, instead of a blank pane. */
  onOpenExternal: (url: string) => void;
  /**
   * A real browser is streamed in, so the panel is no longer a frame.
   *
   * This changes three behaviours at once, and they all follow from the same
   * fact: a streamed page is permitted everywhere a framed one is not. Navigation
   * stops routing to a real tab, the back/forward/reload buttons drive the real
   * browser, and the address bar follows the page instead of the other way round.
   */
  streamed?: boolean;
  /** What the streamed browser reports about itself (history, loading). */
  streamedStatus?: StreamedBrowserStatus | null;
  /**
   * Draw the browser's own furniture: tabs, address bar and bookmark bar.
   *
   * False shows the page alone, which is what the Prism panel wants - it is an
   * editor view, not a browser to browse in. Defaults to true so nothing else
   * changes shape.
   */
  chrome?: boolean;
}

export const ChromeLikeBrowser: React.FC<ChromeLikeBrowserProps> = ({
  desktopShell,
  initialUrl,
  bookmarks,
  policy,
  topSlot,
  onActiveUrlChange,
  onNavigate,
  beforeNavigate,
  reloadSignal,
  toolbarExtra,
  onOpenExternal,
  streamed = false,
  streamedStatus,
  chrome = true,
}) => {
  const [tabs, setTabs] = useState<BrowserTab[]>(() => [createTab(initialUrl)]);
  const [activeId, setActiveId] = useState<string>(() => '');
  const [omnibox, setOmnibox] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);
  const [focusOmnibox, setFocusOmnibox] = useState(false);

  const paneHandles = useRef<Map<string, PaneHandle>>(new Map());
  const omniboxRef = useRef<HTMLInputElement>(null);

  // The first tab's id is only knowable after creation, so adopt it here rather
  // than inventing an id in two places.
  useEffect(() => {
    if (!activeId && tabs.length > 0) setActiveId(tabs[0].id);
  }, [activeId, tabs]);

  const activeTab = activeTabOf(tabs, activeId);
  const activeUrl = activeTab?.url ?? NEW_TAB_URL;

  // Keep the address bar in step with the tab the user is actually looking at.
  useEffect(() => {
    setOmnibox(activeTab ? displayUrl(activeTab.url) : '');
  }, [activeTab?.id, activeTab?.url, activeTab]);

  useEffect(() => {
    onActiveUrlChange?.(activeUrl);
  }, [activeUrl, onActiveUrlChange]);

  const patchTab = useCallback((id: string, change: (tab: BrowserTab) => BrowserTab) => {
    setTabs(current => updateTab(current, id, change));
  }, []);

  /**
   * The status handlers for one tab, rebuilt per render but read through a ref
   * inside the pane, so their identity never affects the guest's lifetime.
   */
  const statusFor = useCallback(
    (id: string): PaneStatus => ({
      onStart: () => patchTab(id, tab => (tab.isLoading ? tab : { ...tab, isLoading: true })),
      onStop: () => patchTab(id, tab => (tab.isLoading ? { ...tab, isLoading: false } : tab)),
      onTitle: title => patchTab(id, tab => (title && title !== tab.title ? { ...tab, title } : tab)),
      onUrl: url =>
        patchTab(id, tab => {
          if (!url || url === tab.url) return tab;
          // The page navigated itself (a link, a redirect). Treat it as a
          // navigation so Back still works, but never clear the address bar.
          return { ...commitNavigation(tab, url), isLoading: false };
        }),
      onFail: message =>
        patchTab(id, tab => (tab.error === message ? tab : { ...tab, isLoading: false, error: message })),
    }),
    [patchTab],
  );

  /**
   * Would this host render as an empty rectangle?
   *
   * The backend records which hosts refuse framing and the header that proves it,
   * so the browser can open a real tab instead of showing a blank pane the user
   * would reasonably read as a crash.
   */
  const hostRefusesFraming = useCallback(
    (url: string): boolean => {
      let host = '';
      try {
        host = new URL(url).hostname.toLowerCase();
      } catch {
        return false;
      }
      const records = policy?.framePolicy ?? [];
      const verdict =
        records.find(record => record.host === host) ??
        records.find(record => host.endsWith(`.${record.host}`));
      return verdict ? verdict.embeddable === false : false;
    },
    [policy],
  );

  /**
   * A search the configured engine cannot show inside a frame is not a search we
   * can run here, so it opens where it can actually be read.
   */
  const searchOpensExternally = !desktopShell && policy?.searchEmbeds === false;

  const go = useCallback(
    (raw: string) => {
      const resolved = normalizeAddress(raw, policy?.searchTemplate);
      if (!resolved) return;

      if (resolved.kind === 'blocked') {
        setNotice(resolved.reason);
        return;
      }

      // A streamed browser is a real top-level context, so the framing rules
      // that send these elsewhere simply do not apply to it.
      if (streamed) {
        setNotice(null);
        onNavigate?.(resolved.url);
        void sendBrowserCommand({ type: 'navigate', url: resolved.url }).catch(() => undefined);
        patchTab(activeId, tab => commitNavigation(tab, resolved.url));
        return;
      }

      if (resolved.kind === 'search' && searchOpensExternally) {
        setNotice(
          `${policy?.searchHost ?? 'The search engine'} refuses to be embedded, so the results opened in a real tab.`,
        );
        onOpenExternal(resolved.url);
        return;
      }

      if (hostRefusesFraming(resolved.url)) {
        setNotice(`${resolved.url} refuses to be embedded, so it opened in a real browser tab.`);
        onOpenExternal(resolved.url);
        return;
      }

      // The host gets the last word: some addresses must not load in a tab at
      // all, and only the host knows which.
      const refusal = beforeNavigate?.(resolved.url);
      if (refusal) {
        setNotice(refusal);
        return;
      }

      setNotice(null);
      onNavigate?.(resolved.url);
      patchTab(activeId, tab => commitNavigation(tab, resolved.url));
    },
    [activeId, beforeNavigate, hostRefusesFraming, onNavigate, onOpenExternal, patchTab, policy, searchOpensExternally, streamed],
  );

  // NOTE: every tab operation is computed from the render's own `tabs` and then
  // committed with plain values. Doing the work inside a `setTabs(updater)` also
  // called `setActiveId` from within the render phase, which React drops - the
  // + button looked alive and opened nothing.
  const openNewTab = useCallback(
    (url: string = NEW_TAB_URL) => {
      const result = openTab(tabs, url, policy?.maxTabs ?? MAX_TABS);
      if (result.rejected) {
        setNotice(result.rejected);
        return;
      }
      setTabs(result.tabs);
      setActiveId(result.activeId);
      setNotice(null);
    },
    [policy, tabs],
  );

  const closeOne = useCallback(
    (id: string) => {
      paneHandles.current.delete(id);
      const result = closeTab(tabs, activeId, id);

      // Chrome never leaves a window with zero tabs; the last close becomes a
      // fresh blank one rather than an empty strip.
      if (result.tabs.length === 0) {
        const fresh = createTab();
        setTabs([fresh]);
        setActiveId(fresh.id);
        return;
      }

      setTabs(result.tabs);
      setActiveId(result.activeId);
    },
    [activeId, tabs],
  );

  // The streamed browser owns its own history, so it is asked to move rather
  // than the tab's local history being stepped: pretending to navigate while the
  // picture stays put is exactly the kind of lie this panel must not tell.
  const steerStreamed = useCallback((command: StreamedBrowserCommand) => {
    void sendBrowserCommand(command).catch(() => undefined);
  }, []);

  const navigateBack = useCallback(() => {
    if (streamed) {
      steerStreamed({ type: 'back' });
      return;
    }
    const handle = paneHandles.current.get(activeId);
    if (desktopShell && handle) {
      handle.goBack();
      return;
    }
    patchTab(activeId, tab => stepHistory(tab, -1));
  }, [activeId, desktopShell, patchTab, steerStreamed, streamed]);

  const navigateForward = useCallback(() => {
    if (streamed) {
      steerStreamed({ type: 'forward' });
      return;
    }
    const handle = paneHandles.current.get(activeId);
    if (desktopShell && handle) {
      handle.goForward();
      return;
    }
    patchTab(activeId, tab => stepHistory(tab, 1));
  }, [activeId, desktopShell, patchTab, steerStreamed, streamed]);

  const reload = useCallback(() => {
    setNotice(null);
    if (streamed) {
      steerStreamed({ type: 'reload' });
      return;
    }
    const handle = paneHandles.current.get(activeId);
    if (handle) handle.reload();
    else patchTab(activeId, tab => commitNavigation(tab, tab.url));
  }, [activeId, patchTab, steerStreamed, streamed]);

  const openBookmark = useCallback(
    (bookmark: BrowserBookmark) => {
      // A streamed browser is not a frame, so a bookmark it can render is simply
      // opened - including every host the framing table exists to avoid.
      if (streamed) {
        go(bookmark.url);
        return;
      }
      // Either the catalogue said so, or the measured frame policy did. Both mean
      // a tab here would be empty, so it opens where it can be read.
      if (bookmark.embedBlocked || hostRefusesFraming(bookmark.url)) {
        setNotice(`${bookmark.name} refuses to be embedded - opened in a real tab instead.`);
        onOpenExternal(bookmark.url);
        return;
      }
      if (activeTab?.url === NEW_TAB_URL || !activeTab) {
        go(bookmark.url);
        return;
      }
      openNewTab(bookmark.url);
    },
    [activeTab, go, hostRefusesFraming, onOpenExternal, openNewTab, streamed],
  );

  // A host-requested reload ("Load Prism here"), routed through a ref so the
  // effect does not depend on the reload callback's identity.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    if (!reloadSignal) return;
    reloadRef.current();
  }, [reloadSignal]);

  // Chrome's keyboard shortcuts, minus the ones that would fight the host app.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;

      const key = event.key.toLowerCase();
      if (key === 't') {
        event.preventDefault();
        openNewTab();
      } else if (key === 'w') {
        event.preventDefault();
        closeOne(activeId);
      } else if (key === 'l') {
        event.preventDefault();
        omniboxRef.current?.focus();
        omniboxRef.current?.select();
      } else if (key === 'r') {
        event.preventDefault();
        reload();
      } else if (key === 'tab') {
        event.preventDefault();
        setActiveId(current => cycleTab(tabs, current, event.shiftKey ? -1 : 1));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeId, closeOne, openNewTab, reload, tabs]);

  const canBack = streamed
    ? Boolean(streamedStatus?.canGoBack)
    : desktopShell
      ? true
      : Boolean(activeTab && activeTab.historyIndex > 0);
  const canForward = streamed
    ? Boolean(streamedStatus?.canGoForward)
    : desktopShell
      ? true
      : Boolean(activeTab && activeTab.historyIndex < activeTab.history.length - 1);

  // The streamed browser is the source of truth for the tab showing it. A
  // redirect - an OAuth callback above all - changes the address bar, never the
  // other way round.
  useEffect(() => {
    if (!streamed || !streamedStatus) return;
    const live = streamedStatus.url;
    const title = streamedStatus.title || undefined;
    const loading = streamedStatus.loading;
    setTabs(current =>
      updateTab(current, activeId, tab => {
        // Nothing changed means the same object, so this cannot become a render
        // loop driven by a status poll.
        if (tab.url === live && tab.isLoading === loading && (!title || tab.title === title)) return tab;
        return { ...tab, url: live || tab.url, title: title ?? tab.title, isLoading: loading };
      }),
    );
  }, [activeId, streamed, streamedStatus]);

  const coreBookmarks = bookmarks.filter(b => b.group === 'core');
  const aiBookmarks = bookmarks.filter(b => b.group === 'ai');
  const isBlank = activeUrl === NEW_TAB_URL;

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full bg-slate-950">
      {/*
       * Browser chrome - the tab strip, address bar, navigation and bookmark bar.
       *
       * The Prism panel turns it off: its whole point is the editor, and a strip of
       * tabs and a URL in front of it is furniture the user asked to stop seeing.
       * Nothing behind it changes - the streamed browser is still running, still
       * drawing into this component, and still steered by the input events the
       * page area sends.
       */}
      {chrome && (
        <>
      {/* Tab strip, address bar and navigation, in Chrome's order. */}
      <div className="bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-end gap-1 px-3 pt-2 overflow-x-auto">
          {tabs.map(tab => {
            const isActive = tab.id === activeId;
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveId(tab.id)}
                title={tab.title}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-xl max-w-[220px] min-w-[120px] cursor-pointer border-t border-x transition-all ${
                  isActive
                    ? 'bg-slate-950 border-slate-700 text-white'
                    : 'bg-slate-800/60 border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {tab.isLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin text-emerald-400 shrink-0" />
                ) : (
                  <Globe className="w-3 h-3 shrink-0 text-slate-500" />
                )}
                <span className="text-[11px] truncate flex-1">{tab.title || 'New Tab'}</span>
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation();
                    closeOne(tab.id);
                  }}
                  title="Close tab"
                  className="p-0.5 rounded hover:bg-slate-700/80 text-slate-500 hover:text-rose-300 shrink-0 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => openNewTab()}
            title={`New tab (Ctrl+T) - ${tabs.length}/${policy?.maxTabs ?? MAX_TABS}`}
            disabled={tabs.length >= (policy?.maxTabs ?? MAX_TABS)}
            className="mb-1 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <form
          onSubmit={event => {
            event.preventDefault();
            go(omnibox);
          }}
          className="flex items-center gap-2 px-3 py-2"
        >
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={navigateBack}
              disabled={!canBack}
              title="Back (Alt+Left)"
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={navigateForward}
              disabled={!canForward}
              title="Forward (Alt+Right)"
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-all cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={reload}
              title="Reload (Ctrl+R)"
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${activeTab?.isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>

          <div className="flex-1 flex items-center gap-2 bg-slate-950 border border-slate-700/80 rounded-full px-3 py-1.5 text-xs text-slate-200 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/40 transition-all min-w-0">
            {isBlank ? (
              <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
            <input
              ref={omniboxRef}
              type="text"
              value={omnibox}
              onFocus={() => setFocusOmnibox(true)}
              onBlur={() => setFocusOmnibox(false)}
              onChange={event => setOmnibox(event.target.value)}
              placeholder={`Search ${policy?.searchHost ?? 'the web'} or type a URL`}
              spellCheck={false}
              className="w-full bg-transparent outline-none text-slate-100 placeholder-slate-500 text-xs"
            />
            {omnibox && (
              <button
                type="button"
                onClick={() => {
                  setOmnibox('');
                  omniboxRef.current?.focus();
                }}
                title="Clear"
                className="text-slate-500 hover:text-slate-300 shrink-0 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {toolbarExtra}

          <button
            type="button"
            onClick={() => onOpenExternal(activeUrl)}
            title="Open this page in a real browser tab"
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer flex items-center gap-1 text-xs shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden md:inline">New Tab</span>
          </button>
        </form>
      </div>

      {/* Bookmarks bar: the core set, then the key-free AI tools. */}
      <div className="bg-slate-950/70 border-b border-slate-800/80 px-3 py-1.5 flex items-center gap-2 overflow-x-auto text-xs shrink-0">
        <Star className="w-3 h-3 text-slate-500 shrink-0" />
        {coreBookmarks.map(bookmark => (
          <button
            key={bookmark.id}
            type="button"
            onClick={() => openBookmark(bookmark)}
            title={bookmark.url}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shrink-0 border ${
              activeUrl === bookmark.url
                ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/40 shadow-sm'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-800'
            }`}
          >
            <span>{bookmark.icon}</span>
            <span>{bookmark.name}</span>
          </button>
        ))}

        {/*
         * The AI-tool group, only when there is one.
         *
         * The bar now carries Prism alone, and a label with nothing after it - or
         * its divider - reads as a loading state rather than an empty group.
         */}
        {aiBookmarks.length > 0 && (
          <>
            <span className="w-px h-4 bg-slate-700 shrink-0" />
            <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1 shrink-0">
              <Sparkles className="w-3 h-3" /> Free AI, no API key:
            </span>
          </>
        )}
        {aiBookmarks.map(bookmark => (
          <button
            key={bookmark.id}
            type="button"
            onClick={() => openBookmark(bookmark)}
            title={[bookmark.model && `AI: ${bookmark.model}`, bookmark.keylessBasis, bookmark.liveNote]
              .filter(Boolean)
              .join('\n')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shrink-0 border ${
              activeUrl === bookmark.url
                ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/40 shadow-sm'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-800'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[bookmark.status ?? 'unknown']}`}
            />
            <span>{bookmark.icon}</span>
            <span>{bookmark.name}</span>
            {bookmark.badge && (
              <span className="text-[9px] font-mono px-1 rounded bg-emerald-950/70 text-emerald-300/90 border border-emerald-900/60">
                {bookmark.badge}
              </span>
            )}
          </button>
        ))}

        <span className="hidden xl:inline text-[11px] text-slate-500 shrink-0">
          {/* The engine is whatever the server MEASURED as frameable - Google
              refuses framing, so it is not Google, and saying otherwise was a
              claim the policy contradicts. */}
          Bookmarks open in a new tab; the address bar searches{' '}
          {policy?.searchHost?.replace(/^www\./, '') ?? 'the configured engine'}.
        </span>
      </div>
        </>
      )}

        {notice && (
          <div className="bg-amber-950/50 border-b border-amber-800/50 px-3 py-1 text-[11px] text-amber-200 shrink-0 flex items-center justify-between gap-3">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-amber-300 hover:text-white cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {topSlot}

      {/* Panes. Every tab stays mounted so switching keeps its page and session. */}
      <div className="relative flex-1 w-full overflow-hidden bg-slate-950">
        {tabs.map(tab => (
          <BrowserPane
            key={tab.id}
            ref={handle => {
              if (handle) paneHandles.current.set(tab.id, handle);
              else paneHandles.current.delete(tab.id);
            }}
            tab={tab}
            visible={tab.id === activeId && !isBlank}
            desktopShell={desktopShell}
            status={statusFor(tab.id)}
            // Only the tab the user is looking at streams: one real browser is
            // one page, so the visible tab is the one it is showing.
            streamed={streamed}
            onStreamedUrl={onActiveUrlChange}
            onStreamedTitle={title => setTabs(current => updateTab(current, tab.id, t => ({ ...t, title })))}
          />
        ))}

        {/* Chrome's new-tab page, drawn by us because the pane refuses to load
            anything but https and about:blank. */}
        {isBlank && (
          <div className="absolute inset-0 overflow-y-auto bg-slate-950">
            <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
              <div className="text-center space-y-1">
                <p className="text-2xl font-bold text-white tracking-tight">New Tab</p>
                <p className="text-xs text-slate-400">
                  Google Prism, image-to-LaTeX models and the LaTeX reference, all one click away.
                </p>
              </div>

              <form
                onSubmit={event => {
                  event.preventDefault();
                  go(omnibox);
                }}
                className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-full px-4 py-2.5 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/40"
              >
                <Search className="w-4 h-4 text-slate-500 shrink-0" />
                <input
                  type="text"
                  value={omnibox}
                  onChange={event => setOmnibox(event.target.value)}
                  placeholder={`Search ${policy?.searchHost ?? 'the web'} or type a URL`}
                  spellCheck={false}
                  className="w-full bg-transparent outline-none text-sm text-slate-100 placeholder-slate-500"
                />
              </form>

              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Shortcuts</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {bookmarks.map(bookmark => (
                    <button
                      key={bookmark.id}
                      type="button"
                      onClick={() => openBookmark(bookmark)}
                      title={bookmark.url}
                      className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-emerald-700/60 text-left transition-all cursor-pointer"
                    >
                      <span className="text-lg leading-none">{bookmark.icon ?? '🌐'}</span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-slate-200 truncate">{bookmark.name}</span>
                        <span className="block text-[10px] text-slate-500 truncate">
                          {bookmark.group === 'ai' ? 'Free AI · no API key' : new URL(bookmark.url).hostname}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {!desktopShell && (
                <div className="rounded-xl border border-amber-800/50 bg-amber-950/40 p-3 text-[11px] text-amber-200 space-y-1">
                  <p className="font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> This is browser mode
                  </p>
                  <p>
                    The panel is an iframe in an ordinary tab, so each tab shares this page&apos;s cookies and
                    Prism&apos;s sign-in cannot complete - Google and OpenAI forbid framing. Run{' '}
                    <code className="font-mono text-amber-100">npm run desktop</code> for real tabs, each with its own
                    session, where sign-in works and survives restarts.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab?.error && !isBlank && (
          <div className="absolute bottom-3 left-3 right-3 rounded-xl border border-rose-800/60 bg-rose-950/80 px-3 py-2 text-[11px] text-rose-100">
            <span className="font-semibold">This tab could not load.</span> {activeTab.error}
          </div>
        )}


      </div>
    </div>
  );
};

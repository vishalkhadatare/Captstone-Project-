/**
 * Tab, history and omnibox logic for the in-project browser.
 *
 * Chrome's visible behaviour reduces to a few rules, and every one of them is a
 * pure function - so they live here, tested, instead of being re-derived inside
 * JSX where they cannot be checked:
 *
 *   1. The omnibox decides between "that is an address" and "that is a search".
 *      Chrome resolves this by shape, not by asking: text with a space is a
 *      search, `example.com` is an address.
 *   2. Navigating from a tab discards that tab's forward history.
 *   3. Closing the active tab activates its right-hand neighbour, or its left
 *      neighbour when it was last - never "no tab".
 *
 * The history stack is kept here rather than read from the pane because a
 * cross-origin iframe will not answer `contentWindow.history`, and browser mode
 * would otherwise have no Back button at all. In the desktop shell the guest
 * does report `canGoBack()`/`canGoForward()`, and those win when present.
 */

export interface BrowserTab {
  id: string;
  /** The committed address. */
  url: string;
  /** What the address bar shows, which the user edits freely. */
  input: string;
  /** The page's own title once it has one, else the host. */
  title: string;
  isLoading: boolean;
  /** Whether the active pane reported a load failure. */
  error?: string;
  /**
   * Ask the pane to reload: bumped to force a fresh element, because neither an
   * iframe nor a webview reloads by being handed the same URL again.
   */
  reloadKey: number;
  /** Per-tab back/forward stack; see the note above. */
  history: string[];
  historyIndex: number;
}

/** Chrome's new-tab page. Here it is rendered by us, so the pane stays blank. */
export const NEW_TAB_URL = 'about:blank';

/** No tab limit exists in Chrome; a dozen is plenty for a research sidebar. */
export const MAX_TABS = 12;

/**
 * Google, to match Chrome. A constant rather than an inline string so swapping
 * to a privacy-preserving engine (or a self-hosted one) is a one-line change.
 */
export const SEARCH_TEMPLATE = 'https://www.google.com/search?q={query}';

/** Loopback may be plain http, exactly as `electron/panePolicy.cjs` allows. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1']);

/** Schemes this browser will load. `javascript:` and `data:` are never among them. */
const ALLOWED_SCHEMES = new Set(['https:', 'http:']);

/**
 * Schemes that are never opened in a pane, each for a concrete reason.
 *
 * Refusing them by name is the point: text pasted from a chat must not become a
 * search query that a search engine is then asked to interpret, and `data:` and
 * `view-source:` are classic frame-escape vectors.
 */
const REFUSED_SCHEMES = new Set([
  'javascript:',
  'data:',
  'file:',
  'blob:',
  'view-source:',
  'chrome:',
  'mailto:',
  'tel:',
]);

export type AddressKind = 'address' | 'search' | 'blocked';

export interface AddressResolution {
  kind: AddressKind;
  /** The URL to load for an address, or the search URL for a search. */
  url: string;
  /** The bare query, for a search. */
  query?: string;
  /** Why it resolved the way it did - shown when it was blocked. */
  reason: string;
}

let tabCounter = 0;

/** A stable unique id. Not random: readable ids make test failures legible. */
export function nextTabId(prefix = 'tab'): string {
  tabCounter += 1;
  return `${prefix}-${tabCounter}`;
}

/** Chrome shows nothing in the bar for a new tab, not "about:blank". */
export function displayUrl(url: string): string {
  return url === NEW_TAB_URL ? '' : url;
}

/** Chrome labels a tab by host until the page reports a real title. */
export function titleForUrl(url: string): string {
  if (!url || url === NEW_TAB_URL) return 'New Tab';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function createTab(url: string = NEW_TAB_URL, id: string = nextTabId()): BrowserTab {
  return {
    id,
    url,
    input: displayUrl(url),
    title: titleForUrl(url),
    isLoading: url !== NEW_TAB_URL,
    reloadKey: 0,
    history: url === NEW_TAB_URL ? [] : [url],
    historyIndex: url === NEW_TAB_URL ? -1 : 0,
  };
}

/** The search URL for a query, using `{query}` as the substitution point. */
export function buildSearchUrl(query: string, template: string = SEARCH_TEMPLATE): string {
  const encoded = encodeURIComponent(query.trim());
  return template.includes('{query}')
    ? template.replace('{query}', encoded)
    : `${template}${encoded}`;
}

const HOST_LIKE = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+(:\d+)?([/?#].*)?$/i;
const LOOPBACK_LIKE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?([/?#].*)?$/i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#].*)?$/;

/**
 * Resolve what the user typed, the way Chrome's omnibox does.
 *
 * The order matters. An explicit scheme is honoured (or refused) before any
 * shape guessing, so `javascript:alert(1)` is reported as refused rather than
 * quietly handed to a search engine, and `https://x` never becomes a query.
 */
export function normalizeAddress(raw: string, searchTemplate: string = SEARCH_TEMPLATE): AddressResolution | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;

  const schemeMatch = /^([a-z][a-z0-9+.-]*):(.*)$/i.exec(value);
  if (schemeMatch) {
    const protocol = `${schemeMatch[1].toLowerCase()}:`;
    const remainder = schemeMatch[2];

    // `localhost:3000` reads as scheme "localhost" to the pattern above, but a
    // numeric remainder is a PORT - the single ambiguity that matters most here,
    // because the dev server is exactly that shape.
    const isPortShorthand = /^\d+([/?#].*)?$/.test(remainder);

    if (!isPortShorthand) {
      if (REFUSED_SCHEMES.has(protocol)) {
        return { kind: 'blocked', url: '', reason: `${protocol} URLs are not opened here` };
      }

      if (protocol === 'about:') {
        if (remainder.toLowerCase() === 'blank') {
          return { kind: 'address', url: NEW_TAB_URL, reason: 'the blank new-tab page' };
        }
        return { kind: 'blocked', url: '', reason: 'only about:blank is allowed' };
      }

      if (!ALLOWED_SCHEMES.has(protocol)) {
        // An unrecognised scheme is searched for, which is what Chrome does with
        // text like `notes:hello` rather than refusing it outright.
        return { kind: 'search', url: buildSearchUrl(value, searchTemplate), query: value, reason: 'an unrecognised scheme, so it is a search' };
      }

      if (protocol === 'http:') {
        let host = '';
        try {
          host = new URL(value).hostname;
        } catch {
          return { kind: 'blocked', url: '', reason: 'that http address could not be parsed' };
        }
        if (!LOOPBACK_HOSTS.has(host)) {
          // Matches the shell's own policy, which refuses non-https pane attach.
          return {
            kind: 'blocked',
            url: '',
            reason: 'plain http is refused here except on localhost - use https',
          };
        }
      }

      return { kind: 'address', url: value, reason: 'an explicit address' };
    }
  }

  // A space is the clearest signal that someone is asking a question.
  if (/\s/.test(value)) {
    return { kind: 'search', url: buildSearchUrl(value, searchTemplate), query: value, reason: 'it contains spaces, so it is a search' };
  }

  // Loopback before the general host rule, because `localhost:3000` has no dot
  // and would otherwise be searched for.
  if (LOOPBACK_LIKE.test(value)) {
    return { kind: 'address', url: `http://${value}`, reason: 'a local address' };
  }

  if (IPV4.test(value)) {
    const host = value.split(/[:/?#]/)[0];
    const protocol = LOOPBACK_HOSTS.has(host) ? 'http' : 'https';
    return { kind: 'address', url: `${protocol}://${value}`, reason: 'an IP address' };
  }

  // `example.com`, `sub.example.co.uk/path` - a dotted name ending in something
  // label-like. A bare word like "prism" is a search, exactly as in Chrome.
  if (HOST_LIKE.test(value)) {
    const host = value.split(/[:/?#]/)[0];
    const lastLabel = host.split('.').pop() || '';
    if (/^[a-z]{2,}$/i.test(lastLabel)) {
      return { kind: 'address', url: `https://${value}`, reason: 'a domain name' };
    }
  }

  return { kind: 'search', url: buildSearchUrl(value, searchTemplate), query: value, reason: 'it is not a recognisable address' };
}

/** Where a tab may step back to, or undefined at the start of its history. */
export function backTarget(tab: BrowserTab): string | undefined {
  return tab.historyIndex > 0 ? tab.history[tab.historyIndex - 1] : undefined;
}

export function forwardTarget(tab: BrowserTab): string | undefined {
  return tab.historyIndex >= 0 && tab.historyIndex < tab.history.length - 1
    ? tab.history[tab.historyIndex + 1]
    : undefined;
}

export function canGoBack(tab: BrowserTab): boolean {
  return backTarget(tab) !== undefined;
}

export function canGoForward(tab: BrowserTab): boolean {
  return forwardTarget(tab) !== undefined;
}

/**
 * Commit a navigation in a tab, following Chrome's two rules.
 *
 * Re-entering the same address is a *reload*: it replaces the current entry and
 * bumps the reload key, because an iframe or webview handed the same URL again
 * does nothing at all. A different address pushes, and drops the forward
 * entries - they described a future that no longer follows from here.
 */
export function commitNavigation(tab: BrowserTab, url: string): BrowserTab {
  const isReload = url === tab.url && tab.url !== NEW_TAB_URL;

  if (isReload) {
    return {
      ...tab,
      input: displayUrl(url),
      title: tab.title || titleForUrl(url),
      isLoading: true,
      error: undefined,
      reloadKey: tab.reloadKey + 1,
    };
  }

  const history = [...tab.history.slice(0, tab.historyIndex + 1), url];
  return {
    ...tab,
    url,
    input: displayUrl(url),
    title: titleForUrl(url),
    isLoading: url !== NEW_TAB_URL,
    error: undefined,
    history,
    historyIndex: history.length - 1,
  };
}

/** Move within a tab's own history (the iframe path; the shell has its own). */
export function stepHistory(tab: BrowserTab, direction: -1 | 1): BrowserTab {
  const target = direction === -1 ? backTarget(tab) : forwardTarget(tab);
  if (target === undefined) return tab;
  return {
    ...tab,
    url: target,
    input: displayUrl(target),
    title: titleForUrl(target),
    isLoading: true,
    error: undefined,
    historyIndex: tab.historyIndex + direction,
  };
}

/** Replace a tab in a list, preserving order. */
export function updateTab(tabs: BrowserTab[], id: string, change: (tab: BrowserTab) => BrowserTab): BrowserTab[] {
  return tabs.map(tab => (tab.id === id ? change(tab) : tab));
}

export function tabIndexById(tabs: BrowserTab[], id: string): number {
  return tabs.findIndex(tab => tab.id === id);
}

export function activeTabOf(tabs: BrowserTab[], activeId: string): BrowserTab | undefined {
  return tabs.find(tab => tab.id === activeId);
}

export interface OpenTabResult {
  tabs: BrowserTab[];
  activeId: string;
  /** Set when the request was refused, so the UI can say why. */
  rejected?: string;
}

/**
 * Open a tab, appending it to the right of everything else.
 *
 * Chrome opens a new tab next to the active one; append is close enough and far
 * easier to reason about with a strip this narrow, but the limit is enforced
 * because an unbounded strip is a memory leak with a user interface.
 */
export function openTab(tabs: BrowserTab[], url: string = NEW_TAB_URL, max: number = MAX_TABS): OpenTabResult {
  if (tabs.length >= max) {
    return { tabs, activeId: tabs[tabs.length - 1]?.id ?? '', rejected: `${max} tabs is the limit - close one first.` };
  }
  const tab = createTab(url);
  return { tabs: [...tabs, tab], activeId: tab.id };
}

/**
 * Close a tab and decide what becomes active.
 *
 * Closing the active tab moves to the right-hand neighbour, or the left-hand one
 * when it was last - so the strip never ends up with no selection while tabs
 * remain. Closing an inactive tab leaves the selection alone.
 */
export function closeTab(tabs: BrowserTab[], activeId: string, id: string): { tabs: BrowserTab[]; activeId: string } {
  const index = tabIndexById(tabs, id);
  if (index === -1) return { tabs, activeId };

  const remaining = tabs.filter(tab => tab.id !== id);
  if (remaining.length === 0) return { tabs: [], activeId: '' };
  if (activeId !== id) return { tabs: remaining, activeId };

  const nextActive = remaining[Math.min(index, remaining.length - 1)];
  return { tabs: remaining, activeId: nextActive.id };
}

/** Move the active tab by one position, as Ctrl+Tab does. */
export function cycleTab(tabs: BrowserTab[], activeId: string, direction: 1 | -1): string {
  if (tabs.length === 0) return '';
  const index = tabIndexById(tabs, activeId);
  const start = index === -1 ? 0 : index;
  return tabs[(start + direction + tabs.length) % tabs.length].id;
}

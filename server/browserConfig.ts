/**
 * The embedded browser's configuration, owned by the backend.
 *
 * Everything the browser needs to behave correctly is a fact about the outside
 * world, and facts about the outside world belong on the server: what may be
 * loaded, what search engine actually works inside a frame, which hosts refuse to
 * be embedded, and which AI tools are awake. The client used to hold its own copy
 * of all four, which meant a measurement taken in one place could silently
 * disagree with the behaviour everywhere else.
 *
 * Two of those facts are worth stating outright, because both were measured from
 * this repo and both contradict the obvious choice:
 *
 *   1. Google sends `X-Frame-Options: SAMEORIGIN`, so "search the web the way
 *      Chrome does" would render an EMPTY PANE on every search. So would
 *      DuckDuckGo, Brave, Startpage, Ecosia and Mojeek - every engine anyone
 *      would reach for first. Bing and Searx answered with no framing policy at
 *      all, so the omnibox uses one of those and the choice is recorded here
 *      rather than assumed.
 *
 *   2. A site can answer 200 and still refuse to be framed, and a page can be
 *      frameable and still useless. So hosts that refuse framing are listed with
 *      the header that proves it, and the browser opens those in a real tab
 *      instead of showing a blank rectangle that looks like a crash.
 */
import { probeAiLatexWebTools, type WebToolProbe } from './freeAiLatexTools.ts';

export type BrowserBookmarkGroup = 'core' | 'ai';

export interface BrowserBookmark {
  id: string;
  name: string;
  url: string;
  icon: string;
  group: BrowserBookmarkGroup;
  /** AI tools: the model behind the tool, so the claim is checkable. */
  model?: string;
  /** AI tools: why no API key is involved. */
  keylessBasis?: string;
  /** AI tools: 'editor' or 'model'. */
  badge?: string;
  /** True when the host refuses framing, so a tab would be blank. */
  embedBlocked?: boolean;
  /**
   * The live probe's verdict for an AI tool, decided here rather than in the
   * renderer: "awake" is a measurement, and one measurement should not be
   * re-derived per client.
   */
  status?: 'ok' | 'asleep' | 'down' | 'unknown';
  /** One line explaining the status, safe to show as a tooltip. */
  liveNote?: string;
}

/** A host measured to refuse - or permit - being embedded. */
export interface FramePolicyRecord {
  /** Hostname, or a `.suffix` for every subdomain of it. */
  host: string;
  embeddable: boolean;
  /** The header the verdict came from. */
  evidence: string;
}

/** Schemes that may be loaded, and the ones refused by name. */
export interface BrowserSchemeRule {
  scheme: string;
  reason: string;
}

export interface BrowserPolicy {
  /** `{query}` is the substitution point. */
  searchTemplate: string;
  searchHost: string;
  /** Whether the configured engine may be framed; false means open a real tab. */
  searchEmbeds: boolean;
  newTabUrl: string;
  homeUrl: string;
  /** 12, matching `MAX_TABS` in `src/utils/browserTabs.ts`. */
  maxTabs: number;
  allowedSchemes: string[];
  refusedSchemes: BrowserSchemeRule[];
  framePolicy: FramePolicyRecord[];
}

export interface BrowserConfig {
  generatedAt: string;
  policy: BrowserPolicy;
  bookmarks: BrowserBookmark[];
  toolStatus: WebToolProbe[];
  usableToolsNow: number;
  notes: string[];
}

/**
 * The bookmarks that are always present. Backend-owned, so all clients agree.
 *
 * Prism alone, by request: the bar used to also carry two LaTeX references and
 * the free AI tool catalogue (LaTeX-OCR and friends), which sat next to the page
 * the panel exists for as noise. The catalogue itself is untouched - it is what
 * the toolchain panel lists - it is simply no longer duplicated into the browser.
 */
export const BROWSER_CORE_BOOKMARKS: BrowserBookmark[] = [
  {
    id: 'prism',
    name: 'OpenAI Prism',
    url: 'https://prism.openai.com/',
    icon: '✨',
    group: 'core',
  },
];

/**
 * Search engines considered for the omnibox, each with the header measured.
 *
 * Kept as a record rather than a constant because the reason the default is Bing
 * is a measurement, and a reader deserves to see the ones that failed next to it.
 */
export const BROWSER_SEARCH_ENGINES: Array<{
  id: string;
  label: string;
  template: string;
  host: string;
  embeddable: boolean;
  evidence: string;
}> = [
  {
    id: 'bing',
    label: 'Bing',
    template: 'https://www.bing.com/search?q={query}',
    host: 'www.bing.com',
    embeddable: true,
    evidence: 'GET https://www.bing.com/search?q=... -> 200, no X-Frame-Options and no frame-ancestors.',
  },
  {
    id: 'searx',
    label: 'Searx',
    template: 'https://searx.be/search?q={query}',
    host: 'searx.be',
    embeddable: true,
    evidence: 'GET https://searx.be/search?q=... -> 200, no X-Frame-Options and no frame-ancestors.',
  },
  {
    id: 'google',
    label: 'Google',
    template: 'https://www.google.com/search?q={query}',
    host: 'www.google.com',
    embeddable: false,
    evidence: 'GET https://www.google.com/search?q=... -> 200 with X-Frame-Options: sameorigin, so a pane would be blank.',
  },
  {
    id: 'duckduckgo',
    label: 'DuckDuckGo',
    template: 'https://duckduckgo.com/?q={query}',
    host: 'duckduckgo.com',
    embeddable: false,
    evidence: "GET https://duckduckgo.com/?q=... -> 200 with frame-ancestors 'self' https://html.duckduckgo.com.",
  },
  {
    id: 'brave',
    label: 'Brave Search',
    template: 'https://search.brave.com/search?q={query}',
    host: 'search.brave.com',
    embeddable: false,
    evidence: "GET https://search.brave.com/search?q=... -> 429 with frame-ancestors 'self'.",
  },
  {
    id: 'startpage',
    label: 'Startpage',
    template: 'https://www.startpage.com/sp/search?query={query}',
    host: 'www.startpage.com',
    embeddable: false,
    evidence: "GET https://www.startpage.com/sp/search?query=... -> 200 with frame-ancestors 'self'.",
  },
  {
    id: 'mojeek',
    label: 'Mojeek',
    template: 'https://www.mojeek.com/search?q={query}',
    host: 'www.mojeek.com',
    embeddable: false,
    evidence: "GET https://www.mojeek.com/search?q=... -> 200 with frame-ancestors 'none'.",
  },
  {
    id: 'ecosia',
    label: 'Ecosia',
    template: 'https://www.ecosia.org/search?q={query}',
    host: 'www.ecosia.org',
    embeddable: false,
    evidence: 'GET https://www.ecosia.org/search?q=... -> 403 with X-Frame-Options: sameorigin.',
  },
];

/** The engine the omnibox uses. Overridable by env, validated against the table. */
export function defaultSearchEngineId(): string {
  const requested = (process.env.BROWSER_SEARCH_ENGINE || 'bing').trim().toLowerCase();
  return BROWSER_SEARCH_ENGINES.some((engine) => engine.id === requested) ? requested : 'bing';
}

/**
 * Hosts measured to refuse or permit framing, so a click cannot land on a blank
 * pane. Each entry carries the header it was decided from.
 */
export const BROWSER_FRAME_POLICY: FramePolicyRecord[] = [
  {
    host: 'prism.openai.com',
    embeddable: true,
    evidence: 'GET https://prism.openai.com/ -> 200, no X-Frame-Options, no frame-ancestors.',
  },
  {
    host: 'huggingface.co',
    embeddable: false,
    evidence: 'GET https://huggingface.co/spaces/... -> 200 with X-Frame-Options: DENY. The Space runtime host is the embeddable address.',
  },
  {
    host: 'www.overleaf.com',
    embeddable: false,
    evidence: 'GET https://www.overleaf.com/ -> 200 with X-Frame-Options: SAMEORIGIN.',
  },
  {
    host: 'www.google.com',
    embeddable: false,
    evidence: 'GET https://www.google.com/search?q=... -> 200 with X-Frame-Options: sameorigin.',
  },
  {
    host: 'github.com',
    embeddable: false,
    evidence: 'Source repositories are not usable tools and refuse framing; they are never bookmarked.',
  },
  {
    host: 'inkwhale.io.vn',
    embeddable: false,
    evidence: 'GET https://inkwhale.io.vn/ -> 200 with X-Frame-Options: SAMEORIGIN.',
  },
  {
    host: 'trybibby.com',
    embeddable: false,
    evidence: "GET https://trybibby.com/ -> 200 with frame-ancestors 'self'.",
  },
];

/**
 * The framing verdict for a URL, from the measured table.
 *
 * `undefined` means "not measured", which is not the same as allowed: the browser
 * shows the page and lets it prove itself rather than guessing either way.
 */
export function frameVerdictForUrl(url: string): FramePolicyRecord | undefined {
  let host = '';
  try {
    host = new URL(String(url ?? '')).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  if (!host) return undefined;

  // Exact host first, then the nearest recorded parent so `sub.example.test`
  // inherits what `example.test` was measured to do.
  const exact = BROWSER_FRAME_POLICY.find((record) => record.host === host);
  if (exact) return exact;
  return BROWSER_FRAME_POLICY.find((record) => host.endsWith(`.${record.host}`));
}

/** The policy the browser runs by. Pure: it only reads the tables above. */
export function buildBrowserPolicy(): BrowserPolicy {
  const engine =
    BROWSER_SEARCH_ENGINES.find((candidate) => candidate.id === defaultSearchEngineId()) ??
    BROWSER_SEARCH_ENGINES[0];

  return {
    searchTemplate: engine.template,
    searchHost: engine.host,
    searchEmbeds: engine.embeddable,
    newTabUrl: 'about:blank',
    homeUrl: 'https://prism.openai.com/',
    maxTabs: 12,
    allowedSchemes: ['https:', 'http:'],
    refusedSchemes: [
      { scheme: 'javascript:', reason: 'script URLs are never opened in a pane; they are a frame-escape vector' },
      { scheme: 'data:', reason: 'data URLs are never opened in a pane; they are a frame-escape vector' },
      { scheme: 'file:', reason: 'a page in the app must not be able to read local files' },
      { scheme: 'blob:', reason: 'blob URLs have no origin to hold accountable' },
      { scheme: 'view-source:', reason: 'source view bypasses the frame policy it would be used to inspect' },
      { scheme: 'chrome:', reason: 'browser-internal pages are not reachable from an embedded page' },
      { scheme: 'mailto:', reason: 'mail is not handled here; copying the address is safer' },
      { scheme: 'tel:', reason: 'there is nothing to dial' },
    ],
    framePolicy: BROWSER_FRAME_POLICY,
  };
}

/**
 * Assemble the bookmark bar.
 *
 * The core list, and nothing else. It used to fold the free AI tool catalogue in
 * alongside it - `ai:`-prefixed rows with their own status dots, matched against
 * the core rows by origin so Prism could not appear twice - and those entries are
 * gone by request. The catalogue itself is untouched: `FREE_AI_LATEX_WEB_TOOLS`
 * still describes every editor, and `toolStatus` below still reports each one.
 */
export function buildBrowserBookmarks(): BrowserBookmark[] {
  return BROWSER_CORE_BOOKMARKS.map((bookmark) => ({ ...bookmark }));
}

export interface BrowserConfigDeps {
  probe: () => Promise<{ tools: WebToolProbe[]; usableNow: number }>;
}

const DEFAULT_DEPS: BrowserConfigDeps = {
  probe: probeAiLatexWebTools,
};

/**
 * The whole browser configuration, with the live probe folded in.
 *
 * The notes are not decoration: they are the only place the reasoning reaches a
 * human, so each one names a fact the user could otherwise only discover by
 * clicking and finding an empty pane.
 */
export async function buildBrowserConfig(deps: Partial<BrowserConfigDeps> = {}): Promise<BrowserConfig> {
  const { probe } = { ...DEFAULT_DEPS, ...deps };
  const policy = buildBrowserPolicy();

  const status = await probe().catch(() => ({ tools: [] as WebToolProbe[], usableNow: 0 }));

  const asleep = status.tools.filter((tool) => tool.sleeping).length;
  const broken = status.tools.filter((tool) => !tool.reachable && !tool.sleeping).length;

  const notes: string[] = [
    `Searches go to ${policy.searchHost} because it is the measured engine that allows being framed; Google and DuckDuckGo both refuse, which would render an empty pane.`,
  ];
  if (!policy.searchEmbeds) {
    notes.push('The configured search engine refuses framing, so searches open in a real tab instead.');
  }
  if (asleep > 0) {
    notes.push(`${asleep} free AI tool(s) are asleep; opening one wakes it, which takes a few seconds.`);
  }
  if (broken > 0) {
    notes.push(`${broken} free AI tool(s) did not answer at all; they are listed but will not load.`);
  }
  notes.push(
    'Hosts measured to refuse framing are opened in a real browser tab instead of an empty pane; each verdict is recorded with the header it came from.',
  );

  return {
    generatedAt: new Date().toISOString(),
    policy,
    bookmarks: buildBrowserBookmarks(),
    toolStatus: status.tools,
    usableToolsNow: status.usableNow,
    notes,
  };
}

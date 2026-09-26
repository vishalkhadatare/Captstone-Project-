import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BROWSER_CORE_BOOKMARKS,
  BROWSER_FRAME_POLICY,
  BROWSER_SEARCH_ENGINES,
  buildBrowserBookmarks,
  buildBrowserConfig,
  buildBrowserPolicy,
  defaultSearchEngineId,
  frameVerdictForUrl,
  type BrowserConfigDeps,
} from './browserConfig.ts';
import { FREE_AI_LATEX_WEB_TOOLS, type WebToolProbe } from './freeAiLatexTools.ts';

const OK_PROBE: WebToolProbe = {
  id: 'latex-ocr',
  url: 'https://lukbl-latex-ocr.hf.space/',
  reachable: true,
  status: 200,
  embeddable: true,
  embedReason: 'no X-Frame-Options and no frame-ancestors',
  interactive: true,
  sleeping: false,
  ms: 900,
};

const deps = (overrides: Partial<BrowserConfigDeps> = {}): Partial<BrowserConfigDeps> => ({
  probe: async () => ({ tools: [], usableNow: 0 }),
  ...overrides,
});

// --- the search engine, which is not the obvious choice -------------------

test('the default search engine is one that actually allows being framed', () => {
  // Google is what Chrome uses and what everyone reaches for first, but it sends
  // X-Frame-Options: sameorigin, so every search inside a pane would be blank.
  const engine = BROWSER_SEARCH_ENGINES.find((candidate) => candidate.id === defaultSearchEngineId());
  assert.ok(engine, 'the default engine must be in the table');
  assert.equal(engine?.embeddable, true, `${engine?.id} cannot be framed, so a search would render an empty pane`);
  assert.equal(buildBrowserPolicy().searchEmbeds, true);
});

test('every engine considered records the header its verdict came from', () => {
  for (const engine of BROWSER_SEARCH_ENGINES) {
    assert.ok(engine.evidence.length > 20, `${engine.id} must record the evidence for its verdict`);
    assert.match(engine.template, /\{query\}/, `${engine.id} needs a {query} substitution point`);
    assert.match(engine.host, /^[a-z0-9.-]+$/i, `${engine.id} must name the host it queries`);
  }
});

test('the blocked engines include Google and DuckDuckGo, which is the point of the table', () => {
  const blocked = BROWSER_SEARCH_ENGINES.filter((engine) => !engine.embeddable).map((engine) => engine.id);
  assert.ok(blocked.includes('google'), 'Google refuses framing and must be recorded as such');
  assert.ok(blocked.includes('duckduckgo'), 'DuckDuckGo refuses framing too');
});

test('the search engine template reaches the policy unchanged', () => {
  const policy = buildBrowserPolicy();
  const engine = BROWSER_SEARCH_ENGINES.find((candidate) => candidate.id === defaultSearchEngineId());
  assert.equal(policy.searchTemplate, engine?.template);
  assert.equal(policy.searchHost, engine?.host);
});

// --- the policy -----------------------------------------------------------

test('every refused scheme says why, and none of them is silently allowed', () => {
  const policy = buildBrowserPolicy();
  assert.ok(policy.refusedSchemes.length >= 5, 'the refuse list must not be trivially small');
  for (const rule of policy.refusedSchemes) {
    assert.match(rule.scheme, /^[a-z][a-z0-9+.-]*:$/, `${rule.scheme} must be a bare scheme with a colon`);
    assert.ok(rule.reason.length > 20, `${rule.scheme} must explain why it is refused`);
    assert.ok(
      !policy.allowedSchemes.includes(rule.scheme),
      `${rule.scheme} is both allowed and refused, which is unresolvable`,
    );
  }
  const refused = policy.refusedSchemes.map((rule) => rule.scheme);
  for (const dangerous of ['javascript:', 'data:', 'file:']) {
    assert.ok(refused.includes(dangerous), `${dangerous} must be refused by name`);
  }
});

test('only https and loopback-eligible http are loadable schemes', () => {
  const policy = buildBrowserPolicy();
  assert.deepEqual([...policy.allowedSchemes].sort(), ['http:', 'https:']);
});

test('the tab limit matches the browser and is positive', () => {
  assert.equal(buildBrowserPolicy().maxTabs, 12);
  assert.ok(buildBrowserPolicy().maxTabs > 0);
});

test('the policy carries the framing measurements, each with its evidence', () => {
  const policy = buildBrowserPolicy();
  assert.ok(policy.framePolicy.length >= 5, 'the framing table must not be trivial');
  for (const record of policy.framePolicy) {
    assert.ok(record.host.length > 3, `${JSON.stringify(record)} needs a host`);
    assert.ok(record.evidence.length > 20, `${record.host} must record what proved it`);
  }
});

// --- framing verdicts -----------------------------------------------------

test('a host measured to refuse framing is reported as such', () => {
  assert.equal(frameVerdictForUrl('https://www.overleaf.com/learn')?.embeddable, false);
  assert.equal(frameVerdictForUrl('https://www.google.com/search?q=x')?.embeddable, false);
});

test('a subdomain inherits the verdict of the host that was measured', () => {
  assert.equal(frameVerdictForUrl('https://blog.huggingface.co/post')?.embeddable, false);
});

test('an embeddable host is reported as embeddable, not just absence of a record', () => {
  const verdict = frameVerdictForUrl('https://prism.openai.com/');
  assert.equal(verdict?.embeddable, true);
});

test('an unmeasured host yields no verdict, so the browser does not guess', () => {
  assert.equal(frameVerdictForUrl('https://never-measured.example/'), undefined);
  assert.equal(frameVerdictForUrl('not a url'), undefined);
});

test('a Hugging Face Space is embeddable while the huggingface.co page is not', () => {
  // The distinction the whole bookmark list depends on.
  assert.equal(frameVerdictForUrl('https://lukbl-latex-ocr.hf.space/'), undefined);
  assert.equal(frameVerdictForUrl('https://huggingface.co/spaces/lukbl/LaTeX-OCR')?.embeddable, false);
});

// --- the bookmarks --------------------------------------------------------
//
// The bar carries Prism and nothing else, by request. The AI-tool rows, their
// `ai:` ids and their per-tool status dots were deleted with the entries, so the
// tests that pinned that behaviour are gone too - a test kept for a feature that
// no longer exists is a test nobody can act on.

test('the bar is OpenAI Prism alone', () => {
  const bookmarks = buildBrowserBookmarks();
  assert.equal(bookmarks.length, 1, `unexpected rows: ${bookmarks.map((b) => b.id).join(', ')}`);
  assert.equal(bookmarks[0].id, 'prism');
  assert.ok(bookmarks[0].url.includes('prism.openai.com'));
});

test('no catalogue tool is bookmarked any more, however useful it is', () => {
  // The catalogue still exists for the toolchain panel; it just must not leak
  // back onto the bar, which is the regression this pins. Prism is the one
  // exception: it is the bar's whole reason for existing and also a catalogue
  // entry, which is why the empty-bar bug had to be checked rather than assumed.
  const bookmarked = new Set(buildBrowserBookmarks().map((bookmark) => bookmark.url));
  const catalogueOnly = FREE_AI_LATEX_WEB_TOOLS.filter((tool) => !/prism\.openai\.com/.test(tool.url));
  assert.ok(catalogueOnly.length > 0, 'the catalogue must still describe the other tools');
  for (const tool of catalogueOnly) {
    assert.ok(!bookmarked.has(tool.url), `${tool.id} is still on the bookmark bar`);
  }
});

test('the bookmarks the bar does carry are well formed', () => {
  for (const bookmark of buildBrowserBookmarks()) {
    assert.match(bookmark.url, /^https:\/\//, `${bookmark.id} must be https`);
    assert.ok(bookmark.name.length > 2, `${bookmark.id} needs a name`);
    assert.ok(bookmark.icon.length > 0, `${bookmark.id} needs an icon`);
    assert.ok(['core', 'ai'].includes(bookmark.group), `${bookmark.id} has no group`);
    assert.ok(!/github\.com|gitlab\.com|bitbucket\.org/i.test(bookmark.url), `${bookmark.id} points at a repository`);
  }
});

test('the core bookmarks are unique, so no two rows share a React key', () => {
  const ids = BROWSER_CORE_BOOKMARKS.map((bookmark) => bookmark.id);
  assert.ok(ids.includes('prism'), 'Prism must always be on the bar');
  assert.deepEqual([...new Set(ids)], ids, 'core bookmark ids must be unique');
});

test('the built bar is a copy, so a caller cannot mutate the shared list', () => {
  buildBrowserBookmarks()[0].name = 'renamed by a caller';
  assert.equal(BROWSER_CORE_BOOKMARKS[0].name, 'OpenAI Prism');
});

// --- the whole configuration ---------------------------------------------

test('the configuration reports the live counts and explains its own search choice', async () => {
  const config = await buildBrowserConfig(
    deps({
      probe: async () => ({ tools: [{ ...OK_PROBE }], usableNow: 1 }),
    }),
  );

  assert.equal(config.usableToolsNow, 1);
  assert.ok(config.generatedAt, 'the configuration must be timestamped');
  assert.ok(config.bookmarks.length > 0, 'the bar must never be empty');
  assert.ok(
    config.notes.some((note) => note.includes(config.policy.searchHost)),
    'the notes must name the search engine and why it was chosen',
  );
  assert.ok(
    config.notes.some((note) => /refuse framing/i.test(note)),
    'the notes must explain why some hosts open in a real tab',
  );
});

test('a probe that fails leaves a usable configuration rather than an error', async () => {
  const config = await buildBrowserConfig(
    deps({
      probe: async () => {
        throw new Error('ENOTFOUND');
      },
    }),
  );

  assert.equal(config.usableToolsNow, 0);
  assert.ok(config.bookmarks.length > 0, 'bookmarks must survive a failed probe');
  assert.ok(config.policy.searchHost, 'the policy must survive a failed probe');
  // The bar no longer carries anything whose status a probe could contradict,
  // so the old "an unprobed tool must not claim to be awake" check has nothing
  // left to inspect - the tool statuses are reported in `toolStatus` instead.
  for (const bookmark of config.bookmarks) {
    assert.equal(bookmark.status, undefined, 'a bookmark must not claim a live status the bar no longer measures');
  }
});

test('asleep and unreachable tools are both mentioned in the notes', async () => {
  const config = await buildBrowserConfig(
    deps({
      probe: async () => ({
        tools: [
          { ...OK_PROBE, id: 'a', sleeping: true, reachable: false, status: 503 },
          { ...OK_PROBE, id: 'b', reachable: false, sleeping: false },
        ],
        usableNow: 0,
      }),
    }),
  );

  assert.ok(config.notes.some((note) => /asleep/i.test(note)), 'asleep tools must be called out');
  assert.ok(config.notes.some((note) => /did not answer/i.test(note)), 'dead tools must be called out');
});

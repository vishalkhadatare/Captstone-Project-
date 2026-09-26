import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_TABS,
  NEW_TAB_URL,
  activeTabOf,
  buildSearchUrl,
  canGoBack,
  canGoForward,
  closeTab,
  commitNavigation,
  createTab,
  cycleTab,
  displayUrl,
  normalizeAddress,
  openTab,
  stepHistory,
  titleForUrl,
  updateTab,
  type BrowserTab,
} from './browserTabs';

// --- the omnibox: address or search? --------------------------------------

test('a dotted name is an address, and gets https', () => {
  const resolved = normalizeAddress('example.com');
  assert.equal(resolved?.kind, 'address');
  assert.equal(resolved?.url, 'https://example.com');
});

test('a name with spaces is a search', () => {
  const resolved = normalizeAddress('latex ocr model');
  assert.equal(resolved?.kind, 'search');
  assert.equal(resolved?.query, 'latex ocr model');
  assert.match(resolved?.url || '', /^https:\/\/www\.google\.com\/search\?q=/);
});

test('a bare word is a search, exactly as in Chrome', () => {
  const resolved = normalizeAddress('prism');
  assert.equal(resolved?.kind, 'search');
  assert.equal(resolved?.query, 'prism');
});

test('an explicit scheme is honoured before any shape guessing', () => {
  const resolved = normalizeAddress('https://lukbl-latex-ocr.hf.space/app');
  assert.equal(resolved?.kind, 'address');
  assert.equal(resolved?.url, 'https://lukbl-latex-ocr.hf.space/app');
});

test('localhost with a port is an address, not a search', () => {
  const resolved = normalizeAddress('localhost:3000/#paper-generation');
  assert.equal(resolved?.kind, 'address');
  assert.equal(resolved?.url, 'http://localhost:3000/#paper-generation');
});

test('loopback may use plain http because the shell allows it', () => {
  assert.equal(normalizeAddress('127.0.0.1:3000')?.url, 'http://127.0.0.1:3000');
  assert.equal(normalizeAddress('http://localhost:8080/x')?.kind, 'address');
});

test('a non-loopback http address is refused, because the shell refuses it too', () => {
  const resolved = normalizeAddress('http://example.com/paper');
  assert.equal(resolved?.kind, 'blocked');
  assert.match(resolved?.reason || '', /http/i);
});

test('a public IP becomes https and stays an address', () => {
  const resolved = normalizeAddress('8.8.8.8');
  assert.equal(resolved?.kind, 'address');
  assert.equal(resolved?.url, 'https://8.8.8.8');
});

test('about:blank is the new tab, and other about: pages are refused', () => {
  assert.equal(normalizeAddress('about:blank')?.url, NEW_TAB_URL);
  assert.equal(normalizeAddress('about:config')?.kind, 'blocked');
});

test('script and data schemes are refused rather than searched', () => {
  // This is the important one: a pasted payload must not become a query that a
  // search engine is then asked to interpret.
  for (const value of ['javascript:alert(1)', 'data:text/html,<h1>x', 'file:///etc/passwd']) {
    const resolved = normalizeAddress(value);
    assert.equal(resolved?.kind, 'blocked', `${value} must be refused`);
    assert.equal(resolved?.url, '', `${value} must not resolve to a URL`);
  }
});

test('empty input resolves to nothing at all', () => {
  assert.equal(normalizeAddress('   '), null);
  assert.equal(normalizeAddress(''), null);
});

test('the search URL encodes the query', () => {
  assert.equal(buildSearchUrl('a b&c'), 'https://www.google.com/search?q=a%20b%26c');
});

// --- tabs -----------------------------------------------------------------

test('a new tab has no address, no history and the Chrome label', () => {
  const tab = createTab();
  assert.equal(tab.url, NEW_TAB_URL);
  assert.equal(tab.input, '');
  assert.equal(tab.title, 'New Tab');
  assert.deepEqual(tab.history, []);
  assert.equal(tab.historyIndex, -1);
  assert.equal(tab.isLoading, false);
});

test('a tab opened on a URL starts with that URL in its history', () => {
  const tab = createTab('https://prism.openai.com/');
  assert.deepEqual(tab.history, ['https://prism.openai.com/']);
  assert.equal(tab.historyIndex, 0);
  assert.equal(tab.title, 'prism.openai.com');
});

test('a tab is labelled by host until the page reports a title', () => {
  assert.equal(titleForUrl('https://www.overleaf.com/learn'), 'overleaf.com');
  assert.equal(titleForUrl('https://tikz.dev/'), 'tikz.dev');
  assert.equal(titleForUrl(NEW_TAB_URL), 'New Tab');
  assert.equal(displayUrl(NEW_TAB_URL), '');
});

test('navigating pushes history and keeps the invariant that the bar matches the page', () => {
  let tab = createTab('https://a.test/');
  tab = commitNavigation(tab, 'https://b.test/');
  assert.deepEqual(tab.history, ['https://a.test/', 'https://b.test/']);
  assert.equal(tab.historyIndex, 1);
  assert.equal(tab.history[tab.historyIndex], tab.url);
  assert.equal(tab.input, 'https://b.test/');
  assert.equal(canGoBack(tab), true);
  assert.equal(canGoForward(tab), false);
});

test('navigating from a back position drops the forward history', () => {
  // Chrome's rule: the old forward entries described a future that no longer
  // follows from where the user now is.
  let tab = createTab('https://a.test/');
  tab = commitNavigation(tab, 'https://b.test/');
  tab = stepHistory(tab, -1);
  assert.equal(tab.url, 'https://a.test/');
  assert.equal(canGoForward(tab), true);

  tab = commitNavigation(tab, 'https://c.test/');
  assert.deepEqual(tab.history, ['https://a.test/', 'https://c.test/']);
  assert.equal(canGoForward(tab), false);
});

test('stepping past either end of the history does nothing', () => {
  const tab = createTab('https://a.test/');
  assert.equal(stepHistory(tab, -1), tab);
  assert.equal(stepHistory(tab, 1), tab);
});

test('reloading the same URL bumps the key so the pane actually reloads', () => {
  const tab = createTab('https://a.test/');
  const reloaded = commitNavigation(tab, 'https://a.test/');
  assert.equal(reloaded.reloadKey, tab.reloadKey + 1);
  assert.deepEqual(reloaded.history, ['https://a.test/']);
});

test('opening a tab appends it and activates it', () => {
  const first = createTab();
  const result = openTab([first], 'https://b.test/');
  assert.equal(result.tabs.length, 2);
  assert.equal(activeTabOf(result.tabs, result.activeId)?.url, 'https://b.test/');
  assert.equal(result.rejected, undefined);
});

test('the tab limit refuses politely instead of growing without bound', () => {
  const tabs: BrowserTab[] = Array.from({ length: MAX_TABS }, (_, i) => createTab(NEW_TAB_URL, `t${i}`));
  const result = openTab(tabs, 'https://one-too-many.test/');
  assert.equal(result.tabs.length, MAX_TABS);
  assert.match(result.rejected || '', /close one/i);
});

test('closing the active tab activates its right-hand neighbour', () => {
  const tabs = [createTab(NEW_TAB_URL, 'a'), createTab(NEW_TAB_URL, 'b'), createTab(NEW_TAB_URL, 'c')];
  const result = closeTab(tabs, 'b', 'b');
  assert.deepEqual(result.tabs.map(t => t.id), ['a', 'c']);
  assert.equal(result.activeId, 'c');
});

test('closing the last tab activates the one to its left', () => {
  const tabs = [createTab(NEW_TAB_URL, 'a'), createTab(NEW_TAB_URL, 'b')];
  const result = closeTab(tabs, 'b', 'b');
  assert.equal(result.activeId, 'a');
});

test('closing an inactive tab leaves the selection alone', () => {
  const tabs = [createTab(NEW_TAB_URL, 'a'), createTab(NEW_TAB_URL, 'b'), createTab(NEW_TAB_URL, 'c')];
  const result = closeTab(tabs, 'c', 'a');
  assert.equal(result.activeId, 'c');
  assert.deepEqual(result.tabs.map(t => t.id), ['b', 'c']);
});

test('closing the only tab leaves no tab and no selection, never a dangling id', () => {
  const result = closeTab([createTab(NEW_TAB_URL, 'only')], 'only', 'only');
  assert.deepEqual(result.tabs, []);
  assert.equal(result.activeId, '');
});

test('closing an unknown tab is a no-op', () => {
  const tabs = [createTab(NEW_TAB_URL, 'a')];
  const result = closeTab(tabs, 'a', 'ghost');
  assert.equal(result.tabs, tabs);
  assert.equal(result.activeId, 'a');
});

test('cycling wraps around in both directions', () => {
  const tabs = [createTab(NEW_TAB_URL, 'a'), createTab(NEW_TAB_URL, 'b'), createTab(NEW_TAB_URL, 'c')];
  assert.equal(cycleTab(tabs, 'c', 1), 'a');
  assert.equal(cycleTab(tabs, 'a', -1), 'c');
  assert.equal(cycleTab([], 'a', 1), '');
});

test('updating a tab replaces only that tab and keeps the order', () => {
  const tabs = [createTab(NEW_TAB_URL, 'a'), createTab(NEW_TAB_URL, 'b')];
  const next = updateTab(tabs, 'a', tab => ({ ...tab, title: 'Renamed' }));
  assert.equal(next[0].title, 'Renamed');
  assert.equal(next[1].title, tabs[1].title);
  assert.equal(next[1], tabs[1]);
});

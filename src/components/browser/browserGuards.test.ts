import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Source-level guards for two bugs that type checking cannot catch.
 *
 * Both shipped and both were only visible by opening the panel: one threw
 * "Rendered more hooks than during the previous render" the first time a user
 * opened the browser, and the other would have rebuilt every tab's `<webview>`
 * on every render, restarting the page under the user.
 *
 * This mirrors how `electron/panePolicy.test.cjs` pins constants by reading the
 * renderer source: the rule is about the SHAPE of the file, so the file is what
 * gets asserted.
 */

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

const MODAL = 'src/components/OpenAIPrismBrowserModal.tsx';
const BROWSER = 'src/components/browser/ChromeLikeBrowser.tsx';

const MODAL_SOURCE = read(MODAL);
const BROWSER_SOURCE = read(BROWSER);

/** Lines of a file, without depending on the line ending. */
const linesOf = (source: string) => source.split(/\r?\n/);

const HOOK_CALL = /\buse(?:State|Ref|Effect|Callback|Memo|Reducer|Context|LayoutEffect|ImperativeHandle|DeferredValue|Transition)\s*[(<]/;

test('the browser modal runs every hook before it decides to render nothing', () => {
  const lines = linesOf(MODAL_SOURCE);
  const earlyReturn = lines.findIndex(line => line.includes('if (!isOpen) return null;'));

  assert.ok(earlyReturn !== -1, `${MODAL} must still bail out when it is closed`);

  // Hooks must come before the bail-out. A hook AFTER it runs only when the
  // modal is open, so the closed and open renders disagree about how many hooks
  // exist - which React reports as "Rendered more hooks than during the previous
  // render" and which took the whole workspace down with it.
  const after = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line, index }) => index > earlyReturn && HOOK_CALL.test(line));

  assert.deepEqual(
    after.map(({ line, index }) => `${index + 1}: ${line.trim()}`),
    [],
    'these hooks run only while the modal is open, which changes the hook count between renders',
  );
});

test('the modal still renders the tabbed browser, so the guard is attached to the right code', () => {
  assert.match(MODAL_SOURCE, /<ChromeLikeBrowser\b/, `${MODAL} must render the browser`);
});

test('nothing covers the page the user asked to see', () => {
  // A full-page sign-in gate used to sit over Prism. Prism's page embeds
  // perfectly well - only its sign-in cannot - so blocking the page to warn
  // about the sign-in meant the site was never visible at all.
  assert.ok(
    !/absolute inset-0 z-10/.test(MODAL_SOURCE),
    'the modal must not overlay the page with a blocking gate',
  );
  assert.match(
    MODAL_SOURCE,
    /Prism&apos;s page renders here/,
    'the frame limitation must be explained in a banner instead',
  );
});

test('a tab\'s webview is created once and is not tied to a render', () => {
  const lines = linesOf(BROWSER_SOURCE);

  // The guest is created in one effect. Its dependency list decides how long the
  // guest lives, so it may contain ONLY values whose identity is stable across
  // renders - an allowlist, because the failure mode (a page that restarts on
  // every render) is invisible until someone watches a form lose its input.
  const guestDep = lines.find(line => /^\s*\}, \[[^\]]*tab\.id[^\]]*\]/.test(line));
  assert.ok(guestDep, `${BROWSER} must create each pane in an effect keyed on the tab`);

  const deps = (guestDep.match(/\[([^\]]*)\]/) as RegExpMatchArray)[1]
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
  const ALLOWED = ['desktopShell', 'streamedReady', 'tab.id'];
  for (const dep of deps) {
    assert.ok(
      ALLOWED.includes(dep),
      `the guest effect depends on "${dep}", which is not one of ${ALLOWED.join(', ')} — anything rebuilt per render (the status object above all) recreates the webview every render`,
    );
  }
  assert.ok(deps.includes('tab.id'), 'the guest must be keyed on the tab, or switching tabs would share one page');

  // The callbacks are read through a ref for exactly that reason.
  assert.match(
    BROWSER_SOURCE,
    /statusRef\.current\.on/,
    'pane callbacks must be read through a ref so their identity never affects the guest',
  );
});

test('the browser never calls a state setter from inside a state updater', () => {
  // `setTabs(current => { ... setActiveId(...) ... })` is a render-phase side
  // effect: React drops it, so the + button looked enabled and opened nothing.
  const updaterBodies = BROWSER_SOURCE.match(/setTabs\((?:current|prev)\s*=>\s*\{[\s\S]*?\n\s*\}\)/g) ?? [];
  for (const body of updaterBodies) {
    assert.ok(
      !/set[A-Z]\w*\(/.test(body.replace(/setTabs\(/, '')),
      `a state updater must be pure, but this one calls another setter:\n${body}`,
    );
  }
});

test('the renderer takes its bookmarks from the backend instead of rebuilding them', () => {
  // Assembling the bar in the renderer is how two bugs got in: the catalogue's
  // OpenAI Prism collided with the core bookmark's React key, and the "is this
  // tool awake?" rule drifted from the one the server measures. Both decisions
  // now live in server/browserConfig.ts, and this pins that they stay there.
  assert.match(
    MODAL_SOURCE,
    /liveBookmarks \?\? browserConfig\?\.bookmarks \?\? FALLBACK_BOOKMARKS/,
    'the bar must come from the stream, then the config, then the fallback',
  );
  assert.ok(
    !/group: 'ai'/.test(MODAL_SOURCE),
    'the renderer must not assemble AI bookmarks; the backend owns that list',
  );
});

test('the browser takes its navigation policy from the backend', () => {
  assert.match(MODAL_SOURCE, /policy=\{policy\}/, 'the policy must be handed to the browser');
  assert.match(
    BROWSER_SOURCE,
    /normalizeAddress\(raw, policy\?\.searchTemplate\)/,
    'the omnibox must search with the backend\'s engine, not a hardcoded one',
  );
  assert.match(
    BROWSER_SOURCE,
    /refuses to be embedded, so it opened in a real browser tab/,
    'a host the backend measured as unframeable must open in a real tab, not a blank pane',
  );
});

test('the status stream is unsubscribed when the panel goes away', () => {
  // A retrying EventSource left behind would keep hitting the open internet.
  assert.match(
    MODAL_SOURCE,
    /const unsubscribe = subscribeBrowserStatus/,
    'the modal must hold the unsubscribe handle',
  );
  assert.match(MODAL_SOURCE, /unsubscribe\(\);/, 'the unsubscribe handle must actually be called on cleanup');
});

/**
 * Every screen that offers Prism.
 *
 * Found by the import rather than by a hand-kept list: the failure this guards
 * against is a screen that is ADDED later, and a list would have to be
 * remembered at exactly the moment someone forgets.
 */
const PRISM_SCREENS = (() => {
  const IMPORT = /import\s*\{[^}]*\bOpenAIPrismBrowserModal\b[^}]*\}\s*from\s*'[^']*OpenAIPrismBrowserModal'/;
  const modalPath = path.join(process.cwd(), MODAL);

  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return full.endsWith('.tsx') ? [full] : [];
    });

  return walk(path.join(process.cwd(), 'src/components'))
    .filter(file => file !== modalPath)
    .map(file => ({ relative: path.relative(process.cwd(), file).split(path.sep).join('/'), source: read(path.relative(process.cwd(), file)) }))
    .filter(({ source }) => IMPORT.test(source));
})();

test('the translation workspace offers Prism', () => {
  // The translator was the screen that had no editor at all, and a translator
  // writing regional-script LaTeX needs the same one the paper screens use.
  assert.ok(
    PRISM_SCREENS.some(screen => screen.relative === 'src/components/workspaces/TranslatorWorkspace.tsx'),
    'the translation workspace must launch Prism, like the paper-generation screens do',
  );
});

test('every screen that offers Prism renders the panel, not just a button', () => {
  // A launch button without the panel type-checks perfectly and does nothing
  // when clicked: it sets state no component reads. Only the launched markup
  // proves the click reaches a browser.
  assert.ok(PRISM_SCREENS.length > 0, 'at least one screen must offer Prism');

  for (const { relative, source } of PRISM_SCREENS) {
    const launch = /<OpenAIPrismBrowserModal\b[\s\S]*?\/>/.exec(source)?.[0] ?? '';
    assert.ok(launch, `${relative} imports the panel but never renders it`);
    assert.match(launch, /isOpen=\{/, `${relative} must hand the panel its open state`);
    assert.match(launch, /initialUrl=/, `${relative} must say which page the panel opens on`);
    assert.match(
      source,
      /setShowPrismBrowser\(\s*true\s*\)/,
      `${relative} must have a control that opens the panel`,
    );
  }
});

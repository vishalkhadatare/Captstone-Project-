import test from 'node:test';
import assert from 'node:assert/strict';

import {
  interpretSignInReport,
  summariseDiagnosis,
  type DiagnosisLevel,
  type SignInReport,
} from './signInDiagnosis.ts';

/** A healthy desktop-shell report; individual rows override what they test. */
const healthy = (overrides: Partial<SignInReport> = {}): SignInReport => ({
  desktopShell: true,
  pane: {
    attached: true,
    url: 'https://prism.openai.com/',
    onPrismHost: true,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.130 Safari/537.36',
    partition: 'persist:zeroleak-panes',
  },
  popups: { windowOpenAllowed: true, childWindowCreated: true, allowPopupsAttribute: true },
  paneRefreshes: [],
  openAuthWindows: 0,
  keepElectronUserAgent: false,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Branch selection, one row per cause.
// ---------------------------------------------------------------------------

type Row = [string, SignInReport, DiagnosisLevel, string];

const ROWS: Row[] = [
  [
    'a browser tab is reported before anything else',
    healthy({ desktopShell: false }),
    'blocked',
    'browser tab',
  ],
  [
    'a browser tab is blocked even with perfect popup facts',
    healthy({ desktopShell: false, popups: { windowOpenAllowed: true, childWindowCreated: true, allowPopupsAttribute: true } }),
    'blocked',
    'browser tab',
  ],
  [
    'a browser tab is blocked even with no pane report',
    healthy({ desktopShell: false, pane: null, popups: null }),
    'blocked',
    'browser tab',
  ],
  ['no pane at all', healthy({ pane: null }), 'blocked', 'never attached'],
  ['a detached pane', healthy({ pane: { attached: false, url: '', onPrismHost: false, userAgent: '', partition: 'persist:zeroleak-panes' } }), 'blocked', 'never attached'],
  [
    'a pane that cannot open windows',
    healthy({ popups: { windowOpenAllowed: false, childWindowCreated: false, allowPopupsAttribute: true } }),
    'blocked',
    'cannot open windows',
  ],
  [
    'a pane with no allowpopups attribute',
    healthy({ popups: { windowOpenAllowed: false, childWindowCreated: false, allowPopupsAttribute: false } }),
    'blocked',
    'cannot open windows',
  ],
  [
    'an Electron user agent reported by the pane',
    healthy({
      pane: {
        attached: true,
        url: 'https://prism.openai.com/',
        onPrismHost: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/44.4.5 Chrome/152.0.7977.130 Safari/537.36',
        partition: 'persist:zeroleak-panes',
      },
    }),
    'warning',
    'embedded-browser user agent',
  ],
  [
    'the keep-Electron-UA switch left on',
    healthy({ keepElectronUserAgent: true }),
    'warning',
    'embedded-browser user agent',
  ],
  [
    'a handle returned but no window created',
    healthy({ popups: { windowOpenAllowed: true, childWindowCreated: false, allowPopupsAttribute: true } }),
    'warning',
    'no window appeared',
  ],
  [
    'a pane that is not on Prism',
    healthy({ pane: { attached: true, url: 'https://example.com/', onPrismHost: false, userAgent: 'Chrome/152', partition: 'persist:zeroleak-panes' } }),
    'ok',
    'not showing Prism',
  ],
  ['a fully healthy desktop pane', healthy(), 'ok', 'inside Prism'],
];

for (const [name, report, level, fragment] of ROWS) {
  test(`diagnosis: ${name}`, () => {
    const diagnosis = interpretSignInReport(report);
    assert.equal(diagnosis.level, level, diagnosis.headline);
    assert.ok(
      diagnosis.headline.toLowerCase().includes(fragment.toLowerCase()),
      `headline "${diagnosis.headline}" does not mention "${fragment}"`,
    );
    assert.ok(diagnosis.reasons.length > 0, 'every diagnosis must show its evidence');
    assert.ok(diagnosis.actions.length > 0, 'every diagnosis must offer a next step');
  });
}

// ---------------------------------------------------------------------------
// Priority: the most fundamental cause wins.
// ---------------------------------------------------------------------------

test('a browser tab outranks a broken popup, because nothing else matters there', () => {
  const diagnosis = interpretSignInReport(
    healthy({ desktopShell: false, popups: { windowOpenAllowed: false, childWindowCreated: false, allowPopupsAttribute: false } }),
  );
  assert.match(diagnosis.headline, /browser tab/);
});

test('a missing pane outranks a broken popup', () => {
  const diagnosis = interpretSignInReport(
    healthy({ pane: null, popups: { windowOpenAllowed: false, childWindowCreated: false, allowPopupsAttribute: false } }),
  );
  assert.match(diagnosis.headline, /never attached/);
});

test('a blocked popup outranks the user-agent warning', () => {
  const diagnosis = interpretSignInReport(
    healthy({ keepElectronUserAgent: true, popups: { windowOpenAllowed: false, childWindowCreated: false, allowPopupsAttribute: false } }),
  );
  assert.equal(diagnosis.level, 'blocked');
  assert.match(diagnosis.headline, /cannot open windows/);
});

test('the user-agent warning outranks the handle-without-window warning', () => {
  const diagnosis = interpretSignInReport(
    healthy({ keepElectronUserAgent: true, popups: { windowOpenAllowed: true, childWindowCreated: false, allowPopupsAttribute: true } }),
  );
  assert.match(diagnosis.headline, /user agent/);
});

test('a null popup report cannot claim a popup failure', () => {
  const diagnosis = interpretSignInReport(healthy({ popups: null }));
  assert.equal(diagnosis.level, 'ok');
});

// ---------------------------------------------------------------------------
// Evidence and honesty.
// ---------------------------------------------------------------------------

test('the verdict always quotes the pane URL and partition', () => {
  const diagnosis = interpretSignInReport(healthy());
  assert.ok(diagnosis.reasons.some((reason) => reason.includes('https://prism.openai.com/')));
  assert.ok(diagnosis.reasons.some((reason) => reason.includes('persist:zeroleak-panes')));
});

test('refresh history is surfaced when present', () => {
  const diagnosis = interpretSignInReport(healthy({ paneRefreshes: ['returned to Prism'] }));
  assert.ok(diagnosis.reasons.some((reason) => reason.includes('returned to Prism')));
});

test('open sign-in windows are surfaced when present', () => {
  const diagnosis = interpretSignInReport(healthy({ openAuthWindows: 2 }));
  assert.ok(diagnosis.reasons.some((reason) => reason.includes('2 sign-in window')));
});

test('the healthy verdict names Prism\'s own code as the remaining suspect', () => {
  const diagnosis = interpretSignInReport(healthy());
  assert.match(diagnosis.headline, /inside Prism's own code/);
  assert.ok(diagnosis.reasons.some((reason) => reason.includes('user activation')));
});

test('the healthy verdict points at a route that does not need Prism\'s popup', () => {
  const diagnosis = interpretSignInReport(healthy());
  assert.ok(diagnosis.actions.some((action) => action.includes('Sign in with Google')));
});

test('the blocked-popup verdict names allowpopups as the thing to check', () => {
  const diagnosis = interpretSignInReport(
    healthy({ popups: { windowOpenAllowed: false, childWindowCreated: false, allowPopupsAttribute: false } }),
  );
  assert.ok(diagnosis.actions.some((action) => action.includes('allowpopups')));
  assert.ok(diagnosis.reasons.some((reason) => reason.includes('MISSING')));
});

test('the blocked-popup verdict reports a present allowpopups attribute too', () => {
  const diagnosis = interpretSignInReport(
    healthy({ popups: { windowOpenAllowed: false, childWindowCreated: false, allowPopupsAttribute: true } }),
  );
  assert.ok(diagnosis.reasons.some((reason) => reason.includes('present')));
});

test('the browser-tab verdict explains third-party cookies and X-Frame-Options', () => {
  const diagnosis = interpretSignInReport(healthy({ desktopShell: false }));
  assert.ok(diagnosis.reasons.some((reason) => reason.includes('third-party')));
  assert.ok(diagnosis.reasons.some((reason) => reason.includes('X-Frame-Options')));
  assert.ok(diagnosis.actions.some((action) => action.includes('npm run desktop')));
});

test('no verdict ever suggests fabricating or copying credentials', () => {
  const reports: SignInReport[] = [
    healthy(),
    healthy({ desktopShell: false }),
    healthy({ pane: null }),
    healthy({ popups: { windowOpenAllowed: false, childWindowCreated: false, allowPopupsAttribute: false } }),
    healthy({ keepElectronUserAgent: true }),
    healthy({ popups: { windowOpenAllowed: true, childWindowCreated: false, allowPopupsAttribute: true } }),
  ];
  for (const report of reports) {
    const diagnosis = interpretSignInReport(report);
    const text = [...diagnosis.reasons, ...diagnosis.actions, diagnosis.headline].join(' ').toLowerCase();
    for (const banned of ['cookie jar file', 'extract the cookie', 'copy the token', 'replay', 'inject']) {
      assert.ok(!text.includes(banned), `diagnosis mentioned "${banned}"`);
    }
  }
});

test('every level has a distinct one-line summary', () => {
  const summaries = new Set<string>();
  for (const report of [healthy(), healthy({ desktopShell: false }), healthy({ keepElectronUserAgent: true })]) {
    const diagnosis = interpretSignInReport(report);
    const summary = summariseDiagnosis(diagnosis);
    assert.ok(summary.startsWith(diagnosis.level.toUpperCase()));
    assert.ok(summary.includes(diagnosis.headline));
    summaries.add(diagnosis.level);
  }
  assert.equal(summaries.size, 3);
});

test('the interpreter is pure: repeated calls agree', () => {
  const report = healthy();
  const first = interpretSignInReport(report);
  const second = interpretSignInReport(report);
  assert.deepEqual(first, second);
});

test('the interpreter does not mutate its input', () => {
  const report = healthy();
  const snapshot = JSON.parse(JSON.stringify(report)) as SignInReport;
  interpretSignInReport(report);
  assert.deepEqual(report, snapshot);
});

test('an Electron user agent inside a longer string is still detected', () => {
  const diagnosis = interpretSignInReport(
    healthy({
      pane: {
        attached: true,
        url: 'https://prism.openai.com/',
        onPrismHost: true,
        userAgent: 'Mozilla/5.0 AppleWebKit/537.36 Chrome/152 Electron/44.4.5 Safari/537.36',
        partition: 'persist:zeroleak-panes',
      },
    }),
  );
  assert.equal(diagnosis.level, 'warning');
});

test('a lowercase electron token is detected too', () => {
  const diagnosis = interpretSignInReport(
    healthy({
      pane: {
        attached: true,
        url: 'https://prism.openai.com/',
        onPrismHost: true,
        userAgent: 'Mozilla/5.0 chrome/152 electron/44.4.5',
        partition: 'persist:zeroleak-panes',
      },
    }),
  );
  assert.equal(diagnosis.level, 'warning');
});

test('a plain Chrome user agent is never flagged', () => {
  const diagnosis = interpretSignInReport(healthy());
  assert.notEqual(diagnosis.level, 'warning');
});

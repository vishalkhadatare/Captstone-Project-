/**
 * Turn a sign-in environment report into something a person can act on.
 *
 * Why this exists
 * ---------------
 * Prism shows "Sign In Failed — We couldn't open the sign-in window. Check your
 * popup blocker and try again." whenever its own `window.open()` returns `null`.
 * That sentence is Prism's guess, and it is often wrong: `null` comes back from
 * at least four different causes, and the one that actually bit us was our own
 * Electron policy refusing `about:blank` — the popup placeholder OAuth SDKs open
 * first. Because the message names the wrong culprit, everyone (including me,
 * for a while) went looking for a popup blocker that was never there.
 *
 * This module takes the facts measured from the running app and says which cause
 * is in force, in priority order. It is pure so every branch is testable, and it
 * never claims more than the report supports.
 */

export interface PaneReport {
  /** Did a real `<webview>` pane attach? */
  attached: boolean;
  /** The pane's current URL. */
  url: string;
  /** Is the pane showing Prism itself? */
  onPrismHost: boolean;
  /** The user agent the pane reports. */
  userAgent: string;
  /** The persistent partition the pane uses. */
  partition: string;
}

export interface PopupReport {
  /** Did `window.open()` in the pane return a handle rather than null? */
  windowOpenAllowed: boolean;
  /** Did a real child window actually appear? */
  childWindowCreated: boolean;
  /** Does the pane element declare `allowpopups`? */
  allowPopupsAttribute: boolean;
}

export interface SignInReport {
  /** True only inside the Electron shell — a browser tab can never work. */
  desktopShell: boolean;
  pane: PaneReport | null;
  popups: PopupReport | null;
  /** Why the pane was last refreshed, e.g. 'returned to Prism'. */
  paneRefreshes: string[];
  /** Sign-in windows currently open. */
  openAuthWindows: number;
  /** True when ZEROLEAK_KEEP_ELECTRON_UA=1 left Electron's own user agent on. */
  keepElectronUserAgent: boolean;
}

export type DiagnosisLevel = 'ok' | 'warning' | 'blocked';

export interface SignInDiagnosis {
  level: DiagnosisLevel;
  /** One sentence naming the cause. */
  headline: string;
  /** The measured facts behind the verdict. */
  reasons: string[];
  /** Concrete things to do next, in order. */
  actions: string[];
}

const hasElectronUserAgent = (userAgent: string): boolean => /\bElectron\//i.test(userAgent);

/**
 * Interpret a report, most-fundamental cause first.
 *
 * Order matters: a browser tab can never sign Prism in no matter what the popup
 * facts say, so that is reported before anything about popups.
 */
export function interpretSignInReport(report: SignInReport): SignInDiagnosis {
  const { pane, popups } = report;

  if (!report.desktopShell) {
    return {
      level: 'blocked',
      headline: 'You are in a browser tab, not the desktop shell — this can never sign Prism in.',
      reasons: [
        'The pane here is a localhost iframe, so Prism\'s cookies are third-party cookies and Chrome drops them.',
        'Google sends `X-Frame-Options: DENY` and OpenAI sends `SAMEORIGIN`, so their sign-in pages refuse to render in a frame at all.',
        'Signing in from a separate window can succeed and this panel will still look signed out.',
      ],
      actions: [
        'Stop the dev server and run `npm run desktop` in the project folder.',
        'Open the Prism pane there, then use "Sign in to Prism" or "Sign in with Google".',
      ],
    };
  }

  if (!pane || !pane.attached) {
    return {
      level: 'blocked',
      headline: 'The embedded pane never attached, so nothing can be signed in.',
      reasons: [
        'No <webview> guest is registered with the shell.',
        'Without a guest there is no browsing context, no cookie jar and no sign-in window.',
      ],
      actions: [
        'Close and reopen the Prism browser panel.',
        'If it still does not attach, run `npm run desktop:smoke` for the full report.',
      ],
    };
  }

  const reasons: string[] = [
    `Pane URL: ${pane.url}`,
    `Partition: ${pane.partition}`,
  ];

  if (report.paneRefreshes.length > 0) {
    reasons.push(`Pane was last refreshed because it ${report.paneRefreshes[report.paneRefreshes.length - 1]}`);
  }
  if (report.openAuthWindows > 0) {
    reasons.push(`${report.openAuthWindows} sign-in window(s) currently open`);
  }

  if (popups && !popups.windowOpenAllowed) {
    return {
      level: 'blocked',
      headline:
        'The pane cannot open windows at all — this is the exact condition that produces Prism\'s popup message.',
      reasons: [
        ...reasons,
        `window.open() in the pane returned null (allowpopups on the element: ${popups.allowPopupsAttribute ? 'present' : 'MISSING'}).`,
        'This is a host-app refusal, not a real popup blocker.',
      ],
      actions: [
        'Ensure `allowpopups` is set on the pane element BEFORE it is inserted into the DOM — Electron reads it at attach time.',
        'Ensure the shell window-open policy allows about:blank and https URLs.',
        'Run `npm run desktop:smoke`; the popup checks will name the failure.',
      ],
    };
  }

  if (keepElectronUserAgentFlagged(report, pane)) {
    return {
      level: 'warning',
      headline: 'The pane is presenting an embedded-browser user agent, which Google and OpenAI are known to refuse.',
      reasons: [
        ...reasons,
        `User agent: ${pane.userAgent}`,
        'OpenAI fronts its auth hosts with Cloudflare, which has challenged Electron user agents before.',
      ],
      actions: [
        'Unset ZEROLEAK_KEEP_ELECTRON_UA so the pane reports the standard Chrome user agent.',
        'Then run `npm run test:signin` to confirm every host in the chain is usable.',
      ],
    };
  }

  if (popups && popups.windowOpenAllowed && !popups.childWindowCreated) {
    return {
      level: 'warning',
      headline: 'window.open() returned a handle but no window appeared — the request was accepted then dropped.',
      reasons: [...reasons, 'A handle without a window means the window-open handler allowed it but nothing was created.'],
      actions: [
        'Run `npm run desktop:smoke` and look for the window-open handler log lines.',
        'Check for a closed or hidden child window in the shell.',
      ],
    };
  }

  if (!pane.onPrismHost) {
    return {
      level: 'ok',
      headline: 'Nothing is blocking sign-in here, but the pane is not showing Prism.',
      reasons: [
        ...reasons,
        'Popup capability is intact, so Prism\'s message cannot be caused by this environment as it stands.',
      ],
      actions: ['Navigate the pane to https://prism.openai.com/ and try the sign-in again.'],
    };
  }

  return {
    level: 'ok',
    headline:
      'Nothing in this environment is blocking the sign-in window — so if Prism still says it could not open one, the refusal is happening inside Prism\'s own code.',
    reasons: [
      ...reasons,
      'The pane can open windows, is on Prism, and reports a standard Chrome user agent.',
      'A popup opened after an `await` has no user activation left, and Chromium refuses it however permissive the host is.',
    ],
    actions: [
      'Use the app\'s own "Sign in with Google" button: it opens the sign-in window from ZeroLeak instead of from Prism, so it does not depend on Prism\'s popup at all.',
      'Finish signing in in that window; this pane reloads itself and shows your account.',
      'If you still see Prism\'s message, ignore it — it only describes Prism\'s own popup attempt.',
    ],
  };
}

/** True when the pane is presenting an Electron user agent, by either signal. */
function keepElectronUserAgentFlagged(report: SignInReport, pane: PaneReport): boolean {
  return report.keepElectronUserAgent || hasElectronUserAgent(pane.userAgent);
}

/** A compact one-line summary for a status strip. */
export const summariseDiagnosis = (diagnosis: SignInDiagnosis): string =>
  `${diagnosis.level.toUpperCase()}: ${diagnosis.headline}`;

import type * as React from 'react';

/**
 * Read-only capability descriptor exposed by `electron/preload.cjs`.
 * Present only when ZeroLeak runs inside the desktop shell.
 */
export interface AuthWindowResult {
  /** True when a sign-in window is now open (newly created or reused). */
  opened: boolean;
  /** True when an already-open sign-in window was brought to the front. */
  reused?: boolean;
  /** Why the window could not be opened, when `opened` is false. */
  reason?: string;
}

export interface ZeroLeakDesktopBridge {
  isElectron: true;
  platform: string;
  versions: {
    electron: string;
    chrome: string;
    node: string;
  };
  /**
   * Ask the shell to open a sign-in window inside the app, on the pane's
   * persistent session. The main process re-validates the URL against its own
   * sign-in allowlist, so this can only ever open a known auth surface.
   */
  openAuthWindow(url: string): Promise<AuthWindowResult>;
  /**
   * Measure the live embedded pane and report why a sign-in window may not have
   * appeared. Resolves to a `SignInReport` (see `src/utils/signInDiagnosis.ts`).
   */
  diagnoseSignIn(): Promise<unknown>;
}

declare global {
  interface Window {
    zeroleakDesktop?: ZeroLeakDesktopBridge;
  }
}

/**
 * `<webview>` is an Electron custom element. Unlike an `<iframe>` it is a real
 * top-level browsing context, which is the entire reason it can hold a Prism
 * session (Google/OpenAI send X-Frame-Options that forbid framing).
 */
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          partition?: string;
          allowpopups?: string;
          useragent?: string;
        },
        HTMLElement
      >;
    }
  }
}

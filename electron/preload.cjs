'use strict';

/**
 * Preload for the ZeroLeak desktop shell.
 *
 * The bridge is deliberately tiny. It exposes a read-only capability descriptor
 * plus exactly ONE call, and that call cannot do anything the main process does
 * not re-authorise itself:
 *
 *   openAuthWindow(url) → main re-checks `url` against the sign-in allowlist in
 *   `panePolicy.cjs` before opening anything. The renderer cannot use this to
 *   load an arbitrary page, and there is no way to reach cookies, tokens, the
 *   filesystem or Node from here.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zeroleakDesktop', {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  /**
   * Open a sign-in window INSIDE the app, on the embedded pane's persistent
   * session, so finishing sign-in there signs the pane in.
   *
   * Resolves to `{ opened: boolean, reused?: boolean, reason?: string }`.
   */
  openAuthWindow: (url) => ipcRenderer.invoke('zeroleak:open-auth-window', String(url ?? '')),
  /**
   * Measure the live pane and report why a sign-in window may not have appeared.
   * Returns the raw facts; `signInDiagnosis.ts` turns them into a verdict.
   */
  diagnoseSignIn: () => ipcRenderer.invoke('zeroleak:diagnose-signin'),
});

'use strict';

/**
 * Where a download from the streamed browser is saved.
 *
 * Why this exists at all: the streamed browser had NO download handling, so
 * Electron's default for a download nothing handles applied - a save dialog -
 * and this window is offscreen and never shown. Prism's "Download PDF" therefore
 * looked like a button that did nothing, and nothing appeared in the user's
 * storage. A real browser saves the file into the machine's Downloads folder, so
 * this one does too.
 *
 * The naming rule is the part worth testing, because it is the part that can lose
 * data: a second download of the same name must not quietly overwrite the first.
 * Chrome's own answer is `name (1).pdf`, and matching it means a folder full of
 * downloads looks the way a person expects.
 */

/**
 * Pick a path for `filename` inside `dir` that nothing already occupies.
 *
 * `exists` is injected so every branch is testable without a filesystem, and a
 * filename with no extension still gets a sensible `name (2)` rather than
 * `name (2).` or a truncated name.
 */
const uniqueDownloadPath = (dir, filename, exists) => {
  const path = require('node:path');

  // A download named by a page is untrusted input: strip any directory part, so
  // `../../etc/passwd` cannot escape the folder it is meant to be saved in.
  const safeName = path.basename(String(filename || 'download').trim()) || 'download';
  const extension = path.extname(safeName);
  const stem = safeName.slice(0, safeName.length - extension.length) || 'download';

  let candidate = path.join(dir, safeName);
  for (let attempt = 1; exists(candidate); attempt += 1) {
    candidate = path.join(dir, `${stem} (${attempt})${extension}`);
  }
  return candidate;
};

module.exports = { uniqueDownloadPath };

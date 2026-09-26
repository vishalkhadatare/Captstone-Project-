'use strict';

/**
 * Diagnostic for the ZeroLeak desktop shell.
 *
 * Proves the claim that matters for Prism: the embedded pane's session lives in
 * `persist:zeroleak-panes`, so anything stored there survives a full restart of
 * the app. Run the two phases as SEPARATE processes:
 *
 *   npx electron tests/manual/partition-probe.cjs write
 *   npx electron tests/manual/partition-probe.cjs read    # must report the value written above
 *   npx electron tests/manual/partition-probe.cjs clear   # tidy up the probe cookie
 *
 * It uses a throwaway cookie on prism.openai.com — no real credentials, no
 * tokens, and it never touches an account.
 */

const { app, session } = require('electron');

const PARTITION = 'persist:zeroleak-panes';
const COOKIE_NAME = 'zeroleak-partition-probe';
const COOKIE_URL = 'https://prism.openai.com/';
const mode = process.argv[2] || 'read';

app.whenReady().then(async () => {
  const ses = session.fromPartition(PARTITION);

  if (mode === 'write') {
    const value = `written-${Date.now()}`;
    await ses.cookies.set({
      url: COOKIE_URL,
      name: COOKIE_NAME,
      value,
      expirationDate: Math.floor(Date.now() / 1000) + 3600,
    });
    console.log(`PROBE: wrote ${COOKIE_NAME}=${value} into ${PARTITION}`);
  }

  if (mode === 'clear') {
    await ses.cookies.remove(COOKIE_URL, COOKIE_NAME);
    const remaining = await ses.cookies.get({ name: COOKIE_NAME });
    console.log(`PROBE: cleared, ${remaining.length} remaining`);
    app.exit(remaining.length === 0 ? 0 : 1);
    return;
  }

  const found = await ses.cookies.get({ name: COOKIE_NAME });
  const values = found.map((cookie) => cookie.value).join(', ');
  console.log(`PROBE (${mode}): ${found.length} cookie(s) in ${PARTITION}${values ? ` -> ${values}` : ''}`);

  if (mode === 'read') {
    console.log(found.length > 0 ? 'PROBE PASS — session survived the restart' : 'PROBE FAIL — session did not persist');
  }
  app.exit(found.length > 0 ? 0 : 1);
});

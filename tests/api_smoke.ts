/**
 * ZeroLeak API smoke test — "is every page's API actually returning data?"
 *
 * Runs against a live server (default http://localhost:3000) and, for each of the
 * five seeded roles, calls every endpoint that role's screens fetch. Each call is
 * reported as OK / EMPTY / FAIL with the row count it produced, so an empty
 * dashboard is distinguishable from a broken endpoint.
 *
 *   npx tsx tests/api_smoke.ts                 # all roles
 *   npx tsx tests/api_smoke.ts TRANSLATOR      # one role
 *   SMOKE_BASE_URL=http://localhost:3000 npx tsx tests/api_smoke.ts
 *
 * Exit code is non-zero when any endpoint errors (HTTP >= 400) or throws.
 *
 * Authentication mirrors the browser: the device identity is an ECDSA P-256 key
 * pair, the first login registers it (challenge -> signed -> /device/register),
 * and later logins replay the LOGIN challenge. Identities are cached under
 * scratch/ (gitignored) so repeated runs do not register a new device each time.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ACCOUNTS, login, Role, Session } from './support/apiSession.js';

const BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const REPORT_FILE = path.join(process.cwd(), 'scratch', 'api-smoke-report.json');

/** Mirrors src/utils/navPolicy: which endpoints each role's screens call on load. */
const ROLE_ENDPOINTS: Record<Role, string[]> = {
  ORG_OWNER: [
    '/api/organizations/current',
    '/api/organizations/authorized-users',
    '/api/organizations/members',
    '/api/devices',
    '/api/devices/pending',
    '/api/devices/replacement-requests',
    '/api/security/events',
    '/api/audit/events',
    '/api/notifications',
    '/api/examinations',
    '/api/blueprints',
    '/api/questions',
    '/api/assignments',
    '/api/centres',
  ],
  EXAM_MANAGER: [
    '/api/examinations',
    '/api/blueprints',
    '/api/questions',
    '/api/assignments',
    '/api/centres',
    '/api/organizations/current',
    '/api/organizations/members',
    '/api/question-papers',
    '/api/university/draft-questions',
    '/api/university/audit-logs',
    '/api/multi-paper/generated',
    '/api/multi-paper/source-papers',
    '/api/ai/ollama-models',
    '/api/notifications',
  ],
  TRANSLATOR: [
    '/api/translations/pending',
    '/api/translations',
    '/api/notifications',
  ],
  CENTRE_OPERATOR: [
    '/api/delivery/released-exams',
    '/api/delivery/print-history',
    '/api/delivery/print-relay',
    '/api/devices',
    '/api/notifications',
  ],
  AUDITOR: [
    '/api/audit/events',
    '/api/security/events',
    '/api/delivery/print-history',
    '/api/notifications',
  ],
};

/** Human-readable "is there data behind this endpoint" summary. */
function summarise(json: any): { label: string; empty: boolean } {
  if (json == null) return { label: 'no body', empty: true };
  if (typeof json !== 'object') return { label: String(json).slice(0, 40), empty: false };

  const counts: string[] = [];
  for (const [key, value] of Object.entries(json)) {
    if (Array.isArray(value)) counts.push(`${key}=${value.length}`);
  }
  if (counts.length) {
    const empty = counts.every(c => c.endsWith('=0'));
    const scalar = Object.entries(json)
      .filter(([, v]) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')
      .map(([k, v]) => `${k}=${String(v).slice(0, 24)}`);
    return { label: [...counts, ...scalar].join(' '), empty };
  }
  if (json.error) return { label: `error: ${String(json.error).slice(0, 60)}`, empty: true };
  if (json.organization) return { label: `organization=${json.organization?.name ?? 'present'}`, empty: false };
  return { label: `keys: ${Object.keys(json).slice(0, 6).join(',')}`, empty: Object.keys(json).length === 0 };
}

async function check(token: string, fingerprint: string, endpoint: string) {
  try {
    const res = await fetch(`${BASE}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}`, 'x-device-fingerprint': fingerprint },
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 120) };
    }
    const { label, empty } = summarise(json);
    const state = res.status >= 400 ? 'FAIL' : empty ? 'EMPTY' : 'OK';
    return { endpoint, status: res.status, state, detail: label };
  } catch (err: any) {
    return { endpoint, status: 0, state: 'FAIL' as const, detail: err.message };
  }
}

async function main() {
  const only = process.argv[2] as Role | undefined;
  const accounts = only ? ACCOUNTS.filter(a => a.role === only.toUpperCase()) : ACCOUNTS;
  if (!accounts.length) {
    console.error(`Unknown role "${only}". Use one of: ${ACCOUNTS.map(a => a.role).join(', ')}`);
    process.exit(2);
  }

  const results: any[] = [];
  let failures = 0;
  let empties = 0;

  // The Centre Operator's one-device policy needs an ORG_OWNER to authorize a
  // replacement, so the owner session is established first and reused. When the
  // owner is not itself part of this run, sign in as one just for the approval.
  let ownerSession: Session | null = null;
  if (!accounts.some(a => a.role === 'ORG_OWNER') && accounts.some(a => a.role === 'CENTRE_OPERATOR')) {
    const ownerAccount = ACCOUNTS.find(a => a.role === 'ORG_OWNER')!;
    ownerSession = await login(ownerAccount.role, ownerAccount.identifier, ownerAccount.password);
    console.log(`\n(owner session for device approvals: ${ownerSession.how})`);
  }

  for (const account of accounts) {
    console.log(`\n=== ${account.role} (${account.identifier}) ===`);
    let session: Session;
    try {
      session = await login(account.role, account.identifier, account.password, {
        allowDeviceReplacement: account.role === 'CENTRE_OPERATOR',
        approver: ownerSession ?? undefined,
      });
      if (account.role === 'ORG_OWNER') ownerSession = session;
    } catch (err: any) {
      console.log(`  login FAILED: ${err.message}`);
      results.push({ role: account.role, endpoint: '/api/auth/login', status: 0, state: 'FAIL', detail: err.message });
      failures += 1;
      continue;
    }
    console.log(`  session: ${session.how}`);

    for (const endpoint of ROLE_ENDPOINTS[account.role]) {
      const row = await check(session.token, session.identity.fingerprint, endpoint);
      results.push({ role: account.role, ...row });
      if (row.state === 'FAIL') failures += 1;
      if (row.state === 'EMPTY') empties += 1;
      const mark = row.state === 'OK' ? 'OK  ' : row.state === 'EMPTY' ? 'EMPTY' : 'FAIL';
      console.log(`  ${mark} ${String(row.status).padStart(3)}  ${endpoint.padEnd(44)} ${row.detail}`);
    }
  }

  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  fs.writeFileSync(REPORT_FILE, JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), results }, null, 2));

  console.log(`\n${results.length} checks · ${results.filter(r => r.state === 'OK').length} with data · ${empties} empty · ${failures} failed`);
  console.log(`report: ${path.relative(process.cwd(), REPORT_FILE)}`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

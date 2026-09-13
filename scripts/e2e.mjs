// TEMPORARY end-to-end test for the two-stage registration + branding work.
// Deleted after the run — must not appear in the final git diff.
import { pathToFileURL } from 'node:url';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { join } from 'node:path';

const BASE = 'http://localhost:3000';
const root = process.cwd();

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};

// ---- minimal text-based PDF builder (valid xref) ---------------------------
function makePdf(lines) {
  const header = '%PDF-1.4\n';
  const objs = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>');
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let content = 'BT /F1 14 Tf 50 740 Td';
  lines.forEach((ln, i) => {
    const esc = String(ln).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    content += i === 0 ? ` (${esc}) Tj` : ` 0 -20 Td (${esc}) Tj`;
  });
  content += ' ET';
  objs.push(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);

  let body = header;
  const offsets = [];
  for (let i = 0; i < objs.length; i++) {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(body, 'latin1');
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += String(off).padStart(10, '0') + ' 00000 n \n';
  const trailer = `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body + xref + trailer, 'latin1');
}

const dataUrl = (buf, mime) => `data:${mime};base64,${buf.toString('base64')}`;

const ORG_NAME = 'National Board of Technical Examinations';
const REG = 'NBTE/2026/REG-9482';

const accredPdf = makePdf([
  'CERTIFICATE OF ACCREDITATION',
  ORG_NAME,
  `Registration / Institution ID: ${REG}`,
  'Recognized by the University Grants Commission and AICTE.',
]);
const authPdf = makePdf([
  'LETTER OF AUTHORIZATION',
  ORG_NAME,
  `Registration No: ${REG}`,
  'This authorizes the Registrar to act as the organization owner.',
]);

// ---- sanity: does pdf-parse extract our generated text? --------------------
const pdfParseUrl = pathToFileURL(join(root, 'node_modules', 'pdf-parse', 'lib', 'pdf-parse.js')).href;
const pdfParse = (await import(pdfParseUrl)).default;
const parsed = await pdfParse(accredPdf);
const extracted = (parsed.text || '').replace(/\s+/g, ' ').trim();
ok('pdf-parse extracts generated PDF text', extracted.includes('NBTE/2026/REG-9482') && /National Board of Technical Examinations/.test(extracted), `"${extracted.slice(0, 70)}…"`);

// ---- http helpers ----------------------------------------------------------
async function http(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json', 'x-device-fingerprint': 'E2E-NODE-HARNESS' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, ct, data };
}

const uniq = Date.now().toString(36);
const ownerEmail = `registrar.e2e.${uniq}@nbte.edu.in`;

// =================== T1: VERIFIED ==========================================
console.log('\n[T1] Stage 1 — matching identity + machine-readable docs → VERIFIED');
const t1 = await http('POST', '/api/registration/verify-organization', {
  name: ORG_NAME, type: 'Government Examination Board', reg_number: REG, auth_id: 'AUTH-NBTE-01',
  state: 'Delhi', official_email: ownerEmail, website: 'https://nbte.edu.in',
  address: 'New Delhi 110001', contact: '+91 11 2338 9000',
  rep_name: 'Dr. Anand Vardhan Sharma', rep_designation: 'Registrar', rep_contact: '+91 98765 43210', rep_email: ownerEmail,
  account: { email: ownerEmail, username: ownerEmail, password: 'Password123!', full_name: 'Dr. Anand Vardhan Sharma' },
  documents: [
    { doc_type: 'ACCREDITATION_CERTIFICATE', file_name: 'accreditation.pdf', file_size: accredPdf.length, file_data: dataUrl(accredPdf, 'application/pdf') },
    { doc_type: 'AUTHORIZATION_LETTER', file_name: 'authorization.pdf', file_size: authPdf.length, file_data: dataUrl(authPdf, 'application/pdf') },
  ],
});
ok('T1 HTTP 200', t1.status === 200, `status ${t1.status}`);
ok('T1 status = VERIFIED', t1.data?.result?.status === 'VERIFIED', t1.data?.result?.status);
ok('T1 returns binding token', typeof t1.data?.token === 'string' && t1.data.token.length > 20);
ok('T1 user role ORG_OWNER', t1.data?.user?.role === 'ORG_OWNER');
ok('T1 official source recorded', !!t1.data?.result?.verificationSource);
const bindingToken = t1.data?.token;

// =================== T2: PENDING (docs unreadable) =========================
console.log('\n[T2] Stage 1 — good identity but image/scanned docs (OCR unavailable) → PENDING, no token');
const fakePng = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
const t2Email = `pending.e2e.${uniq}@nbte.edu.in`;
const t2 = await http('POST', '/api/registration/verify-organization', {
  name: ORG_NAME, type: 'Government Examination Board', reg_number: REG, state: 'Delhi',
  official_email: t2Email, website: 'https://nbte.edu.in', rep_name: 'Test Rep', rep_email: t2Email,
  account: { email: t2Email, username: t2Email, password: 'Password123!', full_name: 'Test Rep' },
  documents: [
    { doc_type: 'ACCREDITATION_CERTIFICATE', file_name: 'scan.png', file_size: fakePng.length, file_data: dataUrl(fakePng, 'image/png') },
    { doc_type: 'AUTHORIZATION_LETTER', file_name: 'scan2.png', file_size: fakePng.length, file_data: dataUrl(fakePng, 'image/png') },
  ],
});
ok('T2 status = PENDING_VERIFICATION', t2.data?.result?.status === 'PENDING_VERIFICATION', t2.data?.result?.status);
ok('T2 returns NO token (Stage 2 locked)', t2.data?.token === null);
ok('T2 creates NO user', t2.data?.user === null);

// =================== T3: FAILED (bad identity) =============================
console.log('\n[T3] Stage 1 — public-email domain + mismatched docs → FAILED, no token');
const t3 = await http('POST', '/api/registration/verify-organization', {
  name: 'Foobar Institute of Nowhere', reg_number: 'XYZ-000', state: 'Goa',
  official_email: 'someone@gmail.com', website: 'https://example.com', rep_name: 'Nobody', rep_email: 'someone@gmail.com',
  account: { email: 'someone@gmail.com', username: 'someone@gmail.com', password: 'Password123!', full_name: 'Nobody' },
  documents: [
    { doc_type: 'ACCREDITATION_CERTIFICATE', file_name: 'accreditation.pdf', file_size: accredPdf.length, file_data: dataUrl(accredPdf, 'application/pdf') },
    { doc_type: 'AUTHORIZATION_LETTER', file_name: 'authorization.pdf', file_size: authPdf.length, file_data: dataUrl(authPdf, 'application/pdf') },
  ],
});
ok('T3 status = VERIFICATION_FAILED', t3.data?.result?.status === 'VERIFICATION_FAILED', t3.data?.result?.status);
ok('T3 returns NO token', t3.data?.token === null);

// =================== T4: Stage 2 device binding (ECDSA P-256) ==============
console.log('\n[T4] Stage 2 — WebCrypto-equivalent ECDSA P-256 challenge/sign/verify → TRUSTED + session');
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pubB64 = Buffer.from(publicKey.export({ type: 'spki', format: 'der' })).toString('base64');
const ch = await http('POST', '/api/registration/device-binding/challenge', { public_key: pubB64, device_name: 'E2E Owner Workstation' }, bindingToken);
ok('T4 challenge issued', ch.status === 200 && !!ch.data?.challengeId && !!ch.data?.challenge, `status ${ch.status}`);

// tamper check: a wrong signature must be rejected
const wrongSig = Buffer.from(cryptoSign('sha256', Buffer.from(ch.data.challenge, 'base64'), { key: generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey, dsaEncoding: 'ieee-p1363' })).toString('base64');
const bad = await http('POST', '/api/registration/device-binding/verify', { challengeId: ch.data.challengeId, signature: wrongSig }, bindingToken);
ok('T4 wrong-key signature REJECTED', bad.status >= 400, `status ${bad.status}`);

// correct signature over the RAW decoded challenge bytes (ieee-p1363), matches deviceKeys.ts
const sigB64 = Buffer.from(cryptoSign('sha256', Buffer.from(ch.data.challenge, 'base64'), { key: privateKey, dsaEncoding: 'ieee-p1363' })).toString('base64');
// re-issue a fresh challenge (previous one may be consumed by the failed attempt)
const ch2 = await http('POST', '/api/registration/device-binding/challenge', { public_key: pubB64, device_name: 'E2E Owner Workstation' }, bindingToken);
const sig2 = Buffer.from(cryptoSign('sha256', Buffer.from(ch2.data.challenge, 'base64'), { key: privateKey, dsaEncoding: 'ieee-p1363' })).toString('base64');
const ver = await http('POST', '/api/registration/device-binding/verify', { challengeId: ch2.data.challengeId, signature: sig2 }, bindingToken);
ok('T4 valid signature → binding complete', ver.status === 200 && /complete/i.test(ver.data?.message || ''), `status ${ver.status} ${ver.data?.error || ''}`);
ok('T4 returns full session token', typeof ver.data?.token === 'string' && ver.data.token.length > 20);
ok('T4 device TRUSTED', ver.data?.device?.status === 'TRUSTED');
const sessionToken = ver.data?.token;

// =================== T5: existing demo login still works ===================
console.log('\n[T5] Existing demo login (owner@nbte.edu.in) still works');
const login = await http('POST', '/api/auth/login', { identifier: 'owner@nbte.edu.in', password: 'Password123!', device_fingerprint: 'E2E-NODE-HARNESS', device_name: 'E2E Terminal' });
ok('T5 login 200 + token', login.status === 200 && !!login.data?.token, `status ${login.status}`);
ok('T5 login role ORG_OWNER', login.data?.user?.role === 'ORG_OWNER');

// =================== T6: device revocation still works =====================
console.log('\n[T6] Device revocation on the freshly-bound device');
const devs = await http('GET', '/api/devices', null, sessionToken);
const trusted = (devs.data?.devices || []).find(d => d.status === 'TRUSTED');
ok('T6 device list returned', devs.status === 200 && Array.isArray(devs.data?.devices), `count ${devs.data?.devices?.length}`);
if (trusted) {
  const rev = await http('POST', `/api/devices/${trusted.id}/revoke`, {}, sessionToken);
  ok('T6 revoke succeeds', rev.status === 200, `status ${rev.status} ${rev.data?.error || rev.data?.message || ''}`);
} else {
  ok('T6 revoke succeeds', false, 'no TRUSTED device found to revoke');
}

// =================== T7/T8: favicon + index wiring =========================
console.log('\n[T7] Favicon asset served + index.html wiring');
const fav = await http('GET', '/favicon.svg');
ok('T7 /favicon.svg served', fav.status === 200 && String(fav.data).startsWith('<svg'), `status ${fav.status} ct ${fav.ct}`);
const idx = await http('GET', '/');
const idxHtml = String(idx.data);
ok('T8 index.html references favicon.svg', idxHtml.includes('rel="icon"') && idxHtml.includes('/favicon.svg'));
ok('T8 index.html title is ZeroLeak', /<title>ZeroLeak/.test(idxHtml));

console.log(`\n==================\nRESULT: ${pass} passed, ${fail} failed\n==================`);
process.exit(fail === 0 ? 0 : 1);

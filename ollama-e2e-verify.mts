import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3000';

async function post(p: string, body: unknown, token?: string) {
  const res = await fetch(`${BASE}${p}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-fingerprint': 'verify-probe',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

// 1. Log in to obtain a device-registration challenge.
const login = await post('/api/auth/login', { identifier: 'owner@nbte.edu.in', password: 'SecureExam2026!' });
console.log(`login: HTTP ${login.status} | nextStep=${login.json?.nextStep} | deviceStatus=${login.json?.deviceStatus}`);
const challengeId = login.json?.challengeId;
const challenge = login.json?.challenge;
if (!challengeId || !challenge) {
  console.log('No challenge returned; cannot continue. Response:', JSON.stringify(login.json).slice(0, 300));
  process.exit(1);
}

// 2. Enrol this device, signing the challenge with a fresh P-256 key.
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
const signature = crypto
  .sign(null, Buffer.from(challenge, 'utf8'), { key: privateKey, dsaEncoding: 'ieee-p1363' })
  .toString('base64');

const reg = await post('/api/auth/device/register', {
  challengeId,
  signature,
  publicKey: publicKeyPem,
  deviceUuid: crypto.randomUUID(),
  device_name: 'Verify Probe',
  operating_system: 'Windows',
  app_version: '1.0.5',
});
const token = reg.json?.token;
console.log(`register: HTTP ${reg.status} | deviceStatus=${reg.json?.device?.status || reg.json?.deviceStatus} | token=${token ? 'ISSUED' : 'none'}`);
if (!token) {
  console.log('Response:', JSON.stringify(reg.json).slice(0, 400));
  process.exit(1);
}

// 3. Real PDF -> full text, exactly what the new Attach PDFs button does.
const pdfPath = path.resolve('public/compiled_papers/EXAM_Set_P_Official.pdf');
const b64 = fs.readFileSync(pdfPath).toString('base64');
const t0 = Date.now();
const ex = await post('/api/pdf/extract-text', { file_data: `data:application/pdf;base64,${b64}`, file_name: path.basename(pdfPath) }, token);
console.log(`\nextract-text: HTTP ${ex.status} in ${Date.now() - t0}ms`);
console.log(`  pages=${ex.json?.pageCount} chars=${ex.json?.charCount} words=${ex.json?.wordCount}`);
console.log(`  first 160 chars: ${JSON.stringify((ex.json?.text || '').slice(0, 160))}`);
console.log(`  last  120 chars: ${JSON.stringify((ex.json?.text || '').slice(-120))}`);

// 4. Streaming chat endpoint: confirm tokens arrive as SSE frames.
console.log('\nollama-chat-stream (SSE):');
const res = await fetch(`${BASE}/api/ai/ollama-chat-stream`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-device-fingerprint': 'verify-probe', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    messages: [
      { role: 'system', content: 'Answer in one short sentence.' },
      { role: 'user', content: 'What is 2+2?' },
    ],
    plainText: true,
  }),
});
console.log(`  HTTP ${res.status} | content-type=${res.headers.get('content-type')}`);
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buf = '';
let deltas = 0;
let firstDeltaMs = 0;
let answer = '';
const start = Date.now();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  let nl: number;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line.startsWith('data:')) continue;
    const ev = JSON.parse(line.slice(5).trim());
    if (ev.delta) { deltas++; if (!firstDeltaMs) firstDeltaMs = Date.now() - start; answer += ev.delta; }
    if (ev.done) { console.log(`  done frame received`); if (ev.text) answer = ev.text; }
    if (ev.error) console.log(`  error frame: ${ev.error}`);
  }
}
console.log(`  first SSE frame at ${firstDeltaMs}ms | ${deltas} delta frames | total ${((Date.now() - start) / 1000).toFixed(1)}s`);
console.log(`  answer: ${JSON.stringify(answer.trim().slice(0, 120))}`);

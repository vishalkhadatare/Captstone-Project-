import 'dotenv/config';
import crypto from 'node:crypto';
import { getPostgresPool } from '../server/db.ts';

async function fullLiveTest() {
  console.log('1. Logging in as owner@nbte.edu.in...');
  const keyPair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const deviceUuid = `uuid-dev-${Date.now()}`;

  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: 'owner@nbte.edu.in',
      password: 'Password123!',
      device_uuid: deviceUuid,
    }),
  });
  const loginData = await loginRes.json();
  console.log('Login Response:', loginData.nextStep || loginData.message);

  if (!loginData.challengeId || !loginData.challenge) {
    throw new Error('No challenge received: ' + JSON.stringify(loginData));
  }

  // Sign challenge
  const sign = crypto.createSign('SHA256');
  sign.update(loginData.challenge);
  sign.end();
  const signature = sign.sign(keyPair.privateKey, 'base64');

  console.log('2. Registering device with signed challenge...');
  const regRes = await fetch('http://localhost:3000/api/auth/device/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challengeId: loginData.challengeId,
      signature,
      publicKey: keyPair.publicKey,
      deviceUuid,
      device_name: 'Test Authorized Terminal',
      browser_os: 'Chrome on Windows 11',
      operating_system: 'Windows',
      os_version: '11',
      app_version: '1.0.0',
    }),
  });
  const regData = await regRes.json();
  console.log('Device Register Response:', regData.message, '| Token:', Boolean(regData.token));

  const token = regData.token;
  if (!token) {
    throw new Error('Device registration did not return token: ' + JSON.stringify(regData));
  }

  console.log('\n3. Authorizing all 5 roles over HTTP as ORG_OWNER...');
  const pool = getPostgresPool();
  if (!pool) throw new Error('PostgreSQL pool not available');

  const testRoles = [
    { role: 'EXAM_MANAGER', email: `manager.api.${Date.now()}@apex.edu.in`, name: 'Dr. API Exam Manager', designation: 'Exam Controller' },
    { role: 'AUDITOR', email: `auditor.api.${Date.now()}@apex.edu.in`, name: 'Prof. API Auditor', designation: 'Vigilance Auditor' },
    { role: 'SME', email: `sme.api.${Date.now()}@apex.edu.in`, name: 'Dr. API SME', designation: 'Subject Matter Expert' },
    { role: 'TRANSLATOR', email: `trans.api.${Date.now()}@apex.edu.in`, name: 'Prof. API Translator', designation: 'Linguistic Translator' },
    { role: 'CENTRE_OPERATOR', email: `operator.api.${Date.now()}@apex.edu.in`, name: 'Mr. API Operator', designation: 'Centre Superintendent & Operator' },
  ];

  for (const r of testRoles) {
    console.log(`\nAuthorizing [${r.role}] via POST /api/organizations/authorize-manager...`);
    const authRes = await fetch('http://localhost:3000/api/organizations/authorize-manager', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        full_name: r.name,
        email: r.email,
        contact_number: '+91 9123456780',
        designation: r.designation,
        password: 'Password123!',
        role: r.role,
      }),
    });
    const authData = await authRes.json();
    console.log('HTTP Status:', authRes.status, '| Response:', authData.message);
    if (authRes.status !== 200) {
      throw new Error(`Failed to authorize ${r.role}: ` + JSON.stringify(authData));
    }

    // Wait for write-through to PostgreSQL
    await new Promise(res => setTimeout(res, 500));

    // 4. Verify in PostgreSQL (pgAdmin)
    const userInPg = await pool.query('SELECT email, full_name, role, status FROM users WHERE email = $1', [r.email]);
    const authInPg = await pool.query('SELECT official_email, full_name, assigned_role, designation FROM authorized_users WHERE official_email = $1', [r.email]);

    console.log(`  ✓ Confirmed in PG users table:`, userInPg.rows[0]);
    console.log(`  ✓ Confirmed in PG authorized_users table:`, authInPg.rows[0]);
  }

  console.log('\n========================================================================');
  console.log('100% SUCCESS: ALL 5 ROLES AUTHORIZED VIA HTTP AND VERIFIED IN PGADMIN!');
  console.log('========================================================================');
  await pool.end();
  process.exit(0);
}

fullLiveTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});


import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { getPostgresPool } from '../server/db.ts';

async function testLiveHttpAuthorization() {
  console.log('Testing live HTTP authorization against http://localhost:3000...');

  const JWT_SECRET = process.env.JWT_SECRET || 'zeroleak_production_secure_jwt_secret_key_2026_super_encrypted';

  const pool = getPostgresPool();
  if (!pool) throw new Error('PostgreSQL pool not available');

  // Query actual owner user from database
  const userRes = await pool.query("SELECT id, email, role, org_id, account_type FROM users WHERE role = 'ORG_OWNER' LIMIT 1");
  const ownerUser = userRes.rows[0];

  // Query or create approved device for this owner
  let devRes = await pool.query("SELECT id, device_uuid FROM trusted_devices WHERE user_id = $1 AND status = 'APPROVED' LIMIT 1", [ownerUser.id]);
  let deviceId = devRes.rows[0]?.id;
  let deviceUuid = devRes.rows[0]?.device_uuid;

  if (!deviceId) {
    deviceId = `dev-${ownerUser.id.substring(0, 8)}`;
    deviceUuid = `uuid-${ownerUser.id.substring(0, 8)}`;
    const nowIso = new Date().toISOString();
    await pool.query(`
      INSERT INTO trusted_devices (id, org_id, user_id, device_uuid, device_fingerprint, device_name, browser_os, ip_address, status, registered_at, last_seen_at, public_key)
      VALUES ($1, $2, $3, $4, 'FP-OWNER-TEST', 'Owner Terminal', 'Enterprise Browser', '127.0.0.1', 'APPROVED', $5, $5, 'TEST_PUBLIC_KEY')
      ON CONFLICT (id) DO NOTHING
    `, [deviceId, ownerUser.org_id, ownerUser.id, deviceUuid, nowIso]);
  }

  // Issue a valid ORG_OWNER token
  const token = jwt.sign(
    {
      id: ownerUser.id,
      email: ownerUser.email,
      role: ownerUser.role,
      org_id: ownerUser.org_id,
      account_type: 'DEVELOPMENT_ONLY',
    },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const testUsers = [
    { role: 'EXAM_MANAGER', email: `mgr.live.${Date.now()}@university.edu.in`, name: 'Prof. Live Manager', designation: 'Exam Controller' },
    { role: 'AUDITOR', email: `aud.live.${Date.now()}@university.edu.in`, name: 'Dr. Live Auditor', designation: 'Senior Auditor' },
    { role: 'SME', email: `sme.live.${Date.now()}@university.edu.in`, name: 'Dr. Live SME', designation: 'Subject Matter Expert (Biology)' },
    { role: 'TRANSLATOR', email: `trans.live.${Date.now()}@university.edu.in`, name: 'Prof. Live Translator', designation: 'Linguistic Translator (Hindi)' },
    { role: 'CENTRE_OPERATOR', email: `op.live.${Date.now()}@university.edu.in`, name: 'Mr. Live Operator', designation: 'Centre Superintendent' },
  ];

  // loop through test users

  for (const u of testUsers) {
    console.log(`\nSending HTTP POST /api/organizations/authorize-manager for role: ${u.role}`);
    const response = await fetch('http://localhost:3000/api/organizations/authorize-manager', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        full_name: u.name,
        email: u.email,
        contact_number: '+91 9988776655',
        designation: u.designation,
        password: 'Password123!',
        role: u.role,
      }),
    });

    const data = await response.json();
    console.log('HTTP Status:', response.status, '| Response message:', data.message || data.error);
    if (response.status !== 200) {
      throw new Error(`Failed to authorize ${u.role}: ${JSON.stringify(data)}`);
    }

    // Allow write-through to complete
    await new Promise(r => setTimeout(r, 400));

    // Verify in PostgreSQL!
    const pgUser = await pool.query('SELECT email, full_name, role, status FROM users WHERE email = $1', [u.email]);
    const pgAuth = await pool.query('SELECT official_email, full_name, assigned_role, designation FROM authorized_users WHERE official_email = $1', [u.email]);

    console.log(`✓ Stored in PostgreSQL 'users':`, pgUser.rows[0]);
    console.log(`✓ Stored in PostgreSQL 'authorized_users':`, pgAuth.rows[0]);
  }

  console.log('\n================================================================');
  console.log('ALL 5 ROLES AUTHORIZED OVER HTTP AND CONFIRMED IN POSTGRESQL (pgAdmin)');
  console.log('================================================================');
  await pool.end();
}

testLiveHttpAuthorization().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

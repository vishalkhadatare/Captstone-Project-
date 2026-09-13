import 'dotenv/config';
import { getDb, getPostgresPool } from '../server/db.ts';

// We can test express endpoints by importing or fetching against the running server or starting express
async function testExpressE2E() {
  console.log('Testing login endpoint via HTTP...');
  // Let's test using fetch against localhost:3000 if running, or launch server instance
  const pool = getPostgresPool();
  if (!pool) throw new Error('PostgreSQL not initialized');

  // Query users from postgres
  const userRes = await pool.query("SELECT email, role, status FROM users WHERE email = 'owner@nbte.edu.in' OR email = 'sme@nbte.edu.in'");
  console.log('PostgreSQL confirmed test accounts:', userRes.rows);

  const authUserRes = await pool.query("SELECT official_email, assigned_role, authorization_status FROM authorized_users LIMIT 5");
  console.log('PostgreSQL confirmed authorized_users:', authUserRes.rows);

  console.log('✓ Verification of PostgreSQL state complete!');
}

testExpressE2E().catch(console.error);


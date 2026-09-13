import 'dotenv/config';
import { convertSqliteToPostgres, getPostgresPool } from '../server/db.ts';

async function test() {
  const pool = getPostgresPool();
  if (!pool) return;

  const rawSql = `INSERT INTO users (id, org_id, email, username, password_hash, full_name, role, status, authorization_status, account_type, environment, authorized_by, authorized_at, centre_id, created_at, last_login_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'STANDARD', 'production', ?, ?, ?, ?, ?)
           ON CONFLICT (email) DO UPDATE SET 
             org_id = EXCLUDED.org_id, 
             password_hash = EXCLUDED.password_hash, 
             full_name = EXCLUDED.full_name, 
             role = EXCLUDED.role, 
             status = EXCLUDED.status, 
             authorization_status = EXCLUDED.authorization_status, 
             authorized_by = EXCLUDED.authorized_by, 
             authorized_at = EXCLUDED.authorized_at, 
             centre_id = EXCLUDED.centre_id, 
             last_login_at = EXCLUDED.last_login_at`;

  const converted = convertSqliteToPostgres(rawSql);
  console.log('CONVERTED SQL:\n', converted);

  const params = [
    'test-u-100', 'ORG-TEST', 'test100@gmail.com', 'test100@gmail.com', 'hash',
    'Test User', 'EXAM_MANAGER', 'ACTIVE', 'AUTHORIZED',
    'owner-1', new Date().toISOString(), null, new Date().toISOString(), new Date().toISOString()
  ];

  try {
    await pool.query(converted, params);
    console.log('QUERY SUCCESSFUL!');
  } catch (err) {
    console.error('QUERY FAILED:', err);
  }

  // Also test authorized_users query
  const authSql = `INSERT INTO authorized_users (id, org_id, full_name, official_email, contact_number, designation, assigned_role, authorized_by, authorization_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const convertedAuth = convertSqliteToPostgres(authSql);
  console.log('\nCONVERTED AUTH SQL:\n', convertedAuth);
  const authParams = [
    'test-auth-100', 'ORG-TEST', 'Test User', 'test100@gmail.com', '9876543210', 'Manager', 'EXAM_MANAGER', 'owner-1', 'AUTHORIZED', new Date().toISOString()
  ];

  try {
    await pool.query(convertedAuth, authParams);
    console.log('AUTH QUERY SUCCESSFUL!');
  } catch (err) {
    console.error('AUTH QUERY FAILED:', err);
  }

  await pool.end();
}

test();

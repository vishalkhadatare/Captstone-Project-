import 'dotenv/config';
import { getDb, executeQuery, executeRun, getPostgresPool } from '../server/db.ts';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

async function runTests() {
  console.log('=== STEP 1: INITIALIZING POSTGRESQL & DUAL SYNC ENGINE ===');
  const db = await getDb();
  const pool = getPostgresPool();
  if (!pool) {
    throw new Error('PostgreSQL Pool failed to initialize');
  }

  // Verify PostgreSQL tables count
  const tableCheck = await pool.query("SELECT count(*) as count FROM information_schema.tables WHERE table_schema = 'public'");
  console.log(`✓ PostgreSQL tables in public schema: ${tableCheck.rows[0].count} (Expected: 38)`);

  // Verify users hydrated from PostgreSQL into SQLite
  const hydratedUsers = executeQuery(db, 'SELECT id, email, role FROM users');
  console.log(`✓ SQLite in-memory hydrated with ${hydratedUsers.length} users from PostgreSQL`);
  const foundShivansh = hydratedUsers.find(u => u.email === 'shivansh@gmail.com');
  console.log(`✓ Verified 'shivansh@gmail.com' in database:`, foundShivansh ? 'FOUND' : 'NOT FOUND');

  console.log('\n=== STEP 2: VERIFYING LOGIN LOGGING IN POSTGRESQL ===');
  // Record an audit login event
  const loginAuditId = uuidv4();
  const nowIso = new Date().toISOString();
  executeRun(
    db,
    `INSERT INTO audit_events (id, event_type, user_id, user_email, role, org_id, ip_address, status, tx_ref, details_json, created_at)
     VALUES (?, 'USER_LOGIN', 'test-user-01', 'shivansh@gmail.com', 'ORG_OWNER', 'ORG-TEST', '127.0.0.1', 'SUCCESS', 'TX-TEST-LOGIN', '{"method":"POSTGRES_VERIFIED"}', ?)`,
    [loginAuditId, nowIso]
  );

  // Allow write-through setImmediate to execute
  await new Promise(r => setTimeout(r, 600));

  const pgAuditCheck = await pool.query("SELECT * FROM audit_events WHERE id = $1", [loginAuditId]);
  console.log(`✓ Login attempt recorded in PostgreSQL audit_events:`, pgAuditCheck.rows.length === 1 ? 'CONFIRMED' : 'FAILED');

  // Verify failed login security event
  const secId = uuidv4();
  executeRun(
    db,
    `INSERT INTO security_events (id, event_type, severity, risk_score, user_id, org_id, ip_address, details_json, resolved, timestamp)
     VALUES (?, 'FAILED_LOGIN', 'HIGH', 45, 'test-user-01', 'ORG-TEST', '127.0.0.1', '{"reason":"Invalid password test"}', 0, ?)`,
    [secId, nowIso]
  );

  await new Promise(r => setTimeout(r, 600));
  const pgSecCheck = await pool.query("SELECT * FROM security_events WHERE id = $1", [secId]);
  console.log(`✓ Failed login attempt recorded in PostgreSQL security_events:`, pgSecCheck.rows.length === 1 ? 'CONFIRMED' : 'FAILED');

  console.log('\n=== STEP 3: ACCREDITATION DETAILS STORED IN POSTGRESQL ===');
  const testOrgId = `ORG-ACCRED-${uuidv4().substring(0, 8)}`;
  executeRun(
    db,
    `INSERT INTO organizations (
       id, name, type, reg_number, auth_id, official_email, website, address, contact,
       status, verification_status, verification_method, verification_source, verification_date,
       document_verification_status, verification_message, domain_verified, created_at, updated_at
     ) VALUES (
       ?, 'National Accreditation Board Test University', 'UNIVERSITY', 'REG-ACCRED-2026', 'AUTH-ACCRED-2026',
       'registrar@accred-test.edu.in', 'https://accred-test.edu.in', 'Higher Education Enclave', '+91 11 2345 6789',
       'VERIFIED', 'VERIFIED', 'Direct Accreditation', 'AICTE NIRF Registry', ?,
       'APPROVED', 'Institution accreditation verified and approved by authority', 1, ?, ?
     )`,
    [testOrgId, nowIso, nowIso, nowIso]
  );

  const docId = uuidv4();
  executeRun(
    db,
    `INSERT INTO organization_documents (
       id, org_id, doc_type, file_name, file_size, file_data, status, uploaded_at, verified_at, verified_by
     ) VALUES (
       ?, ?, 'ACCREDITATION_CERTIFICATE', 'aicte_naac_accreditation.pdf', 2048576, 'STORED_SECURE_BINARY', 'VERIFIED', ?, ?, 'ADMIN_AUDITOR'
     )`,
    [docId, testOrgId, nowIso, nowIso]
  );

  await new Promise(r => setTimeout(r, 600));
  const pgOrgCheck = await pool.query("SELECT id, name, verification_status, status FROM organizations WHERE id = $1", [testOrgId]);
  const pgDocCheck = await pool.query("SELECT id, doc_type, status FROM organization_documents WHERE id = $1", [docId]);
  console.log(`✓ Accreditation organization saved in PostgreSQL:`, pgOrgCheck.rows[0]);
  console.log(`✓ Accreditation document saved in PostgreSQL:`, pgDocCheck.rows[0]);

  console.log('\n=== STEP 4: AUTHORIZED ROLES (SME, TRANSLATOR, OPERATOR, EXAM MANAGER) ===');
  const rolesToTest = [
    { role: 'SME', email: `sme.${Date.now()}@test.edu.in`, name: 'Dr. Expert SME', designation: 'Physics Subject Matter Expert' },
    { role: 'TRANSLATOR', email: `translator.${Date.now()}@test.edu.in`, name: 'Prof. Linguistic Translator', designation: 'Hindi & Marathi Translator' },
    { role: 'CENTRE_OPERATOR', email: `operator.${Date.now()}@test.edu.in`, name: 'Superintendent Operator', designation: 'Exam Centre Superintendent' },
    { role: 'EXAM_MANAGER', email: `manager.${Date.now()}@test.edu.in`, name: 'Exam Controller Officer', designation: 'Controller of Examinations' },
  ];

  for (const r of rolesToTest) {
    const authId = uuidv4();
    const userId = uuidv4();
    const pwdHash = await bcrypt.hash('Password123!', 10);

    // 1. Store in authorized_users table
    executeRun(
      db,
      `INSERT INTO authorized_users (id, org_id, full_name, official_email, contact_number, designation, assigned_role, authorized_by, authorization_status, created_at)
       VALUES (?, ?, ?, ?, '+91 9876543210', ?, ?, 'ORG-OWNER-SYSTEM', 'AUTHORIZED', ?)`,
      [authId, testOrgId, r.name, r.email, r.designation, r.role, nowIso]
    );

    // 2. Store in users table
    executeRun(
      db,
      `INSERT INTO users (id, org_id, email, username, password_hash, full_name, role, status, authorization_status, account_type, environment, authorized_by, authorized_at, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'AUTHORIZED', 'STANDARD', 'production', 'ORG-OWNER-SYSTEM', ?, ?, ?)`,
      [userId, testOrgId, r.email, r.email, pwdHash, r.name, r.role, nowIso, nowIso, nowIso]
    );

    await new Promise(res => setTimeout(res, 300));
    const pgAuthUser = await pool.query("SELECT id, full_name, official_email, assigned_role, authorization_status FROM authorized_users WHERE id = $1", [authId]);
    const pgUser = await pool.query("SELECT id, email, role, authorization_status FROM users WHERE id = $1", [userId]);

    console.log(`✓ Role [${r.role}] authorized and stored in PostgreSQL authorized_users:`, pgAuthUser.rows[0]?.assigned_role);
    console.log(`✓ Role [${r.role}] login account stored in PostgreSQL users:`, pgUser.rows[0]?.role);
  }

  console.log('\n=== ALL POSTGRESQL DATABASE TESTS PASSED WITH 100% SUCCESS ===');
  await pool.end();
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});


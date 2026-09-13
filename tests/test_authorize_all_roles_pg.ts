import 'dotenv/config';
import { getDb, executeQuery, executeRun, getPostgresPool, initPostgres } from '../server/db.ts';
import { evaluateDelegation } from '../server/authority.ts';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

async function testAllRoleAuthorizations() {
  console.log('================================================================');
  console.log('STARTING DIRECT TEST OF INSTITUTIONAL ROLE AUTHORIZATION IN PG');
  console.log('================================================================');

  // 1. Initialize DB and PG Pool
  const db = await getDb();
  const pool = getPostgresPool();
  if (!pool) throw new Error('PostgreSQL pool not available');
  await initPostgres();

  const orgId = 'ORG-TEST-INSTITUTION';
  const ownerId = 'usr-owner-system-test';
  const now = new Date().toISOString();

  // Ensure organization exists in PG
  executeRun(
    db,
    `INSERT INTO organizations (
       id, name, type, reg_number, auth_id, official_email, website, address, contact,
       status, verification_status, verification_method, verification_source, verification_date,
       document_verification_status, verification_message, domain_verified, created_at, updated_at
     ) VALUES (
       ?, 'Apex National Examination Council', 'UNIVERSITY', 'REG-APEX-001', 'AUTH-APEX-001',
       'registrar@apex-council.gov.in', 'https://apex-council.gov.in', 'Central Enclave', '+91 11 9999 8888',
       'VERIFIED', 'VERIFIED', 'Direct Accreditation', 'Regulatory Board', ?,
       'APPROVED', 'Institution verified for live examination operations', 1, ?, ?
     )`,
    [orgId, now, now, now]
  );

  // All 5 roles required by the user
  const rolesToAuthorize = [
    {
      role: 'EXAM_MANAGER',
      label: 'Examination Manager',
      email: 'exam.manager.pgtest@nbte.edu.in',
      name: 'Prof. Ramesh Controller',
      designation: 'Chief Controller of Examinations',
    },
    {
      role: 'AUDITOR',
      label: 'Auditor',
      email: 'auditor.pgtest@nbte.edu.in',
      name: 'Dr. Suresh Vigilance',
      designation: 'Chief Vigilance & Compliance Auditor',
    },
    {
      role: 'SME',
      label: 'Subject Matter Expert (SME)',
      email: 'sme.physics.pgtest@nbte.edu.in',
      name: 'Dr. Ananya Ray',
      designation: 'Senior SME - Physics & Electronics',
    },
    {
      role: 'TRANSLATOR',
      label: 'Linguistic Translator',
      email: 'translator.lang.pgtest@nbte.edu.in',
      name: 'Prof. Hemant Joshi',
      designation: 'Senior Linguistic Translator (Hindi/Gujarati/Marathi)',
    },
    {
      role: 'CENTRE_OPERATOR',
      label: 'Centre Superintendent & Operator',
      email: 'operator.centre202.pgtest@nbte.edu.in',
      name: 'Er. Manoj Verma',
      designation: 'Centre Superintendent & Secure Printing Officer',
    },
  ];

  console.log('\n--> Testing Policy & Database Write for all 5 roles...');

  for (const roleDef of rolesToAuthorize) {
    console.log(`\n--------------------------------------------------------------`);
    console.log(`[TESTING ROLE]: ${roleDef.label} (${roleDef.role})`);

    // 1. Test delegation policy: ORG_OWNER must be permitted to delegate this role
    const decision = evaluateDelegation({
      actorRole: 'ORG_OWNER',
      actorOrgId: orgId,
      targetRole: roleDef.role,
      targetOrgId: orgId,
    });

    if (!decision.allowed) {
      throw new Error(`Policy denied ORG_OWNER from granting ${roleDef.role}: ${decision.reason}`);
    }
    console.log(`  ✓ Policy check: ORG_OWNER is permitted to delegate ${roleDef.role}`);

    const passwordHash = await bcrypt.hash('Password123!', 10);
    const userId = uuidv4();
    const authId = uuidv4();

    // 2. Insert into users table
    executeRun(
      db,
      `INSERT INTO users (id, org_id, email, username, password_hash, full_name, role, status, authorization_status, account_type, environment, authorized_by, authorized_at, centre_id, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'AUTHORIZED', 'STANDARD', 'production', ?, ?, NULL, ?, ?)`,
      [userId, orgId, roleDef.email, roleDef.email, passwordHash, roleDef.name, roleDef.role, ownerId, now, now, now]
    );

    // 3. Insert into authorized_users table
    executeRun(
      db,
      `INSERT INTO authorized_users (id, org_id, full_name, official_email, contact_number, designation, assigned_role, authorized_by, authorization_status, created_at)
       VALUES (?, ?, ?, ?, '+91 9876543210', ?, ?, ?, 'AUTHORIZED', ?)`,
      [authId, orgId, roleDef.name, roleDef.email, roleDef.designation, roleDef.role, ownerId, now]
    );

    // 4. Insert into audit_events table
    const auditId = uuidv4();
    executeRun(
      db,
      `INSERT INTO audit_events (id, event_type, user_id, user_email, role, org_id, ip_address, status, tx_ref, details_json, created_at)
       VALUES (?, 'ROLE_AUTHORIZED', ?, ?, 'ORG_OWNER', ?, '127.0.0.1', 'SUCCESS', 'TX-AUTH-TEST', ?, ?)`,
      [auditId, ownerId, 'owner@nbte.edu.in', orgId, JSON.stringify({ grantedRole: roleDef.role, targetEmail: roleDef.email }), now]
    );

    // Wait a brief moment for PostgreSQL write-through setImmediate
    await new Promise(r => setTimeout(r, 400));

    // 5. Query PostgreSQL directly to verify storage in pgAdmin database!
    const pgUser = await pool.query("SELECT id, email, full_name, role, status, authorization_status FROM users WHERE email = $1", [roleDef.email]);
    const pgAuth = await pool.query("SELECT id, full_name, official_email, designation, assigned_role, authorization_status FROM authorized_users WHERE official_email = $1", [roleDef.email]);
    const pgAudit = await pool.query("SELECT id, event_type, details_json FROM audit_events WHERE id = $1", [auditId]);

    if (pgUser.rows.length === 0) throw new Error(`User ${roleDef.email} NOT found in PostgreSQL users table!`);
    if (pgAuth.rows.length === 0) throw new Error(`User ${roleDef.email} NOT found in PostgreSQL authorized_users table!`);
    if (pgAudit.rows.length === 0) throw new Error(`Audit event ${auditId} NOT found in PostgreSQL audit_events table!`);

    console.log(`  ✓ PostgreSQL users table: FOUND [id: ${pgUser.rows[0].id.substring(0, 8)}..., role: ${pgUser.rows[0].role}, name: "${pgUser.rows[0].full_name}"]`);
    console.log(`  ✓ PostgreSQL authorized_users table: FOUND [role: ${pgAuth.rows[0].assigned_role}, designation: "${pgAuth.rows[0].designation}"]`);
    console.log(`  ✓ PostgreSQL audit_events table: FOUND [event: ${pgAudit.rows[0].event_type}]`);
  }

  console.log('\n================================================================');
  console.log('FINAL CONFIRMATION: ALL 5 ROLES SUCCESSFULLY STORED IN POSTGRESQL');
  console.log('You can now open pgAdmin and run:');
  console.log("SELECT id, email, full_name, role FROM users WHERE email LIKE '%pgtest%';");
  console.log("SELECT official_email, full_name, assigned_role FROM authorized_users WHERE official_email LIKE '%pgtest%';");
  console.log('================================================================');

  await pool.end();
  process.exit(0);
}

testAllRoleAuthorizations().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});


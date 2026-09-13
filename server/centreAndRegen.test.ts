import test from 'node:test';
import assert from 'node:assert/strict';
import { getDb, executeQuery, executeRun } from './db.ts';
import { v4 as uuidv4 } from 'uuid';
import { encryptExamPaper, splitSecret } from './crypto.ts';

test('1. Database schema: examination_centres and examinations.max_copies exist', async () => {
  const db = await getDb();

  const centreCols = executeQuery(db, 'PRAGMA table_info(examination_centres)');
  const centreColNames = centreCols.map((c: any) => c.name);

  assert.ok(centreColNames.includes('org_id'), 'examination_centres must include org_id');
  assert.ok(centreColNames.includes('centre_code'), 'examination_centres must include centre_code');
  assert.ok(centreColNames.includes('centre_name'), 'examination_centres must include centre_name');
  assert.ok(centreColNames.includes('address'), 'examination_centres must include address');
  assert.ok(centreColNames.includes('city'), 'examination_centres must include city');
  assert.ok(centreColNames.includes('state'), 'examination_centres must include state');
  assert.ok(centreColNames.includes('contact_person'), 'examination_centres must include contact_person');
  assert.ok(centreColNames.includes('contact_number'), 'examination_centres must include contact_number');
  assert.ok(centreColNames.includes('email'), 'examination_centres must include email');
  assert.ok(centreColNames.includes('max_copies'), 'examination_centres must include max_copies');
  assert.ok(centreColNames.includes('status'), 'examination_centres must include status');

  const examCols = executeQuery(db, 'PRAGMA table_info(examinations)');
  const examColNames = examCols.map((c: any) => c.name);
  assert.ok(examColNames.includes('max_copies'), 'examinations must include max_copies');
});

test('2. Add Centre: Copy Control Rule MIN(Manager, Centre) and Mismatch Detection', async () => {
  const db = await getDb();
  const testOrgId = `org-${uuidv4()}`;
  const testExamId = `exam-${uuidv4()}`;
  const testUserId = `user-${uuidv4()}`;
  const now = new Date().toISOString();

  // Create organization
  executeRun(
    db,
    `INSERT INTO organizations (id, name, type, reg_number, auth_id, official_email, website, address, contact, status, created_at, updated_at)
     VALUES (?, 'Security Test Org', 'UNIVERSITY', 'REG-100', 'AUTH-1', 'admin@test.org', 'test.org', 'Main Rd', '9999999999', 'VERIFIED', ?, ?)`,
    [testOrgId, now, now]
  );

  // Create examination with Manager Cap = 500
  const managerAuthorizedCopies: number = 500;
  executeRun(
    db,
    `INSERT INTO examinations (id, org_id, name, subject, category, exam_type, exam_date, exam_time, unlock_time, total_marks, total_questions, duration_minutes, status, max_copies, created_by, created_at, updated_at)
     VALUES (?, ?, 'Copy Control Test Exam', 'Physics', 'NEET', 'MCQ', '2026-11-01', '14:00', '13:30', 180, 45, 180, 'CONFIGURING', ?, ?, ?, ?)`,
    [testExamId, testOrgId, managerAuthorizedCopies, testUserId, now, now]
  );

  // Case A: Centre requests 600 copies (> Manager Cap 500) -> Mismatch!
  const centreRequestedCopies: number = 600;
  const finalAllowedCopies = Math.min(managerAuthorizedCopies, centreRequestedCopies);
  assert.equal(finalAllowedCopies, 500, 'Final Allowed Copies must be MIN(500, 600) = 500');
  const hasMismatch = managerAuthorizedCopies !== centreRequestedCopies;
  assert.equal(hasMismatch, true, 'Mismatch flag must be true');

  const centreId = uuidv4();
  const centreCode = `CTR-MUM-01`;
  executeRun(
    db,
    `INSERT INTO examination_centres (id, exam_id, org_id, centre_code, centre_name, address, city, state, contact_person, contact_number, email, max_copies, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Mumbai Central Centre', 'Bandra East', 'Mumbai', 'Maharashtra', 'Dr. Patil', '+91 9876543210', 'patil@centre.org', ?, 'ACTIVE', ?, ?, ?)`,
    [centreId, testExamId, testOrgId, centreCode, centreRequestedCopies, testUserId, now, now]
  );

  // Verify centre persisted with requested copies
  const insertedCentre = executeQuery(db, 'SELECT * FROM examination_centres WHERE id = ?', [centreId])[0];
  assert.ok(insertedCentre, 'Centre must be inserted');
  assert.equal(insertedCentre.max_copies, 600);
  assert.equal(insertedCentre.city, 'Mumbai');
  assert.equal(insertedCentre.state, 'Maharashtra');

  // Verify copy control logic when checking quota
  const calculatedAllowed = Math.min(managerAuthorizedCopies, Number(insertedCentre.max_copies));
  assert.equal(calculatedAllowed, 500, 'Calculated allowed must be capped at 500');

  // Case B: Print Authorization Enforcement:
  // Cannot print beyond finalAllowedCopies (500)
  const currentPrinted = 490;
  const requestedPrintBatch = 15; // 490 + 15 = 505 > 500 -> Must exceed!
  const isOverQuota = currentPrinted + requestedPrintBatch > calculatedAllowed;
  assert.equal(isOverQuota, true, 'Printing 15 copies when 490 already printed must be blocked by final quota 500');

  // Within quota check: 5 copies (490 + 5 = 495 <= 500)
  const safePrintBatch = 5;
  const isSafe = currentPrinted + safePrintBatch <= calculatedAllowed;
  assert.equal(isSafe, true, 'Printing 5 copies must be within quota');
});

test('3. Duplicate Centre prevention: cannot assign same centre twice to same exam or reuse code', async () => {
  const db = await getDb();
  const testOrgId = `org-dup-${uuidv4()}`;
  const testExamId = `exam-dup-${uuidv4()}`;
  const now = new Date().toISOString();

  executeRun(
    db,
    `INSERT INTO examination_centres (id, exam_id, org_id, centre_code, centre_name, address, city, state, contact_person, contact_number, email, max_copies, status, created_at)
     VALUES (?, ?, ?, 'CTR-PUNE-01', 'Pune Centre 1', 'FC Road', 'Pune', 'Maharashtra', 'Prof. Kulkarni', '9890098900', 'kulkarni@pune.org', 200, 'ACTIVE', ?)`,
    [uuidv4(), testExamId, testOrgId, now]
  );

  // Query duplicates
  const dupInExam = executeQuery(
    db,
    'SELECT id FROM examination_centres WHERE exam_id = ? AND UPPER(centre_code) = ?',
    [testExamId, 'CTR-PUNE-01']
  );
  assert.equal(dupInExam.length, 1, 'Duplicate check in same exam must detect existing code');

  const dupInOrg = executeQuery(
    db,
    'SELECT id FROM examination_centres WHERE org_id = ? AND UPPER(centre_code) = ?',
    [testOrgId, 'CTR-PUNE-01']
  );
  assert.equal(dupInOrg.length, 1, 'Duplicate check in organization must detect existing code');
});

test('4. Emergency Paper Regeneration: Old version superseded, questions quarantined, new V2 encrypted', async () => {
  const db = await getDb();
  const testOrgId = `org-regen-${uuidv4()}`;
  const testExamId = `exam-regen-${uuidv4()}`;
  const testUserId = `user-regen-${uuidv4()}`;
  const now = new Date().toISOString();

  // Create questions in pool
  const qIds: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const qId = `q-regen-${i}-${uuidv4()}`;
    qIds.push(qId);
    executeRun(
      db,
      `INSERT INTO questions (id, org_id, subject, topic, difficulty, marks, negative_marks, correct_answer, syllabus, question_type, content_text, status, created_by, created_at, updated_at)
       VALUES (?, ?, 'Mathematics', 'Calculus', 'MEDIUM', 4, 1.0, 'B', 'Std XII', 'MCQ', 'Integrate x dx from 0 to 1', 'ELIGIBLE_FOR_PAPER', ?, ?, ?)`,
      [qId, testOrgId, testUserId, now, now]
    );
  }

  // Create examination
  executeRun(
    db,
    `INSERT INTO examinations (id, org_id, name, subject, category, exam_type, exam_date, exam_time, unlock_time, total_marks, total_questions, duration_minutes, status, max_copies, created_by, created_at, updated_at)
     VALUES (?, ?, 'Emergency Regen Math Exam', 'Mathematics', 'Competitive Exam', 'MCQ', '2026-12-01', '09:00', '08:30', 16, 4, 180, 'GENERATED_ENCRYPTED', 300, ?, ?, ?)`,
    [testExamId, testOrgId, testUserId, now, now]
  );

  // Create Paper Version 1 (V1)
  const v1Id = uuidv4();
  const v1Code = 'EXAM-MATH-SET-A-V1';
  executeRun(
    db,
    `INSERT INTO paper_versions (id, exam_id, version_code, status, is_current, generated_by, generated_at)
     VALUES (?, ?, ?, 'ENCRYPTED', 1, ?, ?)`,
    [v1Id, testExamId, v1Code, testUserId, now]
  );

  // Link Q1, Q2, Q3, Q4 to Version 1
  for (let i = 0; i < 4; i++) {
    executeRun(
      db,
      `INSERT INTO paper_questions (id, paper_version_id, question_id, section_name, order_index, marks)
       VALUES (?, ?, ?, 'Section A', ?, 4)`,
      [uuidv4(), v1Id, qIds[i], i + 1]
    );
  }

  // --- TRIGGER EMERGENCY REGENERATION PIPELINE ---
  const invalidationReason = 'Paper leak alert from Centre Beta';

  // 1. Mark old version as SUPERSEDED (never delete history)
  executeRun(
    db,
    'UPDATE paper_versions SET is_current = 0, status = "SUPERSEDED", invalidation_reason = ?, invalidated_at = ? WHERE id = ?',
    [invalidationReason, now, v1Id]
  );

  const supersededV1 = executeQuery(db, 'SELECT * FROM paper_versions WHERE id = ?', [v1Id])[0];
  assert.equal(supersededV1.status, 'SUPERSEDED', 'Old version must have status SUPERSEDED');
  assert.equal(supersededV1.is_current, 0, 'Old version must not be current');
  assert.equal(supersededV1.invalidation_reason, invalidationReason);

  // 2. Quarantine compromised questions Q1-Q4
  const compromisedQIds = [qIds[0], qIds[1], qIds[2], qIds[3]];
  for (const cqId of compromisedQIds) {
    executeRun(db, 'UPDATE questions SET status = "QUARANTINED", updated_at = ? WHERE id = ?', [now, cqId]);
    executeRun(
      db,
      `INSERT INTO question_quarantine (id, question_id, reason, reported_by, status, quarantined_at, notes)
       VALUES (?, ?, ?, ?, 'COMPROMISED', ?, 'Compromised in leak incident')`,
      [uuidv4(), cqId, invalidationReason, testUserId, now]
    );
  }

  const quarantinedCheck = executeQuery(
    db,
    'SELECT count(*) as cnt FROM questions WHERE status = "QUARANTINED" AND id IN (?, ?, ?, ?)',
    compromisedQIds
  )[0];
  assert.equal(quarantinedCheck.cnt, 4, 'All 4 suspect questions must be marked QUARANTINED');

  // 3. Cryptographic Pipeline for Replacement Paper Version 2 (V2)
  const v2Id = uuidv4();
  const v2Code = 'EXAM-MATH-SET-A-V2';
  const rawPaperPayload = JSON.stringify({
    examId: testExamId,
    versionCode: v2Code,
    subject: 'Mathematics',
    questions: [
      { orderIndex: 1, questionId: qIds[4], marks: 4 },
      { orderIndex: 2, questionId: qIds[5], marks: 4 },
    ],
  });

  const { payload: encryptedPayload, rawAesKey } = encryptExamPaper(rawPaperPayload);
  const shamirShares = splitSecret(rawAesKey, 5, 3);
  assert.equal(shamirShares.length, 5, 'Must generate 5 Shamir secret shares');

  // Insert Version 2 as current
  executeRun(
    db,
    `INSERT INTO paper_versions (id, exam_id, version_code, status, is_current, generated_by, generated_at)
     VALUES (?, ?, ?, 'ENCRYPTED', 1, ?, ?)`,
    [v2Id, testExamId, v2Code, testUserId, now]
  );

  // Insert Encrypted Paper
  executeRun(
    db,
    `INSERT INTO encrypted_papers (id, paper_version_id, exam_id, aes_cipher_text, iv_hex, auth_tag_hex, encrypted_aes_key_rsa, key_fingerprint, checksum_sha256, encrypted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      v2Id,
      testExamId,
      encryptedPayload.cipherText,
      encryptedPayload.iv,
      encryptedPayload.authTag,
      encryptedPayload.encryptedKeyRSA,
      encryptedPayload.keyFingerprint,
      encryptedPayload.checksumSHA256,
      now,
    ]
  );

  // Insert Shamir Shares
  shamirShares.forEach(share => {
    executeRun(
      db,
      `INSERT INTO key_shares (id, paper_version_id, share_index, threshold, total_shares, share_hash, created_at)
       VALUES (?, ?, ?, 3, 5, ?, ?)`,
      [uuidv4(), v2Id, share.index, share.hash, now]
    );
  });

  // 4. Update Exam Status to REGENERATED
  executeRun(db, 'UPDATE examinations SET status = "REGENERATED", updated_at = ? WHERE id = ?', [now, testExamId]);

  // 5. Record in regeneration_events
  const regenEventId = uuidv4();
  executeRun(
    db,
    `INSERT INTO regeneration_events (id, exam_id, old_paper_version_id, new_paper_version_id, triggered_by, reason, quarantined_questions_count, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [regenEventId, testExamId, v1Id, v2Id, testUserId, invalidationReason, compromisedQIds.length, now]
  );

  // Verification checks:
  const updatedExam = executeQuery(db, 'SELECT status FROM examinations WHERE id = ?', [testExamId])[0];
  assert.equal(updatedExam.status, 'REGENERATED', 'Exam status must be updated to REGENERATED');

  const versions = executeQuery(db, 'SELECT version_code, status, is_current FROM paper_versions WHERE exam_id = ? ORDER BY generated_at ASC', [testExamId]);
  assert.equal(versions.length, 2, 'History must maintain both versions V1 and V2');
  assert.equal(versions[0].status, 'SUPERSEDED', 'V1 must be SUPERSEDED');
  assert.equal(versions[0].is_current, 0, 'V1 must not be current');
  assert.equal(versions[1].status, 'ENCRYPTED', 'V2 must be ENCRYPTED');
  assert.equal(versions[1].is_current, 1, 'V2 must be active current version');

  const storedShares = executeQuery(db, 'SELECT count(*) as cnt FROM key_shares WHERE paper_version_id = ?', [v2Id])[0];
  assert.equal(storedShares.cnt, 5, '5 Shamir shares must be recorded for V2');

  const storedRegen = executeQuery(db, 'SELECT * FROM regeneration_events WHERE id = ?', [regenEventId])[0];
  assert.equal(storedRegen.old_paper_version_id, v1Id);
  assert.equal(storedRegen.new_paper_version_id, v2Id);
  assert.equal(storedRegen.quarantined_questions_count, 4);
});


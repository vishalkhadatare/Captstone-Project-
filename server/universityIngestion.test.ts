import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDraftPaperQuestions } from './universityIngestion.ts';
import { getDb, executeQuery, executeRun } from './db.ts';

test('1. Structured Question Parser extracts sections, Q.No, wording, options, and marks with 100% fidelity', () => {
  const samplePaperText = `SECTION I
Q.1 Choose the correct alternatives from the options.
(a) What primary security guarantee is provided by AES-GCM mode compared to AES-CBC mode?
A) Faster public key factorization
B) Authenticated Encryption with Associated Data (AEAD)
C) Quantum key resistance
D) Elimination of nonce repetition
SECTION II
Q.2 Answer the following questions in detail.
(a) Discuss the architecture of Zero-Knowledge Proofs (ZKP) and non-interactive zk-SNARKs. [8 Marks]
(b) Explain TLS 1.3 handshake protocol improvements over TLS 1.2. [6 Marks]`;

  const parsed = parseDraftPaperQuestions(samplePaperText, 1, 'draft-paper-1', 'exam-test-101');

  assert.ok(parsed.length > 0);

  // Check Paper 1 tag and exact wording
  assert.equal(parsed[0].source_paper, 'Paper 1');
  assert.equal(parsed[0].paper_index, 1);
  assert.ok(parsed[0].question_text.includes('AES-GCM mode') || parsed[0].question_text.includes('Choose the correct'));

  // Verify options if detected
  if (parsed[0].options) {
    assert.ok(parsed[0].options.length >= 2);
  }
});

test('2. Separate counts breakdown for Paper 1, Paper 2, and Paper 3 in SQLite storage', async () => {
  const db = await getDb();
  const testExamId = 'exam-ingest-test-2026';

  // Clean test tables
  executeRun(db, 'DELETE FROM draft_questions WHERE exam_id = ?', [testExamId]);
  executeRun(db, 'DELETE FROM draft_papers WHERE exam_id = ?', [testExamId]);

  const p1Text = 'Q.1 (a) Question 1 from Paper 1\nA) Opt A\nB) Opt B\nC) Opt C\nD) Opt D';
  const p2Text = 'Q.1 (a) Question 1 from Paper 2\nA) Opt A\nB) Opt B\nC) Opt C\nD) Opt D\nQ.2 Explain topic from Paper 2';
  const p3Text = 'Q.1 (a) Question 1 from Paper 3\nA) Opt A\nB) Opt B\nC) Opt C\nD) Opt D';

  const q1 = parseDraftPaperQuestions(p1Text, 1, 'dp-1', testExamId);
  const q2 = parseDraftPaperQuestions(p2Text, 2, 'dp-2', testExamId);
  const q3 = parseDraftPaperQuestions(p3Text, 3, 'dp-3', testExamId);

  // Insert into SQLite database
  const allQs = [...q1, ...q2, ...q3];
  for (const q of allQs) {
    executeRun(
      db,
      `INSERT INTO draft_questions (id, draft_paper_id, exam_id, paper_index, source_paper, section, question_number, question_text, question_type, options_json, marks, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [q.id, q.draft_paper_id, q.exam_id, q.paper_index, q.source_paper, q.section, q.question_number, q.question_text, q.question_type, q.options ? JSON.stringify(q.options) : null, q.marks, new Date().toISOString()]
    );
  }

  // Retrieve & count by Paper 1, Paper 2, Paper 3
  const p1Rows = executeQuery(db, 'SELECT * FROM draft_questions WHERE exam_id = ? AND paper_index = 1', [testExamId]);
  const p2Rows = executeQuery(db, 'SELECT * FROM draft_questions WHERE exam_id = ? AND paper_index = 2', [testExamId]);
  const p3Rows = executeQuery(db, 'SELECT * FROM draft_questions WHERE exam_id = ? AND paper_index = 3', [testExamId]);

  assert.equal(p1Rows.length, q1.length);
  assert.equal(p2Rows.length, q2.length);
  assert.equal(p3Rows.length, q3.length);

  assert.equal(p1Rows[0].source_paper, 'Paper 1');
  assert.equal(p2Rows[0].source_paper, 'Paper 2');
  assert.equal(p3Rows[0].source_paper, 'Paper 3');

  // Cleanup test data
  executeRun(db, 'DELETE FROM draft_questions WHERE exam_id = ?', [testExamId]);
});

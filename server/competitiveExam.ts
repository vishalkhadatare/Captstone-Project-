import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { getDb, executeQuery, executeRun, getPostgresPool } from './db.ts';
import { translateQuestionWithAI, extractQuestionsFromPaperWithAI } from './ai.ts';

export interface CompetitiveSubjectRule {
  id: string;
  subjectName: string;
  numberOfQuestions: number;
  questionType: 'MCQ' | 'Descriptive' | 'Mixed';
  marksPerQuestion: number;
  negativeMarks: number;
  translationRequired: boolean;
  translationLanguage?: string;
  subjectOrder: number;
  pdfs?: any[];
}

export interface CompetitiveExamBlueprint {
  subjects: CompetitiveSubjectRule[];
  totalQuestions: number;
  totalMarks: number;
  totalPositiveMarks: number;
  totalNegativeMarks: number;
}

export interface ExtractedCompetitiveQuestion {
  id: string;
  questionNumber: string;
  subject: string;
  type: 'MCQ' | 'Descriptive' | 'Mixed';
  questionText: string;
  options: Array<{ label: string; text: string }>;
  subQuestions?: string[];
  marks: number;
  negativeMarks: number;
  sourcePdf: string;
  sourcePage: number;
  sourceQuestionNumber: string;
  verificationStatus: 'VERIFIED' | 'NEEDS_REVIEW';
  translationStatus?: string;
  translatedText?: string;
  translatedOptions?: Array<{ label: string; text: string }>;
}

/**
 * Initialize PostgreSQL and SQLite tables for Competitive Examination
 */
export async function initializeCompetitiveSchema(db: any): Promise<void> {
  try {
    // 1. SQLite schema
    executeRun(
      db,
      `CREATE TABLE IF NOT EXISTS competitive_exams (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        name TEXT NOT NULL,
        exam_type TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 180,
        exam_date TEXT,
        exam_time TEXT,
        instructions TEXT,
        blueprint_json TEXT,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`
    );

    executeRun(
      db,
      `CREATE TABLE IF NOT EXISTS competitive_question_pool_files (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        exam_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        subject_name TEXT NOT NULL,
        file_name TEXT NOT NULL,
        mime_type TEXT DEFAULT 'application/pdf',
        file_size INTEGER DEFAULT 0,
        file_data BLOB,
        file_hash TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        question_count INTEGER DEFAULT 0,
        error_message TEXT,
        uploaded_at TEXT NOT NULL,
        processed_at TEXT
      );`
    );

    executeRun(
      db,
      `CREATE TABLE IF NOT EXISTS competitive_question_pools (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        exam_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        source_pdf_name TEXT NOT NULL,
        page_count INTEGER DEFAULT 1,
        question_count INTEGER DEFAULT 0,
        file_size INTEGER DEFAULT 0,
        uploaded_at TEXT NOT NULL
      );`
    );

    executeRun(
      db,
      `CREATE TABLE IF NOT EXISTS competitive_questions (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        exam_id TEXT NOT NULL,
        subject_id TEXT,
        source_file_id TEXT,
        pool_id TEXT,
        subject TEXT NOT NULL,
        question_number TEXT,
        question_type TEXT NOT NULL DEFAULT 'MCQ',
        question_text TEXT NOT NULL,
        options_json TEXT,
        sub_questions_json TEXT,
        marks REAL NOT NULL DEFAULT 4.0,
        negative_marks REAL NOT NULL DEFAULT 1.0,
        source_pdf TEXT,
        source_page INTEGER,
        source_question_number TEXT,
        verification_status TEXT NOT NULL DEFAULT 'VERIFIED',
        translation_status TEXT DEFAULT 'PENDING',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`
    );

    try { executeRun(db, 'ALTER TABLE competitive_questions ADD COLUMN subject_id TEXT;'); } catch {}
    try { executeRun(db, 'ALTER TABLE competitive_questions ADD COLUMN source_file_id TEXT;'); } catch {}

    executeRun(
      db,
      `CREATE TABLE IF NOT EXISTS competitive_generated_papers (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        exam_id TEXT NOT NULL,
        title TEXT NOT NULL,
        exam_type TEXT NOT NULL,
        total_questions INTEGER NOT NULL,
        total_marks REAL NOT NULL,
        total_positive_marks REAL NOT NULL,
        total_negative_marks REAL NOT NULL,
        sections_json TEXT NOT NULL,
        questions_json TEXT NOT NULL,
        blueprint_snapshot_json TEXT NOT NULL,
        source_provenance_json TEXT,
        paper_fingerprint TEXT NOT NULL,
        generated_by TEXT,
        generated_at TEXT NOT NULL
      );`
    );

    // 2. Direct PostgreSQL schema with BYTEA binary storage
    const pg = getPostgresPool();
    if (pg) {
      try {
        await pg.query(`
          CREATE TABLE IF NOT EXISTS competitive_question_pool_files (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            exam_id TEXT NOT NULL,
            subject_id TEXT NOT NULL,
            subject_name TEXT NOT NULL,
            file_name TEXT NOT NULL,
            mime_type TEXT DEFAULT 'application/pdf',
            file_size INTEGER DEFAULT 0,
            file_data BYTEA,
            file_hash TEXT,
            status TEXT NOT NULL DEFAULT 'PENDING',
            question_count INTEGER DEFAULT 0,
            error_message TEXT,
            uploaded_at TEXT NOT NULL,
            processed_at TEXT
          );
          ALTER TABLE competitive_questions ADD COLUMN IF NOT EXISTS subject_id TEXT;
          ALTER TABLE competitive_questions ADD COLUMN IF NOT EXISTS source_file_id TEXT;
          CREATE INDEX IF NOT EXISTS idx_comp_pool_files_exam_sub ON competitive_question_pool_files(exam_id, subject_id);
          CREATE INDEX IF NOT EXISTS idx_comp_pool_files_status ON competitive_question_pool_files(status);
          CREATE INDEX IF NOT EXISTS idx_comp_questions_source_file ON competitive_questions(source_file_id);
          CREATE INDEX IF NOT EXISTS idx_comp_questions_exam_subject_id ON competitive_questions(exam_id, subject_id);
        `);
      } catch (pgErr) {
        console.warn('[ZeroLeak Competitive Schema] PostgreSQL schema init notice:', pgErr);
      }
    }
  } catch (err) {
    console.error('[ZeroLeak Competitive Schema] Init error:', err);
  }
}

/**
 * Clean header/footer noise from raw text lines
 */
function cleanExtractedLines(rawText: string): string[] {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const cleaned: string[] = [];

  const noiseRegexes = [
    /^page\s+\d+(\s+of\s+\d+)?$/i,
    /^-+\s*\d+\s*-+$/,
    /^confidential(\s+exam)?$/i,
    /^end\s+of\s+(question\s+)?paper$/i,
    /^please\s+turn\s+over(\s*\(pto\))?$/i,
    /^rough\s+work(\s+only)?$/i,
    /^space\s+for\s+rough\s+work$/i,
    /^copyright\s+.*reserved/i,
  ];

  for (const line of lines) {
    const isNoise = noiseRegexes.some(rx => rx.test(line));
    if (!isNoise) {
      cleaned.push(line);
    }
  }

  return cleaned;
}

/**
 * Real Parser: extracts individual questions, options, marks, and question numbers
 */
export function parseQuestionsFromRawText(
  rawText: string,
  subject: string,
  sourcePdfName: string,
  defaultMarks: number = 4,
  defaultNegativeMarks: number = 1
): ExtractedCompetitiveQuestion[] {
  const lines = cleanExtractedLines(rawText);
  if (lines.length === 0) return [];

  const questions: ExtractedCompetitiveQuestion[] = [];
  const qNumRegex = /^(?:Q(?:uestion)?\.?\s*(\d+[a-z]?)|(\d+[a-z]?)[\.\)])\s*(.*)/i;
  const optionRegex = /^(\(?([A-Da-d])[\)\.]|\[([A-Da-d])\])\s*(.*)/;
  const marksRegex = /\[(\d+(?:\.\d+)?)\s*(?:Marks?|M)\]|\((\d+(?:\.\d+)?)\s*(?:Marks?|M)\)/i;

  let currentQ: {
    number: string;
    textLines: string[];
    options: Array<{ label: string; text: string }>;
    subQuestions: string[];
    marks: number;
    negativeMarks: number;
    page: number;
  } | null = null;

  let estimatedPage = 1;
  let linesSincePageBreak = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    linesSincePageBreak++;
    if (linesSincePageBreak > 45) {
      estimatedPage++;
      linesSincePageBreak = 0;
    }

    const qMatch = line.match(qNumRegex);
    if (qMatch) {
      // Save previous question if exists and valid
      if (currentQ && currentQ.textLines.length > 0) {
        const fullText = currentQ.textLines.join(' ').trim();
        if (fullText.length >= 8) {
          questions.push({
            id: `cq-${uuidv4()}`,
            questionNumber: currentQ.number,
            subject,
            type: currentQ.options.length >= 2 ? 'MCQ' : 'Descriptive',
            questionText: fullText,
            options: currentQ.options,
            subQuestions: currentQ.subQuestions,
            marks: currentQ.marks,
            negativeMarks: currentQ.negativeMarks,
            sourcePdf: sourcePdfName,
            sourcePage: currentQ.page,
            sourceQuestionNumber: currentQ.number,
            verificationStatus: 'VERIFIED',
            translationStatus: 'ORIGINAL',
          });
        }
      }

      const qNum = qMatch[1] || qMatch[2] || `${questions.length + 1}`;
      const restText = (qMatch[3] || '').trim();

      let detectedMarks = defaultMarks;
      const mMatch = (line + ' ' + restText).match(marksRegex);
      if (mMatch) {
        detectedMarks = parseFloat(mMatch[1] || mMatch[2]) || defaultMarks;
      }

      currentQ = {
        number: qNum,
        textLines: restText ? [restText] : [],
        options: [],
        subQuestions: [],
        marks: detectedMarks,
        negativeMarks: defaultNegativeMarks,
        page: estimatedPage,
      };
      continue;
    }

    if (!currentQ) continue;

    // Check if line is an MCQ Option
    const optMatch = line.match(optionRegex);
    if (optMatch) {
      const label = (optMatch[2] || optMatch[3] || '').toUpperCase();
      const text = (optMatch[4] || '').trim();
      currentQ.options.push({ label, text });
      continue;
    }

    // Check if line continues previous option
    if (currentQ.options.length > 0) {
      const lastOpt = currentQ.options[currentQ.options.length - 1];
      lastOpt.text = (lastOpt.text + ' ' + line).trim();
      continue;
    }

    // Check for subquestion numbering e.g. a) or (i)
    if (/^(\([a-z0-9]+\)|[a-z]\))\s+/i.test(line)) {
      currentQ.subQuestions.push(line);
      continue;
    }

    // Regular question text line
    currentQ.textLines.push(line);
  }

  // Push final question
  if (currentQ && currentQ.textLines.length > 0) {
    const fullText = currentQ.textLines.join(' ').trim();
    if (fullText.length >= 8) {
      questions.push({
        id: `cq-${uuidv4()}`,
        questionNumber: currentQ.number,
        subject,
        type: currentQ.options.length >= 2 ? 'MCQ' : 'Descriptive',
        questionText: fullText,
        options: currentQ.options,
        subQuestions: currentQ.subQuestions,
        marks: currentQ.marks,
        negativeMarks: currentQ.negativeMarks,
        sourcePdf: sourcePdfName,
        sourcePage: currentQ.page,
        sourceQuestionNumber: currentQ.number,
        verificationStatus: 'VERIFIED',
        translationStatus: 'ORIGINAL',
      });
    }
  }

  return questions;
}

/**
 * Express Route Handlers
 */

// 1. GET /api/competitive/exams
export async function handleGetCompetitiveExams(req: Request, res: Response) {
  try {
    const db = await getDb();
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const rows = executeQuery(
      db,
      'SELECT * FROM competitive_exams WHERE org_id = ? ORDER BY created_at DESC',
      [orgId]
    );

    const exams = rows.map(r => {
      const blueprint = r.blueprint_json ? JSON.parse(r.blueprint_json) : null;
      if (blueprint && Array.isArray(blueprint.subjects)) {
        // Fetch active files for this exam from competitive_question_pool_files
        const files = executeQuery(
          db,
          "SELECT id, exam_id, subject_id, subject_name, file_name, mime_type, file_size, file_hash, status, question_count, error_message, uploaded_at, processed_at FROM competitive_question_pool_files WHERE exam_id = ? AND org_id = ? AND status <> 'DELETED' ORDER BY uploaded_at ASC",
          [r.id, orgId]
        );

        blueprint.subjects = blueprint.subjects.map((sub: any) => {
          // Strict subject isolation: ONLY match by sub.id or specific non-empty subjectName
          const matchingFiles = files.filter((f: any) => {
            if (f.subject_id && sub.id) {
              return f.subject_id === sub.id;
            }
            if (sub.subjectName && sub.subjectName.trim()) {
              return (f.subject_name || '').trim().toLowerCase() === sub.subjectName.trim().toLowerCase();
            }
            return false;
          });

          const activePdfs = matchingFiles.map((f: any) => ({
            id: f.id,
            fileId: f.id,
            name: f.file_name,
            size: f.file_size || 0,
            status: f.status || 'COMPLETED',
            extractedCount: f.question_count || 0,
            subjectId: f.subject_id,
            uploadedAt: f.uploaded_at,
          }));

          return {
            ...sub,
            pdfs: activePdfs,
          };
        });
      }

      return {
        ...r,
        blueprint,
      };
    });

    return res.json({ success: true, exams });
  } catch (err: any) {
    console.error('handleGetCompetitiveExams error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch competitive exams.' });
  }
}

// 2. POST /api/competitive/exams (Create / Update Exam & Blueprint)
export async function handleSaveCompetitiveExam(req: Request, res: Response) {
  try {
    const db = await getDb();
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const { id, name, exam_type, duration_minutes, exam_date, exam_time, instructions, blueprint } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Exam Name is required.' });
    }

    const examId = id || `comp-${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();
    const blueprintJson = blueprint ? JSON.stringify(blueprint) : null;

    const existing = executeQuery(db, 'SELECT id FROM competitive_exams WHERE id = ? AND org_id = ?', [examId, orgId]);
    if (existing && existing.length > 0) {
      executeRun(
        db,
        `UPDATE competitive_exams
         SET name = ?, exam_type = ?, duration_minutes = ?, exam_date = ?, exam_time = ?, instructions = ?, blueprint_json = ?, updated_at = ?
         WHERE id = ? AND org_id = ?`,
        [name, exam_type || 'Competitive Examination', duration_minutes || 180, exam_date || '', exam_time || '', instructions || '', blueprintJson, now, examId, orgId]
      );
    } else {
      executeRun(
        db,
        `INSERT INTO competitive_exams (id, org_id, name, exam_type, duration_minutes, exam_date, exam_time, instructions, blueprint_json, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
        [examId, orgId, name, exam_type || 'Competitive Examination', duration_minutes || 180, exam_date || '', exam_time || '', instructions || '', blueprintJson, req.user?.id || 'admin', now, now]
      );
    }

    return res.json({
      success: true,
      message: 'Competitive examination configuration saved.',
      exam: {
        id: examId,
        org_id: orgId,
        name,
        exam_type: exam_type || 'Competitive Examination',
        duration_minutes: duration_minutes || 180,
        exam_date,
        exam_time,
        instructions,
        blueprint,
      },
    });
  } catch (err: any) {
    console.error('handleSaveCompetitiveExam error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save examination.' });
  }
}

// 3. POST /api/competitive/upload-subject-pdf (Store PDF bytes in PostgreSQL & extract real questions)
export async function handleUploadSubjectPdf(req: Request, res: Response) {
  try {
    const db = await getDb();
    const pg = getPostgresPool();
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const {
      exam_id,
      subject_id,
      subject_name,
      subject,
      file_name,
      file_data,
      raw_text,
      marks_per_question,
      negative_marks,
    } = req.body;

    if (!exam_id) return res.status(400).json({ error: 'Exam ID is required.' });

    const effectiveSubjectId = (subject_id || '').trim();
    if (!effectiveSubjectId) {
      return res.status(400).json({ error: 'subject_id is required for isolated question pool management.' });
    }
    const effectiveSubjectName = (subject_name || subject || 'General').trim();

    if (!file_data && (!raw_text || raw_text.trim().length < 10)) {
      return res.status(400).json({ error: 'PDF file data or text stream is required.' });
    }

    const defaultMarks = Number(marks_per_question) || 4;
    const defaultNegative = Number(negative_marks) || 1;
    let extractedText = raw_text || '';
    let pageCount = 1;
    let fileSize = 0;
    let fileBuffer: Buffer = Buffer.alloc(0);

    if (file_data) {
      const cleanBase64 = file_data.includes(',') ? file_data.split(',')[1] : file_data;
      fileBuffer = Buffer.from(cleanBase64, 'base64');
      fileSize = fileBuffer.length;

      try {
        const parsed = await pdfParse(fileBuffer);
        extractedText = parsed.text || '';
        pageCount = parsed.numpages || 1;
      } catch (pdfErr) {
        console.warn('[ZeroLeak Competitive] pdfParse error, attempting AI fallback:', pdfErr);
      }
    }

    const fileId = `cpf-${uuidv4()}`;
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const now = new Date().toISOString();

    // 1. Persist ACTUAL PDF BYTES directly in PostgreSQL BYTEA
    if (pg) {
      try {
        await pg.query(
          `INSERT INTO competitive_question_pool_files (
            id, org_id, exam_id, subject_id, subject_name, file_name, mime_type, file_size, file_data, file_hash, status, question_count, uploaded_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PROCESSING', 0, $11)`,
          [
            fileId,
            orgId,
            exam_id,
            effectiveSubjectId,
            effectiveSubjectName,
            file_name || 'uploaded_document.pdf',
            'application/pdf',
            fileSize,
            fileBuffer,
            fileHash,
            now,
          ]
        );
      } catch (pgInsertErr) {
        console.warn('[ZeroLeak Competitive] PostgreSQL BYTEA insertion notice:', pgInsertErr);
      }
    }

    // In-memory SQLite file tracking (without raw binary to stay fast)
    executeRun(
      db,
      `INSERT INTO competitive_question_pool_files (
        id, org_id, exam_id, subject_id, subject_name, file_name, mime_type, file_size, file_hash, status, question_count, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSING', 0, ?)`,
      [
        fileId,
        orgId,
        exam_id,
        effectiveSubjectId,
        effectiveSubjectName,
        file_name || 'uploaded_document.pdf',
        'application/pdf',
        fileSize,
        fileHash,
        now,
      ]
    );

    // Also insert into legacy table for backwards compatibility
    executeRun(
      db,
      `INSERT INTO competitive_question_pools (id, org_id, exam_id, subject, source_pdf_name, page_count, question_count, file_size, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fileId, orgId, exam_id, effectiveSubjectName, file_name || 'uploaded_document.pdf', pageCount, 0, fileSize, now]
    );

    // 2. Extract real questions from PDF
    let questions = parseQuestionsFromRawText(
      extractedText,
      effectiveSubjectName,
      file_name || 'uploaded_document.pdf',
      defaultMarks,
      defaultNegative
    );

    if (questions.length === 0 && file_data) {
      try {
        const aiResult = await extractQuestionsFromPaperWithAI(
          extractedText,
          effectiveSubjectName,
          'Competitive Exam',
          file_data.includes(',') ? file_data.split(',')[1] : file_data
        );

        if (aiResult?.extractedQuestions && aiResult.extractedQuestions.length > 0) {
          questions = aiResult.extractedQuestions.map((q, idx) => ({
            id: `cq-${uuidv4()}`,
            questionNumber: `${idx + 1}`,
            subject: effectiveSubjectName,
            type: q.options && q.options.length >= 2 ? 'MCQ' : 'Descriptive',
            questionText: (q as any).content || q.content_text || '',
            options: (q.options || []).map((opt: any, oIdx: number) => {
              if (typeof opt === 'string') {
                const label = ['A', 'B', 'C', 'D', 'E'][oIdx] || `${oIdx + 1}`;
                return { label, text: opt };
              }
              return { label: opt.label || opt.id || 'A', text: opt.text || opt.content || '' };
            }),
            marks: defaultMarks,
            negativeMarks: defaultNegative,
            sourcePdf: file_name || 'uploaded_document.pdf',
            sourcePage: q.page_number || 1,
            sourceQuestionNumber: `${idx + 1}`,
            verificationStatus: 'VERIFIED',
            translationStatus: 'ORIGINAL',
          }));
        }
      } catch (aiErr) {
        console.warn('[ZeroLeak Competitive] AI OCR fallback note:', aiErr);
      }
    }

    if (questions.length === 0) {
      const errMsg = `No extractable questions found in "${file_name || 'document'}". Please ensure the uploaded PDF contains valid examination questions.`;
      if (pg) {
        await pg.query('UPDATE competitive_question_pool_files SET status = $1, error_message = $2 WHERE id = $3', ['FAILED', errMsg, fileId]);
      }
      executeRun(db, 'UPDATE competitive_question_pool_files SET status = ?, error_message = ? WHERE id = ?', ['FAILED', errMsg, fileId]);
      return res.status(400).json({ error: errMsg });
    }

    // 3. Save Questions strictly referencing source_file_id & subject_id
    for (const q of questions) {
      const qId = `cq-${uuidv4()}`;
      executeRun(
        db,
        `INSERT INTO competitive_questions (id, org_id, exam_id, subject_id, source_file_id, pool_id, subject, question_number, question_type, question_text, options_json, sub_questions_json, marks, negative_marks, source_pdf, source_page, source_question_number, verification_status, translation_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          qId,
          orgId,
          exam_id,
          effectiveSubjectId,
          fileId,
          fileId,
          effectiveSubjectName,
          q.questionNumber,
          q.type,
          q.questionText,
          JSON.stringify(q.options),
          JSON.stringify(q.subQuestions || []),
          q.marks,
          q.negativeMarks,
          q.sourcePdf || file_name,
          q.sourcePage || 1,
          q.sourceQuestionNumber || q.questionNumber,
          'VERIFIED',
          'ORIGINAL',
          now,
          now,
        ]
      );
    }

    // 4. Update file record to COMPLETED with extracted question count
    if (pg) {
      await pg.query(
        'UPDATE competitive_question_pool_files SET status = $1, question_count = $2, processed_at = $3 WHERE id = $4',
        ['COMPLETED', questions.length, now, fileId]
      );
    }
    executeRun(
      db,
      'UPDATE competitive_question_pool_files SET status = ?, question_count = ?, processed_at = ? WHERE id = ?',
      ['COMPLETED', questions.length, now, fileId]
    );
    executeRun(
      db,
      'UPDATE competitive_question_pools SET question_count = ? WHERE id = ?',
      [questions.length, fileId]
    );

    // 5. Sync exam blueprint_json for effectiveSubjectId
    try {
      const examRows = executeQuery(db, 'SELECT blueprint_json FROM competitive_exams WHERE id = ? AND org_id = ?', [exam_id, orgId]);
      if (examRows && examRows.length > 0 && examRows[0].blueprint_json) {
        const bp = JSON.parse(examRows[0].blueprint_json);
        if (bp && Array.isArray(bp.subjects)) {
          let matched = false;
          bp.subjects = bp.subjects.map((s: any) => {
            if (s.id === effectiveSubjectId || (s.subjectName || '').trim().toLowerCase() === effectiveSubjectName.toLowerCase()) {
              matched = true;
              const currentPdfs = Array.isArray(s.pdfs) ? [...s.pdfs] : [];
              const pdfEntry = {
                id: fileId,
                fileId: fileId,
                name: file_name || 'uploaded_document.pdf',
                size: fileSize,
                status: 'COMPLETED',
                extractedCount: questions.length,
                subjectId: effectiveSubjectId,
                uploadedAt: now,
              };
              const exIdx = currentPdfs.findIndex((p: any) => p.id === fileId || p.fileId === fileId || p.name === file_name);
              if (exIdx !== -1) {
                currentPdfs[exIdx] = pdfEntry;
              } else {
                currentPdfs.push(pdfEntry);
              }
              return { ...s, pdfs: currentPdfs };
            }
            return s;
          });

          const bpStr = JSON.stringify(bp);
          if (pg) {
            await pg.query('UPDATE competitive_exams SET blueprint_json = $1, updated_at = $2 WHERE id = $3 AND org_id = $4', [
              bpStr,
              now,
              exam_id,
              orgId,
            ]);
          }
          executeRun(db, 'UPDATE competitive_exams SET blueprint_json = ?, updated_at = ? WHERE id = ? AND org_id = ?', [
            bpStr,
            now,
            exam_id,
            orgId,
          ]);
        }
      }
    } catch (syncErr) {
      console.warn('[ZeroLeak Competitive] Blueprint sync notice:', syncErr);
    }

    return res.json({
      success: true,
      message: `Extracted ${questions.length} real questions from ${file_name} into ${effectiveSubjectName} pool.`,
      fileId,
      poolId: fileId,
      extractedCount: questions.length,
      pdf: {
        id: fileId,
        fileId,
        examId: exam_id,
        subjectId: effectiveSubjectId,
        subjectName: effectiveSubjectName,
        name: file_name || 'uploaded_document.pdf',
        size: fileSize,
        status: 'COMPLETED',
        extractedCount: questions.length,
        uploadedAt: now,
      },
      questions,
    });
  } catch (err: any) {
    console.error('handleUploadSubjectPdf error:', err);
    return res.status(500).json({ error: err.message || 'Failed to extract questions from uploaded PDF.' });
  }
}

// 4. GET /api/competitive/pool-files/:examId/:subjectId (Subject-specific isolated retrieval)
export async function handleGetSubjectPoolFiles(req: Request, res: Response) {
  try {
    const db = await getDb();
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const { examId, subjectId } = req.params;

    const files = executeQuery(
      db,
      "SELECT id, exam_id, subject_id, subject_name, file_name, mime_type, file_size, file_hash, status, question_count, error_message, uploaded_at, processed_at FROM competitive_question_pool_files WHERE exam_id = ? AND subject_id = ? AND org_id = ? AND status <> 'DELETED' ORDER BY uploaded_at ASC",
      [examId, subjectId, orgId]
    );

    return res.json({ success: true, files });
  } catch (err: any) {
    console.error('handleGetSubjectPoolFiles error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch subject pool files.' });
  }
}

// 5. GET /api/competitive/question-pools/:examId
export async function handleGetQuestionPools(req: Request, res: Response) {
  try {
    const db = await getDb();
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const examId = req.params.examId;

    const files = executeQuery(
      db,
      "SELECT * FROM competitive_question_pool_files WHERE exam_id = ? AND org_id = ? AND status <> 'DELETED' ORDER BY uploaded_at ASC",
      [examId, orgId]
    );

    const questions = executeQuery(
      db,
      'SELECT * FROM competitive_questions WHERE exam_id = ? AND org_id = ? ORDER BY subject ASC, created_at ASC',
      [examId, orgId]
    );

    const formattedQuestions = questions.map(q => ({
      ...q,
      options: q.options_json ? JSON.parse(q.options_json) : [],
      subQuestions: q.sub_questions_json ? JSON.parse(q.sub_questions_json) : [],
    }));

    return res.json({
      success: true,
      pools: files,
      files,
      questions: formattedQuestions,
    });
  } catch (err: any) {
    console.error('handleGetQuestionPools error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch question pools.' });
  }
}

// 5. POST /api/competitive/validate-blueprint
export async function handleValidateBlueprint(req: Request, res: Response) {
  try {
    const db = await getDb();
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const { exam_id, blueprint } = req.body;

    if (!blueprint || !Array.isArray(blueprint.subjects) || blueprint.subjects.length === 0) {
      return res.status(400).json({ error: 'Blueprint must contain at least one configured subject.' });
    }

    const questions = executeQuery(
      db,
      "SELECT id, subject, source_pdf FROM competitive_questions WHERE exam_id = ? AND org_id = ? AND verification_status = 'VERIFIED'",
      [exam_id, orgId]
    );

    // Group available questions by subject (case-insensitive key)
    const countBySubject: Record<string, number> = {};
    const sourcesBySubject: Record<string, Set<string>> = {};

    for (const q of questions) {
      const normSub = (q.subject || '').trim().toLowerCase();
      countBySubject[normSub] = (countBySubject[normSub] || 0) + 1;
      if (!sourcesBySubject[normSub]) sourcesBySubject[normSub] = new Set();
      if (q.source_pdf) sourcesBySubject[normSub].add(q.source_pdf);
    }

    let allValid = true;
    const subjectResults: Array<{
      subject: string;
      required: number;
      available: number;
      sourceCount: number;
      passed: boolean;
      message: string;
    }> = [];

    for (const s of blueprint.subjects) {
      const normSub = (s.subjectName || '').trim().toLowerCase();
      const required = Number(s.numberOfQuestions) || 0;
      const available = countBySubject[normSub] || 0;
      const sourceCount = sourcesBySubject[normSub]?.size || 0;
      const passed = available >= required;

      if (!passed) {
        allValid = false;
      }

      subjectResults.push({
        subject: s.subjectName,
        required,
        available,
        sourceCount,
        passed,
        message: passed
          ? `${s.subjectName} verified pool has ${available} questions from ${sourceCount} source PDF(s) (requires ${required}) — Ready for selection.`
          : `${s.subjectName} requires ${required} verified questions, but only ${available} are available.`,
      });
    }

    return res.json({
      success: true,
      valid: allValid,
      subjectResults,
      overallMessage: allValid
        ? 'All subjects meet or exceed blueprint question requirements. Generation is authorized.'
        : 'One or more subjects have insufficient verified questions. Please upload additional PDF pools.',
    });
  } catch (err: any) {
    console.error('handleValidateBlueprint error:', err);
    return res.status(500).json({ error: err.message || 'Blueprint validation failed.' });
  }
}

// 6. POST /api/competitive/generate-final-paper
export async function handleGenerateCompetitivePaper(req: Request, res: Response) {
  try {
    const db = await getDb();
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const { exam_id, blueprint } = req.body;

    if (!exam_id) return res.status(400).json({ error: 'Exam ID is required.' });
    if (!blueprint || !Array.isArray(blueprint.subjects) || blueprint.subjects.length === 0) {
      return res.status(400).json({ error: 'A valid blueprint with at least one subject is required.' });
    }

    const examRows = executeQuery(db, 'SELECT * FROM competitive_exams WHERE id = ? AND org_id = ?', [exam_id, orgId]);
    const exam = examRows && examRows[0] ? examRows[0] : null;
    const examName = exam?.name || 'Competitive Examination';
    const examType = exam?.exam_type || 'Competitive Examination';

    // 1. Fetch all verified questions for this exam
    const allQuestions = executeQuery(
      db,
      "SELECT * FROM competitive_questions WHERE exam_id = ? AND org_id = ? AND verification_status = 'VERIFIED' ORDER BY created_at ASC",
      [exam_id, orgId]
    );

    // Group by subject
    const subjectQuestionsMap: Record<string, any[]> = {};
    for (const q of allQuestions) {
      const norm = (q.subject || '').trim().toLowerCase();
      if (!subjectQuestionsMap[norm]) subjectQuestionsMap[norm] = [];
      subjectQuestionsMap[norm].push(q);
    }

    // 2. Strict Blueprint Validation — REQUIREMENT 12
    for (const rule of blueprint.subjects) {
      const norm = (rule.subjectName || '').trim().toLowerCase();
      const available = subjectQuestionsMap[norm]?.length || 0;
      const required = Number(rule.numberOfQuestions) || 0;

      if (available < required) {
        return res.status(400).json({
          error: `${rule.subjectName} requires ${required} verified questions, but only ${available} are available. Generation blocked.`,
        });
      }
    }

    // 3. Selection & Section Generation strictly following configured Subject Order
    const sortedSubjectRules = [...blueprint.subjects].sort((a, b) => (a.subjectOrder || 0) - (b.subjectOrder || 0));

    const generatedSections: any[] = [];
    const finalQuestions: any[] = [];
    const sourceProvenanceList: any[] = [];
    let globalQuestionNumber = 1;
    let totalMarks = 0;
    let totalPositiveMarks = 0;
    let totalNegativeMarks = 0;

    for (let sIdx = 0; sIdx < sortedSubjectRules.length; sIdx++) {
      const rule = sortedSubjectRules[sIdx];
      const norm = (rule.subjectName || '').trim().toLowerCase();
      const pool = subjectQuestionsMap[norm] || [];
      const requiredCount = Number(rule.numberOfQuestions);

      // Multi-PDF balanced selection: group pool by source_pdf to pick across all source PDFs (Req 14)
      const pdfGroups: Record<string, any[]> = {};
      for (const q of pool) {
        const src = q.source_pdf || 'source_pdf_1.pdf';
        if (!pdfGroups[src]) pdfGroups[src] = [];
        pdfGroups[src].push(q);
      }

      const pdfKeys = Object.keys(pdfGroups);
      const selectedForSubject: any[] = [];
      const chosenIds = new Set<string>();

      // Round-robin selection across available source PDFs
      let pIdx = 0;
      let safetyCounter = 0;
      while (selectedForSubject.length < requiredCount && safetyCounter < pool.length * 2) {
        safetyCounter++;
        const currPdf = pdfKeys[pIdx % pdfKeys.length];
        const group = pdfGroups[currPdf];
        const candidate = group?.find((q: any) => !chosenIds.has(q.id));

        if (candidate) {
          chosenIds.add(candidate.id);
          selectedForSubject.push(candidate);
        }

        pIdx++;
        // If one PDF runs out, check others
        if (!candidate && chosenIds.size === pool.length) break;
      }

      // If round-robin didn't fill (e.g. uneven lengths), fill from remainder
      if (selectedForSubject.length < requiredCount) {
        for (const rem of pool) {
          if (!chosenIds.has(rem.id) && selectedForSubject.length < requiredCount) {
            chosenIds.add(rem.id);
            selectedForSubject.push(rem);
          }
        }
      }

      const sectionLetter = String.fromCharCode(65 + sIdx); // A, B, C, D...
      const sectionName = `SECTION ${sectionLetter} — ${rule.subjectName.toUpperCase()}`;
      const sectionQuestions: any[] = [];

      for (const rawQ of selectedForSubject) {
        const qOptions = rawQ.options_json ? JSON.parse(rawQ.options_json) : [];
        let translatedText: string | undefined = undefined;
        let translatedOptions: any[] | undefined = undefined;

        // Perform translation if required for this subject (Req 18)
        if (rule.translationRequired && rule.translationLanguage) {
          try {
            const rawOptTexts = qOptions.map((o: any) => o.text);
            const trResult = await translateQuestionWithAI(
              rawQ.question_text,
              rawOptTexts.length > 0 ? rawOptTexts : null,
              rule.translationLanguage,
              rule.subjectName
            );

            if (trResult?.translatedContent) {
              translatedText = trResult.translatedContent;
              if (trResult.translatedOptions && trResult.translatedOptions.length > 0) {
                translatedOptions = qOptions.map((o: any, idx: number) => ({
                  label: o.label,
                  text: trResult.translatedOptions[idx] || o.text,
                }));
              }
            }
          } catch (trErr) {
            console.warn(`[ZeroLeak Translation] Translation to ${rule.translationLanguage} failed for Q:`, trErr);
            translatedText = `[${rule.translationLanguage} Translation Pending Review]`;
          }
        }

        const qMarks = Number(rule.marksPerQuestion) || 4;
        const qNeg = Number(rule.negativeMarks) || 0;

        const assembledQuestion = {
          id: `final-q-${uuidv4()}`,
          originalQuestionId: rawQ.id,
          displayNumber: `Q${globalQuestionNumber}`,
          questionNumber: globalQuestionNumber,
          sectionName,
          subject: rule.subjectName,
          questionType: rule.questionType,
          questionText: rawQ.question_text,
          options: qOptions,
          translatedText,
          translatedOptions,
          marks: qMarks,
          negativeMarks: qNeg,
          translationRequired: Boolean(rule.translationRequired),
          translationLanguage: rule.translationLanguage,
          sourcePdf: rawQ.source_pdf,
          sourcePage: rawQ.source_page,
          sourceQuestionNumber: rawQ.source_question_number,
        };

        sectionQuestions.push(assembledQuestion);
        finalQuestions.push(assembledQuestion);

        sourceProvenanceList.push({
          questionNumber: `Q${globalQuestionNumber}`,
          subject: rule.subjectName,
          sourcePdf: rawQ.source_pdf,
          sourcePage: rawQ.source_page,
          sourceQuestionNumber: rawQ.source_question_number,
        });

        totalMarks += qMarks;
        totalPositiveMarks += qMarks;
        totalNegativeMarks += qNeg;
        globalQuestionNumber++;
      }

      generatedSections.push({
        sectionLetter,
        sectionName,
        subject: rule.subjectName,
        questionType: rule.questionType,
        marksPerQuestion: rule.marksPerQuestion,
        negativeMarks: rule.negativeMarks,
        translationRequired: rule.translationRequired,
        translationLanguage: rule.translationLanguage,
        totalQuestions: sectionQuestions.length,
        totalSectionMarks: sectionQuestions.length * rule.marksPerQuestion,
        questions: sectionQuestions,
      });
    }

    const paperId = `cpaper-${uuidv4()}`;
    const now = new Date().toISOString();

    // Fingerprint calculation (Req 20)
    const fingerprintPayload = `${paperId}:${exam_id}:${totalMarks}:${finalQuestions.map(q => q.originalQuestionId).join(',')}`;
    const paperFingerprint = crypto.createHash('sha256').update(fingerprintPayload).digest('hex');

    // 4. Save Final Generated Paper to PostgreSQL / DB
    executeRun(
      db,
      `INSERT INTO competitive_generated_papers (
        id, org_id, exam_id, title, exam_type, total_questions, total_marks, total_positive_marks, total_negative_marks,
        sections_json, questions_json, blueprint_snapshot_json, source_provenance_json, paper_fingerprint, generated_by, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        paperId,
        orgId,
        exam_id,
        examName,
        examType,
        finalQuestions.length,
        totalMarks,
        totalPositiveMarks,
        totalNegativeMarks,
        JSON.stringify(generatedSections),
        JSON.stringify(finalQuestions),
        JSON.stringify(blueprint),
        JSON.stringify(sourceProvenanceList),
        paperFingerprint,
        req.user?.id || 'admin',
        now,
      ]
    );

    return res.json({
      success: true,
      message: 'One Final Competitive Examination Paper generated successfully.',
      paper: {
        id: paperId,
        examId: exam_id,
        title: examName,
        examType,
        durationMinutes: exam?.duration_minutes || 180,
        examDate: exam?.exam_date,
        examTime: exam?.exam_time,
        instructions: exam?.instructions,
        totalQuestions: finalQuestions.length,
        totalMarks,
        totalPositiveMarks,
        totalNegativeMarks,
        sections: generatedSections,
        questions: finalQuestions,
        sourceProvenance: sourceProvenanceList,
        paperFingerprint,
        generatedAt: now,
      },
    });
  } catch (err: any) {
    console.error('handleGenerateCompetitivePaper error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate competitive paper.' });
  }
}

// 7. GET /api/competitive/generated-papers/:paperId
export async function handleGetGeneratedPaper(req: Request, res: Response) {
  try {
    const db = await getDb();
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const paperId = req.params.paperId;

    const rows = executeQuery(
      db,
      'SELECT * FROM competitive_generated_papers WHERE id = ? AND org_id = ?',
      [paperId, orgId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Generated competitive paper not found.' });
    }

    const row = rows[0];
    return res.json({
      success: true,
      paper: {
        id: row.id,
        examId: row.exam_id,
        title: row.title,
        examType: row.exam_type,
        totalQuestions: row.total_questions,
        totalMarks: row.total_marks,
        totalPositiveMarks: row.total_positive_marks,
        totalNegativeMarks: row.total_negative_marks,
        sections: row.sections_json ? JSON.parse(row.sections_json) : [],
        questions: row.questions_json ? JSON.parse(row.questions_json) : [],
        blueprint: row.blueprint_snapshot_json ? JSON.parse(row.blueprint_snapshot_json) : null,
        sourceProvenance: row.source_provenance_json ? JSON.parse(row.source_provenance_json) : [],
        paperFingerprint: row.paper_fingerprint,
        generatedAt: row.generated_at,
      },
    });
  } catch (err: any) {
    console.error('handleGetGeneratedPaper error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch generated paper.' });
  }
}

// 8. POST /api/competitive/delete-pool-file
export async function handleDeletePoolFile(req: Request, res: Response) {
  try {
    const db = await getDb();
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const { exam_id, subject, subject_id, source_pdf, file_id } = req.body;

    if (!exam_id || (!source_pdf && !file_id)) {
      return res.status(400).json({ error: 'exam_id and either file_id or source_pdf are required.' });
    }

    const pg = getPostgresPool();
    const now = new Date().toISOString();

    // 1. Delete from PostgreSQL if connected
    if (pg) {
      try {
        if (file_id) {
          await pg.query(
            'DELETE FROM competitive_questions WHERE (source_file_id = $1 OR (exam_id = $2 AND source_pdf = $3)) AND org_id = $4',
            [file_id, exam_id, source_pdf || '', orgId]
          );
          await pg.query(
            'DELETE FROM competitive_question_pool_files WHERE (id = $1 OR (exam_id = $2 AND file_name = $3)) AND org_id = $4',
            [file_id, exam_id, source_pdf || '', orgId]
          );
          await pg.query(
            'DELETE FROM competitive_question_pools WHERE (id = $1 OR (exam_id = $2 AND source_pdf_name = $3)) AND org_id = $4',
            [file_id, exam_id, source_pdf || '', orgId]
          );
        } else {
          await pg.query('DELETE FROM competitive_questions WHERE exam_id = $1 AND org_id = $2 AND source_pdf = $3', [
            exam_id,
            orgId,
            source_pdf,
          ]);
          await pg.query('DELETE FROM competitive_question_pool_files WHERE exam_id = $1 AND org_id = $2 AND file_name = $3', [
            exam_id,
            orgId,
            source_pdf,
          ]);
          await pg.query('DELETE FROM competitive_question_pools WHERE exam_id = $1 AND org_id = $2 AND source_pdf_name = $3', [
            exam_id,
            orgId,
            source_pdf,
          ]);
        }
      } catch (pgErr) {
        console.warn('[ZeroLeak Competitive] PG delete notice:', pgErr);
      }
    }

    // 2. Delete from SQLite engine
    if (file_id) {
      executeRun(
        db,
        'DELETE FROM competitive_questions WHERE (source_file_id = ? OR (exam_id = ? AND source_pdf = ?)) AND org_id = ?',
        [file_id, exam_id, source_pdf || '', orgId]
      );
      executeRun(
        db,
        'DELETE FROM competitive_question_pool_files WHERE (id = ? OR (exam_id = ? AND file_name = ?)) AND org_id = ?',
        [file_id, exam_id, source_pdf || '', orgId]
      );
      executeRun(
        db,
        'DELETE FROM competitive_question_pools WHERE (id = ? OR (exam_id = ? AND source_pdf_name = ?)) AND org_id = ?',
        [file_id, exam_id, source_pdf || '', orgId]
      );
    } else {
      executeRun(
        db,
        'DELETE FROM competitive_questions WHERE exam_id = ? AND org_id = ? AND source_pdf = ?',
        [exam_id, orgId, source_pdf]
      );
      executeRun(
        db,
        'DELETE FROM competitive_question_pool_files WHERE exam_id = ? AND org_id = ? AND file_name = ?',
        [exam_id, orgId, source_pdf]
      );
      executeRun(
        db,
        'DELETE FROM competitive_question_pools WHERE exam_id = ? AND org_id = ? AND source_pdf_name = ?',
        [exam_id, orgId, source_pdf]
      );
    }

    // 3. Update competitive_exams.blueprint_json
    try {
      const examRows = executeQuery(db, 'SELECT blueprint_json FROM competitive_exams WHERE id = ? AND org_id = ?', [exam_id, orgId]);
      if (examRows && examRows.length > 0 && examRows[0].blueprint_json) {
        const bp = JSON.parse(examRows[0].blueprint_json);
        if (bp && Array.isArray(bp.subjects)) {
          bp.subjects = bp.subjects.map((s: any) => {
            const matchesSubject =
              (subject_id && s.id === subject_id) ||
              (subject && (s.subjectName || '').trim().toLowerCase() === subject.trim().toLowerCase());

            if (matchesSubject && Array.isArray(s.pdfs)) {
              s.pdfs = s.pdfs.filter((p: any) => {
                if (file_id && (p.id === file_id || p.fileId === file_id)) return false;
                if (source_pdf && (p.name === source_pdf || p.fileName === source_pdf)) return false;
                return true;
              });
            }
            return s;
          });

          const bpStr = JSON.stringify(bp);
          if (pg) {
            await pg.query('UPDATE competitive_exams SET blueprint_json = $1, updated_at = $2 WHERE id = $3 AND org_id = $4', [
              bpStr,
              now,
              exam_id,
              orgId,
            ]);
          }
          executeRun(db, 'UPDATE competitive_exams SET blueprint_json = ?, updated_at = ? WHERE id = ? AND org_id = ?', [
            bpStr,
            now,
            exam_id,
            orgId,
          ]);
        }
      }
    } catch (syncErr) {
      console.warn('[ZeroLeak Competitive] Blueprint delete sync notice:', syncErr);
    }

    return res.json({
      success: true,
      message: `Removed ${source_pdf || file_id} from ${subject || 'pool'}.`,
      file_id,
      exam_id,
    });
  } catch (err: any) {
    console.error('handleDeletePoolFile error:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete pool file.' });
  }
}



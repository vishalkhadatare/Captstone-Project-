import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb, executeQuery, executeRun, saveDb } from './db.ts';
import {
  UniversityChromaVectorStore,
  performDeterministicExactCountSelection,
  validateBlueprintAndExactCounts,
  RagQuestionMetadata,
} from './universityRagPipeline.ts';
import { generateUniversityPaperPdf } from './universityPdfGenerator.ts';
import { protectAndSaveUniversityPdf } from './universityPdfProtection.ts';

export interface FinalValidationSummary {
  totalQuestions: number;
  mcqCount: number;
  shortAnswerCount: number;
  descriptiveCount: number;
  totalMarks: number;
  duplicateCount: number;
  sourcePaperDistribution: {
    paper1: number;
    paper2: number;
    paper3: number;
  };
  validationPassed: boolean;
  errors: string[];
}

/**
 * Log an audit trail entry for University Exam pipeline operations into SQLite database.
 */
export async function logUniversityPaperAudit(
  examId: string,
  paperId: string | null,
  actionType: 'UPLOAD' | 'EXTRACTION' | 'RAG_PROCESSING' | 'SELECTION' | 'VALIDATION' | 'GENERATION' | 'ENCRYPTION' | 'DOWNLOAD',
  userId?: string,
  userRole?: string,
  details?: Record<string, any>,
  ipAddress?: string
) {
  try {
    const db = await getDb();
    executeRun(
      db,
      `INSERT INTO university_paper_audit_logs (id, exam_id, paper_id, action_type, user_id, user_role, details_json, ip_address, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        examId,
        paperId || null,
        actionType,
        userId || 'system',
        userRole || 'EXAM_MANAGER',
        details ? JSON.stringify(details) : null,
        ipAddress || '127.0.0.1',
        new Date().toISOString(),
      ]
    );
    saveDb();
  } catch (err) {
    console.error('[University Audit Log Error]:', err);
  }
}

/**
 * Express Route Handler: Final University Exam Paper Generation & Encryption Pipeline
 */
export async function handleGenerateFinalUniversityPaper(req: Request, res: Response) {
  try {
    const exam_id = (req.body.exam_id || 'EXAM-UNIV-MASTER-2026').trim();
    const set_letter = (req.body.set_letter || 'P').trim().toUpperCase();
    const user_id = (req as any).user?.id || 'usr-exam-mgr';
    const user_role = (req as any).user?.role || 'EXAM_MANAGER';
    const ip_address = req.ip || '127.0.0.1';

    const db = await getDb();

    // Fetch Examination record
    const examRows = executeQuery(db, 'SELECT * FROM examinations WHERE id = ?', [exam_id]);
    const exam = examRows[0] || {
      id: exam_id,
      name: 'State University Annual Board Examination 2026',
      university_name: 'State Board of Technical & Engineering Examinations',
      subject: 'Computer Science & Security Engineering',
      code: 'SLR-CS-502',
      duration_minutes: 180,
      total_marks: 70,
    };

    // Step 1: Fetch extracted draft questions from SQLite
    const qRows = executeQuery(
      db,
      `SELECT id, draft_paper_id, exam_id, paper_index, source_paper, section, question_number, question_text, question_type, options_json, marks
       FROM draft_questions
       WHERE exam_id = ?
       ORDER BY paper_index ASC, id ASC`,
      [exam_id]
    );

    if (!qRows || qRows.length === 0) {
      await logUniversityPaperAudit(exam_id, null, 'VALIDATION', user_id, user_role, { error: 'NO_DRAFT_QUESTIONS' }, ip_address);
      return res.status(400).json({
        success: false,
        error: 'NO_DRAFT_QUESTIONS: Upload 3 draft paper PDFs first.',
      });
    }

    const rawQuestions: RagQuestionMetadata[] = qRows.map((r: any) => ({
      questionId: r.id,
      sourcePaper: r.source_paper || `Paper ${r.paper_index}`,
      paperIndex: r.paper_index,
      section: r.section || 'Section I',
      questionType: r.question_type === 'MCQ' ? 'MCQ' : 'THEORY',
      marks: Number(r.marks) || (r.question_type === 'MCQ' ? 1 : 4),
      questionText: r.question_text || '',
      options: r.options_json ? JSON.parse(r.options_json) : undefined,
    }));

    // Audit RAG Processing
    await logUniversityPaperAudit(exam_id, null, 'RAG_PROCESSING', user_id, user_role, { questionCount: rawQuestions.length }, ip_address);

    // Step 2: Index in VectorStore & Detect Duplicates
    const vectorStore = new UniversityChromaVectorStore();
    await vectorStore.indexQuestions(rawQuestions);
    const { uniqueQuestions, duplicates } = vectorStore.detectSemanticDuplicates(0.85);

    // Step 3: Deterministic Exact-Count Selection
    const selection = performDeterministicExactCountSelection(uniqueQuestions, 14, 6, 6);
    await logUniversityPaperAudit(exam_id, null, 'SELECTION', user_id, user_role, { selectedMcqs: selection.mcqs.length, totalMarks: selection.totalMarks }, ip_address);

    // Step 4: Pre-PDF Final Validation Summary
    const mcqCount = selection.mcqs.length;
    const shortAnswerCount = selection.section1Theory.length;
    const descriptiveCount = selection.section2Theory.length;
    const totalQuestions = selection.totalQuestions;
    const totalMarks = selection.totalMarks;
    const duplicateCount = duplicates.length;
    const paperDistribution = selection.paperDistribution;

    const validationReport = validateBlueprintAndExactCounts(selection, 14, 70);

    const validationSummary: FinalValidationSummary = {
      totalQuestions,
      mcqCount,
      shortAnswerCount,
      descriptiveCount,
      totalMarks,
      duplicateCount,
      sourcePaperDistribution: paperDistribution,
      validationPassed: validationReport.isValid,
      errors: validationReport.errors,
    };

    await logUniversityPaperAudit(exam_id, null, 'VALIDATION', user_id, user_role, validationSummary, ip_address);

    // Requirement 13: Hard Stop Gate — If validation fails, DO NOT create the final PDF
    if (!validationReport.isValid) {
      return res.status(422).json({
        success: false,
        error: `VALIDATION_FAILED: ${validationReport.errors.join(' | ')}`,
        validationSummary,
        validationReport,
      });
    }

    // Step 5: PDFKit PDF Generation
    const rawPdfBuffer = await generateUniversityPaperPdf({
      universityName: exam.university_name || 'State Board of Technical Examinations',
      examName: exam.name || 'Annual University Examination 2026',
      subject: exam.subject || 'Core Engineering',
      paperCode: exam.code || exam.paper_code || 'SLR-HL-475',
      setLetter: set_letter,
      examDate: exam.exam_date || new Date().toLocaleDateString(),
      durationMinutes: Number(exam.duration_minutes) || 180,
      totalMarks: 70,
      markingScheme: exam.marking_scheme,
      mcqs: selection.mcqs,
      section1Theory: selection.section1Theory,
      section2Theory: selection.section2Theory,
    });

    await logUniversityPaperAudit(exam_id, null, 'GENERATION', user_id, user_role, { pdfSizeBytes: rawPdfBuffer.length }, ip_address);

    // Step 6: PDF Protection & Encryption via pdf-lib
    const paperCode = exam.code || exam.paper_code || 'SLR-HL-475';
    const protectionResult = await protectAndSaveUniversityPdf(rawPdfBuffer, paperCode, set_letter);

    await logUniversityPaperAudit(exam_id, null, 'ENCRYPTION', user_id, user_role, { pdfHash: protectionResult.pdfHash, algorithm: 'PDF-LIB-AES256' }, ip_address);

    // Step 7: Store Generated Paper Record in SQLite
    const generatedPaperId = uuidv4();
    const versionCode = `VER-${paperCode}-${set_letter}-${Date.now()}`;
    const pdfUrl = `/compiled_papers/${protectionResult.filename}`;
    const nowIso = new Date().toISOString();

    executeRun(
      db,
      `INSERT INTO university_generated_papers (id, exam_id, version_code, set_letter, total_questions, mcq_count, short_answer_count, descriptive_count, total_marks, duplicate_count, paper_distribution_json, pdf_filename, pdf_url, pdf_hash, encrypted_pdf_path, encryption_algorithm, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GENERATED_ENCRYPTED', ?, ?)`,
      [
        generatedPaperId,
        exam_id,
        versionCode,
        set_letter,
        totalQuestions,
        mcqCount,
        shortAnswerCount,
        descriptiveCount,
        70,
        duplicateCount,
        JSON.stringify(paperDistribution),
        protectionResult.filename,
        pdfUrl,
        protectionResult.pdfHash,
        protectionResult.savedPath,
        'PDF-LIB-AES256',
        user_id,
        nowIso,
      ]
    );

    saveDb();

    return res.json({
      success: true,
      message: `Successfully generated and encrypted official PDFKit University Question Paper (Set ${set_letter}). SHA-256 Hash: ${protectionResult.pdfHash}`,
      generatedPaper: {
        id: generatedPaperId,
        exam_id,
        versionCode,
        set_letter,
        totalQuestions,
        mcqCount,
        shortAnswerCount,
        descriptiveCount,
        totalMarks: 70,
        duplicateCount,
        paperDistribution,
        pdfFilename: protectionResult.filename,
        pdfUrl,
        pdfHash: protectionResult.pdfHash,
        created_at: nowIso,
      },
      validationSummary,
      validationReport,
    });
  } catch (err: any) {
    console.error('[Final University Paper Generation Error]:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to generate final University Question Paper PDF.',
    });
  }
}

/**
 * Express Route Handler: Fetch Audit Logs for University Exam Pipeline
 */
export async function handleGetUniversityAuditLogs(req: Request, res: Response) {
  try {
    const exam_id = ((req.query.exam_id as string) || 'EXAM-UNIV-MASTER-2026').trim();
    const db = await getDb();
    const logs = executeQuery(
      db,
      `SELECT * FROM university_paper_audit_logs
       WHERE exam_id = ?
       ORDER BY timestamp DESC LIMIT 50`,
      [exam_id]
    );
    return res.json({ success: true, logs });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Express Route Handler: Download Encrypted PDF & Audit Download Event
 */
export async function handleDownloadUniversityPaper(req: Request, res: Response) {
  try {
    const paperId = req.params.id;
    const user_id = (req as any).user?.id || 'usr-exam-mgr';
    const user_role = (req as any).user?.role || 'EXAM_MANAGER';
    const ip_address = req.ip || '127.0.0.1';

    const db = await getDb();
    const rows = executeQuery(db, 'SELECT * FROM university_generated_papers WHERE id = ? OR pdf_filename LIKE ?', [paperId, `%${paperId}%`]);
    const paper = rows[0];

    if (!paper) {
      return res.status(404).json({ success: false, error: 'Generated paper record not found.' });
    }

    // Log Download Audit Event
    await logUniversityPaperAudit(paper.exam_id, paper.id, 'DOWNLOAD', user_id, user_role, { pdfFilename: paper.pdf_filename }, ip_address);

    return res.json({
      success: true,
      message: 'Download authorized and audited.',
      pdfUrl: paper.pdf_url,
      pdfFilename: paper.pdf_filename,
      pdfHash: paper.pdf_hash,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}


import fs from 'fs';
import path from 'path';
import multer from 'multer';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import Tesseract from 'tesseract.js';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';
import { getDb, executeQuery, executeRun, saveDb } from './db.ts';

// Configure temporary upload storage directory
const UPLOAD_TEMP_DIR = path.join(process.cwd(), 'uploads', 'tmp');
if (!fs.existsSync(UPLOAD_TEMP_DIR)) {
  fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `draft-paper-${uniqueSuffix}${path.extname(file.originalname).toLowerCase()}`);
  },
});

// Multer Upload Middleware configured for EXACTLY 3 PDF files
export const uploadDraftPapersMulter = multer({
  storage,
  limits: {
    fileSize: 30 * 1024 * 1024, // 30 MB per file limit
    files: 3, // Maximum 3 files
  },
  fileFilter: (req, file, cb) => {
    const mimeType = (file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname).toLowerCase();
    const isPdfMime = mimeType === 'application/pdf' || mimeType === 'application/x-pdf' || mimeType === 'application/acrobat';
    const isPdfExt = ext === '.pdf';

    if (isPdfMime && isPdfExt) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_FILE_TYPE: Only authentic PDF files (.pdf) are allowed.'));
    }
  },
});

export interface ParsedDraftQuestion {
  id: string;
  draft_paper_id: string;
  exam_id: string;
  paper_index: number;
  source_paper: string;
  section: string;
  question_number: string;
  question_text: string;
  question_type: 'MCQ' | 'THEORY';
  options?: string[];
  correct_answer?: string;
  marks: number;
  sub_question_pattern?: string;
  diagram_url?: string;
  created_at: string;
}

/**
 * Extract raw text from PDF file using pdf-parse with fallback to Tesseract OCR for scanned PDFs.
 */
export async function extractTextFromPdfFile(filePath: string): Promise<{ text: string; method: 'PDF_PARSE' | 'TESSERACT_OCR' | 'HYBRID' }> {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const parsedData = await pdfParse(fileBuffer);
    const extractedText = (parsedData.text || '').trim();

    // If pdf-parse extracted sufficient text, return directly
    if (extractedText.length >= 60) {
      return { text: extractedText, method: 'PDF_PARSE' };
    }

    console.log(`[University Ingestion] Insufficient text extracted by pdf-parse (${extractedText.length} chars). Triggering Tesseract OCR fallback for scanned PDF: ${path.basename(filePath)}`);
    
    // Tesseract OCR Fallback
    const ocrResult = await Tesseract.recognize(filePath, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          // Progress output optional
        }
      }
    });

    const ocrText = (ocrResult.data.text || '').trim();
    const combinedText = ocrText.length > 0 ? ocrText : extractedText;
    const method = extractedText.length > 0 ? 'HYBRID' : 'TESSERACT_OCR';

    return { text: combinedText, method };
  } catch (err) {
    console.error(`[University Ingestion] pdf-parse error for ${filePath}, attempting Tesseract OCR:`, err);
    try {
      const ocrResult = await Tesseract.recognize(filePath, 'eng');
      return { text: (ocrResult.data.text || '').trim(), method: 'TESSERACT_OCR' };
    } catch (ocrErr) {
      console.error(`[University Ingestion] Tesseract OCR error for ${filePath}:`, ocrErr);
      return { text: '', method: 'PDF_PARSE' };
    }
  }
}

/**
 * Parses raw text extracted from a University Question Paper into structured Question objects.
 * Preserves the original question wording with 100% fidelity.
 */
export function parseDraftPaperQuestions(
  rawText: string,
  paperIndex: number,
  draftPaperId: string,
  examId: string
): ParsedDraftQuestion[] {
  const questions: ParsedDraftQuestion[] = [];
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const paperName = `Paper ${paperIndex}`;

  let currentSection = 'Section I';
  let currentQuestionNo = '';
  let currentQuestionLines: string[] = [];
  let currentOptions: string[] = [];
  let currentMarks = 1;
  let currentType: 'MCQ' | 'THEORY' = 'THEORY';
  let subPattern = '';

  const finalizeQuestion = () => {
    if (currentQuestionLines.length === 0) return;
    const fullText = currentQuestionLines.join(' ').trim();
    if (fullText.length < 5) return;

    // Detect if MCQ based on options or question context
    const isMcq = currentOptions.length >= 2 || /MCQ|Select the correct|choose the correct|multiple choice/i.test(fullText) || currentSection.includes('Q.1');
    const finalType: 'MCQ' | 'THEORY' = isMcq ? 'MCQ' : currentType;
    const finalMarks = isMcq ? 1 : (currentMarks || (fullText.length > 100 ? 6 : 4));

    questions.push({
      id: uuidv4(),
      draft_paper_id: draftPaperId,
      exam_id: examId,
      paper_index: paperIndex,
      source_paper: paperName,
      section: currentSection,
      question_number: currentQuestionNo || `${questions.length + 1}`,
      question_text: fullText,
      question_type: finalType,
      options: currentOptions.length > 0 ? [...currentOptions] : undefined,
      marks: finalMarks,
      sub_question_pattern: subPattern || undefined,
      created_at: new Date().toISOString(),
    });

    currentQuestionLines = [];
    currentOptions = [];
    currentQuestionNo = '';
    subPattern = '';
  };

  const sectionRegex = /^(SECTION\s*[-–:]*\s*(?:I|II|1|2|A|B))/i;
  const questionHeaderRegex = /^(Q\.?\s*\d+|Question\s*\d+|[\d]{1,2}[\.\)]|\([a-z\d]+\))/i;
  const mcqOptionRegex = /^(\([a-d1-4]\)|[A-D][\.\)]|[1-4][\.\)])\s*(.+)/i;
  const marksRegex = /(?:\[|\()?(\d+)\s*(?:Marks?|M)(?:\]|\))?/i;
  const choicePatternRegex = /(Attempt any (?:FOUR|ONE|TWO|THREE|\d+)|compulsory)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect Section Header
    if (sectionRegex.test(line)) {
      finalizeQuestion();
      const secMatch = line.match(sectionRegex);
      if (secMatch) {
        currentSection = secMatch[1].toUpperCase();
      }
      continue;
    }

    // Detect Choice Pattern (e.g. "Attempt any FOUR of the following")
    if (choicePatternRegex.test(line)) {
      const match = line.match(choicePatternRegex);
      if (match) {
        subPattern = match[1];
      }
    }

    // Detect Marks in line
    const markMatch = line.match(marksRegex);
    if (markMatch && parseInt(markMatch[1], 10) > 0) {
      currentMarks = parseInt(markMatch[1], 10);
    }

    // Detect Option Line (e.g., "A) Option text" or "(a) Option text")
    const optionMatch = line.match(mcqOptionRegex);
    if (optionMatch && currentQuestionLines.length > 0) {
      currentOptions.push(line);
      currentType = 'MCQ';
      continue;
    }

    // Detect New Question Header (e.g., "Q.1", "Q.2", "1.", "2.", "(a)")
    if (questionHeaderRegex.test(line)) {
      finalizeQuestion();
      const qMatch = line.match(questionHeaderRegex);
      currentQuestionNo = qMatch ? qMatch[1].replace(/\.$/, '') : `${questions.length + 1}`;
      const restOfLine = line.replace(questionHeaderRegex, '').trim();
      if (restOfLine) {
        currentQuestionLines.push(restOfLine);
      }
      continue;
    }

    // Append to current question body
    if (currentQuestionNo || currentQuestionLines.length > 0) {
      currentQuestionLines.push(line);
    } else {
      // Fallback: start new question if line is substantial
      currentQuestionNo = `Q.${questions.length + 1}`;
      currentQuestionLines.push(line);
    }
  }

  finalizeQuestion();

  // If fallback parsing yielded no questions, create structured chunk items per section
  if (questions.length === 0 && rawText.trim().length > 0) {
    const defaultSec = 'Section I';
    const chunks = rawText.split(/(?=\b(?:Q\.\d+|Question \d+|\d+\.)\b)/i).filter(c => c.trim().length > 10);

    chunks.forEach((chunk, idx) => {
      const isMcq = /MCQ|option|\([a-d]\)/i.test(chunk);
      questions.push({
        id: uuidv4(),
        draft_paper_id: draftPaperId,
        exam_id: examId,
        paper_index: paperIndex,
        source_paper: paperName,
        section: defaultSec,
        question_number: `Q.${idx + 1}`,
        question_text: chunk.trim(),
        question_type: isMcq ? 'MCQ' : 'THEORY',
        marks: isMcq ? 1 : 6,
        created_at: new Date().toISOString(),
      });
    });
  }

  return questions;
}

/**
 * Express Route Handler: Ingest EXACTLY 3 University Draft Paper PDFs
 */
export async function handleUploadUniversityDrafts(req: Request, res: Response) {
  const tempFiles: string[] = [];
  try {
    const files = req.files as Express.Multer.File[];
    const exam_id = (req.body.exam_id || 'EXAM-UNIV-MASTER-2026').trim();

    // Requirement 1 & 3: Validate EXACTLY 3 files were uploaded
    if (!files || !Array.isArray(files) || files.length !== 3) {
      // Clean up any uploaded files
      if (files && Array.isArray(files)) {
        files.forEach(f => {
          if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
        });
      }
      return res.status(400).json({
        success: false,
        error: 'INVALID_FILE_COUNT: Exactly 3 question-paper PDFs (Paper 1, Paper 2, Paper 3) must be uploaded.',
      });
    }

    files.forEach(f => tempFiles.push(f.path));

    // Validate MIME types and file extensions
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const mime = (f.mimetype || '').toLowerCase();
      const ext = path.extname(f.originalname).toLowerCase();
      const isPdf = (mime.includes('pdf') || mime === 'application/octet-stream') && ext === '.pdf';
      if (!isPdf) {
        tempFiles.forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p); });
        return res.status(400).json({
          success: false,
          error: `INVALID_FILE_FORMAT: File "${f.originalname}" is not a valid PDF file.`,
        });
      }
    }

    const db = await getDb();
    const nowIso = new Date().toISOString();

    // Clear previous draft papers for this exam to ensure fresh clean ingestion
    executeRun(db, 'DELETE FROM draft_questions WHERE exam_id = ?', [exam_id]);
    executeRun(db, 'DELETE FROM draft_papers WHERE exam_id = ?', [exam_id]);

    const ingestedDraftPapers: any[] = [];
    const allExtractedQuestions: ParsedDraftQuestion[] = [];

    let paper1Count = 0;
    let paper2Count = 0;
    let paper3Count = 0;

    // Process each of the 3 draft papers sequentially
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const paperIndex = i + 1; // 1, 2, 3
      const draftPaperId = uuidv4();

      // Extract text using pdf-parse with Tesseract OCR fallback
      const extractionResult = await extractTextFromPdfFile(file.path);
      const extractedText = extractionResult.text;
      const extractionMethod = extractionResult.method;

      // Parse structured questions
      const parsedQuestions = parseDraftPaperQuestions(extractedText, paperIndex, draftPaperId, exam_id);

      const mcqCount = parsedQuestions.filter(q => q.question_type === 'MCQ').length;
      const theoryCount = parsedQuestions.filter(q => q.question_type === 'THEORY').length;

      if (paperIndex === 1) paper1Count = parsedQuestions.length;
      if (paperIndex === 2) paper2Count = parsedQuestions.length;
      if (paperIndex === 3) paper3Count = parsedQuestions.length;

      // Insert Draft Paper record into SQLite database
      executeRun(
        db,
        `INSERT INTO draft_papers (id, exam_id, paper_index, file_name, file_size, mime_type, storage_path, extracted_text, extraction_method, question_count, mcq_count, theory_count, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          draftPaperId,
          exam_id,
          paperIndex,
          file.originalname,
          file.size,
          file.mimetype,
          file.path,
          extractedText.substring(0, 5000), // store preview excerpt
          extractionMethod,
          parsedQuestions.length,
          mcqCount,
          theoryCount,
          nowIso,
        ]
      );

      // Insert Parsed Structured Questions into SQLite database
      for (const q of parsedQuestions) {
        executeRun(
          db,
          `INSERT INTO draft_questions (id, draft_paper_id, exam_id, paper_index, source_paper, section, question_number, question_text, question_type, options_json, marks, sub_question_pattern, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            q.id,
            q.draft_paper_id,
            q.exam_id,
            q.paper_index,
            q.source_paper,
            q.section,
            q.question_number,
            q.question_text,
            q.question_type,
            q.options ? JSON.stringify(q.options) : null,
            q.marks,
            q.sub_question_pattern || null,
            q.created_at,
          ]
        );
        allExtractedQuestions.push(q);
      }

      ingestedDraftPapers.push({
        id: draftPaperId,
        exam_id,
        paper_index: paperIndex,
        file_name: file.originalname,
        file_size: file.size,
        mime_type: file.mimetype,
        extraction_method: extractionMethod,
        question_count: parsedQuestions.length,
        mcq_count: mcqCount,
        theory_count: theoryCount,
        uploaded_at: nowIso,
      });
    }

    saveDb();

    // Requirement 4: Delete temporary files after processing
    tempFiles.forEach(filePath => {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkErr) {
          console.warn(`[University Ingestion] Unlink warning for ${filePath}:`, unlinkErr);
        }
      }
    });

    const totalQuestions = allExtractedQuestions.length;
    const mcqCount = allExtractedQuestions.filter(q => q.question_type === 'MCQ').length;
    const theoryCount = allExtractedQuestions.filter(q => q.question_type === 'THEORY').length;

    return res.json({
      success: true,
      message: `Successfully ingested 3 University draft papers. Extracted ${totalQuestions} questions across Paper 1, Paper 2, and Paper 3.`,
      draftPapers: ingestedDraftPapers,
      paperCounts: {
        paper1Count,
        paper2Count,
        paper3Count,
        totalQuestions,
        mcqCount,
        theoryCount,
      },
      questions: allExtractedQuestions,
    });
  } catch (err: any) {
    console.error('[University Ingestion Error]:', err);
    // Cleanup temp files on exception
    tempFiles.forEach(filePath => {
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    });
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to process University Exam draft paper upload.',
    });
  }
}

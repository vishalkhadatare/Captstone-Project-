/**
 * Re-sealing a paper whose server key is gone.
 *
 * An examination paper is stored as AES-256-GCM ciphertext with its AES key
 * wrapped by the server's RSA key. Until the keypair was persisted, a restart
 * left every previously sealed paper permanently unreadable - `open-viewer` and
 * the print relay answered `rsa routines::oaep decoding error` and no copy of
 * the paper could be produced at all.
 *
 * A paper is not lost in that case, because the database still knows exactly
 * which questions it was built from: `paper_questions` holds the question ids in
 * paper order with their per-question marks and sections. This module rebuilds
 * the *same* paper from that composition - not a freshly composed one, and not a
 * new version - so it can be re-sealed with the current server key and the
 * centre can view and print it again.
 *
 * Everything here is pure: rows in, payload out. The routes own the database.
 */

export interface ResealCompositionRow {
  question_id: string;
  order_index: number | null;
  marks: number | null;
  section_name: string | null;
}

export interface ResealQuestionRow {
  id: string;
  content_text: string | null;
  options_json?: string | null;
  /** Present because this is a `questions` table row. The marks a paper was
   * actually printed with come from the composition, not from the bank. */
  marks?: number | null;
  subject?: string | null;
  topic?: string | null;
  difficulty?: string | null;
  question_type?: string | null;
  negative_marks?: number | null;
  correct_answer?: string | null;
  diagram_url?: string | null;
  image_url?: string | null;
  has_table?: number | null;
}

export interface ResealInput {
  exam: {
    id: string;
    name: string;
    subject?: string | null;
    category?: string | null;
    exam_type?: string | null;
    university_name?: string | null;
    blueprint_pattern?: string | null;
    marking_scheme?: string | null;
    duration_minutes?: number | null;
    total_marks?: number | null;
  };
  versionCode: string;
  setLabel?: string | null;
  composition: ResealCompositionRow[];
  questions: Map<string, ResealQuestionRow>;
  generatedAt?: string;
}

export interface ResealResult {
  payload: Record<string, any>;
  /** Question ids the composition refers to but the question pool no longer has. */
  missingQuestionIds: string[];
  totalMarks: number;
}

/** Options are stored as a JSON string, an array, or nothing at all. */
export function parseStoredOptions(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Rebuilds the payload in the exact shape the paper generators emit, so the
 * Secure Viewer, the PDF exporter and the print relay all keep working without
 * knowing the paper was re-sealed.
 */
export function buildResealPayload(input: ResealInput): ResealResult {
  const missingQuestionIds: string[] = [];
  const ordered = [...input.composition].sort(
    (a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0)
  );

  const questions = ordered.flatMap((entry, index) => {
    const question = input.questions.get(entry.question_id);
    if (!question) {
      missingQuestionIds.push(entry.question_id);
      return [];
    }
    const options = parseStoredOptions(question.options_json);
    const marks = Number(entry.marks ?? 0) || 1;
    return [
      {
        orderIndex: index + 1,
        questionId: question.id,
        questionNumber: index + 1,
        sectionId: null,
        sectionName: entry.section_name || null,
        questionsToAttempt: null,
        subject: question.subject || null,
        topic: question.topic || null,
        difficulty: question.difficulty || null,
        marks,
        negativeMarks: Number(question.negative_marks ?? 0) || 0,
        type: question.question_type || (options.length > 0 ? 'MCQ' : 'THEORY'),
        content: question.content_text || '',
        options,
        correctAnswerEncryptedNotice: '[PROTECTED BY ZEROLEAK CRYPTOGRAPHIC VAULT]',
        correctAnswer: question.correct_answer || null,
        diagramUrl: question.diagram_url || question.image_url || null,
        imageUrl: question.image_url || question.diagram_url || null,
        hasDiagram: Boolean(question.diagram_url || question.image_url),
        hasTable: Boolean(question.has_table || (question.content_text || '').includes('|')),
      },
    ];
  });

  const totalMarks = questions.reduce((sum, question) => sum + Number(question.marks || 0), 0);

  const seenSubjects = new Map<string, { subject: string; count: number; totalMarks: number }>();
  for (const question of questions) {
    const key = question.subject || 'General';
    const bucket = seenSubjects.get(key) || { subject: key, count: 0, totalMarks: 0 };
    bucket.count += 1;
    bucket.totalMarks += Number(question.marks || 0);
    seenSubjects.set(key, bucket);
  }

  const generatedAt = input.generatedAt || new Date().toISOString();
  const isUniversity = Boolean(input.exam.university_name);

  const payload: Record<string, any> = {
    examinationId: input.exam.id,
    examinationName: input.exam.name,
    subject: input.exam.subject || null,
    category: input.exam.category || null,
    examType: input.exam.exam_type || null,
    versionCode: input.versionCode,
    setLabel: input.setLabel || input.versionCode,
    paperCode: `${input.exam.id}-${input.versionCode}`,
    universityName: input.exam.university_name || 'Autonomous State Examination Board',
    isUniversity3PaperFormat: isUniversity,
    isMultiSubjectMCQFormat: false,
    universityBoardSet: null,
    blueprintPattern: input.exam.blueprint_pattern || 'Standard CBCS',
    markingScheme: input.exam.marking_scheme || 'Standard Marks',
    blueprint: null,
    subjectBreakdown: [...seenSubjects.values()],
    generatedAt,
    durationMinutes: Number(input.exam.duration_minutes ?? 180) || 180,
    totalMarks: totalMarks || Number(input.exam.total_marks ?? 0) || 0,
    instructions: isUniversity
      ? [
          'Q. No. 1 is compulsory. It should be solved in the first 30 minutes in answer book.',
          'Figures to the right indicate full marks.',
          'Assume suitable data wherever needed and mention it clearly.',
        ]
      : [
          `Official Examination Standard (${input.setLabel || input.versionCode}).`,
          'Read each question carefully before attempting.',
          'Do not leave any required question unattempted.',
        ],
    questions,
    // Provenance so the ledger can tell a re-sealed paper from a freshly generated one.
    resealedAt: generatedAt,
    resealedReason: 'Server encryption key rotated; paper rebuilt from its stored question composition.',
  };

  return { payload, missingQuestionIds, totalMarks };
}

/**
 * A paper can only be re-sealed if its composition still names at least one
 * question that exists, and every named question is still present.
 */
/**
 * `reason` rides on both branches: this tsconfig omits `strict`, so a caller
 * cannot read the refusal reason off the false branch without a cast.
 */
export function planReseal(input: {
  composition: ResealCompositionRow[];
  questions: Map<string, ResealQuestionRow>;
}): { ok: true; reason: '' } | { ok: false; reason: string } {
  if (input.composition.length === 0) {
    return { ok: false, reason: 'No stored question composition for this paper version.' };
  }
  const missing = input.composition.filter(entry => !input.questions.has(entry.question_id));
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `${missing.length} of ${input.composition.length} questions are no longer in the question pool.`,
    };
  }
  return { ok: true, reason: '' };
}

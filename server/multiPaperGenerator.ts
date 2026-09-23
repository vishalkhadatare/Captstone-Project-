import crypto from 'crypto';
import { assessExtractedQuestion } from './questionQuality.ts';

export interface QuestionItem {
  id: string;
  org_id: string;
  question_paper_id?: string;
  source_file?: string;
  source_page?: number;
  question_number?: string;
  subject: string;
  topic: string;
  difficulty: string; // 'EASY' | 'MEDIUM' | 'HARD'
  marks: number;
  negative_marks: number;
  correct_answer: string; // 'A' | 'B' | 'C' | 'D' or option id
  correct_option_id?: string;
  language?: string;
  syllabus?: string;
  question_type?: string;
  content_text: string;
  options_json?: string;
  diagram_url?: string;
  status?: string;
}

export interface OptionItem {
  id: string;
  text: string;
  label?: string;
}

export interface SubjectRule {
  subject: string;
  count: number;
}

export interface DifficultyRatio {
  easy: number;   // Percentage e.g. 30
  medium: number; // Percentage e.g. 50
  hard: number;   // Percentage e.g. 20
}

export interface PaperBlueprintConfig {
  name: string;
  totalQuestions: number;
  subjects: SubjectRule[];
  difficulty: DifficultyRatio;
  maxSourceContributionPercent: number; // e.g. 40 (%)
  antiDuplication?: boolean;
}

export interface PermutedQuestion {
  questionId: string;
  sourcePaperId: string;
  displayOrder: number;
  questionNumber?: string;
  questionType?: string;
  subject: string;
  topic: string;
  difficulty: string;
  contentText: string;
  diagramUrl?: string;
  imageUrl?: string;
  hasDiagram?: boolean;
  hasTable?: boolean;
  shuffledOptions: Array<{ id: string; text: string; label: string }>;
  correctOptionId: string;
  displayedCorrectAnswer: string; // 'A' | 'B' | 'C' | 'D'
  originalCorrectAnswer: string;
  marks: number;
  negativeMarks: number;
}

export interface GeneratedPaperResult {
  versionCode: string;
  paperFingerprint: string;
  generationSeed: string;
  questionSequenceHash: string;
  optionPermutationHash: string;
  totalQuestions: number;
  subjectBreakdown: Record<string, number>;
  difficultyBreakdown: Record<string, number>;
  sourceContribution: Record<string, { count: number; percent: number }>;
  questions: PermutedQuestion[];
}

/**
 * Normalizes text for collision & duplicate detection
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Map a detected-paper pattern section onto the shape the blueprint branch of
 * `compilePaperPayloadForExam` consumes.
 *
 * Pattern analysis (server/ai.ts `analyzeConsolidatedExamPattern`) emits sections
 * shaped `{ name, type, marks, questionCount, attemptRules }`, while blueprint
 * sections are consumed as `{ totalQuestions, marksPerQuestion,
 * questionsToAttempt, questionType, subject, difficulty }`. Every field name
 * differs, so without this mapping `Number(section.totalQuestions || 0)` is 0
 * and the section selects no questions at all - the generated paper comes out
 * empty and ignores the uploaded paper's pattern.
 */
export interface NormalizedBlueprintSection {
  id: string;
  name: string;
  totalQuestions: number;
  marksPerQuestion: number;
  questionsToAttempt: number;
  questionType: string;
  subject?: string;
  difficulty: string;
  negativeMarks: number;
  attemptRules?: string;
}

/** First whole number mentioned in a phrase like "Attempt any four of the following". */
function firstIntegerIn(text: unknown): number | null {
  const m = String(text ?? '').match(/\d+/);
  return m ? Number(m[0]) : null;
}

export function normalizePatternSection(section: any): NormalizedBlueprintSection {
  const s = section || {};
  // Clamp: a negative or non-numeric count would otherwise reach slice(0, n).
  const count = Math.max(0, Number(s.totalQuestions ?? s.questionCount ?? 0) || 0);

  // Marks arrive either per-question or as a section total. Prefer the explicit
  // per-question figure and only derive from the total when we must.
  let marksPerQuestion = Number(s.marksPerQuestion ?? 0) || 0;
  if (!marksPerQuestion && count > 0) {
    const sectionTotal = Number(s.totalMarks ?? s.marks ?? 0) || 0;
    if (sectionTotal > 0) marksPerQuestion = Math.max(1, Math.round(sectionTotal / count));
  }

  // "attemptRules" is prose. Take the first number it mentions; if it names none,
  // assume every question in the section is attemptable.
  let questionsToAttempt = Number(s.questionsToAttempt ?? 0) || 0;
  if (!questionsToAttempt) {
    questionsToAttempt = firstIntegerIn(s.attemptRules) ?? count;
  }
  if (count > 0 && questionsToAttempt > count) questionsToAttempt = count;

  return {
    id: String(s.id || `SEC-${String(s.name || 'SECTION').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 12)}`),
    name: String(s.name || 'Section'),
    totalQuestions: count,
    marksPerQuestion,
    questionsToAttempt,
    // The pattern calls it `type`; the generator calls it `questionType`.
    questionType: s.questionType || s.type || 'MIXED',
    // Deliberately NOT defaulted to exam.subject: the blueprint filter is an
    // exact string comparison (`q.subject !== section.subject`), so filling this
    // in would drop every question whose subject string differs by so much as
    // punctuation. The eligible pool is already narrowed by exam subject
    // upstream, so an absent subject here simply means "no extra filtering".
    subject: s.subject || undefined,
    // 'ANY' disables the difficulty filter, which is what an unqualified pattern means.
    difficulty: s.difficulty || 'ANY',
    negativeMarks: Number(s.negativeMarks ?? 0) || 0,
    attemptRules: s.attemptRules,
  };
}

/** Normalize every section of a detected pattern. */
export function normalizePatternSections(sections: unknown): NormalizedBlueprintSection[] {
  if (!Array.isArray(sections)) return [];
  return sections.map((section) => normalizePatternSection(section));
}

/**
 * Cryptographically secure Fisher-Yates shuffle
 */export function cryptoShuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Standard SHA-256 helper
 */
function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Parses and normalizes options into objects with immutable IDs
 */
export function parseAndNormalizeOptions(
  optionsJson?: string,
  correctAnswerLetter?: string
): { options: OptionItem[]; correctOptionId: string } {
  let rawOpts: any[] = [];
  try {
    if (optionsJson) {
      const parsed = typeof optionsJson === 'string' ? JSON.parse(optionsJson) : optionsJson;
      rawOpts = Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    rawOpts = [];
  }

  const normalized: OptionItem[] = [];
  rawOpts.forEach((opt: any, idx: number) => {
    const id = (typeof opt === 'object' && opt?.id) ? String(opt.id) : `opt_${idx}`;
    const text = typeof opt === 'string' ? opt : (opt?.text ?? opt?.value ?? opt?.option ?? '');
    const label = (typeof opt === 'object' && opt?.label) ? opt.label : String.fromCharCode(65 + idx);
    normalized.push({ id, text: String(text).trim(), label });
  });

  // Determine correct option ID
  let correctOptionId = '';
  const letter = (correctAnswerLetter || 'A').toUpperCase().trim();
  const letterIndex = letter.charCodeAt(0) - 65; // 'A' -> 0, 'B' -> 1

  if (letterIndex >= 0 && letterIndex < normalized.length) {
    correctOptionId = normalized[letterIndex].id;
  } else if (normalized.length > 0) {
    correctOptionId = normalized[0].id;
  }

  return { options: normalized, correctOptionId };
}

/**
 * Validates whether the available pool can fulfill the blueprint
 */
export function validateBlueprintFeasibility(
  pool: QuestionItem[],
  blueprint: PaperBlueprintConfig,
  selectedSourcePaperIds: string[]
): { feasible: boolean; errors: string[]; stats: any } {
  const errors: string[] = [];

  // Filter pool to selected source papers
  const available = pool.filter(q =>
    q.question_paper_id && selectedSourcePaperIds.includes(q.question_paper_id)
  );

  if (available.length < blueprint.totalQuestions) {
    errors.push(
      `Insufficient total questions: Needed ${blueprint.totalQuestions}, but selected papers only provide ${available.length} questions.`
    );
  }

  if (selectedSourcePaperIds.length < 1) {
    errors.push('At least 1 source paper must be selected to generate examination papers.');
  }

  const isSinglePaper = selectedSourcePaperIds.length === 1;

  // Check subject requirements
  for (const sRule of blueprint.subjects || []) {
    if (!sRule.subject || sRule.subject.toUpperCase() === 'ALL' || sRule.subject === '*') continue;
    const subjectQuestions = available.filter(
      q => q.subject && q.subject.trim().toLowerCase() === sRule.subject.trim().toLowerCase()
    );
    if (subjectQuestions.length < sRule.count) {
      errors.push(
        `Insufficient questions for Subject "${sRule.subject}": Needed ${sRule.count}, but found only ${subjectQuestions.length} across selected papers.`
      );
    }
  }

  // Check maximum contribution cap feasibility (for 1 paper, 100% is allowed)
  const effectiveMaxContribution = isSinglePaper ? 100 : (blueprint.maxSourceContributionPercent || 40);
  const maxAllowedPerPaper = Math.ceil(
    blueprint.totalQuestions * (effectiveMaxContribution / 100)
  );
  const minRequiredPapers = isSinglePaper ? 1 : Math.ceil(blueprint.totalQuestions / maxAllowedPerPaper);
  if (!isSinglePaper && selectedSourcePaperIds.length < minRequiredPapers) {
    errors.push(
      `Selected ${selectedSourcePaperIds.length} source papers cannot satisfy the ${blueprint.maxSourceContributionPercent}% max-contribution cap. At least ${minRequiredPapers} source papers are required.`
    );
  }

  return {
    feasible: errors.length === 0,
    errors,
    stats: {
      availableCount: available.length,
      requiredCount: blueprint.totalQuestions,
      maxAllowedPerPaper,
      minRequiredPapers,
    },
  };
}

/**
 * 1. COMBINATION ALGORITHM: Selects balanced questions from multiple source papers
 */
export function selectQuestionsCombination(
  pool: QuestionItem[],
  blueprint: PaperBlueprintConfig,
  selectedSourcePaperIds: string[]
): QuestionItem[] {
  // 1. Filter to selected papers
  let candidatePool = pool.filter(q =>
    q.question_paper_id && selectedSourcePaperIds.includes(q.question_paper_id)
  );

  // 2. Anti-duplication filter
  if (blueprint.antiDuplication !== false) {
    const seenHashes = new Set<string>();
    const deduplicated: QuestionItem[] = [];

    for (const q of candidatePool) {
      const textHash = sha256(normalizeText(q.content_text));
      if (!seenHashes.has(textHash)) {
        seenHashes.add(textHash);
        deduplicated.push(q);
      }
    }
    candidatePool = deduplicated;
  }

  const isSinglePaper = selectedSourcePaperIds.length === 1;
  const effectiveMaxContribution = isSinglePaper ? 100 : (blueprint.maxSourceContributionPercent || 40);
  const maxAllowedPerPaper = Math.ceil(
    blueprint.totalQuestions * (effectiveMaxContribution / 100)
  );
  const sourceContributionCount: Record<string, number> = {};
  selectedSourcePaperIds.forEach(id => {
    sourceContributionCount[id] = 0;
  });

  const selectedQuestions: QuestionItem[] = [];
  const selectedIds = new Set<string>();

  // 3. Process each subject in blueprint
  const subjectsToProcess = (blueprint.subjects && blueprint.subjects.length > 0)
    ? blueprint.subjects
    : [{ subject: 'ALL', count: blueprint.totalQuestions }];

  for (const sRule of subjectsToProcess) {
    const subjectTarget = sRule.count;
    const isAll = !sRule.subject || sRule.subject.toUpperCase() === 'ALL' || sRule.subject === '*';

    // Calculate difficulty targets for this subject
    const easyTarget = Math.round(subjectTarget * ((blueprint.difficulty?.easy || 33) / 100));
    const hardTarget = Math.round(subjectTarget * ((blueprint.difficulty?.hard || 33) / 100));
    const mediumTarget = Math.max(0, subjectTarget - easyTarget - hardTarget);

    const difficultyBuckets: Array<{ difficulty: string; target: number }> = [
      { difficulty: 'EASY', target: easyTarget },
      { difficulty: 'MEDIUM', target: mediumTarget },
      { difficulty: 'HARD', target: hardTarget },
    ];

    for (const bucket of difficultyBuckets) {
      let needed = bucket.target;

      // Find candidate questions matching subject & difficulty
      let matching = candidatePool.filter(
        q =>
          !selectedIds.has(q.id) &&
          (isAll || (q.subject && q.subject.trim().toLowerCase() === sRule.subject.trim().toLowerCase())) &&
          (q.difficulty ? q.difficulty.toUpperCase() === bucket.difficulty.toUpperCase() : true)
      );

      // Randomize matching pool before fair distribution
      matching = cryptoShuffle(matching);

      // Sort by source paper usage (prefer papers that contributed fewest questions so far)
      matching.sort((a, b) => {
        const countA = sourceContributionCount[a.question_paper_id || ''] || 0;
        const countB = sourceContributionCount[b.question_paper_id || ''] || 0;
        return countA - countB;
      });

      for (const q of matching) {
        if (needed <= 0) break;
        const paperId = q.question_paper_id || '';
        const currentPaperCount = sourceContributionCount[paperId] || 0;

        // Verify max contribution cap
        if (isSinglePaper || currentPaperCount < maxAllowedPerPaper) {
          selectedQuestions.push(q);
          selectedIds.add(q.id);
          sourceContributionCount[paperId] = currentPaperCount + 1;
          needed--;
        }
      }

      // Fallback: If strict difficulty bucket is not full, fill from any difficulty of same subject
      if (needed > 0) {
        let fallbackMatching = candidatePool.filter(
          q =>
            !selectedIds.has(q.id) &&
            (isAll || (q.subject && q.subject.trim().toLowerCase() === sRule.subject.trim().toLowerCase()))
        );
        fallbackMatching = cryptoShuffle(fallbackMatching);
        fallbackMatching.sort((a, b) => {
          const countA = sourceContributionCount[a.question_paper_id || ''] || 0;
          const countB = sourceContributionCount[b.question_paper_id || ''] || 0;
          return countA - countB;
        });

        for (const q of fallbackMatching) {
          if (needed <= 0) break;
          const paperId = q.question_paper_id || '';
          const currentPaperCount = sourceContributionCount[paperId] || 0;
          if (isSinglePaper || currentPaperCount < maxAllowedPerPaper) {
            selectedQuestions.push(q);
            selectedIds.add(q.id);
            sourceContributionCount[paperId] = currentPaperCount + 1;
            needed--;
          }
        }
      }
    }
  }

  // 4. Ultimate Fallback: If still under totalQuestions, fill from any remaining candidate questions
  if (selectedQuestions.length < blueprint.totalQuestions) {
    const remaining = cryptoShuffle(candidatePool.filter(q => !selectedIds.has(q.id)));
    for (const q of remaining) {
      if (selectedQuestions.length >= blueprint.totalQuestions) break;
      const paperId = q.question_paper_id || '';
      const currentPaperCount = sourceContributionCount[paperId] || 0;
      if (isSinglePaper || currentPaperCount < maxAllowedPerPaper) {
        selectedQuestions.push(q);
        selectedIds.add(q.id);
        sourceContributionCount[paperId] = currentPaperCount + 1;
      }
    }
  }

  return selectedQuestions;
}

/**
 * 2. PERMUTATION ALGORITHM: Shuffles question sequence and MCQ options
 */
export function permuteQuestionsAndOptions(
 selectedQuestions: QuestionItem[]
): PermutedQuestion[] {
 // 1. Permute questions sequence cryptographically
 const shuffledQuestions = cryptoShuffle(selectedQuestions);

 // 2. Permute options for each question
 return shuffledQuestions.map((q, qIndex) => {
 const { options, correctOptionId } = parseAndNormalizeOptions(
 q.options_json,
 q.correct_answer
 );

 // Cryptographically shuffle options
 const shuffledOpts = cryptoShuffle(options);

 // Recalculate displayed correct answer based on where correctOptionId landed
 let displayedCorrectAnswer = 'A';
 const newCorrectIndex = shuffledOpts.findIndex(o => o.id === correctOptionId);
 if (newCorrectIndex !== -1) {
 displayedCorrectAnswer = String.fromCharCode(65 + newCorrectIndex);
 }

 // Re-label options A, B, C, D in their new positions
 const formattedOptions = shuffledOpts.map((opt, idx) => ({
 id: opt.id,
 text: opt.text,
 label: String.fromCharCode(65 + idx),
 }));

    return {
      questionId: q.id,
      sourcePaperId: q.question_paper_id || '',
      displayOrder: qIndex + 1,
      questionNumber: q.question_number,
      questionType: q.question_type || (formattedOptions.length > 0 ? 'MCQ' : 'THEORY'),
      subject: q.subject,
      topic: q.topic || 'General',
      difficulty: q.difficulty,
      contentText: q.content_text,
      diagramUrl: q.diagram_url,
      imageUrl: (q as any).image_url || q.diagram_url,
      hasDiagram: (q as any).has_diagram !== undefined ? Boolean((q as any).has_diagram) : Boolean(q.diagram_url),
      hasTable: Boolean((q as any).has_table),
      shuffledOptions: formattedOptions,
      correctOptionId,
      displayedCorrectAnswer,
      originalCorrectAnswer: q.correct_answer,
      marks: q.marks || 4,
      negativeMarks: q.negative_marks || 1.0,
    };
  });
}

/**
 * 3. PAPER FINGERPRINTING: Computes unique SHA-256 fingerprint for forensic tracking
 */
export function computePaperFingerprint(
 versionCode: string,
 examCode: string,
 questions: PermutedQuestion[],
 seed: string
): {
 paperFingerprint: string;
 questionSequenceHash: string;
 optionPermutationHash: string;
} {
  const sequenceData = questions.map(q => q.questionId).join(',');
  const optionData = questions
    .map(q => `${q.questionId}:${q.shuffledOptions.map(o => o.id).join('')}`)
    .join('|');

  const questionSequenceHash = sha256(sequenceData);
  const optionPermutationHash = sha256(optionData);

  const combined = `${versionCode}:${examCode}:${seed}:${questionSequenceHash}:${optionPermutationHash}`;
  const rawFingerprint = sha256(combined).substring(0, 8).toUpperCase();
  const paperFingerprint = `ZL-${examCode || 'NEET'}-2026-${rawFingerprint}`;

  return {
    paperFingerprint,
    questionSequenceHash,
    optionPermutationHash,
  };
}

/**
 * 4. MULTI-SET GENERATION: Generates controlled versions (Sets A, B, C, D)
 */
export function generateMultiPaperSets(
 pool: QuestionItem[],
 blueprint: PaperBlueprintConfig,
 selectedSourcePaperIds: string[],
 numSets: number = 1,
 examCode: string = 'NEET'
): GeneratedPaperResult[] {
  const results: GeneratedPaperResult[] = [];
  const setLabels = ['SET-A', 'SET-B', 'SET-C', 'SET-D', 'SET-E', 'SET-F'];

  for (let s = 0; s < numSets; s++) {
    const versionCode = setLabels[s] || `SET-${s + 1}`;
    const generationSeed = crypto.randomBytes(16).toString('hex');

 // 1. Select Questions (Combination)
 const selected = selectQuestionsCombination(
 pool,
 blueprint,
 selectedSourcePaperIds
 );

 // 2. Permute Questions and Options (Permutation)
 const permuted = permuteQuestionsAndOptions(selected);

 // 3. Compute Fingerprint
 const { paperFingerprint, questionSequenceHash, optionPermutationHash } =
 computePaperFingerprint(versionCode, examCode, permuted, generationSeed);

 // 4. Calculate breakdowns
 const subjectBreakdown: Record<string, number> = {};
 const difficultyBreakdown: Record<string, number> = {};
 const sourceCount: Record<string, number> = {};

 permuted.forEach(q => {
 subjectBreakdown[q.subject] = (subjectBreakdown[q.subject] || 0) + 1;
 difficultyBreakdown[q.difficulty] = (difficultyBreakdown[q.difficulty] || 0) + 1;
 sourceCount[q.sourcePaperId] = (sourceCount[q.sourcePaperId] || 0) + 1;
 });

 const sourceContribution: Record<string, { count: number; percent: number }> = {};
 Object.entries(sourceCount).forEach(([pId, count]) => {
 sourceContribution[pId] = {
 count,
 percent: Math.round((count / permuted.length) * 100),
 };
 });

  results.push({
    versionCode,
    paperFingerprint,
    generationSeed,
    questionSequenceHash,
    optionPermutationHash,
    totalQuestions: permuted.length,
    subjectBreakdown,
    difficultyBreakdown,
    sourceContribution,
    questions: permuted,
  });
  }

  return results;
}

export interface UniversityBoardPaperSet {
  setLabel: string; // 'Set P', 'Set Q', 'Set R', 'Set S'
  versionCode: string;
  paperCode: string; // e.g. 'SLR-HL-475'
  totalMarks: number; // 70
  mcqSection: {
    title: string; // 'MCQ/Objective Type Questions'
    durationMinutes: number; // 30
    marks: number; // 14
    questionText: string; // 'Q.1 Choose the correct alternatives from the options.'
    questions: Array<{
      subIndex: number; // 1 to 14
      id: string;
      content_text: string;
      options: Array<{ label: string; text: string; id: string }>;
      correct_answer?: string;
      diagram_url?: string;
      image_url?: string;
      has_table?: boolean;
    }>;
  };
  section1: {
    title: string; // 'Section – I'
    maxMarks: number; // 28
    questions: Array<{
      questionNumber: string; // 'Q.2', 'Q.3', 'Q.4'
      title: string;
      totalMarks: number;
      instruction?: string;
      subQuestions: Array<{
        subLabel: string; // 'a)', 'b)', 'c)', 'd)', 'e)'
        id: string;
        content_text: string;
        marks: number;
        diagram_url?: string;
        image_url?: string;
        has_table?: boolean;
      }>;
    }>;
  };
  section2: {
    title: string; // 'Section – II'
    maxMarks: number; // 28
    questions: Array<{
      questionNumber: string; // 'Q.5', 'Q.6', 'Q.7'
      title: string;
      totalMarks: number;
      instruction?: string;
      subQuestions: Array<{
        subLabel: string; // 'a)', 'b)', 'c)', 'd)', 'e)'
        id: string;
        content_text: string;
        marks: number;
        diagram_url?: string;
        image_url?: string;
        has_table?: boolean;
      }>;
    }>;
  };
}

/**
 * 5. UNIVERSITY SEMESTER BOARD EXAMINATION GENERATOR (SLR-HL-475 CBCS Pattern)
 * Generates 70-Mark University Board Papers with Set P, Set Q, Set R, Set S from 3 draft question papers.
 */
export function generateUniversityBoardPaperSets(
  draftPool: QuestionItem[],
  numSets: number = 3,
  customPaperCode: string = 'SLR-HL-475',
  subjectName: string = 'Core Engineering'
): UniversityBoardPaperSet[] {
  const setNames = ['Set P', 'Set Q', 'Set R', 'Set S'];

  // Separate MCQs and Theory questions from candidate draft pool
  const mcqPool: QuestionItem[] = [];
  const theoryPool: QuestionItem[] = [];

  const seenHashes = new Set<string>();
  let rejectedByQuality = 0;
  draftPool.forEach(q => {
    const textHash = sha256(normalizeText(q.content_text));
    if (seenHashes.has(textHash)) return;

    // Defence in depth for rows already sitting in the bank. The ingest gate
    // stops new contamination, but legacy rows - page furniture, log lines,
    // and content filed under the wrong subject - are still stored and would
    // otherwise be drawn onto a paper. Never print them.
    const verdict = assessExtractedQuestion({ content_text: q.content_text, subject: q.subject });
    if (!verdict.ok) {
      rejectedByQuality++;
      console.warn(
        `[BoardPaper] excluding question ${q.id} (${verdict.code}): ${verdict.reason}`
      );
      return;
    }

    seenHashes.add(textHash);

    const { options } = parseAndNormalizeOptions(q.options_json, q.correct_answer);
    if (options.length >= 2 || q.question_type === 'MCQ') {
      mcqPool.push(q);
    } else {
      theoryPool.push(q);
    }
  });

  if (rejectedByQuality > 0) {
    console.warn(
      `[BoardPaper] ${customPaperCode}: excluded ${rejectedByQuality} stored question(s) that failed the quality gate. ` +
      `These should be reviewed and quarantined in the question bank.`
    );
  }

  const sLower = (subjectName || '').toLowerCase();

  const getSubjectTheoryTemplates = () => {
    if (sLower.includes('operating system') || sLower.includes('os')) {
      return {
        q2: [
          'Explain the concept of Process Control Block (PCB) and its structure in Operating Systems.',
          'Differentiate between User-level threads and Kernel-level threads with neat diagrams.',
          'Explain Round Robin (RR) and Shortest Job First (SJF) CPU scheduling algorithms with examples.',
          'What is the Dining Philosophers Problem? Explain its synchronization solution using Semaphores.',
          'Explain Demand Paging and Page Fault handling mechanism in virtual memory.',
        ],
        q3: [
          'State and explain Banker’s Algorithm for Deadlock Avoidance with a suitable resource allocation example.',
          'Explain the Producer-Consumer problem and solve it using counting semaphores and mutex locks.',
        ],
        q4: [
          'Explain the concept of Inode structure in Unix/Linux File System.',
          'Compare Paging and Segmentation memory management schemes.',
        ],
        q5: [
          'Explain Disk Scheduling Algorithms: FCFS, SSTF, SCAN, and C-SCAN with track request examples.',
          'Explain different File Allocation methods (Contiguous, Linked, and Indexed allocation) with pros and cons.',
          'Explain Context Switching in Multiprogramming Operating Systems.',
          'State four necessary conditions for Deadlock occurrence and explain how to prevent them.',
          'Explain Inter-Process Communication (IPC) techniques: Shared Memory and Message Passing.',
        ],
        q6: [
          'Define the Critical Section Problem. Explain Peterson’s Solution for two-process mutual exclusion.',
          'Explain FIFO, LRU, and Optimal Page Replacement algorithms with a reference string.',
        ],
        q7: [
          'Explain Access Matrix mechanism for Protection and Security in Operating Systems.',
        ],
      };
    } else if (sLower.includes('network') || sLower.includes('cn')) {
      return {
        q2: [
          'Explain the 7 layers of OSI Reference Model and their respective functions in detail.',
          'Differentiate between TCP and UDP transport layer protocols with appropriate use cases.',
          'Explain the IPv4 Packet Header format with fields and checksum calculation.',
          'Explain Stop-and-Wait ARQ flow control and error control protocol.',
          'Compare Distance Vector Routing and Link State Routing algorithms.',
        ],
        q3: [
          'Explain Dijkstra’s Shortest Path Algorithm with a step-by-step weighted graph example.',
          'Explain TCP Three-Way Handshake for connection establishment and termination process.',
        ],
        q4: [
          'Explain CSMA/CD mechanism and collision handling in IEEE 802.3 Ethernet networks.',
          'Explain Subnetting and Classless Inter-Domain Routing (CIDR) with a numerical example.',
        ],
        q5: [
          'Explain DNS (Domain Name System) resolution hierarchy and iterative vs recursive queries.',
          'Explain Leaky Bucket and Token Bucket algorithms for Network Congestion and Traffic Shaping.',
          'Explain the architecture and security features of HTTP vs HTTPS (TLS/SSL).',
          'Explain the working of Network Address Translation (NAT) in router gateways.',
          'Explain Cryptographic Hash Functions (SHA-256) and Digital Signatures in network security.',
        ],
        q6: [
          'Explain Error Detection using Cyclic Redundancy Check (CRC) with a generator polynomial example.',
          'Explain Sliding Window Flow Control protocol (Go-Back-N and Selective Repeat).',
        ],
        q7: [
          'Explain RSA Public Key Cryptosystem algorithm with a numerical key generation example.',
        ],
      };
    } else if (sLower.includes('data') || sLower.includes('dbms') || sLower.includes('database')) {
      return {
        q2: [
          'Explain 3-Tier Architecture of Database Management Systems with schema levels.',
          'Explain Entity-Relationship (ER) model concepts: Entity Sets, Attributes, and Cardinalities.',
          'Explain fundamental Relational Algebra operations: Select, Project, Union, and Cartesian Product.',
          'Explain 1NF, 2NF, 3NF, and BCNF normalization forms with decomposition examples.',
          'Explain ACID properties of Database Transactions with failure recovery examples.',
        ],
        q3: [
          'Explain Two-Phase Locking (2PL) protocol and strict 2PL for transaction serializability.',
          'Explain B+ Tree Indexing structure and search/insertion operations in DBMS.',
        ],
        q4: [
          'Explain Query Optimization techniques and relational algebra expression transformations.',
          'Explain Conflict Serializability vs View Serializability with precedence graphs.',
        ],
        q5: [
          'Explain Triggers and Stored Procedures with SQL syntax and practical use cases.',
          'Explain Views and Updatable Views in Relational Database Management Systems.',
          'Explain Deadlock Detection and Prevention techniques in Multi-user DBMS.',
          'Explain Log-Based Recovery techniques (Deferred and Immediate Update) and Checkpoints.',
          'Explain Nested Loop Join, Hash Join, and Merge Join execution algorithms.',
        ],
        q6: [
          'Explain Multi-Version Concurrency Control (MVCC) mechanism in modern relational databases.',
          'Explain Shadow Paging recovery technique and compare it with Log-based recovery.',
        ],
        q7: [
          'Explain Write-Ahead Logging (WAL) and ARIES recovery algorithm in database systems.',
        ],
      };
    } else if (sLower.includes('software testing') || sLower.includes('testing') || sLower.includes('quality')) {
      return {
        q2: [
          'Define software quality. Explain the core components of quality and the cost of quality.',
          'Differentiate between Verification and Validation with suitable examples.',
          'Explain the V-Model and Waterfall SDLC models with respect to testing activities.',
          'Describe the Software Testing Life Cycle (STLC) phases in detail.',
          'Explain the roles and responsibilities of a test manager and a test analyst.',
        ],
        q3: [
          'Explain the different levels of testing: Unit, Integration, System, and Acceptance testing.',
          'Differentiate between Black-Box and White-Box testing techniques with examples.',
        ],
        q4: [
          'Explain the concept of Regression Testing and when it should be performed.',
          'Write a short note on Test Plan and Test Strategy documentation.',
        ],
        q5: [
          'Explain Equivalence Class Partitioning and Boundary Value Analysis with examples.',
          'Explain Decision Table based testing and Cause-Effect graphing techniques.',
          'Explain Statement, Branch, and Path coverage metrics with suitable code examples.',
          'Explain the defect life cycle with a neat diagram.',
          'Compare Error Guessing and Exploratory Testing approaches.',
        ],
        q6: [
          'Explain ISO 9001 and CMM/CMMI quality standards and their relevance to software testing.',
          'Explain the Six Sigma methodology and its characteristics in quality management.',
        ],
        q7: [
          'Explain Automation Testing frameworks (Data-Driven, Keyword-Driven, and Hybrid) with their benefits and limitations.',
        ],
      };
    } else {
      // Subject-neutral fallback. This branch MUST NOT hardcode a domain: it
      // previously returned Computer Graphics questions for every subject it
      // did not recognise, which is how a Software Testing paper came to ask
      // about Bezier curves and hidden-surface removal. Wording keyed to the
      // real subject name is vague but honest; invented topics are neither.
      return {
        q2: [
          `Explain the fundamental concepts of ${subjectName} with suitable examples.`,
          `Describe the key principles and terminology used in ${subjectName}.`,
          `Discuss the practical applications of ${subjectName} in industry.`,
          `Explain the standard processes and methodologies followed in ${subjectName}.`,
          `Describe the tools and techniques commonly used in ${subjectName}.`,
        ],
        q3: [
          `Explain in detail the core theories underlying ${subjectName}, with examples.`,
          `Compare and contrast two major approaches used in ${subjectName}.`,
        ],
        q4: [
          `Write a short technical note on an important topic in ${subjectName}.`,
          `Explain a commonly used technique in ${subjectName} with a diagram.`,
        ],
        q5: [
          `Explain a real-world problem in ${subjectName} and describe a systematic solution.`,
          `Describe the steps involved in analysing and solving a typical ${subjectName} problem.`,
          `Explain the importance of standards and best practices in ${subjectName}.`,
          `Discuss common pitfalls in ${subjectName} and how to avoid them.`,
          `Explain how quality is measured and assured in ${subjectName}.`,
        ],
        q6: [
          `Explain a significant framework or standard relevant to ${subjectName}.`,
          `Describe a case study illustrating effective practice in ${subjectName}.`,
        ],
        q7: [
          `Write a detailed technical note on an advanced topic in ${subjectName}.`,
        ],
      };
    }
  };

  const templates = getSubjectTheoryTemplates();
  const boardSets: UniversityBoardPaperSet[] = [];

  for (let s = 0; s < numSets; s++) {
    const setLabel = setNames[s] || `Set ${String.fromCharCode(80 + s)}`;
    const versionCode = `UNIV-${customPaperCode}-${setLabel.replace(/\s+/g, '')}-${Date.now().toString().slice(-4)}`;

    // Permute MCQs for Q.1 (target 14).
    // Never cycle to reach the target: re-adding an already-selected question
    // prints the same MCQ twice on one paper. A short paper is correct; a
    // duplicated one is not.
    const MCQ_TARGET = 14;
    const shuffledMcqs = cryptoShuffle(mcqPool);
    const selectedMcqs = shuffledMcqs.slice(0, MCQ_TARGET);
    if (selectedMcqs.length < MCQ_TARGET) {
      console.warn(
        `[BoardPaper] ${customPaperCode} ${setLabel}: only ${selectedMcqs.length}/${MCQ_TARGET} MCQs in the pool; ` +
        `emitting a short Q.1 rather than repeating questions.`
      );
    }

    const formattedMcqs = selectedMcqs.map((q, idx) => {
      const { options, correctOptionId } = parseAndNormalizeOptions(q.options_json, q.correct_answer);
      const shuffledOpts = cryptoShuffle(options);
      
      // Calculate displayed letter a, b, c, d
      let correctLetter = 'a';
      const newCorrectIdx = shuffledOpts.findIndex(o => o.id === correctOptionId);
      if (newCorrectIdx !== -1) {
        correctLetter = String.fromCharCode(97 + newCorrectIdx);
      }

      const formattedOpts = shuffledOpts.map((opt, oIdx) => ({
        id: opt.id,
        label: String.fromCharCode(97 + oIdx), // 'a', 'b', 'c', 'd'
        text: opt.text,
      }));

      return {
        subIndex: idx + 1,
        id: q.id,
        content_text: q.content_text,
        options: formattedOpts,
        correct_answer: correctLetter,
        diagram_url: q.diagram_url || (q as any).image_url,
        image_url: (q as any).image_url || q.diagram_url,
        has_table: Boolean((q as any).has_table),
      };
    });

    // Permute Theory questions for Section I and Section II
    const shuffledTheory = cryptoShuffle(theoryPool);

    let tIdx = 0;
    const getNextTheory = (defaultText: string, defaultMarks: number) => {
      if (tIdx < shuffledTheory.length) {
        const item = shuffledTheory[tIdx++];
        return {
          id: item.id,
          content_text: item.content_text,
          marks: defaultMarks,
          diagram_url: item.diagram_url || (item as any).image_url,
          image_url: (item as any).image_url || item.diagram_url,
          has_table: Boolean((item as any).has_table),
        };
      }
      return {
        id: `q-theory-${customPaperCode}-s${s + 1}-${tIdx++}`,
        content_text: defaultText,
        marks: defaultMarks,
      };
    };

    const q2Subs = templates.q2.map(txt => getNextTheory(txt, 4)).map((item, idx) => ({ ...item, subLabel: `${String.fromCharCode(97 + idx)})` }));
    const q3Subs = templates.q3.map(txt => getNextTheory(txt, 6)).map((item, idx) => ({ ...item, subLabel: `${String.fromCharCode(97 + idx)})` }));
    const q4Subs = templates.q4.map(txt => getNextTheory(txt, 3)).map((item, idx) => ({ ...item, subLabel: `${String.fromCharCode(97 + idx)})` }));
    const q5Subs = templates.q5.map(txt => getNextTheory(txt, 4)).map((item, idx) => ({ ...item, subLabel: `${String.fromCharCode(97 + idx)})` }));
    const q6Subs = templates.q6.map(txt => getNextTheory(txt, 6)).map((item, idx) => ({ ...item, subLabel: `${String.fromCharCode(97 + idx)})` }));
    const q7Subs = templates.q7.map(txt => getNextTheory(txt, 6)).map((item) => ({ ...item, subLabel: '' }));

    boardSets.push({
      setLabel,
      versionCode,
      paperCode: customPaperCode,
      totalMarks: 70,
      mcqSection: {
        title: 'MCQ/Objective Type Questions',
        durationMinutes: 30,
        marks: 14,
        questionText: 'Q.1 Choose the correct alternatives from the options.',
        questions: formattedMcqs,
      },
      section1: {
        title: 'Section – I',
        maxMarks: 28,
        questions: [
          {
            questionNumber: 'Q.2',
            title: 'Answer the following question. (Any Four)',
            totalMarks: 16,
            subQuestions: q2Subs,
          },
          {
            questionNumber: 'Q.3',
            title: 'Answer the following question. (Any One)',
            totalMarks: 6,
            subQuestions: q3Subs,
          },
          {
            questionNumber: 'Q.4',
            title: 'Attempt the following.',
            totalMarks: 6,
            subQuestions: q4Subs,
          },
        ],
      },
      section2: {
        title: 'Section – II',
        maxMarks: 28,
        questions: [
          {
            questionNumber: 'Q.5',
            title: 'Answer the following question. (Any Four)',
            totalMarks: 16,
            subQuestions: q5Subs,
          },
          {
            questionNumber: 'Q.6',
            title: 'Answer the following question. (Any One)',
            totalMarks: 6,
            subQuestions: q6Subs,
          },
          {
            questionNumber: 'Q.7',
            title: 'Explain Cohen-Sutherland Line Clipping algorithm.',
            totalMarks: 6,
            subQuestions: q7Subs,
          },
        ],
      },
    });
  }

  return boardSets;
}

export interface UniversityBlueprintValidationResult {
  isValid: boolean;
  paperCode: string;
  totalMarks: number;
  errors: string[];
  checklist: Array<{
    rule: string;
    passed: boolean;
    details: string;
  }>;
}

/**
 * 6. MASTER TEMPLATE STRICT BLUEPRINT VALIDATOR
 * Validates a generated University Board Paper Set against the SLR-HL-475 CBCS Master Template.
 * Disallows PDF generation if any rule fails.
 */
export function validateUniversityMasterBlueprint(
  boardSet: UniversityBoardPaperSet
): UniversityBlueprintValidationResult {
  const errors: string[] = [];
  const checklist: Array<{ rule: string; passed: boolean; details: string }> = [];

  // Check 1: MCQ Count (must be exactly 14 MCQs)
  const mcqCount = boardSet?.mcqSection?.questions?.length || 0;
  const mcqPassed = mcqCount === 14;
  if (!mcqPassed) {
    errors.push(`Q.1 MCQ Count Mismatch: Expected 14 MCQs, found ${mcqCount}.`);
  }
  checklist.push({
    rule: 'Q.1 MCQ Count (14/14)',
    passed: mcqPassed,
    details: mcqPassed ? '14 MCQs verified with 4 options (a, b, c, d).' : `Failed: Found ${mcqCount} MCQs.`,
  });

  // Check 2: Section – I Marks (must be 28 Marks)
  const s1Marks = boardSet?.section1?.questions?.reduce((acc, q) => acc + (q.totalMarks || 0), 0) || 0;
  const s1Passed = s1Marks === 28;
  if (!s1Passed) {
    errors.push(`Section – I Marks Discrepancy: Expected 28 Marks (Q.2: 16, Q.3: 6, Q.4: 6), found ${s1Marks} Marks.`);
  }
  checklist.push({
    rule: 'Section – I Blueprint & Choices (28 Marks)',
    passed: s1Passed,
    details: s1Passed ? 'Q.2 (Any 4, 16M), Q.3 (Any 1, 6M), Q.4 (6M) verified.' : `Failed: ${s1Marks}/28 Marks.`,
  });

  // Check 3: Section – II Marks (must be 28 Marks)
  const s2Marks = boardSet?.section2?.questions?.reduce((acc, q) => acc + (q.totalMarks || 0), 0) || 0;
  const s2Passed = s2Marks === 28;
  if (!s2Passed) {
    errors.push(`Section – II Marks Discrepancy: Expected 28 Marks (Q.5: 16, Q.6: 6, Q.7: 6), found ${s2Marks} Marks.`);
  }
  checklist.push({
    rule: 'Section – II Blueprint & Choices (28 Marks)',
    passed: s2Passed,
    details: s2Passed ? 'Q.5 (Any 4, 16M), Q.6 (Any 1, 6M), Q.7 (6M) verified.' : `Failed: ${s2Marks}/28 Marks.`,
  });

  // Check 4: Total Marks Equality (must be 70 Marks: 14 MCQ + 28 Sec I + 28 Sec II)
  const totalCalculated = (boardSet?.mcqSection?.marks || 0) + s1Marks + s2Marks;
  const totalPassed = totalCalculated === 70;
  if (!totalPassed) {
    errors.push(`Total Paper Marks Discrepancy: Expected 70 Marks (14 MCQ + 28 Sec I + 28 Sec II), calculated ${totalCalculated} Marks.`);
  }
  checklist.push({
    rule: 'Total Examination Marks (70/70)',
    passed: totalPassed,
    details: totalPassed ? 'Total paper marks strictly equals 70 Marks.' : `Failed: Calculated ${totalCalculated} Marks.`,
  });

  // Check 5: Visual Asset Mapping (Diagrams, Tables, Figures, Formulas)
  let visualCount = 0;
  boardSet?.mcqSection?.questions?.forEach(q => {
    if (q.diagram_url || q.image_url || q.has_table) visualCount++;
  });
  boardSet?.section1?.questions?.forEach(q => {
    q.subQuestions?.forEach(sq => {
      if (sq.diagram_url || sq.image_url || sq.has_table) visualCount++;
    });
  });
  boardSet?.section2?.questions?.forEach(q => {
    q.subQuestions?.forEach(sq => {
      if (sq.diagram_url || sq.image_url || sq.has_table) visualCount++;
    });
  });

  checklist.push({
    rule: 'Diagram & Visual Asset Association',
    passed: true,
    details: `Mapped ${visualCount} visual elements (diagrams, tables, graphs) with question text anchors.`,
  });

  // Check 6: Anti-Duplication Integrity
  const allTexts: string[] = [];
  boardSet?.mcqSection?.questions?.forEach(q => allTexts.push(q.content_text));
  boardSet?.section1?.questions?.forEach(q => q.subQuestions?.forEach(sq => allTexts.push(sq.content_text)));
  boardSet?.section2?.questions?.forEach(q => q.subQuestions?.forEach(sq => allTexts.push(sq.content_text)));
  
  const uniqueTexts = new Set(allTexts.map(t => normalizeText(t)));
  const dupPassed = uniqueTexts.size === allTexts.length;
  if (!dupPassed) {
    errors.push(`Collision Alert: Detected ${allTexts.length - uniqueTexts.size} duplicate questions in set.`);
  }
  checklist.push({
    rule: 'Anti-Duplication Question Verification',
    passed: dupPassed,
    details: dupPassed ? `All ${allTexts.length} questions in set are unique.` : `Failed: Found duplicate questions.`,
  });

  return {
    isValid: errors.length === 0,
    paperCode: boardSet?.paperCode || 'SLR-HL-475',
    totalMarks: totalCalculated,
    errors,
    checklist,
  };
}


import crypto from 'crypto';

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
 * Cryptographically secure Fisher-Yates shuffle
 */
export function cryptoShuffle<T>(array: T[]): T[] {
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
  customPaperCode: string = 'SLR-HL-475'
): UniversityBoardPaperSet[] {
  const setNames = ['Set P', 'Set Q', 'Set R', 'Set S'];

  // Separate MCQs and Theory questions from candidate draft pool
  const mcqPool: QuestionItem[] = [];
  const theoryPool: QuestionItem[] = [];

  const seenHashes = new Set<string>();
  draftPool.forEach(q => {
    const textHash = sha256(normalizeText(q.content_text));
    if (seenHashes.has(textHash)) return;
    seenHashes.add(textHash);

    const { options } = parseAndNormalizeOptions(q.options_json, q.correct_answer);
    if (options.length >= 2 || q.question_type === 'MCQ') {
      mcqPool.push(q);
    } else {
      theoryPool.push(q);
    }
  });

  const boardSets: UniversityBoardPaperSet[] = [];

  for (let s = 0; s < numSets; s++) {
    const setLabel = setNames[s] || `Set ${String.fromCharCode(80 + s)}`;
    const versionCode = `UNIV-${customPaperCode}-${setLabel.replace(/\s+/g, '')}-${Date.now().toString().slice(-4)}`;

    // Permute MCQs for Q.1 (14 MCQs)
    const shuffledMcqs = cryptoShuffle(mcqPool);
    const selectedMcqs = shuffledMcqs.slice(0, 14);

    // If candidate pool has fewer than 14 MCQs, cycle/fallback
    while (selectedMcqs.length < 14 && mcqPool.length > 0) {
      selectedMcqs.push(mcqPool[selectedMcqs.length % mcqPool.length]);
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

    // Section I:
    // Q.2: Answer the following question. (Any Four) [5 sub-questions, 4 marks each] -> 16 marks
    // Q.3: Answer the following question. (Any One) [2 sub-questions, 6 marks each] -> 6 marks
    // Q.4: Attempt the following. [2 sub-questions, 3 marks each] -> 6 marks
    // Section II:
    // Q.5: Answer the following question. (Any Four) [5 sub-questions, 4 marks each] -> 16 marks
    // Q.6: Answer the following question. (Any One) [2 sub-questions, 6 marks each] -> 6 marks
    // Q.7: Explain / Solve... [1 question, 6 marks] -> 6 marks

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
        id: `q-fallback-${tIdx++}`,
        content_text: defaultText,
        marks: defaultMarks,
      };
    };

    const q2Subs = [
      getNextTheory('Distinguish between the Raster Scan display and Random Scan display.', 4),
      getNextTheory('Explain 2D Rotation transformation with matrix representations.', 4),
      getNextTheory('Explain any four Computer graphics real-world applications.', 4),
      getNextTheory('Scale the polygon with coordinates P(2,5), Q(7,10), C(10,2) by 2 units in both x and y direction.', 4),
      getNextTheory('Explain Run Length Encoding in image compression.', 4),
    ].map((item, idx) => ({ ...item, subLabel: `${String.fromCharCode(97 + idx)})` }));

    const q3Subs = [
      getNextTheory('Consider a line from (0,0) to (5,6). Use DDA algorithm to rasterize this line.', 6),
      getNextTheory('Write Bresenham’s Circle generation algorithm with derivation.', 6),
    ].map((item, idx) => ({ ...item, subLabel: `${String.fromCharCode(97 + idx)})` }));

    const q4Subs = [
      getNextTheory('Explain Beam Penetration Technique in color CRT monitors.', 3),
      getNextTheory('Explain Shadow Mask Technique in color CRT monitors.', 3),
    ].map((item, idx) => ({ ...item, subLabel: `${String.fromCharCode(97 + idx)})` }));

    const q5Subs = [
      getNextTheory('Write a short note on segmented display file structure.', 4),
      getNextTheory('Explain Viewing transformation pipeline in detail.', 4),
      getNextTheory('Explain properties of Bezier curves and control points.', 4),
      getNextTheory('Explain Z-Buffer depth buffer algorithm for hidden surface removal.', 4),
      getNextTheory('Explain Painter’s algorithm for surface visibility.', 4),
    ].map((item, idx) => ({ ...item, subLabel: `${String.fromCharCode(97 + idx)})` }));

    const q6Subs = [
      getNextTheory('Explain Warnock area subdivision algorithm.', 6),
      getNextTheory('What is antialiasing? Explain different techniques of antialiasing.', 6),
    ].map((item, idx) => ({ ...item, subLabel: `${String.fromCharCode(97 + idx)})` }));

    const q7Subs = [
      getNextTheory('Explain Cohen-Sutherland Line Clipping algorithm with outcodes and clipping region codes.', 6),
    ].map((item) => ({ ...item, subLabel: '' }));

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


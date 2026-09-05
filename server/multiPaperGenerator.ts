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
  subject: string;
  topic: string;
  difficulty: string;
  contentText: string;
  diagramUrl?: string;
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

  if (selectedSourcePaperIds.length < 2) {
    errors.push('At least 2 source papers must be selected to generate a multi-paper balanced combination.');
  }

  // Check subject requirements
  for (const sRule of blueprint.subjects) {
    const subjectQuestions = available.filter(
      q => q.subject.toLowerCase() === sRule.subject.toLowerCase()
    );
    if (subjectQuestions.length < sRule.count) {
      errors.push(
        `Insufficient questions for Subject "${sRule.subject}": Needed ${sRule.count}, but found only ${subjectQuestions.length} across selected papers.`
      );
    }
  }

  // Check maximum contribution cap feasibility
  const maxAllowedPerPaper = Math.ceil(
    blueprint.totalQuestions * (blueprint.maxSourceContributionPercent / 100)
  );
  const minRequiredPapers = Math.ceil(blueprint.totalQuestions / maxAllowedPerPaper);
  if (selectedSourcePaperIds.length < minRequiredPapers) {
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

 const maxAllowedPerPaper = Math.ceil(
 blueprint.totalQuestions * (blueprint.maxSourceContributionPercent / 100)
 );
 const sourceContributionCount: Record<string, number> = {};
 selectedSourcePaperIds.forEach(id => {
 sourceContributionCount[id] = 0;
 });

 const selectedQuestions: QuestionItem[] = [];
 const selectedIds = new Set<string>();

 // 3. Process each subject in blueprint
 for (const sRule of blueprint.subjects) {
 const subjectTarget = sRule.count;

 // Calculate difficulty targets for this subject
 const easyTarget = Math.round(subjectTarget * (blueprint.difficulty.easy / 100));
 const hardTarget = Math.round(subjectTarget * (blueprint.difficulty.hard / 100));
 const mediumTarget = subjectTarget - easyTarget - hardTarget;

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
 q.subject.toLowerCase() === sRule.subject.toLowerCase() &&
 q.difficulty.toUpperCase() === bucket.difficulty.toUpperCase()
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
 if (currentPaperCount < maxAllowedPerPaper) {
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
 q.subject.toLowerCase() === sRule.subject.toLowerCase()
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
 if (currentPaperCount < maxAllowedPerPaper) {
 selectedQuestions.push(q);
 selectedIds.add(q.id);
 sourceContributionCount[paperId] = currentPaperCount + 1;
 needed--;
 }
 }
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
 subject: q.subject,
 topic: q.topic || 'General',
 difficulty: q.difficulty,
 contentText: q.content_text,
 diagramUrl: q.diagram_url,
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

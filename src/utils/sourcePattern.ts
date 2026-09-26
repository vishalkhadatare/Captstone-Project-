/**
 * Deterministic detection of a question paper's structure from its extracted text.
 *
 * The synthesis model is asked to "preserve the exact pattern", but a language
 * model reading raw page text reliably invents a plausible layout instead of
 * copying the real one. Measured: the sources were
 *   "Section I: Objective / MCQs (9 Questions)" + "Section II: Descriptive /
 *   Theory Questions (17 Questions)", Max. Marks: 34
 * and
 *   "SECTION - I (Theory & Analysis) [28] + SECTION - II (Applications & System
 *   Problems) [28]", Max. Marks: 70
 * while the generated paper came back as "SECTION - I [35 Marks] / SECTION - II
 * [35 Marks]" with six questions - a pattern belonging to neither source.
 *
 * Detecting the pattern in code means it can be stated to the model as a hard
 * constraint, and shown to the examiner so a bad detection is visible instead of
 * being buried inside a plausible-looking paper.
 */

/** What kind of question the source paper actually prints. */
export type DetectedQuestionType = 'objective' | 'descriptive' | 'numerical' | 'mixed';

export interface DetectedQuestionRef {
  number: string;
  marks: number | null;
  /**
   * Distinct choices printed for this question ("a)", "b)", ...). A section
   * whose heading says "Objective / MCQs" is only treated as a choice section
   * when its questions really print choices - the dump of the examiner's own
   * uploads contains an "Objective / MCQs" heading over descriptive questions.
   */
  optionCount: number;
  /** Read from what is printed under the question, never from the heading. */
  type: DetectedQuestionType;
  /** The printed attempt rule, e.g. "Attempt Any Four". */
  attemptRule: string | null;
  /**
   * Printed alternatives found under the question. Advisory only: scanned papers
   * lose option labels, so a number here is only recorded when the labels were
   * actually read (two or more), and never used to reject a paper.
   */
  alternatives: number | null;
}

export interface DetectedSection {
  title: string;
  instruction: string;
  /** Count the source paper declares in its heading, e.g. "(9 Questions)". */
  declaredCount: number | null;
  totalMarks: number | null;
  questions: DetectedQuestionRef[];
  /** True when the paper prints four (or more) choices under its questions. */
  objective: boolean;
}

/**
 * The objective block, which is one printed question containing N items.
 *
 * This is the piece a text scan gets wrong: "Q.1" opens the block and is
 * followed by items numbered `1)`, `2)`, ... `14)`. Reading those item numbers as
 * top-level questions is what produced "Section - I must contain 22 questions".
 */
export interface DetectedObjectiveBlock {
  questionNumber: string;
  count: number;
  marks: number | null;
  optionsPerQuestion: number;
}

export interface DetectedPattern {
  sourceName: string;
  sections: DetectedSection[];
  totalQuestions: number;
  totalMarks: number | null;
  /** The objective/MCQ block, kept apart from the descriptive sections. */
  objective: DetectedObjectiveBlock | null;
  /** Pages recognised in the extract, and the furniture excluded from analysis. */
  pageCount: number;
  furniture: string[];
  /**
   * The set the paper was printed as ("P"), when it states one. A PDF holding
   * several sets is analysed one set at a time, never as one merged paper.
   */
  set: string | null;
  /** All set labels found in the extract, so a multi-set upload is visible. */
  sets: string[];
}

/**
 * The paper's structure as data rather than prose, which is what validation
 * compares against. See `normalizePattern`.
 */
export interface NormalizedPaperQuestion {
  number: string;
  type: DetectedQuestionType;
  marks: number | null;
  attemptRule: string | null;
  alternatives: number | null;
}

export interface NormalizedPaperSection {
  name: string;
  questions: NormalizedPaperQuestion[];
}

export interface NormalizedTemplate {
  sourceName: string;
  totalMarks: number | null;
  objective: {
    questionNumber: string;
    count: number;
    marks: number | null;
    optionsPerQuestion: number;
  } | null;
  sections: NormalizedPaperSection[];
}

/** Loose form, used to recognise a heading wherever it appears in a line. */
const SECTION_HEADING = /\b(?:SECTION|Section)\s*[\u2013\u2014\-:]?\s*(?:[IVXLC]+|\d+)\b/;
/** A line that IS a heading, possibly with a declared count and nothing else. */
const SECTION_LINE = /^\s*(?:SECTION|Section)\s*[\u2013\u2014\-:]?\s*([IVXLC]+|\d{1,2})\b\s*(.*)$/;
/**
 * A question the paper prints as its own container: "Q.2 Attempt Any Four:".
 *
 * The bare `1)` form is deliberately NOT a question here. In these papers the
 * numbered items are the sub-parts of a container question (the 14 MCQs), and
 * the instruction block is numbered the same way - reading those as questions is
 * what inflated the detected paper.
 */
const QUESTION_HEAD = /^\s*Q\.?\s*(\d{1,2})\b\s*(.*)$/i;
const ITEM_LINE = /^\s*(\d{1,2})\s*[\.\)]\s*(.*)$/;
/** A labelled sub-item: "a) ...", "b) ...", "i) ...", "iv. ...". */
const SUB_ITEM_LABEL = /^\s*\(?(?:[a-dA-D]|[ivx]{1,4})\)\s*\S/;
const ANY_OPTION_LABEL = /(?:^|[\s(])([a-dA-D])\)\s*\S/g;
const BRACKET_MARKS = /\[\s*(\d{1,3})\s*Marks?\s*\]/i;
const BARE_BRACKET_MARKS = /\[\s*(\d{1,3})\s*\]/;
const PAREN_MARKS = /\(\s*(\d{1,3})\s*Marks?\s*\)/i;
/** A marks number printed at the end of a question line: "Attempt Any Four:\t16". */
const TRAILING_MARKS = /(?:^|[\s\t])(\d{1,3})\s*$/;
const DECLARED_COUNT = /\(\s*(\d{1,3})\s+Questions?\s*\)/i;
const MAX_MARKS = /Max\.?\s*Marks?\s*[:\-]?\s*(\d{1,3})/i;
/** The printed marks for the objective block: "Duration: 30 Minutes\tMarks: 14". */
const OBJECTIVE_MARKS = /Marks?\s*[:\-]\s*(\d{1,3})/i;
const INSTRUCTION_HINT = /attempt|answer\s+any|choose\s+the\s+correct|select\s+and\s+write/i;
const ATTEMPT_RULE = /(attempt|answer)\s+(?:any\s+)?([A-Za-z]+)/i;
/** "Each question carries one mark" fixes how many marks one objective item is worth. */
const MARKS_PER_ITEM = /each\s+question\s+carries\s+([a-z]+)\s+marks?/i;
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};
const OBJECTIVE_HEADING = /\b(?:mcq|objective|multiple\s*choice|choose\s+the\s+correct)\b/i;
const INSTRUCTION_BLOCK = /^\s*instructions?\s*[:.\-]?/i;
/** Page furniture that must never be read as content. */
const FURNITURE_LINE = [
  /^page\s*\d+\s*(?:of|\/)\s*\d+$/i,
  /^set\s*[-:.]?\s*[pqrs]$/i,
  /^seat\s*no\.?$/i,
  /^seat$/i,
  /^no\.?$/i,
];
const PAGE_MARKER = /^-{2,}\s*PAGE\s+\d+\s*-{2,}$/i;
/** "Set P" / "Set: Q" as its own line, which is how a paper states its set. */
const SET_LABEL = /^\s*set\s*[-:.]?\s*([PQRS])\s*$/i;

function normaliseLine(line: string): string {
  return line.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Split an extract into pages. The OCR helper writes `--- PAGE n ---` between
 * pages, which is what makes page-aware parsing possible at all.
 */
export function splitIntoPages(text: string): string[][] {
  const raw = text.replace(/\r/g, '').replace(/\u00a0/g, ' ');
  const pages: string[][] = [];
  let current: string[] = [];
  for (const line of raw.split('\n')) {
    if (PAGE_MARKER.test(line.trim())) {
      pages.push(current);
      current = [];
      continue;
    }
    const cleaned = normaliseLine(line);
    if (cleaned) current.push(cleaned);
  }
  pages.push(current);
  return pages.filter((page) => page.length > 0);
}

/**
 * Identify the running head/foot, set label, seat box and page numbering.
 *
 * A line printed on two or more pages is the printer's furniture, not the exam's
 * content - this is what stops a repeated "Section - I" or "Set P" from being
 * counted again every time it appears.
 */
export function findPageFurniture(pages: string[][]): Set<string> {
  const counts = new Map<string, number>();
  for (const page of pages) {
    for (const line of new Set(page)) {
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }
  const furniture = new Set<string>();
  for (const [line, count] of counts) {
    if (count >= 2 && line.length <= 200) furniture.add(line);
    if (FURNITURE_LINE.some((pattern) => pattern.test(line))) furniture.add(line);
  }
  return furniture;
}

/**
 * The analysable body: page furniture removed, first occurrence of each
 * furniture line kept so the masthead is still readable.
 */
function structuralLines(pages: string[][], furniture: Set<string>): string[] {
  const out: string[] = [];
  const kept = new Set<string>();
  for (const page of pages) {
    for (const line of page) {
      if (furniture.has(line)) {
        if (kept.has(line)) continue;
        kept.add(line);
      }
      out.push(line);
    }
  }
  return out;
}

/**
 * Drop the masthead instruction block.
 *
 * "Instructions: 1) ...  2) ...  3) ..." is numbered exactly like the questions,
 * so `2)` and `3)` were being read as Q.2 and Q.3. The block runs until a real
 * section heading or a printed question container opens.
 */
function stripInstructionBlocks(lines: string[]): string[] {
  const out: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (INSTRUCTION_BLOCK.test(line)) {
      inside = true;
      continue;
    }
    if (inside) {
      if (
        SECTION_LINE.test(line) ||
        QUESTION_HEAD.test(line) ||
        OBJECTIVE_HEADING.test(line) ||
        ATTEMPT_RULE.test(line)
      ) {
        inside = false;
      } else {
        continue;
      }
    }
    out.push(line);
  }
  return out;
}

/** How many distinct a)-d) labels a block of item lines prints. */
function countOptionLabels(itemLines: string[]): number {
  const letters = new Set<string>();
  for (const match of itemLines.join('\n').matchAll(ANY_OPTION_LABEL)) {
    letters.add(match[1].toLowerCase());
  }
  return letters.size;
}

/**
 * Find the objective block: a sequential run of `1)`, `2)`, ... items.
 *
 * The run is anchored on the printed container question that opens it ("Q. 1
 * Choose the correct alternatives") and stops at the section heading or the
 * first attempt-rule question that follows it.
 */
function findObjectiveRun(
  lines: string[]
): { items: string[][]; container: string | null; highestLabel: number } | null {
  const sectionStart = lines.findIndex((line) => SECTION_LINE.test(line));
  const limit = sectionStart === -1 ? lines.length : sectionStart;
  let best: { items: string[][]; container: string | null; highestLabel: number } | null = null;

  const containerBefore = (index: number): string | null => {
    for (let i = index - 1; i >= 0 && i >= index - 15; i -= 1) {
      const head = lines[i].match(QUESTION_HEAD);
      if (head) return `Q.${Number(head[1])}`;
    }
    return null;
  };

  /** Walk one candidate run, tolerating item labels the scan dropped. */
  const collect = (start: number) => {
    const items: string[][] = [];
    let current: string[] | null = null;
    let highest = 0;
    let j = start;
    while (j < limit) {
      const line = lines[j];
      // A new container, a fresh section, or the descriptive block ends the run.
      if (
        (QUESTION_HEAD.test(line) && !ITEM_LINE.test(line)) ||
        SECTION_LINE.test(line) ||
        ATTEMPT_RULE.test(line)
      ) {
        break;
      }
      const item = line.match(ITEM_LINE);
      if (item) {
        const n = Number(item[1]);
        // A gap is normal: OCR frequently loses a label (item 3 above prints as
        // bare prose), and one missing label must not end the block.
        if (n === 1 || n > highest) {
          if (current) items.push(current);
          current = [item[2]];
          highest = Math.max(highest, n);
          j += 1;
          continue;
        }
      }
      if (current) current.push(line);
      j += 1;
    }
    if (current) items.push(current);
    return { items, highest };
  };

  for (let i = 0; i < limit; i += 1) {
    const start = lines[i].match(ITEM_LINE);
    if (!start || Number(start[1]) !== 1) continue;
    const { items, highest } = collect(i);
    if (items.length < 3) continue;
    if (!best || items.length > best.items.length) {
      best = { items, container: containerBefore(i), highestLabel: highest };
    }
  }

  return best;
}

/** How many marks one objective item is worth, when the paper states it. */
function readMarksPerItem(lines: string[]): number | null {
  for (const line of lines.slice(0, 80)) {
    const match = line.match(MARKS_PER_ITEM);
    if (!match) continue;
    const word = match[1].toLowerCase();
    if (NUMBER_WORDS[word]) return NUMBER_WORDS[word];
    const value = Number(word);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

/**
 * Read the section layout, question numbering and marking scheme out of a
 * paper's extracted text. Returns null when the text carries no questions.
 */
export function detectPaperPattern(text: string, sourceName = 'source paper'): DetectedPattern | null {
  if (!text || text.trim().length < 40) return null;

  const allPages = splitIntoPages(text);

  // Set P and Set Q are DIFFERENT papers. When an upload holds more than one
  // set, only the set printed on the most pages is analysed; merging them would
  // multiply the question count by the number of sets.
  const pageSets = allPages.map((page) => {
    for (const line of page) {
      const match = line.match(SET_LABEL);
      if (match) return match[1].toUpperCase();
    }
    return null;
  });
  const sets = [...new Set(pageSets.filter((label): label is string => Boolean(label)))];
  let pages = allPages;
  let analysedSet: string | null = sets[0] ?? null;
  if (sets.length > 1) {
    const tally = new Map<string, number>();
    pageSets.forEach((label) => {
      if (label) tally.set(label, (tally.get(label) ?? 0) + 1);
    });
    analysedSet = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? sets[0];
    pages = allPages.filter((_, index) => pageSets[index] === analysedSet);
  }
  if (pages.length === 0) pages = allPages;

  const furniture = findPageFurniture(pages);

  // The objective block is found on the raw page lines, because the instruction
  // block that precedes it is removed before the rest of the parse.
  const rawLines = pages.flat();
  const objectiveRun = findObjectiveRun(rawLines);
  const objectiveContainer = objectiveRun?.container ?? (objectiveRun ? 'Q.1' : null);

  let body = structuralLines(pages, furniture);
  // A heading welded onto the end of a line by a two-column read still needs to
  // start its own line, or the section it names is invisible.
  body = body.flatMap((line) => {
    if (!SECTION_HEADING.test(line)) return [line];
    return line.split(new RegExp(`(?=${SECTION_HEADING.source})`)).map((part) => normaliseLine(part)).filter(Boolean);
  });
  body = stripInstructionBlocks(body);

  const sections: DetectedSection[] = [];
  const leadingQuestions: DetectedQuestionRef[] = [];
  let current: DetectedSection | null = null;
  let currentQuestion: DetectedQuestionRef | null = null;
  let optionLetters = new Set<string>();
  let alternativeLabels = new Set<string>();
  let expectInstruction = false;
  let seenObjectiveContainer = false;
  // Two-column papers print the marks on the line BELOW the question, so a
  // question read without marks claims the next marks-only line instead.
  let awaitingMarksFor: DetectedQuestionRef | null = null;
  let marksLookahead = 0;

  const parseQuestion = (number: string, rest: string, line: string, marksFromLine: number | null) => {
    const attempt = rest.match(ATTEMPT_RULE);
    // Keep the printed phrase ("Attempt Any Four") rather than rebuilding it, so
    // the constraint stated to the model matches the source paper's own wording.
    const attemptRule = attempt ? normaliseLine(attempt[0]).replace(/[:.]+$/, '') : null;
    const ref: DetectedQuestionRef = {
      number,
      marks: marksFromLine ?? readMarks(rest, line),
      optionCount: 0,
      type: 'descriptive',
      attemptRule,
      alternatives: null,
    };
    (current ? current.questions : leadingQuestions).push(ref);
    currentQuestion = ref;
    optionLetters = new Set();
    alternativeLabels = new Set();
    if (current) expectInstruction = false;
    if (ref.marks === null) {
      awaitingMarksFor = ref;
      marksLookahead = 0;
    }
    return ref;
  };

  const startSection = (title: string) => {
    const declared = title.match(DECLARED_COUNT);
    const section: DetectedSection = {
      title: title.trim(),
      instruction: '',
      declaredCount: declared ? Number(declared[1]) : null,
      totalMarks: null,
      questions: leadingQuestions.splice(0),
      objective: false,
    };
    sections.push(section);
    current = section;
    expectInstruction = true;
    currentQuestion = null;
    awaitingMarksFor = null;
    optionLetters = new Set();
    alternativeLabels = new Set();
  };

  for (const line of body) {
    if (!line) continue;

    const heading = line.match(SECTION_LINE);
    // A heading is a short line that names a section; a question that merely
    // mentions "Section" is not one.
    if (heading && !QUESTION_HEAD.test(line) && line.length <= 80 && !/[?]/.test(line)) {
      startSection(normaliseLine(line));
      continue;
    }

    // A line that is nothing but a marks token belongs to the question above it.
    if (awaitingMarksFor && marksLookahead < 2) {
      const marks = readMarks(line);
      const leftover = line
        .replace(BRACKET_MARKS, '')
        .replace(PAREN_MARKS, '')
        .replace(BARE_BRACKET_MARKS, '')
        .trim();
      if (marks !== null && leftover.length <= 4) {
        awaitingMarksFor.marks = marks;
        awaitingMarksFor = null;
        continue;
      }
      marksLookahead += 1;
    }

    const head = line.match(QUESTION_HEAD);
    if (head) {
      const number = `Q.${Number(head[1])}`;
      // The objective container holds the numbered items; it is not a section
      // question of its own, and it must not be counted twice.
      if (
        !current &&
        objectiveContainer &&
        number === objectiveContainer &&
        !seenObjectiveContainer
      ) {
        seenObjectiveContainer = true;
        continue;
      }
      parseQuestion(number, head[2] || '', line, readTrailingMarks(line));
      continue;
    }

    // What an `a)` line means depends on the question above it, and that is the
    // distinction a text scan cannot make on its own:
    //   - with an attempt rule ("Attempt Any Two"), a) b) c) are ALTERNATIVES the
    //     candidate chooses between - a descriptive question, never an MCQ;
    //   - without one, a) b) c) d) is a printed CHOICE LIST, which is what makes
    //     a question objective.
    if (currentQuestion) {
      if (currentQuestion.attemptRule) {
        if (SUB_ITEM_LABEL.test(line)) {
          const label = line.match(SUB_ITEM_LABEL)?.[0]?.replace(/[^A-Za-z]/g, '').toLowerCase();
          if (label) alternativeLabels.add(label);
          currentQuestion.alternatives = alternativeLabels.size >= 2 ? alternativeLabels.size : null;
          if (current) expectInstruction = false;
          continue;
        }
      } else {
        for (const match of line.matchAll(ANY_OPTION_LABEL)) optionLetters.add(match[1].toLowerCase());
        if (optionLetters.size >= 3) currentQuestion.optionCount = optionLetters.size;
        if (optionLetters.size > 0) {
          if (current) expectInstruction = false;
          continue;
        }
      }
    }

    if (current && expectInstruction && !current.instruction && INSTRUCTION_HINT.test(line)) {
      current.instruction = line;
    }
  }

  const usable = sections.filter((section) => section.questions.length > 0);
  const statedMax = Number(text.match(MAX_MARKS)?.[1] ?? NaN);
  const paperTotal = Number.isFinite(statedMax) ? statedMax : null;

  // Whether a section carries choices comes from what is printed under its
  // questions - never from the heading, and never from a) b) c) parts that an
  // attempt rule turns into alternatives.
  usable.forEach((section) => {
    section.objective = section.questions.some((question) => question.optionCount >= 4);
  });

  const objectiveMarks = objectiveRun ? readObjectiveMarks(rawLines) : null;

  // One question whose marks the scan dropped can be recovered from the paper's
  // stated total: 70 - (14 + 16 + 16 + 12) leaves 12 for Q.3.
  if (paperTotal !== null) {
    const everyQuestion = [...usable.flatMap((section) => section.questions)];
    const missing = everyQuestion.filter((question) => question.marks === null);
    const known = everyQuestion.reduce((sum, question) => sum + (question.marks ?? 0), 0);
    const remainder = paperTotal - known - (objectiveMarks ?? 0);
    if (missing.length === 1 && remainder > 0 && remainder <= 40) {
      missing[0].marks = remainder;
    }
  }

  // Section totals are computed after the recovery above, so a section is not
  // left with no total merely because one of its marks was read late.
  usable.forEach((section) => {
    const marks = section.questions.map((q) => q.marks).filter((m): m is number => m !== null);
    section.totalMarks =
      marks.length === section.questions.length && marks.length > 0
        ? marks.reduce((sum, m) => sum + m, 0)
        : null;
  });
  const marksPerItem = readMarksPerItem(rawLines);
  const objective: DetectedObjectiveBlock | null = objectiveRun
    ? {
        questionNumber: objectiveContainer ?? 'Q.1',
        // The printed count wins over the labels actually read: a scan that drops
        // item 3 still leaves 14 items printed, and the paper says each is worth
        // one mark while stating the block is worth 14.
        count:
          marksPerItem === 1 && objectiveMarks
            ? objectiveMarks
            : Math.max(objectiveRun.highestLabel, objectiveRun.items.length),
        marks: objectiveMarks,
        optionsPerQuestion: Math.min(
          4,
          Math.max(1, ...objectiveRun.items.map((item) => countOptionLabels(item)))
        ),
      }
    : null;

  if (usable.length === 0 && !objective) return null;

  const sectionMarks = usable
    .map((section) => section.questions.reduce((sum, q) => sum + (q.marks ?? 0), 0))
    .reduce((sum, n) => sum + n, 0);

  const sectionQuestions = usable.reduce((sum, section) => sum + section.questions.length, 0);

  return {
    sourceName,
    sections: usable,
    // The objective items are questions the paper prints, so they belong in the
    // total: a paper with 14 MCQs and 4 descriptive questions has 18.
    totalQuestions: sectionQuestions + (objective?.count ?? 0),
    totalMarks:
      paperTotal ?? (sectionMarks + (objective?.marks ?? 0) > 0 ? sectionMarks + (objective?.marks ?? 0) : null),
    objective,
    pageCount: safePageCount(allPages.length),
    furniture: [...furniture],
    set: analysedSet,
    sets,
  };
}

/** The page count is always a number, never undefined. */
function safePageCount(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * The marks printed against the objective block.
 *
 * The masthead's "Max. Marks: 70" is the paper total, not the block total, and
 * reading it here made the objective block claim the whole paper's marks.
 */
function readObjectiveMarks(lines: string[]): number | null {
  for (const line of lines.slice(0, 80)) {
    if (/max\.?\s*marks?/i.test(line)) continue;
    if (!/marks?\s*[:\-]/i.test(line)) continue;
    const match = line.match(OBJECTIVE_MARKS);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > 0 && value <= 100) return value;
    }
  }
  return null;
}

/** Marks printed at the end of a question line, e.g. "Q.2 Attempt Any Four:\t16". */
function readTrailingMarks(line: string): number | null {
  const withoutAttempt = line.replace(ATTEMPT_RULE, ' ').trim();
  const match = withoutAttempt.match(TRAILING_MARKS);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 && value <= 100 ? value : null;
}

/**
 * The paper's structure as the validator compares it: printed question numbers,
 * marks and attempt rules, with the objective block kept separate.
 */
export function normalizePattern(pattern: DetectedPattern): NormalizedTemplate {
  return {
    sourceName: pattern.sourceName,
    totalMarks: pattern.totalMarks,
    objective: pattern.objective,
    sections: pattern.sections.map((section) => ({
      name: section.title,
      questions: section.questions.map((question) => ({
        number: question.number,
        type: question.type,
        marks: question.marks,
        attemptRule: question.attemptRule,
        alternatives: question.alternatives,
      })),
    })),
  };
}


function readMarks(...sources: string[]): number | null {
  for (const source of sources) {
    const match = source.match(BRACKET_MARKS) || source.match(PAREN_MARKS) || source.match(BARE_BRACKET_MARKS);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

/** Human-readable outline, used to state the pattern to the model and the examiner. */
export function summarizePattern(pattern: DetectedPattern): string {
  const lines: string[] = [];

  if (pattern.objective) {
    const { questionNumber, count, marks, optionsPerQuestion } = pattern.objective;
    lines.push(
      `  - "${questionNumber}" objective block: ${count} item(s)` +
        (marks !== null ? `, ${marks} marks` : '') +
        `, ${optionsPerQuestion} option(s) each`
    );
  }

  for (const section of pattern.sections) {
    const marks = section.totalMarks !== null ? `, ${section.totalMarks} marks total` : '';
    const instruction = section.instruction ? `, instruction: "${section.instruction}"` : '';
    lines.push(`  - "${section.title}": ${section.questions.length} question(s)${marks}${instruction}`);
    for (const question of section.questions) {
      const bits = [
        question.marks !== null ? `${question.marks} marks` : 'marks not printed',
        question.type,
        question.attemptRule ? `"${question.attemptRule}"` : null,
        question.alternatives !== null ? `${question.alternatives} printed alternative(s)` : null,
      ].filter(Boolean);
      lines.push(`      ${question.number}: ${bits.join(', ')}`);
    }
  }

  return [
    `Source: ${pattern.sourceName}` +
      (pattern.set ? ` | Set ${pattern.set}` : '') +
      (pattern.sets.length > 1 ? ` (only Set ${pattern.set} analysed; also found: ${pattern.sets.join(', ')})` : ''),
    `  Pages: ${pattern.pageCount} | Sections: ${pattern.sections.length} | Questions: ${pattern.totalQuestions}` +
      (pattern.totalMarks !== null ? ` | Paper total: ${pattern.totalMarks} marks` : ''),
    `  Page furniture excluded: ${pattern.furniture.length} repeated line(s)`,
    ...lines,
  ].join('\n');
}

/** The richest detected pattern, which is the one worth constraining the model to. */
export function pickPrimaryPattern(
  candidates: Array<DetectedPattern | null>
): DetectedPattern | null {
  const usable = candidates.filter((pattern): pattern is DetectedPattern => pattern !== null);
  if (usable.length === 0) return null;
  return usable.reduce((best, current) => (current.totalQuestions > best.totalQuestions ? current : best));
}

// ---------------------------------------------------------------------------
// Header extraction
// ---------------------------------------------------------------------------

/** The printed masthead of a paper, which the new paper must reproduce verbatim. */
export interface PaperHeader {
  universityName: string | null;
  examName: string | null;
  department: string | null;
  subject: string | null;
  paperCode: string | null;
  maxMarks: number | null;
  durationHours: number | null;
  set: string | null;
  instructions: string[];
}

const HEADER_MAX_MARKS = /max\.?\s*marks?\s*[:\-]?\s*(\d{1,3})/i;
const HEADER_TIME = /(?:time|duration)\s*[:\-]?\s*(\d{1,2}(?:\.\d)?)\s*(?:hours?|hrs?)/i;
const HEADER_SET_LETTER = /(?:question\s*paper\s*)?set\s*[:\-]?\s*([PQRS])\b/i;
const HEADER_SET_NUMBER = /question\s*paper\s*set\s*[:\-]?\s*(\d{1,2})\b/i;
const HEADER_SUBJECT = /subject(?:\s*name)?\s*[:\-]\s*([^|\n]+)/i;
const HEADER_PAPER_CODE = /(?:paper|subject|course)\s*code\s*[:\-]\s*([A-Za-z0-9\-\/.]{2,})/i;
// Only a line that OPENS with the keyword is a masthead line; matching anywhere
// would pick "Write a program to ..." out of a question body.
const HEADER_DEPARTMENT_LINE = /^\s*(?:department|dept\.?|branch|programme)\b[^|]{0,80}/i;
const HEADER_INSTRUCTION_LINE = /^\s*(?:\d{1,2}\s*[\.\)]|\(?[ivx]{1,4}\)?\s*[\.\)])\s*(\S.*)$/i;
const HEADER_UNIVERSITY = /(university|institute|board of studies|state examination)/i;
const HEADER_EXAM = /(examination|semester\s*exam|\bexam\b)/i;
/** A line that opens a question, which must never be mistaken for the masthead. */
const PAPER_QUESTION_START = /^\s*(?:Q\.?\s*\d|\d{1,2}\s*[\.\)]\s*[A-Z])/;

function cleanHeaderValue(value: string | undefined | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, ' ').replace(/^[\s:\-–—|]+|[\s:\-–—|]+$/g, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Read the printed masthead out of a paper's text: the marks total, duration,
 * set, subject, code and the numbered instruction block.
 *
 * The generated paper used to fall back to whatever the form fields held
 * ("Max. Marks: 70", "SLR-FINAL-04") even when the uploaded paper plainly
 * printed "Max. Marks: 34" - a header the source paper never had. Reading the
 * header from the paper keeps the masthead identical.
 */
export function extractPaperHeader(text: string): PaperHeader {
  const empty: PaperHeader = {
    universityName: null,
    examName: null,
    department: null,
    subject: null,
    paperCode: null,
    maxMarks: null,
    durationHours: null,
    set: null,
    instructions: [],
  };
  if (!text || text.trim().length < 20) return empty;

  const flat = text.replace(/\r/g, '').replace(/\u00a0/g, ' ');
  const lines = flat
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const header: PaperHeader = { ...empty };

  const maxMarks = flat.match(HEADER_MAX_MARKS);
  if (maxMarks) {
    const value = Number(maxMarks[1]);
    if (Number.isFinite(value) && value > 0 && value <= 200) header.maxMarks = value;
  }

  const time = flat.match(HEADER_TIME);
  if (time) {
    const value = Number(time[1]);
    if (Number.isFinite(value) && value > 0 && value <= 12) header.durationHours = value;
  }

  const setLetter = flat.match(HEADER_SET_LETTER);
  const setNumber = flat.match(HEADER_SET_NUMBER);
  header.set = setLetter ? setLetter[1].toUpperCase() : setNumber ? setNumber[1] : null;

  header.subject = cleanHeaderValue(flat.match(HEADER_SUBJECT)?.[1]);
  if (header.subject) {
    // "Subject: Security Max. Marks: 70 Marks" and "Subject: OS Paper Code: X"
    // both put another header field on the same line - drop the trailing clause.
    header.subject = cleanHeaderValue(
      header.subject
        .split(/max\.?\s*marks?/i)[0]
        .split(/(?:paper|subject|course)\s*code/i)[0]
    );
  }
  header.paperCode = cleanHeaderValue(flat.match(HEADER_PAPER_CODE)?.[1]);
  const departmentLine = lines.find((line) => HEADER_DEPARTMENT_LINE.test(line));
  header.department = departmentLine ? cleanHeaderValue(departmentLine) : null;

  // The masthead lines: a university/board line and an examination line, which
  // the printer centres above everything else.
  header.universityName =
    lines.find((line) => HEADER_UNIVERSITY.test(line) && line.length <= 120) ?? null;
  header.examName =
    lines.find(
      (line) =>
        HEADER_EXAM.test(line) &&
        line.length <= 120 &&
        !HEADER_INSTRUCTION_LINE.test(line) &&
        !PAPER_QUESTION_START.test(line)
    ) ?? null;

  // The numbered instruction block, kept in printed order. It may be printed
  // inline after "Instructions:", one per line, or a mix of both.
  const instructionStart = lines.findIndex((line) => /^\s*instructions?\b/i.test(line));
  if (instructionStart !== -1) {
    const collected: string[] = [];
    for (let i = instructionStart; i < lines.length && collected.length < 10; i += 1) {
      const line = lines[i];
      if (i === instructionStart) {
        const afterKeyword = line.replace(/^\s*instructions?\s*[:\-]?/i, '').trim();
        if (afterKeyword) collected.push(afterKeyword);
        continue;
      }
      // A numbered instruction line opens with "1)" or "1.", so only an
      // explicit question marker ends the block - not any 1) line.
      if (SECTION_HEADING.test(line) || /^\s*Q\.?\s*\d/i.test(line)) break;
      const numbered = line.match(HEADER_INSTRUCTION_LINE);
      if (numbered) {
        const value = cleanHeaderValue(numbered[1]);
        if (value) collected.push(value);
      } else if (line.length <= 200) {
        const value = cleanHeaderValue(line);
        if (value) collected.push(value);
      }
    }
    header.instructions = collected
      .flatMap((entry) => entry.split(/(?=\b\d{1,2}\s*[\.\)]\s)/))
      .map((entry) => cleanHeaderValue(entry.replace(/^\s*(?:\d{1,2}|\(?[ivx]{1,4}\)?)\s*[\.\)]\s*/i, '')))
      .filter((entry): entry is string => Boolean(entry))
      .slice(0, 8);
  }

  return header;
}


/**
 * Choose the paper that is the structural authority. The user's instruction is
 * explicit: the most recently uploaded paper wins unless one was named, and the
 * rest are style references only. Upload order in the UI is append order, so the
 * last entry is the newest.
 */
export function pickPrimaryPaperIndex(
  papers: Array<{ name: string; text: string }>,
  explicitIndex: number | null = null
): number {
  if (papers.length === 0) return -1;
  if (explicitIndex !== null && explicitIndex >= 0 && explicitIndex < papers.length) return explicitIndex;
  for (let i = papers.length - 1; i >= 0; i -= 1) {
    if (detectPaperPattern(papers[i].text, papers[i].name)) return i;
  }
  return papers.length - 1;
}

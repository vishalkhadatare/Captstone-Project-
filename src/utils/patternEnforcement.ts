/**
 * Enforces the pattern of the uploaded paper on the AI's answer.
 *
 * The detected pattern is currently stated to the model as a binding contract,
 * but a contract the other side can ignore is advice. Measured: a run came back
 * with 15 questions in Section II when the source paper prints 17, another
 * paper inherited the form defaults ("Max. Marks: 70") although its source
 * printed 34, and an "Objective / MCQs" section arrived full of descriptive
 * theory with no options at all.
 *
 * So the pattern is applied to the answer deterministically after the model
 * returns:
 *   - safe deviations (section titles, question numbering, marks values, the
 *     paper total, masthead fields) are overwritten with the source paper's own
 *     values;
 *   - unsafe deviations (a missing section, the wrong number of questions, an
 *     objective question without four choices, duplicated or empty questions)
 *     are reported so the paper can be rejected instead of printed.
 */

import type { DetectedPattern, PaperHeader } from './sourcePattern.ts';
import { normalizePattern, type NormalizedTemplate } from './sourcePattern.ts';

export interface EnforcementResult {
  /** The answer with every safe deviation corrected. */
  paper: any;
  /** Deviations that cannot be repaired without inventing content. */
  violations: string[];
  /** Deviations that were corrected, listed so the fix is visible. */
  repairs: string[];
  /**
   * The comparison as printed lines: what the source paper prints, what the
   * answer holds, and the verdict per question. This is what makes a rejection
   * reviewable instead of a single sentence covering every possible problem.
   */
  summary: string[];
}

function normalizeLabel(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\s\u2013\u2014-]+/g, ' ')
    .replace(/[.:)\]]+/g, '')
    .trim();
}

/**
 * A question number reduced to a comparable key: "Q.2" and "Question 2" both
 * become "2", and "Q.2(a)" becomes "2a" so a sub-part still matches its parent.
 */
function questionKey(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/question/g, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/^q/, '');
}

/**
 * The label a section prints: "Section - I" -> "i", "SECTION II" -> "ii".
 *
 * Sections cannot be matched by position: the answer routinely prints the
 * objective block as its own extra section, which shifts every later section by
 * one and made the descriptive questions look missing.
 */
function sectionOrdinal(title: unknown): string | null {
  const text = String(title ?? '').toLowerCase();
  const named = text.match(/\b(?:section|part)\s*[-\u2013\u2014:.]?\s*([ivxlcdm]{1,5}|\d{1,2})\b/);
  if (named) return named[1];
  const bare = text.trim().match(/^[-\u2013\u2014:.]?\s*([ivxlcdm]{1,5}|\d{1,2})\s*$/);
  return bare ? bare[1] : null;
}

/** A section that is really the objective/MCQ block rather than a named section. */
function looksObjective(section: any): boolean {
  return /\b(?:mcq|objective|multiple\s*choice)\b/i.test(String(section?.title ?? ''));
}

/**
 * Map each printed source section onto the answer's sections.
 *
 * Printed labels win, then titles, then printed order - and the objective block
 * is never claimed by a named source section.
 */
function mapSections(template: NormalizedTemplate, generated: any[]): number[] {
  const used = new Set<number>();
  const result: number[] = template.sections.map(() => -1);

  template.sections.forEach((section, i) => {
    const wanted = sectionOrdinal(section.name);
    if (!wanted) return;
    const found = generated.findIndex((item, index) => !used.has(index) && sectionOrdinal(item?.title) === wanted);
    if (found !== -1) {
      result[i] = found;
      used.add(found);
    }
  });

  template.sections.forEach((section, i) => {
    if (result[i] !== -1) return;
    const wanted = normalizeLabel(section.name);
    if (!wanted) return;
    let found = generated.findIndex((item, index) => !used.has(index) && normalizeLabel(item?.title) === wanted);
    if (found === -1) {
      found = generated.findIndex((item, index) => {
        if (used.has(index)) return false;
        const candidate = normalizeLabel(item?.title);
        return candidate.length > 0 && (candidate.includes(wanted) || wanted.includes(candidate));
      });
    }
    if (found !== -1) {
      result[i] = found;
      used.add(found);
    }
  });

  const spare = generated
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => !used.has(index) && !looksObjective(item));
  template.sections.forEach((_, i) => {
    if (result[i] !== -1) return;
    const next = spare.shift();
    if (!next) return;
    result[i] = next.index;
    used.add(next.index);
  });

  return result;
}

function nonEmptyOptions(question: any): string[] {
  return Array.isArray(question?.options)
    ? question.options.filter((option: unknown) => String(option ?? '').trim().length > 0)
    : [];
}

/**
 * Compare the answer against the normalized template.
 *
 * Only printed facts are compared - a question that is missing, a marks value
 * that contradicts the paper, an option list with a partial choice set. Anything
 * that depends on how a question happens to be wrapped (how many paragraphs a
 * descriptive answer is split into, whether its sub-parts are printed as a) b)
 * c)) is reported, never rejected.
 */
function compareWithTemplate(
  sections: any[],
  template: NormalizedTemplate,
  pattern: DetectedPattern,
  mapping: number[],
  violations: string[],
  repairs: string[],
  summary: string[]
): void {
  const generatedQuestions: any[] = sections.flatMap((section) =>
    Array.isArray(section?.questions) ? section.questions : []
  );

  const questionsOf = (section: any): any[] =>
    Array.isArray(section?.questions) ? section.questions : [];

  /**
   * Find the answer's counterpart for a printed source question.
   *
   * Matching is scoped to the expected section: the source paper restarts its
   * numbering in every section (Section II prints Q.1 and Q.2 again), so a global
   * "Q.1" lookup would bind the descriptive question to the objective one.
   * Within the section the printed number is preferred, then position - but only
   * when the answer holds the same number of questions, because a positional
   * match against a different count would relabel the wrong questions.
   */
  const findInSection = (
    generatedSection: any[],
    expected: { number: string },
    index: number,
    expectedCount: number
  ): any | null => {
    const key = questionKey(expected.number);
    const byKey = generatedSection.find((question) => questionKey(question?.number) === key);
    if (byKey) return byKey;
    const prefixed = generatedSection.find((question) => {
      const candidate = questionKey(question?.number);
      return candidate.length > 0 && (candidate.startsWith(key) || key.startsWith(candidate));
    });
    if (prefixed) return prefixed;
    if (generatedSection.length === expectedCount && index < generatedSection.length) {
      return generatedSection[index];
    }
    return null;
  };

  summary.push('EXPECTED (from the primary source paper):');
  if (template.objective) {
    summary.push(
      `  ${template.objective.questionNumber}: ${template.objective.count} objective item(s), ` +
        `${template.objective.optionsPerQuestion} option(s) each`
    );
  }
  for (const section of template.sections) {
    for (const question of section.questions) {
      summary.push(
        `  ${question.number}: ${question.type}` +
          (question.marks !== null ? `, ${question.marks} marks` : '') +
          (question.attemptRule ? `, ${question.attemptRule}` : '')
      );
    }
  }

  // ---- Section headings (renamed, never invented) ------------------------
  // The answer may carry one extra section holding the objective block, so the
  // heading count is allowed to differ by exactly that block.
  // The answer is allowed one extra section for the objective block: the source
  // paper prints it as a numbered container rather than as a named section, so
  // no named section of the template ever claims it.
  const claimed = new Set(mapping.filter((index) => index !== -1));
  const extraObjectiveSections = sections.filter((section, index) => {
    if (claimed.has(index)) return false;
    if (looksObjective(section)) return true;
    const questions = questionsOf(section);
    return questions.length > 0 && questions.every((question) => nonEmptyOptions(question).length >= 4);
  }).length;
  const allowedSections = template.sections.length + extraObjectiveSections;

  if (sections.length < template.sections.length || sections.length > allowedSections) {
    const names = template.sections.map((section) => `"${section.name}"`).join(', ');
    violations.push(
      `The paper has ${sections.length} section(s) but the source paper has ${template.sections.length}: ${names}.`
    );
  }

  // ---- The objective block ----------------------------------------------
  if (template.objective) {
    const target = template.objective;
    const numberKey = questionKey(target.questionNumber);
    const withChoices = generatedQuestions.filter((question) => nonEmptyOptions(question).length >= 4);
    const byNumber = generatedQuestions.filter((question) => {
      const key = questionKey(question?.number);
      return key === numberKey || key.startsWith(numberKey);
    });

    // Either the answer printed the block as N choice questions, or it numbered N
    // questions as sub-parts of the objective container. Both are the same paper.
    const objectiveItems = withChoices.length >= target.count ? withChoices : byNumber;

    if (objectiveItems.length !== target.count) {
      violations.push(
        `"${target.questionNumber}" must hold ${target.count} objective item(s) as the source paper prints, ` +
          `but the answer has ${objectiveItems.length}.`
      );
    } else {
      objectiveItems.forEach((question: any, j: number) => {
        const options = nonEmptyOptions(question);
        // A partial choice set is a real printing defect. No option array at all
        // is how a model writes the items inline, which is handled above.
        if (options.length > 0 && options.length < 4) {
          violations.push(
            `Objective item ${question?.number ?? j + 1} in "${target.questionNumber}" has ` +
              `${options.length} option(s) instead of four choices (a) (b) (c) (d).`
          );
        }
      });
    }

    summary.push(
      `  -> objective: counted ${objectiveItems.length} item(s)` +
        ` (${withChoices.length} with four choices, ${byNumber.length} numbered ${target.questionNumber}(...)); ` +
        `expected ${target.count}` +
        (objectiveItems.length === target.count ? ' PASS' : ' FAIL')
    );
  }

  // ---- Section questions -------------------------------------------------
  // A question is checked by its printed number, its marks and its attempt rule.
  // Its a) b) c) blocks are alternatives, never MCQ choices, so the "four
  // choices" rule is applied only to a section that really prints choice lists.
  template.sections.forEach((expectedSection, sectionIndex) => {
    const generatedSection = mapping[sectionIndex] === -1 ? [] : questionsOf(sections[mapping[sectionIndex]]);
    const missing: string[] = [];
    const objectiveSection = pattern.sections[sectionIndex]?.objective === true;

    expectedSection.questions.forEach((expected, questionIndex) => {
      const question = findInSection(
        generatedSection,
        expected,
        questionIndex,
        expectedSection.questions.length
      );

      if (!question) {
        missing.push(expected.number);
        summary.push(`  -> ${expected.number} in "${expectedSection.name}": MISSING FAIL`);
        return;
      }

      if (question.number !== expected.number) {
        repairs.push(`question numbering ${question.number ?? '?'} -> ${expected.number}`);
        question.number = expected.number;
      }

      if (expected.marks !== null && readMarksValue(question.marks) !== expected.marks) {
        repairs.push(`marks for ${expected.number}: "${question.marks ?? ''}" -> ${expected.marks}`);
        question.marks = toMarksString(expected.marks);
      }

      // The attempt rule is the paper's own wording ("Attempt Any Four"). When the
      // answer states a different rule, the phrase is corrected in place - this
      // is the paper's instruction, not the question's content.
      if (expected.attemptRule) {
        const text = String(question.text ?? '');
        const printedRule = text.match(/attempt\s+any\s+[a-z]+/i) || text.match(/answer\s+any\s+[a-z]+/i);
        if (printedRule && normalizeLabel(printedRule[0]) !== normalizeLabel(expected.attemptRule)) {
          repairs.push(`${expected.number} attempt rule: "${printedRule[0]}" -> "${expected.attemptRule}"`);
          question.text = text.replace(printedRule[0], expected.attemptRule);
        }
      }

      // Only a genuinely objective section is held to the four-choices rule, and
      // only for a partial choice set: an answer that writes the items inline has
      // no option array at all, which is how the paper is often returned.
      if (objectiveSection) {
        const options = nonEmptyOptions(question);
        if (options.length > 0 && options.length < 4) {
          violations.push(
            `"${expectedSection.name}" is an objective section, but ${expected.number} ` +
              `has ${options.length} option(s) instead of four choices (a) (b) (c) (d).`
          );
        }
      }

      summary.push(
        `  -> ${expected.number} in "${expectedSection.name}": found, marks ${
          expected.marks !== null && readMarksValue(question.marks) === expected.marks ? 'match' : 'repaired'
        } PASS`
      );
    });

    // One report per section, naming the questions that are actually absent: a
    // count on its own cannot say which question went missing.
    if (missing.length > 0) {
      violations.push(
        `"${expectedSection.name}" must contain ${expectedSection.questions.length} question(s) ` +
          `as the source paper prints, but ${missing.join(', ')} ` +
          (missing.length === 1 ? 'is missing from the answer.' : 'are missing from the answer.')
      );
    }
  });

  summary.push('STATUS: ' + (violations.length === 0 ? 'PASS' : `${violations.length} real mismatch(es)`));
}

function toMarksString(value: number): string {
  return String(value);
}

function readMarksValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value ?? '').match(/(\d{1,3})/);
  return match ? Number(match[1]) : null;
}

function bodySections(paper: any): any[] {
  return Array.isArray(paper?.sections) ? paper.sections : [];
}

/**
 * Apply the source paper's structure to the model's answer.
 *
 * `pattern` comes from `detectPaperPattern` on the primary uploaded paper, so it
 * describes what the paper actually prints. Everything it can prove is forced;
 * everything it cannot prove is reported.
 */
export interface EnforcementOptions {
  /** How many source-paper figures were cropped and can be referenced. */
  availableFigures?: number;
}

/**
 * A reference to a figure lifted out of the source paper. Kept in step with the
 * marker `splitLatexExtras` strips out and `renderSourceFigureLatex` prints.
 */
const FIGURE_MARKER = /\[\[\s*FIGURE\s*[:\s]\s*((?:\d{1,2}))\s*\]\]|\[\s*FIGURE\s*[:\s]\s*(\d{1,2})\s*\]/gi;

export function enforceStructuralPattern(
  paper: any,
  pattern: DetectedPattern | null,
  header: PaperHeader | null = null,
  options: EnforcementOptions = {}
): EnforcementResult {
  const violations: string[] = [];
  const repairs: string[] = [];
  const summary: string[] = [];
  const result = paper && typeof paper === 'object' ? { ...paper } : {};
  const sections = bodySections(result).map((section: any) => ({
    ...section,
    questions: Array.isArray(section?.questions) ? section.questions.map((q: any) => ({ ...q })) : [],
  }));
  result.sections = sections;

  // ---- Masthead ----------------------------------------------------------
  if (header) {
    const masthead: Array<[keyof PaperHeader, string]> = [
      ['universityName', 'universityName'],
      ['examName', 'examName'],
      ['subject', 'subject'],
      ['paperCode', 'paperCode'],
    ];
    for (const [sourceKey, paperKey] of masthead) {
      const value = header[sourceKey];
      if (typeof value === 'string' && value.length > 0 && result[paperKey] !== value) {
        repairs.push(`header ${paperKey}: "${result[paperKey] ?? ''}" -> "${value}" (as printed on the source paper)`);
        result[paperKey] = value;
      }
    }
    if (header.durationHours !== null && !String(result.duration ?? '').includes(String(header.durationHours))) {
      const replacement = `${header.durationHours} Hours`;
      repairs.push(`duration: "${result.duration ?? ''}" -> "${replacement}"`);
      result.duration = replacement;
    }
    if (Array.isArray(header.instructions) && header.instructions.length > 0) {
      const current = Array.isArray(result.instructions) ? result.instructions : [];
      if (current.length !== header.instructions.length) {
        repairs.push(
          `instructions: replaced ${current.length} line(s) with the ${header.instructions.length} printed on the source paper`
        );
        result.instructions = [...header.instructions];
      }
    }
  }

  // ---- Paper total -------------------------------------------------------
  const targetTotal = pattern?.totalMarks ?? header?.maxMarks ?? null;
  if (targetTotal !== null) {
    const currentTotal = readMarksValue(result.totalMarks);
    if (currentTotal !== targetTotal) {
      repairs.push(
        `paper total marks: "${result.totalMarks ?? ''}" -> ${targetTotal} (the source paper states this)`
      );
      result.totalMarks = targetTotal;
    }
  }

  // ---- Structure, compared question by question --------------------------
  if (pattern && (pattern.sections.length > 0 || pattern.objective)) {
    const template = normalizePattern(pattern);

    // The set letter prints in the masthead and in the instruction that asks the
    // candidate to write it on the answer booklet, so it is carried as its own
    // field rather than sniffed out of the other header text.
    if (header?.set && result.setLetter !== header.set) {
      repairs.push(`set label: "${result.setLetter ?? ''}" -> "${header.set}"`);
      result.setLetter = header.set;
    }

    // Sections are matched by the label they print, not by position: the answer
    // prints the objective block as its own section, which shifts everything
    // after it.
    const mapping = mapSections(template, sections);

    // Section headings, marks and instruction lines are safe to force: they are
    // printed on the paper, not composed. Question counts are NOT forced or
    // compared by position any more - a count derived from raw text was what
    // rejected sound papers.
    template.sections.forEach((expected, i) => {
      const target = mapping[i];
      if (target === -1) return;
      const section = sections[target];
      if (normalizeLabel(section.title) !== normalizeLabel(expected.name) && expected.name) {
        repairs.push(`section ${i + 1} heading: "${section.title ?? ''}" -> "${expected.name}"`);
        section.title = expected.name;
      }
      const marks = pattern.sections[i]?.totalMarks ?? null;
      if (marks !== null && readMarksValue(section.totalMarks) !== marks) {
        repairs.push(`section ${i + 1} marks: "${section.totalMarks ?? ''}" -> "${toMarksString(marks)}"`);
        section.totalMarks = toMarksString(marks);
      }
      const instruction = pattern.sections[i]?.instruction;
      if (instruction && section.instructions !== instruction) {
        repairs.push(`section ${i + 1} instruction -> "${instruction}"`);
        section.instructions = instruction;
      }
    });

    compareWithTemplate(sections, template, pattern, mapping, violations, repairs, summary);
  }

  // ---- Empty questions ---------------------------------------------------
  // Independent of the template: a question with no text cannot be printed,
  // whoever's structure it follows.
  sections.forEach((section, i) => {
    (Array.isArray(section.questions) ? section.questions : []).forEach((question: any, j: number) => {
      if (String(question?.text ?? '').trim().length < 8) {
        violations.push(
          `Question ${question.number ?? j + 1} in "${section.title ?? `section ${i + 1}`}" has no question text.`
        );
      }
    });
  });

  // ---- Reused source figures -------------------------------------------
  // A figure problem must never cost the examiner the whole paper. A marker the
  // source paper cannot satisfy would print an empty box, so the reference is
  // dropped and reported instead of failing the run - which also covers the case
  // where the figures could not be read out of the upload at all.
  const availableFigures = options.availableFigures ?? 0;
  for (const section of sections) {
    for (const question of section.questions) {
      const text = String(question.text ?? '');
      if (!/FIGURE/i.test(text)) continue;

      const unusable: string[] = [];
      FIGURE_MARKER.lastIndex = 0;
      const cleaned = text.replace(FIGURE_MARKER, (match, braced, plain) => {
        const figureNumber = Number(braced || plain);
        if (Number.isFinite(figureNumber) && figureNumber >= 1 && figureNumber <= availableFigures) return match;
        unusable.push(String(braced || plain));
        return '';
      });

      if (unusable.length === 0) continue;

      question.text = cleaned.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      repairs.push(
        `${question.number ?? 'A question'} referred to [FIGURE:${unusable.join('] and [FIGURE:')}], which ` +
          (availableFigures === 0
            ? 'no figure could be lifted out of the source paper for'
            : `the source paper does not have (it has 1 to ${availableFigures})`) +
          '; the reference was removed rather than failing the paper.'
      );
    }
  }

  // ---- Duplicate questions ----------------------------------------------
  const seen = new Map<string, string>();
  for (const section of sections) {
    for (const question of section.questions) {
      const key = String(question.text ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      if (key.length < 12) continue;
      const previous = seen.get(key);
      if (previous) {
        violations.push(`Question ${question.number ?? '?'} repeats ${previous} (duplicate question text).`);
      } else {
        seen.set(key, `question ${question.number ?? '?'}`);
      }
    }
  }

  return { paper: result, violations, repairs, summary };
}

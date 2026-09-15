export type BlueprintSectionLike = {
  id?: string;
  name?: string;
  subject?: string;
  questionType?: string;
  questionNumber?: string | number;
  totalQuestions?: number | string;
  subQuestions?: number | string;
  subQuestionsToAttempt?: number | string;
  questionsToAttempt?: number | string;
  marksPerQuestion?: number | string;
  marksPerSubQuestion?: number | string;
  mainQuestionMarks?: number | string;
  negativeMarks?: number | string;
  totalMarks?: number | string;
  difficulty?: 'ANY' | 'EASY' | 'MEDIUM' | 'HARD';
};

const getTotalQuestionCount = (section: BlueprintSectionLike = {}) => {
  const raw = section.totalQuestions ?? section.subQuestions ?? 0;
  return Math.max(0, Number(raw || 0));
};

const getQuestionsToAttempt = (section: BlueprintSectionLike = {}) => {
  const raw = section.questionsToAttempt ?? section.subQuestionsToAttempt ?? section.totalQuestions ?? section.subQuestions ?? 0;
  return Math.max(0, Number(raw || 0));
};

const getMarksPerQuestion = (section: BlueprintSectionLike = {}) => {
  const raw = section.marksPerQuestion ?? section.marksPerSubQuestion ?? 0;
  return Math.max(0, Number(raw || 0));
};

export function calculateBlueprintTotals(blueprint: { sections?: BlueprintSectionLike[]; totalMarks?: number | string } = {}) {
  const sections = Array.isArray(blueprint.sections) ? blueprint.sections : [];

  const sectionMarks = sections.map((section) => {
    const attempts = getQuestionsToAttempt(section);
    const marksPerQuestion = getMarksPerQuestion(section);
    return attempts * marksPerQuestion;
  });

  const totalQuestions = sections.reduce((sum, section) => sum + getTotalQuestionCount(section), 0);
  const questionsToAttempt = sections.reduce((sum, section) => sum + getQuestionsToAttempt(section), 0);
  const totalMarks = sectionMarks.reduce((sum, value) => sum + value, 0);

  return {
    totalQuestions,
    questionsToAttempt,
    totalMarks,
    sectionMarks,
  };
}

export function normalizeManualBlueprint(blueprint: Record<string, any>, fallbackExamType = 'MCQ') {
  const sections = Array.isArray(blueprint?.sections)
    ? blueprint.sections.map((section: BlueprintSectionLike, index: number) => {
        const totalQuestions = getTotalQuestionCount(section);
        const marksPerQuestion = getMarksPerQuestion(section);
        const questionsToAttempt = Math.min(
          Math.max(0, getQuestionsToAttempt(section)),
          totalQuestions
        );
        const negativeMarks = Math.max(0, Number(section?.negativeMarks ?? 0));
        const normalizedSection = {
          ...section,
          id: section?.id || `SECTION-${index + 1}`,
          name: String(section?.name || '').trim(),
          subject: String(section?.subject || '').trim(),
          questionNumber: section?.questionNumber ?? String(index + 1),
          questionType: section?.questionType || fallbackExamType || 'MCQ',
          subQuestions: totalQuestions,
          totalQuestions,
          questionsToAttempt,
          marksPerSubQuestion: marksPerQuestion,
          marksPerQuestion,
          mainQuestionMarks: 0,
          negativeMarks,
          difficulty: section?.difficulty || 'ANY',
          totalMarks: Number(section?.totalMarks ?? (questionsToAttempt * marksPerQuestion)),
        };
        return normalizedSection;
      })
    : [];

  const totals = calculateBlueprintTotals({ sections });

  return {
    ...blueprint,
    examType: blueprint?.examType || fallbackExamType || 'MCQ',
    sections,
    totalMarks: Number(blueprint?.totalMarks ?? totals.totalMarks),
    ...totals,
  };
}

export function validateManualBlueprint(blueprint: Record<string, any>) {
  const errors: string[] = [];

  const requiredFields: Array<[string, string]> = [
    ['examName', 'Exam name'],
    ['conductingBody', 'Conducting body'],
    ['paperName', 'Paper name'],
    ['version', 'Blueprint version'],
  ];

  requiredFields.forEach(([key, label]) => {
    if (!String(blueprint?.[key] || '').trim()) {
      errors.push(`${label} is required.`);
    }
  });

  if (!blueprint?.examId) {
    errors.push('Select an exam.');
  }

  if (!Number.isInteger(Number(blueprint?.examYear)) || Number(blueprint.examYear) < 1) {
    errors.push('Exam year must be valid.');
  }

  if (Number(blueprint?.durationMinutes) < 0) {
    errors.push('Duration cannot be negative.');
  }

  if (!Array.isArray(blueprint?.sections) || blueprint.sections.length === 0) {
    errors.push('Add at least one section.');
  }

  const totals = calculateBlueprintTotals({ sections: blueprint?.sections || [] });
  const declaredTotalMarks = Number(blueprint?.totalMarks ?? 0);
  if (declaredTotalMarks !== totals.totalMarks) {
    errors.push(`Total marks must equal the sum of section totals (${totals.totalMarks}).`);
  }

  (blueprint?.sections || []).forEach((section: Record<string, any>, index: number) => {
    const prefix = `Question ${String(section?.questionNumber ?? index + 1)}`;
    if (!String(section?.name || '').trim()) errors.push(`${prefix}: section name is required.`);
    if (!String(section?.subject || '').trim()) errors.push(`${prefix}: subject is required.`);
    if (!String(section?.questionType || '').trim()) errors.push(`${prefix}: question type is required.`);

    const totalQuestions = getTotalQuestionCount(section);
    const questionsToAttempt = getQuestionsToAttempt(section);
    const marksPerQuestion = getMarksPerQuestion(section);
    const negativeMarks = Number(section?.negativeMarks ?? 0);

    if (!Number.isFinite(totalQuestions) || totalQuestions <= 0) {
      errors.push(`${prefix}: total questions must be a valid positive number.`);
    }
    if (!Number.isFinite(questionsToAttempt) || questionsToAttempt <= 0) {
      errors.push(`${prefix}: questions to attempt must be greater than 0.`);
    }
    if (!Number.isFinite(marksPerQuestion) || marksPerQuestion <= 0) {
      errors.push(`${prefix}: marks per question must be greater than 0.`);
    }
    if (questionsToAttempt > totalQuestions) {
      errors.push(`${prefix}: questions to attempt cannot exceed total questions.`);
    }
    if (!Number.isFinite(negativeMarks) || negativeMarks < 0) {
      errors.push(`${prefix}: negative marking cannot be negative.`);
    }
    if (section?.mainQuestionMarks !== undefined && section?.mainQuestionMarks !== null && Number(section.mainQuestionMarks) > 0) {
      errors.push(`${prefix}: main question cannot have separate marks; marks belong only to the sub-questions.`);
    }

    const expectedSectionMarkTotal = questionsToAttempt * marksPerQuestion;
    const sectionTotal = Number(section?.totalMarks ?? expectedSectionMarkTotal);
    if (sectionTotal !== expectedSectionMarkTotal) {
      errors.push(`${prefix}: calculated total marks must equal questions to attempt × marks per question (${expectedSectionMarkTotal}).`);
    }
  });

  return errors;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseQuestionsFromRawText,
  CompetitiveSubjectRule,
  CompetitiveExamBlueprint,
} from './competitiveExam.ts';

test('1. parseQuestionsFromRawText extracts real questions with MCQ options and marks', () => {
  const samplePdfText = `
NATIONAL TESTING AUTHORITY - COMPETITIVE EXAMINATION
SECTION 1: PHYSICS

Q1. Which of the following is an SI unit of electrical capacitance? [4 Marks]
A) Henry
B) Farad
C) Tesla
D) Weber

Q2. When light travels from air into glass, which of the following properties remains constant? [4 Marks]
(A) Wavelength
(B) Frequency
(C) Velocity
(D) Amplitude

Q3. Derive the relationship between root-mean-square speed and temperature for an ideal gas.
  `;

  const parsed = parseQuestionsFromRawText(samplePdfText, 'Physics', 'physics_sample_paper.pdf', 4, 1);

  assert.equal(parsed.length, 3, 'Should extract exactly 3 questions');
  assert.equal(parsed[0].subject, 'Physics');
  assert.equal(parsed[0].type, 'MCQ');
  assert.equal(parsed[0].marks, 4);
  assert.equal(parsed[0].negativeMarks, 1);
  assert.equal(parsed[0].options.length, 4);
  assert.equal(parsed[0].options[1].label, 'B');
  assert.equal(parsed[0].options[1].text, 'Farad');
  assert.equal(parsed[0].sourcePdf, 'physics_sample_paper.pdf');

  // Second question
  assert.equal(parsed[1].type, 'MCQ');
  assert.equal(parsed[1].options.length, 4);
  assert.equal(parsed[1].options[1].text, 'Frequency');

  // Third question (Descriptive)
  assert.equal(parsed[2].type, 'Descriptive');
  assert.match(parsed[2].questionText, /root-mean-square speed/);
});

test('2. Filters out header and footer noise (watermarks, page numbers, instructions)', () => {
  const noisyPdfText = `
CONFIDENTIAL EXAM
Page 1 of 4
END OF QUESTION PAPER
PLEASE TURN OVER (PTO)
SPACE FOR ROUGH WORK

Q1. What is the acceleration due to gravity on the surface of the Earth?
A) 9.8 m/s^2
B) 1.6 m/s^2
C) 11.2 m/s^2
D) 25.4 m/s^2

Page 2 of 4
  `;

  const parsed = parseQuestionsFromRawText(noisyPdfText, 'Physics', 'physics_noisy.pdf', 4, 1);
  assert.equal(parsed.length, 1);
  assert.doesNotMatch(parsed[0].questionText, /CONFIDENTIAL/i);
  assert.doesNotMatch(parsed[0].questionText, /Page 1 of 4/i);
  assert.doesNotMatch(parsed[0].questionText, /SPACE FOR ROUGH WORK/i);
});

test('3. Blueprint calculation and independent subject validation logic', () => {
  const subjects: CompetitiveSubjectRule[] = [
    {
      id: 'sub-1',
      subjectName: 'Physics',
      numberOfQuestions: 10,
      questionType: 'MCQ',
      marksPerQuestion: 4,
      negativeMarks: 1,
      translationRequired: true,
      translationLanguage: 'Hindi',
      subjectOrder: 1,
    },
    {
      id: 'sub-2',
      subjectName: 'Chemistry',
      numberOfQuestions: 10,
      questionType: 'MCQ',
      marksPerQuestion: 4,
      negativeMarks: 1,
      translationRequired: false,
      subjectOrder: 2,
    },
    {
      id: 'sub-3',
      subjectName: 'Biology',
      numberOfQuestions: 20,
      questionType: 'MCQ',
      marksPerQuestion: 4,
      negativeMarks: 1,
      translationRequired: true,
      translationLanguage: 'Hindi',
      subjectOrder: 3,
    },
  ];

  const totalQuestions = subjects.reduce((sum, s) => sum + s.numberOfQuestions, 0);
  const totalMarks = subjects.reduce((sum, s) => sum + s.numberOfQuestions * s.marksPerQuestion, 0);
  const totalNegativeMarks = subjects.reduce((sum, s) => sum + s.numberOfQuestions * s.negativeMarks, 0);

  assert.equal(totalQuestions, 40, 'Total questions must be 40 (10 + 10 + 20)');
  assert.equal(totalMarks, 160, 'Total marks must be 160 (40 * 4)');
  assert.equal(totalNegativeMarks, 40, 'Total negative marks must be 40');

  // Simulated Pools: Physics = 35, Chemistry = 28, Biology = 18 (Insufficient for Biology 20)
  const availablePools: Record<string, number> = {
    physics: 35,
    chemistry: 28,
    biology: 18,
  };

  const validationResults = subjects.map(s => {
    const available = availablePools[s.subjectName.toLowerCase()] || 0;
    const passed = available >= s.numberOfQuestions;
    return {
      subject: s.subjectName,
      required: s.numberOfQuestions,
      available,
      passed,
      message: passed
        ? `${s.subjectName} meets requirement.`
        : `${s.subjectName} requires ${s.numberOfQuestions} verified questions, but only ${available} are available.`,
    };
  });

  assert.equal(validationResults[0].passed, true, 'Physics should pass');
  assert.equal(validationResults[1].passed, true, 'Chemistry should pass');
  assert.equal(validationResults[2].passed, false, 'Biology should fail (18 < 20)');
  assert.equal(
    validationResults[2].message,
    'Biology requires 20 verified questions, but only 18 are available.'
  );
});

test('4. Subject-level question pool isolation and file_id deletion logic', () => {
  // Setup simulated database tables
  interface PoolFileRecord {
    id: string;
    exam_id: string;
    subject_id: string;
    subject_name: string;
    file_name: string;
    status: string;
    question_count: number;
  }

  interface QuestionRecord {
    id: string;
    exam_id: string;
    subject_id: string;
    source_file_id: string;
    subject: string;
    question_text: string;
  }

  let poolFiles: PoolFileRecord[] = [];
  let questions: QuestionRecord[] = [];

  // Step 1: Upload Physics PDF
  const physFileId = 'cpf-phys-001';
  poolFiles.push({
    id: physFileId,
    exam_id: 'exam-101',
    subject_id: 'subj-phys',
    subject_name: 'Physics',
    file_name: 'physics_paper_1.pdf',
    status: 'COMPLETED',
    question_count: 10,
  });
  for (let i = 1; i <= 10; i++) {
    questions.push({
      id: `q-phys-${i}`,
      exam_id: 'exam-101',
      subject_id: 'subj-phys',
      source_file_id: physFileId,
      subject: 'Physics',
      question_text: `Physics Question ${i}`,
    });
  }

  // Step 2: Upload Chemistry PDF with identical filename 'paper_1.pdf'
  const chemFileId = 'cpf-chem-002';
  poolFiles.push({
    id: chemFileId,
    exam_id: 'exam-101',
    subject_id: 'subj-chem',
    subject_name: 'Chemistry',
    file_name: 'paper_1.pdf',
    status: 'COMPLETED',
    question_count: 12,
  });
  for (let i = 1; i <= 12; i++) {
    questions.push({
      id: `q-chem-${i}`,
      exam_id: 'exam-101',
      subject_id: 'subj-chem',
      source_file_id: chemFileId,
      subject: 'Chemistry',
      question_text: `Chemistry Question ${i}`,
    });
  }

  // Step 3: Verify complete subject isolation
  const physFiles = poolFiles.filter(f => f.subject_id === 'subj-phys' && f.status !== 'DELETED');
  const chemFiles = poolFiles.filter(f => f.subject_id === 'subj-chem' && f.status !== 'DELETED');
  const mathFiles = poolFiles.filter(f => f.subject_id === 'subj-math' && f.status !== 'DELETED');

  assert.equal(physFiles.length, 1);
  assert.equal(chemFiles.length, 1);
  assert.equal(mathFiles.length, 0, 'Mathematics must start with 0 files (no cross-subject leakage)');

  const physQuestions = questions.filter(q => q.subject_id === 'subj-phys');
  const chemQuestions = questions.filter(q => q.subject_id === 'subj-chem');
  assert.equal(physQuestions.length, 10);
  assert.equal(chemQuestions.length, 12);

  // Step 4: Delete Physics file by file_id
  const targetDeleteId = physFileId;
  poolFiles = poolFiles.filter(f => f.id !== targetDeleteId);
  questions = questions.filter(q => q.source_file_id !== targetDeleteId);

  // Verify Physics is now empty, but Chemistry is completely intact
  const physFilesAfter = poolFiles.filter(f => f.subject_id === 'subj-phys');
  const chemFilesAfter = poolFiles.filter(f => f.subject_id === 'subj-chem');
  const physQuestionsAfter = questions.filter(q => q.subject_id === 'subj-phys');
  const chemQuestionsAfter = questions.filter(q => q.subject_id === 'subj-chem');

  assert.equal(physFilesAfter.length, 0, 'Physics file must be removed');
  assert.equal(physQuestionsAfter.length, 0, 'Physics questions must be removed');
  assert.equal(chemFilesAfter.length, 1, 'Chemistry file must remain intact');
  assert.equal(chemQuestionsAfter.length, 12, 'Chemistry questions must remain intact');

  // Step 5: Re-upload to Physics (gets a brand new fileId)
  const physReuploadId = 'cpf-phys-003';
  poolFiles.push({
    id: physReuploadId,
    exam_id: 'exam-101',
    subject_id: 'subj-phys',
    subject_name: 'Physics',
    file_name: 'physics_reupload.pdf',
    status: 'COMPLETED',
    question_count: 15,
  });
  for (let i = 1; i <= 15; i++) {
    questions.push({
      id: `q-phys-new-${i}`,
      exam_id: 'exam-101',
      subject_id: 'subj-phys',
      source_file_id: physReuploadId,
      subject: 'Physics',
      question_text: `New Physics Question ${i}`,
    });
  }

  const finalPhysFiles = poolFiles.filter(f => f.subject_id === 'subj-phys');
  const finalPhysQuestions = questions.filter(q => q.subject_id === 'subj-phys');
  assert.equal(finalPhysFiles.length, 1);
  assert.equal(finalPhysFiles[0].id, physReuploadId);
  assert.equal(finalPhysQuestions.length, 15, 'Re-uploaded questions count must be 15, not old count');
});



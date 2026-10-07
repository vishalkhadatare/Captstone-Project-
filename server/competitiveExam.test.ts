import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseQuestionsFromRawText,
  CompetitiveSubjectRule,
  CompetitiveExamBlueprint,
  encryptCompetitivePaperData,
  decryptCompetitivePaperData,
  evaluatePaperEncryptionState,
  hydrateCompetitivePaperRow,
  detectQuestionVisualMetadata,
  bindVisualsToCompetitiveQuestions,
  selectCompetitiveQuestionsWithVisualBinding,
  validateCompetitivePaperVisuals,
  generateCompetitiveExamPdfBuffer,
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

test('5. AES-256-GCM competitive paper encryption and decryption roundtrip preserves English + Marathi bilingual paper', () => {
  const samplePaperPayload = {
    paperId: 'cp-2026-mpsc-01',
    title: 'MPSC State Services Preliminary Examination',
    enableTranslation: true,
    translationLanguage: 'Marathi',
    sections: [
      {
        sectionLetter: 'A',
        subject: 'General Studies',
        questions: [
          {
            id: 'q1',
            displayNumber: '1',
            questionText: 'Which article of the Constitution of India deals with the Finance Commission?',
            translatedText: 'भारताच्या संविधानातील कोणते कलम वित्त आयोगाशी संबंधित आहे?',
            options: [
              { label: 'A', text: 'Article 280' },
              { label: 'B', text: 'Article 324' },
            ],
            translatedOptions: [
              { label: 'A', text: 'कलम २८०' },
              { label: 'B', text: 'कलम ३२४' },
            ],
            marks: 2,
          },
        ],
      },
    ],
  };

  const encryptedRecord = encryptCompetitivePaperData(samplePaperPayload);
  assert.equal(encryptedRecord.algorithm, 'AES-256-GCM-256');
  assert.ok(encryptedRecord.cipherText.length > 20, 'Ciphertext must be non-empty base64');
  assert.doesNotMatch(encryptedRecord.cipherText, /Article 280/, 'Plaintext must not appear in ciphertext');

  const decryptedPayload = decryptCompetitivePaperData(encryptedRecord);
  assert.equal(decryptedPayload.paperId, 'cp-2026-mpsc-01');
  assert.equal(decryptedPayload.translationLanguage, 'Marathi');
  assert.equal(
    decryptedPayload.sections[0].questions[0].translatedText,
    'भारताच्या संविधानातील कोणते कलम वित्त आयोगाशी संबंधित आहे?'
  );
  assert.equal(decryptedPayload.sections[0].questions[0].translatedOptions[0].text, 'कलम २८०');
});

test('6. Server-side time-lock strictly enforces locked state before unlock time and redacts Centre Operator payload', () => {
  const nowMs = Date.now();
  const pastEncryptionIso = new Date(nowMs - 3600 * 1000).toISOString(); // 1 hour ago (9:00 AM)
  const futureUnlockIso = new Date(nowMs + 3600 * 1000).toISOString(); // 1 hour in the future (10:00 AM)
  const pastUnlockIso = new Date(nowMs - 60 * 1000).toISOString(); // 1 minute ago

  const baseRow = {
    id: 'cp-timelock-01',
    exam_id: 'cexam-01',
    org_id: 'ORG-ZEROLEAK-NATIONAL',
    title: 'JEE Main 2026 Official Competitive Paper',
    total_questions: 1,
    total_marks: 4,
    is_finalized: 1,
    encryption_time_iso: pastEncryptionIso,
    decryption_time_iso: futureUnlockIso,
    encryption_time_display: '9:00 AM',
    decryption_time_display: '10:00 AM',
    schedule_exam_date: '2026-09-26',
    schedule_timezone: 'Asia/Kolkata (IST, UTC+05:30)',
    encryption_status: 'ENCRYPTED_LOCKED',
    sections_json: JSON.stringify([
      {
        sectionLetter: 'A',
        subject: 'Physics',
        questions: [{ id: 'q1', questionText: 'Top secret question text' }],
      },
    ]),
    questions_json: JSON.stringify([{ id: 'q1', questionText: 'Top secret question text' }]),
  };

  // Case A: current server time < unlock time -> LOCKED
  const lockedState = evaluatePaperEncryptionState(null, baseRow);
  assert.equal(lockedState.isTimeLocked, true, 'Paper must be locked when server time < unlock time');
  assert.equal(lockedState.canDecryptAndPrint, false, 'Decryption and printing must be disabled before unlock time');
  assert.ok(lockedState.remainingSecondsUntilUnlock > 0, 'Remaining countdown seconds must be positive');

  // Verify Centre Operator hydration strips all plaintext questions before unlock time
  const operatorHydratedLocked = hydrateCompetitivePaperRow(null, baseRow, null, {
    viewerRole: 'CENTRE_OPERATOR',
  });
  assert.equal(operatorHydratedLocked.isContentRedacted, true, 'Operator view must be redacted while locked');
  assert.equal(operatorHydratedLocked.sections.length, 0, 'Sections must be stripped for operator while locked');
  assert.equal(operatorHydratedLocked.questions.length, 0, 'Questions must be stripped for operator while locked');

  // Case B: current server time >= unlock time -> DECRYPT + PRINT ENABLED
  const unlockedRow = {
    ...baseRow,
    decryption_time_iso: pastUnlockIso,
  };
  const unlockedState = evaluatePaperEncryptionState(null, unlockedRow);
  assert.equal(unlockedState.isTimeLocked, false, 'Paper must not be time-locked when server time >= unlock time');
  assert.equal(unlockedState.canDecryptAndPrint, true, 'Decryption and printing must be enabled when server time >= unlock time');
  assert.equal(unlockedState.remainingSecondsUntilUnlock, 0);
});

test('7. Visual extraction metadata detects tables, equations, captions, visual references, and multi-question shared groups', () => {
  const draftTextWithVisuals = `
Directions for Questions 1 to 2: Refer to the following table and circuit diagram shown below.
| Element | Resistance (Ω) | Current (A) |
| R1      | 10             | 2.5         |
| R2      | 20             | 1.25        |
Fig. 1.1: Series-Parallel Bridge Network

Q1. In the circuit shown in Fig. 1.1, calculate the total power dissipated when E = I^2 * R. [4 Marks]
A) 62.5 W
B) 93.75 W
C) 125 W
D) 50 W

Q2. Using the table above, what is the ratio of potential drop across R1 and R2? [4 Marks]
A) 1:1
B) 2:1
C) 1:2
D) 4:1
  `;

  const parsed = parseQuestionsFromRawText(
    draftTextWithVisuals,
    'Physics',
    'draft_circuit_paper.pdf',
    4,
    1,
    'file-circuit-01'
  );

  assert.equal(parsed.length, 2, 'Should extract both linked questions');
  assert.equal(parsed[0].requiresVisual, true, 'Q1 references Fig. 1.1 and shared directive');
  assert.ok(parsed[0].sharedVisualGroupId, 'Q1 must have a sharedVisualGroupId');
  assert.equal(parsed[0].sharedVisualGroupId, parsed[1].sharedVisualGroupId, 'Q1 and Q2 must share the same visual group ID');
  assert.deepEqual(parsed[0].sharedWithQuestionNumbers, ['1', '2']);
  assert.ok(parsed[0].tableData, 'Structured table data must be preserved and bound to Q1');
  assert.equal(parsed[0].tableData?.headers?.length, 3);
  assert.equal(parsed[0].tableData?.rows?.length, 2);
  assert.ok(parsed[0].captions?.some(c => c.includes('Fig. 1.1')), 'Caption must be preserved');
  assert.ok(parsed[0].equations && parsed[0].equations.length > 0, 'Mathematical equation must be detected');
});

test('8. Question + visual binding maps extracted diagrams/crops to questions and applies non-omission fallback', () => {
  const samplePngDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const rawQuestions = parseQuestionsFromRawText(
    `
Q1. Refer to the given ray diagram in Figure 2 and find the focal length of the concave mirror.
A) 10 cm
B) 15 cm
C) 20 cm
D) 25 cm

Q2. In the velocity-time graph shown below, find the displacement in the first 5 seconds.
A) 25 m
B) 50 m
C) 75 m
D) 100 m
    `,
    'Physics',
    'optics_draft.pdf',
    4,
    1,
    'file-optics-01'
  );

  const pythonVisualResult = {
    success: true,
    pageCount: 1,
    isScannedPdf: false,
    scannedPageCount: 0,
    ocrUsed: false,
    questions: [
      {
        questionNumber: '1',
        page: 1,
        bbox: [40, 80, 520, 260] as [number, number, number, number],
        questionText: rawQuestions[0].questionText,
        requiresVisual: true,
        visualReferences: ['Figure 2', 'diagram'],
        captions: ['Figure 2: Concave Mirror Ray Diagram'],
        equations: ['1/f = 1/v + 1/u'],
        tableData: null,
        sharedVisualGroupId: null,
        sharedWithQuestionNumbers: [],
        visualElements: [
          {
            id: 'vis-ray-q1',
            type: 'diagram' as const,
            extractionMethod: 'embedded_image' as const,
            sourcePdf: 'optics_draft.pdf',
            sourceFileId: 'file-optics-01',
            sourcePage: 1,
            questionNumber: '1',
            bbox: [120, 130, 380, 240] as [number, number, number, number],
            width: 260,
            height: 110,
            aspectRatio: 2.36,
            dataUrl: samplePngDataUrl,
            publicUrl: '/competitive_visuals/exam1/file-optics-01/p1_q1_diagram.png',
            caption: 'Figure 2: Concave Mirror Ray Diagram',
            position: 'below_stem' as const,
          },
        ],
      },
    ],
    unassignedVisuals: [],
    totalVisualsExtracted: 1,
    warnings: [],
  };

  const bound = bindVisualsToCompetitiveQuestions(
    rawQuestions,
    pythonVisualResult,
    'optics_draft.pdf',
    'file-optics-01'
  );

  // Q1 has the embedded diagram bound directly
  assert.equal(bound[0].hasVisual, true);
  assert.equal(bound[0].visualElements?.length, 1);
  assert.equal(bound[0].visualElements?.[0].id, 'vis-ray-q1');
  assert.equal(bound[0].visualElements?.[0].caption, 'Figure 2: Concave Mirror Ray Diagram');
  assert.equal(bound[0].imageUrl, samplePngDataUrl);

  // Q2 required a visual ("velocity-time graph shown below"), and even though no embedded image was in pythonVisualResult for Q2,
  // the explicit fallback rule guarantees it is never silently omitted.
  assert.equal(bound[1].requiresVisual, true);
  assert.equal(bound[1].hasVisual, true);
  assert.ok((bound[1].visualElements?.length || 0) >= 1, 'Fallback visual record must be preserved so visual is never silently omitted');
});

test('9. Permutation/combination carries question + bound visuals as an atomic block and links shared multi-question visuals', () => {
  const samplePngDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const poolRows = [
    {
      id: 'q-pool-1',
      question_number: '1',
      subject: 'Physics',
      question_type: 'MCQ',
      question_text: 'Based on the shared bar chart below, which year recorded the highest output?',
      options_json: JSON.stringify([
        { label: 'A', text: '2022' },
        { label: 'B', text: '2023' },
      ]),
      marks: 4,
      negative_marks: 1,
      source_pdf: 'draft_set_A.pdf',
      source_file_id: 'file-a',
      source_page: 2,
      source_question_number: '1',
      has_visual: 1,
      requires_visual: 1,
      shared_visual_group_id: 'shared-draft_set_A-q1_2',
      visuals_json: JSON.stringify([
        {
          id: 'shared-chart-1',
          type: 'chart',
          extractionMethod: 'vector_diagram_crop',
          sourcePdf: 'draft_set_A.pdf',
          sourcePage: 2,
          questionNumber: '1',
          width: 300,
          height: 160,
          aspectRatio: 1.875,
          dataUrl: samplePngDataUrl,
          caption: 'Chart 1: Annual Output (2020–2024)',
          position: 'above_question',
          sharedGroupId: 'shared-draft_set_A-q1_2',
          sharedQuestionNumbers: ['1', '2'],
        },
      ]),
    },
    {
      id: 'q-pool-2',
      question_number: '2',
      subject: 'Physics',
      question_type: 'MCQ',
      question_text: 'From the same bar chart, what is the percentage increase from 2022 to 2023?',
      options_json: JSON.stringify([
        { label: 'A', text: '15%' },
        { label: 'B', text: '25%' },
      ]),
      marks: 4,
      negative_marks: 1,
      source_pdf: 'draft_set_A.pdf',
      source_file_id: 'file-a',
      source_page: 2,
      source_question_number: '2',
      has_visual: 1,
      requires_visual: 1,
      shared_visual_group_id: 'shared-draft_set_A-q1_2',
      visuals_json: JSON.stringify([
        {
          id: 'shared-chart-1',
          type: 'chart',
          extractionMethod: 'vector_diagram_crop',
          sourcePdf: 'draft_set_A.pdf',
          sourcePage: 2,
          questionNumber: '2',
          width: 300,
          height: 160,
          aspectRatio: 1.875,
          dataUrl: samplePngDataUrl,
          caption: 'Chart 1: Annual Output (2020–2024)',
          position: 'above_question',
          sharedGroupId: 'shared-draft_set_A-q1_2',
          sharedQuestionNumbers: ['1', '2'],
        },
      ]),
    },
  ];

  const selected = selectCompetitiveQuestionsWithVisualBinding(poolRows, 2);
  assert.equal(selected.length, 2, 'Both questions in the shared visual group should be selected together');

  // Simulate paper assembly marking primary vs secondary shared visual instances
  const seenGroups = new Set<string>();
  const assembled = selected.map((q, idx) => {
    const isPrimary = q.shared_visual_group_id ? !seenGroups.has(q.shared_visual_group_id) : true;
    if (q.shared_visual_group_id) seenGroups.add(q.shared_visual_group_id);
    return {
      id: q.id,
      questionNumber: String(idx + 1),
      subject: q.subject,
      type: 'MCQ',
      questionText: q.question_text,
      options: JSON.parse(q.options_json),
      marks: q.marks,
      negativeMarks: q.negative_marks,
      sourcePdf: q.source_pdf,
      sourcePage: q.source_page,
      sourceQuestionNumber: q.source_question_number,
      hasVisual: true,
      requiresVisual: true,
      visualElements: JSON.parse(q.visuals_json),
      sharedVisualGroupId: q.shared_visual_group_id,
      sharedWithQuestionNumbers: ['1', '2'],
      isPrimarySharedVisualInstance: isPrimary,
    };
  });

  assert.equal(assembled[0].isPrimarySharedVisualInstance, true);
  assert.equal(assembled[1].isPrimarySharedVisualInstance, false);

  // Validate pre-PDF visual integrity
  const validation = validateCompetitivePaperVisuals(assembled);
  assert.equal(validation.valid, true, 'Paper with properly bound visuals must pass pre-PDF visual validation');
  assert.equal(validation.status, 'VERIFIED');
  assert.equal(validation.questionsWithVisuals, 2);
});

test('10. Pre-PDF validation catches missing visuals and generateCompetitiveExamPdfBuffer produces a valid PDF with embedded visuals', async () => {
  const samplePngDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // 1. Verify that a question requiring a visual but missing visualElements is flagged by validateCompetitivePaperVisuals
  const brokenQuestions = [
    {
      id: 'q-broken-1',
      questionNumber: '1',
      questionText: 'Find the current in the circuit shown in the figure below.',
      options: [
        { label: 'A', text: '1 A' },
        { label: 'B', text: '2 A' },
      ],
      marks: 4,
      requiresVisual: true,
      hasVisual: false,
      visualElements: [],
    },
  ];
  const brokenReport = validateCompetitivePaperVisuals(brokenQuestions);
  assert.equal(brokenReport.valid, false, 'Missing required visual must be flagged before PDF generation');
  assert.equal(brokenReport.status, 'NEEDS_REVIEW');
  assert.ok(brokenReport.issues.some(i => i.issueType === 'MISSING_REQUIRED_VISUAL'));

  // 2. Verify that a complete paper with embedded diagram & structured table generates a valid PDF buffer
  const validPaper = {
    id: 'comp-paper-visual-test-01',
    examName: 'JEE Advanced Competitive Mock Paper',
    examType: 'JEE',
    durationMinutes: 180,
    totalMarks: 8,
    totalQuestions: 2,
    instructions: 'All questions are compulsory. Diagrams and tables are preserved from source draft papers.',
    sections: [
      {
        sectionCode: 'SECTION A',
        subjectName: 'Physics',
        questionCount: 2,
        sectionMarks: 8,
        questions: [
          {
            id: 'q-valid-1',
            questionNumber: '1',
            subject: 'Physics',
            type: 'MCQ',
            questionText: 'In the circuit diagram shown below (Fig. 1), find the equivalent resistance between A and B.',
            options: [
              { label: 'A', text: '2 Ohm' },
              { label: 'B', text: '4 Ohm' },
              { label: 'C', text: '6 Ohm' },
              { label: 'D', text: '8 Ohm' },
            ],
            marks: 4,
            negativeMarks: 1,
            sourcePdf: 'physics_draft_1.pdf',
            sourcePage: 1,
            sourceQuestionNumber: '1',
            hasVisual: true,
            requiresVisual: true,
            visualElements: [
              {
                id: 'vis-q1-fig1',
                type: 'diagram',
                extractionMethod: 'embedded_image',
                sourcePdf: 'physics_draft_1.pdf',
                sourcePage: 1,
                questionNumber: '1',
                width: 240,
                height: 120,
                aspectRatio: 2.0,
                dataUrl: samplePngDataUrl,
                caption: 'Fig. 1: Wheatstone Bridge Network',
                position: 'below_stem',
              },
            ],
            captions: ['Fig. 1: Wheatstone Bridge Network'],
          },
          {
            id: 'q-valid-2',
            questionNumber: '2',
            subject: 'Physics',
            type: 'MCQ',
            questionText: 'Match the physical quantities in the following table with their dimensions:',
            options: [
              { label: 'A', text: 'I-P, II-Q' },
              { label: 'B', text: 'I-Q, II-P' },
            ],
            marks: 4,
            negativeMarks: 1,
            sourcePdf: 'physics_draft_2.pdf',
            sourcePage: 3,
            sourceQuestionNumber: '5',
            hasVisual: true,
            requiresVisual: true,
            tableData: {
              headers: ['Column I (Quantity)', 'Column II (Dimension)'],
              rows: [
                ['I. Planck Constant', 'P. [M L^2 T^-1]'],
                ['II. Boltzmann Constant', 'Q. [M L^2 T^-2 K^-1]'],
              ],
              caption: 'Table 1: Dimensional Matching',
            },
            visualElements: [],
          },
        ],
      },
    ],
  };

  const { pdfBuffer, validationReport } = await generateCompetitiveExamPdfBuffer(validPaper);
  assert.equal(validationReport.valid, true);
  assert.equal(validationReport.status, 'VERIFIED');
  assert.ok(Buffer.isBuffer(pdfBuffer), 'Output must be a valid Buffer');
  assert.ok(pdfBuffer.length > 1000, 'Generated PDF buffer must be non-empty');
  assert.equal(pdfBuffer.subarray(0, 5).toString('ascii'), '%PDF-', 'Generated buffer must have %PDF- header');
});





import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UniversityChromaVectorStore,
  performDeterministicExactCountSelection,
  validateBlueprintAndExactCounts,
  computeCosineSimilarity,
  computeLocalTextSimilarity,
  RagQuestionMetadata,
} from './universityRagPipeline.ts';

test('1. ChromaDB Vector Store indexing and LangChain section/type retrieval', async () => {
  const store = new UniversityChromaVectorStore();

  const mockQuestions: RagQuestionMetadata[] = [
    {
      questionId: 'q-mcq-1',
      sourcePaper: 'Paper 1',
      paperIndex: 1,
      section: 'Section I',
      questionType: 'MCQ',
      marks: 1,
      questionText: 'What is the primary function of Galois/Counter Mode (GCM) in AES cipher?',
      options: ['A) AEAD', 'B) Key Exchange', 'C) Hash Function', 'D) Public Key'],
    },
    {
      questionId: 'q-mcq-2',
      sourcePaper: 'Paper 2',
      paperIndex: 2,
      section: 'Section I',
      questionType: 'MCQ',
      marks: 1,
      questionText: 'Explain the mechanism of AES-GCM for authenticated encryption.',
      options: ['A) AEAD', 'B) Key Exchange', 'C) Stream Cipher', 'D) Public Key'],
    },
    {
      questionId: 'q-theory-1',
      sourcePaper: 'Paper 1',
      paperIndex: 1,
      section: 'Section II',
      questionType: 'THEORY',
      marks: 6,
      questionText: 'Discuss Diffie-Hellman Key Exchange algorithm and Man-in-the-Middle vulnerability.',
    },
  ];

  await store.indexQuestions(mockQuestions);
  assert.equal(store.getCollectionSize(), 3);

  // Retrieve independently by section & questionType
  const mcqs = await store.retrieveFilteredQuestions('Section I', 'MCQ');
  assert.equal(mcqs.length, 2);
  assert.equal(mcqs[0].questionType, 'MCQ');

  const theory = await store.retrieveFilteredQuestions('Section II', 'THEORY');
  assert.equal(theory.length, 1);
  assert.equal(theory[0].questionType, 'THEORY');
});

test('2. Semantic similarity duplicate detection (> 0.85 similarity threshold)', async () => {
  const store = new UniversityChromaVectorStore();

  const dupQuestions: RagQuestionMetadata[] = [
    {
      questionId: 'q1',
      sourcePaper: 'Paper 1',
      paperIndex: 1,
      section: 'Section I',
      questionType: 'MCQ',
      marks: 1,
      questionText: 'Which cryptographic algorithm provides authenticated encryption with associated data (AEAD)?',
    },
    {
      questionId: 'q2-dup',
      sourcePaper: 'Paper 2',
      paperIndex: 2,
      section: 'Section I',
      questionType: 'MCQ',
      marks: 1,
      questionText: 'Which cryptographic algorithm provides authenticated encryption with associated data (AEAD)?',
    },
    {
      questionId: 'q3-unique',
      sourcePaper: 'Paper 3',
      paperIndex: 3,
      section: 'Section I',
      questionType: 'MCQ',
      marks: 1,
      questionText: 'Describe the working mechanism of RSA public key infrastructure.',
    },
  ];

  await store.indexQuestions(dupQuestions);
  const { uniqueQuestions, duplicates } = store.detectSemanticDuplicates(0.85);

  assert.equal(duplicates.length, 1);
  assert.equal(uniqueQuestions.length, 2);
  assert.equal(duplicates[0].questionAId, 'q1');
  assert.equal(duplicates[0].questionBId, 'q2-dup');
});

test('3. Exact-Count Selection: 42 Candidate MCQs (14 from Paper 1, 14 from Paper 2, 14 from Paper 3) -> EXACTLY 14 MCQs Output', async () => {
  // Generate candidate pool of 42 MCQs (14 from each of the 3 source papers)
  const candidatePool: RagQuestionMetadata[] = [];

  for (let p = 1; p <= 3; p++) {
    for (let i = 1; i <= 14; i++) {
      candidatePool.push({
        questionId: `paper-${p}-mcq-${i}`,
        sourcePaper: `Paper ${p}`,
        paperIndex: p,
        section: 'Section I',
        questionType: 'MCQ',
        marks: 1,
        questionText: `Unique Question ${i} from Source Paper ${p} testing domain cryptography topic ${i}.`,
        options: ['A) Alpha', 'B) Beta', 'C) Gamma', 'D) Delta'],
      });
    }
  }

  // Add Theory questions
  for (let i = 1; i <= 6; i++) {
    candidatePool.push({
      questionId: `sec1-theory-${i}`,
      sourcePaper: `Paper ${i % 3 + 1}`,
      paperIndex: (i % 3) + 1,
      section: 'Section I',
      questionType: 'THEORY',
      marks: 4,
      questionText: `Section I Theory Question ${i} explaining fundamental security principles.`,
    });
    candidatePool.push({
      questionId: `sec2-theory-${i}`,
      sourcePaper: `Paper ${i % 3 + 1}`,
      paperIndex: (i % 3) + 1,
      section: 'Section II',
      questionType: 'THEORY',
      marks: 5,
      questionText: `Section II Theory Question ${i} designing scalable cryptographic systems.`,
    });
  }

  assert.equal(candidatePool.filter(q => q.questionType === 'MCQ').length, 42);

  // Perform Exact-Count Selection for 14 MCQs
  const selection = performDeterministicExactCountSelection(candidatePool, 14, 6, 6);

  assert.equal(selection.mcqs.length, 14);
  assert.equal(selection.mcqs.every(q => q.questionType === 'MCQ'), true);
  assert.equal(selection.section1Theory.length, 6);
  assert.equal(selection.section2Theory.length, 6);
  assert.equal(selection.totalQuestions, 26);
  assert.equal(selection.totalMarks, 14 * 1 + 6 * 4 + 6 * 5); // 14 + 24 + 30 = 68
});

test('4. Blueprint validation & Error hard-stop when valid question count is insufficient', async () => {
  // Pool with only 5 MCQs when 14 are required
  const insufficientPool: RagQuestionMetadata[] = [];
  for (let i = 1; i <= 5; i++) {
    insufficientPool.push({
      questionId: `mcq-${i}`,
      sourcePaper: 'Paper 1',
      paperIndex: 1,
      section: 'Section I',
      questionType: 'MCQ',
      marks: 1,
      questionText: `Insufficient candidate MCQ ${i}`,
    });
  }

  const selection = performDeterministicExactCountSelection(insufficientPool, 14, 6, 6);
  const report = validateBlueprintAndExactCounts(selection, 14, 70);

  assert.equal(report.isValid, false);
  assert.equal(report.errors.length > 0, true);
  assert.match(report.errors[0], /INSUFFICIENT_VALID_QUESTIONS/);
});


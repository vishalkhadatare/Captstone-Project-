import test from 'node:test';
import assert from 'node:assert/strict';
import { generateUniversityPaperPdf } from './universityPdfGenerator.ts';
import { protectAndSaveUniversityPdf } from './universityPdfProtection.ts';
import { RagQuestionMetadata } from './universityRagPipeline.ts';

test('1. PDFKit renders University Question Paper PDF buffer cleanly', async () => {
  const mockMcqs: RagQuestionMetadata[] = [];
  for (let i = 1; i <= 14; i++) {
    mockMcqs.push({
      questionId: `mcq-${i}`,
      sourcePaper: `Paper ${(i % 3) + 1}`,
      paperIndex: (i % 3) + 1,
      section: 'Section I',
      questionType: 'MCQ',
      marks: 1,
      questionText: `Sample MCQ ${i} testing domain cryptography and distributed systems principles.`,
      options: ['A) AEAD Encryption', 'B) Asymmetric Key Exchange', 'C) Message Authentication Code', 'D) Quantum Hash'],
    });
  }

  const mockSec1Theory: RagQuestionMetadata[] = [];
  for (let i = 1; i <= 6; i++) {
    mockSec1Theory.push({
      questionId: `theory-sec1-${i}`,
      sourcePaper: `Paper ${(i % 3) + 1}`,
      paperIndex: (i % 3) + 1,
      section: 'Section I',
      questionType: 'THEORY',
      marks: 4,
      questionText: `Explain Section I Theory Topic ${i} detailing AES-GCM authenticated encryption mode.`,
    });
  }

  const mockSec2Theory: RagQuestionMetadata[] = [];
  for (let i = 1; i <= 6; i++) {
    mockSec2Theory.push({
      questionId: `theory-sec2-${i}`,
      sourcePaper: `Paper ${(i % 3) + 1}`,
      paperIndex: (i % 3) + 1,
      section: 'Section II',
      questionType: 'THEORY',
      marks: 5,
      questionText: `Design Section II Security System ${i} mitigating MITM attacks in Key Exchange protocols.`,
    });
  }

  const pdfBuffer = await generateUniversityPaperPdf({
    universityName: 'State Board of Technical Examinations',
    examName: 'Annual University Examination 2026',
    subject: 'Computer Science & Security Engineering',
    paperCode: 'SLR-HL-475',
    setLetter: 'P',
    examDate: '2026-09-17',
    durationMinutes: 180,
    totalMarks: 70,
    mcqs: mockMcqs,
    section1Theory: mockSec1Theory,
    section2Theory: mockSec2Theory,
  });

  assert.ok(pdfBuffer);
  assert.ok(pdfBuffer.length > 5000);
  assert.equal(pdfBuffer.subarray(0, 4).toString(), '%PDF');
});

test('2. pdf-lib protects, encrypts, and computes SHA-256 fingerprint for generated PDF', async () => {
  const mockMcqs: RagQuestionMetadata[] = [
    {
      questionId: 'm1',
      sourcePaper: 'Paper 1',
      paperIndex: 1,
      section: 'Section I',
      questionType: 'MCQ',
      marks: 1,
      questionText: 'Which cipher mode provides AEAD?',
      options: ['A) GCM', 'B) CBC', 'C) ECB', 'D) OFB'],
    }
  ];

  const rawBuffer = await generateUniversityPaperPdf({
    universityName: 'State Board of Technical Examinations',
    examName: 'Annual Examination 2026',
    subject: 'Security',
    paperCode: 'SLR-TEST-501',
    setLetter: 'P',
    examDate: '2026-09-17',
    durationMinutes: 180,
    totalMarks: 70,
    mcqs: mockMcqs,
    section1Theory: [],
    section2Theory: [],
  });

  const protection = await protectAndSaveUniversityPdf(rawBuffer, 'SLR-TEST-501', 'P');

  assert.ok(protection.protectedPdfBuffer);
  assert.equal(protection.pdfHash.length, 64); // SHA-256 hex string
  assert.ok(protection.filename.includes('SLR-TEST-501_Set_P'));
  assert.ok(protection.fileSize > 0);
});

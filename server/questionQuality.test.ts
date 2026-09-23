/**
 * Tests for the ingest quality gate.
 *
 * The rejected cases are verbatim strings found in the zero_leak question bank,
 * so this doubles as a regression test for the contamination that produced
 * "248.216.238 10/10/2022 13:38:43 static-238" as a 10-mark exam question.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessQuestionText, assessSubjectMatch, assessExtractedQuestion } from './questionQuality.ts';

// Exact rows observed in the live database.
const REAL_GARBAGE = [
  '248.216.238 10/10/2022 13:38:43 static-238',
  '248.216.238 10/10/2022 13:38:43 static-238 CEGP013091',
  '248.216.238 10/01/2023 13:43:25 static-238',
  '248.216.238 10/01/2023 13:43:25 static-238 CEGP013091',
  'Assume suitable data if necessary. P8473 [Total No. of Pages : 1 SEAT No. :',
  'a)Differentiate between Quality Assurance and Quality Control.[6] OR SEAT No. : P.T.O. CEGP013091',
  'a)Explain use case testing with one example.[5]  CEGP013091',
];

// Boilerplate that sits on the paper but is not a question, and must not
// receive marks or inflate section totals.
const REAL_INSTRUCTIONS = [
  'Neat diagrams must be drawn wherever necessary.',
  'b) Neat diagrams must be drawn wherever necessary.',
  'Answer Q1 or Q2, Q3 or Q4.',
  'd) Answer Q1 or Q2, Q3 or Q4.',
  'Figures to the right indicate full marks.',
  'Assume suitable data wherever necessary and state your assumptions explicitly.',
  'Use of programmable calculators or unauthorized electronic communication devices is strictly prohibited.',
  'Attempt any four of the following.',
  'Max. Marks : 70',
];

const REAL_QUESTIONS = [
  'Explain the different levels of testing: Unit, Integration, System, and Acceptance testing.',
  'Define software quality. List & explain core component of quality.',
  'Differentiate between Black-Box and White-Box testing techniques with examples.',
  'a)Explain why ISO-9001 standard is important in software testing?',
  'Explain Equivalence Class Partitioning and Boundary Value Analysis with examples.',
];

test('rejects extraction furniture and log lines', () => {
  for (const text of REAL_GARBAGE) {
    const v = assessQuestionText(text);
    assert.equal(v.ok, false, `should reject: ${text}`);
    assert.ok(v.code, 'rejection must carry a code');
    assert.ok(v.reason, 'rejection must carry a reason');
  }
});

test('rejects boilerplate instructions', () => {
  for (const text of REAL_INSTRUCTIONS) {
    const v = assessQuestionText(text);
    assert.equal(v.ok, false, `should reject instruction: ${text}`);
  }
});

test('rejects instructions behind stacked labels', () => {
  // Regression: stripping only one label left "d) Figures to the right..."
  // which defeated the ^-anchored instruction checks, so the line reached a
  // paper carrying 10 marks.
  for (const text of [
    'Q.4 d) Figures to the right indicate full marks.',
    'Q.4 d)Figures to the right indicate full marks.[10]',
    '2. b) Neat diagrams must be drawn wherever necessary.',
    'Q.5 a) Assume suitable data if necessary.',
  ]) {
    assert.equal(assessQuestionText(text).ok, false, `should reject: ${text}`);
  }
});

test('accepts genuine questions', () => {
  for (const text of REAL_QUESTIONS) {
    const v = assessQuestionText(text);
    assert.equal(v.ok, true, `should accept: ${text} (got ${v.code}: ${v.reason})`);
  }
});

test('rejects OCR-mangled instructions', () => {
  // Regression: the live bank stores "Figurs" (missing the "e"), which an
  // exact-spelling pattern cannot match, so the line reached a paper with
  // 10 marks attached.
  for (const text of [
    'Figurs to the right side indicate full marks.',
    'c) Figurs to the right side indicate full marks.',
    'C) Figurs to the right side indicate full marks.[10]',
    'Neat digrams must be drawn wherever necessary.',
    // Regression: "Answer Q.1 or Q.2 ..." carries marks but the dot between
    // Q and the number defeated an earlier q\\s*\\d pattern.
    'd) Answer Q.1 or Q.2, Q.3 or Q.4, Q.5 or Q.6, Q.7 or Q.8.',
    'Answer Q1 or Q2, Q3 or Q4.',
  ]) {
    assert.equal(assessQuestionText(text).ok, false, `should reject: ${text}`);
  }
});

test('rejects empty and degenerate content', () => {
  assert.equal(assessQuestionText('').ok, false);
  assert.equal(assessQuestionText('   ').ok, false);
  assert.equal(assessQuestionText(null).ok, false);
  assert.equal(assessQuestionText(undefined).ok, false);
  assert.equal(assessQuestionText('a) [5]').ok, false, 'too short');
  assert.equal(assessQuestionText('----- .....').ok, false, 'no letters');
});

test('flags computer-graphics content filed under a software-testing subject', () => {
  const graphics = 'Explain Shadow Mask Technique in color CRT monitors with delta-electron gun alignment.';
  // Fine on its own...
  assert.equal(assessQuestionText(graphics).ok, true);
  // ...but wrong under this subject.
  const v = assessSubjectMatch('Software Testing and Quality Assurance', graphics);
  assert.equal(v.ok, false);
  assert.equal(v.code, 'SUBJECT_MISMATCH');
});

test('subject guard catches inflected forms, not just exact stems', () => {
  // Regression: \bantialias\b does not match "Antialiasing", so this exact row
  // leaked onto a Software Testing paper.
  const v = assessSubjectMatch(
    'Software Testing and Quality Assurance',
    'What is Antialiasing? Explain supersampling, filtering, and pixel phasing antialiasing techniques.'
  );
  assert.equal(v.ok, false, 'Antialiasing must be caught despite the -ing suffix');
  assert.equal(v.code, 'SUBJECT_MISMATCH');
});

test('does not flag graphics content under its own subject', () => {
  const graphics = 'Explain mathematical properties of Bezier Curves and convex hull control polygon points.';
  assert.equal(assessSubjectMatch('Computer Graphics', graphics).ok, true);
});

test('a genuine testing question passes the full gate', () => {
  const v = assessExtractedQuestion({
    subject: 'Software Testing and Quality Assurance',
    content_text: 'Explain the defect life cycle with a neat diagram.',
  });
  assert.equal(v.ok, true);
});

test('the observed bad row fails the full gate', () => {
  const v = assessExtractedQuestion({
    subject: 'Software Testing and Quality Assurance',
    content_text: '248.216.238 10/10/2022 13:38:43 static-238 CEGP013091',
  });
  assert.equal(v.ok, false);
  assert.ok(['LOG_LINE', 'PAGE_FURNITURE'].includes(v.code!), `unexpected code ${v.code}`);
});

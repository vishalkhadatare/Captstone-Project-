import test from 'node:test';
import assert from 'node:assert/strict';

import { detectPaperPattern } from './sourcePattern.ts';
import { enforceStructuralPattern } from './patternEnforcement.ts';

const SOURCE_PAPER = [
  'Instructions: 1. Q.1 is compulsory. 2. Figures to the right indicate full marks.',
  'Max. Marks: 34',
  'Section I: Objective / MCQs (2 Questions)',
  'Q.1 Choose the correct alternative: Which scheduling algorithm is non-preemptive? [1]',
  'a) Round Robin',
  'b) SJF',
  'c) SRTF',
  'd) Multilevel Queue',
  'Q.2 Choose the correct alternative: Deadlock requires which of the following? [1]',
  'a) mutual exclusion',
  'b) hold and wait',
  'c) circular wait',
  'd) all of these',
  'Section II: Descriptive / Theory Questions (2 Questions)',
  'Attempt any one of the following:',
  'Q.1 Explain paging with a neat diagram. [8]',
  'Q.2 Explain segmentation with a neat diagram. [8]',
].join('\n');

const pattern = detectPaperPattern(SOURCE_PAPER, 'operating-systems.pdf')!;

test('reads choice questions from the source paper', () => {
  assert.equal(pattern.sections[0].objective, true, 'a) b) c) d) under each question makes it a choice section');
  assert.equal(pattern.sections[1].objective, false, 'a descriptive section is not a choice section');
  assert.deepEqual(
    pattern.sections[0].questions.map((q) => q.optionCount),
    [4, 4]
  );
});

/** The answer a model typically returns: right questions, wrong structure. */
function aiAnswer(): any {
  return {
    universityName: 'AUTONOMOUS STATE UNIVERSITY EXAMINATION BOARD',
    subject: 'Operating Systems',
    paperCode: 'SLR-FINAL-04',
    totalMarks: 70,
    duration: '3 Hours',
    instructions: ['Q.1 is compulsory.'],
    sections: [
      {
        title: 'SECTION \u2013 I (Objective & MCQs)',
        totalMarks: '2 Marks',
        instructions: 'Answer all questions',
        questions: [
          {
            number: 'Q.1',
            text: 'Which of the following scheduling algorithms is preemptive?',
            marks: '1',
            options: ['FCFS', 'SJF', 'Round Robin', 'HRRN'],
          },
          {
            number: 'Q.2',
            text: 'Which algorithm is used to avoid a deadlock before it occurs?',
            marks: '1',
            options: ['FCFS', 'Banker\u2019s algorithm', 'SJF', 'LRU'],
          },
        ],
      },
      {
        title: 'SECTION \u2013 II (Descriptive & Analytical)',
        totalMarks: '16 Marks',
        questions: [
          {
            number: 'Q.3',
            text: 'Explain the concept of virtual memory with a suitable diagram.',
            marks: '8',
          },
          {
            number: 'Q.4',
            text: 'Describe the working of the LRU page replacement algorithm with an example.',
            marks: '8',
          },
        ],
      },
    ],
  };
}

test('locks the source headings, numbering and marks onto the answer', () => {
  const result = enforceStructuralPattern(aiAnswer(), pattern);

  assert.deepEqual(result.violations, [], 'a structurally faithful answer has no violations');
  assert.equal(result.paper.sections.length, 2);
  assert.equal(result.paper.sections[0].title, 'Section I: Objective / MCQs (2 Questions)');
  assert.equal(result.paper.sections[1].title, 'Section II: Descriptive / Theory Questions (2 Questions)');
  assert.equal(result.paper.sections[1].instructions, 'Attempt any one of the following:');
  assert.equal(
    result.paper.totalMarks,
    34,
    'the paper must add up to the marks the source paper states, not the form default of 70'
  );
  assert.deepEqual(
    result.paper.sections[1].questions.map((q: any) => q.number),
    ['Q.1', 'Q.2'],
    'question numbering must follow the source paper'
  );
  assert.deepEqual(
    result.paper.sections[1].questions.map((q: any) => q.marks),
    ['8', '8']
  );
  assert.ok(result.repairs.length >= 4, `expected corrections to be reported, got ${result.repairs.length}`);
});

test('forces the masthead the source paper prints', () => {
  const result = enforceStructuralPattern(aiAnswer(), pattern, {
    universityName: 'SAVITRIBAI PHULE PUNE UNIVERSITY',
    examName: 'B.E. (Computer Engineering) Examination 2026',
    department: 'Department of Computer Engineering',
    subject: 'Operating Systems',
    paperCode: '310254',
    maxMarks: 34,
    durationHours: 2,
    set: 'P',
    instructions: ['Q.1 is compulsory.', 'Figures to the right indicate full marks.'],
  });

  assert.equal(result.paper.universityName, 'SAVITRIBAI PHULE PUNE UNIVERSITY');
  assert.equal(result.paper.paperCode, '310254');
  assert.equal(result.paper.duration, '2 Hours');
  assert.equal(result.paper.totalMarks, 34);
  assert.deepEqual(result.paper.instructions, [
    'Q.1 is compulsory.',
    'Figures to the right indicate full marks.',
  ]);
});

test('reports a section with the wrong number of questions instead of printing it', () => {
  const answer = aiAnswer();
  answer.sections[1].questions.pop();

  const result = enforceStructuralPattern(answer, pattern);

  assert.ok(
    result.violations.some((violation) => /must contain 2 question\(s\)/.test(violation)),
    `expected a question-count violation, got: ${JSON.stringify(result.violations)}`
  );
});

test('reports an objective question that has no four choices', () => {
  const answer = aiAnswer();
  answer.sections[0].questions[1].options = ['true', 'false'];

  const result = enforceStructuralPattern(answer, pattern);

  assert.ok(
    result.violations.some((violation) => /objective section/.test(violation)),
    `expected an options violation, got: ${JSON.stringify(result.violations)}`
  );
});

test('reports a missing section', () => {
  const answer = aiAnswer();
  answer.sections.pop();

  const result = enforceStructuralPattern(answer, pattern);

  assert.ok(
    result.violations.some((violation) => /1 section\(s\) but the source paper has 2/.test(violation))
  );
});

test('reports duplicated and empty questions', () => {
  const answer = aiAnswer();
  answer.sections[1].questions[1].text = answer.sections[1].questions[0].text;
  answer.sections[0].questions[1].text = ' ';

  const result = enforceStructuralPattern(answer, pattern);

  assert.ok(result.violations.some((violation) => /duplicate/.test(violation)));
  assert.ok(result.violations.some((violation) => /has no question text/.test(violation)));
});

test('does not demand choices from a section whose heading mentions MCQs but whose questions are descriptive', () => {
  // The examiner's own uploads contain exactly this: "Section I: Objective / MCQs"
  // above questions such as "Explain why ISO-9001 ...". Demanding four choices
  // there would reject every faithful paper.
  const descriptiveUnderMcqHeading = [
    'Max. Marks: 34',
    'Section I: Objective / MCQs (2 Questions)',
    'Q.1 Explain why the ISO-9001 standard matters in software testing.',
    'Q.2 Examine the relationship between quality and productivity.',
  ].join('\n');
  const descriptivePattern = detectPaperPattern(descriptiveUnderMcqHeading, 'descriptive.pdf')!;
  assert.equal(descriptivePattern.sections[0].objective, false);

  const answer = {
    sections: [
      {
        title: 'Section I',
        questions: [
          { number: 'Q.1', text: 'Explain the role of the CMMI maturity levels in process quality.' },
          { number: 'Q.2', text: 'Examine how defect density relates to delivered quality.' },
        ],
      },
    ],
  };

  const result = enforceStructuralPattern(answer, descriptivePattern);
  assert.deepEqual(result.violations, [], 'descriptive questions must not be reported as missing choices');
});

test('accepts a reference to a figure that was lifted out of the source paper', () => {
  const answer = aiAnswer();
  answer.sections[1].questions[0].text =
    'Explain the process states shown in the figure and every transition between them.\n[FIGURE:2]';

  const result = enforceStructuralPattern(answer, pattern, null, { availableFigures: 3 });

  assert.deepEqual(result.violations, []);
  assert.ok(
    result.paper.sections[1].questions[0].text.includes('[FIGURE:2]'),
    'the marker is kept for the LaTeX renderer to turn into the original image'
  );
});

test('drops a figure reference the source paper cannot satisfy without failing the paper', () => {
  const answer = aiAnswer();
  answer.sections[1].questions[0].text =
    'Explain the process states shown in the figure and every transition between them.\n[FIGURE:7]';

  const result = enforceStructuralPattern(answer, pattern, null, { availableFigures: 2 });

  assert.deepEqual(result.violations, [], 'one bad figure must never cost the whole paper');
  assert.ok(
    result.repairs.some((repair) => /does not have \(it has 1 to 2\)/.test(repair)),
    `expected the dropped reference to be reported, got: ${JSON.stringify(result.repairs)}`
  );
  assert.ok(!result.paper.sections[1].questions[0].text.includes('FIGURE'));
  assert.ok(
    result.paper.sections[1].questions[0].text.includes('Explain the process states shown in the figure'),
    'the question itself must survive'
  );
});

test('a paper still builds when no figure could be lifted from the upload at all', () => {
  const answer = aiAnswer();
  answer.sections[1].questions[0].text =
    'Draw the diagram of the paging hardware as shown in the source paper.\n[FIGURE:1]';

  const result = enforceStructuralPattern(answer, pattern, null, { availableFigures: 0 });

  assert.deepEqual(result.violations, [], 'a failed figure extraction must not block generation');
  assert.ok(
    result.repairs.some((repair) => /no figure could be lifted out of the source paper/.test(repair))
  );
  assert.ok(!result.paper.sections[1].questions[0].text.includes('FIGURE'));
});

test('a usable reference survives while an unusable one is dropped', () => {
  const answer = aiAnswer();
  answer.sections[1].questions[0].text =
    'Explain the states shown below.\n[FIGURE:1]\n[FIGURE:9]';

  const result = enforceStructuralPattern(answer, pattern, null, { availableFigures: 3 });

  assert.deepEqual(result.violations, []);
  assert.ok(result.paper.sections[1].questions[0].text.includes('[FIGURE:1]'));
  assert.ok(!result.paper.sections[1].questions[0].text.includes('[FIGURE:9]'));
});

test('validates the named sections even when the answer prints the objective block as its own section', () => {
  // The answer routinely carries the objective block as an extra leading
  // section, which shifts every later section by one. Matching sections by
  // position made the descriptive questions look missing.
  const answer = {
    sections: [
      {
        title: 'MCQ / Objective Type Questions',
        questions: [
          { number: 'Q.1', text: 'Objective item one asks a question?', marks: '1', options: ['a', 'b', 'c', 'd'] },
          { number: 'Q.2', text: 'Objective item two asks a question?', marks: '1', options: ['a', 'b', 'c', 'd'] },
        ],
      },
      {
        title: 'SECTION \u2013 I (Objective)',
        questions: [
          {
            number: 'Q.1',
            text: 'Choose the correct alternative: which scheduler is non-preemptive?',
            marks: '1',
            options: ['Round Robin', 'SJF', 'SRTF', 'Multilevel Queue'],
          },
          {
            number: 'Q.2',
            text: 'Choose the correct alternative: deadlock requires which condition?',
            marks: '1',
            options: ['mutual exclusion', 'hold and wait', 'circular wait', 'all of these'],
          },
        ],
      },
      {
        title: 'SECTION \u2013 II (Descriptive)',
        questions: [
          { number: 'Q.3', text: 'Attempt any one: explain paging with a neat diagram.', marks: '8' },
          { number: 'Q.4', text: 'Attempt any one: explain segmentation with a neat diagram.', marks: '8' },
        ],
      },
    ],
  };

  const result = enforceStructuralPattern(answer, pattern);

  assert.deepEqual(result.violations, [], 'the named sections must be found, not reported missing');
  assert.equal(result.paper.sections[1].title, 'Section I: Objective / MCQs (2 Questions)');
  assert.equal(result.paper.sections[2].title, 'Section II: Descriptive / Theory Questions (2 Questions)');
  assert.deepEqual(
    result.paper.sections[2].questions.map((q: any) => q.number),
    ['Q.1', 'Q.2'],
    'Section II is numbered from the source paper, which restarts at Q.1'
  );
  assert.ok(
    result.summary.some((line) => line.startsWith('STATUS: PASS')),
    `expected a PASS report, got: ${JSON.stringify(result.summary)}`
  );
});

test('never reads a descriptive question as an MCQ because its parts are a) b) c)', () => {
  const attemptRulePaper = [
    'Max. Marks: 70',
    'Section - I',
    'Q.2 Attempt Any Four:\t16',
    'Explain the First Come First Served scheduling algorithm.',
    'b)\tExplain the Round Robin scheduling algorithm.',
    'c)\tExplain the Shortest Job First scheduling algorithm.',
    'Section - II',
    'Q.3 Attempt Any Two:\t12',
    'What is segmentation? Explain demand segmentation.',
    'b)\tExplain free space management.',
  ].join('\n');

  const detected = detectPaperPattern(attemptRulePaper, 'attempt-rule.pdf')!;
  assert.equal(
    detected.sections[0].objective,
    false,
    'an attempt rule turns a) b) c) into alternatives, not choices'
  );

  const answer = {
    universityName: 'X',
    totalMarks: 70,
    sections: [
      {
        title: 'Section - I',
        questions: [{ number: 'Q.2', text: 'Attempt any four: explain FCFS, Round Robin and SJF.', marks: '16' }],
      },
      {
        title: 'Section - II',
        questions: [{ number: 'Q.3', text: 'Attempt any two: explain segmentation.', marks: '12' }],
      },
    ],
  };

  const result = enforceStructuralPattern(answer, detected);
  assert.deepEqual(
    result.violations,
    [],
    'a descriptive question must never be told it has the wrong number of choices'
  );
});

test('leaves a paper alone when it already matches and no pattern was detected', () => {
  const answer = aiAnswer();
  const result = enforceStructuralPattern(answer, null, null);

  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.repairs, []);
  assert.equal(result.paper.totalMarks, 70);
});

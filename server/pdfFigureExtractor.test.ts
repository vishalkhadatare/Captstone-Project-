import test from 'node:test';
import assert from 'node:assert/strict';

import { readPublishedFigureResources } from './pdfFigureExtractor.ts';
import { renderSourceFigureLatex } from './formatex.ts';

test('a figure URL from the browser cannot escape the figures directory', () => {
  const result = readPublishedFigureResources([
    '/extracted_figures/../../server.ts/figure-1.png',
    '/extracted_figures/ok/..%2f..%2fsecrets.png',
    'https://evil.example.com/figure-1.png',
    '/public/uploads/papers/33f68fb6-OS_OS.pdf',
    '',
    null,
  ]);

  assert.deepEqual(result.resources, [], 'nothing usable was offered, so nothing may be shipped');
  assert.ok(result.warnings.length >= 3, 'each unusable reference is reported');
});

test('an unusable reference is reported rather than thrown', () => {
  const result = readPublishedFigureResources(undefined);
  assert.deepEqual(result.resources, []);
  assert.deepEqual(result.warnings, []);
});

test('the referenced file name always matches the number in the marker', () => {
  // The extractor names its crops figure-<n>.png from the same counter it hands
  // the model as [FIGURE:n], so renderSourceFigureLatex(n) must resolve.
  for (const n of [1, 2, 12]) {
    const latex = renderSourceFigureLatex(n);
    assert.ok(latex.includes(`{figure-${n}.png}`), `[FIGURE:${n}] must reference figure-${n}.png`);
  }
});

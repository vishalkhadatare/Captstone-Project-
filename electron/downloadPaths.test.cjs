'use strict';

/**
 * Download paths, tested without a filesystem.
 *
 * Two failures are worth pinning here. The first is silent data loss: a second
 * download of `main.pdf` must not overwrite the first, because the user's first
 * export is usually the one they wanted. The second is a page-chosen filename
 * escaping the downloads folder - `setSavePath` writes wherever it is told.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { uniqueDownloadPath } = require('./downloadPaths.cjs');

const DIR = path.join('/home', 'visha', 'Downloads');
const nothing = () => false;

test('an unused name is used as it is', () => {
  assert.equal(uniqueDownloadPath(DIR, 'main.pdf', nothing), path.join(DIR, 'main.pdf'));
});

test('an existing name never overwrites the file already there', () => {
  const taken = new Set([path.join(DIR, 'main.pdf')]);
  assert.equal(uniqueDownloadPath(DIR, 'main.pdf', (p) => taken.has(p)), path.join(DIR, 'main (1).pdf'));
});

test('the third copy of a name gets a third path, not a fourth attempt at the second', () => {
  const taken = new Set([path.join(DIR, 'main.pdf'), path.join(DIR, 'main (1).pdf')]);
  assert.equal(uniqueDownloadPath(DIR, 'main.pdf', (p) => taken.has(p)), path.join(DIR, 'main (2).pdf'));
});

test('the extension survives the suffix, including a double one', () => {
  const taken = new Set([path.join(DIR, 'exam.paper.pdf')]);
  assert.equal(uniqueDownloadPath(DIR, 'exam.paper.pdf', (p) => taken.has(p)), path.join(DIR, 'exam.paper (1).pdf'));
});

test('a file with no extension still gets a readable, numbered name', () => {
  assert.equal(uniqueDownloadPath(DIR, 'data', (p) => p.endsWith('data')), path.join(DIR, 'data (1)'));
});

test('a page cannot choose a directory, let alone leave the folder', () => {
  assert.equal(uniqueDownloadPath(DIR, '../../../etc/cron.d/pwn.pdf', nothing), path.join(DIR, 'pwn.pdf'));
  assert.equal(uniqueDownloadPath(DIR, 'C:\\Windows\\System32\\evil.exe', nothing), path.join(DIR, 'evil.exe'));
});

test('a name that is empty, blank or not a string still produces a path', () => {
  assert.equal(uniqueDownloadPath(DIR, '', nothing), path.join(DIR, 'download'));
  assert.equal(uniqueDownloadPath(DIR, '   ', nothing), path.join(DIR, 'download'));
  assert.equal(uniqueDownloadPath(DIR, undefined, nothing), path.join(DIR, 'download'));
  // `...` is a legal filename on both platforms; it must stay inside the folder
  // rather than be read as a parent-directory hop.
  assert.equal(uniqueDownloadPath(DIR, '...', nothing), path.join(DIR, '...'));
});

test('a hidden file keeps its dotfile shape', () => {
  const taken = new Set([path.join(DIR, '.env')]);
  assert.equal(uniqueDownloadPath(DIR, '.env', (p) => taken.has(p)), path.join(DIR, '.env (1)'));
});

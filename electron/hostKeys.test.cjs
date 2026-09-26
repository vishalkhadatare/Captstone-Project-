'use strict';

/**
 * The key-to-text mapping, tested without a browser.
 *
 * The regression these tests exist for: the space bar arrives named (`Space`),
 * and deciding "printable" by length alone made it type nothing - the keystroke
 * reached the page, the caret did not move, and a sentence came out as one word.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { textFromKeyCode } = require('./hostKeys.cjs');

test('the space bar types a space, even though its key name is not its character', () => {
  assert.equal(textFromKeyCode('Space'), ' ');
});

test('letters, digits and punctuation type themselves, shifted glyphs included', () => {
  for (const key of ['a', 'Z', '7', '?', 'é', '$']) {
    assert.equal(textFromKeyCode(key), key);
  }
});

test('named keys that type nothing are never given a character', () => {
  for (const key of ['Backspace', 'Tab', 'Return', 'Enter', 'Escape', 'Up', 'Down', 'Left', 'Right', 'F5', 'Delete', 'Home']) {
    assert.equal(textFromKeyCode(key), null, `${key} should not type text`);
  }
});

test('control characters and DEL are refused, so a stray byte is not typed', () => {
  for (const key of ['\t', '\n', '\r', '\u0000', '\u001f', '\u007f']) {
    assert.equal(textFromKeyCode(key), null, `${JSON.stringify(key)} should not type text`);
  }
});

test('a key we cannot name types nothing rather than something invented', () => {
  for (const key of ['', 'Unidentified', 'Dead', 'HyperKey', 'F13']) {
    assert.equal(textFromKeyCode(key), null);
  }
});

test('a raw space is text as well, whichever name a client sends it under', () => {
  assert.equal(textFromKeyCode(' '), ' ');
});

test('non-strings are refused instead of coerced', () => {
  for (const key of [null, undefined, 32, ['a'], { key: 'a' }]) {
    assert.equal(textFromKeyCode(key), null, `${String(key)} is not a key name`);
  }
});

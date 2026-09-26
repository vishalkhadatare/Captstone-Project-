import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_WHEEL_DELTA,
  isAppOwnedKey,
  isTypingKey,
  keyCodeFromDomKey,
  mapPointToFrame,
  modifiersFrom,
  mouseButtonFrom,
  wheelDeltas,
} from './browserInput';

const FRAME = { width: 1280, height: 800 };

// ---------------------------------------------------------------------------
// Coordinates: a scaled picture must not mean clicks land elsewhere
// ---------------------------------------------------------------------------

test('a point maps from CSS pixels to the page\'s own pixels', () => {
  const rect = { left: 0, top: 0, width: 640, height: 400 };
  assert.deepEqual(mapPointToFrame({ x: 320, y: 200 }, rect, FRAME), { x: 640, y: 400 });
});

test('the surface offset is subtracted before scaling', () => {
  // The canvas sits 100px from the left and 50px from the top of the viewport.
  const rect = { left: 100, top: 50, width: 640, height: 400 };
  assert.deepEqual(mapPointToFrame({ x: 100, y: 50 }, rect, FRAME), { x: 0, y: 0 });
  assert.deepEqual(mapPointToFrame({ x: 420, y: 250 }, rect, FRAME), { x: 640, y: 400 });
});

test('a point outside the surface is pulled back to the edge, not dropped', () => {
  const rect = { left: 0, top: 0, width: 640, height: 400 };
  // A drag that leaves the surface must keep working.
  assert.deepEqual(mapPointToFrame({ x: 900, y: 900 }, rect, FRAME), { x: 1279, y: 799 });
  assert.deepEqual(mapPointToFrame({ x: -50, y: -50 }, rect, FRAME), { x: 0, y: 0 });
});

test('an unusable size yields null rather than a NaN click', () => {
  const rect = { left: 0, top: 0, width: 640, height: 400 };
  assert.equal(mapPointToFrame({ x: 1, y: 1 }, { ...rect, width: 0 }, FRAME), null);
  assert.equal(mapPointToFrame({ x: 1, y: 1 }, { ...rect, height: 0 }, FRAME), null);
  assert.equal(mapPointToFrame({ x: 1, y: 1 }, rect, { width: 0, height: 800 }), null);
  assert.equal(mapPointToFrame({ x: Number.NaN, y: 1 }, rect, FRAME), null);
  assert.equal(mapPointToFrame({ x: 1, y: 1 }, { ...rect, width: Number.NaN }, FRAME), null);
});

test('a frame smaller than the display scales down correctly', () => {
  // A resize command can leave the page smaller than the panel.
  const rect = { left: 0, top: 0, width: 1280, height: 800 };
  assert.deepEqual(mapPointToFrame({ x: 640, y: 400 }, rect, { width: 640, height: 400 }), { x: 320, y: 200 });
});

// ---------------------------------------------------------------------------
// Modifiers and buttons
// ---------------------------------------------------------------------------

test('modifiers come back in a stable order, deduped', () => {
  assert.deepEqual(modifiersFrom({ ctrlKey: true, shiftKey: true }), ['ctrl', 'shift']);
  assert.deepEqual(modifiersFrom({ metaKey: true, altKey: true }), ['alt', 'meta']);
  assert.deepEqual(modifiersFrom({}), []);
});

test('only the three real mouse buttons have names', () => {
  assert.equal(mouseButtonFrom(0), 'left');
  assert.equal(mouseButtonFrom(1), 'middle');
  assert.equal(mouseButtonFrom(2), 'right');
  assert.equal(mouseButtonFrom(3), null);
  assert.equal(mouseButtonFrom(4), null);
  assert.equal(mouseButtonFrom(-1), null);
});

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

test('DOM key names are translated to what a browser wants', () => {
  assert.equal(keyCodeFromDomKey('Enter'), 'Return');
  assert.equal(keyCodeFromDomKey(' '), 'Space');
  assert.equal(keyCodeFromDomKey('ArrowUp'), 'Up');
  assert.equal(keyCodeFromDomKey('ArrowDown'), 'Down');
  assert.equal(keyCodeFromDomKey('ArrowLeft'), 'Left');
  assert.equal(keyCodeFromDomKey('ArrowRight'), 'Right');
  assert.equal(keyCodeFromDomKey('Escape'), 'Escape');
  assert.equal(keyCodeFromDomKey('Backspace'), 'Backspace');
  assert.equal(keyCodeFromDomKey('Tab'), 'Tab');
});

test('function keys pass through, but only the twelve that exist', () => {
  assert.equal(keyCodeFromDomKey('F1'), 'F1');
  assert.equal(keyCodeFromDomKey('F12'), 'F12');
  assert.equal(keyCodeFromDomKey('F13'), null);
  assert.equal(keyCodeFromDomKey('F0'), null);
});

test('printable characters pass through as themselves, including shifted glyphs', () => {
  assert.equal(keyCodeFromDomKey('a'), 'a');
  assert.equal(keyCodeFromDomKey('A'), 'A');
  assert.equal(keyCodeFromDomKey('?'), '?');
  assert.equal(keyCodeFromDomKey('é'), 'é');
});

test('a key we cannot name is refused, never guessed at', () => {
  for (const key of ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Dead', 'Unidentified', 'Process', 'HyperKey', '']) {
    assert.equal(keyCodeFromDomKey(key), null, `${key || '(empty)'} should not be forwarded`);
  }
});

test('only printable single characters are treated as typing', () => {
  assert.equal(isTypingKey('a'), true);
  assert.equal(isTypingKey(' '), true);
  assert.equal(isTypingKey('Enter'), false);
  assert.equal(isTypingKey('Shift'), false);
  assert.equal(isTypingKey(''), false);
});

// ---------------------------------------------------------------------------
// Wheel
// ---------------------------------------------------------------------------

test('pixel-mode wheel deltas pass through unchanged', () => {
  assert.deepEqual(wheelDeltas({ deltaX: 0, deltaY: 120, deltaMode: 0 }), { deltaX: 0, deltaY: 120 });
});

test('line and page modes are converted to pixels', () => {
  assert.deepEqual(wheelDeltas({ deltaY: 3, deltaMode: 1 }), { deltaX: 0, deltaY: 48 });
  assert.deepEqual(wheelDeltas({ deltaY: 1, deltaMode: 2 }), { deltaX: 0, deltaY: 400 });
});

test('a wheel delta is clamped and rounded', () => {
  assert.deepEqual(wheelDeltas({ deltaY: 1e9 }), { deltaX: 0, deltaY: MAX_WHEEL_DELTA });
  assert.deepEqual(wheelDeltas({ deltaY: -1e9 }), { deltaX: 0, deltaY: -MAX_WHEEL_DELTA });
  assert.deepEqual(wheelDeltas({ deltaY: 12.6 }), { deltaX: 0, deltaY: 13 });
});

test('a missing or non-finite delta is treated as no scroll', () => {
  assert.deepEqual(wheelDeltas({}), { deltaX: 0, deltaY: 0 });
  assert.deepEqual(wheelDeltas({ deltaY: Number.NaN }), { deltaX: 0, deltaY: 0 });
});

// ---------------------------------------------------------------------------
// Keys the app keeps for itself
// ---------------------------------------------------------------------------

test('the panel keeps its own shortcuts instead of typing them into the page', () => {
  assert.equal(isAppOwnedKey({ key: 'F5' }), true);
  assert.equal(isAppOwnedKey({ key: 't', ctrlKey: true }), true);
  assert.equal(isAppOwnedKey({ key: 'W', ctrlKey: true }), true);
  assert.equal(isAppOwnedKey({ key: 'l', metaKey: true }), true);
  assert.equal(isAppOwnedKey({ key: 'r', ctrlKey: true }), true);
  // ...but a plain letter is the page's.
  assert.equal(isAppOwnedKey({ key: 't' }), false);
  assert.equal(isAppOwnedKey({ key: 'a', ctrlKey: true }), false);
});

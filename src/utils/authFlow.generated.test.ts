import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTH_EVENT_TYPES,
  AUTH_PHASES,
  INITIAL_AUTH_STATE,
  reduceAuth,
  type AuthEventType,
  type AuthState,
} from './authFlow.ts';

/**
 * Generated suite: EVERY sequence of sign-in events up to length 5.
 *
 * 7 + 49 + 343 + 2401 + 16807 = 19,607 sequences, one test case each.
 *
 * Why sequences rather than single events: the two real bugs in this logic were
 * both ordering bugs — a window close arriving *after* completion was reported as
 * a cancellation, and a confirmation arriving with no window behind it claimed
 * success. Neither shows up in a single-transition test; both show up in a
 * three-event sequence.
 *
 * The properties below are derived from the specification and checked WITHOUT
 * reference to how the reducer is written, so a passing suite is real evidence
 * rather than a restatement of the implementation:
 *
 *   P1  the phase is always one of the five declared phases
 *   P2  `completed` is impossible unless `confirmed` appears in the sequence
 *   P3  `signInStarted` is impossible unless `opened` appears in the sequence
 *   P4  `completed` requires an `opened` before a `confirmed`
 *   P5  `awaiting` always has a window open and a window that really opened
 *   P6  `failed` never has a window open
 *   P7  `reset` erases history: the state after a reset equals the state produced
 *       by replaying only what followed that reset
 */

const MAX_SEQUENCE_LENGTH = 5;

const replay = (events: readonly AuthEventType[]): AuthState =>
  events.reduce<AuthState>((state, event) => reduceAuth(state, event), INITIAL_AUTH_STATE);

/** Every sequence of length 1..MAX_SEQUENCE_LENGTH, in order. */
const SEQUENCES: readonly AuthEventType[][] = (() => {
  const all: AuthEventType[][] = [];
  let frontier: AuthEventType[][] = [[]];

  for (let length = 1; length <= MAX_SEQUENCE_LENGTH; length += 1) {
    const next: AuthEventType[][] = [];
    for (const prefix of frontier) {
      for (const event of AUTH_EVENT_TYPES) {
        const sequence = [...prefix, event];
        next.push(sequence);
        all.push(sequence);
      }
    }
    frontier = next;
  }

  return all;
})();

const EMPTY: readonly AuthEventType[] = [];

for (const events of SEQUENCES) {
  test(`sign-in sequence ${events.join('→')}`, () => {
    const state = replay(events);

    // P1 — a real phase always comes out.
    assert.ok(AUTH_PHASES.includes(state.phase), `invalid phase ${state.phase}`);

    const hasConfirmed = events.includes('confirmed');
    const hasOpened = events.includes('opened');

    // P2 — completion requires a confirmation.
    if (!hasConfirmed) {
      assert.notEqual(state.phase, 'completed', 'completed without any confirmed event');
    }

    // P3 — remembering a window requires one to have opened.
    if (!hasOpened) {
      assert.equal(state.signInStarted, false, 'signInStarted without any opened event');
    }

    // P4 — the confirmation must follow the window opening.
    if (state.phase === 'completed') {
      assert.equal(hasOpened, true, 'completed without any opened event');
      const firstOpened = events.indexOf('opened');
      const lastConfirmed = events.lastIndexOf('confirmed');
      assert.ok(lastConfirmed > firstOpened, 'completed before any window opened');
    }

    // P5 / P6 — flags must agree with the phase.
    if (state.phase === 'awaiting') {
      assert.equal(state.windowOpen, true, 'awaiting with no window open');
      assert.equal(state.signInStarted, true, 'awaiting with no window ever opened');
    }
    if (state.phase === 'failed') {
      assert.equal(state.windowOpen, false, 'failed with a window open');
    }

    // P7 — reset erases history.
    const lastReset = events.lastIndexOf('reset');
    if (lastReset >= 0) {
      assert.deepEqual(
        state,
        replay(events.slice(lastReset + 1)),
        'a reset did not erase the history before it',
      );
      assert.deepEqual(replay(events.slice(0, lastReset + 1)), INITIAL_AUTH_STATE);
    }

    // A finished sign-in is not undone by a close, a cancel or a re-confirm.
    if (state.phase === 'completed') {
      for (const benign of ['closedEarly', 'cancelled', 'confirmed', 'blocked'] as const) {
        assert.equal(
          reduceAuth(state, benign).phase,
          'completed',
          `${benign} undid a finished sign-in`,
        );
      }
    }

    // Nothing but reset/request may clear the "a window really opened" flag.
    if (state.signInStarted) {
      for (const benign of ['closedEarly', 'cancelled', 'confirmed', 'blocked'] as const) {
        assert.equal(
          reduceAuth(state, benign).signInStarted,
          true,
          `${benign} cleared signInStarted`,
        );
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Structural checks on the generated space itself.
// ---------------------------------------------------------------------------

test('the generated space is the size the arithmetic says it is', () => {
  const expected = [7, 49, 343, 2401, 16807].reduce((sum, count) => sum + count, 0);
  assert.equal(expected, 19607);
  assert.equal(SEQUENCES.length, expected);
});

test('no sequence is generated twice', () => {
  const seen = new Set(SEQUENCES.map((sequence) => sequence.join('→')));
  assert.equal(seen.size, SEQUENCES.length);
});

test('every sequence of every length is present', () => {
  for (let length = 1; length <= MAX_SEQUENCE_LENGTH; length += 1) {
    const ofLength = SEQUENCES.filter((sequence) => sequence.length === length);
    assert.equal(ofLength.length, AUTH_EVENT_TYPES.length ** length, `length ${length}`);
  }
});

test('the empty sequence is the initial state', () => {
  assert.deepEqual(replay(EMPTY), INITIAL_AUTH_STATE);
});

test('the happy path is reachable and stays completed', () => {
  const state = replay(['request', 'opened', 'confirmed', 'closedEarly', 'closedEarly']);
  assert.equal(state.phase, 'completed');
  assert.equal(state.signInStarted, true);
});

test('no sequence reaching completion ever lost the window that caused it', () => {
  for (const events of SEQUENCES) {
    const state = replay(events);
    if (state.phase === 'completed') {
      assert.equal(state.signInStarted, true, `sequence ${events.join('→')}`);
    }
  }
});

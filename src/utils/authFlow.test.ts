import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTH_EVENT_TYPES,
  AUTH_MESSAGES,
  AUTH_PHASES,
  AUTH_PHASE_LABEL,
  AUTH_PHASE_STYLE,
  INITIAL_AUTH_STATE,
  canConfirmSignIn,
  isAuthWindowOpen,
  reduceAuth,
  type AuthEventType,
  type AuthPhase,
  type AuthState,
} from './authFlow.ts';

const state = (phase: AuthPhase, signInStarted: boolean, windowOpen: boolean): AuthState => ({
  phase,
  signInStarted,
  windowOpen,
  message: null,
});

const BOOLEANS = [false, true];

// ---------------------------------------------------------------------------
// Reachability
//
// Testing every phase x flag combination would assert invariants about states
// the machine can never enter (e.g. `completed` with no window ever opened) —
// which proves nothing about real behaviour. So the state space is first
// enumerated by breadth-first search from the initial state, and only those
// states are exercised.
// ---------------------------------------------------------------------------

const stateKey = (value: AuthState): string =>
  `${value.phase}|${value.signInStarted}|${value.windowOpen}`;

const REACHABLE: AuthState[] = (() => {
  const seen = new Map<string, AuthState>([[stateKey(INITIAL_AUTH_STATE), INITIAL_AUTH_STATE]]);
  const queue: AuthState[] = [INITIAL_AUTH_STATE];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const event of AUTH_EVENT_TYPES) {
      const next = reduceAuth(current, event);
      const key = stateKey(next);
      if (!seen.has(key)) {
        seen.set(key, next);
        queue.push(next);
      }
    }
  }

  return Array.from(seen.values());
})();

/** Events that explicitly start a fresh attempt, so they may not preserve flags. */
const RESTART_EVENTS: AuthEventType[] = ['reset', 'request'];

/** Events that must never undo a finished sign-in. */
const NON_UNDOING_EVENTS: AuthEventType[] = ['confirmed', 'cancelled', 'closedEarly', 'blocked'];

test('the reachable state space is exactly the seven states the flow can occupy', () => {
  assert.deepEqual(
    REACHABLE.map(stateKey).sort(),
    [
      'awaiting|true|true',
      'cancelled|false|false',
      'cancelled|true|false',
      'completed|true|false',
      'failed|false|false',
      'failed|true|false',
      'idle|false|false',
    ],
  );
});

for (const phase of AUTH_PHASES) {
  test(`phase ${phase} is reachable`, () => {
    assert.ok(REACHABLE.some((entry) => entry.phase === phase), `${phase} can never be reached`);
  });
}

// ---------------------------------------------------------------------------
// Exhaustive invariants: every REACHABLE state x every event.
// ---------------------------------------------------------------------------

for (const before of REACHABLE) {
  for (const event of AUTH_EVENT_TYPES) {
    test(
      `invariants — ${before.phase}(${before.signInStarted ? 'started' : 'fresh'},` +
        `${before.windowOpen ? 'open' : 'closed'}) + ${event}`,
      () => {
        const after = reduceAuth(before, event);

        // A real phase always comes out.
        assert.ok(AUTH_PHASES.includes(after.phase), `unexpected phase ${after.phase}`);

        // reset is total: it always returns the initial state.
        if (event === 'reset') {
          assert.deepEqual(after, INITIAL_AUTH_STATE);
          return;
        }

        // A window that really opened is never un-remembered, except by an
        // explicit fresh attempt (reset/request).
        if (before.signInStarted && !RESTART_EVENTS.includes(event)) {
          assert.equal(after.signInStarted, true, 'signInStarted must not be cleared');
        }

        // Phases only ever come with flags that make sense for them.
        if (after.phase === 'awaiting') {
          assert.equal(after.windowOpen, true);
          assert.equal(after.signInStarted, true);
        }
        if (after.phase === 'failed' || after.phase === 'cancelled') {
          assert.equal(after.windowOpen, false);
        }
        if (after.phase === 'completed') {
          assert.equal(after.signInStarted, true, 'a completed sign-in always has a window behind it');
        }

        // The rule that matters most: completion is impossible without a window
        // having really opened, and impossible through any other event.
        if (after.phase === 'completed' && before.phase !== 'completed') {
          assert.equal(event, 'confirmed', 'completed is only reachable via confirmed');
          assert.equal(before.phase, 'awaiting');
          assert.equal(before.signInStarted, true);
          assert.equal(before.windowOpen, true);
        }

        // A finished sign-in is not undone by a close, a cancel or a re-confirm.
        if (before.phase === 'completed' && NON_UNDOING_EVENTS.includes(event)) {
          assert.equal(after.phase, 'completed', `${event} must not undo a finished sign-in`);
        }

        // Idempotence for the terminal-ish events: applying the same one twice
        // must not keep changing the outcome.
        if (event === 'closedEarly' || event === 'cancelled' || event === 'confirmed') {
          assert.deepEqual(reduceAuth(after, event), after, `${event} is not idempotent`);
        }
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Explicit transition rows.
// ---------------------------------------------------------------------------

type Row = [AuthPhase, boolean, boolean, AuthEventType, AuthPhase, boolean, boolean];

const TRANSITIONS: Row[] = [
  // [from, started, open, event, to, started, open]
  ['idle', false, false, 'request', 'idle', false, false],
  ['failed', false, false, 'request', 'idle', false, false],
  ['cancelled', true, false, 'request', 'idle', false, false],
  ['completed', true, false, 'request', 'idle', false, false],
  ['awaiting', true, true, 'request', 'awaiting', true, true],
  ['awaiting', true, false, 'request', 'idle', false, false],

  ['idle', false, false, 'opened', 'awaiting', true, true],
  ['failed', false, false, 'opened', 'awaiting', true, true],
  ['cancelled', true, false, 'opened', 'awaiting', true, true],
  ['completed', true, false, 'opened', 'awaiting', true, true],
  ['awaiting', true, true, 'opened', 'awaiting', true, true],

  ['idle', false, false, 'blocked', 'failed', false, false],
  ['awaiting', true, true, 'blocked', 'failed', true, false],
  ['cancelled', true, false, 'blocked', 'failed', true, false],
  ['completed', true, false, 'blocked', 'completed', true, false],

  ['idle', false, false, 'confirmed', 'idle', false, false],
  ['awaiting', true, true, 'confirmed', 'completed', true, false],
  ['cancelled', true, false, 'confirmed', 'cancelled', true, false],
  ['failed', true, false, 'confirmed', 'failed', true, false],
  ['completed', true, false, 'confirmed', 'completed', true, false],

  ['idle', false, false, 'cancelled', 'cancelled', false, false],
  ['awaiting', true, true, 'cancelled', 'cancelled', true, false],
  ['failed', true, false, 'cancelled', 'cancelled', true, false],
  ['completed', true, false, 'cancelled', 'completed', true, false],

  ['idle', false, false, 'closedEarly', 'idle', false, false],
  ['awaiting', true, true, 'closedEarly', 'cancelled', true, false],
  ['failed', true, false, 'closedEarly', 'failed', true, false],
  ['cancelled', true, false, 'closedEarly', 'cancelled', true, false],
  ['completed', true, false, 'closedEarly', 'completed', true, false],
];

for (const [from, started, open, event, to, toStarted, toOpen] of TRANSITIONS) {
  test(`${from}(${started ? 'started' : 'fresh'},${open ? 'open' : 'closed'}) + ${event} → ${to}`, () => {
    const after = reduceAuth(state(from, started, open), event);
    assert.equal(after.phase, to);
    assert.equal(after.signInStarted, toStarted);
    assert.equal(after.windowOpen, toOpen);
  });
}

// ---------------------------------------------------------------------------
// The two bug classes this machine was extracted to kill.
// ---------------------------------------------------------------------------

test('a closed window after completion is not reported as a cancellation', () => {
  const awaiting = reduceAuth(INITIAL_AUTH_STATE, 'opened');
  const completed = reduceAuth(awaiting, 'confirmed');
  const afterClose = reduceAuth(completed, 'closedEarly');

  assert.equal(afterClose.phase, 'completed');
  assert.equal(afterClose.message, AUTH_MESSAGES.completed);
});

test('repeated close events after completion stay completed', () => {
  let current = reduceAuth(reduceAuth(INITIAL_AUTH_STATE, 'opened'), 'confirmed');
  for (let i = 0; i < 6; i += 1) {
    current = reduceAuth(current, 'closedEarly');
    assert.equal(current.phase, 'completed', `close #${i + 1} must not cancel a finished sign-in`);
  }
});

test('"load here" without ever opening a window cannot claim success', () => {
  const after = reduceAuth(INITIAL_AUTH_STATE, 'confirmed');
  assert.equal(after.phase, 'idle');
  assert.equal(after.message, AUTH_MESSAGES.nothingToConfirm);
});

test('a blocked window cannot be confirmed into a success', () => {
  const blocked = reduceAuth(INITIAL_AUTH_STATE, 'blocked');
  const after = reduceAuth(blocked, 'confirmed');
  assert.equal(after.phase, 'failed');
  assert.equal(after.message, AUTH_MESSAGES.nothingToConfirm);
});

test('a cancelled flow cannot be confirmed into a success', () => {
  const flow = reduceAuth(reduceAuth(INITIAL_AUTH_STATE, 'opened'), 'cancelled');
  const after = reduceAuth(flow, 'confirmed');
  assert.equal(after.phase, 'cancelled');
});

test('the full happy path: request → opened → confirmed', () => {
  let current = reduceAuth(INITIAL_AUTH_STATE, 'request');
  current = reduceAuth(current, 'opened');
  assert.equal(current.phase, 'awaiting');
  current = reduceAuth(current, 'confirmed');
  assert.equal(current.phase, 'completed');
  assert.equal(current.signInStarted, true);
  assert.equal(current.windowOpen, false);
});

test('the blocked happy path: request → blocked stays failed through later events', () => {
  let current = reduceAuth(INITIAL_AUTH_STATE, 'blocked');
  assert.equal(current.phase, 'failed');
  current = reduceAuth(current, 'closedEarly');
  assert.equal(current.phase, 'failed');
  current = reduceAuth(current, 'confirmed');
  assert.equal(current.phase, 'failed');
});

test('the cancellation path: request → opened → window closed -> cancelled', () => {
  let current = reduceAuth(INITIAL_AUTH_STATE, 'opened');
  current = reduceAuth(current, 'closedEarly');
  assert.equal(current.phase, 'cancelled');
  assert.equal(current.message, AUTH_MESSAGES.closedEarly);
  assert.equal(current.signInStarted, true);
});

test('re-requesting while a window is open reuses it instead of restarting', () => {
  const open = reduceAuth(INITIAL_AUTH_STATE, 'opened');
  const again = reduceAuth(open, 'request');
  assert.equal(again, open, 'the same state object should be returned unchanged');
});

test('reset is total from every state', () => {
  for (const phase of AUTH_PHASES) {
    for (const started of BOOLEANS) {
      for (const open of BOOLEANS) {
        assert.deepEqual(reduceAuth(state(phase, started, open), 'reset'), INITIAL_AUTH_STATE);
      }
    }
  }
});

test('reduceAuth never mutates the state it is given', () => {
  const before = state('awaiting', true, true);
  const snapshot = { ...before };
  for (const event of AUTH_EVENT_TYPES) {
    reduceAuth(before, event);
    assert.deepEqual(before, snapshot, `${event} mutated its input`);
  }
});

test('reduceAuth is pure: the same input always yields the same output', () => {
  for (const phase of AUTH_PHASES) {
    for (const event of AUTH_EVENT_TYPES) {
      const a = reduceAuth(state(phase, true, true), event);
      const b = reduceAuth(state(phase, true, true), event);
      assert.deepEqual(a, b);
    }
  }
});

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

for (const phase of AUTH_PHASES) {
  test(`phase ${phase} has a label`, () => {
    assert.equal(typeof AUTH_PHASE_LABEL[phase], 'string');
    assert.ok(AUTH_PHASE_LABEL[phase].length > 0);
  });

  test(`phase ${phase} has a distinct style`, () => {
    assert.equal(typeof AUTH_PHASE_STYLE[phase], 'string');
    assert.ok(AUTH_PHASE_STYLE[phase].includes('border'));
  });

  test(`phase ${phase} is covered by the transition table`, () => {
    assert.ok(TRANSITIONS.some((row) => row[0] === phase), `${phase} is never exercised as a source state`);
  });
}

test('every non-reset event type appears in the transition table', () => {
  // `reset` is total and covered by the exhaustive matrix plus its own test.
  for (const event of AUTH_EVENT_TYPES.filter((candidate) => candidate !== 'reset')) {
    assert.ok(TRANSITIONS.some((row) => row[3] === event), `${event} is never exercised`);
  }
});

test('completion is only offered when a window really opened', () => {
  assert.equal(canConfirmSignIn(INITIAL_AUTH_STATE), false);
  assert.equal(canConfirmSignIn(state('failed', false, false)), false);
  assert.equal(canConfirmSignIn(state('cancelled', true, false)), false);
  assert.equal(canConfirmSignIn(state('awaiting', true, true)), true);
  assert.equal(canConfirmSignIn(state('completed', true, false)), true);
});

test('the spinner only shows while a window is being awaited', () => {
  assert.equal(isAuthWindowOpen(state('awaiting', true, true)), true);
  for (const phase of AUTH_PHASES.filter((candidate) => candidate !== 'awaiting')) {
    assert.equal(isAuthWindowOpen(state(phase, true, false)), false);
  }
});

test('the initial state is idle and claims nothing', () => {
  assert.equal(INITIAL_AUTH_STATE.phase, 'idle');
  assert.equal(INITIAL_AUTH_STATE.signInStarted, false);
  assert.equal(INITIAL_AUTH_STATE.windowOpen, false);
  assert.equal(INITIAL_AUTH_STATE.message, null);
});

test('every message is a non-empty sentence', () => {
  for (const [key, message] of Object.entries(AUTH_MESSAGES)) {
    assert.ok(typeof message === 'string' && message.trim().length > 10, `${key} message is too short`);
  }
});

test('no message claims credentials were copied, injected or replayed', () => {
  for (const message of Object.values(AUTH_MESSAGES)) {
    const text = message.toLowerCase();
    for (const banned of ['cookie', 'token', 'password', 'credential']) {
      assert.ok(!text.includes(banned), `"${message}" mentions ${banned}`);
    }
  }
});

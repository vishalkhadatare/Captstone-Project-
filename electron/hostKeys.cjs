'use strict';

/**
 * Which keys type a character, and WHICH character.
 *
 * Why this is a module and not a one-line check in the host: the space bar is
 * the one key whose name is not its character. The renderer sends `Space`, not
 * `' '`, because a page must see a real space bar (it scrolls, and it presses a
 * focused button) - so "is this printable?" answered by `keyCode.length === 1`
 * says no, the host sends the keystroke, no text is inserted, and typing a
 * sentence silently produces one word. That is what this module exists to pin
 * down.
 *
 * The rule is deliberately the same one the server screens keys with (see
 * `isAllowedKey` in `server/browserStream.ts`): a single printable character,
 * excluding control characters and DEL. A named key types text only if it is
 * listed here - guessing at the rest is how a wrong character ends up in
 * someone's document.
 */

/**
 * Named keys whose press produces text.
 *
 * `Return`/`Enter` are deliberately NOT here, and that is a trade-off rather
 * than a fact about browsers. Measured on this host, a `Return` keyDown inserts
 * no line break in a textarea on its own, so Enter into a plain multi-line field
 * loses its new line - a real, separate gap. It is left alone because the char
 * event is synthesised after the page has already seen the keydown, so a page
 * that cancels Enter (a composer that submits on it - Prism's own does) cannot
 * stop the insertion, and Enter would both send the message and break the line.
 * A space is worth inserting unconditionally; that one is not.
 *
 * Editing keys need no entry for the opposite reason: `Backspace`, `Delete` and
 * the Ctrl+Z/Ctrl+A family act through the keydown's own default action, which
 * this host's `sendInputEvent` does perform - text is deleted without any help
 * from here.
 */
const PRINTABLE_NAMED_KEYS = { Space: ' ' };

/**
 * The text a plain press of `keyCode` types, or null for a key that types none.
 *
 * Modifiers are the caller's business (a Ctrl chord types nothing), so this
 * looks at the key alone.
 */
const textFromKeyCode = (keyCode) => {
  if (typeof keyCode !== 'string' || keyCode.length === 0) return null;
  const named = PRINTABLE_NAMED_KEYS[keyCode];
  if (named !== undefined) return named;
  if (keyCode.length !== 1) return null;
  const code = keyCode.charCodeAt(0);
  if (code < 0x20 || code === 0x7f) return null;
  return keyCode;
};

module.exports = { PRINTABLE_NAMED_KEYS, textFromKeyCode };

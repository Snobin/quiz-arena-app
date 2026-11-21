/** Room codes: 6 characters from `A-Z` and `2-9` (no 0 O 1 I L), shown as `XXX-XXX`. */

const CANONICAL = /^[A-HJKMNP-Z2-9]{6}$/;

/**
 * How a typed or linked code is read (Story 5.3): NFC, every space (any Unicode whitespace) and hyphen-minus stripped,
 * upper-cased. game-service's `RoomCodes.normalize` follows the same table (`contracts/samples/code-normalisation.json`).
 */
export function canonicalCode(input: string): string {
  return input.normalize('NFC').replace(/[\s-]+/g, '').toUpperCase();
}

/**
 * The canonical code, or null when the input is no code: not exactly 6 characters, or a character outside the
 * alphabet (the look-alikes 0 O 1 I L are rejected, never mapped). A null never reaches the server.
 */
export function normalizeCode(input: string): string | null {
  const canonical = canonicalCode(input);
  return CANONICAL.test(canonical) ? canonical : null;
}

/** Whether `input` is a room code in any case, with or without the hyphen. */
export function isRoomCode(input: string): boolean {
  return normalizeCode(input) !== null;
}

/** `K7MQ2X` as `K7M-Q2X`. Anything that is not a whole code is returned as it came. */
export function formatCode(code: string): string {
  const canonical = normalizeCode(code);
  return canonical ? `${canonical.slice(0, 3)}-${canonical.slice(3)}` : code;
}

/** The accessible name of a code: each character spoken on its own, a pause at the hyphen ("K 7 M, Q 2 X"). */
export function spellCode(code: string): string {
  const shown = formatCode(code);
  return shown
    .split('-')
    .map((half) => [...half].join(' '))
    .join(', ');
}

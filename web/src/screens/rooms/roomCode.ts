/** Room codes: 6 characters from `A-Z` and `2-9` (no 0 O 1 I L), shown as `XXX-XXX`. */

const CANONICAL = /^[A-HJKMNP-Z2-9]{6}$/;

/** Upper case, without the hyphen or any spaces: how a typed or linked code is read. */
export function canonicalCode(input: string): string {
  return input.replace(/[\s-]+/g, '').toUpperCase();
}

/** Whether `input` is a room code in any case, with or without the hyphen. */
export function isRoomCode(input: string): boolean {
  return CANONICAL.test(canonicalCode(input));
}

/** `K7MQ2X` as `K7M-Q2X`. Anything that is not a whole code is returned as it came. */
export function formatCode(code: string): string {
  const canonical = canonicalCode(code);
  return CANONICAL.test(canonical) ? `${canonical.slice(0, 3)}-${canonical.slice(3)}` : code;
}

/** The accessible name of a code: each character spoken on its own, a pause at the hyphen ("K 7 M, Q 2 X"). */
export function spellCode(code: string): string {
  const shown = formatCode(code);
  return shown
    .split('-')
    .map((half) => [...half].join(' '))
    .join(', ');
}

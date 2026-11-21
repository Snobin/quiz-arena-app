import { describe, expect, it } from 'vitest';
import { canonicalCode, formatCode, isRoomCode, spellCode } from './roomCode.ts';

describe('room codes', () => {
  it('shows the canonical code as XXX-XXX', () => {
    expect(formatCode('K7MQ2X')).toBe('K7M-Q2X');
    expect(formatCode('k7m-q2x')).toBe('K7M-Q2X');
    expect(formatCode('nonsense')).toBe('nonsense');
  });

  it('reads any case, with or without the hyphen', () => {
    expect(canonicalCode(' k7m-q2x ')).toBe('K7MQ2X');
    expect(isRoomCode('k7m q2x')).toBe(true);
    expect(isRoomCode('K7M-Q2')).toBe(false);
    expect(isRoomCode('K7M-Q0X')).toBe(false);
  });

  it('spells the code for a screen reader', () => {
    expect(spellCode('K7MQ2X')).toBe('K 7 M, Q 2 X');
  });
});

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalCode, formatCode, isRoomCode, normalizeCode, spellCode } from './roomCode.ts';

const SAMPLES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../contracts/samples');
type Case = { input: string; code: string | null };
const TABLE = (JSON.parse(readFileSync(join(SAMPLES, 'code-normalisation.json'), 'utf8')) as { cases: Case[] }).cases;

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

  it('follows the table shared with game-service', () => {
    expect(TABLE.length).toBeGreaterThan(20);
    for (const { input, code } of TABLE) expect([input, normalizeCode(input)]).toEqual([input, code]);
  });

  it('spells the code for a screen reader', () => {
    expect(spellCode('K7MQ2X')).toBe('K 7 M, Q 2 X');
  });
});

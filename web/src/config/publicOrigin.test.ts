import { describe, expect, it } from 'vitest';
import { publicOrigin, roomLink } from './publicOrigin.ts';

describe('publicOrigin', () => {
  it('trims a trailing slash from the configured origin', () => {
    expect(publicOrigin('https://minnal.example/')).toBe('https://minnal.example');
  });

  it('falls back to the page origin when nothing is configured', () => {
    expect(publicOrigin('  ')).toBe(window.location.origin);
    expect(publicOrigin('')).toBe(window.location.origin);
  });

  it('builds the join link without a doubled slash', () => {
    const link = roomLink('K7M-Q2X', 'https://x.example');
    expect(link.endsWith('/r/K7M-Q2X')).toBe(true);
    expect(link).not.toMatch(/\/\/r\//);
  });
});

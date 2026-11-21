import { describe, expect, it } from 'vitest';
import { expiryLabel, istClock } from './roomTime.ts';

describe('lobby expiry', () => {
  it('is an IST clock time', () => {
    // 14:00 UTC is 19:30 IST.
    expect(istClock(Date.parse('2026-11-12T14:00:00Z'))).toBe('7:30 pm');
    expect(istClock(Date.parse('2026-11-12T03:45:00Z'))).toBe('9:15 am');
  });

  it('says tomorrow when the expiry falls on the next IST day', () => {
    const now = Date.parse('2026-11-12T14:00:00Z'); // 19:30 IST on 12 Nov
    expect(expiryLabel('2026-11-12T16:00:00Z', now)).toEqual({ time: '9:30 pm', tomorrow: false });
    expect(expiryLabel('2026-11-13T14:00:00Z', now)).toEqual({ time: '7:30 pm', tomorrow: true });
  });

  it('uses the IST day, not the UTC day', () => {
    const now = Date.parse('2026-11-12T17:00:00Z'); // 22:30 IST on 12 Nov
    expect(expiryLabel('2026-11-12T19:00:00Z', now).tomorrow).toBe(true); // 00:30 IST on 13 Nov
  });
});

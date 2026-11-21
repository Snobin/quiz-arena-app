import { describe, expect, it } from 'vitest';
import { clampCount, countCaption, countLimits } from './roomConfig.ts';

describe('count limits', () => {
  it('are 5 and min(30, published)', () => {
    expect(countLimits(1240)).toEqual({ min: 5, max: 30, topicBound: false });
    expect(countLimits(30)).toEqual({ min: 5, max: 30, topicBound: false });
    expect(countLimits(18)).toEqual({ min: 5, max: 18, topicBound: true });
    expect(countLimits(undefined)).toEqual({ min: 5, max: 30, topicBound: false });
  });

  it('lower a count that the topic cannot supply, and raise one below the minimum', () => {
    expect(clampCount(25, countLimits(18))).toBe(18);
    expect(clampCount(10, countLimits(18))).toBe(10);
    expect(clampCount(2, countLimits(18))).toBe(5);
    expect(clampCount(Number.NaN, countLimits(18))).toBe(10);
  });

  it('caption only at a limit, naming the topic size when the topic is the limit', () => {
    const limits = countLimits(18);
    expect(countCaption(10, limits)).toBeNull();
    expect(countCaption(18, limits)).toEqual({ kind: 'topic', count: 18 });
    expect(countCaption(5, limits)).toEqual({ kind: 'min', count: 5 });
    expect(countCaption(30, countLimits(500))).toEqual({ kind: 'max', count: 30 });
  });
});

/** The question count a room may have (FR36, FR76): 5 to 30, and never more than the topic has published. */

export const MIN_QUESTIONS = 5;
export const MAX_QUESTIONS = 30;
export const DEFAULT_QUESTIONS = 10;

export type CountLimits = {
  min: number;
  max: number;
  /** The max is the topic's own size (shown as "This topic has N questions") rather than the 30 cap. */
  topicBound: boolean;
};

/** Limits for a topic with `publishedCount` questions; without a known topic only the 5-30 range applies. */
export function countLimits(publishedCount?: number): CountLimits {
  if (publishedCount === undefined) return { min: MIN_QUESTIONS, max: MAX_QUESTIONS, topicBound: false };
  const max = Math.max(MIN_QUESTIONS, Math.min(MAX_QUESTIONS, publishedCount));
  return { min: MIN_QUESTIONS, max, topicBound: publishedCount < MAX_QUESTIONS };
}

/** `count` held inside the limits; a value that is not a whole number reads as the default. */
export function clampCount(count: number, limits: CountLimits): number {
  const whole = Number.isInteger(count) ? count : DEFAULT_QUESTIONS;
  return Math.min(limits.max, Math.max(limits.min, whole));
}

/** Which caption a stepper shows: at a limit only. */
export type CountCaption = { kind: 'min' | 'max' | 'topic'; count: number } | null;

export function countCaption(count: number, limits: CountLimits): CountCaption {
  if (count <= limits.min) return { kind: 'min', count: limits.min };
  if (count >= limits.max) return limits.topicBound ? { kind: 'topic', count: limits.max } : { kind: 'max', count: limits.max };
  return null;
}

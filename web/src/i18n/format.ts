// Numbers are Latin digits with Indian grouping in both UI languages (EXPERIENCE.md ›
// Bilingual Behavior): 7,840 · #3,406 · 1,00,000. The i18n `number` / `signed` formats use these,
// so interpolated numbers follow the same rule.
const NUMBER = new Intl.NumberFormat('en-IN', { numberingSystem: 'latn', maximumFractionDigits: 2 });

export function formatNumber(value: number): string {
  return NUMBER.format(value);
}

/** With an explicit sign for positive values (rating deltas): +24, -8, 0. */
export function formatSigned(value: number): string {
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

const TENTHS = new Intl.NumberFormat('en-IN', { numberingSystem: 'latn', minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Always one decimal (response times): 4.0, 4.2, 12.5. */
export function formatTenths(value: number): string {
  return TENTHS.format(value);
}

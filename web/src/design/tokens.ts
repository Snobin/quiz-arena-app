/**
 * The DESIGN.md token contract, transcribed exactly
 * (_bmad-output/planning-artifacts/ux-designs/ux-quiz-arena-2026-11-11/DESIGN.md).
 *
 * This file is the single TS source of the values. `theme.css` declares the same values as CSS
 * variables in Tailwind's `@theme`; `tokens.test.ts` fails if the two drift apart or if a
 * DESIGN.md token is missing.
 */

export const colors = {
  // Calm surface, light
  paper: '#F4F5F7',
  card: '#FFFFFF',
  ink: '#101216',
  muted: '#666C78',
  hairline: '#E1E3E8',
  'control-edge': '#8D939C',
  dim: '#9AA0AA',
  tile: '#F4F5F7',
  'ink-soft': '#2B3040',
  unanswered: '#80868F',
  brick: '#B8463A',
  // Calm surface, dark
  'paper-dark': '#141518',
  'card-dark': '#1D1F23',
  'ink-dark': '#E8E9EB',
  'muted-dark': '#9CA1AA',
  'hairline-dark': '#2F3238',
  'control-edge-dark': '#6E737C',
  'dim-dark': '#6E737C',
  'tile-dark': '#26292E',
  'ink-soft-dark': '#E8E9EB',
  'unanswered-dark': '#6E737C',
  'brick-dark': '#E2705F',
  // Peak surface
  band: '#101216',
  'band-raised': '#2B3040',
  'on-band': '#FFFFFF',
  'on-band-muted': '#9AA0AA',
  'on-band-soft': '#C9CDD3',
  volt: '#D4FF2A',
  'on-volt': '#101216',
  // Peak surface, dark
  'band-dark': '#2F3238',
  'band-raised-dark': '#3D414A',
} as const;

export type ColorToken = keyof typeof colors;

/**
 * Semantic surface colours: each swaps to its `-dark` raw value under
 * `prefers-color-scheme: dark` (see theme.css). Components use these names and never write
 * `dark:` variants for surfaces.
 */
export const darkSwapped = [
  'paper',
  'card',
  'ink',
  'muted',
  'hairline',
  'control-edge',
  'dim',
  'tile',
  'ink-soft',
  'unanswered',
  'brick',
  'band',
  'band-raised',
] as const satisfies readonly ColorToken[];

type TypeToken = {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing?: string;
};

const MALAYALAM = 'Noto Sans Malayalam, Noto Sans Malayalam Fallback, Nirmala UI, Kartika, sans-serif';
const MALAYALAM_UI = 'Noto Sans Malayalam, Noto Sans Malayalam Fallback, system-ui, sans-serif';
const NUMERIC = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const MONO = 'ui-monospace, SF Mono, Menlo, Consolas, monospace';
const UI = 'system-ui, -apple-system, Segoe UI, Roboto, Noto Sans Malayalam, Noto Sans Malayalam Fallback, sans-serif';

export const typography = {
  question: { fontFamily: MALAYALAM, fontSize: '1.4375rem', fontWeight: '500', lineHeight: '1.65' },
  option: { fontFamily: MALAYALAM, fontSize: '1.09375rem', fontWeight: '400', lineHeight: '1.5' },
  explanation: { fontFamily: MALAYALAM, fontSize: '0.875rem', fontWeight: '400', lineHeight: '1.75' },
  title: { fontFamily: MALAYALAM_UI, fontSize: '1.3125rem', fontWeight: '600', lineHeight: '1.5' },
  'card-title': { fontFamily: MALAYALAM_UI, fontSize: '1.5rem', fontWeight: '600', lineHeight: '1.4' },
  'peak-word': { fontFamily: MALAYALAM_UI, fontSize: '1.5rem', fontWeight: '600', lineHeight: '1.4' },
  'peak-points': {
    fontFamily: NUMERIC,
    fontSize: '2.75rem',
    fontWeight: '700',
    lineHeight: '1',
    letterSpacing: '-0.02em',
  },
  'takeover-title': { fontFamily: MALAYALAM_UI, fontSize: '2.375rem', fontWeight: '700', lineHeight: '1.35' },
  'takeover-score': {
    fontFamily: NUMERIC,
    fontSize: '2.125rem',
    fontWeight: '700',
    lineHeight: '1',
    letterSpacing: '-0.02em',
  },
  score: { fontFamily: NUMERIC, fontSize: '1.1875rem', fontWeight: '600', lineHeight: '1.2' },
  'room-code': { fontFamily: MONO, fontSize: '2.5rem', fontWeight: '700', lineHeight: '1.1', letterSpacing: '0.06em' },
  'room-code-compact': { fontFamily: MONO, fontSize: '2rem', fontWeight: '700', lineHeight: '1.1', letterSpacing: '0em' },
  code: {
    fontFamily: 'ui-monospace, SF Mono, Menlo, Consolas, Noto Sans Malayalam, Noto Sans Malayalam Fallback, monospace',
    fontSize: '0.75rem',
    fontWeight: '400',
    lineHeight: '1.6',
  },
  body: { fontFamily: UI, fontSize: '0.9375rem', fontWeight: '400', lineHeight: '1.5' },
  label: { fontFamily: UI, fontSize: '0.75rem', fontWeight: '400', lineHeight: '1.5' },
  caption: { fontFamily: UI, fontSize: '0.75rem', fontWeight: '500', lineHeight: '1.5' },
  countdown: { fontFamily: NUMERIC, fontSize: '4.5rem', fontWeight: '700', lineHeight: '1' },
  'tab-label': { fontFamily: UI, fontSize: '0.75rem', fontWeight: '400', lineHeight: '1.5' },
} as const satisfies Record<string, TypeToken>;

export type TypographyToken = keyof typeof typography;

export const rounded = {
  sm: '6px',
  md: '10px',
  lg: '12px',
  xl: '14px',
  '2xl': '16px',
  full: '9999px',
} as const;

export const spacing = {
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '5': '20px',
  '6': '24px',
  '8': '32px',
  'gutter-card': '16px',
  'gutter-text': '20px',
  'option-gap': '10px',
  'target-min': '48px',
  'sticky-max': '48px',
} as const;

/** Motion tokens as authored in DESIGN.md (CSS values). */
export const motionTokens = {
  'flash-window': '1000ms',
  'band-drop': '160ms',
  'strike-volt-hold': '80ms',
  'strike-total': '400ms',
  'overtake-jump': '180ms',
  'overtake-crack-fade-after': '1200ms',
  'win-flood': '200ms',
  'win-hold': '1600ms',
  'win-collapse': '240ms',
  'chip-pop': '160ms',
  'chip-new-label': '3000ms',
  'reduced-fade': '200ms',
  'reduced-chip-fade': '120ms',
  'easing-default': 'ease-out',
  'easing-overtake': 'cubic-bezier(.34,1.4,.64,1)',
} as const;

const ms = (value: `${number}ms`): number => Number(value.slice(0, -2));

/** Motion constants for JS timers and the Web Animations API: durations in ms, plus easings. */
export const motion = {
  flashWindow: ms(motionTokens['flash-window']),
  bandDrop: ms(motionTokens['band-drop']),
  strikeVoltHold: ms(motionTokens['strike-volt-hold']),
  strikeTotal: ms(motionTokens['strike-total']),
  overtakeJump: ms(motionTokens['overtake-jump']),
  overtakeCrackFadeAfter: ms(motionTokens['overtake-crack-fade-after']),
  winFlood: ms(motionTokens['win-flood']),
  winHold: ms(motionTokens['win-hold']),
  winCollapse: ms(motionTokens['win-collapse']),
  chipPop: ms(motionTokens['chip-pop']),
  chipNewLabel: ms(motionTokens['chip-new-label']),
  reducedFade: ms(motionTokens['reduced-fade']),
  reducedChipFade: ms(motionTokens['reduced-chip-fade']),
  easingDefault: motionTokens['easing-default'],
  easingOvertake: motionTokens['easing-overtake'],
} as const;

/**
 * Every CSS variable `theme.css` must declare in `@theme`, with its value.
 * Naming follows Tailwind 4 namespaces so the tokens become utilities:
 * `--color-<name>`, `--font-<name>` + `--text-<name>[--line-height|--font-weight|--letter-spacing]`,
 * `--radius-<name>`, `--spacing-<name>`, and `--motion-<name>`.
 */
export function themeVariables(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, value] of Object.entries(colors)) vars[`--color-${name}`] = value;
  for (const [name, t] of Object.entries(typography) as [string, TypeToken][]) {
    vars[`--font-${name}`] = t.fontFamily;
    vars[`--text-${name}`] = t.fontSize;
    vars[`--text-${name}--line-height`] = t.lineHeight;
    vars[`--text-${name}--font-weight`] = t.fontWeight;
    if (t.letterSpacing !== undefined) vars[`--text-${name}--letter-spacing`] = t.letterSpacing;
  }
  for (const [name, value] of Object.entries(rounded)) vars[`--radius-${name}`] = value;
  for (const [name, value] of Object.entries(spacing)) vars[`--spacing-${name}`] = value;
  for (const [name, value] of Object.entries(motionTokens)) vars[`--motion-${name}`] = value;
  return vars;
}

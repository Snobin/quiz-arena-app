import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { countCaption, type CountLimits } from './roomConfig.ts';
import './roomCatalogue.ts';

const STEP = 'hit-target inline-flex min-h-target-min min-w-target-min items-center justify-center rounded-md border-[1.5px] border-ink bg-card text-title text-ink';
const STEP_OFF = 'cursor-not-allowed border-dim text-muted';

/**
 * The question-count stepper (FR36): − and + (48 px hit areas) around the value in tabular digits. A limit shows as
 * `aria-disabled` (still focusable) and a caption names it ("This topic has 18 questions").
 */
export function CountStepper({ value, limits, onChange, labelledBy }: { value: number; limits: CountLimits; onChange: (next: number) => void; labelledBy: string }) {
  const { t } = useTranslation();
  const captionId = useId();
  const caption = countCaption(value, limits);
  const atMin = value <= limits.min;
  const atMax = value >= limits.max;
  const captionText = caption === null ? null : caption.kind === 'min' ? t('rooms.count.min', { count: caption.count }) : caption.kind === 'topic' ? t('rooms.count.topic', { count: caption.count }) : t('rooms.count.max', { count: caption.count });
  return (
    <div role="group" aria-labelledby={labelledBy} aria-describedby={captionText ? captionId : undefined} className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={t('rooms.count.less')}
          aria-disabled={atMin ? 'true' : undefined}
          onClick={() => {
            if (!atMin) onChange(value - 1);
          }}
          className={[STEP, atMin ? STEP_OFF : ''].join(' ')}
        >
          <span aria-hidden="true">−</span>
        </button>
        <span data-testid="count-value" className="min-w-[3ch] text-center text-title tabular-nums text-ink">
          {value}
        </span>
        <button
          type="button"
          aria-label={t('rooms.count.more')}
          aria-disabled={atMax ? 'true' : undefined}
          onClick={() => {
            if (!atMax) onChange(value + 1);
          }}
          className={[STEP, atMax ? STEP_OFF : ''].join(' ')}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      {captionText ? (
        <p id={captionId} className="text-caption text-muted">
          {captionText}
        </p>
      ) : null}
    </div>
  );
}

import { useId, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BOLT_PATH } from '../../shell/tabIcons.tsx';

type QuickMatchCardProps = {
  /** Why the card can't start a match (offline, no guest token yet); undefined when it can. */
  disabledReason?: string;
  onPlay: () => void;
};

/**
 * The primary action card (UX-DR21): the only filled ink element on Home. The whole card is one
 * button, so it is a single tab stop and a 48px+ target; the "Play now" pill is presentational.
 * Dark mode renders it band-dark with a 1px dim-dark edge. The bolt watermark is static
 * band-raised, never volt. Disabled, it stays focusable with aria-disabled and a caption.
 */
export function QuickMatchCard({ disabledReason, onPlay }: QuickMatchCardProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const subtitleId = useId();
  const reasonId = useId();
  const disabled = disabledReason !== undefined;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onPlay();
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        data-testid="quick-match-card"
        aria-labelledby={titleId}
        aria-describedby={disabled ? `${subtitleId} ${reasonId}` : subtitleId}
        aria-disabled={disabled ? 'true' : undefined}
        onClick={handleClick}
        className={[
          'surface-band relative block min-h-target-min w-full overflow-hidden rounded-2xl border border-transparent px-4 py-4 text-left dark:border-dim-dark',
          disabled ? 'cursor-not-allowed opacity-60' : '',
        ].join(' ')}
      >
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="3 1 13 18"
          className="pointer-events-none absolute top-[-6px] right-[-4px] h-[138px] w-[100px] fill-band-raised"
        >
          <path d={BOLT_PATH} />
        </svg>
        <span id={titleId} className="relative block font-card-title text-card-title">
          {t('play.quickMatch')}
        </span>
        <span id={subtitleId} className="relative mt-1 block text-caption text-on-band-muted">
          {t('home.quickMatch.subtitle')}
        </span>
        <span
          aria-hidden="true"
          className="relative mt-3 inline-flex items-center rounded-md bg-on-band px-4 py-2 text-body font-bold text-band"
        >
          {t('home.quickMatch.play')}
        </span>
      </button>
      {disabled ? (
        <span id={reasonId} className="block text-caption text-muted">
          {disabledReason}
        </span>
      ) : null}
    </div>
  );
}

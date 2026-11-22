import { useTranslation } from 'react-i18next';
import { detectLanguage } from '../../i18n/Lang.tsx';

/**
 * Below the reveal band: the explanation (with its `lang`), then the attribution, or "source
 * not available" when there is none. Both exactly as QUESTION_REVEALED sent them. `hideSource` drops the source
 * line (a player's own custom question has none to show).
 */
export function RevealDetails({ explanation, attribution, hideSource = false }: { explanation: string; attribution: string | null; hideSource?: boolean }) {
  const { t } = useTranslation();
  return (
    <section aria-label={t('match.explanation')} data-testid="reveal-details" className="mt-4 px-1">
      <p lang={detectLanguage(explanation)} className="font-explanation text-explanation text-ink-soft">
        {explanation}
      </p>
      {hideSource ? null : (
        <p data-testid="attribution" className="mt-1 text-caption text-muted">
          {attribution !== null ? <span lang={detectLanguage(attribution)}>{attribution}</span> : t('match.sourceNotAvailable')}
        </p>
      )}
    </section>
  );
}

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../design/Button.tsx';
import { PageColumn } from '../../design/PageColumn.tsx';
import { Link } from '../../shell/Link.tsx';
import { navigate } from '../../shell/router.ts';
import type { Tally } from './practiceApi.ts';

export const PRACTICE_PICKER = '/play/topics?for=solo';

type PracticeEndProps = {
  /** `summary`: she stopped. `expired`: the session timed out. `deleted`: her custom topic was deleted. The tally is the last one she saw. */
  kind: 'summary' | 'expired' | 'deleted';
  tally: Tally;
  onAgain: () => void;
};

const LINK = 'hit-target inline-flex min-h-target-min items-center justify-center text-body font-semibold underline';

/** The card after Stop (with at least one answer) or after a timeout: the tally and the next steps. */
export function PracticeEnd({ kind, tally, onAgain }: PracticeEndProps) {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <PageColumn className="py-6">
      <main data-testid={`practice-${kind}`} className="flex flex-col gap-4">
        <h1 ref={headingRef} tabIndex={-1} className="font-title text-title">
          {kind === 'summary' ? t('practice.summary.heading') : kind === 'deleted' ? t('practice.deleted') : t('practice.expired')}
        </h1>
        <p data-testid="practice-tally" className="text-body tabular-nums">
          {t('practice.tally', { answered: tally.answeredCount, correct: tally.correctCount })}
        </p>
        <div className="flex flex-col gap-3">
          {kind === 'deleted' ? null : <Button onClick={onAgain}>{t(kind === 'summary' ? 'practice.again' : 'practice.startAgain')}</Button>}
          <Button variant={kind === 'deleted' ? 'primary' : 'secondary'} onClick={() => navigate(PRACTICE_PICKER)}>
            {t('practice.chooseTopic')}
          </Button>
          <Link to="/" className={LINK}>
            {t('common.home')}
          </Link>
        </div>
      </main>
    </PageColumn>
  );
}

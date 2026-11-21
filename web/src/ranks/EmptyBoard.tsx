import { useTranslation } from 'react-i18next';
import { Button } from '../design/Button.tsx';
import { BOLT_PATH } from '../shell/tabIcons.tsx';
import { navigate } from '../shell/router.ts';
import type { MessageKey } from '../i18n/index.ts';
import type { Mode } from '../ratings/ratingsApi.ts';
import type { Period } from './leaderboardApi.ts';

const MODE_LABEL: Record<Mode, MessageKey> = {
  QUICK: 'play.quickMatch',
  TOPIC_DUEL: 'mode.topicDuel.title',
  BATTLE_ROOM: 'mode.battleRoom.title',
};

/**
 * A board with no rows (UX-DR59, a new IST day for one): a card with a static ink-outline bolt, one plain line, a
 * primary button that starts the viewed mode (aria-disabled "Coming soon" for the modes that are not playable yet),
 * a text link to a board that has rows, and three decorative dashed ghost rows.
 */
export function EmptyBoard({ mode, period, onSeeAll }: { mode: Mode; period: Period; onSeeAll: () => void }) {
  const { t } = useTranslation();
  const label = t(MODE_LABEL[mode]);
  return (
    <div data-testid="empty-board" className="flex flex-col items-center gap-3 rounded-lg border border-hairline bg-card p-4 text-center">
      <svg aria-hidden="true" focusable="false" viewBox="3 1 13 18" className="h-10 w-8 fill-none stroke-ink" strokeWidth="1.2">
        <path d={BOLT_PATH} />
      </svg>
      <p className="text-body">{t(`ranks.empty.${period}` as MessageKey)}</p>
      {mode !== 'BATTLE_ROOM' ? (
        <Button className="w-full" onClick={() => navigate(mode === 'QUICK' ? '/matchmaking' : '/play/topics?for=duel')}>
          {t('ranks.empty.start', { mode: label })}
        </Button>
      ) : (
        <Button disabled disabledReason={t('mode.comingSoon')} className="w-full">
          {t('ranks.empty.start', { mode: label })}
        </Button>
      )}
      {period !== 'alltime' ? (
        <button type="button" onClick={onSeeAll} className="hit-target min-h-target-min text-body font-semibold underline">
          {t('ranks.empty.seeAll')}
        </button>
      ) : null}
      <div aria-hidden="true" className="flex w-full flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[47px] rounded-lg border border-dashed border-hairline" />
        ))}
      </div>
    </div>
  );
}

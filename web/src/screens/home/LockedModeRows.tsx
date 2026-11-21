import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import type { MessageKey } from '../../i18n/index.ts';
import { isPlainLeftClick, Link } from '../../shell/Link.tsx';
import { setReturnFocus } from '../../shell/returnFocus.ts';
import { BattleRoomIcon, LockIcon, SoloPracticeIcon, TopicDuelIcon } from './icons.tsx';
import { signInPath } from './signInPath.ts';

type Mode = { id: string; title: MessageKey; sub: MessageKey; Icon: ComponentType; /** Where Sign-in brings her back to; Home when absent. */ returnTo?: string };

/** Mockup order. Guests may play Quick Match only (CAP-1); these open the Sign-in prompt. */
export const LOCKED_MODES: readonly Mode[] = [
  { id: 'homeModeTopicDuel', title: 'mode.topicDuel.title', sub: 'mode.topicDuel.sub', Icon: TopicDuelIcon },
  { id: 'homeModeSolo', title: 'mode.solo.title', sub: 'mode.solo.sub', Icon: SoloPracticeIcon },
  { id: 'homeModeBattleRoom', title: 'mode.battleRoom.title', sub: 'mode.battleRoom.sub', Icon: BattleRoomIcon, returnTo: '/rooms' },
];

/**
 * Locked mode entry rows (DESIGN.md › Mode entry row, locked): muted title, half-opacity icon,
 * lock + "Sign in". Each row is one link to the Sign-in prompt named "<mode>, locked, sign in to
 * play"; Back from the prompt returns focus to it.
 */
export function LockedModeRows() {
  const { t } = useTranslation();
  return (
    <ul className="rounded-lg border border-hairline bg-card">
      {LOCKED_MODES.map(({ id, title, sub, Icon, returnTo = '/' }) => (
        <li key={id} className="border-b border-hairline last:border-b-0">
          <Link
            id={id}
            to={signInPath(returnTo)}
            aria-label={t('mode.locked.a11y', { mode: t(title) })}
            onClick={(event) => {
              // Only an in-app navigation comes back here; a new-tab click must not leave a target.
              if (isPlainLeftClick(event)) setReturnFocus(id, returnTo);
            }}
            className="flex min-h-target-min w-full min-w-[0] items-center gap-3 rounded-lg px-4 py-2"
          >
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-tile text-ink opacity-50">
              <Icon />
            </span>
            <span className="flex min-w-[0] flex-1 flex-col">
              <span className="text-body font-semibold text-muted">{t(title)}</span>
              <span className="text-caption text-muted">{t(sub)}</span>
            </span>
            <span className="flex flex-none items-center gap-1 text-caption font-semibold text-muted">
              <LockIcon />
              {t('mode.locked.label')}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

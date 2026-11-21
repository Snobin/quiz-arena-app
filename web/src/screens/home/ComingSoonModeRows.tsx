import { useId, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '../../shell/Link.tsx';
import { LOCKED_MODES } from './LockedModeRows.tsx';

/** Modes that are live: each opens the topic picker for its purpose. The rest stay "Coming soon". */
const LIVE_MODE_PATHS: Record<string, string> = {
  homeModeTopicDuel: '/play/topics?for=duel',
  homeModeSolo: '/play/topics?for=solo',
  homeModeBattleRoom: '/rooms',
};

/**
 * The mode rows for a registered player (UX-DR22): Topic Duel and Solo Practice open the topic picker and Battle Room opens
 * the Rooms tab (Story 5.2); a mode without a path is `aria-disabled` with the caption "Coming soon" and opens nothing. Each row is a focusable
 * button (like Button's disabled state), so the caption is announced with the mode name.
 */
export function ComingSoonModeRows() {
  const { t } = useTranslation();
  return (
    <ul className="rounded-lg border border-hairline bg-card">
      {LOCKED_MODES.map(({ id, title, sub, Icon }) =>
        LIVE_MODE_PATHS[id] ? (
          <LiveModeRow key={id} id={id} to={LIVE_MODE_PATHS[id]} title={t(title)} sub={t(sub)} Icon={Icon} />
        ) : (
          <ModeRow key={id} id={id} title={t(title)} sub={t(sub)} Icon={Icon} />
        ),
      )}
    </ul>
  );
}

function LiveModeRow({ id, to, title, sub, Icon }: { id: string; to: string; title: string; sub: string; Icon: ComponentType }) {
  return (
    <li className="border-b border-hairline last:border-b-0">
      <Link id={id} to={to} className="flex min-h-target-min w-full min-w-[0] items-center gap-3 rounded-lg px-4 py-2">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-tile text-ink">
          <Icon />
        </span>
        <span className="flex min-w-[0] flex-1 flex-col">
          <span className="text-body font-semibold text-ink">{title}</span>
          <span className="text-caption text-muted">{sub}</span>
        </span>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-none">
          <path d="M6 3l5 5-5 5" stroke="var(--color-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </li>
  );
}

function ModeRow({ id, title, sub, Icon }: { id: string; title: string; sub: string; Icon: ComponentType }) {
  const { t } = useTranslation();
  const captionId = useId();
  return (
    <li className="border-b border-hairline last:border-b-0">
      <button
        id={id}
        type="button"
        aria-disabled="true"
        aria-label={t('mode.comingSoon.a11y', { mode: title })}
        aria-describedby={captionId}
        onClick={(event) => event.preventDefault()}
        className="flex min-h-target-min w-full min-w-[0] cursor-not-allowed items-center gap-3 rounded-lg px-4 py-2 text-left"
      >
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-tile text-ink opacity-50">
          <Icon />
        </span>
        <span className="flex min-w-[0] flex-1 flex-col">
          <span className="text-body font-semibold text-muted">{title}</span>
          <span className="text-caption text-muted">{sub}</span>
        </span>
        <span id={captionId} className="flex-none text-caption font-semibold text-muted">
          {t('mode.comingSoon')}
        </span>
      </button>
    </li>
  );
}

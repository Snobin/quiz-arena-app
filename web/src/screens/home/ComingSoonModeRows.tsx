import { useId, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { LOCKED_MODES } from './LockedModeRows.tsx';

/**
 * The mode rows for a registered player (UX-DR22): no longer locked, but until their epics ship they
 * are `aria-disabled` with the caption "Coming soon" and open nothing. Each row is a focusable
 * button (like Button's disabled state), so the caption is announced with the mode name.
 */
export function ComingSoonModeRows() {
  const { t } = useTranslation();
  return (
    <ul className="rounded-lg border border-hairline bg-card">
      {LOCKED_MODES.map(({ id, title, sub, Icon }) => (
        <ModeRow key={id} id={id} title={t(title)} sub={t(sub)} Icon={Icon} />
      ))}
    </ul>
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

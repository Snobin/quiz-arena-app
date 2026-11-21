import { useTranslation } from 'react-i18next';
import { Link } from '../../shell/Link.tsx';
import { formatCode } from './roomCode.ts';
import type { RoomError as RoomErrorValue } from './roomClient.ts';
import { useRoom } from './roomClient.ts';
import './roomCatalogue.ts';

const LINK = 'hit-target inline-flex min-h-target-min items-center text-body font-semibold text-ink underline';

/**
 * A failed create or configure, inline and kept where it happened (the chosen values stay). `PROFILE_REQUIRED` links to
 * profile setup and back; `ALREADY_IN_MATCH` offers the room or match she is already in.
 */
export function RoomError({ error, scope, returnTo }: { error: RoomErrorValue; scope: 'create' | 'configure'; returnTo: string }) {
  const { t } = useTranslation();
  const session = useRoom((s) => s.session);
  const generic = scope === 'create' ? t('rooms.error.generic') : t('rooms.error.config');
  let text: string;
  let action: { to: string; label: string } | null = null;
  switch (error.code) {
    case 'PROFILE_REQUIRED':
      text = t('rooms.error.profile');
      action = { to: `/profile/setup?to=${encodeURIComponent(returnTo)}`, label: t('rooms.error.profileLink') };
      break;
    case 'ALREADY_IN_MATCH':
      text = t('rooms.error.busy');
      if (error.roomId && session?.roomId === error.roomId) action = { to: `/r/${formatCode(session.code)}`, label: t('rooms.error.busyReturn') };
      else if (error.matchId) action = { to: '/match', label: t('rooms.error.busyReturn') };
      break;
    case 'SERVER_DRAINING':
      text = t('rooms.error.draining');
      break;
    case 'CONNECTION':
    case 'TIMEOUT':
      text = t('rooms.error.connection');
      break;
    case 'FORBIDDEN_MODE':
      text = t('rooms.error.forbidden');
      break;
    default:
      text = generic;
  }
  return (
    <div role="alert" className="flex flex-col items-start gap-1 rounded-lg border border-brick bg-card p-3">
      <p className="text-body text-ink">{text}</p>
      {action ? (
        <Link to={action.to} className={LINK}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

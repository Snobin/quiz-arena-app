import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { announce } from '../../shell/announce.ts';
import { Link } from '../../shell/Link.tsx';
import { navigate } from '../../shell/router.ts';
import { formatCode, normalizeCode } from './roomCode.ts';
import type { RoomError as RoomErrorValue } from './roomClient.ts';
import { roomClient, useRoom } from './roomClient.ts';
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

/** The inline message for a join that failed (Story 5.3), keyed by its code. */
function joinText(t: ReturnType<typeof useTranslation>['t'], error: RoomErrorValue, typed: string): string {
  switch (error.code) {
    case 'BAD_CODE':
      return t('rooms.join.error.badCode');
    case 'ROOM_NOT_FOUND':
      return t('rooms.join.error.notFound');
    case 'ROOM_EXPIRED':
      return t('rooms.join.error.expired', { code: formatCode(normalizeCode(typed) ?? typed.trim()) });
    case 'ROOM_FULL':
      return t('rooms.join.error.full');
    case 'ROOM_STARTED':
      return t('rooms.join.error.started');
    case 'RATE_LIMITED':
      return t('rooms.join.error.rateLimited');
    case 'ALREADY_IN_MATCH':
      return t('rooms.error.busy');
    case 'PROFILE_REQUIRED':
      return t('rooms.join.error.profile');
    case 'SERVER_DRAINING':
      return t('rooms.error.draining');
    case 'FORBIDDEN_MODE':
      return t('rooms.error.forbidden');
    case 'CONNECTION':
    case 'TIMEOUT':
      return t('rooms.error.connection');
    default:
      return t('rooms.join.error.generic');
  }
}

/** Back to the room or match she is already in: a room is re-read from the socket (it knows the code), then opened. */
function returnToActive(error: RoomErrorValue): void {
  if (error.matchId) {
    navigate('/match');
    return;
  }
  const open = useRoom.getState().session;
  if (open) {
    navigate(`/r/${formatCode(open.code)}`);
    return;
  }
  void roomClient()
    .resume()
    .then((found) => {
      const session = useRoom.getState().session;
      if (found && session) navigate(`/r/${formatCode(session.code)}`);
    });
}

/**
 * A failed join under the code field (`id` is the field's `aria-describedby`), announced politely once.
 * `ALREADY_IN_MATCH` adds a button back to the match or room she is in.
 */
export function JoinError({ id, error, typed }: { id: string; error: RoomErrorValue; typed: string }) {
  const { t } = useTranslation();
  const text = joinText(t, error, typed);
  useEffect(() => {
    announce(text);
    // Once per error, not on every keystroke or language change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);
  const busyWithSomething = error.code === 'ALREADY_IN_MATCH' && (error.matchId !== undefined || error.roomId !== undefined);
  return (
    <div className="flex flex-col items-start gap-1">
      <p id={id} className="text-body text-brick">
        {text}
      </p>
      {busyWithSomething ? (
        <button type="button" onClick={() => returnToActive(error)} className={LINK}>
          {t('rooms.error.busyReturn')}
        </button>
      ) : null}
      {error.code === 'PROFILE_REQUIRED' ? (
        <Link to={`/profile/setup?to=${encodeURIComponent('/rooms')}`} className={LINK}>
          {t('rooms.error.profileLink')}
        </Link>
      ) : null}
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../auth/session.ts';
import { PageColumn } from '../../design/PageColumn.tsx';
import { navigate, usePathname } from '../../shell/router.ts';
import { signInPath } from '../home/signInPath.ts';
import CreateRoom from './CreateRoom.tsx';
import Lobby from './HostLobby.tsx';
import { normalizeCode } from './roomCode.ts';
import { roomClient, useRoom, type RoomError } from './roomClient.ts';
import './roomCatalogue.ts';

export const CREATE_PATH = '/rooms/create';
export const LOBBY_PATH = '/r/';

function Pending({ text }: { text?: string }) {
  const { t } = useTranslation();
  return (
    <PageColumn className="py-4">
      <main className="flex flex-col gap-3">
        <h1 tabIndex={-1} className="font-title text-title">
          {text ?? t('common.loading')}
        </h1>
      </main>
    </PageColumn>
  );
}

/**
 * `/r/<code>` (Stories 5.2 and 5.3): the lobby. The room lives in the room client; without it (a shared link, a reload)
 * the route normalises the code and sends the join at once, with no confirmation: game-service answers a member (the
 * host's own reload, a second tap on the link) with `ROOM_JOINED` again, so one path serves everyone. A bad code, or a
 * join that fails, opens the Rooms tab with the code prefilled and the error under the field.
 */
function LobbyRoute({ code }: { code: string }) {
  const { t } = useTranslation();
  const room = useRoom((s) => s.session);
  const had = useRef(false);
  const tried = useRef(false);
  const typed = safeDecode(code);
  const canonical = normalizeCode(typed);
  const mine = room !== null && canonical !== null && room.code === canonical;
  useEffect(() => {
    if (room && mine) had.current = true;
  }, [room, mine]);
  useEffect(() => {
    if (room && mine) return;
    if (had.current) {
      // The room ended (leave, expiry, closed): back to the Rooms tab, whose notice says why.
      navigate('/rooms', { replace: true });
      return;
    }
    // Once per mount: a failed join must not start another.
    if (tried.current) return;
    tried.current = true;
    const fail = (error: RoomError) => {
      roomClient().setJoinFailure({ typed, error });
      navigate('/rooms', { replace: true });
    };
    if (!canonical) {
      fail({ code: 'BAD_CODE' });
      return;
    }
    void roomClient()
      .join(canonical)
      .then((result) => {
        if (!result.ok) fail(result.error);
      });
  }, [room, mine, canonical, typed]);
  if (!room || !mine) return <Pending text={t('rooms.lobby.joining')} />;
  return <Lobby session={room} />;
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * The lazy chunk behind `/rooms/create` and `/r/<code>`. A guest is sent to the Sign-in prompt with this route as
 * `returnTo`; no join is ever sent for a guest (the lobby route only mounts for a registered player, and App shows
 * profile setup first to one whose profile is not finished).
 */
export default function RoomsRoutes() {
  const status = useSession((s) => s.status);
  const pathname = usePathname();
  useEffect(() => {
    if (status === 'guest') navigate(signInPath(`${pathname}${window.location.search}`), { replace: true });
  }, [status, pathname]);
  if (status !== 'registered') return <Pending />;
  if (pathname === CREATE_PATH) return <CreateRoom />;
  if (pathname.startsWith(LOBBY_PATH)) return <LobbyRoute code={pathname.slice(LOBBY_PATH.length)} />;
  return <Pending />;
}

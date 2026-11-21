import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../auth/session.ts';
import { PageColumn } from '../../design/PageColumn.tsx';
import { Link } from '../../shell/Link.tsx';
import { navigate, usePathname } from '../../shell/router.ts';
import { signInPath } from '../home/signInPath.ts';
import CreateRoom from './CreateRoom.tsx';
import HostLobby from './HostLobby.tsx';
import { formatCode } from './roomCode.ts';
import { roomClient, useRoom } from './roomClient.ts';
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
 * `/r/<code>`: the host's lobby. The room lives in the room client, so a reload finds it again through the socket
 * (game-service answers the private subscription with `ROOM_JOINED` while she is still in it); no room means the Rooms tab.
 * Joining someone else's room by link arrives with Story 5.3.
 */
function LobbyRoute({ code }: { code: string }) {
  const { t } = useTranslation();
  const room = useRoom((s) => s.session);
  const phase = useRoom((s) => s.phase);
  const had = useRef(false);
  const tried = useRef(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (room) had.current = true;
  }, [room]);
  const mine = room !== null && formatCode(room.code) === formatCode(code);
  useEffect(() => {
    if (room) return;
    if (had.current) {
      // The room ended (leave, expiry, closed): back to the Rooms tab, whose notice says why.
      navigate('/rooms', { replace: true });
      return;
    }
    // Once per mount: a failed resume sets the phase back to idle, which must not start another socket.
    if (phase === 'idle' && !tried.current) {
      tried.current = true;
      void roomClient()
        .resume()
        .then((found) => {
          if (!found && !useRoom.getState().session) setFailed(true);
        });
    }
  }, [room, phase]);
  // Not her own room (a shared link, until Story 5.3 joins): say so at once.
  if ((room && !mine) || failed) {
    return (
      <PageColumn className="py-4">
        <main className="flex flex-col items-start gap-3">
          <h1 tabIndex={-1} className="font-title text-title">
            {t('rooms.lobby.heading')}
          </h1>
          <p className="text-body">{t('rooms.joinLink.soon')}</p>
          <Link to="/rooms" className="hit-target inline-flex min-h-target-min items-center text-body font-semibold text-ink underline">
            {t('rooms.create.back')}
          </Link>
        </main>
      </PageColumn>
    );
  }
  if (!room) return <Pending text={t('rooms.lobby.connecting')} />;
  return <HostLobby session={room} />;
}

/**
 * The lazy chunk behind `/rooms/create` and `/r/<code>`. A guest is sent to the Sign-in prompt with this route as
 * `returnTo`; no room code is requested for a guest.
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

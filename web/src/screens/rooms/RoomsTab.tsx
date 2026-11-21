import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { session as authSession } from '../../auth/session.ts';
import { Button } from '../../design/Button.tsx';
import { PageColumn } from '../../design/PageColumn.tsx';
import { detectLanguage } from '../../i18n/Lang.tsx';
import { uiLanguage } from '../../i18n/index.ts';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { announce } from '../../shell/announce.ts';
import { Link } from '../../shell/Link.tsx';
import { navigate } from '../../shell/router.ts';
import { useOnline } from '../../shell/online.ts';
import { createPath } from './pickerReturn.ts';
import { loadRecentRooms, type RecentRoom } from './recentRooms.ts';
import { JoinError } from './RoomError.tsx';
import { formatCode, normalizeCode } from './roomCode.ts';
import { roomClient, useRoom, type RoomError, type RoomNotice } from './roomClient.ts';
import { shortDate } from './roomTime.ts';
import { findTopic, useCatalogue } from './useCatalogue.ts';
import './roomCatalogue.ts';

const NOTICE_KEY = {
  EXPIRED: 'rooms.notice.expired',
  DISCONNECTED: 'rooms.notice.disconnected',
  DRAINING: 'rooms.notice.draining',
  CLOSED: 'rooms.notice.closed',
  HOST_CLOSED: 'rooms.notice.hostClosed',
  LOST: 'rooms.notice.lost',
} as const satisfies Record<RoomNotice, string>;

function Chevron() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-none">
      <path d="M6 3l5 5-5 5" stroke="var(--color-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The one-line "that room expired" notice: announced politely once, shown until she leaves the tab. */
function Notice() {
  const { t } = useTranslation();
  const notice = useRoom((s) => s.notice);
  const host = useRoom((s) => s.noticeHost);
  // The host's name is inserted unchanged (never inflected).
  const text = notice ? t(NOTICE_KEY[notice], { host: host ?? '' }) : '';
  useEffect(() => {
    if (notice) announce(text);
    // Said once per notice, not again when the language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice]);
  useEffect(() => () => roomClient().dismissNotice(), []);
  return notice ? <p className="rounded-lg border border-hairline bg-card px-4 py-3 text-body text-ink">{text}</p> : null;
}

/**
 * Join with code (Story 5.3): a labelled field, Join and Enter-to-submit. A code that is not 6 alphabet characters is
 * refused here without asking the server; a server refusal shows under the field (`aria-describedby` +
 * `aria-invalid`), announced politely, and the typed code stays. A link's failed join arrives prefilled the same way.
 */
function JoinForm() {
  const { t } = useTranslation();
  const online = useOnline();
  const failure = useRoom((s) => s.joinFailure);
  const [typed, setTyped] = useState(failure?.typed ?? '');
  const [error, setError] = useState<RoomError | null>(failure?.error ?? null);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const fieldRef = useRef<HTMLInputElement>(null);
  const errorId = 'roomsJoinError';

  // A failed link join: shown once here, then forgotten by the client.
  useEffect(() => {
    if (failure) {
      setTyped(failure.typed);
      setError(failure.error);
      roomClient().clearJoinFailure();
    }
  }, [failure]);

  const submit = () => {
    if (inFlight.current) return; // "…": taps are ignored while the join is out
    const code = normalizeCode(typed);
    if (!code) {
      setError({ code: 'BAD_CODE' });
      return;
    }
    inFlight.current = true;
    setSending(true);
    setError(null);
    void roomClient()
      .join(code)
      .then((result) => {
        inFlight.current = false;
        setSending(false);
        if (result.ok) navigate(`/r/${formatCode(result.session.code)}`);
        else {
          setError(result.error);
          fieldRef.current?.focus();
        }
      });
  };

  return (
    <section aria-labelledby="roomsJoin" className="flex flex-col gap-2">
      <h2 id="roomsJoin" className="text-body font-semibold text-muted">
        {t('rooms.join.heading')}
      </h2>
      <form
        className="flex flex-col gap-2"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor="roomsJoinCode" className="text-caption text-muted">
          {t('rooms.join.label')}
        </label>
        <input
          id="roomsJoinCode"
          ref={fieldRef}
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          className={[
            'min-h-target-min w-full min-w-[0] rounded-md border-[1.5px] bg-card px-3 py-2 font-room-code text-body text-ink',
            error ? 'border-brick' : 'border-ink',
          ].join(' ')}
        />
        {error ? <JoinError id={errorId} error={error} typed={typed} /> : null}
        {!online ? (
          <Button variant="secondary" disabled disabledReason={t('rooms.offline')} className="w-full">
            {t('rooms.join.button')}
          </Button>
        ) : (
          <Button variant="secondary" type="submit" aria-busy={sending || undefined} className="w-full">
            {sending ? t('rooms.join.sending') : t('rooms.join.button')}
          </Button>
        )}
      </form>
    </section>
  );
}

/** A room she has open but is not looking at (she left for the topic picker): one row back into it. */
function OpenRoomRow() {
  const { t } = useTranslation();
  const open = useRoom((s) => s.session);
  if (!open) return null;
  const code = formatCode(open.code);
  return (
    <Link to={`/r/${code}`} className="hit-target flex min-h-[56px] items-center gap-3 rounded-lg border-[1.5px] border-ink bg-card px-4 py-2 text-body font-semibold text-ink">
      <span className="min-w-[0] flex-1">{t('rooms.active', { code })}</span>
      <Chevron />
    </Link>
  );
}

function RecentRow({ entry, name }: { entry: RecentRoom; name: string }) {
  const { t } = useTranslation();
  const sub = t('rooms.recent.sub', { questions: t('topics.questions', { count: entry.questionCount }), date: shortDate(entry.hostedAt, uiLanguage()) });
  return (
    <li className="border-b border-hairline last:border-b-0">
      <Link to={createPath(entry.source.topicId, entry.questionCount)} className="hit-target flex min-h-[56px] w-full min-w-[0] items-center gap-3 rounded-lg px-4 py-2">
        <span className="flex min-w-[0] flex-1 flex-col">
          <span lang={detectLanguage(name)} className="text-body font-semibold break-words text-ink">
            {name}
          </span>
          <span className="text-caption text-muted">{sub}</span>
        </span>
        <Chevron />
      </Link>
    </li>
  );
}

/**
 * The Rooms tab for a registered player (Story 5.2): Create room, Join with code (Story 5.3) and
 * up to 3 recently hosted rooms. A recent room whose topic is no longer in the catalogue is hidden.
 */
export default function RoomsTab() {
  const { t } = useTranslation();
  useDocumentTitle(t('tab.rooms'));
  const online = useOnline();
  const catalogue = useCatalogue();
  const userId = authSession.userId();
  const recent = userId ? loadRecentRooms(userId) : [];
  const rows = recent.flatMap((entry) => {
    const found = findTopic(catalogue.data, entry.source.topicId);
    return found ? [{ entry, name: found.topic.name }] : [];
  });

  return (
    <PageColumn className="py-4">
      <main className="flex flex-col gap-4">
        <h1 tabIndex={-1} className="font-title text-title">
          {t('tab.rooms')}
        </h1>
        <Notice />
        <OpenRoomRow />
        <Button className="w-full" onClick={() => navigate(createPath())}>
          {t('rooms.create')}
        </Button>

        <JoinForm />

        {rows.length > 0 ? (
          <section aria-labelledby="roomsRecent" className="flex flex-col gap-2">
            <h2 id="roomsRecent" className="text-body font-semibold text-muted">
              {t('rooms.recent.heading')}
            </h2>
            <ul className="rounded-lg border border-hairline bg-card">
              {rows.map(({ entry, name }) => (
                <RecentRow key={entry.source.topicId} entry={entry} name={name} />
              ))}
            </ul>
          </section>
        ) : null}
        {!online ? <p className="text-caption text-muted">{t('rooms.offline')}</p> : null}
      </main>
    </PageColumn>
  );
}

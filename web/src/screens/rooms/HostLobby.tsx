import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../design/Button.tsx';
import { PageColumn } from '../../design/PageColumn.tsx';
import { roomLink } from '../../config/publicOrigin.ts';
import { detectLanguage } from '../../i18n/Lang.tsx';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { announce } from '../../shell/announce.ts';
import { isPlainLeftClick, Link } from '../../shell/Link.tsx';
import { navigate, setNavigationGuard } from '../../shell/router.ts';
import { useOnline } from '../../shell/online.ts';
import { useHideTabBar } from '../../shell/useHideTabBar.ts';
import { CountStepper } from './CountStepper.tsx';
import { JoinedChips } from './JoinedChips.tsx';
import { pickerPath } from './pickerReturn.ts';
import { RoomError } from './RoomError.tsx';
import { clampCount, countLimits } from './roomConfig.ts';
import { formatCode, spellCode } from './roomCode.ts';
import { roomClient, useRoom, type RoomSession } from './roomClient.ts';
import { expiryLabel } from './roomTime.ts';
import { selectContents, copyText, shareRoom } from './share.ts';
import { findTopic, useCatalogue } from './useCatalogue.ts';
import './roomCatalogue.ts';

const COPIED_MS = 2000;
const TEXT_LINK = 'hit-target inline-flex min-h-target-min items-center text-body font-semibold text-ink underline';

/** Publishes the start bar's height as `--fixed-bar-height`, so the page pads past it (as the tab bar does elsewhere). */
function useFixedBarHeight(ref: React.RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--fixed-bar-height', `${bar.offsetHeight}px`);
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(bar);
    return () => {
      observer?.disconnect();
      root.style.removeProperty('--fixed-bar-height');
    };
  }, [ref]);
}

function CodeBlock({ session }: { session: RoomSession }) {
  const { t } = useTranslation();
  const online = useOnline();
  const code = formatCode(session.code);
  const codeRef = useRef<HTMLParagraphElement>(null);
  const [copied, setCopied] = useState<'share' | 'code' | null>(null);
  const [problem, setProblem] = useState<'copy' | 'share' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const { time, tomorrow } = expiryLabel(session.room.expiresAt);

  const flashCopied = (which: 'share' | 'code') => {
    setCopied(which);
    setProblem(null);
    announce(t('rooms.copied'));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), COPIED_MS);
  };

  const share = async () => {
    const outcome = await shareRoom({ title: t('rooms.share.title'), text: t('rooms.share.text', { code }), url: roomLink(code) });
    if (outcome === 'copied') flashCopied('share');
    else if (outcome === 'failed') setProblem('share');
  };

  const copyCode = async () => {
    if (await copyText(code)) {
      flashCopied('code');
    } else {
      // The clipboard refused: the code is selected so she can copy it by hand.
      selectContents(codeRef.current);
      setProblem('copy');
    }
  };

  return (
    <section aria-label={t('rooms.code.label')} className="flex flex-col gap-2 rounded-xl border border-hairline bg-card p-4">
      <p className="text-caption text-muted">{t('rooms.code.label')}</p>
      <p ref={codeRef} aria-hidden="true" className="font-room-code text-room-code-compact whitespace-nowrap text-ink min-[22.5rem]:text-room-code">
        {code}
      </p>
      <p className="sr-only">{t('rooms.code.a11y', { spelled: spellCode(code) })}</p>
      <p className="text-caption text-muted">{t(tomorrow ? 'rooms.expires.tomorrow' : 'rooms.expires.today', { time })}</p>
      {online ? (
        <Button className="w-full" onClick={() => void share()}>
          {t('rooms.share')}
        </Button>
      ) : (
        <Button className="w-full" disabled disabledReason={t('rooms.offline')}>
          {t('rooms.share')}
        </Button>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void copyCode()} className={TEXT_LINK}>
          {t('rooms.copyCode')}
        </button>
        {copied ? <span className="text-caption font-semibold text-muted">{t('rooms.copied')}</span> : null}
      </div>
      {problem === 'copy' ? <p className="text-caption text-muted">{t('rooms.copyFailed')}</p> : null}
      {problem === 'share' ? <p className="text-caption text-muted">{t('rooms.shareFailed')}</p> : null}
    </section>
  );
}

function ConfigCard({ session, leaveForPicker }: { session: RoomSession; leaveForPicker: () => void }) {
  const { t } = useTranslation();
  const catalogue = useCatalogue();
  const configuring = useRoom((s) => s.configuring);
  const error = useRoom((s) => s.error);
  const isHost = session.role === 'HOST';
  const found = findTopic(catalogue.data, session.room.source.topicId);
  const limits = countLimits(found?.topic.publishedCount);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.room.questionCount);
  const countLabel = 'lobbyCountLabel';
  const wasConfiguring = useRef(false);

  // The edit closes when the server's update comes back (not on an error, which stays inline with the stepper open).
  useEffect(() => {
    if (wasConfiguring.current && !configuring && !error) setEditing(false);
    wasConfiguring.current = configuring;
  }, [configuring, error]);

  return (
    <section aria-label={t('rooms.config.label')} className="flex flex-col gap-3 rounded-lg border border-hairline bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-[0] flex-1 flex-col">
          <p className="text-caption text-muted">{t('rooms.source.label')}</p>
          {found ? (
            <>
              <p lang={detectLanguage(found.topic.name)} className="text-body font-semibold break-words text-ink">
                {found.topic.name}
              </p>
              <p lang={detectLanguage(found.subject.name)} className="text-caption break-words text-muted">
                {found.subject.name}
              </p>
            </>
          ) : (
            <p className="text-body font-semibold text-ink">{t('rooms.source.generic')}</p>
          )}
        </div>
        {isHost ? (
          <Link to={pickerPath({ roomId: session.roomId, count: session.room.questionCount })} onClick={(event) => {
              if (isPlainLeftClick(event)) leaveForPicker();
            }} aria-label={t('rooms.edit.source')} className={TEXT_LINK}>
            {t('rooms.edit')}
          </Link>
        ) : null}
      </div>

      <div className="flex items-start gap-3">
        <div className="flex min-w-[0] flex-1 flex-col gap-2">
          <p id={countLabel} className="text-caption text-muted">
            {t('rooms.count.label')}
          </p>
          {editing ? (
            <>
              <CountStepper value={clampCount(draft, limits)} limits={limits} onChange={setDraft} labelledBy={countLabel} />
              <div className="flex flex-wrap items-center gap-3">
                {configuring ? (
                  <Button disabled disabledReason={t('rooms.count.saving')}>
                    {t('rooms.count.save')}
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      const next = clampCount(draft, limits);
                      if (next === session.room.questionCount) setEditing(false);
                      else roomClient().configure({ questionCount: next });
                    }}
                  >
                    {t('rooms.count.save')}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => {
                    roomClient().clearError();
                    setEditing(false);
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-body font-semibold text-ink">{t('topics.questions', { count: session.room.questionCount })}</p>
          )}
        </div>
        {isHost && !editing ? (
          <button
            type="button"
            aria-label={t('rooms.edit.count')}
            onClick={() => {
              setDraft(session.room.questionCount);
              roomClient().clearError();
              setEditing(true);
            }}
            className={TEXT_LINK}
          >
            {t('rooms.edit')}
          </button>
        ) : null}
      </div>
      {error ? <RoomError error={error} scope="configure" returnTo="/rooms" /> : null}
    </section>
  );
}

/**
 * The host's close confirm (Story 5.3), only when others are in the lobby: `role="alertdialog"`, "Stay" focused, a brick
 * "Close room" text button; Esc (and Android back, through the lobby's guard) means Stay.
 */
function CloseRoomDialog({ onStay, onClose }: { onStay: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  const stayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stayRef.current?.querySelector('button')?.focus();
  }, []);
  return (
    <div className="fixed inset-[0] z-20 flex items-center justify-center bg-ink/40 px-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-[24rem] flex-col gap-4 rounded-lg border border-hairline bg-card p-4"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onStay();
          }
        }}
      >
        <h2 id={titleId} className="font-body text-body text-ink">
          {t('rooms.close.title')}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <div ref={stayRef}>
            <Button onClick={onStay}>{t('rooms.close.stay')}</Button>
          </div>
          <Button variant="danger-text" onClick={onClose}>
            {t('rooms.close.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The host's fixed start bar: disabled below 2 humans, enabled at 2 or more (the start itself is Story 5.4's). */
function StartBar({ session, barRef }: { session: RoomSession; barRef: React.RefObject<HTMLDivElement | null> }) {
  const { t } = useTranslation();
  const starting = useRoom((s) => s.starting);
  const startError = useRoom((s) => s.startError);
  const count = session.room.humanCount;
  const label = <span className="tabular-nums">{t('rooms.start.label', { count })}</span>;
  let caption: string | null = null;
  if (startError) caption = startError.code === 'NOT_AVAILABLE_YET' ? t('rooms.start.soon') : t('rooms.start.failed');
  useEffect(() => {
    if (caption) announce(caption);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startError]);
  return (
    <div ref={barRef} className="fixed inset-x-[0] bottom-[0] z-10 border-t border-hairline bg-card pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-1 px-gutter-card py-3">
        {count < 2 ? (
          <Button className="w-full" disabled disabledReason={t('rooms.start.waiting')}>
            {label}
          </Button>
        ) : starting ? (
          <Button className="w-full" disabled disabledReason={t('rooms.start.sending')}>
            {label}
          </Button>
        ) : (
          <Button className="w-full" onClick={() => roomClient().start()}>
            {label}
          </Button>
        )}
        {caption ? <p className="text-caption text-muted">{caption}</p> : null}
        <p className="text-caption text-muted">{t('rooms.start.leaveCloses')}</p>
      </div>
    </div>
  );
}

/**
 * The lobby at `/r/<code>` (Stories 5.2 and 5.3), for the host and for a player: top bar, the code block with Share and
 * copy (any player may re-share), the config card (Edit links for the host only), the joined chips, then the host's
 * fixed start bar or, for a player, "Waiting for <host> to start". No tab bar, no volt and no flash.
 *
 * Leaving (the button, or Android back / browser Back) sends leave and returns to the Rooms tab, with no confirm for a
 * player or a host alone; a host with others in the lobby confirms first. Going to the topic picker on purpose is the
 * one move that keeps the room.
 */
export default function Lobby({ session }: { session: RoomSession }) {
  const { t } = useTranslation();
  const code = formatCode(session.code);
  useDocumentTitle(t('rooms.lobby.title', { code }));
  useHideTabBar();
  const reconnecting = useRoom((s) => s.reconnecting);
  const isHost = session.role === 'HOST';
  const barRef = useRef<HTMLDivElement>(null);
  useFixedBarHeight(barRef);
  const [confirming, setConfirming] = useState(false);
  const needsConfirm = isHost && session.room.humanCount > 1;
  const needsConfirmRef = useRef(needsConfirm);
  needsConfirmRef.current = needsConfirm;
  const confirmingRef = useRef(false);
  confirmingRef.current = confirming;

  const keepRoom = useRef(false);
  // Shown (again): the room is hers to leave once more, whatever an earlier Edit click set.
  useEffect(() => {
    keepRoom.current = false;
  }, []);
  const leaveNow = () => {
    keepRoom.current = true;
    setConfirming(false);
    roomClient().leave();
    navigate('/rooms', { replace: true });
  };
  const leave = () => {
    if (needsConfirmRef.current) setConfirming(true);
    else leaveNow();
  };
  useEffect(
    () =>
      setNavigationGuard(() => {
        if (keepRoom.current) return false;
        if (confirmingRef.current) {
          // Android back on the open confirm: Stay.
          setConfirming(false);
          return true;
        }
        if (needsConfirmRef.current) {
          setConfirming(true);
          return true;
        }
        keepRoom.current = true;
        roomClient().leave();
        // After the guard's caller has restored the location, so the Rooms tab replaces the lobby entry.
        setTimeout(() => navigate('/rooms', { replace: true }), 0);
        return true;
      }),
    [],
  );

  const hostName = session.room.participants.find((p) => p.participantId === session.room.hostParticipantId)?.displayName;

  return (
    <PageColumn className="py-4">
      <main className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button variant="danger-text" onClick={leave}>
            {t('rooms.lobby.leave')}
          </Button>
          <h1 tabIndex={-1} className="min-w-[0] flex-1 text-center font-title text-title">
            {t('rooms.lobby.heading')}
          </h1>
          {isHost ? <span className="rounded-full border-[1.5px] border-ink px-3 py-1 text-caption font-semibold text-ink">{t('rooms.lobby.host')}</span> : null}
        </div>
        {reconnecting ? <p className="text-caption text-muted">{t('rooms.lobby.reconnecting')}</p> : null}

        <CodeBlock session={session} />
        <ConfigCard
          session={session}
          leaveForPicker={() => {
            keepRoom.current = true;
          }}
        />

        <JoinedChips session={session} />

        {!isHost && hostName ? (
          <p className="text-body text-muted">
            {t('rooms.lobby.waitingFor', { host: hostName })}
          </p>
        ) : null}
      </main>

      {isHost ? <StartBar session={session} barRef={barRef} /> : null}
      {confirming ? <CloseRoomDialog onStay={() => setConfirming(false)} onClose={leaveNow} /> : null}
    </PageColumn>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from '../../design/tokens.ts';
import { detectLanguage } from '../../i18n/Lang.tsx';
import { useReducedEffects } from '../../motion/reduceEffects.ts';
import { announce } from '../../shell/announce.ts';
import { useRoom, type RoomSession } from './roomClient.ts';
import './roomCatalogue.ts';

/** At most this many chips show before the dashed "+N" chip. */
export const VISIBLE_CHIPS = 24;
/** Joins within this window, this many or more, fade in together as one batch. */
export const BATCH_WINDOW_MS = 1000;
export const BATCH_SIZE = 5;
/** At most one polite membership announcement per this. */
export const ANNOUNCE_EVERY_MS = 5000;

type Fresh = { batch: boolean };

/**
 * The joiners of the last few seconds (Story 5.3): each carries the outline and the "ഇപ്പോൾ" label for chip-new-label
 * (3 s), and enters with chip-pop, or as part of a batch fade when 5 or more joined within a second. Fed by every
 * applied lobby broadcast (a store subscription, so no update is lost to render batching).
 */
function useFreshJoiners(): Map<string, Fresh> {
  const [fresh, setFresh] = useState<Map<string, Fresh>>(() => new Map());
  const arrivals = useRef<number[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    const unsubscribe = useRoom.subscribe((state, previous) => {
      const event = state.lobbyEvent;
      if (!event || event === previous.lobbyEvent) return;
      const self = state.session?.selfParticipantId;
      const ids = event.joined.filter((id) => id !== self);
      if (ids.length === 0) return;
      const now = Date.now();
      arrivals.current = [...arrivals.current.filter((at) => now - at < BATCH_WINDOW_MS), ...ids.map(() => now)];
      const batch = arrivals.current.length >= BATCH_SIZE;
      setFresh((current) => {
        const next = new Map(current);
        for (const id of ids) next.set(id, { batch });
        return next;
      });
      const timer = setTimeout(() => {
        pending.delete(timer);
        setFresh((current) => {
          const next = new Map(current);
          for (const id of ids) next.delete(id);
          return next;
        });
      }, motion.chipNewLabel);
      pending.add(timer);
    });
    return () => {
      unsubscribe();
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
    };
  }, []);
  return fresh;
}

/**
 * One polite announcement at most every 5 s summarising the joins and leaves since the last ("3 joined, 23 in room");
 * the chip list itself is never a live region. Her own join is not announced to her.
 */
function useMembershipAnnouncements(): void {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    let joined = 0;
    let left = 0;
    let lastAt = -Infinity;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const speak = () => {
      timer = undefined;
      if (joined === 0 && left === 0) return;
      const total = useRoom.getState().session?.room.humanCount ?? 0;
      const say = tRef.current;
      if (joined > 0 && left > 0) announce(say('rooms.announce.both', { joined, left, total }));
      else if (joined > 0) announce(say('rooms.announce.joined', { n: joined, total }));
      else announce(say('rooms.announce.left', { n: left, total }));
      joined = 0;
      left = 0;
      lastAt = Date.now();
    };
    const unsubscribe = useRoom.subscribe((state, previous) => {
      const event = state.lobbyEvent;
      if (!event || event === previous.lobbyEvent) return;
      const self = state.session?.selfParticipantId;
      joined += event.joined.filter((id) => id !== self).length;
      left += event.left.filter((id) => id !== self).length;
      if (joined === 0 && left === 0) return;
      const wait = lastAt + ANNOUNCE_EVERY_MS - Date.now();
      if (wait <= 0) speak();
      else timer ??= setTimeout(speak, wait);
    });
    return () => {
      unsubscribe();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);
}

/**
 * The lobby's joined section (Story 5.3): "N joined" (the number swaps, never counts up), then the chips newest first,
 * the player's own as the ink "നിങ്ങൾ" chip. A leaver's chip disappears without animation. At most 24 chips, then a
 * dashed "+N പേർ" chip that shows the rest. Each name carries `lang` by its script and is shown unchanged.
 */
export function JoinedChips({ session }: { session: RoomSession }) {
  const { t } = useTranslation();
  const reduced = useReducedEffects();
  const fresh = useFreshJoiners();
  useMembershipAnnouncements();
  const [expanded, setExpanded] = useState(false);
  const humans = session.room.participants.filter((p) => p.kind !== 'BOT');
  const newestFirst = [...humans].reverse();
  const shown = expanded ? newestFirst : newestFirst.slice(0, VISIBLE_CHIPS);
  const hidden = newestFirst.length - shown.length;

  return (
    <section aria-labelledby="lobbyJoined" className="flex flex-col gap-2">
      <h2 id="lobbyJoined" className="text-body font-semibold text-muted tabular-nums">
        {t('rooms.joined.count', { n: session.room.humanCount })}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {shown.map((p) => {
          const self = p.participantId === session.selfParticipantId;
          const isNew = fresh.get(p.participantId);
          const entrance = isNew ? (reduced ? 'chip-reduced-fade' : isNew.batch ? 'chip-batch-fade' : 'chip-pop') : '';
          const look = self
            ? 'bg-band text-on-band'
            : isNew
              ? 'border-[1.5px] border-ink bg-card text-ink'
              : 'border border-hairline bg-card text-ink';
          return (
            <li
              key={p.participantId}
              data-testid="joined-chip"
              data-entrance={entrance || undefined}
              className={['flex min-w-[0] max-w-full flex-wrap items-baseline gap-x-2 rounded-2xl px-3 py-1 text-body', look, entrance].join(' ')}
            >
              {self ? (
                <span>{t('rooms.you')}</span>
              ) : (
                <span lang={detectLanguage(p.displayName)} className="min-w-[0] break-words">
                  {p.displayName}
                </span>
              )}
              {isNew && !self ? <span className="text-caption font-semibold text-muted">{t('rooms.chip.new')}</span> : null}
            </li>
          );
        })}
        {hidden > 0 ? (
          <li>
            <button
              type="button"
              aria-expanded="false"
              onClick={() => setExpanded(true)}
              className="hit-target inline-flex min-h-target-min items-center rounded-2xl border border-dashed border-ink bg-card px-3 py-1 text-body font-semibold text-ink tabular-nums"
            >
              {t('rooms.chip.more', { n: hidden })}
            </button>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

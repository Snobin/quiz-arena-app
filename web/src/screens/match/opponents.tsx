import { BotBadge } from '../../design/BotBadge.tsx';
import { Lang } from '../../i18n/Lang.tsx';
import type { MatchFoundPayload, Participant } from '../../realtime/protocol.ts';

/** Everyone in the match but the receiver. */
export function opponentsOf(match: MatchFoundPayload): Participant[] {
  return match.participants.filter((p) => p.participantId !== match.selfParticipantId);
}

/** Opponent names, never inflected, each with the BOT badge when it is a bot. */
export function OpponentNames({ match }: { match: MatchFoundPayload }) {
  return (
    <>
      {opponentsOf(match).map((p) => (
        <span key={p.participantId} className="inline-flex items-center gap-2">
          {/* Spaces keep the words apart in the accessible text; the flex gap does it visually. */}
          <Lang>{p.displayName}</Lang> {p.kind === 'BOT' ? <BotBadge /> : null}
        </span>
      ))}
    </>
  );
}

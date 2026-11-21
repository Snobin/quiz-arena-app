package in.minnal.game.matchmaking.application;

import in.minnal.contracts.internal.QuestionSetResponse;
import in.minnal.game.match.application.MatchCompletedForRematch;
import java.util.UUID;

/** Everything the rematch coordinator reacts to (Story 1.10); each is processed on its thread. */
sealed interface RematchEvent {

    /** A completed QUICK match ended: its window opens. */
    record Opened(MatchCompletedForRematch ended) implements RematchEvent {
    }

    /** {@code sub} asks for a rematch of {@code matchIdText} (as sent; may not parse). */
    record Request(String sub, boolean guest, String sessionId, String matchIdText) implements RematchEvent {
    }

    /** {@code sub} withdraws her pending request. */
    record Cancel(String sub, String matchIdText) implements RematchEvent {
    }

    /** {@code sub}'s request number {@code token} reached its deadline (stale when she re-sent since). */
    record Deadline(UUID matchId, String sub, long token) implements RematchEvent {
    }

    /**
     * The window's idle period number {@code token} (60 s with nothing pending, from the match end
     * or from the last expiry or withdrawal) ran out: it closes, unless a request came since.
     */
    record WindowOver(UUID matchId, long token) implements RematchEvent {
    }

    /** {@code sub} can no longer rematch: her last session closed, or she joined matchmaking. */
    record OptedOut(String sub) implements RematchEvent {
    }

    /** The question-set fetch number {@code token} of the window {@code matchId} finished. */
    record SetFetched(UUID matchId, long token, QuestionSetResponse set, Throwable failure) implements RematchEvent {
    }
}

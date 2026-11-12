package in.minnal.game.match.application;

import java.time.Instant;
import java.util.UUID;

/** Everything a match actor reacts to (AD-4); each is processed on the actor's own thread, in order. */
public sealed interface MatchEvent {

    /** The match was created: arm the lead-in before Q1. */
    record Begin() implements MatchEvent {
    }

    /**
     * An answer, human or bot, stamped with the server instant it arrived.
     *
     * @param questionIndex as the client sent it (null when absent)
     * @param optionIndex   as the client sent it (null when absent)
     * @param replyTo       where the receipt or error goes; null for a bot (nobody to tell)
     */
    record Answer(UUID participantId, Integer questionIndex, Integer optionIndex, Instant receivedAt, ReplyTo replyTo)
            implements MatchEvent {
    }

    /** The private-reply address of a human answer. */
    record ReplyTo(String sub, String sessionId) {
    }

    /** Timer: question {@code index}'s window (plus the close grace) is over. */
    record CloseWindow(int index, Instant dueAt) implements MatchEvent {
    }

    /** Timer: open question {@code index} (after the lead-in or a reveal hold). */
    record NextQuestion(int index, Instant dueAt) implements MatchEvent {
    }

    /** Timer: a bot's answer to question {@code index}, fired at {@code firedAt}; handled as an ordinary {@link Answer}. */
    record BotAnswer(UUID participantId, int index, int optionIndex, Instant firedAt) implements MatchEvent {
    }

    /** The player's last session closed. */
    record Disconnect(String sub) implements MatchEvent {
    }

    /** A new session of {@code sub} opened while she is in the match: she is connected again (cancels the grace). */
    record Reconnected(String sub) implements MatchEvent {
    }

    /** Timer: {@code sub}'s reconnect grace ran out; stale unless {@code epoch} is her current grace epoch. */
    record GraceExpired(String sub, long epoch) implements MatchEvent {
    }

    /** She left on purpose: forfeit at once. */
    record Leave(String sub) implements MatchEvent {
    }

    /** She asks for a {@code SNAPSHOT}, sent to that one session (after a reconnect or a {@code seq} gap). */
    record Resync(String sub, String sessionId) implements MatchEvent {
    }
}

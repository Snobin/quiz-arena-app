package in.minnal.contracts.realtime;

import java.time.Instant;
import java.util.UUID;

/**
 * The envelope of every frame game-service sends (AD-10):
 * {@code {type, matchId?, roomId?, seq?, refSeq?, serverTime, payload?}}.
 *
 * @param type       what the payload is
 * @param matchId    the match the message is about, when there is one
 * @param roomId     the Battle Room the message is about, when there is one
 * @param seq        broadcasts only: 1, 2, 3… per topic
 * @param refSeq     private messages only: the last broadcast {@code seq} they reflect
 * @param serverTime when the server sent it (the client derives its clock offset from it)
 * @param payload    the type's payload record, or null when the type has none
 * @param <P>        the payload type
 */
public record ServerMessage<P>(
        MessageType type, UUID matchId, UUID roomId, Long seq, Long refSeq, Instant serverTime, P payload) {

    /** A private message with no match, room or sequence fields. */
    public static <P> ServerMessage<P> direct(MessageType type, Instant serverTime, P payload) {
        return new ServerMessage<>(type, null, null, null, null, serverTime, payload);
    }

    /** A private message about one match. */
    public static <P> ServerMessage<P> aboutMatch(MessageType type, UUID matchId, Instant serverTime, P payload) {
        return new ServerMessage<>(type, matchId, null, null, null, serverTime, payload);
    }

    /** A private {@code ERROR}; the envelope carries the payload's {@code matchId} too. */
    public static ServerMessage<ErrorPayload> error(ErrorCode code, UUID matchId, Instant serverTime) {
        return new ServerMessage<>(MessageType.ERROR, matchId, null, null, null, serverTime, new ErrorPayload(code, matchId));
    }
}

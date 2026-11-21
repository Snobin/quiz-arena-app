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

    /** A broadcast on a match topic: numbered by the match's {@code seq} (1, 2, 3…). */
    public static <P> ServerMessage<P> broadcast(MessageType type, UUID matchId, long seq, Instant serverTime, P payload) {
        return new ServerMessage<>(type, matchId, null, seq, null, serverTime, payload);
    }

    /** A private reply about a match: {@code refSeq} is the last broadcast {@code seq} it reflects. */
    public static <P> ServerMessage<P> reply(MessageType type, UUID matchId, long refSeq, Instant serverTime, P payload) {
        return new ServerMessage<>(type, matchId, null, null, refSeq, serverTime, payload);
    }

    /** A private message about one room, with the last lobby {@code seq} it reflects. */
    public static <P> ServerMessage<P> roomReply(MessageType type, UUID roomId, long refSeq, Instant serverTime, P payload) {
        return new ServerMessage<>(type, null, roomId, null, refSeq, serverTime, payload);
    }

    /** A private message about one room that reflects no lobby {@code seq}. */
    public static <P> ServerMessage<P> aboutRoom(MessageType type, UUID roomId, Instant serverTime, P payload) {
        return new ServerMessage<>(type, null, roomId, null, null, serverTime, payload);
    }

    /** A broadcast on a room topic: numbered by the room's {@code seq} (1, 2, 3…). */
    public static <P> ServerMessage<P> roomBroadcast(MessageType type, UUID roomId, long seq, Instant serverTime, P payload) {
        return new ServerMessage<>(type, null, roomId, seq, null, serverTime, payload);
    }

    /** A private {@code ERROR} about a room; the envelope carries the payload's {@code roomId} too. */
    public static ServerMessage<ErrorPayload> roomError(ErrorCode code, UUID roomId, Instant serverTime) {
        return error(code, null, roomId, null, serverTime);
    }

    /** A private {@code ERROR} about a match and/or a room (null when none); the envelope carries both ids. */
    public static ServerMessage<ErrorPayload> error(ErrorCode code, UUID matchId, UUID roomId, Long refSeq, Instant serverTime) {
        return new ServerMessage<>(MessageType.ERROR, matchId, roomId, null, refSeq, serverTime, new ErrorPayload(code, matchId, roomId));
    }

    /** A private {@code ERROR}; the envelope carries the payload's {@code matchId} too. */
    public static ServerMessage<ErrorPayload> error(ErrorCode code, UUID matchId, Instant serverTime) {
        return error(code, matchId, null, serverTime);
    }

    /** A private {@code ERROR} about a match, with the last broadcast {@code seq} it reflects (or null). */
    public static ServerMessage<ErrorPayload> error(ErrorCode code, UUID matchId, Long refSeq, Instant serverTime) {
        return error(code, matchId, null, refSeq, serverTime);
    }
}

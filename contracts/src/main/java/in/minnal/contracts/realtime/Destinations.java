package in.minnal.contracts.realtime;

import java.util.UUID;

/**
 * STOMP destinations (AD-10). Clients send to {@code /app/...}; game-service broadcasts on
 * {@code /topic/...} and sends private messages to {@code /user/queue/game} (each session
 * subscribes to that path; the server addresses it by the player's {@code sub}).
 */
public final class Destinations {

    /** The WebSocket endpoint (native WebSocket, no SockJS). */
    public static final String ENDPOINT = "/ws";

    /** Prefix of every client send. */
    public static final String APP_PREFIX = "/app";
    /** Prefix of user destinations. */
    public static final String USER_PREFIX = "/user";
    /** Prefix of broadcast topics. */
    public static final String TOPIC_PREFIX = "/topic";
    /** Prefix of queues. */
    public static final String QUEUE_PREFIX = "/queue";

    /** The private queue as the server addresses it (with a user name). */
    public static final String PRIVATE_QUEUE = "/queue/game";
    /** The private queue as a client subscribes to it. */
    public static final String USER_PRIVATE_QUEUE = USER_PREFIX + PRIVATE_QUEUE;

    /** {@code /topic/match/{matchId}}. */
    public static final String MATCH_TOPIC = "/topic/match/{matchId}";
    /** {@code /topic/room/{roomId}}. */
    public static final String ROOM_TOPIC = "/topic/room/{roomId}";

    /** Client sends, relative to {@link #APP_PREFIX} (as {@code @MessageMapping} paths). */
    public static final String MATCHMAKING_JOIN = "/matchmaking/{mode}/join";
    public static final String MATCHMAKING_CANCEL = "/matchmaking/{mode}/cancel";
    public static final String MATCH_ANSWER = "/match/{matchId}/answer";
    public static final String MATCH_REMATCH = "/match/{matchId}/rematch";
    public static final String MATCH_REMATCH_CANCEL = "/match/{matchId}/rematch/cancel";
    public static final String MATCH_RESYNC = "/match/{matchId}/resync";
    public static final String MATCH_LEAVE = "/match/{matchId}/leave";
    public static final String ROOM_CREATE = "/room/create";
    public static final String ROOM_JOIN = "/room/join";
    public static final String ROOM_CONFIGURE = "/room/{roomId}/configure";
    public static final String ROOM_START = "/room/{roomId}/start";
    public static final String ROOM_LEAVE = "/room/{roomId}/leave";
    public static final String ROOM_PLAY_AGAIN = "/room/{roomId}/playAgain";
    /** A member's lobby {@code resync} (a {@code seq} gap): answered with a fresh private {@code ROOM_JOINED} (Story 5.3). */
    public static final String ROOM_RESYNC = "/room/{roomId}/resync";

    private Destinations() {
    }

    public static String matchTopic(UUID matchId) {
        return MATCH_TOPIC.replace("{matchId}", matchId.toString());
    }

    public static String roomTopic(UUID roomId) {
        return ROOM_TOPIC.replace("{roomId}", roomId.toString());
    }

    /** The full client send asking for a rematch of the ended {@code matchId}. */
    public static String matchRematch(UUID matchId) {
        return APP_PREFIX + MATCH_REMATCH.replace("{matchId}", matchId.toString());
    }

    /** The full client send withdrawing a pending rematch request for {@code matchId}. */
    public static String matchRematchCancel(UUID matchId) {
        return APP_PREFIX + MATCH_REMATCH_CANCEL.replace("{matchId}", matchId.toString());
    }

    /** The full client send for joining {@code mode}, e.g. {@code /app/matchmaking/QUICK/join}. */
    public static String matchmakingJoin(MatchMode mode) {
        return APP_PREFIX + MATCHMAKING_JOIN.replace("{mode}", mode.name());
    }

    /** The full client send for cancelling {@code mode}, e.g. {@code /app/matchmaking/QUICK/cancel}. */
    public static String matchmakingCancel(MatchMode mode) {
        return APP_PREFIX + MATCHMAKING_CANCEL.replace("{mode}", mode.name());
    }
}

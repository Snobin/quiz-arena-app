package in.minnal.game.platform.session;

import in.minnal.contracts.realtime.ServerMessage;

/** Private messages to players on {@code /user/queue/game} (AD-10). */
public interface PlayerChannel {

    /** To every open session of {@code sub}. */
    void toPlayer(String sub, ServerMessage<?> message);

    /** To one session of {@code sub} only (replies to that session's own request). */
    void toSession(String sub, String sessionId, ServerMessage<?> message);
}

package in.minnal.game.platform.session;

import in.minnal.contracts.realtime.ServerMessage;
import java.util.UUID;

/** Broadcasts on {@code /topic/match/{matchId}} (AD-10), which only the match's humans may subscribe to. */
public interface MatchBroadcaster {

    void broadcast(UUID matchId, ServerMessage<?> message);
}

package in.minnal.game.platform.infrastructure.ws;

import in.minnal.contracts.realtime.Destinations;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.platform.session.MatchBroadcaster;
import java.util.UUID;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/** Match broadcasts through the simple broker on {@code /topic/match/{matchId}}. */
@Component
class StompMatchBroadcaster implements MatchBroadcaster {

    private final SimpMessagingTemplate template;

    StompMatchBroadcaster(SimpMessagingTemplate template) {
        this.template = template;
    }

    @Override
    public void broadcast(UUID matchId, ServerMessage<?> message) {
        template.convertAndSend(Destinations.matchTopic(matchId), message);
    }
}

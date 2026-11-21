package in.minnal.game.platform.infrastructure.ws;

import in.minnal.contracts.realtime.Destinations;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.platform.session.RoomBroadcaster;
import java.util.UUID;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/** Room broadcasts through the simple broker on {@code /topic/room/{roomId}}. */
@Component
class StompRoomBroadcaster implements RoomBroadcaster {

    private final SimpMessagingTemplate template;

    StompRoomBroadcaster(SimpMessagingTemplate template) {
        this.template = template;
    }

    @Override
    public void broadcast(UUID roomId, ServerMessage<?> message) {
        template.convertAndSend(Destinations.roomTopic(roomId), message);
    }
}

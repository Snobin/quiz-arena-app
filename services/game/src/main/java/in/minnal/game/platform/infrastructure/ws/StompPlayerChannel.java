package in.minnal.game.platform.infrastructure.ws;

import in.minnal.contracts.realtime.Destinations;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.platform.session.PlayerChannel;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/** Private sends on {@code /user/queue/game}, addressed by {@code sub} (the STOMP principal name). */
@Component
class StompPlayerChannel implements PlayerChannel {

    private final SimpMessagingTemplate template;

    StompPlayerChannel(SimpMessagingTemplate template) {
        this.template = template;
    }

    @Override
    public void toPlayer(String sub, ServerMessage<?> message) {
        template.convertAndSendToUser(sub, Destinations.PRIVATE_QUEUE, message);
    }

    @Override
    public void toSession(String sub, String sessionId, ServerMessage<?> message) {
        // A session id header narrows the user destination to that one session.
        SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        headers.setSessionId(sessionId);
        headers.setLeaveMutable(true);
        template.convertAndSendToUser(sub, Destinations.PRIVATE_QUEUE, message, headers.getMessageHeaders());
    }
}

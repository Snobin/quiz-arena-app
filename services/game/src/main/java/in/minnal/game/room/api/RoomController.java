package in.minnal.game.room.api;

import in.minnal.game.platform.infrastructure.security.MinnalAuthentication;
import in.minnal.game.platform.infrastructure.security.MinnalPrincipal;
import in.minnal.game.room.application.RoomService;
import in.minnal.game.room.domain.RoomConfigInput;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import org.springframework.messaging.Message;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@code /app/room/create|join} and {@code /app/room/{roomId}/configure|start|leave|playAgain} (AD-10). Identity comes
 * only from the CONNECT token. A config body is read leniently into a {@link RoomConfigInput}: a malformed, non-object
 * or absent body, or a field of the wrong type, reads as that field not being sent or invalid, and the room's rules
 * answer with the matching {@code ERROR}.
 */
@Controller
class RoomController {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final RoomService rooms;

    RoomController(RoomService rooms) {
        this.rooms = rooms;
    }

    @MessageMapping("/room/create")
    void create(Message<?> message, Principal user, SimpMessageHeaderAccessor headers) {
        rooms.create(principal(user), headers.getSessionId(), configOf(message.getPayload()));
    }

    @MessageMapping("/room/join")
    void join(Principal user, SimpMessageHeaderAccessor headers) {
        rooms.join(principal(user), headers.getSessionId());
    }

    @MessageMapping("/room/{roomId}/configure")
    void configure(@DestinationVariable String roomId, Message<?> message, Principal user,
            SimpMessageHeaderAccessor headers) {
        rooms.configure(principal(user), headers.getSessionId(), roomId, configOf(message.getPayload()));
    }

    @MessageMapping("/room/{roomId}/start")
    void start(@DestinationVariable String roomId, Principal user, SimpMessageHeaderAccessor headers) {
        rooms.start(principal(user), headers.getSessionId(), roomId);
    }

    @MessageMapping("/room/{roomId}/leave")
    void leave(@DestinationVariable String roomId, Principal user, SimpMessageHeaderAccessor headers) {
        rooms.leave(principal(user), headers.getSessionId(), roomId);
    }

    @MessageMapping("/room/{roomId}/playAgain")
    void playAgain(@DestinationVariable String roomId, Principal user, SimpMessageHeaderAccessor headers) {
        rooms.playAgain(principal(user), headers.getSessionId(), roomId);
    }

    static RoomConfigInput configOf(Object payload) {
        JsonNode body;
        try {
            byte[] bytes = payload instanceof byte[] raw ? raw : String.valueOf(payload).getBytes(StandardCharsets.UTF_8);
            body = JSON.readTree(bytes);
        } catch (RuntimeException e) {
            body = null;
        }
        if (body == null || !body.isObject()) {
            return new RoomConfigInput(false, null, null, false, null);
        }
        JsonNode source = body.get("source");
        JsonNode count = body.get("questionCount");
        boolean sourcePresent = source != null && !source.isNull();
        boolean countPresent = count != null && !count.isNull();
        String type = null;
        String topicId = null;
        if (sourcePresent && source.isObject()) {
            type = text(source.get("type"));
            topicId = text(source.get("topicId"));
        }
        Integer questionCount = countPresent && count.isIntegralNumber() && count.canConvertToInt() ? count.asInt() : null;
        return new RoomConfigInput(sourcePresent, type, topicId, countPresent, questionCount);
    }

    private static String text(JsonNode node) {
        return node != null && node.isString() ? node.asString() : null;
    }

    private static MinnalPrincipal principal(Principal user) {
        if (user instanceof MinnalAuthentication authentication) {
            return authentication.getPrincipal();
        }
        throw new IllegalStateException("unauthenticated STOMP message reached a handler");
    }
}

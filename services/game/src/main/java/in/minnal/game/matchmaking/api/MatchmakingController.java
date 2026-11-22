package in.minnal.game.matchmaking.api;

import in.minnal.game.matchmaking.application.MatchmakingService;
import in.minnal.game.platform.infrastructure.security.MinnalAuthentication;
import in.minnal.game.platform.infrastructure.security.MinnalPrincipal;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@code /app/matchmaking/{mode}/join|cancel} (AD-10). Identity comes only from the CONNECT token;
 * the join body is read only for a Topic Duel's {@code topicId}, so a client-sent rating has no effect.
 */
@Controller
class MatchmakingController {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final MatchmakingService matchmaking;

    MatchmakingController(MatchmakingService matchmaking) {
        this.matchmaking = matchmaking;
    }

    @MessageMapping("/matchmaking/{mode}/join")
    void join(@DestinationVariable String mode, Message<?> message, Principal user,
            SimpMessageHeaderAccessor headers) {
        matchmaking.join(principal(user), headers.getSessionId(), mode, topicIdOf(message.getPayload()),
                customSourceOf(message.getPayload()));
    }

    /**
     * The join body is read leniently: only Topic Duel reads {@code topicId}. A malformed, non-object or
     * absent body (or a non-text topicId) means no topicId, so a Quick join still works and a Topic Duel
     * join gets INVALID_TOPIC.
     */
    private static String topicIdOf(Object payload) {
        try {
            byte[] body = payload instanceof byte[] bytes ? bytes : String.valueOf(payload).getBytes(StandardCharsets.UTF_8);
            JsonNode topicId = JSON.readTree(body).get("topicId");
            return topicId != null && topicId.isString() ? topicId.asString() : null;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** True when the body carries a {@code source} naming {@code CUSTOM} or a {@code customTopicId} (Story 6.5a). */
    private static boolean customSourceOf(Object payload) {
        try {
            byte[] body = payload instanceof byte[] bytes ? bytes : String.valueOf(payload).getBytes(StandardCharsets.UTF_8);
            JsonNode root = JSON.readTree(body);
            JsonNode source = root.get("source");
            if (root.get("customTopicId") != null) {
                return true;
            }
            return source != null && source.isObject()
                    && ((source.get("type") != null && "CUSTOM".equals(source.get("type").asString())) || source.get("customTopicId") != null);
        } catch (RuntimeException e) {
            return false;
        }
    }

    @MessageMapping("/matchmaking/{mode}/cancel")
    void cancel(@DestinationVariable String mode, Principal user, SimpMessageHeaderAccessor headers) {
        matchmaking.cancel(principal(user), headers.getSessionId(), mode);
    }

    private static MinnalPrincipal principal(Principal user) {
        if (user instanceof MinnalAuthentication authentication) {
            return authentication.getPrincipal();
        }
        throw new IllegalStateException("unauthenticated STOMP message reached a handler");
    }
}

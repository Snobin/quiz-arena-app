package in.minnal.game.matchmaking.api;

import in.minnal.game.matchmaking.application.MatchmakingService;
import in.minnal.game.platform.infrastructure.security.MinnalAuthentication;
import in.minnal.game.platform.infrastructure.security.MinnalPrincipal;
import java.security.Principal;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

/**
 * {@code /app/matchmaking/{mode}/join|cancel} (AD-10). Identity comes only from the CONNECT token;
 * the frame body is never read, so a client-sent rating has no effect.
 */
@Controller
class MatchmakingController {

    private final MatchmakingService matchmaking;

    MatchmakingController(MatchmakingService matchmaking) {
        this.matchmaking = matchmaking;
    }

    @MessageMapping("/matchmaking/{mode}/join")
    void join(@DestinationVariable String mode, Principal user, SimpMessageHeaderAccessor headers) {
        matchmaking.join(principal(user), headers.getSessionId(), mode);
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

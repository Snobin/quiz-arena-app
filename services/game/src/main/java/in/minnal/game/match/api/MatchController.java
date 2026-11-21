package in.minnal.game.match.api;

import in.minnal.contracts.realtime.AnswerRequest;
import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.match.application.MatchRegistry;
import in.minnal.game.match.application.RematchRequests;
import in.minnal.game.platform.session.PlayerChannel;
import java.security.Principal;
import java.time.Clock;
import java.time.Instant;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.converter.MessageConversionException;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

/**
 * {@code /app/match/{matchId}/answer}, {@code /resync} and {@code /leave} (AD-10, Story 1.9), and
 * {@code /rematch} and {@code /rematch/cancel} (Story 1.10). The server receive instant is stamped first thing;
 * no client timestamp is ever read (AD-6). Identity comes only from the CONNECT token.
 */
@Controller
class MatchController {

    private final MatchRegistry matches;
    private final RematchRequests rematches;
    private final PlayerChannel channel;
    private final Clock clock;

    MatchController(MatchRegistry matches, RematchRequests rematches, PlayerChannel channel, Clock clock) {
        this.matches = matches;
        this.rematches = rematches;
        this.channel = channel;
        this.clock = clock;
    }

    @MessageMapping("/match/{matchId}/answer")
    void answer(@DestinationVariable String matchId, @Payload(required = false) AnswerRequest request, Principal user,
            SimpMessageHeaderAccessor headers) {
        Instant receivedAt = clock.instant();
        matches.answer(user.getName(), headers.getSessionId(), matchId, request, receivedAt);
    }

    /** After a reconnect or a {@code seq} gap: the match replies to this session with a {@code SNAPSHOT}. */
    @MessageMapping("/match/{matchId}/resync")
    void resync(@DestinationVariable String matchId, Principal user, SimpMessageHeaderAccessor headers) {
        matches.resync(user.getName(), headers.getSessionId(), matchId);
    }

    /** She leaves the match: an immediate forfeit. */
    @MessageMapping("/match/{matchId}/leave")
    void leave(@DestinationVariable String matchId, Principal user) {
        matches.leave(user.getName(), matchId);
    }

    /** After the match ended: she asks for a rematch (Story 1.10). The frame body is never read. */
    @MessageMapping("/match/{matchId}/rematch")
    void rematch(@DestinationVariable String matchId, Principal user, SimpMessageHeaderAccessor headers) {
        boolean guest = !(user instanceof in.minnal.game.platform.infrastructure.security.MinnalAuthentication auth)
                || !auth.getPrincipal().hasRole(in.minnal.contracts.identity.Role.USER);
        rematches.request(user.getName(), guest, headers.getSessionId(), matchId);
    }

    /** She withdraws her pending rematch request. */
    @MessageMapping("/match/{matchId}/rematch/cancel")
    void cancelRematch(@DestinationVariable String matchId, Principal user) {
        rematches.cancel(user.getName(), matchId);
    }

    /** A body that is not JSON (or not an object) is a bad request; nothing reaches the match. */
    @MessageExceptionHandler(MessageConversionException.class)
    void unreadable(Principal user, SimpMessageHeaderAccessor headers) {
        channel.toSession(user.getName(), headers.getSessionId(),
                ServerMessage.error(ErrorCode.BAD_REQUEST, null, clock.instant()));
    }
}

package in.minnal.game.match.api;

import in.minnal.contracts.realtime.AnswerRequest;
import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.match.application.MatchRegistry;
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
 * {@code /app/match/{matchId}/answer} (AD-10). The server receive instant is stamped first thing;
 * no client timestamp is ever read (AD-6). Identity comes only from the CONNECT token.
 */
@Controller
class MatchController {

    private final MatchRegistry matches;
    private final PlayerChannel channel;
    private final Clock clock;

    MatchController(MatchRegistry matches, PlayerChannel channel, Clock clock) {
        this.matches = matches;
        this.channel = channel;
        this.clock = clock;
    }

    @MessageMapping("/match/{matchId}/answer")
    void answer(@DestinationVariable String matchId, @Payload(required = false) AnswerRequest request, Principal user,
            SimpMessageHeaderAccessor headers) {
        Instant receivedAt = clock.instant();
        matches.answer(user.getName(), headers.getSessionId(), matchId, request, receivedAt);
    }

    /** A body that is not JSON (or not an object) is a bad request; nothing reaches the match. */
    @MessageExceptionHandler(MessageConversionException.class)
    void unreadable(Principal user, SimpMessageHeaderAccessor headers) {
        channel.toSession(user.getName(), headers.getSessionId(),
                ServerMessage.error(ErrorCode.BAD_REQUEST, null, clock.instant()));
    }
}

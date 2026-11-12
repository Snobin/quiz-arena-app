package in.minnal.game.platform.infrastructure.security;

import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.platform.infrastructure.ws.InboundRateLimiter;
import in.minnal.game.platform.session.MatchAccess;
import in.minnal.game.platform.session.PlayerChannel;
import java.time.Clock;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.oauth2.jwt.JwtDecoder;

/**
 * Authenticates STOMP sessions (AD-9, NFR13). On {@code CONNECT} the {@code Authorization: Bearer
 * <jwt>} native header is verified with the service's {@link JwtDecoder} (same rules as REST) and
 * the session's user becomes the {@link MinnalAuthentication}, whose name is the token's
 * {@code sub}. A missing, invalid or expired token, or keys that cannot be fetched, throws
 * {@link StompAuthenticationException}: the client gets a STOMP {@code ERROR} and the socket is
 * closed. Any other frame on a session without a user is rejected the same way.
 *
 * <p>Authenticated clients may only send to {@code /app/**} and subscribe to {@code /user/**}, or to
 * {@code /topic/match/{matchId}} when they are a human participant of that live match
 * ({@link MatchAccess}); every other subscription ({@code /topic/room/**} included, and broker
 * queues, which would bypass user destinations) gets an {@code ERROR}. The token is checked once:
 * an open session is not cut when it expires.
 *
 * <p>Every frame but CONNECT and DISCONNECT (and heartbeats) also takes a token from the
 * session's {@link InboundRateLimiter} bucket; a frame without one is dropped, with at most one
 * private {@code ERROR RATE_LIMITED} per second.
 */
public final class StompConnectAuthInterceptor implements ChannelInterceptor {

    private static final String BEARER = "Bearer ";
    private static final String AUTHORIZATION = "Authorization";

    private static final Pattern MATCH_TOPIC = Pattern.compile("^/topic/match/([0-9a-fA-F-]{36})$");

    private final JwtDecoder decoder;
    private final MatchAccess matches;
    private final InboundRateLimiter rateLimiter;
    private final PlayerChannel channel;
    private final Clock clock;
    private final MinnalJwtAuthenticationConverter converter = new MinnalJwtAuthenticationConverter();

    public StompConnectAuthInterceptor(JwtDecoder decoder, MatchAccess matches, InboundRateLimiter rateLimiter,
            PlayerChannel channel, Clock clock) {
        this.decoder = decoder;
        this.matches = matches;
        this.rateLimiter = rateLimiter;
        this.channel = channel;
        this.clock = clock;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) {
            return message; // heartbeats
        }
        StompCommand command = accessor.getCommand();
        switch (command) {
            case CONNECT, STOMP -> {
                String authorization = accessor.getFirstNativeHeader(AUTHORIZATION);
                // Never let the token travel further (broker, logs of a failed frame).
                accessor.removeNativeHeader(AUTHORIZATION);
                accessor.setUser(authenticate(authorization));
            }
            case DISCONNECT -> {
                // Always allowed: closing needs no identity, and is never rate limited.
                rateLimiter.remove(accessor.getSessionId());
            }
            default -> {
                if (accessor.getUser() == null) {
                    throw new StompAuthenticationException();
                }
                if (!withinRate(accessor)) {
                    return null; // dropped
                }
                String destination = accessor.getDestination();
                if (command == StompCommand.SEND && !startsWith(destination, "/app/")) {
                    throw new MessageDeliveryException("clients may only send to /app/**");
                }
                if (command == StompCommand.SUBSCRIBE && !mayReceive(accessor.getUser().getName(), destination)) {
                    throw new MessageDeliveryException(
                            "clients may only subscribe to /user/** or the /topic/match/{matchId} of their own live match");
                }
            }
        }
        return message;
    }

    private boolean withinRate(StompHeaderAccessor accessor) {
        String sessionId = accessor.getSessionId();
        if (sessionId == null) {
            return true;
        }
        return switch (rateLimiter.acquire(sessionId)) {
            case ALLOW -> true;
            case DROP -> false;
            case DROP_AND_NOTIFY -> {
                channel.toSession(accessor.getUser().getName(), sessionId,
                        ServerMessage.error(ErrorCode.RATE_LIMITED, null, clock.instant()));
                yield false;
            }
        };
    }

    private boolean mayReceive(String sub, String destination) {
        if (startsWith(destination, "/user/")) {
            return true;
        }
        Matcher topic = destination == null ? null : MATCH_TOPIC.matcher(destination);
        if (topic == null || !topic.matches()) {
            return false;
        }
        try {
            return matches.isParticipant(UUID.fromString(topic.group(1)), sub);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private AbstractAuthenticationToken authenticate(String authorization) {
        if (authorization == null || !authorization.regionMatches(true, 0, BEARER, 0, BEARER.length())) {
            throw new StompAuthenticationException();
        }
        try {
            return converter.convert(decoder.decode(authorization.substring(BEARER.length()).strip()));
        } catch (RuntimeException e) {
            // Bad, expired or forged token, or the JWKS is unreachable: never echo the token.
            throw new StompAuthenticationException();
        }
    }

    private static boolean startsWith(String destination, String prefix) {
        return destination != null && destination.startsWith(prefix);
    }

    /** No verified identity; the ERROR frame's message is {@code UNAUTHENTICATED}. */
    public static final class StompAuthenticationException extends MessageDeliveryException {

        public static final String MESSAGE = "UNAUTHENTICATED";

        StompAuthenticationException() {
            super(MESSAGE);
        }
    }
}

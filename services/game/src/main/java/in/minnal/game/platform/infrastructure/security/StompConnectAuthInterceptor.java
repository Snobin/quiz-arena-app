package in.minnal.game.platform.infrastructure.security;

import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.platform.infrastructure.ws.InboundRateLimiter;
import in.minnal.game.platform.session.DeletedUsers;
import in.minnal.game.platform.session.MatchAccess;
import in.minnal.game.platform.session.PlayerChannel;
import in.minnal.game.platform.session.RoomAccess;
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
 * ({@link MatchAccess}), or {@code /topic/room/{roomId}} when they are a member of that live room
 * ({@link RoomAccess}, Story 5.1); every other subscription (broker queues, which would bypass user
 * destinations, included) gets an {@code ERROR}. The token is checked once:
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
    private static final Pattern ROOM_TOPIC = Pattern.compile("^/topic/room/([0-9a-fA-F-]{36})$");

    private final JwtDecoder decoder;
    private final MatchAccess matches;
    private final RoomAccess rooms;
    private final InboundRateLimiter rateLimiter;
    private final PlayerChannel channel;
    private final Clock clock;
    private final DeletedUsers deleted;
    private final MinnalJwtAuthenticationConverter converter = new MinnalJwtAuthenticationConverter();

    public StompConnectAuthInterceptor(JwtDecoder decoder, MatchAccess matches, RoomAccess rooms,
            InboundRateLimiter rateLimiter, PlayerChannel channel, Clock clock, DeletedUsers deleted) {
        this.decoder = decoder;
        this.matches = matches;
        this.rooms = rooms;
        this.rateLimiter = rateLimiter;
        this.channel = channel;
        this.clock = clock;
        this.deleted = deleted;
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
                            "clients may only subscribe to /user/**, or the /topic/match/{matchId} or /topic/room/{roomId} of their own live match or room");
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
        if (destination == null) {
            return false;
        }
        try {
            Matcher match = MATCH_TOPIC.matcher(destination);
            if (match.matches()) {
                return matches.isParticipant(UUID.fromString(match.group(1)), sub);
            }
            Matcher room = ROOM_TOPIC.matcher(destination);
            return room.matches() && rooms.isMember(UUID.fromString(room.group(1)), sub);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private AbstractAuthenticationToken authenticate(String authorization) {
        if (authorization == null || !authorization.regionMatches(true, 0, BEARER, 0, BEARER.length())) {
            throw new StompAuthenticationException();
        }
        try {
            AbstractAuthenticationToken authentication = converter.convert(decoder.decode(authorization.substring(BEARER.length()).strip()));
            // A deleted account is refused even with an unexpired token (Story 2.8).
            if (authentication != null && deleted.contains(authentication.getName())) {
                throw new StompAuthenticationException();
            }
            return authentication;
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

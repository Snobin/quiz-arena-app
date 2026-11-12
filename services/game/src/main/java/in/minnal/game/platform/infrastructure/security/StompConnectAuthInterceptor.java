package in.minnal.game.platform.infrastructure.security;

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
 * <p>Authenticated clients may only send to {@code /app/**} and subscribe to {@code /user/**} or
 * {@code /topic/**} (never straight to a broker queue, which would bypass user destinations).
 * The token is checked once: an open session is not cut when it expires.
 */
public final class StompConnectAuthInterceptor implements ChannelInterceptor {

    private static final String BEARER = "Bearer ";
    private static final String AUTHORIZATION = "Authorization";

    private final JwtDecoder decoder;
    private final MinnalJwtAuthenticationConverter converter = new MinnalJwtAuthenticationConverter();

    public StompConnectAuthInterceptor(JwtDecoder decoder) {
        this.decoder = decoder;
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
                // Always allowed: closing needs no identity.
            }
            default -> {
                if (accessor.getUser() == null) {
                    throw new StompAuthenticationException();
                }
                String destination = accessor.getDestination();
                if (command == StompCommand.SEND && !startsWith(destination, "/app/")) {
                    throw new MessageDeliveryException("clients may only send to /app/**");
                }
                if (command == StompCommand.SUBSCRIBE && !startsWith(destination, "/user/") && !startsWith(destination, "/topic/")) {
                    throw new MessageDeliveryException("clients may only subscribe to /user/** or /topic/**");
                }
            }
        }
        return message;
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

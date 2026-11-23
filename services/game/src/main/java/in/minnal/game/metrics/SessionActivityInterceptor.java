package in.minnal.game.metrics;

import java.security.Principal;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;

/** Tells {@link PlayerSessionStats} about every inbound frame of an authenticated player (Story 7.3b). Runs after the auth interceptor. */
public final class SessionActivityInterceptor implements ChannelInterceptor {

    private final PlayerSessionStats stats;

    public SessionActivityInterceptor(PlayerSessionStats stats) {
        this.stats = stats;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor != null && accessor.getCommand() != null && accessor.getCommand() != StompCommand.DISCONNECT) {
            Principal user = accessor.getUser();
            if (user != null) {
                stats.touch(user.getName());
            }
        }
        return message;
    }
}

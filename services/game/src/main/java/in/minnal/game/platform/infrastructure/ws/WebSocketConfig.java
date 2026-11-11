package in.minnal.game.platform.infrastructure.ws;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * Minimal raw WebSocket endpoint at {@code /ws} that only accepts the upgrade. STOMP replaces this
 * in Story 1.6.
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final List<String> allowedOrigins;

    public WebSocketConfig(@Value("${minnal.cors.allowed-origins:}") List<String> allowedOrigins, Environment environment) {
        this.allowedOrigins = allowedOrigins.stream().map(String::strip).filter(origin -> !origin.isEmpty()).toList();
        // An empty list would silently allow same-origin only; in prod that is always a misconfiguration.
        if (this.allowedOrigins.isEmpty() && environment.matchesProfiles("prod")) {
            throw new IllegalStateException(
                    "minnal.cors.allowed-origins is empty under the prod profile: set CORS_ALLOWED_ORIGINS");
        }
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(new TextWebSocketHandler(), "/ws")
                .setAllowedOrigins(allowedOrigins.toArray(String[]::new));
    }
}

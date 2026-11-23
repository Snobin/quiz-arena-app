package in.minnal.game.platform.infrastructure.ws;

import com.fasterxml.jackson.annotation.JsonInclude;
import in.minnal.contracts.realtime.Destinations;
import in.minnal.game.metrics.PlayerSessionStats;
import in.minnal.game.metrics.SessionActivityInterceptor;
import in.minnal.game.platform.infrastructure.security.StompConnectAuthInterceptor;
import in.minnal.game.platform.session.DeletedUsers;
import in.minnal.game.platform.session.MatchAccess;
import in.minnal.game.platform.session.PlayerChannel;
import in.minnal.game.platform.session.RoomAccess;
import java.time.Clock;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.task.SyncTaskExecutor;
import org.springframework.core.env.Environment;
import org.springframework.messaging.converter.DefaultContentTypeResolver;
import org.springframework.messaging.converter.JacksonJsonMessageConverter;
import org.springframework.messaging.converter.MessageConverter;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.util.MimeTypeUtils;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import tools.jackson.databind.json.JsonMapper;

/**
 * STOMP over native WebSocket at {@code /ws} (AD-10; no SockJS). Clients send to {@code /app/**};
 * the simple broker serves {@code /topic/**} and {@code /queue/**} with 10 s/10 s heartbeats;
 * private messages go to {@code /user/queue/game}. CONNECT is authenticated by
 * {@link StompConnectAuthInterceptor}, which also checks match-topic subscriptions and applies the
 * per-connection inbound rate limit. Frames are JSON from the app's {@link JsonMapper} with nulls
 * omitted (instants as ISO-8601).
 *
 * <p>The handshake allows only {@code minnal.cors.allowed-origins}; an empty list under the prod
 * profile fails startup (an empty list silently allows same-origin only).
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    static final long[] HEARTBEAT_MS = {10_000, 10_000};

    private final List<String> allowedOrigins;
    private JwtDecoder jwtDecoder;
    private JsonMapper jsonMapper;
    private TaskScheduler brokerScheduler;
    private MatchAccess matchAccess;
    private RoomAccess roomAccess;
    private PlayerChannel playerChannel;
    private InboundRateLimiter rateLimiter;
    private Clock clock;
    private DeletedUsers deletedUsers;
    private PlayerSessionStats sessionStats;

    public WebSocketConfig(@Value("${minnal.cors.allowed-origins:}") List<String> allowedOrigins, Environment environment) {
        this.allowedOrigins = allowedOrigins.stream().map(String::strip).filter(origin -> !origin.isEmpty()).toList();
        // An empty list would silently allow same-origin only; in prod that is always a misconfiguration.
        if (this.allowedOrigins.isEmpty() && environment.matchesProfiles("prod")) {
            throw new IllegalStateException(
                    "minnal.cors.allowed-origins is empty under the prod profile: set CORS_ALLOWED_ORIGINS");
        }
    }

    @Autowired
    void setJwtDecoder(JwtDecoder jwtDecoder) {
        this.jwtDecoder = jwtDecoder;
    }

    @Autowired
    void setDeletedUsers(DeletedUsers deletedUsers) {
        this.deletedUsers = deletedUsers;
    }

    @Autowired
    void setJsonMapper(JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
    }

    /** Lazy: the match registry sends through the messaging template this configuration defines. */
    @Autowired
    void setMatchAccess(@Lazy MatchAccess matchAccess) {
        this.matchAccess = matchAccess;
    }

    /** Lazy for the same reason: the room registry broadcasts through the messaging template. */
    @Autowired
    void setRoomAccess(@Lazy RoomAccess roomAccess) {
        this.roomAccess = roomAccess;
    }

    /** Lazy for the same reason: {@code RATE_LIMITED} goes out through the messaging template. */
    @Autowired
    void setPlayerChannel(@Lazy PlayerChannel playerChannel) {
        this.playerChannel = playerChannel;
    }

    @Autowired
    void setRateLimiter(InboundRateLimiter rateLimiter) {
        this.rateLimiter = rateLimiter;
    }

    @Autowired
    void setSessionStats(PlayerSessionStats sessionStats) {
        this.sessionStats = sessionStats;
    }

    @Autowired
    void setClock(Clock clock) {
        this.clock = clock;
    }

    /** The broker's own scheduler, for heartbeats (lazy: it is defined by the broker configuration). */
    @Autowired
    void setBrokerScheduler(@Lazy TaskScheduler messageBrokerTaskScheduler) {
        this.brokerScheduler = messageBrokerTaskScheduler;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // Not setPreserveReceiveOrder: its decorator swallows interceptor failures (no ERROR frame for
        // a bad CONNECT, and the frame, token included, is logged). Order comes from the inline
        // inbound channel below instead.
        registry.addEndpoint(Destinations.ENDPOINT).setAllowedOrigins(allowedOrigins.toArray(String[]::new));
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.setApplicationDestinationPrefixes(Destinations.APP_PREFIX);
        registry.setUserDestinationPrefix(Destinations.USER_PREFIX);
        registry.setPreservePublishOrder(true);
        registry.enableSimpleBroker(Destinations.TOPIC_PREFIX, Destinations.QUEUE_PREFIX)
                .setHeartbeatValue(HEARTBEAT_MS)
                .setTaskScheduler(brokerScheduler);
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        // Inline on the socket's own thread (this configurer runs after Boot's, which sets a pool):
        // a session's frames are handled in order (SUBSCRIBE before the join that follows it), and
        // handlers only hand events to actors, so they never block the socket for long.
        registration.executor(new SyncTaskExecutor());
        registration.interceptors(new StompConnectAuthInterceptor(jwtDecoder, matchAccess, roomAccess, rateLimiter, playerChannel, clock, deletedUsers),
                new SessionActivityInterceptor(sessionStats));
    }

    @Override
    public boolean configureMessageConverters(List<MessageConverter> messageConverters) {
        JsonMapper wire = jsonMapper.rebuild()
                .changeDefaultPropertyInclusion(inclusion -> inclusion.withValueInclusion(JsonInclude.Include.NON_NULL))
                .build();
        JacksonJsonMessageConverter converter = new JacksonJsonMessageConverter(wire);
        DefaultContentTypeResolver resolver = new DefaultContentTypeResolver();
        resolver.setDefaultMimeType(MimeTypeUtils.APPLICATION_JSON);
        converter.setContentTypeResolver(resolver);
        // First, ahead of Boot's converter (which keeps nulls); this configurer runs after Boot's.
        messageConverters.add(0, converter);
        return false;
    }
}

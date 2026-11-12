package in.minnal.game.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.util.MimeTypeUtils;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * A real STOMP client for integration tests: connects with a bearer token and collects private
 * messages; {@link #subscribe} adds a topic whose frames are collected separately.
 */
public final class StompTestClient implements AutoCloseable {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final WebSocketStompClient client;
    private final StompSession session;
    private final BlockingQueue<JsonNode> inbox = new LinkedBlockingQueue<>();
    private final BlockingQueue<JsonNode> topic = new LinkedBlockingQueue<>();

    private StompTestClient(int port, String token) throws Exception {
        client = new WebSocketStompClient(new StandardWebSocketClient());
        StompHeaders connect = new StompHeaders();
        connect.add("Authorization", "Bearer " + token);
        session = client.connectAsync("ws://localhost:" + port + "/ws", new WebSocketHttpHeaders(), connect,
                new StompSessionHandlerAdapter() { }).get(5, TimeUnit.SECONDS);
        session.subscribe("/user/queue/game", new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return byte[].class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                inbox.add(JSON.readTree(new String((byte[]) payload, StandardCharsets.UTF_8)));
            }
        });
    }

    /** Subscribes to {@code destination}; its frames go to {@link #nextBroadcast}. */
    public void subscribe(String destination) {
        session.subscribe(destination, new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return byte[].class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                topic.add(JSON.readTree(new String((byte[]) payload, StandardCharsets.UTF_8)));
            }
        });
    }

    /** The next topic frame, failing after {@code within}. */
    public JsonNode nextBroadcast(Duration within) {
        try {
            JsonNode message = topic.poll(within.toMillis(), TimeUnit.MILLISECONDS);
            assertThat(message).as("a broadcast within %s", within).isNotNull();
            return message;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    /** The next topic frame, which must have {@code type}. */
    public JsonNode nextBroadcast(String type) {
        JsonNode message = nextBroadcast(Duration.ofSeconds(5));
        assertThat(message.get("type").asString()).as("broadcast %s", message).isEqualTo(type);
        return message;
    }

    /** Topic frames received and not yet taken. */
    public int pendingBroadcasts() {
        return topic.size();
    }

    public static StompTestClient connect(int port, String token) {
        try {
            return new StompTestClient(port, token);
        } catch (Exception e) {
            throw new IllegalStateException("STOMP connect failed", e);
        }
    }

    public void send(String destination) {
        send(destination, "{}");
    }

    public void send(String destination, String json) {
        StompHeaders headers = new StompHeaders();
        headers.setDestination(destination);
        headers.setContentType(MimeTypeUtils.APPLICATION_JSON);
        session.send(headers, json.getBytes(StandardCharsets.UTF_8));
    }

    public void join() {
        send("/app/matchmaking/QUICK/join");
    }

    public void cancel() {
        send("/app/matchmaking/QUICK/cancel");
    }

    /** The next private message, failing after 5 s. */
    public JsonNode next() {
        return next(Duration.ofSeconds(5));
    }

    public JsonNode next(Duration within) {
        try {
            JsonNode message = inbox.poll(within.toMillis(), TimeUnit.MILLISECONDS);
            assertThat(message).as("a private message within %s", within).isNotNull();
            return message;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    /** The next message, which must have {@code type}. */
    public JsonNode next(String type) {
        JsonNode message = next();
        assertThat(message.get("type").asString()).as("message %s", message).isEqualTo(type);
        return message;
    }

    /** The next message, which must be an ERROR with {@code code}. */
    public JsonNode error(String code) {
        JsonNode message = next("ERROR");
        assertThat(message.get("payload").get("code").asString()).as("message %s", message).isEqualTo(code);
        return message;
    }

    /** Fails if any message arrives within {@code window}. */
    public void expectNothing(Duration window) {
        try {
            JsonNode message = inbox.poll(window.toMillis(), TimeUnit.MILLISECONDS);
            assertThat(message).as("no message expected").isNull();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    public boolean isConnected() {
        return session.isConnected();
    }

    @Override
    public void close() {
        try {
            if (session.isConnected()) {
                session.disconnect();
            }
        } finally {
            client.stop();
        }
    }
}

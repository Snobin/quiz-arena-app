package in.minnal.game.support;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * A stand-in for core-service's {@code POST /internal/question-sets} on a random loopback port:
 * answers with {@code count} questions, or with {@link #status} after {@link #delayMs}.
 */
public final class FakeCore implements AutoCloseable {

    public static final String TOKEN = "test-internal-token";

    public record Call(String token, JsonNode body) {
    }

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final HttpServer server;
    private final List<Call> calls = new CopyOnWriteArrayList<>();
    public volatile int status = 200;
    public volatile long delayMs;

    private FakeCore() throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.setExecutor(Executors.newCachedThreadPool());
        server.createContext("/internal/question-sets", exchange -> {
            JsonNode body = JSON.readTree(exchange.getRequestBody().readAllBytes());
            calls.add(new Call(exchange.getRequestHeaders().getFirst("X-Internal-Token"), body));
            try {
                Thread.sleep(delayMs);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            int code = status;
            byte[] out = (code == 200 ? questions(body.get("count").asInt()) : "{\"status\":" + code + "}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", code == 200 ? "application/json" : "application/problem+json");
            try {
                exchange.sendResponseHeaders(code, out.length);
                try (OutputStream stream = exchange.getResponseBody()) {
                    stream.write(out);
                }
            } catch (IOException e) {
                // The caller gave up (timeout).
            }
        });
        server.start();
    }

    public static FakeCore start() {
        try {
            return new FakeCore();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    public String baseUrl() {
        return "http://" + server.getAddress().getHostString() + ":" + server.getAddress().getPort();
    }

    public List<Call> calls() {
        return List.copyOf(calls);
    }

    public void reset() {
        status = 200;
        delayMs = 0;
        calls.clear();
    }

    private static String questions(int count) {
        return IntStream.range(0, count).mapToObj(i -> """
                {"questionId":"%s","version":1,"textMl":"ചോദ്യം %d","textEn":"Question %d",
                 "options":["a","b","c","d"],"answerIndex":%d,"explanation":"x","attribution":null}"""
                .formatted(UUID.randomUUID(), i, i, i % 4))
                .collect(Collectors.joining(",", "{\"questions\":[", "]}"));
    }

    @Override
    public void close() {
        server.stop(0);
    }
}

package in.minnal.game.matchmaking.infrastructure;

import in.minnal.contracts.internal.QuestionSetRequest;
import in.minnal.contracts.internal.QuestionSetResponse;
import in.minnal.game.matchmaking.application.QuestionSetClient;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * {@code POST {minnal.core.base-url}/internal/question-sets} with the {@code X-Internal-Token}
 * header (AD-12). Each call runs on its own virtual thread, never on an actor thread, with a 1 s
 * connect and 2 s read timeout and a 2 s total deadline ({@code orTimeout}).
 */
@Component
class HttpQuestionSetClient implements QuestionSetClient, DisposableBean {

    static final String PATH = "/internal/question-sets";
    static final String TOKEN_HEADER = "X-Internal-Token";

    private static final Logger log = LoggerFactory.getLogger(HttpQuestionSetClient.class);

    private final RestClient rest;
    private final Duration timeout;
    private final ExecutorService executor = Executors.newThreadPerTaskExecutor(
            Thread.ofVirtual().name("question-set-", 0).factory());

    HttpQuestionSetClient(RestClient.Builder restClients, @Value("${minnal.core.base-url}") String baseUrl,
            @Value("${minnal.internal.token:}") String token,
            @Value("${minnal.core.question-set-timeout:2s}") Duration timeout) {
        if (token == null || token.isBlank()) {
            log.warn("minnal.internal.token (MINNAL_INTERNAL_TOKEN) is not set: core-service will refuse every question-set request");
        }
        this.timeout = timeout;
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build());
        factory.setReadTimeout(timeout);
        // Boot's builder (prototype: this caller's own copy) brings observation and the app JSON mapper.
        this.rest = restClients
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .defaultHeader(TOKEN_HEADER, token == null ? "" : token)
                .build();
    }

    @Override
    public CompletableFuture<QuestionSetResponse> fetch(QuestionSetRequest request) {
        return CompletableFuture.supplyAsync(() -> call(request), executor)
                .orTimeout(timeout.toMillis(), TimeUnit.MILLISECONDS);
    }

    private QuestionSetResponse call(QuestionSetRequest request) {
        QuestionSetResponse response = rest.post()
                .uri(PATH)
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .body(QuestionSetResponse.class);
        if (response == null || response.questions().size() != request.count()) {
            throw new IllegalStateException("question set has the wrong size");
        }
        return response;
    }

    @Override
    public void destroy() {
        executor.shutdownNow();
    }
}

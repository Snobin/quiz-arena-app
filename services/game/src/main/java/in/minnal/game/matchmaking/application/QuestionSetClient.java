package in.minnal.game.matchmaking.application;

import in.minnal.contracts.internal.QuestionSetRequest;
import in.minnal.contracts.internal.QuestionSetResponse;
import java.util.concurrent.CompletableFuture;

/**
 * core-service's {@code POST /internal/question-sets} (AD-12): game-service's only synchronous
 * call, made when a pairing forms. Runs off the calling thread; the future fails on a timeout
 * (2 s), a 4xx or 5xx, or a short set.
 */
public interface QuestionSetClient {

    CompletableFuture<QuestionSetResponse> fetch(QuestionSetRequest request);

    /**
     * core answered {@code 422}: the topic has too few published questions, or does not exist
     * (Story 4.2). The future fails with this (possibly wrapped in a {@code CompletionException}).
     */
    class TopicUnavailableException extends RuntimeException {

        public TopicUnavailableException(String message) {
            super(message);
        }
    }

    /**
     * core answered {@code 404} to a {@code CUSTOM} request (Story 6.5a): the host's topic was deleted, or is not hers.
     * The future fails with this (possibly wrapped in a {@code CompletionException}).
     */
    class SourceUnavailableException extends RuntimeException {

        public SourceUnavailableException(String message) {
            super(message);
        }
    }
}

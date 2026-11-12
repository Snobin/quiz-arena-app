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
}

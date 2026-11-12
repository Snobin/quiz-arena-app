package in.minnal.core.question.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** A bank question: identity only. Its content lives in immutable {@link QuestionVersion}s. */
public record Question(UUID id, String sourceRef, Instant createdAt, Instant deletedAt) {

    public Question {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(createdAt, "createdAt");
    }

    public static Question create(String sourceRef, Instant now) {
        return new Question(UUID.randomUUID(), sourceRef, now, null);
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }
}

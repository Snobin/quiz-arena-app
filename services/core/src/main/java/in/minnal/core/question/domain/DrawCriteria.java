package in.minnal.core.question.domain;

import java.util.Objects;
import java.util.UUID;

/** Filters for a random draw of published questions. Null optional filters do not narrow the pool. */
public record DrawCriteria(ContentCategory category, UUID subjectId, UUID topicId, ExamLevel examLevel, int count) {

    public DrawCriteria {
        Objects.requireNonNull(category, "category");
        if (count < 1) {
            throw new IllegalArgumentException("count must be positive");
        }
    }
}

package in.minnal.contracts.internal;

import java.util.UUID;

/**
 * Narrows the question pool. {@code category} is required ({@code KERALA_PSC | SCHOOL_QUIZ |
 * GENERAL_KERALA}); the other filters are optional. {@code examLevel} is {@code TENTH | DEGREE | OTHER}.
 */
public record QuestionSetFilters(String category, UUID subjectId, UUID topicId, String examLevel) {

    public static QuestionSetFilters category(String category) {
        return new QuestionSetFilters(category, null, null, null);
    }
}

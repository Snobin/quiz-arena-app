package in.minnal.contracts.internal;

import java.util.List;

/** Response of {@code POST /internal/question-sets}: exactly {@code count} distinct questions;
 * {@code topic} is set only when the request filtered by {@code topicId} (null otherwise). */
public record QuestionSetResponse(List<InternalQuestion> questions, QuestionSetTopic topic) {

    public QuestionSetResponse {
        questions = List.copyOf(questions);
    }

    /** A Quick Match style response with no topic block. */
    public QuestionSetResponse(List<InternalQuestion> questions) {
        this(questions, null);
    }
}

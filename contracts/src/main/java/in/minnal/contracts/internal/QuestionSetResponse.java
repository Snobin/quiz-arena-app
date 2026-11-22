package in.minnal.contracts.internal;

import java.util.List;

/** Response of {@code POST /internal/question-sets}: exactly {@code count} distinct questions;
 * {@code topic} is set only when the request filtered by {@code topicId} (null otherwise);
 * {@code customTopic} is set only for a {@code CUSTOM} request (Story 6.5a). */
public record QuestionSetResponse(List<InternalQuestion> questions, QuestionSetTopic topic, QuestionSetCustomTopic customTopic) {

    public QuestionSetResponse {
        questions = List.copyOf(questions);
    }

    /** A bank response, with or without a topic block. */
    public QuestionSetResponse(List<InternalQuestion> questions, QuestionSetTopic topic) {
        this(questions, topic, null);
    }

    /** A Quick Match style response with no topic block. */
    public QuestionSetResponse(List<InternalQuestion> questions) {
        this(questions, null, null);
    }
}

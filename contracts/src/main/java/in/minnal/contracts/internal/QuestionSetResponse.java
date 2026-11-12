package in.minnal.contracts.internal;

import java.util.List;

/** Response of {@code POST /internal/question-sets}: exactly {@code count} distinct questions. */
public record QuestionSetResponse(List<InternalQuestion> questions) {

    public QuestionSetResponse {
        questions = List.copyOf(questions);
    }
}

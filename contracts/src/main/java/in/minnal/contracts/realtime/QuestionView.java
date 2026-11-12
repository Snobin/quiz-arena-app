package in.minnal.contracts.realtime;

import in.minnal.contracts.internal.InternalQuestion;
import java.util.List;
import java.util.UUID;

/**
 * A question as a client sees it while its window is open (AD-5): no answer, explanation,
 * attribution or any hint of correctness. Those arrive only in {@link QuestionRevealedPayload}.
 *
 * @param textMl  Malayalam text, or null (omitted on the wire)
 * @param textEn  English text, or null (omitted on the wire)
 * @param options exactly 4 options, in the order the answer index refers to
 */
public record QuestionView(UUID questionId, int version, String textMl, String textEn, List<String> options) {

    public QuestionView {
        options = List.copyOf(options);
    }

    /** The client-safe view of {@code question}: every field but the answer, explanation and attribution. */
    public static QuestionView of(InternalQuestion question) {
        return new QuestionView(question.questionId(), question.version(), question.textMl(), question.textEn(),
                question.options());
    }
}

package in.minnal.core.question.application;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * One open draft in the review queue. {@code replacesVersion} is the highest published version below the draft (null
 * for a new question) and {@code changedFields} lists what differs from it.
 */
public record AdminDraft(UUID questionId, long displayNo, int version, int rowVersion, AdminQuestionDetail.Content content,
                         String createdBy, Instant createdAt, Integer replacesVersion, List<String> changedFields) {

    /** The names of the fields whose values differ, in form order. */
    public static List<String> changedFields(AdminQuestionDetail.Content published, AdminQuestionDetail.Content draft) {
        List<String> changed = new ArrayList<>();
        if (!published.category().equals(draft.category())) {
            changed.add("category");
        }
        if (!published.subjectId().equals(draft.subjectId())) {
            changed.add("subject");
        }
        if (!published.topicId().equals(draft.topicId())) {
            changed.add("topic");
        }
        if (!published.examLevel().equals(draft.examLevel())) {
            changed.add("level");
        }
        if (!published.difficulty().equals(draft.difficulty())) {
            changed.add("difficulty");
        }
        if (!java.util.Objects.equals(published.textMl(), draft.textMl())) {
            changed.add("textMl");
        }
        if (!java.util.Objects.equals(published.textEn(), draft.textEn())) {
            changed.add("textEn");
        }
        for (int i = 0; i < 4; i++) {
            if (!published.options().get(i).equals(draft.options().get(i))) {
                changed.add("option" + (char) ('A' + i));
            }
        }
        if (published.answerIndex() != draft.answerIndex()) {
            changed.add("answer");
        }
        if (!published.explanation().equals(draft.explanation())) {
            changed.add("explanation");
        }
        if (!java.util.Objects.equals(published.attribution(), draft.attribution())) {
            changed.add("attribution");
        }
        return changed;
    }
}

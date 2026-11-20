package in.minnal.core.question.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** One row of the admin list: the shown version (latest published, else latest) plus the question's state. */
public record AdminQuestionRow(UUID questionId, long displayNo, int currentVersion, String state, boolean hasPendingDraft, Integer pendingDraftVersion,
                               String textMl, String textEn, String category, String subject, String topic,
                               UUID subjectId, UUID topicId, String examLevel, String difficulty, List<String> options,
                               int answerIndex, String explanation, Instant updatedAt) {
}

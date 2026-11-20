package in.minnal.core.question.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * One question for the editor. {@code editing} is the version the form opens on: the open draft,
 * else the latest published version, else the latest version.
 */
public record AdminQuestionDetail(UUID questionId, long displayNo, String sourceRef, boolean deleted, Instant deletedAt,
                                  Editing editing, List<HistoryEntry> versions) {

    public record Editing(int version, String status, int rowVersion, Content content) {
    }

    public record Content(String category, UUID subjectId, UUID topicId, String subject, String topic, String examLevel,
                          String difficulty, String textMl, String textEn, List<String> options, int answerIndex,
                          String explanation, String attribution) {
    }

    /** {@code createdBy} is "seed" for seeded rows. */
    public record HistoryEntry(int version, String status, String createdBy, Instant createdAt, Instant updatedAt) {
    }
}

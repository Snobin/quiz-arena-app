package in.minnal.core.question.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * One version of a question. Only a {@code DRAFT} can change; a {@code PUBLISHED} (or
 * {@code DISCARDED}) version is immutable, and a change to it becomes a new draft version
 * ({@link #nextDraft}).
 */
public record QuestionVersion(
        UUID id,
        UUID questionId,
        int version,
        VersionStatus status,
        QuestionContent content,
        String reviewedBy,
        Instant reviewedAt,
        Instant createdAt) {

    public QuestionVersion {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(questionId, "questionId");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(content, "content");
        Objects.requireNonNull(createdAt, "createdAt");
        if (version < 1) {
            throw new IllegalArgumentException("version starts at 1");
        }
    }

    /** Version 1 of a question that an admin has already reviewed (the starter seed). */
    public static QuestionVersion reviewedFirstVersion(UUID questionId, QuestionContent content, String reviewedBy, Instant reviewedAt, Instant now) {
        Objects.requireNonNull(reviewedBy, "reviewedBy");
        Objects.requireNonNull(reviewedAt, "reviewedAt");
        return new QuestionVersion(UUID.randomUUID(), questionId, 1, VersionStatus.PUBLISHED, content, reviewedBy, reviewedAt, now);
    }

    public static QuestionVersion firstDraft(UUID questionId, QuestionContent content, Instant now) {
        return new QuestionVersion(UUID.randomUUID(), questionId, 1, VersionStatus.DRAFT, content, null, null, now);
    }

    /** Returns this draft with new content. Rejects any non-draft version. */
    public QuestionVersion reviseDraft(QuestionContent newContent) {
        requireDraft();
        return new QuestionVersion(id, questionId, version, status, newContent, reviewedBy, reviewedAt, createdAt);
    }

    /** Publishes this draft, recording the review. Rejects any non-draft version. */
    public QuestionVersion publish(String reviewer, Instant at) {
        requireDraft();
        return new QuestionVersion(id, questionId, version, VersionStatus.PUBLISHED, content, Objects.requireNonNull(reviewer), Objects.requireNonNull(at), createdAt);
    }

    /** Discards this draft. Rejects any non-draft version. */
    public QuestionVersion discard() {
        requireDraft();
        return new QuestionVersion(id, questionId, version, VersionStatus.DISCARDED, content, reviewedBy, reviewedAt, createdAt);
    }

    /** The way to change a published question: a new draft with the next version number. */
    public QuestionVersion nextDraft(QuestionContent newContent, Instant now) {
        return new QuestionVersion(UUID.randomUUID(), questionId, version + 1, VersionStatus.DRAFT, newContent, null, null, now);
    }

    public boolean isPublished() {
        return status == VersionStatus.PUBLISHED;
    }

    private void requireDraft() {
        if (status != VersionStatus.DRAFT) {
            throw new ImmutableVersionException(id, status);
        }
    }
}

package in.minnal.core.question.domain;

/** Lifecycle of a question version: {@code DRAFT → PUBLISHED} or {@code DRAFT → DISCARDED} (AD-12). */
public enum VersionStatus {
    DRAFT,
    PUBLISHED,
    DISCARDED
}

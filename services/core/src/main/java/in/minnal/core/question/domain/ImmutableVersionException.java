package in.minnal.core.question.domain;

import java.util.UUID;

/** Thrown when code tries to change a version that is not a {@code DRAFT} (AD-12). */
public class ImmutableVersionException extends RuntimeException {

    public ImmutableVersionException(UUID versionId, VersionStatus status) {
        super("question version " + versionId + " is " + status + " and cannot be changed; store a new version instead");
    }
}

package in.minnal.core.profile.domain;

import in.minnal.core.question.domain.ExamLevel;
import java.time.Instant;
import java.util.UUID;

public record Profile(UUID userId, String displayName, String district, ExamLevel examLevel, String language, Instant updatedAt) {
}

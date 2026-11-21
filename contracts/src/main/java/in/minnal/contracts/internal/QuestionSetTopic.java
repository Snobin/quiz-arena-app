package in.minnal.contracts.internal;

import java.util.UUID;

/** The topic block of a {@link QuestionSetResponse} when the request filtered by {@code topicId}. */
public record QuestionSetTopic(UUID topicId, String name, UUID subjectId, String subjectName) {}

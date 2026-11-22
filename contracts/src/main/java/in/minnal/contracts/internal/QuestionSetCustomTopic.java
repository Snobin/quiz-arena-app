package in.minnal.contracts.internal;

import java.util.UUID;

/** The custom-topic block of a {@link QuestionSetResponse} for a {@code CUSTOM} request: the topic's id and its current name. */
public record QuestionSetCustomTopic(UUID customTopicId, String name) {}

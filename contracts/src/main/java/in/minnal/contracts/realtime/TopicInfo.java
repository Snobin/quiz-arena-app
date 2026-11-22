package in.minnal.contracts.realtime;

import java.util.UUID;

/**
 * The topic a Topic Duel is played on (Story 4.2). Null on every Quick Match payload.
 *
 * A custom-topic room (Story 6.5a) has no {@code topicId} or {@code subjectName}: only the {@code name}.
 *
 * @param name        the topic's display name
 * @param subjectName the subject it belongs to
 */
public record TopicInfo(UUID topicId, String name, String subjectName) {}

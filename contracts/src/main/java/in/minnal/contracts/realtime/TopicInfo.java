package in.minnal.contracts.realtime;

import java.util.UUID;

/**
 * The topic a Topic Duel is played on (Story 4.2). Null on every Quick Match payload.
 *
 * @param name        the topic's display name
 * @param subjectName the subject it belongs to
 */
public record TopicInfo(UUID topicId, String name, String subjectName) {}

package in.minnal.contracts.realtime;

import in.minnal.contracts.internal.QuestionSource;
import java.util.UUID;

/**
 * Where a room's questions come from: a tagged object ({@code {type: "BANK", topicId, topicName}}, the Story 4.3
 * shape), so Epic 6 can add {@code {type: "CUSTOM", customTopicId}} without changing a field here.
 *
 * @param type      the tag; only {@code BANK} is accepted until Epic 6
 * @param topicId   the PSC bank topic
 * @param topicName display text from the host's picker (trimmed to 80 characters); core's name replaces it at start
 */
public record RoomSource(QuestionSource type, UUID topicId, String topicName) {

    /** The longest {@code topicName} kept. */
    public static final int MAX_TOPIC_NAME = 80;

    /** Only bank-source rooms change the Battle Room rating. */
    public boolean rated() {
        return type == QuestionSource.BANK;
    }
}

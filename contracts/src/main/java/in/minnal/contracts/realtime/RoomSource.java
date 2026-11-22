package in.minnal.contracts.realtime;

import in.minnal.contracts.internal.QuestionSource;
import java.util.UUID;

/**
 * Where a room's questions come from: a tagged object. {@code {type: "BANK", topicId}} is the Story 4.3
 * shape (each client resolves the topic's name from its own catalogue); {@code {type: "CUSTOM", customTopicId,
 * topicName}} (Story 6.5a) is one of the host's own topics, named by the host's client because game-service makes no
 * call to core in the lobby (AD-2).
 *
 * @param type          the tag
 * @param topicId       the PSC bank topic ({@code BANK} only)
 * @param customTopicId the host's custom topic ({@code CUSTOM} only)
 * @param topicName     the custom topic's name as the host's client sent it ({@code CUSTOM} only)
 */
public record RoomSource(QuestionSource type, UUID topicId, UUID customTopicId, String topicName) {

    /** A bank source. */
    public RoomSource(QuestionSource type, UUID topicId) {
        this(type, topicId, null, null);
    }

    /** One of the host's own topics. */
    public static RoomSource custom(UUID customTopicId, String topicName) {
        return new RoomSource(QuestionSource.CUSTOM, null, customTopicId, topicName);
    }

    /** Only bank-source rooms change the Battle Room rating. */
    public boolean rated() {
        return type == QuestionSource.BANK;
    }
}

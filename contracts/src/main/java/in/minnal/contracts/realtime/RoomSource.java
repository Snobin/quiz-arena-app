package in.minnal.contracts.realtime;

import in.minnal.contracts.internal.QuestionSource;
import java.util.UUID;

/**
 * Where a room's questions come from: a tagged object ({@code {type: "BANK", topicId}}, the Story 4.3
 * shape; each client resolves the topic's name from its own catalogue), so Epic 6 can add {@code {type: "CUSTOM", customTopicId}} without changing a field here.
 *
 * @param type      the tag; only {@code BANK} is accepted until Epic 6
 * @param topicId   the PSC bank topic
 */
public record RoomSource(QuestionSource type, UUID topicId) {

    /** Only bank-source rooms change the Battle Room rating. */
    public boolean rated() {
        return type == QuestionSource.BANK;
    }
}

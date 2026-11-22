package in.minnal.core.solo.application;

import java.util.List;
import java.util.UUID;

/**
 * A Solo Practice session as stored in Valkey under {@code core:solo:{sessionId}} (Story 4.3). Nothing about it is
 * rated or kept: a lost session is acceptable.
 *
 * @param cursor index into {@code order} of the next question to serve
 * @param current the question last served, or null before the first one
 */
public record SoloSession(
        UUID sessionId,
        UUID userId,
        Source source,
        int cycle,
        List<UUID> order,
        int cursor,
        Current current,
        int answeredCount,
        int correctCount) {

    public SoloSession {
        order = List.copyOf(order);
    }

    /**
     * Tagged source: {@code type} plus its id ({@code topicId} is the bank topic for BANK and the custom topic for CUSTOM).
     * {@code revision} is the custom topic's revision when the pool was built (null for BANK and for sessions written before
     * Story 6.4).
     */
    public record Source(String type, UUID topicId, Integer revision) {
        public static final String BANK = "BANK";
        public static final String CUSTOM = "CUSTOM";

        public Source(String type, UUID topicId) {
            this(type, topicId, null);
        }

        public static Source custom(UUID customTopicId, int revision) {
            return new Source(CUSTOM, customTopicId, revision);
        }

        public boolean isCustom() {
            return CUSTOM.equals(type);
        }
    }

    /** The served question, its exact version, whether it has been answered and whether serving it rebuilt the pool. */
    public record Current(UUID questionId, int version, boolean answered, boolean reshuffled) {
        public Current asAnswered() {
            return new Current(questionId, version, true, reshuffled);
        }
    }

    public SoloSession withCurrent(Current next, int newCursor, int newCycle, List<UUID> newOrder) {
        return new SoloSession(sessionId, userId, source, newCycle, newOrder, newCursor, next, answeredCount, correctCount);
    }

    public SoloSession withSource(Source newSource) {
        return new SoloSession(sessionId, userId, newSource, cycle, order, cursor, current, answeredCount, correctCount);
    }

    public SoloSession withAnswer(boolean correct) {
        return new SoloSession(sessionId, userId, source, cycle, order, cursor, current.asAnswered(),
                answeredCount + 1, correctCount + (correct ? 1 : 0));
    }
}

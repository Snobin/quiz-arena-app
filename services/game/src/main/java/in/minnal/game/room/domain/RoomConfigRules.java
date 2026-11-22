package in.minnal.game.room.domain;

import in.minnal.contracts.internal.QuestionSource;
import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.RoomSource;
import java.util.UUID;

/**
 * Validation of a room's source and question count, the same on create and on configure (Story 5.1). The topic is never
 * checked against core here: AD-2 allows that call only when a match starts.
 *
 * <p>Order: a missing source is {@code INVALID_ROOM_CONFIG}; a {@code type} other than {@code BANK} or {@code CUSTOM} (absent or
 * not text included) is {@code SOURCE_NOT_AVAILABLE}; a missing or non-UUID {@code topicId} (or, for {@code CUSTOM},
 * {@code customTopicId}) is {@code INVALID_TOPIC}; then the
 * count, which must be a whole number from 5 to 30 ({@code INVALID_ROOM_CONFIG}).
 */
public final class RoomConfigRules {

    public static final int MIN_QUESTIONS = 5;
    public static final int MAX_QUESTIONS = 30;

    /** A valid configuration. */
    public record Config(RoomSource source, int questionCount) {
    }

    /** The outcome of validating: {@code config} when valid, else the {@code error} to answer. */
    public record Result(Config config, ErrorCode error) {

        public boolean valid() {
            return config != null;
        }
    }

    private RoomConfigRules() {
    }

    /** A new room: both the source and the count must be sent and valid. */
    public static Result forCreate(RoomConfigInput input) {
        return validate(input, null);
    }

    /**
     * A configure of a room that holds {@code current}: a part that was not sent stays as it is; a part that was sent is
     * validated whole. Sending nothing at all is {@code INVALID_ROOM_CONFIG}.
     */
    public static Result forConfigure(RoomConfigInput input, Config current) {
        if (!input.sourcePresent() && !input.countPresent()) {
            return new Result(null, ErrorCode.INVALID_ROOM_CONFIG);
        }
        return validate(input, current);
    }

    private static Result validate(RoomConfigInput input, Config current) {
        RoomSource source;
        if (input.sourcePresent()) {
            boolean custom = QuestionSource.CUSTOM.name().equals(input.sourceType());
            if (input.sourceType() == null || (!custom && !QuestionSource.BANK.name().equals(input.sourceType()))) {
                return new Result(null, ErrorCode.SOURCE_NOT_AVAILABLE);
            }
            UUID topicId = parseUuid(custom ? input.customTopicId() : input.topicId());
            if (topicId == null) {
                return new Result(null, ErrorCode.INVALID_TOPIC);
            }
            // The lobby shows the name the host's client sent; core's name replaces it at start. It is shown to the other
            // players, so it is capped like any display text.
            source = custom ? RoomSource.custom(topicId, cleanName(input.topicName())) : new RoomSource(QuestionSource.BANK, topicId);
        } else if (current != null) {
            source = current.source();
        } else {
            return new Result(null, ErrorCode.INVALID_ROOM_CONFIG);
        }
        int count;
        if (input.countPresent() || current == null) {
            Integer sent = input.questionCount();
            if (sent == null || sent < MIN_QUESTIONS || sent > MAX_QUESTIONS) {
                return new Result(null, ErrorCode.INVALID_ROOM_CONFIG);
            }
            count = sent;
        } else {
            count = current.questionCount();
        }
        return new Result(new Config(source, count), null);
    }

    private static final int MAX_NAME = 80;

    private static String cleanName(String name) {
        if (name == null) {
            return "";
        }
        String trimmed = name.strip();
        return trimmed.length() > MAX_NAME ? trimmed.substring(0, MAX_NAME) : trimmed;
    }

    private static UUID parseUuid(String text) {
        try {
            return text == null ? null : UUID.fromString(text);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}

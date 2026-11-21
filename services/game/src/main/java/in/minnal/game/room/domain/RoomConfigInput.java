package in.minnal.game.room.domain;

/**
 * What a client sent as a room's configuration, before validation: the wire fields as text and numbers, with "was it
 * sent" kept apart from "is it valid".
 *
 * @param sourcePresent whether a {@code source} object was sent
 * @param sourceType    {@code source.type}, null when absent or not text
 * @param topicId       {@code source.topicId}, null when absent or not text
 * @param topicName     {@code source.topicName}, null when absent or not text
 * @param countPresent  whether a {@code questionCount} was sent
 * @param questionCount the count when it is a whole number, else null
 */
public record RoomConfigInput(boolean sourcePresent, String sourceType, String topicId, String topicName,
        boolean countPresent, Integer questionCount) {
}

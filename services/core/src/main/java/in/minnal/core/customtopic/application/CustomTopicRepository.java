package in.minnal.core.customtopic.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Storage for a player's private custom topics. Every method runs inside the caller's transaction. */
public interface CustomTopicRepository {

    record Usage(int topics, int questions) {
    }

    record Row(int position, String text, String lang, List<String> options, int answerIndex, String explanation) {
    }

    /** Removes every custom topic the player owns (their questions go with them); used when the account is deleted. */
    void deleteAllForOwner(UUID ownerId);

    /** Locks the owner's {@code app_user} row so concurrent imports by the same player run one at a time. */
    void lockOwner(UUID ownerId);

    Usage usage(UUID ownerId);

    boolean nameExists(UUID ownerId, String nameKey);

    void insertTopic(UUID id, UUID ownerId, String name, String nameKey, int questionCount, Instant now);

    void insertQuestions(UUID topicId, List<Row> rows);
}

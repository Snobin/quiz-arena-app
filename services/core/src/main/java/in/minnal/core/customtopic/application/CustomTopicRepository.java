package in.minnal.core.customtopic.application;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Storage for a player's private custom topics. Every method runs inside the caller's transaction. */
public interface CustomTopicRepository {

    record Usage(int topics, int questions) {
    }

    record Row(int position, String text, String lang, List<String> options, int answerIndex, String explanation) {
    }

    record Summary(UUID id, String name, int questionCount, Instant updatedAt) {
    }

    record Detail(UUID id, String name, int questionCount, int revision, Instant updatedAt, List<Row> rows) {
    }

    /** A topic's name and current revision, for Solo Practice. */
    record Header(UUID id, String name, int revision, int questionCount) {
    }

    /** One stored question with its id (ids change on every re-import). */
    record Stored(UUID id, Row row) {
    }

    /** The topic's header; empty when it does not exist or belongs to someone else (the same answer for both). */
    Optional<Header> header(UUID ownerId, UUID topicId);

    /** The ids of the topic's questions in position order. */
    List<UUID> questionIds(UUID topicId);

    /** One question of the topic; empty when it is gone (the topic was re-imported or deleted). */
    Optional<Stored> question(UUID topicId, UUID questionId);

    /** The owner's topics, newest {@code updated_at} first. */
    List<Summary> list(UUID ownerId);

    /** One topic with its questions in order; empty when it does not exist or belongs to someone else (the same answer for both). */
    Optional<Detail> find(UUID ownerId, UUID topicId);

    /** True when another of the owner's topics (not {@code excludeId}) already has this name key. */
    boolean nameExistsOther(UUID ownerId, String nameKey, UUID excludeId);

    /** Renames the topic, bumps its revision and sets {@code updated_at}; false when it is not the owner's. */
    boolean updateTopic(UUID ownerId, UUID topicId, String name, String nameKey, int questionCount, Instant now);

    void deleteQuestions(UUID topicId);

    /** Deletes the owner's topic (its questions go with it); false when it is not theirs or already gone. */
    boolean delete(UUID ownerId, UUID topicId);

    /** Removes every custom topic the player owns (their questions go with them); used when the account is deleted. */
    void deleteAllForOwner(UUID ownerId);

    /** Locks the owner's {@code app_user} row so concurrent imports by the same player run one at a time. */
    void lockOwner(UUID ownerId);

    Usage usage(UUID ownerId);

    boolean nameExists(UUID ownerId, String nameKey);

    void insertTopic(UUID id, UUID ownerId, String name, String nameKey, int questionCount, Instant now);

    void insertQuestions(UUID topicId, List<Row> rows);
}

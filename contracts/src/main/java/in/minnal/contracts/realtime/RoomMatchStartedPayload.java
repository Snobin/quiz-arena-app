package in.minnal.contracts.realtime;

import in.minnal.contracts.internal.QuestionSource;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * {@code ROOM_MATCH_STARTED} (broadcast on {@code /topic/room/{roomId}}): the room's match exists. Every client
 * subscribes to {@code /topic/match/{matchId}} and shows a 3-2-1 timed from {@code firstQuestionAt}, which is also
 * Q1's {@code startedAt}.
 *
 * @param mode            always {@code BATTLE_ROOM}
 * @param participants    every human of the match, host first, as in the lobby
 * @param topic           the topic block of the fetched set (core's name); a custom topic has no {@code topicId} or {@code subjectName}
 * @param firstQuestionAt the server instant Q1 opens: the start plus 3.5 s
 * @param questionSource  {@code BANK} or {@code CUSTOM} (Story 6.5a)
 */
public record RoomMatchStartedPayload(
        UUID roomId,
        UUID matchId,
        MatchMode mode,
        List<Participant> participants,
        int questionCount,
        TopicInfo topic,
        Instant firstQuestionAt,
        QuestionSource questionSource) {

    /** A bank-source room match. */
    public RoomMatchStartedPayload(UUID roomId, UUID matchId, MatchMode mode, List<Participant> participants,
            int questionCount, TopicInfo topic, Instant firstQuestionAt) {
        this(roomId, matchId, mode, participants, questionCount, topic, firstQuestionAt, QuestionSource.BANK);
    }

    public RoomMatchStartedPayload {
        participants = List.copyOf(participants);
    }
}

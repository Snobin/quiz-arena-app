package in.minnal.contracts.realtime;

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
 * @param topic           the topic block of the fetched set (core's name)
 * @param firstQuestionAt the server instant Q1 opens: the start plus 3.5 s
 */
public record RoomMatchStartedPayload(
        UUID roomId,
        UUID matchId,
        MatchMode mode,
        List<Participant> participants,
        int questionCount,
        TopicInfo topic,
        Instant firstQuestionAt) {

    public RoomMatchStartedPayload {
        participants = List.copyOf(participants);
    }
}

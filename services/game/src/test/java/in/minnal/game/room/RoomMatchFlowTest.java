package in.minnal.game.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import in.minnal.contracts.realtime.Destinations;
import in.minnal.game.match.application.MatchMetrics;
import in.minnal.game.platform.drain.DrainState;
import in.minnal.game.room.application.RoomMetrics;
import in.minnal.game.room.application.RoomRegistry;
import in.minnal.game.support.GameIntegrationTest;
import in.minnal.game.support.ManualRoomTimers;
import in.minnal.game.support.RecordingMatchCompletedPublisher;
import in.minnal.game.support.StompTestClient;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;

/**
 * Story 5.4 between real STOMP clients: the host's start (STARTING, the fetch, the failure and abandon paths), the match
 * (3.5 s to Q1, receipt-only acks, the scoreboard, forfeits), its end (room ENDED, code expired, nothing published) and
 * the abort. Room timers are manual; match timers run (the test profile shortens them), so the one real wait is the
 * 3.5 s countdown, and the test clock is advanced to it.
 */
class RoomMatchFlowTest extends GameIntegrationTest {

    static final Duration WAIT = Duration.ofSeconds(8);
    static final Duration GRACE = Duration.ofSeconds(10);
    static final String TOPIC = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    static final String CREATE = "{\"source\":{\"type\":\"BANK\",\"topicId\":\"" + TOPIC + "\"},\"questionCount\":5}";

    @Autowired
    RoomRegistry rooms;

    @Autowired
    ManualRoomTimers timers;

    @Autowired
    MeterRegistry meters;

    @Autowired
    DrainState drain;

    @Autowired
    RecordingMatchCompletedPublisher published;

    final List<StompTestClient> clients = new ArrayList<>();
    final List<String> subs = new ArrayList<>();

    @BeforeEach
    void coreAnswers() {
        CORE.reset();
    }

    @AfterEach
    void leave() {
        CORE.reset();
        clients.forEach(StompTestClient::close);
        await().atMost(Duration.ofSeconds(20)).until(() -> {
            timers.fire(GRACE::equals);
            return subs.stream().allMatch(sub -> participation.activityOf(sub).isEmpty());
        });
        timers.clear();
    }

    StompTestClient player(String sub, String name) {
        subs.add(sub);
        StompTestClient client = connect(profiledToken(sub, name));
        clients.add(client);
        return client;
    }

    /** A room of {@code size} humans (host first), each subscribed to the room topic; lobby updates drained. */
    Lobby lobby(int size) {
        String hostSub = newSub();
        StompTestClient host = player(hostSub, "Rajeev");
        host.send("/app/room/create", CREATE);
        JsonNode created = host.next("ROOM_JOINED");
        String roomId = created.get("payload").get("roomId").asString();
        String code = created.get("payload").get("code").asString();
        List<StompTestClient> all = new ArrayList<>(List.of(host));
        List<String> ids = new ArrayList<>(List.of(created.get("payload").get("selfParticipantId").asString()));
        host.subscribe(Destinations.roomTopic(UUID.fromString(roomId)));
        for (int i = 1; i < size; i++) {
            StompTestClient member = player(newSub(), "Student " + i);
            member.send("/app/room/join", "{\"code\":\"" + code + "\"}");
            ids.add(member.next("ROOM_JOINED").get("payload").get("selfParticipantId").asString());
            member.subscribe(Destinations.roomTopic(UUID.fromString(roomId)));
            all.add(member);
        }
        timers.fire(d -> d.equals(Duration.ofMillis(250)));
        for (StompTestClient each : all) {
            drainLobby(each, size);
        }
        return new Lobby(roomId, code, hostSub, all, ids);
    }

    /** Reads lobby updates until one shows {@code size} humans. */
    void drainLobby(StompTestClient client, int size) {
        await().atMost(WAIT).until(() -> {
            JsonNode update = client.nextBroadcast(Duration.ofSeconds(2));
            return update.get("type").asString().equals("ROOM_LOBBY_UPDATED")
                    && update.get("payload").get("room").get("humanCount").asInt() == size;
        });
    }

    record Lobby(String roomId, String code, String hostSub, List<StompTestClient> players, List<String> ids) {
        StompTestClient host() {
            return players.getFirst();
        }
    }

    static String answer(String matchId) {
        return "/app/match/" + matchId + "/answer";
    }

    /** The next frame of {@code type} on the topics {@code client} watches, skipping the others (a scoreboard, say). */
    static JsonNode broadcast(StompTestClient client, String type) {
        for (int i = 0; i < 30; i++) {
            JsonNode frame = client.nextBroadcast(Duration.ofSeconds(8));
            if (frame.get("type").asString().equals(type)) {
                return frame;
            }
        }
        throw new AssertionError("no " + type + " broadcast");
    }

    double started() {
        return meters.get(RoomMetrics.STARTED).tag("mode", "BATTLE_ROOM").counter().count();
    }

    @Test
    void aStartFetchesTheSetStartsOneMatchForEveryHumanAndEndsTheRoomWithNothingPublished() {
        int liveBefore = rooms.liveCount();
        double startedBefore = started();
        long humansBefore = meters.get(RoomMetrics.HUMANS).tag("mode", "BATTLE_ROOM").summary().count();
        Lobby room = lobby(3);

        room.host().send("/app/room/" + room.roomId() + "/start");
        // Everyone sees STARTING, then the match.
        for (StompTestClient each : room.players()) {
            JsonNode starting = each.nextBroadcast("ROOM_LOBBY_UPDATED");
            assertThat(starting.get("payload").get("phase").asString()).isEqualTo("STARTING");
            assertThat(starting.get("payload").get("room").get("humanCount").asInt()).isEqualTo(3);
        }
        // A repeat start while STARTING or IN_MATCH changes nothing.
        room.host().send("/app/room/" + room.roomId() + "/start");
        List<JsonNode> startedFrames = new ArrayList<>();
        for (StompTestClient each : room.players()) {
            startedFrames.add(each.nextBroadcast("ROOM_MATCH_STARTED"));
        }
        Instant now = clock.instant();
        JsonNode first = startedFrames.getFirst();
        JsonNode payload = first.get("payload");
        assertThat(payload.get("mode").asString()).isEqualTo("BATTLE_ROOM");
        assertThat(payload.get("roomId").asString()).isEqualTo(room.roomId());
        assertThat(payload.get("questionCount").asInt()).isEqualTo(5);
        assertThat(payload.get("topic").get("name").asString()).isEqualTo("Kerala History");
        assertThat(payload.get("participants")).hasSize(3);
        assertThat(payload.get("participants").get(0).get("kind").asString()).isEqualTo("USER");
        Instant firstQuestionAt = Instant.parse(payload.get("firstQuestionAt").asString());
        assertThat(Duration.between(now, firstQuestionAt)).isEqualTo(Duration.ofMillis(3500));
        String matchId = payload.get("matchId").asString();
        assertThat(matchId).isNotEqualTo(room.roomId());
        // Only one call to core, as the host, with the room's source and count.
        assertThat(CORE.calls()).singleElement().satisfies(call -> {
            assertThat(call.body().get("source").asString()).isEqualTo("BANK");
            assertThat(call.body().get("filters").get("category").asString()).isEqualTo("KERALA_PSC");
            assertThat(call.body().get("filters").get("topicId").asString()).isEqualTo(TOPIC);
            assertThat(call.body().get("count").asInt()).isEqualTo(5);
            assertThat(call.body().get("requesterId").asString()).isEqualTo(room.hostSub());
        });
        assertThat(started()).isEqualTo(startedBefore + 1);
        assertThat(meters.get(RoomMetrics.HUMANS).tag("mode", "BATTLE_ROOM").summary().count()).isEqualTo(humansBefore + 1);
        // A late join gets ROOM_STARTED and is never added.
        StompTestClient late = player(newSub(), "Late");
        late.send("/app/room/join", "{\"code\":\"" + room.code() + "\"}");
        late.error("ROOM_STARTED");

        for (StompTestClient each : room.players()) {
            each.subscribe(Destinations.matchTopic(UUID.fromString(matchId)));
        }
        // The countdown is 3.5 s of real time; the test clock jumps to Q1's instant.
        clock.advance(Duration.ofMillis(3500));
        List<StompTestClient> players = room.players();
        for (int q = 0; q < 5; q++) {
            for (StompTestClient each : players) {
                JsonNode opened = broadcast(each, "QUESTION_STARTED");
                if (q == 0) {
                    assertThat(Instant.parse(opened.get("payload").get("startedAt").asString())).isEqualTo(firstQuestionAt);
                }
                assertThat(opened.toString()).doesNotContain("answerIndex");
            }
            // The host and the first member answer; the receipt tells neither whether she was right.
            players.get(0).send(answer(matchId), "{\"questionIndex\":" + q + ",\"optionIndex\":" + (q % 4) + "}");
            JsonNode receipt = players.get(0).next("ANSWER_ACCEPTED");
            assertThat(receipt.get("payload").propertyNames()).containsExactly("questionIndex");
            players.get(1).send(answer(matchId), "{\"questionIndex\":" + q + ",\"optionIndex\":0}");
            players.get(1).next("ANSWER_ACCEPTED");
            JsonNode board = players.get(2).nextBroadcast("SCOREBOARD");
            assertThat(board.get("payload").propertyNames()).containsExactly("questionIndex", "answered");
            assertThat(board.toString()).doesNotContain("correct").doesNotContain("pickedIndex");
            for (StompTestClient each : players) {
                JsonNode revealed = broadcast(each, "QUESTION_REVEALED");
                assertThat(revealed.get("payload").get("results")).hasSize(3);
            }
        }
        for (StompTestClient each : players) {
            JsonNode ended = each.next("MATCH_ENDED");
            assertThat(ended.get("payload").get("mode").asString()).isEqualTo("BATTLE_ROOM");
            assertThat(ended.get("payload").get("participants")).hasSize(3);
        }
        // The room ended with its match: the code expired (a tombstone), the players are free, no completed event.
        for (String sub : subs.subList(0, 3)) {
            await().atMost(WAIT).until(() -> participation.activityOf(sub).isEmpty());
        }
        await().atMost(WAIT).until(() -> rooms.liveCount() == liveBefore);
        StompTestClient after = player(newSub(), "After");
        after.send("/app/room/join", "{\"code\":\"" + room.code() + "\"}");
        after.error("ROOM_EXPIRED");
        assertThat(published.of(UUID.fromString(matchId))).isEmpty();
    }

    @Test
    void aFailedFetchReturnsTheRoomToTheLobbyWithTheReasonAndJoinsAreAcceptedAgain() {
        Lobby room = lobby(2);

        CORE.status = 422;
        room.host().send("/app/room/" + room.roomId() + "/start");
        assertThat(broadcast(room.host(), "ROOM_LOBBY_UPDATED").get("payload").get("phase").asString()).isEqualTo("STARTING");
        JsonNode failed = broadcast(room.players().get(1), "ROOM_START_FAILED");
        assertThat(failed.get("payload").get("reason").asString()).isEqualTo("TOPIC_UNAVAILABLE");
        assertThat(failed.toString()).doesNotContain("422");
        assertThat(broadcast(room.host(), "ROOM_START_FAILED").get("payload").get("reason").asString()).isEqualTo("TOPIC_UNAVAILABLE");
        assertThat(participation.activityOf(subs.get(0))).isPresent();

        // Joins are accepted again.
        StompTestClient third = player(newSub(), "Student 3");
        third.send("/app/room/join", "{\"code\":\"" + room.code() + "\"}");
        third.next("ROOM_JOINED");

        CORE.status = 500;
        room.host().send("/app/room/" + room.roomId() + "/start");
        assertThat(broadcast(room.host(), "ROOM_START_FAILED").get("payload").get("reason").asString()).isEqualTo("UNAVAILABLE");

        // A set slower than the 2 s timeout fails the same way.
        CORE.status = 200;
        CORE.delayMs = 2_600;
        room.host().send("/app/room/" + room.roomId() + "/start");
        assertThat(broadcast(room.host(), "ROOM_START_FAILED").get("payload").get("reason").asString()).isEqualTo("UNAVAILABLE");
        assertThat(rooms.liveCount()).isPositive();
        CORE.delayMs = 0;
        third.send("/app/room/" + room.roomId() + "/leave");
        room.host().send("/app/room/" + room.roomId() + "/leave");
    }

    @Test
    void aPlayerWhoLeavesDuringStartingLeavesTheLobbyWaitingForOneMoreWhenTheFetchLands() {
        Lobby room = lobby(2);
        CORE.delayMs = 700;

        room.host().send("/app/room/" + room.roomId() + "/start");
        assertThat(broadcast(room.host(), "ROOM_LOBBY_UPDATED").get("payload").get("phase").asString()).isEqualTo("STARTING");
        room.players().get(1).send("/app/room/" + room.roomId() + "/leave");
        await().atMost(WAIT).until(() -> participation.activityOf(subs.get(1)).isEmpty());

        JsonNode back = broadcast(room.host(), "ROOM_LOBBY_UPDATED");
        assertThat(back.get("payload").get("phase").asString()).isEqualTo("LOBBY");
        assertThat(back.get("payload").get("room").get("humanCount").asInt()).isEqualTo(1);
        // No match was made, and a start now is refused for want of players.
        room.host().send("/app/room/" + room.roomId() + "/start");
        room.host().error("NOT_ENOUGH_PLAYERS");
        room.host().send("/app/room/" + room.roomId() + "/leave");
    }

    @Test
    void everyoneLeavingBeforeTheFirstRevealAbortsTheMatchAndEndsTheRoomWithATombstone() {
        double abortedBefore = meters.get(MatchMetrics.ABORTED).counter().count();
        int liveBefore = rooms.liveCount();
        Lobby room = lobby(2);
        room.host().send("/app/room/" + room.roomId() + "/start");
        String matchId = broadcast(room.host(), "ROOM_MATCH_STARTED").get("payload").get("matchId").asString();
        broadcast(room.players().get(1), "ROOM_MATCH_STARTED");
        for (StompTestClient each : room.players()) {
            each.subscribe(Destinations.matchTopic(UUID.fromString(matchId)));
        }

        for (StompTestClient each : room.players()) {
            each.send("/app/match/" + matchId + "/leave");
        }

        JsonNode aborted = broadcast(room.host(), "MATCH_ABORTED");
        assertThat(aborted.get("payload").get("reason").asString()).isEqualTo("ALL_LEFT");
        await().atMost(WAIT).until(() -> rooms.liveCount() == liveBefore);
        assertThat(meters.get(MatchMetrics.ABORTED).counter().count()).isEqualTo(abortedBefore + 1);
        assertThat(published.of(UUID.fromString(matchId))).isEmpty();
        room.host().expectNothing(Duration.ofMillis(300)); // no MATCH_ENDED, no ROOM_CLOSED
        StompTestClient after = player(newSub(), "After");
        after.send("/app/room/join", "{\"code\":\"" + room.code() + "\"}");
        after.error("ROOM_EXPIRED");
    }
}

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
 * (3.5 s to Q1, receipt-only acks, the scoreboard, forfeits), its end (room ENDED, code expired, one completed event) and
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
        return lobby(size, CREATE);
    }

    Lobby lobby(int size, String create) {
        String hostSub = newSub();
        StompTestClient host = player(hostSub, "Rajeev");
        host.send("/app/room/create", create);
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
    void aStartFetchesTheSetStartsOneMatchForEveryHumanAndEndsTheRoomWithOneCompletedEvent() {
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
        // The room ended with its match: the code expired (a tombstone), the players are free, one completed event.
        for (String sub : subs.subList(0, 3)) {
            await().atMost(WAIT).until(() -> participation.activityOf(sub).isEmpty());
        }
        await().atMost(WAIT).until(() -> rooms.liveCount() == liveBefore);
        StompTestClient after = player(newSub(), "After");
        after.send("/app/room/join", "{\"code\":\"" + room.code() + "\"}");
        after.error("ROOM_EXPIRED");
        List<in.minnal.contracts.events.MatchCompletedEvent> events = published.of(UUID.fromString(matchId));
        assertThat(events).hasSize(1);
        assertThat(events.getFirst().roomId()).isNotNull();
        assertThat(events.getFirst().rated()).isTrue();
        assertThat(events.getFirst().queueWaitMs()).isNull();
        assertThat(events.getFirst().participants()).allSatisfy(p -> assertThat(p.kind().name()).isEqualTo("USER"));
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

    /** Starts the room's match, lets it run unanswered to its end and waits until the room is gone and everyone is free. */
    String playToEnd(Lobby room) {
        room.host().send("/app/room/" + room.roomId() + "/start");
        String matchId = broadcast(room.host(), "ROOM_MATCH_STARTED").get("payload").get("matchId").asString();
        for (StompTestClient each : room.players()) {
            each.subscribe(Destinations.matchTopic(UUID.fromString(matchId)));
        }
        clock.advance(Duration.ofMillis(3500));
        for (StompTestClient each : room.players()) {
            each.next("MATCH_ENDED");
        }
        for (int i = 0; i < room.players().size(); i++) {
            String sub = subs.get(subs.size() - room.players().size() + i);
            await().atMost(WAIT).until(() -> participation.activityOf(sub).isEmpty());
        }
        await().atMost(WAIT).until(() -> rooms.liveCount() == 0);
        return matchId;
    }

    @Test
    void theHostPlayingAgainOpensOneSuccessorLobbyAndEveryOtherPlayerIsToldItsCode() {
        Lobby room = lobby(3);
        String matchId = playToEnd(room);

        // A player who is not the host is refused and nothing changes.
        room.players().get(1).send("/app/room/" + room.roomId() + "/playAgain");
        room.players().get(1).error("NOT_HOST");
        assertThat(rooms.liveCount()).isZero();

        room.host().send("/app/room/" + room.roomId() + "/playAgain");
        JsonNode lobby = room.host().next("ROOM_JOINED");
        String code = lobby.get("payload").get("code").asString();
        assertThat(lobby.get("payload").get("role").asString()).isEqualTo("HOST");
        assertThat(code).isNotEqualTo(room.code());
        assertThat(lobby.get("payload").get("room").get("source").get("topicId").asString()).isEqualTo(TOPIC);
        assertThat(lobby.get("payload").get("room").get("questionCount").asInt()).isEqualTo(5);
        assertThat(lobby.get("payload").get("roomId").asString()).isNotEqualTo(room.roomId());
        for (StompTestClient member : room.players().subList(1, 3)) {
            JsonNode notice = member.next("ROOM_SUCCEEDED");
            assertThat(notice.get("matchId").asString()).isEqualTo(matchId);
            assertThat(notice.get("payload").get("code").asString()).isEqualTo(code);
            assertThat(notice.get("payload").get("hostDisplayName").asString()).isEqualTo("Rajeev");
            assertThat(notice.get("payload").get("questionCount").asInt()).isEqualTo(5);
            assertThat(notice.get("payload").get("source").get("topicId").asString()).isEqualTo(TOPIC);
        }

        // A second tap gives the same lobby and no second room.
        room.host().send("/app/room/" + room.roomId() + "/playAgain");
        assertThat(room.host().next("ROOM_JOINED").get("payload").get("code").asString()).isEqualTo(code);
        assertThat(rooms.liveCount()).isEqualTo(1);

        // One tap for a player: the Story 5.3 join with that code.
        room.players().get(1).send("/app/room/join", "{\"code\":\"" + code + "\"}");
        assertThat(room.players().get(1).next("ROOM_JOINED").get("payload").get("role").asString()).isEqualTo("MEMBER");
        assertThat(rooms.liveCount()).isEqualTo(1);
        room.host().send("/app/room/" + lobby.get("payload").get("roomId").asString() + "/leave");
        await().atMost(WAIT).until(() -> rooms.liveCount() == 0);
    }

    @Test
    void playAgainAfterTheWindowOrForAnUnknownRoomIsRefusedAndCreatesNothing() {
        Lobby room = lobby(2);
        playToEnd(room);

        room.host().send("/app/room/" + UUID.randomUUID() + "/playAgain");
        room.host().error("ROOM_NOT_FOUND");
        clock.advance(Duration.ofSeconds(61));
        room.host().send("/app/room/" + room.roomId() + "/playAgain");
        room.host().error("ROOM_NOT_FOUND");
        assertThat(rooms.liveCount()).isZero();
    }

    @Test
    void aHostAlreadyInAnotherRoomGetsTheBusyErrorAndNothingIsCreated() {
        Lobby room = lobby(2);
        playToEnd(room);
        room.host().send("/app/room/create", CREATE);
        String other = room.host().next("ROOM_JOINED").get("payload").get("roomId").asString();

        room.host().send("/app/room/" + room.roomId() + "/playAgain");
        room.host().error("ALREADY_IN_MATCH");
        assertThat(rooms.liveCount()).isEqualTo(1);
        room.host().send("/app/room/" + other + "/leave");
        await().atMost(WAIT).until(() -> rooms.liveCount() == 0);
    }

    /** As {@link #playToEnd}, but {@code forfeiter} leaves the match after Q1 opened; the others let it run out. */
    String playWithForfeit(Lobby room, int forfeiter) {
        room.host().send("/app/room/" + room.roomId() + "/start");
        String matchId = broadcast(room.host(), "ROOM_MATCH_STARTED").get("payload").get("matchId").asString();
        for (StompTestClient each : room.players()) {
            each.subscribe(Destinations.matchTopic(UUID.fromString(matchId)));
        }
        clock.advance(Duration.ofMillis(3500));
        broadcast(room.players().get(forfeiter), "QUESTION_STARTED");
        room.players().get(forfeiter).send("/app/match/" + matchId + "/leave");
        for (StompTestClient each : room.players()) {
            each.next("MATCH_ENDED");
        }
        for (int i = 0; i < room.players().size(); i++) {
            String sub = subs.get(subs.size() - room.players().size() + i);
            await().atMost(WAIT).until(() -> participation.activityOf(sub).isEmpty());
        }
        await().atMost(WAIT).until(() -> rooms.liveCount() == 0);
        return matchId;
    }

    @Test
    void aHostWhoForfeitedMidMatchCanStillPlayAgainAndMembersAreToldTheHostsOwnName() {
        Lobby room = lobby(3);
        playWithForfeit(room, 0);

        room.host().send("/app/room/" + room.roomId() + "/playAgain");
        JsonNode lobby = room.host().next("ROOM_JOINED");
        assertThat(lobby.get("payload").get("role").asString()).isEqualTo("HOST");
        String code = lobby.get("payload").get("code").asString();
        assertThat(code).isNotEqualTo(room.code());
        for (StompTestClient member : room.players().subList(1, 3)) {
            JsonNode notice = member.next("ROOM_SUCCEEDED");
            assertThat(notice.get("payload").get("code").asString()).isEqualTo(code);
            assertThat(notice.get("payload").get("hostDisplayName").asString()).isEqualTo("Rajeev");
        }
        assertThat(rooms.liveCount()).isEqualTo(1);
        room.host().send("/app/room/" + lobby.get("payload").get("roomId").asString() + "/leave");
        await().atMost(WAIT).until(() -> rooms.liveCount() == 0);
    }

    @Test
    void aMemberWhoForfeitedStillGetsTheNoticeAndTheHostsNameIsTheHostsNotHers() {
        Lobby room = lobby(3);
        playWithForfeit(room, 2);

        room.host().send("/app/room/" + room.roomId() + "/playAgain");
        JsonNode lobby = room.host().next("ROOM_JOINED");
        String code = lobby.get("payload").get("code").asString();
        // Today every participant of the match is told, a forfeiter included (her session is still open on results).
        for (StompTestClient member : room.players().subList(1, 3)) {
            JsonNode notice = member.next("ROOM_SUCCEEDED");
            assertThat(notice.get("payload").get("code").asString()).isEqualTo(code);
            assertThat(notice.get("payload").get("hostDisplayName").asString()).isEqualTo("Rajeev");
        }
        room.host().send("/app/room/" + lobby.get("payload").get("roomId").asString() + "/leave");
        await().atMost(WAIT).until(() -> rooms.liveCount() == 0);
    }

    // Story 6.5a: a room on the host's own custom topic.

    static final String CUSTOM_TOPIC = "6f1b2c3d-1111-4222-8333-444455556666";
    static final String CUSTOM_CREATE = "{\"source\":{\"type\":\"CUSTOM\",\"customTopicId\":\"" + CUSTOM_TOPIC
            + "\",\"topicName\":\"Renaissance\"},\"questionCount\":5}";

    @Test
    void aCustomRoomStartsAsTheHostThroughCoreAndEndsUnratedWithTheCustomSourceEverywhere() {
        Lobby room = lobby(2, CUSTOM_CREATE);
        room.host().send("/app/room/" + room.roomId() + "/start");
        JsonNode started = broadcast(room.players().get(1), "ROOM_MATCH_STARTED").get("payload");
        assertThat(started.get("questionSource").asString()).isEqualTo("CUSTOM");
        assertThat(started.get("topic").get("name").asString()).isEqualTo("Renaissance (core)");
        assertThat(started.get("topic").has("topicId")).isFalse();
        assertThat(started.get("topic").has("subjectName")).isFalse();
        assertThat(CORE.calls()).singleElement().satisfies(call -> {
            assertThat(call.body().get("source").asString()).isEqualTo("CUSTOM");
            assertThat(call.body().get("customTopicId").asString()).isEqualTo(CUSTOM_TOPIC);
            assertThat(call.body().path("filters").isMissingNode() || call.body().get("filters").isNull()).isTrue();
            assertThat(call.body().get("count").asInt()).isEqualTo(5);
            assertThat(call.body().get("requesterId").asString()).isEqualTo(room.hostSub());
        });
        String matchId = started.get("matchId").asString();
        for (StompTestClient each : room.players()) {
            each.subscribe(Destinations.matchTopic(UUID.fromString(matchId)));
        }
        clock.advance(Duration.ofMillis(3500));
        for (StompTestClient each : room.players()) {
            JsonNode ended = each.next("MATCH_ENDED").get("payload");
            assertThat(ended.get("questionSource").asString()).isEqualTo("CUSTOM");
            assertThat(ended.get("topic").get("name").asString()).isEqualTo("Renaissance (core)");
        }
        for (int i = 0; i < 2; i++) {
            String sub = subs.get(subs.size() - 2 + i);
            await().atMost(WAIT).until(() -> participation.activityOf(sub).isEmpty());
        }
        var events = published.of(UUID.fromString(matchId));
        assertThat(events).hasSize(1);
        assertThat(events.getFirst().questionSource().name()).isEqualTo("CUSTOM");
        assertThat(events.getFirst().rated()).isFalse();
        assertThat(events.getFirst().mode().name()).isEqualTo("BATTLE_ROOM");
    }

    @Test
    void aCustomLobbyIsUnratedAndShowsTheHostsTopicNameWithoutAskingCore() {
        String hostSub = newSub();
        StompTestClient host = player(hostSub, "Rajeev");
        host.send("/app/room/create", CUSTOM_CREATE);
        JsonNode room = host.next("ROOM_JOINED").get("payload").get("room");
        assertThat(room.get("rated").asBoolean()).isFalse();
        assertThat(room.get("source").get("type").asString()).isEqualTo("CUSTOM");
        assertThat(room.get("source").get("customTopicId").asString()).isEqualTo(CUSTOM_TOPIC);
        assertThat(room.get("source").get("topicName").asString()).isEqualTo("Renaissance");
        assertThat(room.get("source").has("topicId")).isFalse();
        assertThat(CORE.calls()).isEmpty();
    }

    @Test
    void aGoneCustomTopicIsSourceUnavailableAndAShrunkOneIsTopicUnavailableAndNobodySeesARawError() {
        Lobby room = lobby(2, CUSTOM_CREATE);

        CORE.status = 404;
        room.host().send("/app/room/" + room.roomId() + "/start");
        JsonNode gone = broadcast(room.players().get(1), "ROOM_START_FAILED");
        assertThat(gone.get("payload").get("reason").asString()).isEqualTo("SOURCE_UNAVAILABLE");
        assertThat(gone.toString()).doesNotContain("404");
        assertThat(broadcast(room.host(), "ROOM_START_FAILED").get("payload").get("reason").asString()).isEqualTo("SOURCE_UNAVAILABLE");

        CORE.status = 422;
        room.host().send("/app/room/" + room.roomId() + "/start");
        assertThat(broadcast(room.host(), "ROOM_START_FAILED").get("payload").get("reason").asString()).isEqualTo("TOPIC_UNAVAILABLE");

        // The room is still a lobby, with its custom source.
        assertThat(participation.activityOf(subs.get(0))).isPresent();
        room.players().get(1).send("/app/room/" + room.roomId() + "/leave");
        room.host().send("/app/room/" + room.roomId() + "/leave");
        await().atMost(WAIT).until(() -> rooms.liveCount() == 0);
    }

    @Test
    void playAgainKeepsTheCustomSourceAndTheNextStartChecksCoreAgain() {
        Lobby room = lobby(2, CUSTOM_CREATE);
        String matchId = playToEnd(room);
        assertThat(CORE.calls()).hasSize(1);

        room.host().send("/app/room/" + room.roomId() + "/playAgain");
        JsonNode lobby = room.host().next("ROOM_JOINED");
        JsonNode source = lobby.get("payload").get("room").get("source");
        assertThat(source.get("type").asString()).isEqualTo("CUSTOM");
        assertThat(source.get("customTopicId").asString()).isEqualTo(CUSTOM_TOPIC);
        assertThat(lobby.get("payload").get("room").get("rated").asBoolean()).isFalse();
        assertThat(lobby.get("payload").get("room").get("questionCount").asInt()).isEqualTo(5);
        JsonNode notice = room.players().get(1).next("ROOM_SUCCEEDED");
        assertThat(notice.get("matchId").asString()).isEqualTo(matchId);
        assertThat(notice.get("payload").get("source").get("type").asString()).isEqualTo("CUSTOM");
        assertThat(notice.get("payload").get("source").get("customTopicId").asString()).isEqualTo(CUSTOM_TOPIC);

        // Nothing was asked of core by play again itself; the start does.
        assertThat(CORE.calls()).hasSize(1);
        String successor = lobby.get("payload").get("roomId").asString();
        room.host().send("/app/room/" + successor + "/leave");
        await().atMost(WAIT).until(() -> rooms.liveCount() == 0);
    }
}

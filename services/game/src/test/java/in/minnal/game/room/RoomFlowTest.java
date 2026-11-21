package in.minnal.game.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import in.minnal.contracts.realtime.Destinations;
import in.minnal.game.platform.session.Activity;
import in.minnal.game.platform.session.DeletedUsers;
import in.minnal.game.room.application.RoomMetrics;
import in.minnal.game.room.application.RoomRegistry;
import in.minnal.game.support.GameIntegrationTest;
import in.minnal.game.support.ManualRoomTimers;
import in.minnal.game.support.RawStomp;
import in.minnal.game.support.StompTestClient;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;

/**
 * Stories 5.1 and 5.3 between real STOMP clients: create, join, the gate, configure, leave, the graces, expiry, the
 * start checks and the member-only room topic. Room timers are {@link ManualRoomTimers}, so a 24 h expiry and a 10 s grace need no sleeps.
 */
class RoomFlowTest extends GameIntegrationTest {

    static final Duration WAIT = Duration.ofSeconds(5);
    static final Duration GRACE = Duration.ofSeconds(10);
    static final String TOPIC = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    static final String CREATE = "{\"source\":{\"type\":\"BANK\",\"topicId\":\"" + TOPIC + "\"},\"questionCount\":10}";

    @Autowired
    RoomRegistry rooms;

    @Autowired
    ManualRoomTimers timers;

    @Autowired
    MeterRegistry meters;

    @Autowired
    DeletedUsers deleted;

    final List<StompTestClient> clients = new ArrayList<>();
    final List<String> subs = new ArrayList<>();

    @BeforeEach
    void coreIsQuiet() {
        CORE.reset();
    }

    @AfterEach
    void closeEveryRoom() {
        clients.forEach(StompTestClient::close);
        // A dropped host's room closes when its grace fires; keep firing until every host is free.
        await().atMost(Duration.ofSeconds(15)).until(() -> {
            timers.fire(GRACE::equals);
            return subs.stream().allMatch(sub -> participation.activityOf(sub).isEmpty());
        });
        timers.clear();
    }

    StompTestClient host(String sub) {
        subs.add(sub);
        StompTestClient client = connect(profiledToken(sub, "Rajeev"));
        clients.add(client);
        return client;
    }

    /** A host with an open lobby: returns the ROOM_JOINED message. */
    JsonNode create(StompTestClient host) {
        host.send("/app/room/create", CREATE);
        return host.next("ROOM_JOINED");
    }

    static String roomIdOf(JsonNode joined) {
        return joined.get("payload").get("roomId").asString();
    }

    double live() {
        return meters.get(RoomMetrics.LIVE).tag("mode", "BATTLE_ROOM").gauge().value();
    }

    double created() {
        return meters.get(RoomMetrics.CREATED).tag("mode", "BATTLE_ROOM").counter().count();
    }

    @Test
    void createOpensALobbyAndRepliesRoomJoinedToTheHost() {
        String sub = newSub();
        double liveBefore = live();
        double createdBefore = created();
        StompTestClient anju = host(sub);

        JsonNode joined = create(anju);

        String roomId = roomIdOf(joined);
        assertThat(joined.get("roomId").asString()).isEqualTo(roomId);
        assertThat(joined.has("matchId")).isFalse();
        assertThat(joined.get("refSeq").asLong()).isZero();
        JsonNode payload = joined.get("payload");
        assertThat(payload.get("code").asString()).matches("[A-HJKMNP-Z2-9]{6}");
        assertThat(payload.get("role").asString()).isEqualTo("HOST");
        JsonNode room = payload.get("room");
        assertThat(room.get("source").get("type").asString()).isEqualTo("BANK");
        assertThat(room.get("source").get("topicId").asString()).isEqualTo(TOPIC);
        assertThat(room.get("source").get("topicName")).isNull();
        assertThat(room.get("questionCount").asInt()).isEqualTo(10);
        assertThat(room.get("rated").asBoolean()).isTrue();
        assertThat(room.get("expiresAt").asString()).isEqualTo(clock.instant().plus(Duration.ofHours(24)).toString());
        assertThat(room.get("humanCount").asInt()).isEqualTo(1);
        JsonNode host = room.get("participants").get(0);
        assertThat(host.get("displayName").asString()).isEqualTo("Rajeev");
        assertThat(host.get("kind").asString()).isEqualTo("USER");
        assertThat(room.get("hostParticipantId").asString()).isEqualTo(host.get("participantId").asString())
                .isEqualTo(payload.get("selfParticipantId").asString())
                .isNotEqualTo(sub); // never her sub
        assertThat(participation.activityOf(sub)).contains(new Activity.InRoom(UUID.fromString(roomId)));
        assertThat(live()).isEqualTo(liveBefore + 1);
        assertThat(created()).isEqualTo(createdBefore + 1);
        // One pending expiry, 24 h away; no call to core was made for the topic.
        assertThat(timers.pending()).anyMatch(t -> t.delay().equals(Duration.ofHours(24)));
        assertThat(CORE.calls()).isEmpty();
    }

    @Test
    void everyRoomHasItsOwnIdAndCode() {
        StompTestClient a = host(newSub());
        StompTestClient b = host(newSub());
        JsonNode first = create(a);
        JsonNode second = create(b);
        assertThat(roomIdOf(first)).isNotEqualTo(roomIdOf(second));
        assertThat(first.get("payload").get("code").asString()).isNotEqualTo(second.get("payload").get("code").asString());
    }

    @Test
    void aBadConfigurationMakesNoRoom() {
        String sub = newSub();
        subs.add(sub);
        String source = "\"source\":{\"type\":\"BANK\",\"topicId\":\"" + TOPIC + "\"}";
        double createdBefore = created();
        String[][] cases = {
                {"{" + source + "}", "INVALID_ROOM_CONFIG"},
                {"{" + source + ",\"questionCount\":4}", "INVALID_ROOM_CONFIG"},
                {"{" + source + ",\"questionCount\":31}", "INVALID_ROOM_CONFIG"},
                {"{" + source + ",\"questionCount\":\"10\"}", "INVALID_ROOM_CONFIG"},
                {"{" + source + ",\"questionCount\":10.5}", "INVALID_ROOM_CONFIG"},
                {"{\"questionCount\":10}", "INVALID_ROOM_CONFIG"},
                {"not json", "INVALID_ROOM_CONFIG"},
                {"{\"source\":{\"type\":\"BANK\",\"topicId\":\"nope\"},\"questionCount\":10}", "INVALID_TOPIC"},
                {"{\"source\":{\"type\":\"BANK\"},\"questionCount\":10}", "INVALID_TOPIC"},
                {"{\"source\":{\"type\":\"CUSTOM\",\"customTopicId\":\"" + TOPIC + "\"},\"questionCount\":10}", "SOURCE_NOT_AVAILABLE"},
        };
        for (String[] bad : cases) {
            // A connection each: ten frames in a second would trip the inbound rate limit.
            try (StompTestClient anju = connect(profiledToken(sub, "Rajeev"))) {
                anju.send("/app/room/create", bad[0]);
                anju.error(bad[1]);
                assertThat(participation.activityOf(sub)).as(bad[0]).isEmpty();
            }
        }
        assertThat(created()).isEqualTo(createdBefore);
        // The sub is still free: a good create works.
        create(host(sub));
    }

    @Test
    void aGuestAnIncompleteProfileAndADeletedAccountAreRefusedAndNothingChanges() {
        String guestSub = newSub();
        String freshSub = newSub();
        String deletedSub = newSub();
        subs.addAll(List.of(guestSub, freshSub, deletedSub));
        StompTestClient guest = connect(guestToken(guestSub));
        StompTestClient fresh = connect(userToken(freshSub, "Biju")); // a token with no profileComplete claim
        StompTestClient gone = connect(profiledToken(deletedSub, "Chitra"));
        clients.addAll(List.of(guest, fresh, gone));
        deleted.add(deletedSub);
        double createdBefore = created();

        guest.send("/app/room/create", CREATE);
        guest.error("FORBIDDEN_MODE");
        fresh.send("/app/room/create", CREATE);
        fresh.error("PROFILE_REQUIRED");
        gone.send("/app/room/create", CREATE);
        gone.error("UNAUTHENTICATED");

        for (String sub : subs) {
            assertThat(participation.activityOf(sub)).isEmpty();
        }
        assertThat(created()).isEqualTo(createdBefore);
    }

    @Test
    void aProfileCompleteFalseClaimIsPROFILE_REQUIRED() {
        String sub = newSub();
        subs.add(sub);
        StompTestClient client = connect(JWKS.token(c -> c.subject(sub).claim("roles", List.of("USER")).claim("profileComplete", false)));
        clients.add(client);
        client.send("/app/room/create", CREATE);
        client.error("PROFILE_REQUIRED");
    }

    @Test
    void aBusySubGetsAlreadyInMatchWithTheRoomMatchOrNothing() {
        String sub = newSub();
        StompTestClient anju = host(sub);
        JsonNode joined = create(anju);
        String roomId = roomIdOf(joined);

        // In this lobby: a second create (and a Quick join) names the room.
        anju.send("/app/room/create", CREATE);
        JsonNode busy = anju.error("ALREADY_IN_MATCH");
        assertThat(busy.get("roomId").asString()).isEqualTo(roomId);
        assertThat(busy.get("payload").get("roomId").asString()).isEqualTo(roomId);
        assertThat(busy.has("matchId")).isFalse();
        anju.join();
        assertThat(anju.error("ALREADY_IN_MATCH").get("payload").get("roomId").asString()).isEqualTo(roomId);
        assertThat(participation.activityOf(sub)).contains(new Activity.InRoom(UUID.fromString(roomId)));

        // Queued, and in a match.
        String queued = newSub();
        String playing = newSub();
        StompTestClient biju = host(queued);
        StompTestClient chitra = host(playing);
        participation.claim(queued, new Activity.Queued(in.minnal.contracts.realtime.MatchMode.QUICK));
        UUID matchId = UUID.randomUUID();
        participation.claim(playing, new Activity.InMatch(matchId));
        try {
            biju.send("/app/room/create", CREATE);
            JsonNode queuedBusy = biju.error("ALREADY_IN_MATCH");
            assertThat(queuedBusy.has("roomId")).isFalse();
            assertThat(queuedBusy.has("matchId")).isFalse();
            chitra.send("/app/room/create", CREATE);
            JsonNode playingBusy = chitra.error("ALREADY_IN_MATCH");
            assertThat(playingBusy.get("matchId").asString()).isEqualTo(matchId.toString());
            assertThat(playingBusy.get("payload").get("matchId").asString()).isEqualTo(matchId.toString());
            assertThat(playingBusy.has("roomId")).isFalse();
        } finally {
            participation.release(queued, new Activity.Queued(in.minnal.contracts.realtime.MatchMode.QUICK));
            participation.release(playing, new Activity.InMatch(matchId));
        }
    }

    @Test
    void theHostConfiguresAndTheLobbyUpdateCarriesTheNextSeq() {
        StompTestClient anju = host(newSub());
        String roomId = roomIdOf(create(anju));
        anju.subscribe(Destinations.roomTopic(UUID.fromString(roomId)));
        String otherTopic = UUID.randomUUID().toString();

        anju.send("/app/room/" + roomId + "/configure", "{\"questionCount\":20}");
        JsonNode first = anju.nextBroadcast("ROOM_LOBBY_UPDATED");
        assertThat(first.get("seq").asLong()).isEqualTo(1);
        assertThat(first.get("roomId").asString()).isEqualTo(roomId);
        assertThat(first.get("payload").get("room").get("questionCount").asInt()).isEqualTo(20);
        assertThat(first.get("payload").get("room").get("source").get("topicId").asString()).isEqualTo(TOPIC);

        anju.send("/app/room/" + roomId + "/configure",
                "{\"source\":{\"type\":\"BANK\",\"topicId\":\"" + otherTopic + "\"},\"questionCount\":7}");
        JsonNode second = anju.nextBroadcast("ROOM_LOBBY_UPDATED");
        assertThat(second.get("seq").asLong()).isEqualTo(2);
        JsonNode room = second.get("payload").get("room");
        assertThat(room.get("questionCount").asInt()).isEqualTo(7);
        assertThat(room.get("source").get("topicId").asString()).isEqualTo(otherTopic);

        // Invalid: refused to the host, nothing broadcast, nothing changed.
        anju.send("/app/room/" + roomId + "/configure", "{\"questionCount\":3}");
        assertThat(anju.error("INVALID_ROOM_CONFIG").get("roomId").asString()).isEqualTo(roomId);
        anju.send("/app/room/" + roomId + "/configure", "{\"source\":{\"type\":\"CUSTOM\"}}");
        anju.error("SOURCE_NOT_AVAILABLE");
        anju.send("/app/room/" + roomId + "/configure", "{}");
        anju.error("INVALID_ROOM_CONFIG");
        anju.send("/app/room/" + roomId + "/configure", "{\"questionCount\":8}");
        JsonNode third = anju.nextBroadcast("ROOM_LOBBY_UPDATED");
        assertThat(third.get("seq").asLong()).isEqualTo(3);
        assertThat(third.get("payload").get("room").get("source").get("topicId").asString()).isEqualTo(otherTopic);
    }

    @Test
    void aConfigureFromAnyoneButTheHostGetsNotHostAndChangesNothing() {
        StompTestClient anju = host(newSub());
        String roomId = roomIdOf(create(anju));
        anju.subscribe(Destinations.roomTopic(UUID.fromString(roomId)));
        StompTestClient stranger = host(newSub());

        stranger.send("/app/room/" + roomId + "/configure", "{\"questionCount\":20}");
        assertThat(stranger.error("NOT_HOST").get("roomId").asString()).isEqualTo(roomId);
        stranger.send("/app/room/" + UUID.randomUUID() + "/configure", "{\"questionCount\":20}");
        stranger.error("NOT_HOST");
        stranger.send("/app/room/garbage/configure", "{\"questionCount\":20}");
        stranger.error("BAD_REQUEST");

        // The host's next configure is still seq 1: the refused ones changed and broadcast nothing.
        anju.send("/app/room/" + roomId + "/configure", "{\"questionCount\":9}");
        JsonNode update = anju.nextBroadcast("ROOM_LOBBY_UPDATED");
        assertThat(update.get("seq").asLong()).isEqualTo(1);
        assertThat(update.get("payload").get("room").get("questionCount").asInt()).isEqualTo(9);
    }

    @Test
    void aHostAloneWhoLeavesClosesTheRoomAndFreesHerAndTheCode() {
        String sub = newSub();
        double liveBefore = live();
        StompTestClient anju = host(sub);
        JsonNode joined = create(anju);
        String roomId = roomIdOf(joined);
        String code = joined.get("payload").get("code").asString();
        anju.subscribe(Destinations.roomTopic(UUID.fromString(roomId)));

        anju.send("/app/room/" + roomId + "/leave");

        JsonNode closed = anju.nextBroadcast("ROOM_CLOSED");
        assertThat(closed.get("payload").get("reason").asString()).isEqualTo("HOST_LEFT");
        assertThat(closed.get("roomId").asString()).isEqualTo(roomId);
        assertThat(anju.next("ROOM_CLOSED").get("payload").get("reason").asString()).isEqualTo("HOST_LEFT");
        await().atMost(WAIT).until(() -> participation.activityOf(sub).isEmpty());
        assertThat(live()).isEqualTo(liveBefore);
        assertThat(rooms.isMember(UUID.fromString(roomId), sub)).isFalse();
        assertThat(timers.pending()).isEmpty();
        // Free for anything at once: she can create again (a new room, its own id).
        JsonNode again = create(anju);
        assertThat(roomIdOf(again)).isNotEqualTo(roomId);
        assertThat(code).matches("[A-HJKMNP-Z2-9]{6}");
        // Leaving a room that is gone is ignored.
        anju.send("/app/room/" + roomId + "/leave");
        anju.expectNothing(Duration.ofMillis(200));
    }

    @Test
    void aDroppedHostHasTenSecondsAndAReconnectGetsRoomJoinedBack() throws Exception {
        String sub = newSub();
        StompTestClient anju = host(sub);
        JsonNode joined = create(anju);
        String roomId = roomIdOf(joined);
        anju.close();
        await().atMost(WAIT).until(() -> timers.pending().stream().anyMatch(t -> t.delay().equals(GRACE)));
        assertThat(participation.activityOf(sub)).isPresent();

        StompTestClient back = host(sub);
        JsonNode again = back.next("ROOM_JOINED");
        assertThat(roomIdOf(again)).isEqualTo(roomId);
        assertThat(again.get("payload").get("code").asString()).isEqualTo(joined.get("payload").get("code").asString());
        assertThat(again.get("payload").get("role").asString()).isEqualTo("HOST");
        // The grace is cancelled: firing what is left closes nothing.
        timers.fire(GRACE::equals);
        back.expectNothing(Duration.ofMillis(300));
        assertThat(participation.activityOf(sub)).contains(new Activity.InRoom(UUID.fromString(roomId)));

        // Dropped again and no one comes back: the room closes when the grace runs out.
        back.close();
        await().atMost(WAIT).until(() -> timers.pending().stream().anyMatch(t -> t.delay().equals(GRACE)));
        timers.fire(GRACE::equals);
        await().atMost(WAIT).until(() -> participation.activityOf(sub).isEmpty());
        assertThat(rooms.isMember(UUID.fromString(roomId), sub)).isFalse();
    }

    @Test
    void anOpenLobbyExpiresAt24HoursAndTellsEveryMember() {
        String sub = newSub();
        double liveBefore = live();
        StompTestClient anju = host(sub);
        String roomId = roomIdOf(create(anju));
        anju.subscribe(Destinations.roomTopic(UUID.fromString(roomId)));

        // A timer that fires early (the clock has not reached expiresAt) re-arms and closes nothing.
        assertThat(timers.fire(d -> d.compareTo(Duration.ofHours(1)) > 0)).isOne();
        anju.expectNothing(Duration.ofMillis(200));
        assertThat(participation.activityOf(sub)).isPresent();
        assertThat(timers.pending()).anyMatch(t -> t.delay().compareTo(Duration.ofHours(23)) > 0);

        clock.advance(Duration.ofHours(24));
        timers.fire(d -> d.compareTo(Duration.ofHours(1)) > 0);

        JsonNode closed = anju.nextBroadcast("ROOM_CLOSED");
        assertThat(closed.get("payload").get("reason").asString()).isEqualTo("EXPIRED");
        assertThat(anju.next("ROOM_CLOSED").get("payload").get("reason").asString()).isEqualTo("EXPIRED");
        await().atMost(WAIT).until(() -> participation.activityOf(sub).isEmpty());
        assertThat(live()).isEqualTo(liveBefore);
    }

    /** A registered player with a profile joins {@code code} (as typed): returns her ROOM_JOINED. */
    JsonNode join(StompTestClient player, String code) {
        player.send("/app/room/join", "{\"code\":\"" + code + "\"}");
        return player.next("ROOM_JOINED");
    }

    static String codeOf(JsonNode joined) {
        return joined.get("payload").get("code").asString();
    }

    /** Fires the 250 ms coalescing window until {@code watcher} sees the next lobby broadcast. */
    JsonNode nextLobbyUpdate(StompTestClient watcher) {
        JsonNode[] update = new JsonNode[1];
        await().atMost(WAIT).until(() -> {
            timers.fire(d -> d.equals(Duration.ofMillis(250)));
            update[0] = watcher.nextBroadcast(Duration.ofMillis(100));
            return update[0] != null;
        });
        return update[0];
    }

    @Test
    void aPlayerJoinsByCodeInAnyFormAndTheLobbySeesHerOnce() {
        StompTestClient anju = host(newSub());
        JsonNode created = create(anju);
        String roomId = roomIdOf(created);
        String code = codeOf(created);
        anju.subscribe(Destinations.roomTopic(UUID.fromString(roomId)));
        String bijuSub = newSub();
        StompTestClient biju = host(bijuSub);

        JsonNode joined = join(biju, " " + code.substring(0, 3).toLowerCase() + "-" + code.substring(3).toLowerCase() + " ");

        assertThat(roomIdOf(joined)).isEqualTo(roomId);
        JsonNode payload = joined.get("payload");
        assertThat(payload.get("role").asString()).isEqualTo("MEMBER");
        assertThat(payload.get("code").asString()).isEqualTo(code);
        assertThat(payload.get("room").get("humanCount").asInt()).isEqualTo(2);
        assertThat(payload.get("selfParticipantId").asString()).isNotEqualTo(bijuSub);
        assertThat(participation.activityOf(bijuSub)).contains(new Activity.InRoom(UUID.fromString(roomId)));

        JsonNode update = nextLobbyUpdate(anju);
        assertThat(update.get("seq").asLong()).isEqualTo(1);
        assertThat(update.get("payload").get("joined").get(0).asString()).isEqualTo(payload.get("selfParticipantId").asString());
        assertThat(update.get("payload").get("left")).isEmpty();
        assertThat(update.get("payload").get("room").get("humanCount").asInt()).isEqualTo(2);

        // A second tap on the link: ROOM_JOINED again, no second participant, no broadcast.
        JsonNode again = join(biju, code);
        assertThat(again.get("payload").get("room").get("humanCount").asInt()).isEqualTo(2);
        assertThat(again.get("payload").get("selfParticipantId").asString()).isEqualTo(payload.get("selfParticipantId").asString());

        // Now a member, she may watch the topic; her leave frees her at once and the others see her go.
        biju.subscribe(Destinations.roomTopic(UUID.fromString(roomId)));
        biju.send("/app/room/" + roomId + "/leave");
        await().atMost(WAIT).until(() -> participation.activityOf(bijuSub).isEmpty());
        JsonNode gone = nextLobbyUpdate(anju);
        assertThat(gone.get("seq").asLong()).isEqualTo(2);
        assertThat(gone.get("payload").get("left").get(0).asString()).isEqualTo(payload.get("selfParticipantId").asString());
        assertThat(gone.get("payload").get("room").get("humanCount").asInt()).isEqualTo(1);
    }

    @Test
    void aJoinThatCannotSucceedGetsItsErrorAndChangesNothing() {
        String hostSub = newSub();
        StompTestClient anju = host(hostSub);
        JsonNode created = create(anju);
        String code = codeOf(created);
        String guestSub = newSub();
        String freshSub = newSub();
        String strangerSub = newSub();
        subs.addAll(List.of(guestSub, freshSub));
        StompTestClient guest = connect(guestToken(guestSub));
        StompTestClient fresh = connect(userToken(freshSub, "Biju"));
        clients.addAll(List.of(guest, fresh));
        StompTestClient stranger = host(strangerSub);

        guest.send("/app/room/join", "{\"code\":\"" + code + "\"}");
        guest.error("FORBIDDEN_MODE");
        fresh.send("/app/room/join", "{\"code\":\"" + code + "\"}");
        fresh.error("PROFILE_REQUIRED");
        stranger.send("/app/room/join", "{\"code\":\"" + (code.equals("ABC234") ? "ABC235" : "ABC234") + "\"}");
        JsonNode notFound = stranger.error("ROOM_NOT_FOUND");
        assertThat(notFound.has("roomId")).isFalse();
        stranger.send("/app/room/join", "{\"code\":\"K7M-Q2O\"}");
        stranger.error("ROOM_NOT_FOUND");
        stranger.send("/app/room/join", "not json");
        stranger.error("ROOM_NOT_FOUND");
        for (String sub : List.of(guestSub, freshSub, strangerSub)) {
            assertThat(participation.activityOf(sub)).isEmpty();
        }

        // A player who is in another room: ALREADY_IN_MATCH with that room.
        StompTestClient chitra = host(newSub());
        String hers = roomIdOf(create(chitra));
        chitra.send("/app/room/join", "{\"code\":\"" + code + "\"}");
        assertThat(chitra.error("ALREADY_IN_MATCH").get("payload").get("roomId").asString()).isEqualTo(hers);

        // The host leaves: the code is tombstoned and a late join reads ROOM_EXPIRED.
        anju.send("/app/room/" + roomIdOf(created) + "/leave");
        await().atMost(WAIT).until(() -> participation.activityOf(hostSub).isEmpty());
        try (StompTestClient late = connect(profiledToken(newSub(), "Devi"))) {
            late.send("/app/room/join", "{\"code\":\"" + code + "\"}");
            late.error("ROOM_EXPIRED");
        }
    }

    @Test
    void aDeletedAccountsJoinIsUnauthenticatedAndDoesNotEnterTheRoom() {
        StompTestClient anju = host(newSub());
        JsonNode created = create(anju);
        String goneSub = newSub();
        StompTestClient gone = host(goneSub);
        deleted.add(goneSub);

        gone.send("/app/room/join", "{\"code\":\"" + codeOf(created) + "\"}");
        gone.error("UNAUTHENTICATED");
        assertThat(participation.activityOf(goneSub)).isEmpty();
        assertThat(rooms.isMember(UUID.fromString(roomIdOf(created)), goneSub)).isFalse();
    }

    @Test
    void startChecksTheHostAndThePlayerCountAndPlayAgainIsAStub() {
        StompTestClient anju = host(newSub());
        JsonNode created = create(anju);
        String roomId = roomIdOf(created);
        anju.subscribe(Destinations.roomTopic(UUID.fromString(roomId)));

        anju.send("/app/room/" + roomId + "/start");
        assertThat(anju.error("NOT_ENOUGH_PLAYERS").get("roomId").asString()).isEqualTo(roomId);
        anju.send("/app/room/" + roomId + "/playAgain");
        anju.error("NOT_AVAILABLE_YET");

        StompTestClient biju = host(newSub());
        join(biju, codeOf(created));
        biju.send("/app/room/" + roomId + "/start");
        biju.error("NOT_HOST");
        StompTestClient stranger = host(newSub());
        stranger.send("/app/room/" + roomId + "/start");
        stranger.error("NOT_HOST");
        // A stranger's leave of a room she is not in is ignored.
        stranger.send("/app/room/" + roomId + "/leave");
        stranger.expectNothing(Duration.ofMillis(200));

        // Refused starts changed nothing: only the join was broadcast (the valid start is RoomMatchFlowTest's).
        assertThat(nextLobbyUpdate(anju).get("seq").asLong()).isEqualTo(1);
        assertThat(CORE.calls()).isEmpty();
    }

    @Test
    void theHostLeavingClosesTheRoomForEveryMemberWithHostLeft() {
        String hostSub = newSub();
        String bijuSub = newSub();
        StompTestClient anju = host(hostSub);
        JsonNode created = create(anju);
        String roomId = roomIdOf(created);
        StompTestClient biju = host(bijuSub);
        join(biju, codeOf(created));
        biju.subscribe(Destinations.roomTopic(UUID.fromString(roomId)));

        anju.send("/app/room/" + roomId + "/leave");

        assertThat(biju.next("ROOM_CLOSED").get("payload").get("reason").asString()).isEqualTo("HOST_LEFT");
        await().atMost(WAIT).until(() -> participation.activityOf(bijuSub).isEmpty() && participation.activityOf(hostSub).isEmpty());
    }

    @Test
    void aDroppedMemberIsKeptForTheGraceAndAReconnectGetsRoomJoinedThenAResyncAnswersToo() {
        String bijuSub = newSub();
        StompTestClient anju = host(newSub());
        JsonNode created = create(anju);
        String roomId = roomIdOf(created);
        StompTestClient biju = host(bijuSub);
        join(biju, codeOf(created));
        biju.close();
        await().atMost(WAIT).until(() -> timers.pending().stream().anyMatch(t -> t.delay().equals(GRACE)));
        assertThat(rooms.isMember(UUID.fromString(roomId), bijuSub)).isTrue();

        StompTestClient back = host(bijuSub);
        JsonNode again = back.next("ROOM_JOINED");
        assertThat(again.get("payload").get("role").asString()).isEqualTo("MEMBER");
        timers.fire(GRACE::equals); // cancelled: nothing happens
        assertThat(rooms.isMember(UUID.fromString(roomId), bijuSub)).isTrue();

        back.send("/app/room/" + roomId + "/resync");
        assertThat(roomIdOf(back.next("ROOM_JOINED"))).isEqualTo(roomId);
    }

    @Test
    void onlyAMemberMayWatchTheRoomTopic() throws Exception {
        String sub = newSub();
        StompTestClient anju = host(sub);
        String roomId = roomIdOf(create(anju));
        String topic = "destination:" + Destinations.roomTopic(UUID.fromString(roomId));

        // A stranger is refused (ERROR, socket closed); so is anyone for a room that does not exist.
        try (RawStomp raw = RawStomp.open(port)) {
            raw.connect("Bearer " + profiledToken(newSub(), "Stranger"));
            assertThat(raw.nextFrame(WAIT)).startsWith("CONNECTED\n");
            raw.send("SUBSCRIBE", "id:0", topic);
            assertRefused(raw);
            assertThat(raw.awaitClosed(WAIT)).isTrue();
        }
        try (RawStomp raw = RawStomp.open(port)) {
            raw.connect("Bearer " + profiledToken(sub, "Rajeev"));
            assertThat(raw.nextFrame(WAIT)).startsWith("CONNECTED\n");
            raw.send("SUBSCRIBE", "id:0", "destination:/topic/room/" + UUID.randomUUID());
            assertRefused(raw);
        }
        // The member herself, on a second connection, is allowed and sees the lobby change.
        try (RawStomp raw = RawStomp.open(port)) {
            raw.connect("Bearer " + profiledToken(sub, "Rajeev"));
            assertThat(raw.nextFrame(WAIT)).startsWith("CONNECTED\n");
            raw.send("SUBSCRIBE", "id:0", topic);
            // Poll: configure until the subscription is registered and the broadcast arrives (no fixed sleep).
            String[] frame = new String[1];
            int[] count = {5};
            await().atMost(Duration.ofSeconds(10)).until(() -> {
                anju.send("/app/room/" + roomId + "/configure", "{\"questionCount\":" + (5 + count[0]++ % 25) + "}");
                frame[0] = raw.nextFrame(Duration.ofMillis(300));
                return frame[0] != null;
            });
            assertThat(frame[0]).startsWith("MESSAGE\n").contains("ROOM_LOBBY_UPDATED");
        }
    }

    static void assertRefused(RawStomp raw) throws InterruptedException {
        String frame = raw.nextFrame(WAIT);
        if (frame == null) {
            assertThat(raw.awaitClosed(Duration.ZERO)).as("neither ERROR nor closed").isTrue();
        } else {
            assertThat(frame).startsWith("ERROR\n");
        }
    }
}

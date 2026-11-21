package in.minnal.game.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import in.minnal.contracts.realtime.Destinations;
import in.minnal.game.platform.drain.DrainState;
import in.minnal.game.room.application.RoomRegistry;
import in.minnal.game.support.GameIntegrationTest;
import in.minnal.game.support.StompTestClient;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/** Draining is one-way and the cap is a setting, so each test gets (and then discards) its own context. */
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@TestPropertySource(properties = {"minnal.test.context=room-drain", "minnal.room.max-live=1"})
class RoomDrainAndCapTest extends GameIntegrationTest {

    static final String CREATE = "{\"source\":{\"type\":\"BANK\",\"topicId\":\"" + UUID.randomUUID() + "\"},\"questionCount\":10}";

    @Autowired
    DrainState drain;

    @Autowired
    RoomRegistry rooms;

    @Test
    void aDrainingServiceClosesOpenLobbiesAtOnceAndRefusesNewOnes() {
        String a = newSub();
        String b = newSub();
        try (StompTestClient anju = connect(profiledToken(a, "Rajeev")); StompTestClient biju = connect(profiledToken(b, "Biju"))) {
            anju.send("/app/room/create", CREATE);
            String roomId = anju.next("ROOM_JOINED").get("payload").get("roomId").asString();
            anju.subscribe(Destinations.roomTopic(UUID.fromString(roomId)));

            drain.begin();

            JsonNode closed = anju.nextBroadcast("ROOM_CLOSED");
            assertThat(closed.get("payload").get("reason").asString()).isEqualTo("SERVER_DRAINING");
            assertThat(anju.next("ROOM_CLOSED").get("payload").get("reason").asString()).isEqualTo("SERVER_DRAINING");
            await().atMost(Duration.ofSeconds(5)).until(() -> participation.activityOf(a).isEmpty());
            assertThat(rooms.liveCount()).isZero();
            biju.send("/app/room/create", CREATE);
            biju.error("SERVER_DRAINING");
            assertThat(participation.activityOf(b)).isEmpty();
        }
    }

    @Test
    void beyondMaxLiveACreateIsModeUnavailableAndALeaveMakesRoomAgain() {
        String a = newSub();
        String b = newSub();
        try (StompTestClient anju = connect(profiledToken(a, "Rajeev")); StompTestClient biju = connect(profiledToken(b, "Biju"))) {
            anju.send("/app/room/create", CREATE);
            String roomId = anju.next("ROOM_JOINED").get("payload").get("roomId").asString();

            biju.send("/app/room/create", CREATE);
            biju.error("MODE_UNAVAILABLE");
            assertThat(participation.activityOf(b)).isEmpty();

            anju.send("/app/room/" + roomId + "/leave");
            await().atMost(Duration.ofSeconds(5)).until(() -> rooms.liveCount() == 0);
            biju.send("/app/room/create", CREATE);
            String second = biju.next("ROOM_JOINED").get("payload").get("roomId").asString();
            biju.send("/app/room/" + second + "/leave");
            await().atMost(Duration.ofSeconds(5)).until(() -> participation.activityOf(b).isEmpty());
        }
    }
}

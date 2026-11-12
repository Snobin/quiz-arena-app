package in.minnal.game.matchmaking;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.game.match.application.MatchRegistry;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.matchmaking.application.RatingCache;
import in.minnal.game.support.FakeCore;
import in.minnal.game.support.GameIntegrationTest;
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

/** Two or more real STOMP clients through the whole matchmaking path (Story 1.6 matrix). */
class MatchmakingFlowTest extends GameIntegrationTest {

    static final Duration TWO_TICKS = Duration.ofMillis(600);

    @Autowired
    RatingCache ratings;

    @Autowired
    MeterRegistry meters;

    @Autowired
    MatchRegistry matches;

    final List<StompTestClient> clients = new ArrayList<>();
    final List<String> subs = new ArrayList<>();

    @BeforeEach
    void coreAnswers() {
        CORE.reset();
    }

    @AfterEach
    void leave() {
        clients.forEach(StompTestClient::close);
        awaitIdle(subs.toArray(String[]::new));
    }

    StompTestClient player(String sub, String token) {
        subs.add(sub);
        StompTestClient client = connect(token);
        clients.add(client);
        return client;
    }

    StompTestClient guest(String sub) {
        return player(sub, guestToken(sub));
    }

    double pairings(String opponent) {
        var counter = meters.find("minnal.matchmaking.pairings").tag("opponent", opponent).counter();
        return counter == null ? 0 : counter.count();
    }

    static List<String> participantNames(JsonNode matchFound) {
        List<String> names = new ArrayList<>();
        matchFound.get("payload").get("participants").forEach(p -> names.add(p.get("displayName").asString()));
        return names;
    }

    @Test
    void twoCloseGuestsArePairedAtOnceAndBothGetMatchFound() {
        String a = newSub();
        String b = newSub();
        StompTestClient anju = guest(a);
        StompTestClient vishnu = guest(b);
        double humanBefore = pairings("human");
        long waitsBefore = meters.find("minnal.matchmaking.queue.wait").timer().count();

        anju.join();
        anju.expectNothing(Duration.ofMillis(300));
        vishnu.join();

        JsonNode toAnju = anju.next("MATCH_FOUND");
        JsonNode toVishnu = vishnu.next("MATCH_FOUND");
        String matchId = toAnju.get("matchId").asString();
        assertThat(toVishnu.get("matchId").asString()).isEqualTo(matchId);
        assertThat(toAnju.has("roomId")).as("nulls are omitted").isFalse();
        assertThat(toAnju.has("seq")).isFalse();
        assertThat(Instant.parse(toAnju.get("serverTime").asString())).isEqualTo(clock.instant());

        JsonNode payload = toAnju.get("payload");
        assertThat(payload.get("matchId").asString()).isEqualTo(matchId);
        assertThat(payload.get("mode").asString()).isEqualTo("QUICK");
        assertThat(payload.get("questionCount").asInt()).isEqualTo(10);
        assertThat(payload.get("questionSource").asString()).isEqualTo("BANK");
        assertThat(payload.get("participants")).hasSize(2);
        payload.get("participants").forEach(p -> {
            assertThat(p.get("kind").asString()).isEqualTo("GUEST");
            assertThat(p.get("participantId").asString()).isNotIn(a, b);
        });
        assertThat(participantNames(toAnju)).containsExactly("Guest " + a.substring(0, 4), "Guest " + b.substring(0, 4));
        // Each receiver is told which participant it is.
        assertThat(payload.get("selfParticipantId").asString())
                .isEqualTo(payload.get("participants").get(0).get("participantId").asString());
        assertThat(toVishnu.get("payload").get("selfParticipantId").asString())
                .isEqualTo(payload.get("participants").get(1).get("participantId").asString());
        // No question or answer ever reaches a client here.
        assertThat(toAnju.toString()).doesNotContain("answerIndex").doesNotContain("Question 0");

        // The set request: BANK, KERALA_PSC, 10, for the first human, with the service token.
        assertThat(CORE.calls()).singleElement().satisfies(call -> {
            assertThat(call.token()).isEqualTo(FakeCore.TOKEN);
            assertThat(call.body().get("source").asString()).isEqualTo("BANK");
            assertThat(call.body().get("filters").get("category").asString()).isEqualTo("KERALA_PSC");
            assertThat(call.body().get("count").asInt()).isEqualTo(10);
            assertThat(call.body().get("requesterId").asString()).isEqualTo(a);
        });
        assertThat(pairings("human")).isEqualTo(humanBefore + 1);
        assertThat(meters.find("minnal.matchmaking.queue.wait").timer().count()).isEqualTo(waitsBefore + 2);
        assertThat(participation.matchOf(a)).hasValueSatisfying(id -> assertThat(id.toString()).isEqualTo(matchId));
    }

    @Test
    void usersRated1200And1350ArePairedAtOnce() {
        String a = newSub();
        String b = newSub();
        ratings.put(a, 1200);
        ratings.put(b, 1350);
        StompTestClient first = player(a, userToken(a, "Anju"));
        StompTestClient second = player(b, userToken(b, "Biju"));
        first.join();
        second.join();
        first.next("MATCH_FOUND");
        second.next("MATCH_FOUND");
    }

    @Test
    void ratingsDifferingBy300PairOnlyOnceTheBandWidensAt4s() {
        String a = newSub();
        String b = newSub();
        ratings.put(a, 1200);
        ratings.put(b, 1500);
        StompTestClient first = player(a, userToken(a, "Arjun K"));
        StompTestClient second = player(b, userToken(b, "Meera"));
        first.join();
        second.join();
        first.expectNothing(TWO_TICKS);
        clock.advance(Duration.ofMillis(3900));
        first.expectNothing(TWO_TICKS);
        clock.advance(Duration.ofMillis(100));
        assertThat(first.next("MATCH_FOUND").get("payload").get("participants").get(0).get("kind").asString())
                .isEqualTo("USER");
        second.next("MATCH_FOUND");
    }

    @Test
    void aLoneGuestGetsMinnalBotAt8s() {
        String a = newSub();
        StompTestClient anju = guest(a);
        double botBefore = pairings("bot");
        anju.join();
        anju.expectNothing(TWO_TICKS); // the actor stamps the join before the clock moves
        clock.advance(Duration.ofMillis(7900));
        anju.expectNothing(TWO_TICKS);
        clock.advance(Duration.ofMillis(100));
        JsonNode found = anju.next("MATCH_FOUND");
        JsonNode participants = found.get("payload").get("participants");
        assertThat(participants).hasSize(2);
        assertThat(participants.get(1).get("kind").asString()).isEqualTo("BOT");
        assertThat(participants.get(1).get("displayName").asString()).isEqualTo("Minnal Bot");
        // The match keeps the bot at her rating (a guest: 1200).
        MatchSetup setup = matches.find(UUID.fromString(found.get("matchId").asString())).orElseThrow().setup();
        assertThat(setup.ratings()).containsEntry(UUID.fromString(participants.get(1).get("participantId").asString()), 1200)
                .containsEntry(UUID.fromString(participants.get(0).get("participantId").asString()), 1200);
        assertThat(pairings("bot")).isEqualTo(botBefore + 1);
    }

    @Test
    void aGuestPairsWithARegisteredUserAndAClientRatingIsIgnored() {
        String guestSub = newSub();
        String userSub = newSub();
        ratings.put(userSub, 1300);
        StompTestClient guest = guest(guestSub);
        StompTestClient user = player(userSub, userToken(userSub, "Vishnu R"));
        // Claims 3000; the server uses 1200 (a guest), which is within 200 of 1300.
        guest.send("/app/matchmaking/QUICK/join", "{\"rating\":3000}");
        user.join();
        JsonNode found = guest.next("MATCH_FOUND");
        assertThat(found.get("payload").get("participants")).extracting(p -> p.get("kind").asString())
                .containsExactlyInAnyOrder("GUEST", "USER");
        user.next("MATCH_FOUND");
    }

    @Test
    void anUnratedUserClaimingARatingIsStill1200() {
        String claimer = newSub();
        String other = newSub();
        ratings.put(other, 1350);
        StompTestClient lying = player(claimer, userToken(claimer, "Claimer"));
        StompTestClient honest = player(other, userToken(other, "Other"));
        lying.send("/app/matchmaking/QUICK/join", "{\"rating\":3000}");
        honest.join();
        lying.next("MATCH_FOUND");
        honest.next("MATCH_FOUND");
    }

    @Test
    void aFailedQuestionSetFailsBothPlayersWhoCanThenJoinAgain() {
        for (int status : new int[] {422, 503}) {
            CORE.reset();
            CORE.status = status;
            String a = newSub();
            String b = newSub();
            StompTestClient first = guest(a);
            StompTestClient second = guest(b);
            first.join();
            second.join();
            assertThat(first.next("MATCHMAKING_FAILED").get("payload").get("reason").asString())
                    .isEqualTo("QUESTION_SET_UNAVAILABLE");
            second.next("MATCHMAKING_FAILED");
            awaitIdle(a, b);

            // Not re-queued: they can join again, and this time the set arrives.
            CORE.status = 200;
            first.join();
            second.join();
            first.next("MATCH_FOUND");
            second.next("MATCH_FOUND");
        }
    }

    @Test
    void aSlowCoreTimesOutAfter2s() {
        CORE.delayMs = 2_600;
        String a = newSub();
        String b = newSub();
        StompTestClient first = guest(a);
        StompTestClient second = guest(b);
        first.join();
        second.join();
        long start = System.nanoTime();
        first.next("MATCHMAKING_FAILED");
        second.next("MATCHMAKING_FAILED");
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isBetween(Duration.ofMillis(1500), Duration.ofSeconds(5));
        awaitIdle(a, b);
    }

    @Test
    void cancelWhileQueuedReleasesThePlayer() {
        String a = newSub();
        StompTestClient anju = guest(a);
        anju.join();
        anju.cancel();
        JsonNode cancelled = anju.next("MATCHMAKING_CANCELLED");
        assertThat(cancelled.has("payload")).isFalse();
        awaitIdle(a);
        // A second cancel: not queued any more.
        anju.cancel();
        anju.error("NOT_IN_QUEUE");
        // Released: joining again works (no ALREADY_IN_MATCH), and a cancel ends it again.
        anju.join();
        anju.cancel();
        anju.next("MATCHMAKING_CANCELLED");
    }

    @Test
    void cancelWhileTheSetIsBeingFetchedIsRejectedAndTheMatchGoesAhead() {
        CORE.delayMs = 800;
        String a = newSub();
        String b = newSub();
        StompTestClient first = guest(a);
        StompTestClient second = guest(b);
        first.join();
        second.join();
        org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(2)).until(() -> !CORE.calls().isEmpty());
        first.cancel();
        first.error("CANCEL_REJECTED");
        first.next("MATCH_FOUND");
        second.next("MATCH_FOUND");
        // In the match, a cancel is still rejected, now with the match id.
        first.cancel();
        assertThat(first.error("CANCEL_REJECTED").get("payload").has("matchId")).isTrue();
    }

    @Test
    void aSecondJoinFromAnySessionIsAlreadyInMatch() {
        String a = newSub();
        String b = newSub();
        String token = guestToken(a);
        StompTestClient tab1 = player(a, token);
        StompTestClient tab2 = player(a, token);
        tab1.join();
        tab1.join(); // same session again
        assertThat(tab1.error("ALREADY_IN_MATCH").get("payload").has("matchId")).isFalse();
        tab2.join();
        assertThat(tab2.error("ALREADY_IN_MATCH").get("payload").has("matchId")).isFalse();

        StompTestClient other = guest(b);
        other.join();
        String matchId = tab1.next("MATCH_FOUND").get("matchId").asString();
        // MATCH_FOUND goes to every session of the player.
        tab2.next("MATCH_FOUND");
        other.next("MATCH_FOUND");
        tab2.join();
        JsonNode error = tab2.error("ALREADY_IN_MATCH");
        assertThat(error.get("payload").get("matchId").asString()).isEqualTo(matchId);
        assertThat(error.get("matchId").asString()).isEqualTo(matchId);
    }

    @Test
    void modeGate() {
        String g = newSub();
        String u = newSub();
        StompTestClient guest = guest(g);
        StompTestClient user = player(u, userToken(u, "Registered"));
        guest.send("/app/matchmaking/TOPIC_DUEL/join");
        guest.error("FORBIDDEN_MODE");
        guest.send("/app/matchmaking/BATTLE_ROOM/join");
        guest.error("FORBIDDEN_MODE");
        user.send("/app/matchmaking/TOPIC_DUEL/join");
        user.error("MODE_UNAVAILABLE");
        user.send("/app/matchmaking/quick/join");
        user.error("BAD_REQUEST");
        user.send("/app/matchmaking/NOPE/cancel");
        user.error("BAD_REQUEST");
        assertThat(participation.activityOf(g)).isEmpty();
        assertThat(participation.activityOf(u)).isEmpty();
    }

    @Test
    void theLastSessionClosingRemovesAQueuedPlayerButASecondSessionKeepsHerQueued() {
        String a = newSub();
        String token = guestToken(a);
        StompTestClient tab1 = player(a, token);
        StompTestClient tab2 = player(a, token);
        tab1.join();
        org.awaitility.Awaitility.await().until(() -> participation.activityOf(a).isPresent());
        tab1.close();
        tab2.expectNothing(TWO_TICKS);
        assertThat(participation.activityOf(a)).isPresent();
        tab2.close();
        awaitIdle(a);
    }

    @Test
    void aMatchKeepsItsPlayersUntilItEndsEvenWhenAllDisconnect() {
        String a = newSub();
        String b = newSub();
        String tokenA = guestToken(a);
        StompTestClient first = player(a, tokenA);
        StompTestClient second = guest(b);
        first.join();
        second.join();
        String matchId = first.next("MATCH_FOUND").get("matchId").asString();
        second.next("MATCH_FOUND");
        first.close();
        second.close();
        // Story 1.7: no more release on disconnect; the match runs to its last reveal (about 3 s here).
        org.awaitility.Awaitility.await().pollDelay(Duration.ofMillis(300)).atMost(Duration.ofSeconds(1))
                .until(() -> participation.matchOf(a).isPresent());
        assertThat(participation.matchOf(a)).hasValueSatisfying(id -> assertThat(id.toString()).isEqualTo(matchId));
        awaitIdle(a, b);

        // Both are free to queue again.
        StompTestClient again = player(a, tokenA);
        again.join();
        again.cancel();
        again.next("MATCHMAKING_CANCELLED");
    }
}

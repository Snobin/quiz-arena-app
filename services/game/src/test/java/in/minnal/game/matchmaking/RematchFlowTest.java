package in.minnal.game.matchmaking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.Participant;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.game.match.application.MatchRegistry;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.platform.session.Activity;
import in.minnal.game.platform.session.PlayerSessions;
import in.minnal.game.support.GameIntegrationTest;
import in.minnal.game.support.StompTestClient;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/**
 * Story 1.10 (part 2) between real STOMP clients: after a completed QUICK match, rematch against the
 * bot and between two humans, cancel, expiry and unavailable. The rematch window is 2 s here, so a
 * request expires quickly; each ended match asks only two questions and nobody answers, so it ends
 * within about a second. Draining is in {@link DrainingTest} (its context is discarded).
 */
@TestPropertySource(properties = "minnal.rematch.window=2s")
class RematchFlowTest extends GameIntegrationTest {

    @Autowired
    MatchRegistry matches;

    @Autowired
    PlayerSessions sessions;

    final List<StompTestClient> clients = new ArrayList<>();
    final List<String> subs = new ArrayList<>();

    @BeforeEach
    void coreAnswers() {
        CORE.reset();
    }

    @AfterEach
    void leaveEverything() {
        CORE.reset();
        clients.forEach(StompTestClient::close);
        awaitIdle(subs.toArray(String[]::new));
    }

    StompTestClient client(String sub) {
        StompTestClient client = connect(guestToken(sub));
        clients.add(client);
        subs.add(sub);
        return client;
    }

    /** Starts a two-question QUICK match of {@code humans} (and maybe the bot) and waits for its MATCH_ENDED. */
    UUID playedMatch(Map<String, StompTestClient> humans, boolean withBot) {
        UUID matchId = UUID.randomUUID();
        Map<String, UUID> bySub = new LinkedHashMap<>();
        List<Participant> participants = new ArrayList<>();
        for (String sub : humans.keySet()) {
            UUID id = UUID.randomUUID();
            bySub.put(sub, id);
            participants.add(new Participant(id, "Guest " + sub.substring(0, 4), ParticipantKind.GUEST));
            participation.claim(sub, new Activity.Queued(MatchMode.QUICK));
        }
        if (withBot) {
            participants.add(new Participant(UUID.randomUUID(), "Minnal Bot", ParticipantKind.BOT));
        }
        List<InternalQuestion> questions = IntStream.range(0, 2).mapToObj(i -> new InternalQuestion(UUID.randomUUID(), 1,
                "ചോദ്യം " + i, "Question " + i, List.of("a", "b", "c", "d"), i % 4, "x", null)).toList();
        matches.start(new MatchSetup(matchId, MatchMode.QUICK, participants, bySub, questions, Map.of(), Map.of(),
                Instant.now())).orElseThrow();
        for (StompTestClient client : humans.values()) {
            assertThat(privateOf(client, "MATCH_ENDED").get("matchId").asString()).isEqualTo(matchId.toString());
        }
        awaitIdle(humans.keySet().toArray(String[]::new));
        return matchId;
    }

    static String rematch(UUID matchId) {
        return "/app/match/" + matchId + "/rematch";
    }

    static String cancel(UUID matchId) {
        return "/app/match/" + matchId + "/rematch/cancel";
    }

    /** The next private message of {@code type}, skipping others (MATCH_FOUND's acks, for one). */
    static JsonNode privateOf(StompTestClient client, String type) {
        for (int i = 0; i < 30; i++) {
            JsonNode message = client.next(Duration.ofSeconds(5));
            if (message.get("type").asString().equals(type)) {
                return message;
            }
        }
        throw new AssertionError("no " + type);
    }

    /** Leaves the new match at once (it aborts), so the test ends idle. */
    void leave(StompTestClient client, JsonNode matchFound) {
        client.send("/app/match/" + matchFound.get("matchId").asString() + "/leave");
    }

    @Test
    void againstTheBotARematchStartsANewMatchAtOnceAndAFailedFetchCanBeRetried() {
        String anjuSub = newSub();
        StompTestClient anju = client(anjuSub);
        UUID ended = playedMatch(Map.of(anjuSub, anju), true);

        CORE.status = 503;
        anju.send(rematch(ended));
        assertThat(anju.next("MATCHMAKING_FAILED").get("payload").get("reason").asString())
                .isEqualTo("QUESTION_SET_UNAVAILABLE");
        assertThat(participation.activityOf(anjuSub)).isEmpty();

        CORE.reset();
        anju.send(rematch(ended));
        JsonNode found = anju.next("MATCH_FOUND");
        assertThat(found.get("matchId").asString()).isNotEqualTo(ended.toString());
        JsonNode payload = found.get("payload");
        assertThat(payload.get("mode").asString()).isEqualTo("QUICK");
        List<String> kinds = new ArrayList<>();
        payload.get("participants").forEach(p -> kinds.add(p.get("kind").asString()));
        assertThat(kinds).containsExactly("GUEST", "BOT");
        assertThat(CORE.calls().getLast().body().get("requesterId").asString()).isEqualTo(anjuSub);
        assertThat(participation.matchOf(anjuSub)).contains(UUID.fromString(found.get("matchId").asString()));
        leave(anju, found);
    }

    @Test
    void whenOneHumanAsksAndTheOtherAcceptsBothGetTheNewMatch() {
        String aSub = newSub();
        String bSub = newSub();
        StompTestClient anju = client(aSub);
        StompTestClient vishnu = client(bSub);
        UUID ended = playedMatch(new LinkedHashMap<>(Map.of(aSub, anju, bSub, vishnu)), false);

        anju.send(rematch(ended));
        JsonNode toHer = anju.next("REMATCH_REQUESTED");
        JsonNode toHim = vishnu.next("REMATCH_REQUESTED");
        assertThat(toHim.get("matchId").asString()).isEqualTo(ended.toString());
        assertThat(toHim.get("payload")).isEqualTo(toHer.get("payload"));
        assertThat(toHim.get("payload").has("expiresAt")).isTrue();

        vishnu.send(rematch(ended));
        JsonNode hers = anju.next("MATCH_FOUND");
        JsonNode his = vishnu.next("MATCH_FOUND");
        assertThat(hers.get("matchId")).isEqualTo(his.get("matchId"));
        assertThat(hers.get("matchId").asString()).isNotEqualTo(ended.toString());
        leave(anju, hers);
        leave(vishnu, his);
    }

    @Test
    void aCancelRevertsTheOpponentWithCancelled() {
        String aSub = newSub();
        String bSub = newSub();
        StompTestClient anju = client(aSub);
        StompTestClient vishnu = client(bSub);
        UUID ended = playedMatch(new LinkedHashMap<>(Map.of(aSub, anju, bSub, vishnu)), false);

        anju.send(rematch(ended));
        anju.next("REMATCH_REQUESTED");
        vishnu.next("REMATCH_REQUESTED");
        anju.send(cancel(ended));
        assertThat(vishnu.next("REMATCH_DECLINED").get("payload").get("reason").asString()).isEqualTo("CANCELLED");
        anju.expectNothing(Duration.ofMillis(300));
    }

    @Test
    void anUnansweredRequestExpiresForBoth() {
        String aSub = newSub();
        String bSub = newSub();
        StompTestClient anju = client(aSub);
        StompTestClient vishnu = client(bSub);
        UUID ended = playedMatch(new LinkedHashMap<>(Map.of(aSub, anju, bSub, vishnu)), false);

        anju.send(rematch(ended));
        anju.next("REMATCH_REQUESTED");
        vishnu.next("REMATCH_REQUESTED");
        assertThat(anju.next("REMATCH_EXPIRED").get("matchId").asString()).isEqualTo(ended.toString());
        assertThat(vishnu.next("REMATCH_EXPIRED").get("payload").isEmpty()).isTrue();
    }

    /** The window's idle 2 s restart at the expiry: a re-send after it starts a fresh window and can be accepted. */
    @Test
    void aReSendAfterAnExpiryWorksAndCanBeAccepted() {
        String aSub = newSub();
        String bSub = newSub();
        StompTestClient anju = client(aSub);
        StompTestClient vishnu = client(bSub);
        UUID ended = playedMatch(new LinkedHashMap<>(Map.of(aSub, anju, bSub, vishnu)), false);

        anju.send(rematch(ended));
        anju.next("REMATCH_REQUESTED");
        vishnu.next("REMATCH_REQUESTED");
        anju.next("REMATCH_EXPIRED");
        vishnu.next("REMATCH_EXPIRED");

        anju.send(rematch(ended)); // more than 2 s after the end
        anju.next("REMATCH_REQUESTED");
        vishnu.next("REMATCH_REQUESTED");
        vishnu.send(rematch(ended));
        JsonNode hers = anju.next("MATCH_FOUND");
        JsonNode his = vishnu.next("MATCH_FOUND");
        assertThat(hers.get("matchId")).isEqualTo(his.get("matchId"));
        leave(anju, hers);
        leave(vishnu, his);
    }

    @Test
    void aRequestToAnOpponentWhoLeftOrToAnUnknownMatchIsUnavailable() {
        String aSub = newSub();
        String bSub = newSub();
        StompTestClient anju = client(aSub);
        StompTestClient vishnu = client(bSub);
        UUID ended = playedMatch(new LinkedHashMap<>(Map.of(aSub, anju, bSub, vishnu)), false);

        vishnu.close();
        await().atMost(Duration.ofSeconds(2)).until(() -> !sessions.hasSession(bSub));
        anju.send(rematch(ended));
        assertThat(anju.next("REMATCH_DECLINED").get("payload").get("reason").asString()).isEqualTo("UNAVAILABLE");

        anju.send(rematch(UUID.randomUUID()));
        assertThat(anju.next("REMATCH_DECLINED").get("payload").get("reason").asString()).isEqualTo("UNAVAILABLE");
    }

    /** The LastSessionClosed listener: the requester's socket closes, the opponent reverts. */
    @Test
    void aPendingRequestRevertsWhenTheRequesterCloses() {
        String aSub = newSub();
        String bSub = newSub();
        StompTestClient anju = client(aSub);
        StompTestClient vishnu = client(bSub);
        UUID ended = playedMatch(new LinkedHashMap<>(Map.of(aSub, anju, bSub, vishnu)), false);

        anju.send(rematch(ended));
        anju.next("REMATCH_REQUESTED");
        vishnu.next("REMATCH_REQUESTED");
        anju.close();
        assertThat(vishnu.next("REMATCH_DECLINED").get("payload").get("reason").asString()).isEqualTo("UNAVAILABLE");
    }

    @Test
    void aPendingRequestRevertsWhenTheOpponentJoinsQuickMatch() {
        String aSub = newSub();
        String bSub = newSub();
        StompTestClient anju = client(aSub);
        StompTestClient vishnu = client(bSub);
        UUID ended = playedMatch(new LinkedHashMap<>(Map.of(aSub, anju, bSub, vishnu)), false);

        anju.send(rematch(ended));
        anju.next("REMATCH_REQUESTED");
        vishnu.next("REMATCH_REQUESTED");
        vishnu.join();
        assertThat(anju.next("REMATCH_DECLINED").get("payload").get("reason").asString()).isEqualTo("UNAVAILABLE");
        vishnu.cancel();
        vishnu.next("MATCHMAKING_CANCELLED");
    }
}

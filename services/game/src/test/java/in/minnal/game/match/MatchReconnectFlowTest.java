package in.minnal.game.match;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.realtime.Destinations;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.Participant;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.game.match.application.MatchMetrics;
import in.minnal.game.match.application.MatchRegistry;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.platform.session.Activity;
import in.minnal.game.support.GameIntegrationTest;
import in.minnal.game.support.StompTestClient;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/**
 * Story 1.9 between real STOMP clients: a dropped socket, the reconnect grace, resync and
 * {@code SNAPSHOT}, the forfeit, Leave, the abort before the first reveal and the immediate finish
 * after it. The window is 3 s and the grace 1 s here, so a question stays open across a drop. Matches
 * are started directly through {@link MatchRegistry#start} so the cast (two humans, or a guest and
 * a bot) is fixed. Question {@code i} has answer index {@code i % 4}.
 */
@TestPropertySource(properties = {"minnal.match.window=3s", "minnal.match.grace=1s"})
class MatchReconnectFlowTest extends GameIntegrationTest {

    static final Duration GRACE = Duration.ofSeconds(1);

    @Autowired
    MatchRegistry matches;

    @Autowired
    MeterRegistry meters;

    final List<StompTestClient> clients = new ArrayList<>();
    final List<String> subs = new ArrayList<>();

    @AfterEach
    void leaveEverything() {
        clients.forEach(StompTestClient::close);
        awaitIdle(subs.toArray(String[]::new));
    }

    StompTestClient client(String sub) {
        StompTestClient client = connect(guestToken(sub));
        clients.add(client);
        return client;
    }

    /** A match of {@code humans} (in order), plus a bot when {@code withBot}; returns the participant ids, humans first. */
    record Started(UUID matchId, List<UUID> ids) {
    }

    Started start(List<String> humans, boolean withBot) {
        UUID matchId = UUID.randomUUID();
        Map<String, UUID> subs = new LinkedHashMap<>();
        List<Participant> participants = new ArrayList<>();
        List<UUID> ids = new ArrayList<>();
        for (String sub : humans) {
            UUID id = UUID.randomUUID();
            subs.put(sub, id);
            ids.add(id);
            participants.add(new Participant(id, "Guest " + sub.substring(0, 4), ParticipantKind.GUEST));
            participation.claim(sub, new Activity.Queued(MatchMode.QUICK));
            this.subs.add(sub);
        }
        if (withBot) {
            UUID bot = UUID.randomUUID();
            ids.add(bot);
            participants.add(new Participant(bot, "Minnal Bot", ParticipantKind.BOT));
        }
        List<InternalQuestion> questions = IntStream.range(0, 10).mapToObj(i -> new InternalQuestion(UUID.randomUUID(), 1,
                "ചോദ്യം " + i, "Question " + i, List.of("a", "b", "c", "d"), i % 4, "x" + i, null)).toList();
        matches.start(new MatchSetup(matchId, MatchMode.QUICK, participants, subs, questions, Map.of(), Map.of(),
                Instant.now())).orElseThrow();
        return new Started(matchId, ids);
    }

    static String to(UUID matchId, String action) {
        return "/app/match/" + matchId + "/" + action;
    }

    static String body(int questionIndex, int optionIndex) {
        return "{\"questionIndex\":" + questionIndex + ",\"optionIndex\":" + optionIndex + "}";
    }

    double counter(String name) {
        return meters.get(name).counter().count();
    }

    @Test
    void aBlipInsideTheGraceResumesFromASnapshotWithHerOwnResultAndNoForfeit() {
        String anjuSub = newSub();
        String vishnuSub = newSub();
        StompTestClient anju = client(anjuSub);
        StompTestClient vishnu = client(vishnuSub);
        Started match = start(List.of(anjuSub, vishnuSub), false);
        anju.subscribe(Destinations.matchTopic(match.matchId()));
        vishnu.subscribe(Destinations.matchTopic(match.matchId()));
        anju.nextBroadcast("QUESTION_STARTED");
        JsonNode started = vishnu.nextBroadcast("QUESTION_STARTED");
        anju.send(to(match.matchId(), "answer"), body(0, 0));
        anju.next("ANSWER_ACCEPTED");
        vishnu.nextBroadcast("SCOREBOARD");

        anju.close(); // her only session: the grace starts
        StompTestClient back = client(anjuSub);
        back.subscribe(Destinations.matchTopic(match.matchId()));
        back.send(to(match.matchId(), "resync"));
        JsonNode snapshot = back.next("SNAPSHOT");
        assertThat(snapshot.has("seq")).isFalse();
        assertThat(snapshot.get("refSeq").asLong()).isEqualTo(2);
        JsonNode payload = snapshot.get("payload");
        assertThat(payload.get("phase").asString()).isEqualTo("QUESTION_OPEN");
        assertThat(payload.get("questionIndex").asInt()).isZero();
        assertThat(payload.get("deadline").asString()).isEqualTo(started.get("payload").get("deadline").asString());
        assertThat(payload.get("question").has("answerIndex")).isFalse();
        assertThat(payload.get("youForfeited").asBoolean()).isFalse();
        assertThat(payload.get("myAnswer").get("pickedIndex").asInt()).isZero();
        assertThat(payload.get("myAnswer").get("correct").asBoolean()).isTrue();
        assertThat(payload.get("answered")).extracting(JsonNode::asString)
                .containsExactly(match.ids().get(0).toString());
        assertThat(payload.get("scores")).hasSize(2);
        assertThat(payload.toString()).doesNotContain("explanation");

        // Past the grace: she is still in, and the opponent never saw a forfeit.
        vishnu.expectNothing(GRACE.plusMillis(300));
        assertThat(vishnu.pendingBroadcasts()).isZero();
        assertThat(participation.matchOf(anjuSub)).contains(match.matchId());

        vishnu.send(to(match.matchId(), "answer"), body(0, 1));
        vishnu.next("ANSWER_ACCEPTED");
        back.nextBroadcast("SCOREBOARD");
        assertThat(back.nextBroadcast("QUESTION_REVEALED").get("payload").get("questionIndex").asInt()).isZero();
        back.send(to(match.matchId(), "leave"));
        vishnu.send(to(match.matchId(), "leave"));
    }

    @Test
    void twoTabsClosingOneKeepsHerInTheMatch() {
        String anjuSub = newSub();
        String vishnuSub = newSub();
        StompTestClient tab1 = client(anjuSub);
        StompTestClient tab2 = client(anjuSub);
        StompTestClient vishnu = client(vishnuSub);
        Started match = start(List.of(anjuSub, vishnuSub), false);
        tab2.subscribe(Destinations.matchTopic(match.matchId()));
        vishnu.subscribe(Destinations.matchTopic(match.matchId()));
        vishnu.nextBroadcast("QUESTION_STARTED");
        tab2.nextBroadcast("QUESTION_STARTED");
        tab1.close();
        try {
            Thread.sleep(GRACE.plusMillis(400).toMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        assertThat(vishnu.pendingBroadcasts()).as("no forfeit").isZero();
        assertThat(participation.matchOf(anjuSub)).contains(match.matchId());
        tab2.send(to(match.matchId(), "leave"));
        vishnu.send(to(match.matchId(), "leave"));
    }

    @Test
    void whenTheGraceRunsOutSheForfeitsIsReleasedAndHerLaterAnswersAreRejected() {
        String anjuSub = newSub();
        String vishnuSub = newSub();
        StompTestClient anju = client(anjuSub);
        StompTestClient vishnu = client(vishnuSub);
        Started match = start(List.of(anjuSub, vishnuSub), false);
        anju.subscribe(Destinations.matchTopic(match.matchId()));
        vishnu.subscribe(Destinations.matchTopic(match.matchId()));
        anju.nextBroadcast("QUESTION_STARTED");
        vishnu.nextBroadcast("QUESTION_STARTED");
        anju.close();

        JsonNode forfeited = vishnu.nextBroadcast("PARTICIPANT_FORFEITED");
        assertThat(forfeited.get("payload").get("participantId").asString()).isEqualTo(match.ids().get(0).toString());
        assertThat(forfeited.get("payload").get("questionIndex").asInt()).isZero();
        await().atMost(Duration.ofSeconds(2)).until(() -> participation.activityOf(anjuSub).isEmpty());

        // Her later reconnect: a snapshot that says she forfeited, and her answers are rejected.
        StompTestClient back = client(anjuSub);
        back.send(to(match.matchId(), "resync"));
        JsonNode snapshot = back.next("SNAPSHOT").get("payload");
        assertThat(snapshot.get("youForfeited").asBoolean()).isTrue();
        assertThat(snapshot.get("scores").get(0).get("forfeited").asBoolean()).isTrue();
        back.send(to(match.matchId(), "answer"), body(0, 0));
        back.error("ANSWER_REJECTED");

        // Vishnu plays on, and the question closes as soon as he answers.
        long before = System.nanoTime();
        vishnu.send(to(match.matchId(), "answer"), body(0, 0));
        vishnu.next("ANSWER_ACCEPTED");
        vishnu.nextBroadcast("SCOREBOARD");
        vishnu.nextBroadcast("QUESTION_REVEALED");
        assertThat(Duration.ofNanos(System.nanoTime() - before)).isLessThan(Duration.ofMillis(1_500));
        double completed = counter(MatchMetrics.ENDED);
        vishnu.send(to(match.matchId(), "leave"));
        vishnu.nextBroadcast("PARTICIPANT_FORFEITED");
        awaitIdle(vishnuSub);
        assertThat(counter(MatchMetrics.ENDED)).isEqualTo(completed + 1);
    }

    @Test
    void leavingBeforeTheFirstRevealAgainstTheBotAbortsTheMatch() {
        String anjuSub = newSub();
        StompTestClient anju = client(anjuSub);
        double aborted = counter(MatchMetrics.ABORTED);
        double completed = counter(MatchMetrics.ENDED);
        Started match = start(List.of(anjuSub), true);
        anju.subscribe(Destinations.matchTopic(match.matchId()));
        anju.nextBroadcast("QUESTION_STARTED");
        anju.send(to(match.matchId(), "leave"));
        JsonNode forfeited = nextOf(anju, "PARTICIPANT_FORFEITED");
        assertThat(forfeited.get("payload").get("participantId").asString()).isEqualTo(match.ids().get(0).toString());
        JsonNode abortedFrame = nextOf(anju, "MATCH_ABORTED");
        assertThat(abortedFrame.get("payload").get("reason").asString()).isEqualTo("ALL_LEFT");
        awaitIdle(anjuSub);
        assertThat(counter(MatchMetrics.ABORTED)).isEqualTo(aborted + 1);
        assertThat(counter(MatchMetrics.ENDED)).isEqualTo(completed);

        // The match is gone: a resync gets NOT_IN_MATCH.
        anju.send(to(match.matchId(), "resync"));
        anju.error("NOT_IN_MATCH");
    }

    @Test
    void whenTheOnlyHumanLeavesAfterTheFirstRevealTheMatchEndsAtOnceAsCompleted() {
        String anjuSub = newSub();
        StompTestClient anju = client(anjuSub);
        double completed = counter(MatchMetrics.ENDED);
        Started match = start(List.of(anjuSub), true);
        anju.subscribe(Destinations.matchTopic(match.matchId()));
        anju.nextBroadcast("QUESTION_STARTED");
        anju.send(to(match.matchId(), "answer"), body(0, 0));
        anju.next("ANSWER_ACCEPTED");
        nextOf(anju, "QUESTION_REVEALED");
        nextOf(anju, "QUESTION_STARTED");
        long before = System.nanoTime();
        anju.send(to(match.matchId(), "leave"));
        nextOf(anju, "PARTICIPANT_FORFEITED");
        JsonNode reveal = nextOf(anju, "QUESTION_REVEALED");
        assertThat(reveal.get("payload").get("questionIndex").asInt()).isEqualTo(1);
        awaitIdle(anjuSub);
        assertThat(Duration.ofNanos(System.nanoTime() - before)).as("closed at once").isLessThan(Duration.ofSeconds(2));
        assertThat(counter(MatchMetrics.ENDED)).isEqualTo(completed + 1);
        anju.expectNothing(Duration.ofMillis(200));
        assertThat(anju.pendingBroadcasts()).as("no further question").isZero();
    }

    @Test
    void aResyncFromSomeoneOutsideTheMatchIsNotInMatchAndALeaveIsIgnored() {
        String anjuSub = newSub();
        String strangerSub = newSub();
        StompTestClient anju = client(anjuSub);
        StompTestClient stranger = client(strangerSub);
        Started match = start(List.of(anjuSub), true);
        anju.subscribe(Destinations.matchTopic(match.matchId()));
        anju.nextBroadcast("QUESTION_STARTED");
        stranger.send(to(match.matchId(), "resync"));
        stranger.error("NOT_IN_MATCH");
        stranger.send(to(match.matchId(), "leave"));
        stranger.expectNothing(Duration.ofMillis(200));
        assertThat(participation.matchOf(anjuSub)).contains(match.matchId());
        anju.send(to(match.matchId(), "leave"));
    }

    @Test
    void aReconnectWithAnExpiredTokenIsRefusedAtConnect() {
        String anjuSub = newSub();
        Instant past = Instant.now().minus(Duration.ofHours(2));
        String expired = JWKS.token(c -> c.subject(anjuSub).issueTime(Date.from(past.minus(Duration.ofHours(24))))
                .expirationTime(Date.from(past)));
        assertThatThrownBy(() -> connect(expired)).isInstanceOf(IllegalStateException.class);
    }

    /** The next topic frame of {@code type}, skipping others (the bot's scoreboards, for one). */
    static JsonNode nextOf(StompTestClient client, String type) {
        for (int i = 0; i < 20; i++) {
            JsonNode frame = client.nextBroadcast(Duration.ofSeconds(5));
            if (frame.get("type").asString().equals(type)) {
                return frame;
            }
        }
        throw new AssertionError("no " + type);
    }
}

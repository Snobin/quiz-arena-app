package in.minnal.game.matchmaking.domain;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.realtime.ParticipantKind;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The pairing rules against a hand-driven clock (AD-13): no threads, no sleeps. */
class MatchmakingQueueTest {

    static final Instant T0 = Instant.parse("2026-11-12T10:00:00Z");

    final MatchmakingQueue queue = new MatchmakingQueue(MatchmakingRules.DEFAULT);

    static Instant at(double seconds) {
        return T0.plusMillis(Math.round(seconds * 1000));
    }

    static Seeker guest(String sub, int rating, double joinedAtSeconds) {
        return new Seeker(sub, "Guest " + sub, ParticipantKind.GUEST, rating, at(joinedAtSeconds));
    }

    static Seeker user(String sub, int rating, double joinedAtSeconds) {
        return new Seeker(sub, "User " + sub, ParticipantKind.USER, rating, at(joinedAtSeconds));
    }

    static List<String> subs(Pairing pairing) {
        return pairing.humans().stream().map(Seeker::sub).toList();
    }

    @Test
    void closeRatingsPairAtOnce() {
        queue.join(guest("a", 1200, 0));
        queue.join(guest("b", 1350, 0));
        List<Pairing> pairs = queue.pair(at(0));
        assertThat(pairs).hasSize(1);
        assertThat(subs(pairs.getFirst())).containsExactly("a", "b");
        assertThat(pairs.getFirst().withBot()).isFalse();
        assertThat(queue.waiting()).isEmpty();
        assertThat(queue.isPairing("a")).isTrue();
    }

    @Test
    void exactly200ApartPairsAt0() {
        queue.join(guest("a", 1200, 0));
        queue.join(guest("b", 1400, 0));
        assertThat(queue.pair(at(0))).hasSize(1);
    }

    @Test
    void wideRatingsWaitForTheBandToWidenAt4s() {
        queue.join(guest("a", 1200, 0));
        queue.join(guest("b", 1500, 0));
        assertThat(queue.pair(at(0))).isEmpty();
        assertThat(queue.pair(at(3.9))).isEmpty();
        List<Pairing> pairs = queue.pair(at(4.0));
        assertThat(pairs).hasSize(1);
        assertThat(subs(pairs.getFirst())).containsExactly("a", "b");
        assertThat(pairs.getFirst().queueWaitMs(pairs.getFirst().first())).isEqualTo(4000);
    }

    @Test
    void theLongerWaitersBandDecides() {
        // a has waited 4 s (±400); b just arrived (±200). 300 apart: a's band admits b.
        queue.join(user("a", 1200, 0));
        assertThat(queue.pair(at(0))).isEmpty();
        queue.join(user("b", 1500, 4.0));
        assertThat(queue.pair(at(4.0))).hasSize(1);
    }

    @Test
    void moreThan400ApartNeverPairAndBothGetBotsAt8s() {
        queue.join(guest("a", 1000, 0));
        queue.join(user("b", 1500, 1));
        assertThat(queue.pair(at(7.99))).isEmpty();
        List<Pairing> atEight = queue.pair(at(8.0));
        assertThat(atEight).hasSize(1);
        assertThat(atEight.getFirst().withBot()).isTrue();
        assertThat(atEight.getFirst().first().sub()).isEqualTo("a");
        assertThat(queue.pair(at(8.99))).isEmpty();
        List<Pairing> atNine = queue.pair(at(9.0));
        assertThat(atNine).singleElement().satisfies(p -> {
            assertThat(p.withBot()).isTrue();
            assertThat(p.first().sub()).isEqualTo("b");
        });
    }

    @Test
    void aLonePlayerGetsABotAtHerOwnRatingAt8s() {
        queue.join(user("anju", 1640, 0));
        assertThat(queue.pair(at(7.9))).isEmpty();
        Pairing pairing = queue.pair(at(8.0)).getFirst();
        assertThat(pairing.withBot()).isTrue();
        assertThat(pairing.humans()).extracting(Seeker::sub).containsExactly("anju");
        assertThat(pairing.botRating()).isEqualTo(1640);
        assertThat(pairing.queueWaitMs(pairing.first())).isEqualTo(8000);
    }

    @Test
    void aHumanWithinTheBandIsPreferredToABotAt8s() {
        queue.join(guest("a", 1200, 0));
        queue.join(guest("b", 1590, 0)); // 390 apart: the widened band at 4 s already pairs them
        assertThat(queue.pair(at(8.0))).singleElement().satisfies(p -> assertThat(p.withBot()).isFalse());
    }

    @Test
    void theOldestIsServedFirstAndTheClosestRatingWins() {
        queue.join(guest("old", 1200, 0));
        queue.join(guest("far", 1390, 1));
        queue.join(guest("near", 1250, 2));
        // At 2 s: "old" is served first and takes the closest ("near"); "far" waits.
        List<Pairing> pairs = queue.pair(at(2));
        assertThat(pairs).hasSize(1);
        assertThat(subs(pairs.getFirst())).containsExactly("old", "near");
        assertThat(queue.waiting()).extracting(Seeker::sub).containsExactly("far");
    }

    @Test
    void equalDistanceGoesToTheEarliestJoin() {
        queue.join(guest("old", 1300, 0));
        queue.join(guest("low", 1250, 1));
        queue.join(guest("high", 1350, 2));
        Pairing pairing = queue.pair(at(2)).getFirst();
        assertThat(subs(pairing)).containsExactly("old", "low");
    }

    @Test
    void aGuestPairsWithARegisteredUser() {
        queue.join(guest("guest", 1200, 0));
        queue.join(user("user", 1300, 0));
        Pairing pairing = queue.pair(at(0)).getFirst();
        assertThat(pairing.humans()).extracting(Seeker::kind).containsExactly(ParticipantKind.GUEST, ParticipantKind.USER);
    }

    @Test
    void manyPlayersPairUpInJoinOrder() {
        queue.join(guest("a", 1200, 0));
        queue.join(guest("b", 1200, 0.1));
        queue.join(guest("c", 1200, 0.2));
        queue.join(guest("d", 1200, 0.3));
        queue.join(guest("e", 1200, 0.4));
        List<Pairing> pairs = queue.pair(at(0.4));
        assertThat(pairs).extracting(MatchmakingQueueTest::subs).containsExactly(List.of("a", "b"), List.of("c", "d"));
        assertThat(queue.waiting()).extracting(Seeker::sub).containsExactly("e");
    }

    @Test
    void aSecondJoinOfTheSameSubIsIgnored() {
        assertThat(queue.join(guest("a", 1200, 0))).isTrue();
        assertThat(queue.join(guest("a", 1200, 1))).isFalse();
        assertThat(queue.waiting()).hasSize(1);
    }

    @Test
    void cancelWhileWaitingRemoves() {
        queue.join(guest("a", 1200, 0));
        assertThat(queue.cancel("a")).isEqualTo(CancelOutcome.CANCELLED);
        assertThat(queue.contains("a")).isFalse();
        assertThat(queue.pair(at(9))).isEmpty();
        assertThat(queue.cancel("a")).isEqualTo(CancelOutcome.NOT_QUEUED);
    }

    @Test
    void cancelAfterPairingIsRejectedUntilThePairingCompletes() {
        queue.join(guest("a", 1200, 0));
        queue.join(guest("b", 1200, 0));
        Pairing pairing = queue.pair(at(0)).getFirst();
        assertThat(queue.cancel("a")).isEqualTo(CancelOutcome.REJECTED_PAIRED);
        assertThat(queue.leave("b")).isFalse(); // a disconnect does not stop a pairing either
        assertThat(queue.complete(pairing.id())).contains(pairing);
        assertThat(queue.complete(pairing.id())).isEmpty();
        assertThat(queue.cancel("a")).isEqualTo(CancelOutcome.NOT_QUEUED);
        assertThat(queue.join(guest("a", 1200, 1))).isTrue(); // free to queue again
    }

    @Test
    void disconnectWhileWaitingRemoves() {
        queue.join(guest("a", 1200, 0));
        queue.join(guest("b", 1900, 0));
        assertThat(queue.leave("a")).isTrue();
        assertThat(queue.leave("a")).isFalse();
        assertThat(queue.pair(at(8))).singleElement().satisfies(p -> assertThat(p.first().sub()).isEqualTo("b"));
    }

    @Test
    void theRulesWidenAndBotAtTheirThresholds() {
        MatchmakingRules rules = MatchmakingRules.DEFAULT;
        assertThat(rules.bandAfter(Duration.ofMillis(3999))).isEqualTo(200);
        assertThat(rules.bandAfter(Duration.ofMillis(4000))).isEqualTo(400);
        assertThat(rules.botDue(Duration.ofMillis(7999))).isFalse();
        assertThat(rules.botDue(Duration.ofMillis(8000))).isTrue();
    }
}

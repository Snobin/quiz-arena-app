package in.minnal.game.match.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.minnal.contracts.realtime.MatchMode;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.metrics.PlayerSessionStats;
import in.minnal.game.metrics.RoomWeeklyMetrics;
import in.minnal.game.support.MutableClock;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.HyperLogLogOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

/** Story 7.3b: the game-side product metrics. */
class ProductMetricsTest {

    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();

    // --- completed / aborted, Quick bot rate, client round trip -------------------------------------------------

    @Test
    void endedAndAbortedAreCountedByModeAndQuickCompletedByOpponentKind() {
        MatchMetrics metrics = new MatchMetrics(meters);
        metrics.ended(MatchMode.QUICK);
        metrics.ended(MatchMode.QUICK);
        metrics.aborted(MatchMode.BATTLE_ROOM);
        metrics.quickCompleted(true);
        metrics.quickCompleted(false);
        metrics.quickCompleted(false);
        assertThat(meters.get(MatchMetrics.ENDED).tag("mode", "QUICK").counter().count()).isEqualTo(2);
        assertThat(meters.get(MatchMetrics.ENDED).tag("mode", "BATTLE_ROOM").counter().count()).isZero();
        assertThat(meters.get(MatchMetrics.ABORTED).tag("mode", "BATTLE_ROOM").counter().count()).isEqualTo(1);
        assertThat(meters.get(MatchMetrics.ABORTED).tag("mode", "QUICK").counter().count()).isZero();
        assertThat(meters.get(MatchMetrics.QUICK_COMPLETED).tag("kind", "bot").counter().count()).isEqualTo(1);
        assertThat(meters.get(MatchMetrics.QUICK_COMPLETED).tag("kind", "human").counter().count()).isEqualTo(2);
    }

    @Test
    void theClientRoundTripIsClampedAndAbsentRecordsNothing() {
        MatchMetrics metrics = new MatchMetrics(meters);
        metrics.clientRtt(null);
        assertThat(meters.get(MatchMetrics.ANSWER_RTT).summary().count()).isZero();
        metrics.clientRtt(99_999);
        metrics.clientRtt(-5);
        metrics.clientRtt(120);
        var summary = meters.get(MatchMetrics.ANSWER_RTT).summary();
        assertThat(summary.count()).isEqualTo(3);
        assertThat(summary.max()).isEqualTo(10_000);
        assertThat(summary.totalAmount()).isEqualTo(10_000 + 0 + 120);
    }

    // --- sessions -----------------------------------------------------------------------------------------------

    @Test
    void aSessionEndsThirtyMinutesAfterHerLastFrameAndCountsItsCompletedMatches() {
        MutableClock clock = new MutableClock(Instant.parse("2026-11-23T04:00:00Z"));
        PlayerSessionStats stats = new PlayerSessionStats(clock, meters);
        MatchSetup setup = MatchTestKit.setup(2, 0, 1);
        stats.touch("h0");
        stats.touch("h1");
        clock.advance(Duration.ofMinutes(10));
        stats.onCompleted(new MatchCompleted(setup));
        stats.touch("h0");
        stats.sweep();
        assertThat(meters.get("minnal.session.matches").summary().count()).isZero(); // nobody idle yet
        clock.advance(Duration.ofMinutes(31));
        stats.sweep();
        var summary = meters.get("minnal.session.matches").summary();
        assertThat(summary.count()).isEqualTo(2);
        assertThat(summary.totalAmount()).isEqualTo(2); // one match each
    }

    @Test
    void aFrameAfterAThirtyMinuteGapStartsAnotherSessionAndZeroMatchSessionsCount() {
        MutableClock clock = new MutableClock(Instant.parse("2026-11-23T04:00:00Z"));
        PlayerSessionStats stats = new PlayerSessionStats(clock, meters);
        stats.touch("h0");
        clock.advance(Duration.ofMinutes(29));
        stats.touch("h0"); // still the same session
        clock.advance(Duration.ofMinutes(30));
        stats.touch("h0"); // the first ended; a second begins
        var summary = meters.get("minnal.session.matches").summary();
        assertThat(summary.count()).isEqualTo(1);
        assertThat(summary.totalAmount()).isZero();
    }

    // --- Battle Room week ----------------------------------------------------------------------------------------

    private record Fixture(RoomWeeklyMetrics metrics, StringRedisTemplate redis, HyperLogLogOperations<String, String> hll,
            ValueOperations<String, String> values) {
    }

    @SuppressWarnings("unchecked")
    private Fixture room(Instant now) {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        HyperLogLogOperations<String, String> hll = mock(HyperLogLogOperations.class);
        ValueOperations<String, String> values = mock(ValueOperations.class);
        when(redis.opsForHyperLogLog()).thenReturn(hll);
        when(redis.opsForValue()).thenReturn(values);
        ObjectProvider<StringRedisTemplate> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(redis);
        return new Fixture(new RoomWeeklyMetrics(provider, new MutableClock(now), meters), redis, hll, values);
    }

    // 2026-11-23 is a Monday in ISO week 48; 18:30 UTC on the 22nd is already Monday 00:00 IST.
    private static final Instant MONDAY = Instant.parse("2026-11-23T05:00:00Z");

    @Test
    void aRoomWithSixHumansAddsTheHostToBothHllsAndCountsTheRoom() {
        Fixture f = room(MONDAY);
        f.metrics().onCompleted(new MatchCompleted(MatchTestKit.room(MatchTestKit.setup(6, 0, 1))));
        verify(f.hll()).add("game:metrics:br-hosts:2026-W48", "h0");
        verify(f.hll()).add("game:metrics:br-hosts-5plus:2026-W48", "h0");
        verify(f.values()).increment("game:metrics:br-rooms:2026-W48");
        verify(f.redis()).expire(eq("game:metrics:br-hosts:2026-W48"), eq(Duration.ofDays(56)));
    }

    @Test
    void aRoomWithTwoHumansCountsTheHostButNotInThe5PlusKey() {
        Fixture f = room(MONDAY);
        f.metrics().onCompleted(new MatchCompleted(MatchTestKit.room(MatchTestKit.setup(2, 0, 1))));
        verify(f.hll()).add("game:metrics:br-hosts:2026-W48", "h0");
        verify(f.hll(), never()).add(eq("game:metrics:br-hosts-5plus:2026-W48"), anyString());
    }

    @Test
    void aSoloRoomAndANonRoomMatchWriteNothing() {
        Fixture f = room(MONDAY);
        f.metrics().onCompleted(new MatchCompleted(MatchTestKit.room(MatchTestKit.setup(1, 0, 1))));
        f.metrics().onCompleted(new MatchCompleted(MatchTestKit.setup(2, 0, 1)));
        verify(f.hll(), never()).add(anyString(), anyString());
        verify(f.values(), never()).increment(anyString());
    }

    @Test
    void theGaugesReadThisAndLastWeek() {
        Fixture f = room(MONDAY);
        when(f.hll().size("game:metrics:br-hosts:2026-W48")).thenReturn(4L);
        when(f.hll().size("game:metrics:br-hosts:2026-W47")).thenReturn(2L);
        when(f.values().get("game:metrics:br-rooms:2026-W48")).thenReturn("7");
        assertThat(meters.get("minnal.room.hosts").tag("kind", "current").gauge().value()).isEqualTo(4);
        assertThat(meters.get("minnal.room.hosts").tag("kind", "previous").gauge().value()).isEqualTo(2);
        assertThat(meters.get("minnal.room.weekly").tag("kind", "current").gauge().value()).isEqualTo(7);
        assertThat(meters.get("minnal.room.weekly").tag("kind", "previous").gauge().value()).isZero();
    }

    @Test
    void theWeekTurnsOverAtMidnightIst() {
        // Sunday 2026-11-22 18:29 UTC is still Sunday 23:59 IST (week 47); one minute later is Monday (week 48).
        Fixture sunday = room(Instant.parse("2026-11-22T18:29:00Z"));
        sunday.metrics().onCompleted(new MatchCompleted(MatchTestKit.room(MatchTestKit.setup(3, 0, 1))));
        verify(sunday.values()).increment("game:metrics:br-rooms:2026-W47");
        Fixture monday = room(Instant.parse("2026-11-22T18:31:00Z"));
        monday.metrics().onCompleted(new MatchCompleted(MatchTestKit.room(MatchTestKit.setup(3, 0, 1))));
        verify(monday.values()).increment("game:metrics:br-rooms:2026-W48");
    }

    @Test
    @SuppressWarnings("unchecked")
    void withoutValkeyTheRoomWritesAreNoOps() {
        ObjectProvider<StringRedisTemplate> none = mock(ObjectProvider.class);
        RoomWeeklyMetrics metrics = new RoomWeeklyMetrics(none, new MutableClock(MONDAY), meters);
        metrics.onCompleted(new MatchCompleted(MatchTestKit.room(MatchTestKit.setup(6, 0, 1))));
        assertThat(meters.get("minnal.room.weekly").tag("kind", "current").gauge().value()).isZero();
    }
}

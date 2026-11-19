package in.minnal.ratings.leaderboard;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.events.CompletedParticipant;
import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.contracts.internal.QuestionSource;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.ratings.ingest.FakeStreamClient;
import in.minnal.ratings.ingest.MatchCompletedHandler;
import in.minnal.ratings.leaderboard.PeriodKeys.Period;
import in.minnal.ratings.outbox.OutboxRelay;
import in.minnal.ratings.outbox.OutboxRepository;
import in.minnal.ratings.support.PostgresIntegrationTest;
import in.minnal.ratings.support.TestClock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.json.JsonMapper;

class LeaderboardProjectorIntegrationTest extends PostgresIntegrationTest {

    static final Instant NOW = Instant.parse("2026-11-23T10:00:00Z");

    @Autowired
    MatchCompletedHandler handler;

    @Autowired
    OutboxRepository outbox;

    @Autowired
    JsonMapper json;

    @Autowired
    Boards boards;

    final FakeLeaderboardStore store = new FakeLeaderboardStore();
    final FakeStreamClient streams = new FakeStreamClient();

    LeaderboardProjector projector() {
        return new LeaderboardProjector(jdbc, store, boards, new TestClock(NOW));
    }

    /** A relay that projects each rating.updated row before publishing it, as in production. */
    OutboxRelay relay() {
        LeaderboardProjector projector = projector();
        return new OutboxRelay(outbox, streams, new TestClock(Instant.parse("2026-11-19T10:00:00Z")), entry -> {
            var event = json.readTree(entry.payload());
            projector.project(UUID.fromString(event.get("userId").asString()), event.get("mode").asString(), Instant.parse(event.get("ratedAt").asString()));
        });
    }

    MatchCompletedEvent match(Instant endedAt, QuestionSource source, List<CompletedParticipant> participants) {
        return MatchCompletedEvent.of(UUID.randomUUID(), MatchMode.QUICK, null, source, endedAt.minusSeconds(180), endedAt, null, participants);
    }

    String daily(Instant at) {
        return boards.key("QUICK", Period.DAILY, at);
    }

    String weekly(Instant at) {
        return boards.key("QUICK", Period.WEEKLY, at);
    }

    String allTime() {
        return boards.key("QUICK", Period.ALLTIME, Instant.now());
    }

    @Test
    void aRatedMatchWritesAbsoluteAllTimeDailyAndWeeklyValuesForBothPlayers() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        Instant t = Instant.parse("2026-11-19T10:00:00Z");
        handler.handle(match(t, QuestionSource.BANK, List.of(user(a, 7000, 1), user(b, 4000, 2))));
        relay().publishPending();

        assertThat(store.boards.get(allTime())).containsEntry(a.toString(), 1216.0).containsEntry(b.toString(), 1184.0);
        assertThat(store.boards.get(daily(t))).containsEntry(a.toString(), 16.0).containsEntry(b.toString(), -16.0);
        assertThat(store.boards.get(weekly(t))).containsEntry(a.toString(), 16.0).containsEntry(b.toString(), -16.0);
        assertThat(store.ttls.get(daily(t))).hasDays(8);
        assertThat(store.ttls.get(weekly(t))).hasDays(35);
        assertThat(store.ttls).doesNotContainKey(allTime());
    }

    @Test
    void theDailyValueIsTheSumOfTheDaysDeltasAndAProjectionRepeatedGivesTheSameBoard() {
        UUID a = UUID.randomUUID();
        Instant day = Instant.parse("2026-11-19T04:00:00Z");
        handler.handle(match(day, QuestionSource.BANK, List.of(user(a, 7000, 1), guest(1, 2))));            // +16
        handler.handle(match(day.plusSeconds(600), QuestionSource.BANK, List.of(user(a, 100, 2), guest(9, 1)))); // lost to a guest at 1216 vs 1200
        relay().publishPending();
        double after = store.boards.get(daily(day)).get(a.toString());
        assertThat(after).isEqualTo(
                jdbc.sql("SELECT SUM(delta) FROM rating_event WHERE user_id = :u").param("u", a).query(Long.class).single().doubleValue());

        projector().project(a, "QUICK", day);
        projector().project(a, "QUICK", day);
        assertThat(store.boards.get(daily(day)).get(a.toString())).isEqualTo(after);
        assertThat(store.boards.get(allTime()).get(a.toString())).isEqualTo(
                jdbc.sql("SELECT rating FROM rating WHERE user_id = :u").param("u", a).query(Integer.class).single().doubleValue());
    }

    @Test
    void aMatchAt235959IstCountsInThatDayAndOneAtMidnightInTheNext() {
        UUID a = UUID.randomUUID();
        Instant lastSecond = Instant.parse("2026-11-19T18:29:59Z");
        Instant midnight = Instant.parse("2026-11-19T18:30:00Z");
        handler.handle(match(lastSecond, QuestionSource.BANK, List.of(user(a, 7000, 1), guest(1, 2))));
        handler.handle(match(midnight, QuestionSource.BANK, List.of(user(a, 7000, 1), guest(1, 2))));
        relay().publishPending();

        assertThat(store.boards.get(daily(lastSecond)).get(a.toString())).isEqualTo(16.0); // the first match only
        assertThat(store.boards.get(daily(midnight)).get(a.toString())).isEqualTo(15.0); // 1216 against a guest at 1200
        assertThat(daily(lastSecond)).endsWith("2026-11-19");
        assertThat(daily(midnight)).endsWith("2026-11-20");
        // Both fall in the same ISO week (Thursday and Friday), so that board sums both.
        assertThat(weekly(lastSecond)).isEqualTo(weekly(midnight));
        assertThat(store.boards.get(weekly(midnight)).get(a.toString())).isEqualTo(31.0); // 16 + 15
    }

    @Test
    void aMatchOnSundayNightAndOneOnMondayMorningLandOnDifferentWeeklyBoards() {
        UUID a = UUID.randomUUID();
        Instant sunday = Instant.parse("2026-11-22T18:29:59Z");
        Instant monday = Instant.parse("2026-11-22T18:30:00Z");
        handler.handle(match(sunday, QuestionSource.BANK, List.of(user(a, 7000, 1), guest(1, 2))));
        handler.handle(match(monday, QuestionSource.BANK, List.of(user(a, 7000, 1), guest(1, 2))));
        relay().publishPending();

        assertThat(weekly(sunday)).endsWith("2026-W47");
        assertThat(weekly(monday)).endsWith("2026-W48");
        assertThat(store.boards.get(weekly(sunday)).get(a.toString())).isEqualTo(16.0);
        assertThat(store.boards.get(weekly(monday)).get(a.toString())).isEqualTo(15.0); // the second match only, in the new week
    }

    @Test
    void aZeroOrNegativeDayStillHasAPosition() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        Instant t = Instant.parse("2026-11-19T10:00:00Z");
        handler.handle(match(t, QuestionSource.BANK, List.of(user(a, 5000, 1), user(b, 5000, 1)))); // a draw: 0 and 0
        handler.handle(match(t.plusSeconds(60), QuestionSource.BANK, List.of(user(a, 100, 2), user(b, 900, 1))));
        relay().publishPending();

        assertThat(store.boards.get(daily(t))).containsEntry(a.toString(), -16.0).containsEntry(b.toString(), 16.0);
        UUID drawn = UUID.randomUUID();
        UUID drawn2 = UUID.randomUUID();
        handler.handle(match(t.plusSeconds(120), QuestionSource.BANK, List.of(user(drawn, 5, 1), user(drawn2, 5, 1))));
        relay().publishPending();
        assertThat(store.boards.get(daily(t))).containsEntry(drawn.toString(), 0.0).containsEntry(drawn2.toString(), 0.0);
    }

    @Test
    void unratedMatchesGuestsAndBotsNeverAppearOnAnyBoard() {
        UUID a = UUID.randomUUID();
        CompletedParticipant guest = guest(100, 2);
        CompletedParticipant bot = bot(50, 3);
        Instant t = Instant.parse("2026-11-19T10:00:00Z");
        handler.handle(match(t, QuestionSource.CUSTOM, List.of(user(a, 7000, 1), guest, bot)));
        handler.handle(match(t.plusSeconds(60), QuestionSource.BANK, List.of(user(a, 7000, 1), guest, bot)));
        relay().publishPending();

        assertThat(store.boards.get(daily(t))).containsOnlyKeys(a.toString()).containsEntry(a.toString(), 16.0); // only the rated match
        store.boards.values().forEach(board -> assertThat(board).doesNotContainKeys(guest.participantId().toString(), bot.participantId().toString()));
    }

    @Test
    void aTombstonedPlayerIsNeverWritten() {
        UUID gone = UUID.randomUUID();
        jdbc.sql("INSERT INTO player_directory (user_id, display_name, district, exam_level, language, updated_at, tombstoned_at) VALUES (:u, 'x', 'thrissur', 'DEGREE', 'ml', now(), now())")
                .param("u", gone).update();
        Instant t = Instant.parse("2026-11-19T10:00:00Z");
        handler.handle(match(t, QuestionSource.BANK, List.of(user(gone, 7000, 1), guest(1, 2))));
        relay().publishPending();
        assertThat(store.boards).isEmpty();
    }

    @Test
    void aProjectionFailureLeavesTheRowUnpublishedAndItIsRetried() {
        UUID a = UUID.randomUUID();
        handler.handle(match(Instant.parse("2026-11-19T10:00:00Z"), QuestionSource.BANK, List.of(user(a, 7000, 1), guest(1, 2))));
        boolean[] failOnce = {true};
        LeaderboardStore flaky = new FakeLeaderboardStore() {
            @Override
            public void set(String key, String member, double score, java.time.Duration ttl) {
                if (failOnce[0]) {
                    failOnce[0] = false;
                    throw new IllegalStateException("valkey down");
                }
                super.set(key, member, score, ttl);
            }
        };
        LeaderboardProjector projector = new LeaderboardProjector(jdbc, flaky, boards, new TestClock(NOW));
        TestClock clock = new TestClock(Instant.parse("2026-11-19T10:00:00Z"));
        OutboxRelay relay = new OutboxRelay(outbox, streams, clock, entry -> {
            var event = json.readTree(entry.payload());
            projector.project(UUID.fromString(event.get("userId").asString()), event.get("mode").asString(), Instant.parse(event.get("ratedAt").asString()));
        });

        assertThat(relay.publishPending()).isZero();
        assertThat(streams.entries("minnal.rating.updated")).isEmpty(); // not published without its board
        clock.set(clock.instant().plusSeconds(10));
        assertThat(relay.publishPending()).isEqualTo(1);
        assertThat(streams.entries("minnal.rating.updated")).hasSize(1);
    }

    @Test
    void aRowOlderThanTheRetentionWindowDoesNotRecreateAnExpiredBoard() {
        UUID a = UUID.randomUUID();
        Instant old = NOW.minus(java.time.Duration.ofDays(60)); // well past 8 days and 5 weeks
        handler.handle(match(old, QuestionSource.BANK, List.of(user(a, 7000, 1), guest(1, 2))));
        relay().publishPending();

        assertThat(store.boards.keySet()).containsExactly(allTime()); // all-time is current by nature; no stale daily or weekly board
    }
}

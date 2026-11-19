package in.minnal.ratings.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.events.CompletedParticipant;
import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.contracts.internal.QuestionSource;
import in.minnal.ratings.support.PostgresIntegrationTest;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;

import in.minnal.ratings.outbox.OutboxRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.beans.factory.annotation.Autowired;

class MatchCompletedHandlerIntegrationTest extends PostgresIntegrationTest {

    @Autowired
    MatchCompletedHandler handler;

    @MockitoSpyBean
    OutboxRepository outboxSpy;

    int ratingOf(UUID user) {
        return jdbc.sql("SELECT rating FROM rating WHERE user_id = :u AND mode = 'QUICK'").param("u", user).query(Integer.class).single();
    }

    @Test
    void aRatedOneVsOneWritesEverythingForBothUsersInOneGo() {
        UUID anju = UUID.randomUUID();
        UUID vishnu = UUID.randomUUID();
        UUID match = UUID.randomUUID();

        assertThat(handler.handle(rated(match, List.of(user(anju, 7000, 1), user(vishnu, 4000, 2))))).isEqualTo(MatchCompletedHandler.Outcome.APPLIED);

        assertThat(ratingOf(anju)).isEqualTo(1216);
        assertThat(ratingOf(vishnu)).isEqualTo(1184);
        assertThat(count("rating_event")).isEqualTo(2);
        assertThat(count("match_record")).isEqualTo(2);
        assertThat(count("event_outbox")).isEqualTo(2);
        Map<String, Object> record = jdbc.sql("SELECT result, rating_delta, rated, placement, score FROM match_record WHERE user_id = :u")
                .param("u", anju).query().singleRow();
        assertThat(record).containsEntry("result", "WIN").containsEntry("rating_delta", 16).containsEntry("rated", true)
                .containsEntry("placement", 1).containsEntry("score", 7000);
        assertThat(jdbc.sql("SELECT result FROM match_record WHERE user_id = :u").param("u", vishnu).query(String.class).single()).isEqualTo("LOSS");
        assertThat(jdbc.sql("SELECT rating_before || '>' || rating_after || ':' || delta FROM rating_event WHERE user_id = :u")
                .param("u", anju).query(String.class).single()).isEqualTo("1200>1216:16");
        assertThat(jdbc.sql("SELECT matches_rated FROM rating WHERE user_id = :u AND mode = 'QUICK'").param("u", anju).query(Integer.class).single()).isEqualTo(1);
        // One minnal.rating.updated per rated user, with the new rating and the match's end time.
        List<String> payloads = jdbc.sql("SELECT payload::text FROM event_outbox WHERE stream = 'minnal.rating.updated' ORDER BY id").query(String.class).list();
        assertThat(payloads).hasSize(2);
        assertThat(jdbc.sql("SELECT payload->>'rating' FROM event_outbox WHERE payload->>'userId' = :u").param("u", anju.toString()).query(String.class).single()).isEqualTo("1216");
        assertThat(jdbc.sql("SELECT (payload->>'mode') || (payload->>'ratedAt') FROM event_outbox WHERE payload->>'userId' = :u").param("u", anju.toString()).query(String.class).single())
                .isEqualTo("QUICK2026-11-19T10:00:00Z");
    }

    @Test
    void aDrawLeavesEqualRatingsAndIsRecordedAsADraw() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        handler.handle(rated(UUID.randomUUID(), List.of(user(a, 5000, 1), user(b, 5000, 1))));
        assertThat(ratingOf(a)).isEqualTo(1200);
        assertThat(jdbc.sql("SELECT DISTINCT result FROM match_record").query(String.class).list()).containsExactly("DRAW");
    }

    @Test
    void aGuestOpponentCountsAs1200AndIsNeverStored() {
        UUID anju = UUID.randomUUID();
        CompletedParticipant guest = guest(2000, 2);
        handler.handle(rated(UUID.randomUUID(), List.of(user(anju, 7000, 1), guest)));

        assertThat(ratingOf(anju)).isEqualTo(1216);
        assertThat(count("rating")).isEqualTo(1);
        assertThat(count("match_record")).isEqualTo(1);
        assertNothingStoredFor(guest.participantId().toString());
    }

    @Test
    void aBotCountsAsThePlayersOwnRatingSoTheWinIsWorth16() {
        UUID anju = UUID.randomUUID();
        jdbc.sql("INSERT INTO rating (user_id, mode, rating, matches_rated, updated_at) VALUES (:u, 'QUICK', 1500, 4, now())").param("u", anju).update();
        CompletedParticipant bot = bot(100, 2);
        handler.handle(rated(UUID.randomUUID(), List.of(user(anju, 7000, 1), bot)));

        assertThat(ratingOf(anju)).isEqualTo(1516);
        assertNothingStoredFor(bot.participantId().toString());
    }

    @Test
    void aUserWithNoRatingRowStartsAt1200WhateverThePrerated() {
        UUID veteran = UUID.randomUUID();
        UUID fresh = UUID.randomUUID();
        jdbc.sql("INSERT INTO rating (user_id, mode, rating, matches_rated, updated_at) VALUES (:u, 'QUICK', 1500, 9, now())").param("u", veteran).update();
        handler.handle(rated(UUID.randomUUID(), List.of(user(veteran, 7000, 1), user(fresh, 1000, 2))));
        // 1500 beats 1200: +5; 1200 loses to 1500: -5, both from pre-match ratings.
        assertThat(ratingOf(veteran)).isEqualTo(1505);
        assertThat(ratingOf(fresh)).isEqualTo(1195);
    }

    @Test
    void aForfeiterIsRatedOnHerPlacementLikeAnyoneElse() {
        UUID leaver = UUID.randomUUID();
        UUID stayer = UUID.randomUUID();
        CompletedParticipant forfeiter = new CompletedParticipant(UUID.randomUUID(), leaver.toString(),
                in.minnal.contracts.realtime.ParticipantKind.USER, "Leaver", 6000, 2, true, 2);
        handler.handle(rated(UUID.randomUUID(), List.of(user(stayer, 1000, 1), forfeiter)));
        assertThat(ratingOf(leaver)).isEqualTo(1184);
        assertThat(jdbc.sql("SELECT forfeited || ':' || result FROM match_record WHERE user_id = :u").param("u", leaver).query(String.class).single()).isEqualTo("true:LOSS");
    }

    @Test
    void anUnratedMatchOnlyWritesMatchRecordsWithNoDeltaAndNoRatingEvents() {
        UUID anju = UUID.randomUUID();
        handler.handle(event(UUID.randomUUID(), QuestionSource.CUSTOM, List.of(user(anju, 7000, 1), guest(100, 2))));

        assertThat(count("rating")).isZero();
        assertThat(count("rating_event")).isZero();
        assertThat(count("event_outbox")).isZero();
        Map<String, Object> record = jdbc.sql("SELECT rated, rating_delta FROM match_record").query().singleRow();
        assertThat(record).containsEntry("rated", false);
        assertThat(record.get("rating_delta")).isNull();
    }

    @Test
    void theSameEventTwiceOrTheSameMatchUnderANewEventIdChangesNothingTheSecondTime() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        UUID match = UUID.randomUUID();
        MatchCompletedEvent first = rated(match, List.of(user(a, 7000, 1), user(b, 4000, 2)));
        handler.handle(first);

        assertThat(handler.handle(first)).isEqualTo(MatchCompletedHandler.Outcome.DUPLICATE);
        assertThat(handler.handle(rated(match, List.of(user(a, 7000, 1), user(b, 4000, 2))))).isEqualTo(MatchCompletedHandler.Outcome.DUPLICATE);

        assertThat(ratingOf(a)).isEqualTo(1216);
        assertThat(count("rating_event")).isEqualTo(2);
        assertThat(count("match_record")).isEqualTo(2);
        assertThat(count("event_outbox")).isEqualTo(2);
        assertThat(jdbc.sql("SELECT matches_rated FROM rating WHERE user_id = :u").param("u", a).query(Integer.class).single()).isEqualTo(1);
    }

    @Test
    void aTableDumpHoldsNoGuestOrBotIdAfterAMixOfEvents() {
        UUID anju = UUID.randomUUID();
        CompletedParticipant g = guest(10, 2);
        CompletedParticipant bt = bot(20, 3);
        handler.handle(rated(UUID.randomUUID(), List.of(user(anju, 900, 1), g, bt)));
        handler.handle(event(UUID.randomUUID(), QuestionSource.CUSTOM, List.of(user(anju, 900, 1), g)));
        for (String table : List.of("rating", "rating_event", "match_record", "player_directory", "event_outbox")) {
            for (CompletedParticipant p : List.of(g, bt)) {
                assertThat(jdbc.sql("SELECT count(*) FROM " + table + " t WHERE t::text LIKE '%' || :id || '%'").param("id", p.participantId().toString())
                        .query(Long.class).single()).as(table).isZero();
            }
        }
    }

    @Test
    void aFourUserMatchUsesPreMatchRatingsForEveryDelta() {
        UUID[] ids = {UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID()};
        handler.handle(rated(UUID.randomUUID(), List.of(user(ids[0], 9, 1), user(ids[1], 8, 2), user(ids[2], 8, 2), user(ids[3], 1, 4))));
        assertThat(ratingOf(ids[0])).isEqualTo(1216);
        assertThat(ratingOf(ids[1])).isEqualTo(1200);
        assertThat(ratingOf(ids[2])).isEqualTo(1200);
        assertThat(ratingOf(ids[3])).isEqualTo(1184);
    }

    private void assertNothingStoredFor(String id) {
        for (String table : List.of("rating", "rating_event", "match_record", "player_directory", "event_outbox")) {
            assertThat(jdbc.sql("SELECT count(*) FROM " + table + " t WHERE t::text LIKE '%' || :id || '%'").param("id", id).query(Long.class).single())
                    .as(table).isZero();
        }
    }

    @Test
    void aFailureMidWayRollsBackEveryTableSoARetryStartsClean() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        MatchCompletedEvent event = rated(UUID.randomUUID(), List.of(user(a, 7000, 1), user(b, 4000, 2)));
        doThrow(new IllegalStateException("outbox down")).when(outboxSpy).add(anyString(), anyString(), any());

        assertThatThrownBy(() -> handler.handle(event)).isInstanceOf(IllegalStateException.class);

        for (String table : List.of("rating", "rating_event", "match_record", "event_outbox")) {
            assertThat(count(table)).as(table).isZero();
        }
        org.mockito.Mockito.reset(outboxSpy);
        assertThat(handler.handle(event)).isEqualTo(MatchCompletedHandler.Outcome.APPLIED);
        assertThat(ratingOf(a)).isEqualTo(1216);
    }

    @Test
    void anUnratedEventDeliveredTwiceIsADuplicateTheSecondTime() {
        UUID anju = UUID.randomUUID();
        MatchCompletedEvent event = event(UUID.randomUUID(), QuestionSource.CUSTOM, List.of(user(anju, 7000, 1), guest(100, 2)));
        assertThat(handler.handle(event)).isEqualTo(MatchCompletedHandler.Outcome.APPLIED);
        assertThat(handler.handle(event)).isEqualTo(MatchCompletedHandler.Outcome.DUPLICATE);
        assertThat(count("match_record")).isEqualTo(1);
    }

    @Test
    void aUserListedTwiceIsAMalformedEventThatFailsLoudlyAndWritesNothing() {
        UUID a = UUID.randomUUID();
        MatchCompletedEvent twice = rated(UUID.randomUUID(), List.of(user(a, 7000, 1), user(a, 4000, 2)));
        assertThatThrownBy(() -> handler.handle(twice)).isInstanceOf(IllegalArgumentException.class);
        assertThat(count("rating")).isZero();
        assertThat(count("match_record")).isZero();
    }

    @Test
    void ratingUpdatedAtNeverMovesBackwardsWhenAnOlderMatchArrivesLate() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        handler.handle(rated(UUID.randomUUID(), List.of(user(a, 7000, 1), user(b, 4000, 2))));
        java.time.Instant newer = jdbc.sql("SELECT updated_at FROM rating WHERE user_id = :u").param("u", a).query(java.sql.Timestamp.class).single().toInstant();
        MatchCompletedEvent older = MatchCompletedEvent.of(UUID.randomUUID(), in.minnal.contracts.realtime.MatchMode.QUICK, null, QuestionSource.BANK,
                newer.minusSeconds(7200), newer.minusSeconds(3600), null, List.of(user(a, 100, 2), user(b, 900, 1)));
        handler.handle(older);
        assertThat(jdbc.sql("SELECT updated_at FROM rating WHERE user_id = :u").param("u", a).query(java.sql.Timestamp.class).single().toInstant()).isEqualTo(newer);
    }
}

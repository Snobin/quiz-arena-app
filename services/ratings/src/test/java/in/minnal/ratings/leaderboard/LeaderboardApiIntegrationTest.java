package in.minnal.ratings.leaderboard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.minnal.ratings.leaderboard.PeriodKeys.Period;
import in.minnal.ratings.platform.infrastructure.security.TestJwks;
import in.minnal.ratings.support.PostgresIntegrationTest;
import in.minnal.ratings.support.TestClock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@AutoConfigureMockMvc
@Import(LeaderboardApiIntegrationTest.Fakes.class)
class LeaderboardApiIntegrationTest extends PostgresIntegrationTest {

    static final Instant NOW = Instant.parse("2026-11-19T10:00:00Z");
    static final TestJwks JWKS = TestJwks.start();

    @TestConfiguration
    static class Fakes {
        @Bean
        @Primary
        FakeLeaderboardStore fakeLeaderboardStore() {
            return new FakeLeaderboardStore();
        }

        @Bean
        @Primary
        TestClock testClock() {
            return new TestClock(NOW);
        }
    }

    @DynamicPropertySource
    static void jwks(DynamicPropertyRegistry registry) {
        registry.add("minnal.security.jwks-uri", JWKS::uri);
    }

    @AfterAll
    static void stop() {
        JWKS.close();
    }

    @Autowired
    MockMvc mvc;

    @Autowired
    FakeLeaderboardStore store;

    @Autowired
    Boards boards;

    String bearer(UUID user, String role) {
        return "Bearer " + JWKS.token(c -> c.subject(user.toString()).claim("roles", List.of(role)));
    }

    String key(String mode, Period period) {
        return boards.key(mode, period, NOW);
    }

    ResultActions getAs(String path, UUID user) throws Exception {
        return mvc.perform(get(path).header("Authorization", bearer(user, "USER")));
    }

    void directory(UUID user, String name, String district) {
        jdbc.sql("INSERT INTO player_directory (user_id, display_name, district, exam_level, language, updated_at) VALUES (:u, :n, :d, 'DEGREE', 'ml', now())")
                .param("u", user).param("n", name).param("d", district).update();
    }

    @org.junit.jupiter.api.BeforeEach
    void clear() {
        store.boards.clear();
    }

    @Test
    void ranksUseCompetitionRankingWithNamesAndDistrictsEmbeddedAndTheRightMeasure() throws Exception {
        UUID p30 = UUID.fromString("00000000-0000-0000-0000-0000000000a1");
        UUID p20a = UUID.fromString("00000000-0000-0000-0000-0000000000a2");
        UUID p20b = UUID.fromString("00000000-0000-0000-0000-0000000000a3");
        UUID p10 = UUID.fromString("00000000-0000-0000-0000-0000000000a4");
        store.set(key("QUICK", Period.DAILY), p30.toString(), 30, null);
        store.set(key("QUICK", Period.DAILY), p20a.toString(), 20, null);
        store.set(key("QUICK", Period.DAILY), p20b.toString(), 20, null);
        store.set(key("QUICK", Period.DAILY), p10.toString(), 10, null);
        directory(p30, "Anju", "thrissur");
        directory(p20a, "അഞ്ജു", "kollam");

        getAs("/api/ratings/v1/leaderboards/QUICK/daily", UUID.randomUUID()).andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("QUICK")).andExpect(jsonPath("$.period").value("daily"))
                .andExpect(jsonPath("$.periodKey").value("2026-11-19")).andExpect(jsonPath("$.measure").value("RATING_GAINED"))
                .andExpect(jsonPath("$.entries.length()").value(4))
                .andExpect(jsonPath("$.entries[0].rank").value(1)).andExpect(jsonPath("$.entries[0].value").value(30))
                .andExpect(jsonPath("$.entries[0].displayName").value("Anju")).andExpect(jsonPath("$.entries[0].district").value("thrissur"))
                .andExpect(jsonPath("$.entries[1].rank").value(2)).andExpect(jsonPath("$.entries[2].rank").value(2))
                .andExpect(jsonPath("$.entries[3].rank").value(4)).andExpect(jsonPath("$.entries[3].value").value(10))
                .andExpect(jsonPath("$.entries[3].displayName").value("")); // no directory row yet
    }

    @Test
    void weeklyIsRatingGainedAndAllTimeIsRatingWithItsOwnPeriodKey() throws Exception {
        UUID p = UUID.randomUUID();
        store.set(key("QUICK", Period.WEEKLY), p.toString(), 12, null);
        store.set(key("QUICK", Period.ALLTIME), p.toString(), 1512, null);
        getAs("/api/ratings/v1/leaderboards/QUICK/weekly", p).andExpect(jsonPath("$.periodKey").value("2026-W47")).andExpect(jsonPath("$.measure").value("RATING_GAINED"));
        getAs("/api/ratings/v1/leaderboards/QUICK/alltime", p).andExpect(jsonPath("$.periodKey").value("all")).andExpect(jsonPath("$.measure").value("RATING"))
                .andExpect(jsonPath("$.entries[0].value").value(1512));
    }

    @Test
    void meIsRankAndValueForARegisteredCallerWithAPositionNullWithoutOneAndAbsentForAGuest() throws Exception {
        UUID top = UUID.randomUUID();
        UUID me = UUID.randomUUID();
        UUID nobody = UUID.randomUUID();
        store.set(key("QUICK", Period.DAILY), top.toString(), 40, null);
        store.set(key("QUICK", Period.DAILY), me.toString(), -18, null);

        getAs("/api/ratings/v1/leaderboards/QUICK/daily", me).andExpect(jsonPath("$.me.rank").value(2)).andExpect(jsonPath("$.me.value").value(-18));
        getAs("/api/ratings/v1/leaderboards/QUICK/daily", nobody).andExpect(jsonPath("$.me").value((Object) null))
                .andExpect(jsonPath("$.me").hasJsonPath()); // present, and null
        mvc.perform(get("/api/ratings/v1/leaderboards/QUICK/daily").header("Authorization", "Bearer " + JWKS.validToken()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.entries.length()").value(2)).andExpect(jsonPath("$.me").doesNotExist());
        mvc.perform(get("/api/ratings/v1/leaderboards/QUICK/daily")).andExpect(status().isUnauthorized());
    }

    @Test
    void onlyTheTop100AreListedAtMost50AtATimeButMeCanBeBeyondThem() throws Exception {
        UUID me = UUID.randomUUID();
        for (int i = 0; i < 120; i++) {
            store.set(key("QUICK", Period.ALLTIME), new UUID(0, i + 1).toString(), 5000 - i, null);
        }
        store.set(key("QUICK", Period.ALLTIME), me.toString(), 100, null); // 121st
        getAs("/api/ratings/v1/leaderboards/QUICK/alltime?limit=50", me).andExpect(jsonPath("$.entries.length()").value(50))
                .andExpect(jsonPath("$.me.rank").value(121));
        getAs("/api/ratings/v1/leaderboards/QUICK/alltime?offset=80&limit=50", me).andExpect(jsonPath("$.entries.length()").value(20))
                .andExpect(jsonPath("$.entries[19].rank").value(100));
        getAs("/api/ratings/v1/leaderboards/QUICK/alltime?offset=100", me).andExpect(jsonPath("$.entries.length()").value(0));
        getAs("/api/ratings/v1/leaderboards/QUICK/alltime?offset=500", me).andExpect(jsonPath("$.entries.length()").value(0));
    }

    @Test
    void anUnknownModeOrPeriodOrABadPagingIs400ProblemDetails() throws Exception {
        UUID me = UUID.randomUUID();
        for (String path : List.of("/api/ratings/v1/leaderboards/CHESS/daily", "/api/ratings/v1/leaderboards/QUICK/monthly",
                "/api/ratings/v1/leaderboards/QUICK/daily?limit=51", "/api/ratings/v1/leaderboards/QUICK/daily?limit=0",
                "/api/ratings/v1/leaderboards/QUICK/daily?offset=-1", "/api/ratings/v1/leaderboards/quick/daily")) {
            getAs(path, me).andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
        }
    }

    @Test
    void ranksOfALaterPageAreTheirTruePositionsAndTiesAcrossAPageStillShareARank() throws Exception {
        for (int i = 0; i < 10; i++) {
            store.set(key("QUICK", Period.ALLTIME), new UUID(0, i + 1).toString(), 1000 - (i / 3) * 10, null); // 1000,1000,1000,990,990,990,980,...
        }
        UUID me = UUID.randomUUID();
        getAs("/api/ratings/v1/leaderboards/QUICK/alltime?offset=2&limit=5", me).andExpect(jsonPath("$.entries.length()").value(5))
                .andExpect(jsonPath("$.entries[0].rank").value(1)).andExpect(jsonPath("$.entries[1].rank").value(4))
                .andExpect(jsonPath("$.entries[2].rank").value(4)).andExpect(jsonPath("$.entries[3].rank").value(4))
                .andExpect(jsonPath("$.entries[4].rank").value(7));
    }

    @Test
    void aTombstonedPlayerIsNotListedAndAnUnparseableMemberDoesNotBreakTheBoard() throws Exception {
        UUID gone = UUID.fromString("00000000-0000-0000-0000-0000000000b1");
        UUID here = UUID.fromString("00000000-0000-0000-0000-0000000000b2");
        store.set(key("QUICK", Period.ALLTIME), gone.toString(), 1500, null);
        store.set(key("QUICK", Period.ALLTIME), here.toString(), 1400, null);
        store.set(key("QUICK", Period.ALLTIME), "not-a-user-id", 1300, null);
        jdbc.sql("INSERT INTO player_directory (user_id, display_name, district, exam_level, language, updated_at, tombstoned_at) VALUES (:u, 'x', 'thrissur', 'DEGREE', 'ml', now(), now())")
                .param("u", gone).update();
        directory(here, "Anju", "kollam");

        getAs("/api/ratings/v1/leaderboards/QUICK/alltime", UUID.randomUUID()).andExpect(status().isOk())
                .andExpect(jsonPath("$.entries.length()").value(1)).andExpect(jsonPath("$.entries[0].userId").value(here.toString()))
                .andExpect(jsonPath("$.entries[0].rank").value(2)); // the deleted account still held the position above, until a rebuild
    }

    @Test
    void aCallerSubInUpperCaseStillFindsHerPosition() throws Exception {
        UUID me = UUID.fromString("00000000-0000-0000-0000-00000000abcd");
        store.set(key("QUICK", Period.ALLTIME), me.toString(), 1300, null);
        mvc.perform(get("/api/ratings/v1/leaderboards/QUICK/alltime").header("Authorization",
                "Bearer " + JWKS.token(c -> c.subject(me.toString().toUpperCase()).claim("roles", List.of("USER")))))
                .andExpect(jsonPath("$.me.rank").value(1));
    }

    @Test
    void periodAndModeAreCaseSensitive() throws Exception {
        UUID me = UUID.randomUUID();
        getAs("/api/ratings/v1/leaderboards/QUICK/DAILY", me).andExpect(status().isBadRequest());
        getAs("/api/ratings/v1/leaderboards/QUICK/AllTime", me).andExpect(status().isBadRequest());
        getAs("/api/ratings/v1/leaderboards/QUICK/daily?limit=abc", me).andExpect(status().isBadRequest());
    }

    @Test
    void aValkeyFailureIs503ProblemDetailsNotA500() throws Exception {
        UUID me = UUID.randomUUID();
        store.failing = true;
        try {
            getAs("/api/ratings/v1/leaderboards/QUICK/daily", me).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.status").value(503));
        } finally {
            store.failing = false;
        }
    }

    @Test
    void anEmptyBoardIsAnEmptyList() throws Exception {
        UUID me = UUID.randomUUID();
        getAs("/api/ratings/v1/leaderboards/TOPIC_DUEL/daily", me).andExpect(status().isOk()).andExpect(jsonPath("$.entries.length()").value(0))
                .andExpect(jsonPath("$.me").value((Object) null));
        assertThat(store.boards).isEmpty();
    }
}

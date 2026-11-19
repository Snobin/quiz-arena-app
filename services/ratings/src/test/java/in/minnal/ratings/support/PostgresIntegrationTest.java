package in.minnal.ratings.support;

import in.minnal.contracts.events.CompletedParticipant;
import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.contracts.internal.QuestionSource;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.ParticipantKind;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Base for integration tests against a real Postgres 18 (Testcontainers; needs Docker). One container is shared by
 * every test class so the Spring context is cached; each test starts from empty ratings tables. The stream loops
 * and Redis are off in the {@code it} profile.
 */
@SpringBootTest
@ActiveProfiles("it")
public abstract class PostgresIntegrationTest {

    protected static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18").withInitScript("db/it-init.sql");

    static {
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    protected JdbcClient jdbc;

    @BeforeEach
    void emptyTables() {
        jdbc.sql("TRUNCATE rating, rating_event, match_record, player_directory, event_outbox").update();
    }

    protected long count(String table) {
        return jdbc.sql("SELECT count(*) FROM " + table).query(Long.class).single();
    }

    /** A participant of a finished match. */
    public static CompletedParticipant user(UUID userId, int score, int placement) {
        return new CompletedParticipant(UUID.randomUUID(), userId.toString(), ParticipantKind.USER, "Player", score, 3, false, placement);
    }

    public static CompletedParticipant guest(int score, int placement) {
        return new CompletedParticipant(UUID.randomUUID(), null, ParticipantKind.GUEST, "Guest 4821", score, 3, false, placement);
    }

    public static CompletedParticipant bot(int score, int placement) {
        return new CompletedParticipant(UUID.randomUUID(), null, ParticipantKind.BOT, "Minnal Bot", score, 3, false, placement);
    }

    public static MatchCompletedEvent event(UUID matchId, QuestionSource source, List<CompletedParticipant> participants) {
        Instant end = Instant.parse("2026-11-19T10:00:00Z");
        return MatchCompletedEvent.of(matchId, MatchMode.QUICK, null, source, end.minusSeconds(180), end, null, participants);
    }

    public static MatchCompletedEvent rated(UUID matchId, List<CompletedParticipant> participants) {
        return event(matchId, QuestionSource.BANK, participants);
    }
}

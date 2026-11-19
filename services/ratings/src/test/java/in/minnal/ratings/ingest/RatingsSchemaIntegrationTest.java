package in.minnal.ratings.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.ratings.support.PostgresIntegrationTest;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.junit.jupiter.api.Test;

class RatingsSchemaIntegrationTest extends PostgresIntegrationTest {

    Map<String, String> columns(String table) {
        Map<String, String> out = new TreeMap<>();
        jdbc.sql("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'ratings' AND table_name = :t")
                .param("t", table).query((rs, n) -> out.put(rs.getString(1), rs.getString(2))).list();
        return out;
    }

    @Test
    void createsOnlyTheFiveTablesAndNoForeignKeys() {
        assertThat(jdbc.sql("SELECT table_name FROM information_schema.tables WHERE table_schema = 'ratings' ORDER BY 1").query(String.class).list())
                .containsExactly("event_outbox", "flyway_schema_history", "match_record", "player_directory", "rating", "rating_event");
        assertThat(jdbc.sql("SELECT count(*) FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'ratings'")
                .query(Long.class).single()).isZero();
    }

    @Test
    void tablesHoldTheEpicColumns() {
        assertThat(columns("rating")).containsOnlyKeys("user_id", "mode", "rating", "matches_rated", "updated_at");
        assertThat(columns("rating_event")).containsOnlyKeys("id", "event_id", "match_id", "user_id", "mode", "rating_before", "rating_after", "delta", "ended_at");
        assertThat(columns("match_record")).containsOnlyKeys("match_id", "user_id", "mode", "placement", "result", "score", "correct_count", "forfeited", "rated", "rating_delta", "ended_at");
        assertThat(columns("player_directory")).containsOnlyKeys("user_id", "display_name", "district", "exam_level", "language", "updated_at", "tombstoned_at");
        assertThat(columns("event_outbox")).containsOnlyKeys("id", "stream", "payload", "created_at", "published_at", "attempts");
    }

    @Test
    void uniqueKeysGuardDuplicatesAndModesAreChecked() {
        jdbc.sql("INSERT INTO rating_event (event_id, match_id, user_id, mode, rating_before, rating_after, delta, ended_at) VALUES (gen_random_uuid(), :m, :u, 'QUICK', 1200, 1216, 16, now())")
                .param("m", java.util.UUID.fromString("00000000-0000-0000-0000-000000000001")).param("u", java.util.UUID.fromString("00000000-0000-0000-0000-000000000002")).update();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.sql("INSERT INTO rating_event (event_id, match_id, user_id, mode, rating_before, rating_after, delta, ended_at) VALUES (gen_random_uuid(), :m, :u, 'QUICK', 1200, 1216, 16, now())")
                .param("m", java.util.UUID.fromString("00000000-0000-0000-0000-000000000001")).param("u", java.util.UUID.fromString("00000000-0000-0000-0000-000000000002")).update())
                .isInstanceOf(org.springframework.dao.DuplicateKeyException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.sql("INSERT INTO rating (user_id, mode, rating, matches_rated, updated_at) VALUES (gen_random_uuid(), 'CHESS', 1200, 0, now())").update())
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }
}

package in.minnal.ratings.directory;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The player directory (AD-16): a read model of names, district, exam level and language fed by
 * {@code minnal.user.profileUpdated}. Last write wins by the event's {@code updatedAt}, so an older event
 * delivered late never overwrites a newer one, and a tombstoned player is never brought back.
 */
@Service
public class PlayerDirectory {

    private final JdbcClient jdbc;
    private final JsonMapper json;

    public PlayerDirectory(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /** Applies one profileUpdated payload; returns true when the directory row changed. */
    public boolean apply(String payload) {
        JsonNode event = json.readTree(payload);
        UUID userId = UUID.fromString(text(event, "userId"));
        Instant updatedAt = Instant.parse(text(event, "updatedAt"));
        return jdbc.sql("""
                INSERT INTO player_directory (user_id, display_name, district, exam_level, language, updated_at)
                VALUES (:id, :name, :district, :level, :lang, :at)
                ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, district = EXCLUDED.district,
                    exam_level = EXCLUDED.exam_level, language = EXCLUDED.language, updated_at = EXCLUDED.updated_at
                WHERE player_directory.updated_at < EXCLUDED.updated_at AND player_directory.tombstoned_at IS NULL
                """)
                .param("id", userId).param("name", text(event, "displayName")).param("district", text(event, "district"))
                .param("level", text(event, "examLevel")).param("lang", text(event, "language"))
                .param("at", Timestamp.from(updatedAt)).update() > 0;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            throw new IllegalArgumentException("profileUpdated has no " + field);
        }
        return value.asString();
    }
}

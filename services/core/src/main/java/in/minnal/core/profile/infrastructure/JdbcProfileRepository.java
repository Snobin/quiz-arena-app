package in.minnal.core.profile.infrastructure;

import in.minnal.core.profile.application.ProfileRepository;
import in.minnal.core.profile.domain.Profile;
import in.minnal.core.question.domain.ExamLevel;
import java.sql.Timestamp;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcProfileRepository implements ProfileRepository {

    private final JdbcClient jdbc;

    JdbcProfileRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<Profile> find(UUID userId) {
        return jdbc.sql("SELECT user_id, display_name, district, exam_level, language, updated_at FROM user_profile WHERE user_id = :id")
                .param("id", userId)
                .query((rs, n) -> new Profile(rs.getObject("user_id", UUID.class), rs.getString("display_name"),
                        rs.getString("district"), ExamLevel.valueOf(rs.getString("exam_level")), rs.getString("language"),
                        rs.getTimestamp("updated_at").toInstant()))
                .optional();
    }

    @Override
    public void upsert(Profile p) {
        jdbc.sql("""
                INSERT INTO user_profile (user_id, display_name, district, exam_level, language, updated_at)
                VALUES (:id, :name, :district, :level, :lang, :at)
                ON CONFLICT (user_id) DO UPDATE SET display_name = :name, district = :district,
                    exam_level = :level, language = :lang, updated_at = :at
                """)
                .param("id", p.userId()).param("name", p.displayName()).param("district", p.district())
                .param("level", p.examLevel().name()).param("lang", p.language()).param("at", Timestamp.from(p.updatedAt())).update();
    }
}

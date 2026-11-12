package in.minnal.core.question.application;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.core.question.domain.VersionStatus;
import in.minnal.core.question.infrastructure.JdbcQuestionRepository;
import in.minnal.core.question.domain.QuestionVersion;
import in.minnal.core.support.PostgresIntegrationTest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class StarterSeedIntegrationTest extends PostgresIntegrationTest {

    @Autowired
    StarterSeedService seedService;

    @Autowired
    JdbcQuestionRepository questions;

    static List<SeedRow> validRows(int n) {
        List<SeedRow> rows = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            Map<String, String> v = SeedRowMapperTest.validValues();
            v.put("sourceRef", "seed-" + i);
            v.put("textEn", "Question " + i);
            v.put("subject", i % 2 == 0 ? "Kerala Geography" : "General Science");
            rows.add(new SeedRow(i + 2, v));
        }
        return rows;
    }

    @Test
    void seedingTwiceLoadsOnceThenReportsUnchanged() {
        List<SeedRow> rows = validRows(12);

        SeedReport first = seedService.load(rows);
        SeedReport second = seedService.load(rows);

        assertThat(first.summary()).isEqualTo("12 loaded · 0 rows skipped · 0 unchanged");
        assertThat(second.summary()).isEqualTo("0 loaded · 0 rows skipped · 12 unchanged");
        assertThat(count("question")).isEqualTo(12);
        assertThat(count("question_version")).isEqualTo(12);
    }

    @Test
    void existingSourceRefIsUnchangedEvenWhenItsContentDiffers() {
        seedService.load(validRows(1));
        Map<String, String> edited = SeedRowMapperTest.validValues();
        edited.put("sourceRef", "seed-0");
        edited.put("textEn", "Edited text");

        assertThat(seedService.load(List.of(new SeedRow(2, edited))).unchanged()).isEqualTo(1);
        assertThat(jdbc.sql("SELECT text_en FROM question_version").query(String.class).single()).isEqualTo("Question 0");
    }

    @Test
    void storesAPublishedVersionOneWithTheReview() {
        Map<String, String> v = SeedRowMapperTest.validValues();
        seedService.load(List.of(new SeedRow(2, v)));

        UUID questionId = jdbc.sql("SELECT id FROM question WHERE source_ref = 'test-001'").query(UUID.class).single();
        QuestionVersion version = questions.findVersions(questionId).getFirst();
        assertThat(version.version()).isEqualTo(1);
        assertThat(version.status()).isEqualTo(VersionStatus.PUBLISHED);
        assertThat(version.reviewedBy()).isEqualTo("Snobin");
        assertThat(version.reviewedAt()).isEqualTo(Instant.parse("2026-11-11T09:30:00Z"));
        assertThat(version.content().attribution()).isEqualTo("Kerala PSC LDC 2019");
        assertThat(version.content().textMl()).isEqualTo("കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദി ഏതാണ്?");
        assertThat(version.content().options()).containsExactly("Periyar", "Bharathapuzha", "Pamba", "Chaliyar");
    }

    @Test
    void blankReviewedAtUsesTheLoadInstantAndBlankAttributionIsNull() {
        Map<String, String> v = SeedRowMapperTest.validValues();
        v.put("reviewedAt", "");
        v.put("attribution", "");
        Instant before = Instant.now();
        seedService.load(List.of(new SeedRow(2, v)));

        Map<String, Object> row = jdbc.sql("SELECT reviewed_at, attribution FROM question_version").query().singleRow();
        assertThat(row.get("attribution")).isNull();
        Instant reviewedAt = ((java.sql.Timestamp) row.get("reviewed_at")).toInstant();
        assertThat(reviewedAt).isBetween(before.minusSeconds(1), Instant.now().plusSeconds(1));
    }

    @Test
    void subjectsAndTopicsAreMatchedByNameIgnoringCaseAndSpaces() {
        Map<String, String> a = SeedRowMapperTest.validValues();
        Map<String, String> b = SeedRowMapperTest.validValues();
        b.put("sourceRef", "test-002");
        b.put("subject", "  kerala GEOGRAPHY ");
        b.put("topic", "RIVERS");
        seedService.load(List.of(new SeedRow(2, a), new SeedRow(3, b)));

        assertThat(count("subject")).isEqualTo(1);
        assertThat(count("topic")).isEqualTo(1);
        assertThat(jdbc.sql("SELECT name FROM subject").query(String.class).single()).isEqualTo("Kerala Geography");
    }

    @Test
    void unreviewedRowIsSkippedWithTheExactMessage() {
        List<SeedRow> rows = validRows(2);
        Map<String, String> unreviewed = SeedRowMapperTest.validValues();
        unreviewed.put("reviewedBy", "");
        unreviewed.put("sourceRef", "unreviewed");
        rows.add(new SeedRow(4, unreviewed));

        SeedReport report = seedService.load(rows);

        assertThat(report.summary()).isEqualTo("2 loaded · 1 rows skipped · 0 unchanged");
        assertThat(report.problems()).containsExactly(
                "row 4 · reviewedBy · required: every seeded question must name the admin who reviewed it");
    }

    @Test
    void badRowReportsEveryProblemAndOtherRowsStillLoad() {
        List<SeedRow> rows = new ArrayList<>(validRows(3));
        Map<String, String> bad = SeedRowMapperTest.validValues();
        bad.put("sourceRef", "bad");
        bad.put("optionD", "");
        bad.put("explanation", " ");
        rows.add(1, new SeedRow(9, bad));

        SeedReport report = seedService.load(rows);

        assertThat(report.loaded()).isEqualTo(3);
        assertThat(report.skipped()).isEqualTo(1);
        assertThat(report.problems()).containsExactly(
                "row 9 · optionD · required: every option must be non-blank",
                "row 9 · explanation · required");
        assertThat(count("question")).isEqualTo(3);
    }

    @Test
    void aRowTheDatabaseRejectsIsSkippedAndTheRunGoesOn() {
        List<SeedRow> rows = new ArrayList<>(validRows(2));
        Map<String, String> nul = SeedRowMapperTest.validValues();
        nul.put("sourceRef", "nul");
        nul.put("explanation", "before\u0000after");
        rows.add(1, new SeedRow(5, nul));

        SeedReport report = seedService.load(rows);

        assertThat(report.summary()).isEqualTo("2 loaded · 1 rows skipped · 0 unchanged");
        assertThat(report.problems()).singleElement().asString().startsWith("row 5 · row · could not be stored: ");
        assertThat(count("question")).isEqualTo(2);
    }

    @Test
    void duplicateSourceRefInsideOneFileLoadsOnce() {
        List<SeedRow> rows = validRows(1);
        rows.add(new SeedRow(3, rows.getFirst().values()));
        assertThat(seedService.load(rows).summary()).isEqualTo("1 loaded · 0 rows skipped · 1 unchanged");
    }

    private long count(String table) {
        return jdbc.sql("SELECT count(*) FROM " + table).query(Long.class).single();
    }
}

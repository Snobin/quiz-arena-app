package in.minnal.core.question.application;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.core.question.domain.FieldError;
import in.minnal.core.question.domain.QuestionValidator;
import java.text.Normalizer;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SeedRowMapperTest {

    private final SeedRowMapper mapper = new SeedRowMapper(new QuestionValidator());

    static Map<String, String> validValues() {
        Map<String, String> v = new HashMap<>();
        v.put("category", "KERALA_PSC");
        v.put("subject", "Kerala Geography");
        v.put("topic", "Rivers");
        v.put("examLevel", "TENTH");
        v.put("difficulty", "EASY");
        v.put("textMl", "കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദി ഏതാണ്?");
        v.put("textEn", "Which is the longest river in Kerala?");
        v.put("optionA", "Periyar");
        v.put("optionB", "Bharathapuzha");
        v.put("optionC", "Pamba");
        v.put("optionD", "Chaliyar");
        v.put("answerIndex", "0");
        v.put("explanation", "The Periyar is about 244 km long.");
        v.put("attribution", "Kerala PSC LDC 2019");
        v.put("sourceRef", "test-001");
        v.put("reviewedBy", "Snobin");
        v.put("reviewedAt", "2026-11-11T09:30:00Z");
        return v;
    }

    static SeedRow row(int number, Map<String, String> values) {
        return new SeedRow(number, values);
    }

    @Test
    void mapsEveryColumn() {
        MappedSeedRow mapped = mapper.map(row(2, validValues()));

        assertThat(mapped.errors()).isEmpty();
        assertThat(mapped.rowNumber()).isEqualTo(2);
        assertThat(mapped.sourceRef()).isEqualTo("test-001");
        assertThat(mapped.reviewedBy()).isEqualTo("Snobin");
        assertThat(mapped.reviewedAt()).isEqualTo(Instant.parse("2026-11-11T09:30:00Z"));
        assertThat(mapped.candidate().options()).containsExactly("Periyar", "Bharathapuzha", "Pamba", "Chaliyar");
        assertThat(mapped.candidate().answerIndex()).isZero();
        assertThat(mapped.candidate().attribution()).isEqualTo("Kerala PSC LDC 2019");
    }

    @Test
    void trimsAndNfcNormalisesValues() {
        Map<String, String> v = validValues();
        String decomposed = Normalizer.normalize("കൊ", Normalizer.Form.NFD);
        v.put("subject", "  Kerala Geography ");
        v.put("textMl", " " + decomposed + " ");
        MappedSeedRow mapped = mapper.map(row(2, v));

        assertThat(mapped.candidate().subject()).isEqualTo("Kerala Geography");
        assertThat(mapped.candidate().textMl()).isEqualTo(Normalizer.normalize("കൊ", Normalizer.Form.NFC));
    }

    @Test
    void blankOptionalValuesBecomeNull() {
        Map<String, String> v = validValues();
        v.put("textMl", "  ");
        v.put("attribution", "");
        v.put("reviewedAt", "");
        MappedSeedRow mapped = mapper.map(row(2, v));

        assertThat(mapped.errors()).isEmpty();
        assertThat(mapped.candidate().textMl()).isNull();
        assertThat(mapped.candidate().attribution()).isNull();
        assertThat(mapped.reviewedAt()).isNull();
    }

    @Test
    void acceptsAnOffsetReviewedAt() {
        Map<String, String> v = validValues();
        v.put("reviewedAt", "2026-11-11T15:00:00+05:30");
        assertThat(mapper.map(row(2, v)).reviewedAt()).isEqualTo(Instant.parse("2026-11-11T09:30:00Z"));
    }

    @Test
    void blankReviewedByIsAlwaysRejectedWithTheExactMessage() {
        Map<String, String> v = validValues();
        v.put("reviewedBy", " ");
        assertThat(mapper.map(row(7, v)).errors()).containsExactly(new FieldError("reviewedBy",
                "required: every seeded question must name the admin who reviewed it"));
    }

    @Test
    void blankSourceRefIsRejected() {
        Map<String, String> v = validValues();
        v.remove("sourceRef");
        assertThat(mapper.map(row(2, v)).errors()).extracting(FieldError::field).containsExactly("sourceRef");
    }

    @Test
    void threeOptionsAndBlankExplanationAreBothReported() {
        Map<String, String> v = validValues();
        v.put("optionD", "");
        v.put("explanation", "");
        assertThat(mapper.map(row(4, v)).errors()).extracting(FieldError::field).containsExactly("optionD", "explanation");
    }

    @Test
    void nonNumericAnswerIndexIsReportedOnce() {
        Map<String, String> v = validValues();
        v.put("answerIndex", "B");
        List<FieldError> errors = mapper.map(row(2, v)).errors();
        assertThat(errors).hasSize(1);
        assertThat(errors.getFirst().field()).isEqualTo("answerIndex");
        assertThat(errors.getFirst().problem()).startsWith("must be a whole number 0–3");
    }

    @Test
    void invalidReviewedAtIsReported() {
        Map<String, String> v = validValues();
        v.put("reviewedAt", "11/11/2026");
        assertThat(mapper.map(row(2, v)).errors()).extracting(FieldError::field).containsExactly("reviewedAt");
    }
}

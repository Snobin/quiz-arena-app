package in.minnal.core.question.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.function.UnaryOperator;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class QuestionValidatorTest {

    private final QuestionValidator validator = new QuestionValidator();

    static QuestionCandidate valid() {
        return new QuestionCandidate("KERALA_PSC", "Kerala Geography", "Rivers", "TENTH", "EASY",
                "കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദി ഏതാണ്?", "Which is the longest river in Kerala?",
                List.of("Periyar", "Bharathapuzha", "Pamba", "Chaliyar"), 0, "The Periyar is about 244 km long.", null);
    }

    @Test
    void validCandidateHasNoErrors() {
        assertThat(validator.validate(valid())).isEmpty();
    }

    @Test
    void eitherLanguageAloneIsEnough() {
        assertThat(validator.validate(with(c -> copy(c, null, c.textEn())))).isEmpty();
        assertThat(validator.validate(with(c -> copy(c, c.textMl(), null)))).isEmpty();
    }

    static Stream<Arguments> rules() {
        return Stream.of(
                Arguments.of("category blank", with(c -> new QuestionCandidate(" ", c.subject(), c.topic(), c.examLevel(), c.difficulty(), c.textMl(), c.textEn(), c.options(), c.answerIndex(), c.explanation(), c.attribution())), "category", "required"),
                Arguments.of("category unknown", with(c -> new QuestionCandidate("PSC", c.subject(), c.topic(), c.examLevel(), c.difficulty(), c.textMl(), c.textEn(), c.options(), c.answerIndex(), c.explanation(), c.attribution())), "category", "must be one of KERALA_PSC, SCHOOL_QUIZ, GENERAL_KERALA"),
                Arguments.of("subject missing", with(c -> new QuestionCandidate(c.category(), null, c.topic(), c.examLevel(), c.difficulty(), c.textMl(), c.textEn(), c.options(), c.answerIndex(), c.explanation(), c.attribution())), "subject", "required"),
                Arguments.of("topic blank", with(c -> new QuestionCandidate(c.category(), c.subject(), "  ", c.examLevel(), c.difficulty(), c.textMl(), c.textEn(), c.options(), c.answerIndex(), c.explanation(), c.attribution())), "topic", "required"),
                Arguments.of("examLevel missing", with(c -> new QuestionCandidate(c.category(), c.subject(), c.topic(), null, c.difficulty(), c.textMl(), c.textEn(), c.options(), c.answerIndex(), c.explanation(), c.attribution())), "examLevel", "required"),
                Arguments.of("examLevel unknown", with(c -> new QuestionCandidate(c.category(), c.subject(), c.topic(), "PLUS_TWO", c.difficulty(), c.textMl(), c.textEn(), c.options(), c.answerIndex(), c.explanation(), c.attribution())), "examLevel", "must be one of TENTH, DEGREE, OTHER"),
                Arguments.of("difficulty missing", with(c -> new QuestionCandidate(c.category(), c.subject(), c.topic(), c.examLevel(), "", c.textMl(), c.textEn(), c.options(), c.answerIndex(), c.explanation(), c.attribution())), "difficulty", "required"),
                Arguments.of("difficulty unknown", with(c -> new QuestionCandidate(c.category(), c.subject(), c.topic(), c.examLevel(), "easy", c.textMl(), c.textEn(), c.options(), c.answerIndex(), c.explanation(), c.attribution())), "difficulty", "must be one of EASY, MEDIUM, HARD"),
                Arguments.of("no text in either language", with(c -> copy(c, " ", null)), "textMl/textEn", "required"),
                Arguments.of("options missing", with(c -> options(c, null)), "options", "required"),
                Arguments.of("three options", with(c -> options(c, List.of("a", "b", "c"))), "options", "must have exactly 4 options (got 3)"),
                Arguments.of("five options", with(c -> options(c, List.of("a", "b", "c", "d", "e"))), "options", "must have exactly 4 options (got 5)"),
                Arguments.of("duplicate options", with(c -> options(c, List.of("Periyar", " periyar ", "Pamba", "Chaliyar"))), "options", "must be 4 different answers"),
                Arguments.of("duplicate options after NFC", with(c -> options(c, List.of(java.text.Normalizer.normalize("കൊ", java.text.Normalizer.Form.NFD), "കൊ", "b", "c"))), "options", "must be 4 different answers"),
                Arguments.of("blank first option", with(c -> options(c, List.of(" ", "b", "c", "d"))), "optionA", "required"),
                Arguments.of("blank last option", with(c -> options(c, List.of("a", "b", "c", ""))), "optionD", "required"),
                Arguments.of("answerIndex missing", with(c -> answer(c, null)), "answerIndex", "required"),
                Arguments.of("answerIndex negative", with(c -> answer(c, -1)), "answerIndex", "must be a whole number 0–3"),
                Arguments.of("answerIndex 4", with(c -> answer(c, 4)), "answerIndex", "must be a whole number 0–3"),
                Arguments.of("text too long", with(c -> copy(c, c.textMl(), "x".repeat(1001))), "textEn", "must be at most 1000 characters (got 1001)"),
                Arguments.of("Malayalam text too long", with(c -> copy(c, "ക".repeat(1001), c.textEn())), "textMl", "must be at most 1000 characters (got 1001)"),
                Arguments.of("option too long", with(c -> options(c, List.of("a", "b", "c", "d".repeat(301)))), "optionD", "must be at most 300 characters (got 301)"),
                Arguments.of("explanation too long", with(c -> new QuestionCandidate(c.category(), c.subject(), c.topic(), c.examLevel(), c.difficulty(), c.textMl(), c.textEn(), c.options(), c.answerIndex(), "e".repeat(2001), c.attribution())), "explanation", "must be at most 2000 characters (got 2001)"),
                Arguments.of("attribution too long", with(c -> new QuestionCandidate(c.category(), c.subject(), c.topic(), c.examLevel(), c.difficulty(), c.textMl(), c.textEn(), c.options(), c.answerIndex(), c.explanation(), "a".repeat(121))), "attribution", "must be at most 120 characters (got 121)"),
                Arguments.of("explanation blank", with(c -> new QuestionCandidate(c.category(), c.subject(), c.topic(), c.examLevel(), c.difficulty(), c.textMl(), c.textEn(), c.options(), c.answerIndex(), " ", c.attribution())), "explanation", "required"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("rules")
    void eachRuleReportsItsField(String name, QuestionCandidate candidate, String field, String problemPrefix) {
        List<FieldError> errors = validator.validate(candidate);
        assertThat(errors).hasSize(1);
        assertThat(errors.getFirst().field()).isEqualTo(field);
        assertThat(errors.getFirst().problem()).startsWith(problemPrefix);
    }

    @Test
    void reportsEveryProblemInsteadOfStoppingAtTheFirst() {
        QuestionCandidate bad = new QuestionCandidate(null, null, null, null, null, null, null,
                List.of("", "", "", ""), 9, null, null);
        List<String> fields = validator.validate(bad).stream().map(FieldError::field).toList();
        assertThat(fields).containsExactly("category", "subject", "topic", "examLevel", "difficulty",
                "textMl/textEn", "optionA", "optionB", "optionC", "optionD", "answerIndex", "explanation");
    }

    @Test
    void nullCandidateIsAnErrorNotAnException() {
        assertThat(validator.validate(null)).extracting(FieldError::field).containsExactly("question");
    }

    @Test
    void capsCountCharactersAfterNfcAndTrimmingAndAcceptTheLimitExactly() {
        // 500 decomposed pairs normalise to 500 characters; padding is trimmed.
        String decomposed = java.text.Normalizer.normalize("\u00e9", java.text.Normalizer.Form.NFD).repeat(1000);
        assertThat(validator.validate(with(c -> copy(c, c.textMl(), "  " + decomposed + "  ")))).isEmpty();
        assertThat(validator.validate(with(c -> copy(c, c.textMl(), "x".repeat(1000))))).isEmpty();
        assertThat(validator.validate(with(c -> options(c, List.of("a", "b", "c", "d".repeat(300)))))).isEmpty();
    }

    @Test
    void malayalamChilluAndZwjCountEachCodePointAndSurvive() {
        // chillu (ൽ U+0D7D), ZWJ (U+200D) and ZWNJ (U+200C) are kept and counted as characters
        String chillu = "അവൻ\u200d\u200c";
        assertThat(validator.validate(with(c -> copy(c, chillu.repeat(200), c.textEn())))).isEmpty();
        assertThat(validator.validate(with(c -> copy(c, chillu.repeat(201), c.textEn())))).extracting(FieldError::field).containsExactly("textMl");
        assertThat(validator.validate(with(c -> options(c, List.of("അവൻ\u200d", "അവൻ", "b", "c"))))).isEmpty();
    }

    @Test
    void capErrorsCarryAFixHint() {
        assertThat(validator.validate(with(c -> copy(c, c.textMl(), "x".repeat(1003))))).singleElement()
                .satisfies(e -> assertThat(e.fix()).isEqualTo("Shorten it by 3 characters."));
    }

    @Test
    void fieldErrorPrintsFieldAndProblem() {
        assertThat(new FieldError("explanation", "required")).hasToString("explanation · required");
    }

    private static QuestionCandidate with(UnaryOperator<QuestionCandidate> change) {
        return change.apply(valid());
    }

    private static QuestionCandidate copy(QuestionCandidate c, String textMl, String textEn) {
        return new QuestionCandidate(c.category(), c.subject(), c.topic(), c.examLevel(), c.difficulty(), textMl, textEn, c.options(), c.answerIndex(), c.explanation(), c.attribution());
    }

    private static QuestionCandidate options(QuestionCandidate c, List<String> options) {
        return new QuestionCandidate(c.category(), c.subject(), c.topic(), c.examLevel(), c.difficulty(), c.textMl(), c.textEn(), options == null ? null : new ArrayList<>(options), c.answerIndex(), c.explanation(), c.attribution());
    }

    private static QuestionCandidate answer(QuestionCandidate c, Integer answerIndex) {
        return new QuestionCandidate(c.category(), c.subject(), c.topic(), c.examLevel(), c.difficulty(), c.textMl(), c.textEn(), c.options(), answerIndex, c.explanation(), c.attribution());
    }
}

package in.minnal.core.profile.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

/** The vectors in web/src/profile/nameRule.test.ts are the same list: the two rules must agree. */
class NameRuleTest {

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "Anju|Anju",
            "  Anju    Menon  |Anju Menon",
            "അഞ്ജു|അഞ്ജു",
            "ആൻ|ആൻ",
            "നന്ദൻ നായർ|നന്ദൻ നായർ",
            "അഞ്ജു Menon|അഞ്ജു Menon",
            "Sree-Devi|Sree-Devi",
            "St. Mary|St. Mary",
            "O'Neil|O'Neil",
            "Anju 2026|Anju 2026",
    })
    void accepts(String input, String normalised) {
        NameRule.Result result = NameRule.validate(input);
        assertThat(result.error()).isNull();
        assertThat(result.name()).isEqualTo(normalised);
    }

    @ParameterizedTest
    @ValueSource(strings = {"Ad\u200Dmin", "mi\u200Cnnal", "\uFF21dmin"})
    void rejectsReservedNamesDisguisedWithJoinersOrFullwidthLetters(String input) {
        assertThat(NameRule.validate(input).error().code()).isEqualTo("reserved");
    }

    @org.junit.jupiter.api.Test
    void rejectsRunsOfJoinersAndTrimsOddWhitespace() {
        assertThat(NameRule.validate("An\u200D\u200Cju").error().code()).isEqualTo("chars");
        assertThat(NameRule.validate("\u00A0Anju\u00A0").name()).isEqualTo("Anju");
        assertThat(NameRule.validate("\uFEFFAnju").name()).isEqualTo("Anju");
    }

    @ParameterizedTest
    @ValueSource(strings = {"കാർത്തിക്‌", "ക്ഷ‍ത്രിയ"})
    void acceptsZwjAndZwnjInsideMalayalamNames(String input) {
        // Starts with a Malayalam letter; the joiners are allowed characters.
        assertThat(NameRule.validate(input).error()).isNull();
    }

    @org.junit.jupiter.api.Test
    void countsConjunctsAsOneUserPerceivedCharacter() {
        // 13 conjuncts (39 code points) are 13 characters, well inside 2-24; 25 are too many.
        assertThat(NameRule.validate("ക്ഷ".repeat(13)).error()).isNull();
        assertThat(NameRule.validate("ക്ഷ".repeat(25)).error().code()).isEqualTo("length");
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "A|length", "''|length", "abcdefghijklmnopqrstuvwxy|length", "Anju!|chars", "Anju_Menon|chars", "Anju😀|chars",
            "Анжу|chars", "1Anju|start", "-Anju|start", ".Anju|start", "An--ju|punctuation", "An.'ju|punctuation",
            "minnal|reserved", "MINNAL|reserved", "Minnal Bot|reserved", "minnal   bot|reserved", "മിന്നൽ|reserved",
            "BOT|reserved", "Bot|reserved", "Admin|reserved", "ADMIN|reserved", "Guest 4821|reserved", "guest 1|reserved",
    })
    void rejectsWithTheRightCode(String input, String code) {
        NameRule.Result result = NameRule.validate(input);
        assertThat(result.valid()).isFalse();
        assertThat(result.error().code()).isEqualTo(code);
        assertThat(result.error().field()).isEqualTo("displayName");
        assertThat(result.error().message()).isNotBlank();
    }

    @org.junit.jupiter.api.Test
    void aNonReservedNameThatContainsAReservedWordIsFine() {
        assertThat(NameRule.validate("Minnal Fan").valid()).isTrue();
        assertThat(NameRule.validate("Guest Star").valid()).isTrue();
        assertThat(NameRule.validate("Administrator").valid()).isTrue();
    }

    @org.junit.jupiter.api.Test
    void nullAndBlankAreTooShort() {
        assertThat(NameRule.validate(null).error().code()).isEqualTo("length");
        assertThat(NameRule.validate("   ").error().code()).isEqualTo("length");
    }
}

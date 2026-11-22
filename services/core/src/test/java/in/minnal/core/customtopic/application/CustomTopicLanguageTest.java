package in.minnal.core.customtopic.application;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class CustomTopicLanguageTest {

    @Test
    void majorityScriptDecidesTheLanguage() {
        assertThat(CustomTopicService.language("കേരളത്തിലെ ഏറ്റവും വലിയ നദി ഏത്?")).isEqualTo("ml");
        assertThat(CustomTopicService.language("Which is the longest river in Kerala?")).isEqualTo("en");
        assertThat(CustomTopicService.language("Periyar ഏത് ജില്ലയിൽ ആണ് ഒഴുകുന്നത്?")).isEqualTo("ml");
        assertThat(CustomTopicService.language("1947 1948 ?")).isEqualTo("en");
    }

    @Test
    void theNameKeyIsNfcTrimmedAndCaseFolded() {
        assertThat(CustomTopicService.key("  Kerala RENAISSANCE ")).isEqualTo("kerala renaissance");
        assertThat(CustomTopicService.key("é")).isEqualTo(CustomTopicService.key("é"));
    }

    @Test
    void warnsAtEightyPercentOfEitherCap() {
        CustomTopicLimits limits = new CustomTopicLimits(50, 500, 1_048_576);
        assertThat(limits.warn(39, 399)).isFalse();
        assertThat(limits.warn(40, 0)).isTrue();
        assertThat(limits.warn(0, 400)).isTrue();
    }
}

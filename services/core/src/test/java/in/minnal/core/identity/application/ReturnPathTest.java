package in.minnal.core.identity.application;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class ReturnPathTest {

    @ParameterizedTest
    @ValueSource(strings = {"/", "/me", "/rooms?x=1#top", "/results?match=a%2Fb"})
    void keepsRelativeInAppPaths(String path) {
        assertThat(ReturnPath.safe(path)).isEqualTo(path);
    }

    @ParameterizedTest
    @ValueSource(strings = {"//evil.com", "///evil.com", "https://evil.com", "http:/evil.com", "javascript:alert(1)", "evil", "", "/\\evil.com", "/a b", "/\t/evil.com", "/auth/return?to=/", "/auth/return"})
    void replacesAnythingElseWithTheRoot(String path) {
        assertThat(ReturnPath.safe(path)).isEqualTo("/");
    }

    @Test
    void nullAndOverlongBecomeTheRoot() {
        assertThat(ReturnPath.safe(null)).isEqualTo("/");
        assertThat(ReturnPath.safe("/" + "a".repeat(600))).isEqualTo("/");
    }

    @ParameterizedTest
    @CsvSource({"/me,/me?signin=failed", "/me?x=1,/me?x=1&signin=failed", "/me#top,/me?signin=failed#top"})
    void addsTheOutcomeToTheQuery(String in, String out) {
        assertThat(ReturnPath.withQuery(in, "signin", "failed")).isEqualTo(out);
    }
}

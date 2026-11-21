package in.minnal.core.question.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class OptionOrderTest {

    private static final List<String> OPTIONS = List.of("a", "b", "c", "d");

    @Test
    void keepsEveryOptionAndTheAnswerPointsAtTheSameText() {
        for (long seed = 0; seed < 200; seed++) {
            OptionOrder order = OptionOrder.seeded(seed);
            List<String> shown = order.apply(OPTIONS);
            assertThat(shown).containsExactlyInAnyOrderElementsOf(OPTIONS);
            for (int original = 0; original < 4; original++) {
                assertThat(shown.get(order.shownIndexOf(original))).isEqualTo(OPTIONS.get(original));
                assertThat(order.originalIndexOf(order.shownIndexOf(original))).isEqualTo(original);
            }
        }
    }

    @Test
    void theSameSeedGivesTheSameOrderAndDifferentSeedsGiveDifferentOnes() {
        assertThat(OptionOrder.seeded(7).apply(OPTIONS)).isEqualTo(OptionOrder.seeded(7).apply(OPTIONS));
        Set<List<String>> seen = new HashSet<>();
        for (long seed = 0; seed < 200; seed++) {
            seen.add(OptionOrder.seeded(seed).apply(OPTIONS));
        }
        assertThat(seen.size()).isGreaterThan(12);
    }
}

package in.minnal.game.room.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.security.SecureRandom;
import java.util.HashSet;
import java.util.Optional;
import java.util.Random;
import java.util.Set;
import java.util.random.RandomGenerator;
import org.junit.jupiter.api.Test;

class RoomCodesTest {

    /** Draws alphabet indexes from a script, one per character, then zeros. */
    static final class Scripted implements RandomGenerator {

        private final int[] script;
        private int next;

        Scripted(int... script) {
            this.script = script;
        }

        @Override
        public int nextInt(int bound) {
            return next < script.length ? script[next++] % bound : 0;
        }

        @Override
        public long nextLong() {
            throw new UnsupportedOperationException();
        }
    }

    @Test
    void theAlphabetIsAToZAnd2To9WithoutTheLookAlikes() {
        assertThat(RoomCodes.ALPHABET).hasSize(31).doesNotContain("0", "O", "1", "I", "L");
        assertThat(RoomCodes.ALPHABET.chars().distinct().count()).isEqualTo(31);
        assertThat(RoomCodes.ALPHABET).contains("A", "Z", "2", "9");
    }

    @Test
    void aCodeIsSixAlphabetCharactersWithNoHyphen() {
        RoomCodes codes = new RoomCodes(new SecureRandom());
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 200; i++) {
            String code = codes.draw(c -> false);
            assertThat(code).hasSize(6).matches("[A-HJKMNP-Z2-9]{6}");
            seen.add(code);
        }
        assertThat(seen.size()).isGreaterThan(190);
    }

    @Test
    void aSeededRandomThatRepeatsALiveCodeIsRedrawn() {
        // Draws: AAAAAA (alphabet index 0 six times) is live, so the next six draws (index 1) give BBBBBB.
        RoomCodes codes = new RoomCodes(new Scripted(0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1));
        Set<String> live = Set.of("AAAAAA");
        assertThat(codes.draw(live::contains)).isEqualTo("BBBBBB");
    }

    @Test
    void manyCollisionsInARowFailInsteadOfSpinning() {
        RoomCodes codes = new RoomCodes(new Scripted());
        assertThatThrownBy(() -> codes.draw(c -> true)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void aSeededRandomIsDeterministic() {
        assertThat(new RoomCodes(new Random(7)).draw(c -> false)).isEqualTo(new RoomCodes(new Random(7)).draw(c -> false));
    }

    @Test
    void aTypedCodeIsAcceptedInAnyCaseWithOrWithoutTheHyphen() {
        assertThat(RoomCodes.normalize("k7m-q2x")).contains("K7MQ2X");
        assertThat(RoomCodes.normalize("K7MQ2X")).contains("K7MQ2X");
        assertThat(RoomCodes.normalize(" k7m q2x ")).contains("K7MQ2X");
        assertThat(RoomCodes.normalize("K7M-Q2")).isEmpty();
        assertThat(RoomCodes.normalize("K7M-Q2O")).isEqualTo(Optional.empty()); // O is not in the alphabet
        assertThat(RoomCodes.normalize("K7M-Q2X1")).isEmpty();
        assertThat(RoomCodes.normalize(null)).isEmpty();
    }

    @Test
    void theCodeIsDisplayedAsXxxDashXxx() {
        assertThat(RoomCodes.display("K7MQ2X")).isEqualTo("K7M-Q2X");
    }
}

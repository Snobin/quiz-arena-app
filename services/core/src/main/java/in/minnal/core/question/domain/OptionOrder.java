package in.minnal.core.question.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * A permutation of a question's four options. {@code order[shown] = original}: the option shown at
 * position {@code shown} is the stored option {@code original}.
 */
public record OptionOrder(int[] order) {

    public static OptionOrder random(java.util.random.RandomGenerator random) {
        return seeded(random.nextLong());
    }

    /** The same seed always gives the same order, so a reload or an answer check agrees with what was shown. */
    public static OptionOrder seeded(long seed) {
        List<Integer> indexes = new ArrayList<>(List.of(0, 1, 2, 3));
        java.util.Collections.shuffle(indexes, new Random(mix(seed)));
        return new OptionOrder(indexes.stream().mapToInt(Integer::intValue).toArray());
    }

    /** SplitMix64 finaliser: nearby seeds must not give related shuffles. */
    private static long mix(long z) {
        z = (z ^ (z >>> 30)) * 0xBF58476D1CE4E5B9L;
        z = (z ^ (z >>> 27)) * 0x94D049BB133111EBL;
        return z ^ (z >>> 31);
    }

    public List<String> apply(List<String> options) {
        return List.of(options.get(order[0]), options.get(order[1]), options.get(order[2]), options.get(order[3]));
    }

    /** Where the stored option {@code original} is shown. */
    public int shownIndexOf(int original) {
        for (int shown = 0; shown < order.length; shown++) {
            if (order[shown] == original) {
                return shown;
            }
        }
        throw new IllegalArgumentException("original must be 0-3");
    }

    /** The stored index of the option shown at {@code shown}. */
    public int originalIndexOf(int shown) {
        return order[shown];
    }
}

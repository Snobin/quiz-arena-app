package in.minnal.contracts.scoring;

import java.util.ArrayList;
import java.util.List;
import java.util.function.ToIntFunction;

/**
 * The one placement rule of every mode (AD-8): score descending, then correct count descending,
 * else a shared placement. Shared placements use competition ranking: two players tied for first
 * are both 1st and the next is 3rd (1, 1, 3). A forfeiter is ranked on the score she earned.
 * {@code MATCH_ENDED} and {@code minnal.match.completed} both place participants with this.
 */
public final class Ranking {

    private Ranking() {
    }

    /** One participant's totals at the end of a match. */
    public record Standing(int score, int correctCount) {

        /** Whether this standing ranks strictly ahead of {@code other}. */
        boolean beats(Standing other) {
            return score != other.score ? score > other.score : correctCount > other.correctCount;
        }
    }

    /**
     * @return each standing's placement (1-based), in the order given
     */
    public static List<Integer> placements(List<Standing> standings) {
        List<Integer> placements = new ArrayList<>(standings.size());
        for (Standing standing : standings) {
            int ahead = 0;
            for (Standing other : standings) {
                if (other.beats(standing)) {
                    ahead++;
                }
            }
            placements.add(ahead + 1);
        }
        return List.copyOf(placements);
    }

    /** {@link #placements(List)} over any items, reading their score and correct count. */
    public static <T> List<Integer> placements(List<T> items, ToIntFunction<T> score, ToIntFunction<T> correctCount) {
        return placements(items.stream()
                .map(item -> new Standing(score.applyAsInt(item), correctCount.applyAsInt(item)))
                .toList());
    }
}

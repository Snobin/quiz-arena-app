package in.minnal.game.match.application;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.game.match.domain.MatchState;
import java.time.Duration;
import java.util.Optional;
import java.util.random.RandomGenerator;

/**
 * Decides, per question, whether and when Minnal Bot answers and what it picks (AD-7). It only
 * decides: the answer then goes through the same {@link MatchEvent.Answer} path and the same
 * {@code Scoring} as a human's, with no bot branch in scoring or reveal.
 */
public final class BotBrain {

    /** A planned bot answer: {@code optionIndex} after {@code delay} from the question's start. */
    public record Move(Duration delay, int optionIndex) {
    }

    private final BotSettings settings;
    private final RandomGenerator random;

    public BotBrain(BotSettings settings, RandomGenerator random) {
        this.settings = settings;
        this.random = random;
    }

    /** The bot's move on {@code question}, or empty when it stays silent. */
    public Optional<Move> decide(InternalQuestion question) {
        if (random.nextDouble() < settings.silentProbability()) {
            return Optional.empty();
        }
        long min = settings.minDelay().toMillis();
        long max = settings.maxDelay().toMillis();
        long delayMs = min == max ? min : random.nextLong(min, max + 1);
        int answer = question.answerIndex();
        int option;
        if (random.nextDouble() < settings.correctProbability()) {
            option = answer;
        } else {
            int wrong = random.nextInt(MatchState.OPTION_COUNT - 1);
            option = wrong >= answer ? wrong + 1 : wrong;
        }
        return Optional.of(new Move(Duration.ofMillis(delayMs), option));
    }
}

package in.minnal.game.match.application;

import java.time.Duration;

/**
 * How Minnal Bot plays ({@code minnal.bot.*}).
 *
 * @param minDelay           the earliest it answers after a question opens (2 s)
 * @param maxDelay           the latest (12 s); the delay is uniform in between, drawn per question
 * @param correctProbability the chance an answer is right (0.65); otherwise a uniformly random wrong option
 * @param silentProbability  the chance it does not answer a question at all (0.10)
 */
public record BotSettings(Duration minDelay, Duration maxDelay, double correctProbability, double silentProbability) {

    public BotSettings {
        if (maxDelay.compareTo(minDelay) < 0) {
            throw new IllegalArgumentException("minnal.bot.max-delay < min-delay");
        }
    }
}

package in.minnal.game.match.application;

import java.time.Duration;
import java.util.Random;
import java.util.random.RandomGenerator;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** The match timeline ({@code minnal.match.*}) and Minnal Bot ({@code minnal.bot.*}). */
@Configuration(proxyBeanMethods = false)
class MatchConfiguration {

    static final String BOT_RANDOM = "botRandom";

    @Bean
    MatchSettings matchSettings(
            @Value("${minnal.match.lead-in:3s}") Duration leadIn,
            @Value("${minnal.match.window:15s}") Duration window,
            @Value("${minnal.match.close-grace:50ms}") Duration closeGrace,
            @Value("${minnal.match.reveal-hold:2s}") Duration revealHold,
            @Value("${minnal.match.grace:10s}") Duration grace) {
        return new MatchSettings(leadIn, window, closeGrace, revealHold, grace);
    }

    /** Thread-safe: every match actor draws from it. Tests replace it with a seeded one. */
    @Bean(BOT_RANDOM)
    RandomGenerator botRandom() {
        return new Random();
    }

    @Bean
    BotBrain botBrain(
            @Value("${minnal.bot.min-delay:2s}") Duration minDelay,
            @Value("${minnal.bot.max-delay:12s}") Duration maxDelay,
            @Value("${minnal.bot.correct-probability:0.65}") double correct,
            @Value("${minnal.bot.silent-probability:0.10}") double silent,
            @Qualifier(BOT_RANDOM) RandomGenerator random) {
        return new BotBrain(new BotSettings(minDelay, maxDelay, correct, silent), random);
    }
}

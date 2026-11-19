package in.minnal.ratings;

import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** The service's clock (tests replace it). Always present: the leaderboard API needs it with or without the stream loops. */
@Configuration(proxyBeanMethods = false)
class ClockConfiguration {

    @Bean
    @ConditionalOnMissingBean
    Clock clock() {
        return Clock.systemUTC();
    }
}

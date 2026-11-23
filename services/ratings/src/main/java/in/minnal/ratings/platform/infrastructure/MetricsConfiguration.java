package in.minnal.ratings.platform.infrastructure;

import in.minnal.contracts.metrics.MinnalMeterFilter;
import in.minnal.contracts.metrics.PushFailureThrottle;
import io.micrometer.core.instrument.config.MeterFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Metrics hygiene (Story 7.3a): the shared tag allowlist on every meter, and the OTLP push-failure log limited to one per 10 minutes.
 * The push itself is configured under {@code management.otlp.metrics.export} (prod profile only).
 */
@Configuration(proxyBeanMethods = false)
class MetricsConfiguration {

    @Bean
    static MeterFilter minnalMeterFilter() {
        PushFailureThrottle.install();
        return new MinnalMeterFilter();
    }
}

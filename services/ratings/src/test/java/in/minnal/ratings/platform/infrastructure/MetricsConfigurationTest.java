package in.minnal.ratings.platform.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.ratings.RatingsApplication;
import ch.qos.logback.classic.LoggerContext;
import in.minnal.contracts.metrics.MinnalMeterFilter;
import in.minnal.contracts.metrics.PushFailureThrottle;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.registry.otlp.OtlpConfig;
import io.micrometer.registry.otlp.OtlpMeterRegistry;
import java.time.Duration;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;

/** Story 7.3a: the tag allowlist is on every registry, and the OTLP push is off unless the export is enabled (the prod profile does). */
class MetricsConfigurationTest {

    @Nested
    @SpringBootTest(classes = RatingsApplication.class)
    @ActiveProfiles("test")
    class Local {
        @Autowired ApplicationContext context;
        @Autowired MeterRegistry meters;

        @Test
        void pushesNothingAndStripsPersonalTags() {
            assertThat(context.getBeansOfType(OtlpMeterRegistry.class)).isEmpty();
            assertThat(context.getBeansOfType(MinnalMeterFilter.class)).hasSize(1);
            meters.counter("minnal.test.hygiene", "mode", "QUICK", "userId", "u-1", "kind", "anju@example.com").increment();
            var counter = meters.find("minnal.test.hygiene").counter();
            assertThat(counter).isNotNull();
            assertThat(counter.getId().getTags()).extracting(t -> t.getKey()).containsExactlyInAnyOrder("mode", "service");
            assertThat(counter.getId().getTag("service")).isEqualTo("ratings");
        }
    }

    @Nested
    @SpringBootTest(
            classes = RatingsApplication.class,
            properties = {
                "management.defaults.metrics.export.enabled=true",
                "management.otlp.metrics.export.enabled=true",
                "management.otlp.metrics.export.url=http://localhost:4318/v1/metrics",
                "management.otlp.metrics.export.headers.Authorization=Basic dGVzdA=="
            })
    @ActiveProfiles("test")
    class Pushing {
        @Autowired ApplicationContext context;
        @Autowired OtlpConfig config;

        @Test
        void hasAnOtlpRegistryWithAMinuteStep() {
            var registries = context.getBeansOfType(OtlpMeterRegistry.class);
            assertThat(registries).hasSize(1);
            assertThat(config.step()).isEqualTo(Duration.ofSeconds(60));
        }
    }

    /**
     * The prod profile's own settings switch the push on and bind the Grafana endpoint and token from the environment. The
     * file is imported rather than the profile activated: prod also demands real secrets (the JWT signing key).
     */
    @Nested
    @SpringBootTest(
            classes = RatingsApplication.class,
            properties = {
                "spring.config.import=classpath:application-prod.yaml",
                "management.defaults.metrics.export.enabled=true",
                "GRAFANA_OTLP_URL=http://grafana.test/otlp/v1/metrics",
                "GRAFANA_OTLP_AUTHORIZATION=Basic dGVzdA=="
            })
    @ActiveProfiles("test")
    class Prod {
        @Autowired ApplicationContext context;
        @Autowired OtlpConfig config;

        @Test
        void pushesToTheConfiguredGrafanaEndpointEveryMinute() {
            assertThat(context.getBeansOfType(OtlpMeterRegistry.class)).hasSize(1);
            assertThat(config.url()).isEqualTo("http://grafana.test/otlp/v1/metrics");
            assertThat(config.headers()).containsEntry("Authorization", "Basic dGVzdA==");
            assertThat(config.step()).isEqualTo(Duration.ofSeconds(60));
        }
    }

    /** The push-failure log throttle is installed by this service's own MetricsConfiguration, not by anything else in the JVM. */
    @Nested
    @SpringBootTest(classes = RatingsApplication.class, properties = "minnal.test.fresh-context=throttle")
    @ActiveProfiles("test")
    class Throttle {
        @BeforeAll
        static void removeAnyThrottleInstalledByAnotherContext() {
            ((LoggerContext) LoggerFactory.getILoggerFactory()).getTurboFilterList().removeIf(PushFailureThrottle.class::isInstance);
        }

        @Test
        void theLogFloodThrottleIsInstalled() {
            var logging = (LoggerContext) LoggerFactory.getILoggerFactory();
            assertThat(logging.getTurboFilterList()).anyMatch(PushFailureThrottle.class::isInstance);
        }
    }
}

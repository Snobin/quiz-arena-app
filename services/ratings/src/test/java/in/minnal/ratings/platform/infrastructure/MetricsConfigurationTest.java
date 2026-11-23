package in.minnal.ratings.platform.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.ratings.RatingsApplication;
import in.minnal.contracts.metrics.MinnalMeterFilter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.registry.otlp.OtlpMeterRegistry;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
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

        @Test
        void hasAnOtlpRegistryWithAMinuteStep() {
            var registries = context.getBeansOfType(OtlpMeterRegistry.class);
            assertThat(registries).hasSize(1);
        }
    }
}

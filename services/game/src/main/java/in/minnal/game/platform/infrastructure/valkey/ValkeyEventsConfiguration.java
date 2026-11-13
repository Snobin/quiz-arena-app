package in.minnal.game.platform.infrastructure.valkey;

import com.fasterxml.jackson.annotation.JsonInclude;
import in.minnal.game.match.application.MatchCompletedPublisher;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * The {@link MatchCompletedPublisher}: on Valkey when a {@link StringRedisTemplate} exists (every
 * deployed profile), else a logging no-op (the {@code test} profile excludes the Redis auto-config).
 */
@Configuration(proxyBeanMethods = false)
class ValkeyEventsConfiguration {

    private static final Logger log = LoggerFactory.getLogger(ValkeyEventsConfiguration.class);

    @Bean
    MatchCompletedPublisher matchCompletedPublisher(ObjectProvider<StringRedisTemplate> redis, JsonMapper jsonMapper,
            MeterRegistry meters) {
        StringRedisTemplate template = redis.getIfAvailable();
        if (template == null) {
            log.warn("no Valkey connection configured: minnal.match.completed events will be logged and dropped");
            return new LoggingMatchCompletedPublisher();
        }
        JsonMapper json = jsonMapper.rebuild()
                .changeDefaultPropertyInclusion(inclusion -> inclusion.withValueInclusion(JsonInclude.Include.NON_NULL))
                .build();
        return ValkeyMatchCompletedPublisher.start(template.opsForStream(), json, meters);
    }
}

package in.minnal.game.platform.infrastructure.valkey;

import in.minnal.contracts.events.UserDeletedEvent;
import in.minnal.game.matchmaking.application.RatingCache;
import in.minnal.game.platform.session.DeletedUsers;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * The rating cache's feeder (Story 2.5 part B): only where a Valkey connection exists (every deployed profile). The
 * Docker-free {@code test} profile has no feeder, so the cache stays empty unless a test fills it.
 */
@Configuration(proxyBeanMethods = false)
class RatingFeederConfiguration {

    private static final Logger log = LoggerFactory.getLogger(RatingFeederConfiguration.class);

    @Bean(destroyMethod = "close")
    RatingFeederRunner ratingFeeder(ObjectProvider<StringRedisTemplate> redis, JsonMapper jsonMapper, RatingCache cache) {
        StringRedisTemplate template = redis.getIfAvailable();
        if (template == null) {
            log.warn("no Valkey connection configured: the rating cache stays empty and everyone matches as 1200");
            return null;
        }
        return new RatingFeederRunner(new RatingFeeder(new ValkeyRatingUpdateSource(template.opsForStream()), cache, jsonMapper));
    }

    /** Story 2.8: the deleted-user set, replayed from {@code minnal.user.deleted} the same way. */
    @Bean(destroyMethod = "close")
    RatingFeederRunner deletedUserFeeder(ObjectProvider<StringRedisTemplate> redis, JsonMapper jsonMapper, DeletedUsers deleted) {
        StringRedisTemplate template = redis.getIfAvailable();
        if (template == null) {
            log.warn("no Valkey connection configured: the deleted-user set stays empty");
            return null;
        }
        return new RatingFeederRunner(new DeletedUserFeeder(
                new ValkeyRatingUpdateSource(template.opsForStream(), UserDeletedEvent.STREAM), deleted, jsonMapper), "deleted-user-feeder");
    }
}

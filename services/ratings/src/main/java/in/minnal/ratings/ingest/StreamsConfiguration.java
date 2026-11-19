package in.minnal.ratings.ingest;

import in.minnal.ratings.directory.PlayerDirectory;
import in.minnal.ratings.leaderboard.LeaderboardProjector;
import in.minnal.ratings.outbox.OutboxRelay;
import in.minnal.ratings.outbox.OutboxRepository;
import io.micrometer.core.instrument.MeterRegistry;
import java.net.InetAddress;
import java.time.Clock;
import java.time.Duration;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import tools.jackson.databind.json.JsonMapper;

/** Runs the stream consumer and the outbox relay (twice a second). Off with {@code minnal.streams.enabled=false}. */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(name = "minnal.streams.enabled", havingValue = "true", matchIfMissing = true)
class StreamsConfiguration {

    @Bean
    StreamConsumer streamConsumer(StreamClient streams, MatchCompletedHandler matches, PlayerDirectory directory,
                                  UserDeletedHandler deletions, JsonMapper json, MeterRegistry meters, @Value("${minnal.streams.reclaim-idle:30s}") Duration reclaimIdle) {
        String host;
        try {
            host = InetAddress.getLocalHost().getHostName();
        } catch (Exception e) {
            host = "ratings";
        }
        return new StreamConsumer(streams, matches, directory, deletions, json, meters, host + "-" + UUID.randomUUID().toString().substring(0, 8),
                reclaimIdle);
    }

    @Bean
    OutboxRelay outboxRelay(OutboxRepository outbox, StreamClient streams, Clock clock, LeaderboardProjector projector, JsonMapper json) {
        // The boards are projected from the same outbox row, before it is published (a failure retries the row).
        return new OutboxRelay(outbox, streams, clock, entry -> {
            if (!MatchCompletedHandler.RATING_UPDATED.equals(entry.stream())) {
                return;
            }
            java.util.UUID user;
            String mode;
            java.time.Instant ratedAt;
            try {
                tools.jackson.databind.JsonNode event = json.readTree(entry.payload());
                user = java.util.UUID.fromString(event.get("userId").asString());
                mode = event.get("mode").asString();
                ratedAt = java.time.Instant.parse(event.get("ratedAt").asString());
            } catch (RuntimeException malformed) {
                // A row that can never be projected must not block every row behind it: log it and publish it as is.
                org.slf4j.LoggerFactory.getLogger(StreamsConfiguration.class).error("outbox row {} has no projectable rating update: {}",
                        entry.id(), malformed.toString());
                return;
            }
            projector.project(user, mode, ratedAt);
        });
    }

    @Bean
    Loops loops(StreamConsumer consumer, OutboxRelay relay, org.springframework.boot.ApplicationArguments args) {
        // The one-off `--rebuild-leaderboards` process only rebuilds: it must not also consume streams or relay rows.
        return new Loops(consumer, relay, args.containsOption("rebuild-leaderboards"));
    }

    static class Loops {
        private final StreamConsumer consumer;
        private final OutboxRelay relay;

        private final boolean rebuildOnly;

        Loops(StreamConsumer consumer, OutboxRelay relay, boolean rebuildOnly) {
            this.consumer = consumer;
            this.relay = relay;
            this.rebuildOnly = rebuildOnly;
        }

        @Scheduled(fixedDelay = 500)
        void run() {
            if (rebuildOnly) {
                return;
            }
            try {
                consumer.poll();
            } catch (RuntimeException e) {
                org.slf4j.LoggerFactory.getLogger(StreamConsumer.class).warn("stream poll failed: {}", e.toString());
            }
            try {
                relay.publishPending();
            } catch (RuntimeException e) {
                org.slf4j.LoggerFactory.getLogger(OutboxRelay.class).warn("outbox relay failed: {}", e.toString());
            }
        }
    }
}

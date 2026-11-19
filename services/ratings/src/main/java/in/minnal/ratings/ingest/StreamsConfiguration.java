package in.minnal.ratings.ingest;

import in.minnal.ratings.directory.PlayerDirectory;
import in.minnal.ratings.outbox.OutboxRelay;
import in.minnal.ratings.outbox.OutboxRepository;
import io.micrometer.core.instrument.MeterRegistry;
import java.net.InetAddress;
import java.time.Clock;
import java.time.Duration;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
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
    @ConditionalOnMissingBean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    StreamConsumer streamConsumer(StreamClient streams, MatchCompletedHandler matches, PlayerDirectory directory, JsonMapper json,
                                  MeterRegistry meters, @Value("${minnal.streams.reclaim-idle:30s}") Duration reclaimIdle) {
        String host;
        try {
            host = InetAddress.getLocalHost().getHostName();
        } catch (Exception e) {
            host = "ratings";
        }
        return new StreamConsumer(streams, matches, directory, json, meters, host + "-" + UUID.randomUUID().toString().substring(0, 8),
                reclaimIdle);
    }

    @Bean
    OutboxRelay outboxRelay(OutboxRepository outbox, StreamClient streams, Clock clock) {
        return new OutboxRelay(outbox, streams, clock);
    }

    @Bean
    Loops loops(StreamConsumer consumer, OutboxRelay relay) {
        return new Loops(consumer, relay);
    }

    static class Loops {
        private final StreamConsumer consumer;
        private final OutboxRelay relay;

        Loops(StreamConsumer consumer, OutboxRelay relay) {
            this.consumer = consumer;
            this.relay = relay;
        }

        @Scheduled(fixedDelay = 500)
        void run() {
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

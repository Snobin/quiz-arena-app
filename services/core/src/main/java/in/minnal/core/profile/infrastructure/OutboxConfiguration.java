package in.minnal.core.profile.infrastructure;

import in.minnal.core.profile.application.OutboxRelay;
import in.minnal.core.profile.application.OutboxRepository;
import in.minnal.core.profile.application.StreamPublisher;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/** Runs the outbox relay every half second. Off under the Docker-free test profiles ({@code minnal.outbox.relay-enabled=false}). */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(name = "minnal.outbox.relay-enabled", havingValue = "true", matchIfMissing = true)
class OutboxConfiguration {

    @Bean
    OutboxRelay outboxRelay(OutboxRepository outbox, StreamPublisher publisher, Clock clock) {
        return new OutboxRelay(outbox, publisher, clock);
    }

    @Bean
    RelayTrigger relayTrigger(OutboxRelay relay) {
        return new RelayTrigger(relay);
    }

    static class RelayTrigger {
        private final OutboxRelay relay;

        RelayTrigger(OutboxRelay relay) {
            this.relay = relay;
        }

        @Scheduled(fixedDelay = 500)
        void run() {
            relay.publishPending();
        }
    }
}

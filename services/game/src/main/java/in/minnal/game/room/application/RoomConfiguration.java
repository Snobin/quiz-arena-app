package in.minnal.game.room.application;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.random.RandomGenerator;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Battle Room settings ({@code minnal.room.*}) and the code generator's random source. */
@Configuration(proxyBeanMethods = false)
class RoomConfiguration {

    static final String ROOM_RANDOM = "roomRandom";

    @Bean
    RoomSettings roomSettings(
            @Value("${minnal.room.ttl:24h}") Duration ttl,
            @Value("${minnal.room.grace:10s}") Duration grace,
            @Value("${minnal.room.max-live:500}") int maxLive) {
        return new RoomSettings(ttl, grace, maxLive);
    }

    /** Room codes are unguessable: a {@code SecureRandom}. Tests replace it with a seeded generator. */
    @Bean(ROOM_RANDOM)
    RandomGenerator roomRandom() {
        return new SecureRandom();
    }

    @Bean
    in.minnal.game.room.domain.RoomCodes roomCodes(@Qualifier(ROOM_RANDOM) RandomGenerator random) {
        return new in.minnal.game.room.domain.RoomCodes(random);
    }
}

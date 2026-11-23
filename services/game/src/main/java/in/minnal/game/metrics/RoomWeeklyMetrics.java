package in.minnal.game.metrics;

import in.minnal.contracts.realtime.MatchMode;
import in.minnal.game.match.application.MatchCompleted;
import in.minnal.game.match.domain.MatchSetup;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.IsoFields;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.event.EventListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Battle Room hosts and rooms per IST week (Story 7.3b), the coaching-centre proxy. When a room match completes with at least 2
 * humans the host's {@code sub} goes into a Valkey HyperLogLog (no readable id is kept) and the week's room count goes up;
 * hosts of rooms with 5 or more humans also go into a second HLL. Keys carry an 8-week TTL. Gauges report this and the
 * previous week. Without Valkey it does nothing. Valkey is touched here, outside the match code (AD-4).
 */
@Component
public class RoomWeeklyMetrics {

    private static final Logger log = LoggerFactory.getLogger(RoomWeeklyMetrics.class);
    static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    static final Duration TTL = Duration.ofDays(56);
    static final String HOSTS = "game:metrics:br-hosts:";
    static final String HOSTS_5PLUS = "game:metrics:br-hosts-5plus:";
    static final String ROOMS = "game:metrics:br-rooms:";

    private final StringRedisTemplate redis;
    private final Clock clock;

    public RoomWeeklyMetrics(ObjectProvider<StringRedisTemplate> redis, Clock clock, MeterRegistry meters) {
        this.redis = redis.getIfAvailable();
        this.clock = clock;
        for (String kind : new String[] {"current", "previous"}) {
            boolean current = kind.equals("current");
            Gauge.builder("minnal.room.hosts", () -> hll(HOSTS, current)).tag("kind", kind)
                    .description("Distinct Battle Room hosts this and last IST week").register(meters);
            Gauge.builder("minnal.room.hosts.5plus", () -> hll(HOSTS_5PLUS, current)).tag("kind", kind)
                    .description("Distinct hosts of Battle Rooms with 5 or more humans, this and last IST week").register(meters);
            Gauge.builder("minnal.room.weekly", () -> count(ROOMS, current)).tag("kind", kind)
                    .description("Completed Battle Rooms with 2 or more humans, this and last IST week").register(meters);
        }
    }

    /** {@code 2026-W48}, the ISO week of the IST date. */
    String week(boolean current) {
        LocalDate date = LocalDate.ofInstant(clock.instant(), IST);
        if (!current) {
            date = date.minusWeeks(1);
        }
        return date.get(IsoFields.WEEK_BASED_YEAR) + "-W" + String.format("%02d", date.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR));
    }

    @EventListener
    public void onCompleted(MatchCompleted event) {
        MatchSetup setup = event.setup();
        if (redis == null || setup.mode() != MatchMode.BATTLE_ROOM || setup.room() == null || setup.humans().size() < 2) {
            return;
        }
        String host = hostSub(setup);
        if (host == null) {
            return;
        }
        try {
            String week = week(true);
            redis.opsForHyperLogLog().add(HOSTS + week, host);
            redis.expire(HOSTS + week, TTL);
            if (setup.humans().size() >= 5) {
                redis.opsForHyperLogLog().add(HOSTS_5PLUS + week, host);
                redis.expire(HOSTS_5PLUS + week, TTL);
            }
            redis.opsForValue().increment(ROOMS + week);
            redis.expire(ROOMS + week, TTL);
        } catch (RuntimeException e) {
            log.atWarn().setCause(e).log("could not record the Battle Room week metrics");
        }
    }

    private static String hostSub(MatchSetup setup) {
        UUID hostParticipant = setup.room().hostParticipantId();
        for (Map.Entry<String, UUID> human : setup.humans().entrySet()) {
            if (human.getValue().equals(hostParticipant)) {
                return human.getKey();
            }
        }
        return null;
    }

    private double hll(String prefix, boolean current) {
        try {
            return redis == null ? 0 : redis.opsForHyperLogLog().size(prefix + week(current));
        } catch (RuntimeException e) {
            return Double.NaN;
        }
    }

    private double count(String prefix, boolean current) {
        try {
            String value = redis == null ? null : redis.opsForValue().get(prefix + week(current));
            return value == null ? 0 : Double.parseDouble(value);
        } catch (RuntimeException e) {
            return Double.NaN;
        }
    }
}

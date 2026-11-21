package in.minnal.game.room.application;

import in.minnal.contracts.realtime.MatchMode;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.function.Supplier;

/**
 * The room meters (NFR18), tagged by {@code mode} only (never by room, user or code):
 * <ul>
 *   <li>{@code minnal.room.created}: rooms created;
 *   <li>{@code minnal.room.closed}: rooms closed, however they ended;
 *   <li>{@code minnal.room.live}: a gauge of the rooms open now;
 *   <li>{@code minnal.room.started}: rooms whose match started (Story 5.4);
 *   <li>{@code minnal.room.humans}: a distribution of the humans per started room.
 * </ul>
 */
public final class RoomMetrics {

    public static final String CREATED = "minnal.room.created";
    public static final String CLOSED = "minnal.room.closed";
    public static final String LIVE = "minnal.room.live";
    public static final String STARTED = "minnal.room.started";
    public static final String HUMANS = "minnal.room.humans";

    private final Counter created;
    private final Counter closed;
    private final Counter started;
    private final DistributionSummary humans;

    public RoomMetrics(MeterRegistry meters, Supplier<Number> live) {
        String mode = MatchMode.BATTLE_ROOM.name();
        created = Counter.builder(CREATED).description("Battle Rooms created").tag("mode", mode).register(meters);
        closed = Counter.builder(CLOSED).description("Battle Rooms closed").tag("mode", mode).register(meters);
        started = Counter.builder(STARTED).description("Battle Rooms whose match started").tag("mode", mode).register(meters);
        humans = DistributionSummary.builder(HUMANS).description("Humans per started Battle Room").tag("mode", mode)
                .baseUnit("humans").register(meters);
        Gauge.builder(LIVE, live).description("Battle Rooms open now").tag("mode", mode).register(meters);
    }

    void created() {
        created.increment();
    }

    void closed() {
        closed.increment();
    }

    void started(int humanCount) {
        started.increment();
        humans.record(humanCount);
    }
}

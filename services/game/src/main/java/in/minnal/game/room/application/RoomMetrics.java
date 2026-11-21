package in.minnal.game.room.application;

import in.minnal.contracts.realtime.MatchMode;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.function.Supplier;

/**
 * The room meters (NFR18), tagged by {@code mode} only (never by room, user or code):
 * <ul>
 *   <li>{@code minnal.room.created}: rooms created;
 *   <li>{@code minnal.room.closed}: rooms closed, however they ended;
 *   <li>{@code minnal.room.live}: a gauge of the rooms open now.
 * </ul>
 */
public final class RoomMetrics {

    public static final String CREATED = "minnal.room.created";
    public static final String CLOSED = "minnal.room.closed";
    public static final String LIVE = "minnal.room.live";

    private final Counter created;
    private final Counter closed;

    public RoomMetrics(MeterRegistry meters, Supplier<Number> live) {
        String mode = MatchMode.BATTLE_ROOM.name();
        created = Counter.builder(CREATED).description("Battle Rooms created").tag("mode", mode).register(meters);
        closed = Counter.builder(CLOSED).description("Battle Rooms closed").tag("mode", mode).register(meters);
        Gauge.builder(LIVE, live).description("Battle Rooms open now").tag("mode", mode).register(meters);
    }

    void created() {
        created.increment();
    }

    void closed() {
        closed.increment();
    }
}

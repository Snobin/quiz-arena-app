package in.minnal.game.match.application;

import in.minnal.contracts.realtime.MessageType;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * The live-match meters (NFR1, NFR2):
 * <ul>
 *   <li>{@code minnal.match.answer.ack}: an answer's server receive instant → its {@code ANSWER_ACCEPTED} send;
 *   <li>{@code minnal.match.broadcast.lag{type}}: the triggering instant (the answer's receive
 *       instant, or the timer's due instant) → the broadcast send;
 *   <li>{@code minnal.match.ended}: completed matches (Q1 was revealed; Story 1.9);
 *   <li>{@code minnal.match.aborted}: matches every human left before Q1 was revealed;
 *   <li>{@code minnal.match.failed}: matches ended early by an unexpected error;
 *   <li>{@code minnal.match.publish.failed}: {@code minnal.match.completed} events given up on after
 *       every retry (incremented by the publisher adapter through the same name).
 * </ul>
 */
public final class MatchMetrics {

    public static final String ACK = "minnal.match.answer.ack";
    public static final String BROADCAST_LAG = "minnal.match.broadcast.lag";
    public static final String ENDED = "minnal.match.ended";
    public static final String ABORTED = "minnal.match.aborted";
    public static final String FAILED = "minnal.match.failed";
    public static final String PUBLISH_FAILED = "minnal.match.publish.failed";

    private final Timer ack;
    private final Map<MessageType, Timer> lag = new EnumMap<>(MessageType.class);
    private final Counter ended;
    private final Counter aborted;
    private final Counter failed;

    public MatchMetrics(MeterRegistry meters) {
        ack = Timer.builder(ACK)
                .description("Answer receipt to ANSWER_ACCEPTED send")
                .publishPercentiles(0.5, 0.95, 0.99)
                .register(meters);
        for (MessageType type : List.of(MessageType.QUESTION_STARTED, MessageType.SCOREBOARD, MessageType.QUESTION_REVEALED)) {
            lag.put(type, Timer.builder(BROADCAST_LAG)
                    .description("Triggering instant to match broadcast send")
                    .tag("type", type.name())
                    .publishPercentiles(0.5, 0.95, 0.99)
                    .register(meters));
        }
        ended = Counter.builder(ENDED).description("Completed matches (the first question was revealed)").register(meters);
        aborted = Counter.builder(ABORTED).description("Matches every human left before the first reveal")
                .register(meters);
        failed = Counter.builder(FAILED).description("Matches ended early by an unexpected error").register(meters);
        publishFailedCounter(meters);
    }

    /**
     * The {@code minnal.match.publish.failed} counter: {@code minnal.match.completed} events dropped
     * after the last retry. Registering twice returns the same counter.
     */
    public static Counter publishFailedCounter(MeterRegistry meters) {
        return Counter.builder(PUBLISH_FAILED)
                .description("minnal.match.completed events dropped after every retry failed")
                .register(meters);
    }

    void ack(Instant receivedAt, Instant sentAt) {
        ack.record(nonNegative(receivedAt, sentAt));
    }

    void broadcast(MessageType type, Instant trigger, Instant sentAt) {
        Timer timer = lag.get(type);
        if (timer != null) {
            timer.record(nonNegative(trigger, sentAt));
        }
    }

    void ended() {
        ended.increment();
    }

    void aborted() {
        aborted.increment();
    }

    void failed() {
        failed.increment();
    }

    private static Duration nonNegative(Instant from, Instant to) {
        Duration elapsed = Duration.between(from, to);
        return elapsed.isNegative() ? Duration.ZERO : elapsed;
    }
}

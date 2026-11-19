package in.minnal.ratings.leaderboard;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.IsoFields;
import java.util.Optional;

/**
 * Leaderboard periods in Indian Standard Time (AD-17): a daily board is one IST date ({@code 2026-11-11}), a weekly
 * board one ISO week starting on Monday ({@code 2026-W46}), the all-time board is {@code all}. A daily key is kept
 * for 8 days and a weekly one for 5 weeks.
 */
public final class PeriodKeys {

    public static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    public static final String ALL = "all";

    private PeriodKeys() {
    }

    public enum Period {
        DAILY("daily", Duration.ofDays(8)),
        WEEKLY("weekly", Duration.ofDays(35)),
        ALLTIME("alltime", null);

        private final String id;
        private final Duration retention;

        Period(String id, Duration retention) {
            this.id = id;
            this.retention = retention;
        }

        public String id() {
            return id;
        }

        /** How long a key lives after it was written; null for the all-time board. */
        public Duration retention() {
            return retention;
        }

        public static Optional<Period> parse(String value) {
            for (Period period : values()) {
                if (period.id.equals(value)) {
                    return Optional.of(period);
                }
            }
            return Optional.empty();
        }
    }

    /** The half-open interval {@code [from, to)} a period covers. */
    public record Window(Instant from, Instant to) {
    }

    public static String key(Period period, Instant at) {
        LocalDate date = at.atZone(IST).toLocalDate();
        return switch (period) {
            case DAILY -> date.toString();
            case WEEKLY -> "%d-W%02d".formatted(date.get(IsoFields.WEEK_BASED_YEAR), date.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR));
            case ALLTIME -> ALL;
        };
    }

    /** The IST day or Monday-start week containing {@code at}; null for the all-time board (no window). */
    public static Window window(Period period, Instant at) {
        LocalDate date = at.atZone(IST).toLocalDate();
        return switch (period) {
            case DAILY -> new Window(date.atStartOfDay(IST).toInstant(), date.plusDays(1).atStartOfDay(IST).toInstant());
            case WEEKLY -> {
                LocalDate monday = date.with(DayOfWeek.MONDAY);
                yield new Window(monday.atStartOfDay(IST).toInstant(), monday.plusWeeks(1).atStartOfDay(IST).toInstant());
            }
            case ALLTIME -> null;
        };
    }
}

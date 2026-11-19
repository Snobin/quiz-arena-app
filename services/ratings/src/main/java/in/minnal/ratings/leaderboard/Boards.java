package in.minnal.ratings.leaderboard;

import in.minnal.ratings.leaderboard.PeriodKeys.Period;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Names the Valkey keys (AD-3: this service's {@code ratings:} prefix). */
@Component
public class Boards {

    public static final String MODE_QUICK = "QUICK";

    private final String prefix;

    public Boards(@Value("${minnal.valkey.key-prefix:ratings:}") String prefix) {
        this.prefix = prefix;
    }

    /** {@code ratings:lb:{mode}:{period}:{periodKey}} for the period containing {@code at}. */
    public String key(String mode, Period period, Instant at) {
        return prefix + "lb:" + mode + ":" + period.id() + ":" + PeriodKeys.key(period, at);
    }

    /** The marker that says the boards were built once (missing after a flush: rebuild on boot). */
    public String builtAtKey() {
        return prefix + "lb:meta:builtAt";
    }
}

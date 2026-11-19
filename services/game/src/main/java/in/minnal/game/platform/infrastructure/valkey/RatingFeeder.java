package in.minnal.game.platform.infrastructure.valkey;

import in.minnal.game.matchmaking.application.RatingCache;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Keeps the {@link RatingCache} current (AD-13, AD-16): the first reads replay {@code minnal.rating.updated} from the
 * start of the stream, later reads follow new entries. {@link #pollOnce} applies one batch and moves its position
 * forward only after the batch was applied, so a failed read is retried from the same place. An entry that does not
 * parse is skipped with a warning. The cache's last-{@code ratedAt}-wins rule makes replay order and repeats harmless.
 *
 * <p>Known limitation: the stream is capped at about 100,000 entries, so a long-inactive player whose last update was
 * trimmed reads as 1200 after a game-service restart.
 */
public class RatingFeeder implements StreamFeeder {

    public static final String STREAM = "minnal.rating.updated";
    static final String START = "0-0";
    private static final Logger log = LoggerFactory.getLogger(RatingFeeder.class);

    private final RatingUpdateSource source;
    private final RatingCache cache;
    private final JsonMapper json;
    private String position = START;

    public RatingFeeder(RatingUpdateSource source, RatingCache cache, JsonMapper json) {
        this.source = source;
        this.cache = cache;
        this.json = json;
    }

    /** Logs the replay limitation once, at start. */
    @Override
    public void announce() {
        log.warn("rating cache replays {} from the start; the stream is capped at about 100000 entries, so a player whose last "
                + "update was trimmed reads as 1200 after a restart (known limitation)", STREAM);
    }

    /** Reads and applies one batch; returns how many updates were applied. */
    @Override
    public int pollOnce() {
        RatingUpdateSource.Batch batch = source.read(position);
        int applied = 0;
        for (String payload : batch.payloads()) {
            if (apply(payload)) {
                applied++;
            }
        }
        position = batch.lastId();
        return applied;
    }

    private boolean apply(String payload) {
        try {
            JsonNode event = json.readTree(payload);
            JsonNode user = event.get("userId");
            JsonNode mode = event.get("mode");
            JsonNode rating = event.get("rating");
            JsonNode ratedAt = event.get("ratedAt");
            // Strict types: a number-like string or a text rating must not be coerced into a plausible value.
            if (user == null || !user.isString() || mode == null || !mode.isString() || rating == null || !rating.isIntegralNumber()
                    || !rating.canConvertToInt() || ratedAt == null || !ratedAt.isString()) {
                throw new IllegalArgumentException("unexpected shape");
            }
            cache.update(user.asString(), mode.asString(), rating.asInt(), Instant.parse(ratedAt.asString()));
            return true;
        } catch (RuntimeException e) {
            log.warn("skipping a malformed {} entry: {}", STREAM, e.toString());
            return false;
        }
    }

    String position() {
        return position;
    }
}

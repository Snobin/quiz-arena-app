package in.minnal.contracts.metrics;

import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.Tag;
import io.micrometer.core.instrument.config.MeterFilter;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Keeps personal data out of metrics (NFR20, Story 7.3a). On Minnal's own {@code minnal.*} meters only the allowed tag keys
 * survive. On every meter, a tag whose value looks like a UUID, an email or a room code is dropped. Framework meters (JVM,
 * HTTP server) otherwise keep their standard tags.
 */
public final class MinnalMeterFilter implements MeterFilter {

    public static final Set<String> ALLOWED_KEYS = Set.of("service", "mode", "outcome", "reason", "kind", "source", "status");

    private static final Pattern UUID = Pattern.compile("(?i)[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}");
    private static final Pattern EMAIL = Pattern.compile(".+@.+");
    /** A room code: 6 characters from A-Z without I, L, O and 0, 1; shown as XXX-XXX. */
    private static final Pattern ROOM_CODE = Pattern.compile("[A-HJKMNP-Z2-9]{3}-?[A-HJKMNP-Z2-9]{3}");

    /** True when a tag value must never be exported. */
    public static boolean looksPersonal(String value) {
        return UUID.matcher(value).matches() || EMAIL.matcher(value).matches() || ROOM_CODE.matcher(value).matches();
    }

    @Override
    public Meter.Id map(Meter.Id id) {
        boolean own = id.getName().startsWith("minnal.");
        List<Tag> kept = id.getTags().stream()
                .filter(tag -> !(own && !ALLOWED_KEYS.contains(tag.getKey())) && !looksPersonal(tag.getValue()))
                .toList();
        return kept.size() == id.getTags().size() ? id : id.replaceTags(kept);
    }
}

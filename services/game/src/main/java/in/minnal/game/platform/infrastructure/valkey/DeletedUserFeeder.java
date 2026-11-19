package in.minnal.game.platform.infrastructure.valkey;

import in.minnal.contracts.events.UserDeletedEvent;
import in.minnal.game.platform.session.DeletedUsers;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Fills {@link DeletedUsers} from {@code minnal.user.deleted} (Story 2.8): replayed from the start of the stream on boot,
 * then followed, like {@link RatingFeeder}. The position moves only after a batch was applied. Adding a user twice is a
 * no-op, so replays and repeats are harmless; an entry that does not parse is skipped with a warning.
 */
public class DeletedUserFeeder implements StreamFeeder {

    private static final Logger log = LoggerFactory.getLogger(DeletedUserFeeder.class);

    private final RatingUpdateSource source;
    private final DeletedUsers deleted;
    private final JsonMapper json;
    private String position = RatingFeeder.START;

    public DeletedUserFeeder(RatingUpdateSource source, DeletedUsers deleted, JsonMapper json) {
        this.source = source;
        this.deleted = deleted;
        this.json = json;
    }

    @Override
    public void announce() {
        log.warn("deleted-user set replays {} from the start; the stream is capped at about 100000 entries (known limitation)",
                UserDeletedEvent.STREAM);
    }

    @Override
    public int pollOnce() {
        RatingUpdateSource.Batch batch = source.read(position);
        int applied = 0;
        for (String payload : batch.payloads()) {
            try {
                JsonNode user = json.readTree(payload).get("userId");
                if (user == null || !user.isString() || user.asString().isBlank()) {
                    throw new IllegalArgumentException("unexpected shape");
                }
                deleted.add(user.asString());
                applied++;
            } catch (RuntimeException e) {
                log.warn("skipping a malformed {} entry: {}", UserDeletedEvent.STREAM, e.toString());
            }
        }
        position = batch.lastId();
        return applied;
    }

    String position() {
        return position;
    }
}

package in.minnal.game.platform.infrastructure.valkey;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.game.matchmaking.application.RatingCache;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class RatingFeederTest {

    /** A fake stream: entries with ids 1-0, 2-0, ...; reads return everything after the given id. */
    static final class FakeSource implements RatingUpdateSource {
        final List<String> payloads = new ArrayList<>();
        final List<String> reads = new ArrayList<>();
        int failNext;

        @Override
        public Batch read(String afterId) {
            reads.add(afterId);
            if (failNext > 0) {
                failNext--;
                throw new IllegalStateException("valkey down");
            }
            int after = "0-0".equals(afterId) ? 0 : Integer.parseInt(afterId.split("-")[0]);
            if (after >= payloads.size()) {
                return new Batch(afterId, List.of());
            }
            return new Batch(payloads.size() + "-0", List.copyOf(payloads.subList(after, payloads.size())));
        }
    }

    static String update(String user, String mode, int rating, String ratedAt) {
        return "{\"eventId\":\"e\",\"userId\":\"" + user + "\",\"mode\":\"" + mode + "\",\"rating\":" + rating + ",\"ratedAt\":\"" + ratedAt + "\"}";
    }

    final FakeSource source = new FakeSource();
    final RatingCache cache = new RatingCache();
    final RatingFeeder feeder = new RatingFeeder(source, cache, JsonMapper.builder().build());

    @Test
    void replaysFromTheStartThenFollowsNewEntries() {
        source.payloads.add(update("a", "QUICK", 1500, "2026-11-19T10:00:00Z"));
        source.payloads.add(update("b", "QUICK", 1250, "2026-11-19T10:01:00Z"));

        assertThat(feeder.pollOnce()).isEqualTo(2);
        assertThat(source.reads).containsExactly("0-0");
        assertThat(cache.ratingOf("a", "QUICK")).isEqualTo(1500);
        assertThat(cache.ratingOf("b", "QUICK")).isEqualTo(1250);

        source.payloads.add(update("a", "QUICK", 1516, "2026-11-19T11:00:00Z"));
        assertThat(feeder.pollOnce()).isEqualTo(1);
        assertThat(source.reads).containsExactly("0-0", "2-0"); // follows from where it stopped
        assertThat(cache.ratingOf("a", "QUICK")).isEqualTo(1516);
        assertThat(feeder.pollOnce()).isZero();
    }

    @Test
    void aReplayedOlderValueNeverOverwritesANewerOne() {
        source.payloads.add(update("a", "QUICK", 1250, "2026-11-19T10:05:00Z"));
        source.payloads.add(update("a", "QUICK", 1200, "2026-11-19T10:00:00Z"));
        feeder.pollOnce();
        assertThat(cache.ratingOf("a", "QUICK")).isEqualTo(1250);
    }

    @Test
    void aMalformedEntryIsSkippedAndTheRestAreApplied() {
        source.payloads.add("not json");
        source.payloads.add("{\"userId\":\"a\"}");
        source.payloads.add(update("a", "QUICK", 1, "2026-11-19T10:00:00Z").replace("\"rating\":1,", "\"rating\":\"1500\",")); // a text rating is not coerced
        source.payloads.add(update("a", "QUICK", 1, "2026-11-19T10:00:00Z").replace("\"userId\":\"a\"", "\"userId\":7")); // a numeric user id is not stringified
        source.payloads.add(update("a", "QUICK", 1400, "2026-11-19T10:00:00Z"));
        assertThat(feeder.pollOnce()).isEqualTo(1);
        assertThat(cache.ratingOf("a", "QUICK")).isEqualTo(1400);
    }

    @Test
    void aFailedReadKeepsItsPositionSoTheSameReadIsRetried() {
        source.payloads.add(update("a", "QUICK", 1400, "2026-11-19T10:00:00Z"));
        source.failNext = 1;
        org.assertj.core.api.Assertions.assertThatThrownBy(feeder::pollOnce).isInstanceOf(IllegalStateException.class);
        assertThat(feeder.position()).isEqualTo("0-0");
        assertThat(feeder.pollOnce()).isEqualTo(1);
        assertThat(cache.ratingOf("a", "QUICK")).isEqualTo(1400);
    }

    @Test
    void aMissingEntryAndAGuestStayAt1200() {
        feeder.pollOnce();
        assertThat(cache.ratingOf("nobody", "QUICK")).isEqualTo(1200);
    }
}

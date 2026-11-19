package in.minnal.game.platform.infrastructure.valkey;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.game.platform.session.DeletedUsers;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class DeletedUserFeederTest {

    /** Entries with ids 1-0, 2-0, ...; reads return everything after the given id. */
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

    static String deleted(String user) {
        return "{\"eventId\":\"e\",\"userId\":\"" + user + "\",\"occurredAt\":\"2026-11-19T10:00:00Z\"}";
    }

    final FakeSource source = new FakeSource();
    final DeletedUsers users = new DeletedUsers();
    final DeletedUserFeeder feeder = new DeletedUserFeeder(source, users, JsonMapper.builder().build());

    @Test
    void replaysFromTheStartThenFollowsAndAReplayedEntryIsHarmless() {
        source.payloads.add(deleted("a"));
        source.payloads.add(deleted("a"));
        source.payloads.add(deleted("b"));

        assertThat(feeder.pollOnce()).isEqualTo(3);
        assertThat(source.reads).containsExactly("0-0");
        assertThat(users.contains("a")).isTrue();
        assertThat(users.contains("b")).isTrue();
        assertThat(users.contains("c")).isFalse();

        source.payloads.add(deleted("c"));
        assertThat(feeder.pollOnce()).isEqualTo(1);
        assertThat(users.contains("c")).isTrue();
        assertThat(source.reads).containsExactly("0-0", "3-0");
    }

    @Test
    void aMalformedEntryIsSkippedAndAFailedReadIsRetriedFromTheSamePlace() {
        source.payloads.add("not json");
        source.payloads.add("{\"userId\":5}");
        source.payloads.add(deleted("a"));
        source.failNext = 1;

        try {
            feeder.pollOnce();
        } catch (IllegalStateException expected) {
            // retried by the runner
        }
        assertThat(feeder.position()).isEqualTo("0-0");
        assertThat(feeder.pollOnce()).isEqualTo(1);
        assertThat(users.contains("a")).isTrue();
    }
}

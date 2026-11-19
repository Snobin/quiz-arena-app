package in.minnal.ratings.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.ratings.directory.PlayerDirectory;
import in.minnal.ratings.support.PostgresIntegrationTest;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.json.JsonMapper;

/** The consumer's contract: ack only after commit, duplicates are acknowledged no-ops, pending is reclaimed, poison is dead-lettered. */
class StreamConsumerIntegrationTest extends PostgresIntegrationTest {

    @Autowired
    MatchCompletedHandler handler;

    @Autowired
    PlayerDirectory directory;

    @Autowired
    UserDeletedHandler deleted;

    @Autowired
    JsonMapper json;

    final SimpleMeterRegistry meters = new SimpleMeterRegistry();

    StreamConsumer consumer(FakeStreamClient streams, String name) {
        return new StreamConsumer(streams, handler, directory, deleted, json, meters, name, Duration.ZERO);
    }

    String payload(MatchCompletedEvent event) {
        return json.writeValueAsString(event);
    }

    int rating(UUID user) {
        return jdbc.sql("SELECT rating FROM rating WHERE user_id = :u").param("u", user).query(Integer.class).single();
    }

    @Test
    void aHandledEntryIsAcknowledgedAfterItsCommit() {
        FakeStreamClient streams = new FakeStreamClient();
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        streams.append(MatchCompletedEvent.STREAM, Map.of("payload", payload(rated(UUID.randomUUID(), List.of(user(a, 7000, 1), user(b, 4000, 2))))));

        assertThat(consumer(streams, "c1").poll()).isEqualTo(1);

        assertThat(rating(a)).isEqualTo(1216);
        assertThat(streams.pendingOf(MatchCompletedEvent.STREAM, StreamConsumer.GROUP)).isEmpty();
    }

    @Test
    void aDuplicatedEntryIsAcknowledgedAndChangesNothing() {
        FakeStreamClient streams = new FakeStreamClient();
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        MatchCompletedEvent event = rated(UUID.randomUUID(), List.of(user(a, 7000, 1), user(b, 4000, 2)));
        streams.append(MatchCompletedEvent.STREAM, Map.of("payload", payload(event)));
        streams.append(MatchCompletedEvent.STREAM, Map.of("payload", payload(event)));

        assertThat(consumer(streams, "c1").poll()).isEqualTo(2);

        assertThat(rating(a)).isEqualTo(1216);
        assertThat(count("rating_event")).isEqualTo(2);
        assertThat(count("event_outbox")).isEqualTo(2);
        assertThat(streams.pendingOf(MatchCompletedEvent.STREAM, StreamConsumer.GROUP)).isEmpty();
    }

    @Test
    void entriesPendingFromABeforeRestartConsumerAreReclaimedBeforeNewOnes() {
        FakeStreamClient streams = new FakeStreamClient();
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        streams.append(MatchCompletedEvent.STREAM, Map.of("payload", payload(rated(UUID.randomUUID(), List.of(user(a, 7000, 1), user(b, 4000, 2))))));
        // The old process read it (it is pending) and died before handling it.
        streams.ensureGroup(MatchCompletedEvent.STREAM, StreamConsumer.GROUP);
        streams.readNew(MatchCompletedEvent.STREAM, StreamConsumer.GROUP, "dead-consumer", 10);
        UUID c = UUID.randomUUID();
        UUID d = UUID.randomUUID();
        streams.append(MatchCompletedEvent.STREAM, Map.of("payload", payload(rated(UUID.randomUUID(), List.of(user(c, 7000, 1), user(d, 4000, 2))))));

        assertThat(consumer(streams, "after-restart").poll()).isEqualTo(2);

        assertThat(rating(a)).isEqualTo(1216);
        assertThat(rating(c)).isEqualTo(1216);
        assertThat(streams.pendingOf(MatchCompletedEvent.STREAM, StreamConsumer.GROUP)).isEmpty();
        // The pending one was handled first: its rating_event has the lower id.
        assertThat(jdbc.sql("SELECT user_id FROM rating_event ORDER BY id LIMIT 1").query(UUID.class).single()).isIn(a, b);
    }

    @Test
    void aPoisonEntryIsRetriedThenDeadLetteredAtItsFifthDeliveryAndCounted() {
        FakeStreamClient streams = new FakeStreamClient();
        String eventId = UUID.randomUUID().toString();
        String poison = "{\"eventId\":\"" + eventId + "\",\"matchId\":\"not-a-uuid\"}";
        String id = streams.append(MatchCompletedEvent.STREAM, Map.of("payload", poison));
        StreamConsumer consumer = consumer(streams, "c1");

        for (int delivery = 1; delivery < StreamConsumer.MAX_DELIVERIES; delivery++) {
            consumer.poll();
            assertThat(streams.pendingOf(MatchCompletedEvent.STREAM, StreamConsumer.GROUP)).as("delivery " + delivery).containsKey(id);
            assertThat(streams.entries(StreamConsumer.DEAD_LETTER)).isEmpty();
        }
        consumer.poll(); // the fifth delivery

        assertThat(streams.pendingOf(MatchCompletedEvent.STREAM, StreamConsumer.GROUP)).isEmpty();
        assertThat(streams.entries(StreamConsumer.DEAD_LETTER)).hasSize(1);
        Map<String, String> dead = streams.entries(StreamConsumer.DEAD_LETTER).getFirst().fields();
        assertThat(dead).containsEntry("sourceStream", MatchCompletedEvent.STREAM).containsEntry("entryId", id)
                .containsEntry("eventId", eventId);
        assertThat(dead.get("error")).isNotBlank();
        assertThat(meters.get(StreamConsumer.DEAD_LETTER_COUNTER).counter().count()).isEqualTo(1.0);
        assertThat(count("rating")).isZero();
    }

    @Test
    void anEntryWithoutAPayloadFieldIsPoisonToo() {
        FakeStreamClient streams = new FakeStreamClient();
        streams.append(MatchCompletedEvent.STREAM, Map.of("other", "x"));
        StreamConsumer consumer = consumer(streams, "c1");
        for (int i = 0; i < StreamConsumer.MAX_DELIVERIES; i++) {
            consumer.poll();
        }
        assertThat(streams.entries(StreamConsumer.DEAD_LETTER)).hasSize(1);
    }

    @Test
    void profileUpdatedEntriesFeedTheDirectoryAndAnOlderOneDeliveredLateDoesNotOverwriteANewerName() {
        FakeStreamClient streams = new FakeStreamClient();
        UUID user = UUID.randomUUID();
        streams.append(StreamConsumer.PROFILE_UPDATED, Map.of("payload", profile(user, "Newer Name", "2026-11-19T10:05:00Z")));
        streams.append(StreamConsumer.PROFILE_UPDATED, Map.of("payload", profile(user, "Older Name", "2026-11-19T10:00:00Z")));

        consumer(streams, "c1").poll();

        assertThat(jdbc.sql("SELECT display_name FROM player_directory WHERE user_id = :u").param("u", user).query(String.class).single()).isEqualTo("Newer Name");
        assertThat(streams.pendingOf(StreamConsumer.PROFILE_UPDATED, StreamConsumer.GROUP)).isEmpty();
    }

    @Test
    void aTombstonedPlayerIsNeverBroughtBack() {
        FakeStreamClient streams = new FakeStreamClient();
        UUID user = UUID.randomUUID();
        streams.append(StreamConsumer.PROFILE_UPDATED, Map.of("payload", profile(user, "Anju", "2026-11-19T10:00:00Z")));
        consumer(streams, "c1").poll();
        jdbc.sql("UPDATE player_directory SET tombstoned_at = now()").update();
        streams.append(StreamConsumer.PROFILE_UPDATED, Map.of("payload", profile(user, "Back Again", "2026-11-19T11:00:00Z")));
        consumer(streams, "c1").poll();
        assertThat(jdbc.sql("SELECT display_name FROM player_directory").query(String.class).single()).isEqualTo("Anju");
    }

    static String profile(UUID user, String name, String updatedAt) {
        return "{\"eventId\":\"" + UUID.randomUUID() + "\",\"userId\":\"" + user + "\",\"displayName\":\"" + name
                + "\",\"district\":\"thrissur\",\"examLevel\":\"DEGREE\",\"language\":\"ml\",\"updatedAt\":\"" + updatedAt + "\"}";
    }

    @Test
    void aFailedAckAfterACommitIsNeverMistakenForPoisonAndTheRedeliveryChangesNothing() {
        FakeStreamClient streams = new FakeStreamClient() {
            boolean failNext = true;

            @Override
            public void ack(String stream, String group, String id) {
                if (failNext) {
                    failNext = false;
                    throw new IllegalStateException("valkey blip");
                }
                super.ack(stream, group, id);
            }
        };
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        streams.append(MatchCompletedEvent.STREAM, Map.of("payload", payload(rated(UUID.randomUUID(), List.of(user(a, 7000, 1), user(b, 4000, 2))))));
        StreamConsumer consumer = consumer(streams, "c1");

        consumer.poll(); // committed, ack failed: still pending
        assertThat(streams.pendingOf(MatchCompletedEvent.STREAM, StreamConsumer.GROUP)).hasSize(1);
        consumer.poll(); // redelivered, a no-op, acknowledged

        assertThat(rating(a)).isEqualTo(1216);
        assertThat(count("rating_event")).isEqualTo(2);
        assertThat(streams.pendingOf(MatchCompletedEvent.STREAM, StreamConsumer.GROUP)).isEmpty();
        assertThat(streams.entries(StreamConsumer.DEAD_LETTER)).isEmpty();
    }

    @Test
    void aFailingDeadLetterWriteLeavesTheEntryPendingAndDoesNotStarveTheOtherStream() {
        FakeStreamClient streams = new FakeStreamClient() {
            @Override
            public void add(String stream, Map<String, String> fields) {
                throw new IllegalStateException("valkey down");
            }
        };
        UUID user = UUID.randomUUID();
        streams.append(MatchCompletedEvent.STREAM, Map.of("payload", "{\"eventId\":\"e\",\"matchId\":\"bad\"}"));
        streams.append(StreamConsumer.PROFILE_UPDATED, Map.of("payload", profile(user, "Anju", "2026-11-19T10:00:00Z")));
        StreamConsumer consumer = consumer(streams, "c1");
        for (int i = 0; i < StreamConsumer.MAX_DELIVERIES + 1; i++) {
            consumer.poll();
        }
        assertThat(streams.pendingOf(MatchCompletedEvent.STREAM, StreamConsumer.GROUP)).hasSize(1);
        assertThat(jdbc.sql("SELECT display_name FROM player_directory WHERE user_id = :u").param("u", user).query(String.class).single()).isEqualTo("Anju");
    }

    @Test
    void aUserListedTwiceIsDeadLetteredNotSilentlyAcknowledgedAsADuplicate() {
        FakeStreamClient streams = new FakeStreamClient();
        UUID a = UUID.randomUUID();
        streams.append(MatchCompletedEvent.STREAM, Map.of("payload", payload(rated(UUID.randomUUID(), List.of(user(a, 7000, 1), user(a, 4000, 2))))));
        StreamConsumer consumer = consumer(streams, "c1");
        for (int i = 0; i < StreamConsumer.MAX_DELIVERIES; i++) {
            consumer.poll();
        }
        assertThat(streams.entries(StreamConsumer.DEAD_LETTER)).hasSize(1);
        assertThat(count("rating")).isZero();
    }
}

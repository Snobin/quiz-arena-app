package in.minnal.contracts.events;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The stream keys are the wire between services: a producer and its consumers in different services only meet through
 * the name. Every service takes its name from these constants (a copy of the literal in a service is what let two sides
 * drift), and this test pins what they are, so renaming one is a deliberate act that fails here first and has to be
 * rolled out to Valkey (the old stream would be orphaned) rather than silently splitting producer from consumer.
 */
class StreamNamesTest {

    @Test
    void theStreamKeysAreTheOnesTheDeployedServicesUse() {
        assertThat(MatchCompletedEvent.STREAM).isEqualTo("minnal.match.completed");
        assertThat(UserDeletedEvent.STREAM).isEqualTo("minnal.user.deleted");
        assertThat(RatingUpdatedStream.STREAM).isEqualTo("minnal.rating.updated");
    }

    @Test
    void theStreamKeysAreDistinctAndCarryNoServicePrefix() {
        List<String> keys = List.of(MatchCompletedEvent.STREAM, UserDeletedEvent.STREAM, RatingUpdatedStream.STREAM);
        assertThat(keys).doesNotHaveDuplicates().allSatisfy(key -> assertThat(key).matches("minnal\\.[a-z]+\\.[a-z]+")
                .doesNotStartWith("minnal.game").doesNotStartWith("minnal.core").doesNotStartWith("minnal.ratings"));
    }

    @Test
    void theEntryFieldIsTheSameForEveryStream() {
        assertThat(MatchCompletedEvent.PAYLOAD_FIELD).isEqualTo("payload").isEqualTo(UserDeletedEvent.PAYLOAD_FIELD);
    }
}

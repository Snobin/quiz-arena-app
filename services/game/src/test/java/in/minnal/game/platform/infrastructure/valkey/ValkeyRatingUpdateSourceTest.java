package in.minnal.game.platform.infrastructure.valkey;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.connection.stream.StreamReadOptions;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.data.redis.core.StreamOperations;

class ValkeyRatingUpdateSourceTest {

    @SuppressWarnings("unchecked")
    final StreamOperations<String, Object, Object> streams = mock(StreamOperations.class);
    final ValkeyRatingUpdateSource source = new ValkeyRatingUpdateSource(streams);

    @SuppressWarnings("unchecked")
    @Test
    void readsPlainWithNoConsumerGroupFromTheGivenIdAndReturnsPayloadsAndTheLastId() {
        MapRecord<String, Object, Object> one = StreamRecords.newRecord().in(RatingFeeder.STREAM).withId(RecordId.of("5-0")).ofMap(Map.of("payload", "{\"a\":1}"));
        MapRecord<String, Object, Object> two = StreamRecords.newRecord().in(RatingFeeder.STREAM).withId(RecordId.of("6-0")).ofMap(Map.of("payload", "{\"a\":2}"));
        when(streams.read(any(StreamReadOptions.class), any(StreamOffset[].class))).thenReturn(List.of(one, two));

        RatingUpdateSource.Batch batch = source.read("4-0");

        assertThat(batch.payloads()).containsExactly("{\"a\":1}", "{\"a\":2}");
        assertThat(batch.lastId()).isEqualTo("6-0");
        ArgumentCaptor<StreamOffset<String>> offset = ArgumentCaptor.forClass(StreamOffset.class);
        verify(streams).read(any(StreamReadOptions.class), offset.capture());
        assertThat(offset.getValue().getKey()).isEqualTo("minnal.rating.updated");
        assertThat(offset.getValue().getOffset().getOffset()).isEqualTo("4-0");
    }

    @SuppressWarnings("unchecked")
    @Test
    void noEntriesKeepsThePosition() {
        when(streams.read(any(StreamReadOptions.class), any(StreamOffset[].class))).thenReturn(List.of());
        assertThat(source.read("9-0")).isEqualTo(new RatingUpdateSource.Batch("9-0", List.of()));
    }
}

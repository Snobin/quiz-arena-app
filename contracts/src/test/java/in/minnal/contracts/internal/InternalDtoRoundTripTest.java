package in.minnal.contracts.internal;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.realtime.ContractJson;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/** The /internal/question-sets DTOs survive a JSON round-trip in the wire shape core-service reads. */
class InternalDtoRoundTripTest {

    @Test
    void aQuestionSetRequestRoundTripsAndOmitsAbsentFilters() {
        QuestionSetRequest request = new QuestionSetRequest(QuestionSource.BANK, QuestionSetFilters.category("KERALA_PSC"),
                null, 10, "sub-1");
        String json = ContractJson.MAPPER.writeValueAsString(request);
        assertThat(ContractJson.MAPPER.readValue(json, QuestionSetRequest.class)).isEqualTo(request);
        JsonNode tree = ContractJson.MAPPER.readTree(json);
        assertThat(tree.get("source").asString()).isEqualTo("BANK");
        assertThat(tree.get("filters").propertyNames()).containsExactly("category");
        assertThat(tree.has("customTopicId")).isFalse();
    }

    @Test
    void aFullyFilteredRequestRoundTrips() {
        QuestionSetRequest request = new QuestionSetRequest(QuestionSource.CUSTOM,
                new QuestionSetFilters("SCHOOL_QUIZ", UUID.randomUUID(), UUID.randomUUID(), "TENTH"), UUID.randomUUID(), 5,
                "sub-2");
        assertThat(ContractJson.MAPPER.readValue(ContractJson.MAPPER.writeValueAsString(request), QuestionSetRequest.class))
                .isEqualTo(request);
    }

    @Test
    void aQuestionSetResponseRoundTrips() {
        QuestionSetResponse response = new QuestionSetResponse(List.of(
                new InternalQuestion(UUID.randomUUID(), 1, "ചോദ്യം", null, List.of("a", "b", "c", "d"), 3, "വിശദീകരണം", "PSC 2019"),
                new InternalQuestion(UUID.randomUUID(), 4, null, "Question", List.of("w", "x", "y", "z"), 0, "Why", null),
                new InternalQuestion(UUID.randomUUID(), 2, "ml", null, List.of("a", "b", "c", "d"), 1, "x", null, UUID.randomUUID())));
        assertThat(ContractJson.MAPPER.readValue(ContractJson.MAPPER.writeValueAsString(response), QuestionSetResponse.class))
                .isEqualTo(response);
    }

    @Test
    void aTopicBlockRoundTripsAndIsOmittedWhenNull() {
        InternalQuestion q = new InternalQuestion(UUID.randomUUID(), 1, "ml", null, List.of("a", "b", "c", "d"), 0, "x", null);
        QuestionSetResponse withTopic = new QuestionSetResponse(List.of(q),
                new QuestionSetTopic(UUID.randomUUID(), "Kerala History", UUID.randomUUID(), "History"));
        assertThat(ContractJson.MAPPER.readValue(ContractJson.MAPPER.writeValueAsString(withTopic), QuestionSetResponse.class))
                .isEqualTo(withTopic);
        assertThat(ContractJson.MAPPER.writeValueAsString(new QuestionSetResponse(List.of(q)))).doesNotContain("topic");
    }
}

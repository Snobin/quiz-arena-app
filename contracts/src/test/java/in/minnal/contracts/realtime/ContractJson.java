package in.minnal.contracts.realtime;

import com.fasterxml.jackson.annotation.JsonInclude;
import tools.jackson.databind.SerializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * The JSON shape the services put on the wire: Jackson 3 defaults (ISO-8601 instants, enums by
 * name, record components in declaration order) with nulls omitted, as game-service's STOMP
 * converter writes them. Indented only so the golden samples diff well.
 */
public final class ContractJson {

    public static final JsonMapper MAPPER = JsonMapper.builder()
            .changeDefaultPropertyInclusion(inclusion -> inclusion.withValueInclusion(JsonInclude.Include.NON_NULL))
            .enable(SerializationFeature.INDENT_OUTPUT)
            .build();

    private ContractJson() {
    }
}

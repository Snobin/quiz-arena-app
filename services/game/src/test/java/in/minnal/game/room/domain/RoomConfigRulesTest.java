package in.minnal.game.room.domain;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.internal.QuestionSource;
import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.RoomSource;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class RoomConfigRulesTest {

    static final UUID TOPIC = UUID.randomUUID();

    static RoomConfigInput bank(String topicId, Integer count) {
        return new RoomConfigInput(true, "BANK", topicId, count != null, count);
    }

    @ParameterizedTest
    @ValueSource(ints = {5, 10, 30})
    void aBankTopicAndACountFromFiveToThirtyIsValid(int count) {
        var result = RoomConfigRules.forCreate(bank(TOPIC.toString(), count));
        assertThat(result.valid()).isTrue();
        assertThat(result.config().questionCount()).isEqualTo(count);
        assertThat(result.config().source()).isEqualTo(new RoomSource(QuestionSource.BANK, TOPIC));
        assertThat(result.config().source().rated()).isTrue();
    }

    @ParameterizedTest
    @ValueSource(ints = {-1, 0, 4, 31, 100})
    void aCountOutOfRangeIsInvalidRoomConfig(int count) {
        assertThat(RoomConfigRules.forCreate(bank(TOPIC.toString(), count)).error()).isEqualTo(ErrorCode.INVALID_ROOM_CONFIG);
    }

    @Test
    void aMissingCountIsInvalidRoomConfigOnCreate() {
        assertThat(RoomConfigRules.forCreate(bank(TOPIC.toString(), null)).error()).isEqualTo(ErrorCode.INVALID_ROOM_CONFIG);
    }

    @Test
    void aMissingOrNonUuidTopicIsInvalidTopic() {
        assertThat(RoomConfigRules.forCreate(bank(null, 10)).error()).isEqualTo(ErrorCode.INVALID_TOPIC);
        assertThat(RoomConfigRules.forCreate(bank("not-a-uuid", 10)).error()).isEqualTo(ErrorCode.INVALID_TOPIC);
    }

    @Test
    void aSourceOtherThanBankOrCustomIsNotAvailable() {
        var weird = new RoomConfigInput(true, "WEIRD", TOPIC.toString(), true, 10);
        assertThat(RoomConfigRules.forCreate(weird).error()).isEqualTo(ErrorCode.SOURCE_NOT_AVAILABLE);
        var untyped = new RoomConfigInput(true, null, TOPIC.toString(), true, 10);
        assertThat(RoomConfigRules.forCreate(untyped).error()).isEqualTo(ErrorCode.SOURCE_NOT_AVAILABLE);
    }

    @Test
    void aCustomSourceNeedsACustomTopicIdAndKeepsTheHostsTopicName() {
        UUID id = UUID.randomUUID();
        var ok = RoomConfigRules.forCreate(new RoomConfigInput(true, "CUSTOM", null, id.toString(), "  Renaissance  ", true, 10));
        assertThat(ok.valid()).isTrue();
        assertThat(ok.config().source().type().name()).isEqualTo("CUSTOM");
        assertThat(ok.config().source().customTopicId()).isEqualTo(id);
        assertThat(ok.config().source().topicName()).isEqualTo("Renaissance");
        assertThat(ok.config().source().topicId()).isNull();
        assertThat(ok.config().source().rated()).isFalse();
        // A bank topicId does not make a custom source; a missing or non-UUID customTopicId is INVALID_TOPIC.
        assertThat(RoomConfigRules.forCreate(new RoomConfigInput(true, "CUSTOM", TOPIC.toString(), null, "x", true, 10)).error())
                .isEqualTo(ErrorCode.INVALID_TOPIC);
        assertThat(RoomConfigRules.forCreate(new RoomConfigInput(true, "CUSTOM", null, "nope", "x", true, 10)).error())
                .isEqualTo(ErrorCode.INVALID_TOPIC);
        // The count rule is the same: 5 to 30.
        assertThat(RoomConfigRules.forCreate(new RoomConfigInput(true, "CUSTOM", null, id.toString(), "x", true, 4)).error())
                .isEqualTo(ErrorCode.INVALID_ROOM_CONFIG);
        assertThat(RoomConfigRules.forCreate(new RoomConfigInput(true, "CUSTOM", null, id.toString(), "x", true, 31)).error())
                .isEqualTo(ErrorCode.INVALID_ROOM_CONFIG);
        // A very long name is capped; a missing name is empty (core's name replaces it at start).
        String longName = "x".repeat(200);
        assertThat(RoomConfigRules.forCreate(new RoomConfigInput(true, "CUSTOM", null, id.toString(), longName, true, 10))
                .config().source().topicName()).hasSize(80);
        assertThat(RoomConfigRules.forCreate(new RoomConfigInput(true, "CUSTOM", null, id.toString(), null, true, 10))
                .config().source().topicName()).isEmpty();
    }

    @Test
    void aCustomTopicNameLosesControlAndBidirectionalCharactersButKeepsMalayalamAndEmoji() {
        String id = java.util.UUID.randomUUID().toString();
        java.util.function.Function<String, String> shown = name -> RoomConfigRules
                .forCreate(new RoomConfigInput(true, "CUSTOM", null, id, name, true, 10)).config().source().topicName();
        // Right-to-left override and isolates, line breaks, NUL, BOM, bidi marks, soft hyphen: all dropped.
        assertThat(shown.apply("\u202Eevil\u202C \u2066x\u2069\nline\u0000\uFEFF\u200E\u200F\u00AD two")).isEqualTo("evil xline two");
        assertThat(shown.apply("a\u2028b\u2029c\td")).isEqualTo("abcd");
        // Malayalam with ZWNJ/ZWJ (chakkilakkam, conjuncts) and an emoji sequence are unchanged.
        String malayalam = "\u0D15\u0D47\u0D30\u0D33 \u0D28\u0D4D\u200D \u0D15\u0D4D\u200C\u0D37";
        assertThat(shown.apply(malayalam)).isEqualTo(malayalam);
        assertThat(shown.apply("\uD83D\uDC68\u200D\uD83D\uDCBB code")).isEqualTo("\uD83D\uDC68\u200D\uD83D\uDCBB code");
        // The cap counts characters and never cuts an emoji in half; a name of only invisible characters becomes empty.
        assertThat(shown.apply("\uD83D\uDE00".repeat(100)).codePointCount(0, shown.apply("\uD83D\uDE00".repeat(100)).length())).isEqualTo(80);
        assertThat(shown.apply("\u202E\u200E\u2066")).isEmpty();
    }

    @Test
    void aMissingSourceIsInvalidRoomConfig() {
        assertThat(RoomConfigRules.forCreate(new RoomConfigInput(false, null, null, true, 10)).error())
                .isEqualTo(ErrorCode.INVALID_ROOM_CONFIG);
    }

    @Test
    void aConfigureKeepsWhatWasNotSentAndValidatesWhatWas() {
        var current = RoomConfigRules.forCreate(bank(TOPIC.toString(), 10)).config();
        var other = UUID.randomUUID();

        var countOnly = RoomConfigRules.forConfigure(new RoomConfigInput(false, null, null, true, 20), current);
        assertThat(countOnly.config().questionCount()).isEqualTo(20);
        assertThat(countOnly.config().source()).isEqualTo(current.source());

        var sourceOnly = RoomConfigRules.forConfigure(new RoomConfigInput(true, "BANK", other.toString(), false, null), current);
        assertThat(sourceOnly.config().source().topicId()).isEqualTo(other);
        assertThat(sourceOnly.config().questionCount()).isEqualTo(10);

        assertThat(RoomConfigRules.forConfigure(new RoomConfigInput(false, null, null, true, 99), current).error())
                .isEqualTo(ErrorCode.INVALID_ROOM_CONFIG);
        assertThat(RoomConfigRules.forConfigure(new RoomConfigInput(false, null, null, true, null), current).error())
                .isEqualTo(ErrorCode.INVALID_ROOM_CONFIG);
        assertThat(RoomConfigRules.forConfigure(new RoomConfigInput(false, null, null, false, null), current).error())
                .isEqualTo(ErrorCode.INVALID_ROOM_CONFIG);
    }
}

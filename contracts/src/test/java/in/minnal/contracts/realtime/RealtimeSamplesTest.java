package in.minnal.contracts.realtime;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.internal.QuestionSetFilters;
import in.minnal.contracts.internal.QuestionSetRequest;
import in.minnal.contracts.internal.QuestionSetResponse;
import in.minnal.contracts.internal.QuestionSource;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;

/**
 * Golden samples of every real-time message and internal DTO, in {@code contracts/samples/}. The
 * web client's contract test parses these same files with its runtime parsers, so a change here
 * that the client does not follow fails there too.
 *
 * <p>Each sample is serialised and compared with its file (drift fails the build), then read back
 * and compared with the original (round-trip). Regenerate after an intended change with
 * {@code ./mvnw -pl contracts test -Dcontracts.updateSamples=true} and commit the files.
 */
class RealtimeSamplesTest {

    static final Path SAMPLES = samplesDir();
    static final boolean UPDATE = Boolean.getBoolean("contracts.updateSamples");

    static final Instant SERVER_TIME = Instant.parse("2026-11-12T10:15:30.123Z");
    static final UUID MATCH_ID = UUID.fromString("6f1c2a3e-8a4b-4c1d-9e2f-0a1b2c3d4e5f");
    static final UUID ANJU = UUID.fromString("0b7e9c1a-2d3f-4a5b-8c6d-7e8f9a0b1c2d");
    static final UUID BOT = UUID.fromString("9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a");
    static final UUID QUESTION_ID = UUID.fromString("3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f");

    record Sample(String file, Object value, TypeReference<?> type) {
    }

    static List<Sample> samples() {
        List<Participant> participants = List.of(
                new Participant(ANJU, "Guest 4821", ParticipantKind.GUEST),
                new Participant(BOT, "Minnal Bot", ParticipantKind.BOT));
        return List.of(
                new Sample("match-found.json",
                        ServerMessage.aboutMatch(MessageType.MATCH_FOUND, MATCH_ID, SERVER_TIME, new MatchFoundPayload(
                                MATCH_ID, MatchMode.QUICK, participants, 10, QuestionSource.BANK, ANJU)),
                        new TypeReference<ServerMessage<MatchFoundPayload>>() { }),
                new Sample("matchmaking-failed.json",
                        ServerMessage.direct(MessageType.MATCHMAKING_FAILED, SERVER_TIME,
                                new MatchmakingFailedPayload(MatchmakingFailedPayload.QUESTION_SET_UNAVAILABLE)),
                        new TypeReference<ServerMessage<MatchmakingFailedPayload>>() { }),
                new Sample("matchmaking-cancelled.json",
                        ServerMessage.direct(MessageType.MATCHMAKING_CANCELLED, SERVER_TIME, null),
                        new TypeReference<ServerMessage<Void>>() { }),
                new Sample("error-already-in-match.json",
                        ServerMessage.error(ErrorCode.ALREADY_IN_MATCH, MATCH_ID, SERVER_TIME),
                        new TypeReference<ServerMessage<ErrorPayload>>() { }),
                new Sample("error-server-draining.json",
                        ServerMessage.error(ErrorCode.SERVER_DRAINING, null, SERVER_TIME),
                        new TypeReference<ServerMessage<ErrorPayload>>() { }),
                new Sample("broadcast-envelope.json",
                        new ServerMessage<>(MessageType.SCOREBOARD, MATCH_ID, null, 7L, null, SERVER_TIME, null),
                        new TypeReference<ServerMessage<Void>>() { }),
                new Sample("question-set-request.json",
                        new QuestionSetRequest(QuestionSource.BANK, QuestionSetFilters.category("KERALA_PSC"), null, 10,
                                "a1b2c3d4-guest-sub"),
                        new TypeReference<QuestionSetRequest>() { }),
                new Sample("question-set-response.json",
                        new QuestionSetResponse(List.of(new InternalQuestion(QUESTION_ID, 2,
                                "കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദി?", "Which is the longest river in Kerala?",
                                List.of("പെരിയാർ", "ഭാരതപ്പുഴ", "പമ്പ", "ചാലിയാർ"), 0,
                                "പെരിയാറിന് 244 കി.മീ. നീളമുണ്ട്.", null))),
                        new TypeReference<QuestionSetResponse>() { }));
    }

    @TestFactory
    Stream<DynamicTest> eachSampleMatchesItsGoldenFileAndRoundTrips() {
        return samples().stream().map(sample -> DynamicTest.dynamicTest(sample.file(), () -> {
            String json = ContractJson.MAPPER.writeValueAsString(sample.value()) + "\n";
            assertGolden(sample.file(), json);
            Object back = ContractJson.MAPPER.readValue(json, sample.type());
            assertThat(back).isEqualTo(sample.value());
        }));
    }

    @Test
    void enumsJsonListsEveryEnumValue() throws IOException {
        Map<String, List<String>> enums = new LinkedHashMap<>();
        for (Class<? extends Enum<?>> type : List.<Class<? extends Enum<?>>>of(MessageType.class, ErrorCode.class,
                MatchMode.class, ParticipantKind.class, QuestionSource.class)) {
            enums.put(type.getSimpleName(), Arrays.stream(type.getEnumConstants()).map(Enum::name).toList());
        }
        assertGolden("enums.json", ContractJson.MAPPER.writeValueAsString(enums) + "\n");
    }

    @Test
    void nullsAreOmittedAndInstantsAreIso() {
        JsonNode cancelled = ContractJson.MAPPER.valueToTree(ServerMessage.direct(MessageType.MATCHMAKING_CANCELLED, SERVER_TIME, null));
        assertThat(cancelled.propertyNames()).containsExactly("type", "serverTime");
        assertThat(cancelled.get("serverTime").asString()).isEqualTo("2026-11-12T10:15:30.123Z");
    }

    @Test
    void theRematchAndRoomTypesAreTheAd10Set() {
        assertThat(Arrays.stream(MessageType.values()).map(Enum::name).filter(n -> n.startsWith("REMATCH_")))
                .containsExactly("REMATCH_REQUESTED", "REMATCH_ACCEPTED", "REMATCH_DECLINED", "REMATCH_EXPIRED");
        assertThat(Arrays.stream(MessageType.values()).map(Enum::name).filter(n -> n.startsWith("ROOM_")))
                .containsExactly("ROOM_JOINED", "ROOM_LOBBY_UPDATED", "ROOM_CLOSED", "ROOM_START_FAILED",
                        "ROOM_MATCH_STARTED", "ROOM_SUCCEEDED");
    }

    @Test
    void destinationsExpandTheirTemplates() {
        assertThat(Destinations.matchmakingJoin(MatchMode.QUICK)).isEqualTo("/app/matchmaking/QUICK/join");
        assertThat(Destinations.matchmakingCancel(MatchMode.QUICK)).isEqualTo("/app/matchmaking/QUICK/cancel");
        assertThat(Destinations.matchTopic(MATCH_ID)).isEqualTo("/topic/match/" + MATCH_ID);
        assertThat(Destinations.roomTopic(MATCH_ID)).isEqualTo("/topic/room/" + MATCH_ID);
        assertThat(Destinations.USER_PRIVATE_QUEUE).isEqualTo("/user/queue/game");
    }

    /**
     * {@code contracts/samples}, whatever the working directory (Maven, or an IDE at the repo root):
     * the {@code basedir} system property when set, else two levels up from target/test-classes.
     */
    static Path samplesDir() {
        String basedir = System.getProperty("basedir");
        if (basedir != null && !basedir.isBlank()) {
            return Path.of(basedir, "samples");
        }
        try {
            Path classes = Path.of(RealtimeSamplesTest.class.getProtectionDomain().getCodeSource().getLocation().toURI());
            return classes.getParent().getParent().resolve("samples");
        } catch (java.net.URISyntaxException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void assertGolden(String file, String json) throws IOException {
        Path path = SAMPLES.resolve(file);
        if (UPDATE) {
            Files.createDirectories(SAMPLES);
            Files.writeString(path, json, StandardCharsets.UTF_8);
            return;
        }
        assertThat(path)
                .as("golden sample %s is missing: run ./mvnw -pl contracts test -Dcontracts.updateSamples=true", path)
                .exists();
        assertThat(Files.readString(path, StandardCharsets.UTF_8))
                .as("contracts/samples/%s drifted from the Java types; if intended, regenerate with "
                        + "-Dcontracts.updateSamples=true and update the web parsers", file)
                .isEqualTo(json);
    }
}

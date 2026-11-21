package in.minnal.contracts.realtime;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.events.CompletedParticipant;
import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.internal.QuestionSetFilters;
import in.minnal.contracts.internal.QuestionSetRequest;
import in.minnal.contracts.internal.QuestionSetResponse;
import in.minnal.contracts.internal.QuestionSetTopic;
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
    static final UUID QUESTION_2_ID = UUID.fromString("4d5e6f7a-8b9c-4d0e-9f1a-2b3c4d5e6f7a");
    static final UUID QUESTION_3_ID = UUID.fromString("5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b");
    static final UUID TOPIC_ID = UUID.fromString("1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d");
    static final UUID SUBJECT_ID = UUID.fromString("2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e");
    static final TopicInfo TOPIC = new TopicInfo(TOPIC_ID, "Kerala History", "History");
    static final UUID ROOM_ID = UUID.fromString("8e9f0a1b-2c3d-4e5f-a6b7-c8d9e0f1a2b3");
    static final UUID EVENT_ID = UUID.fromString("7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c0d");

    /** The body of {@code /app/room/create} and {@code /app/room/{roomId}/configure} (a client send, never parsed by the web). */
    record RoomCreateSample(RoomSource source, Integer questionCount) {
    }

    /** The body of {@code /app/room/join} (Story 5.3; a client send). */
    record RoomJoinSample(String code) {
    }

    record Sample(String file, Object value, TypeReference<?> type) {
    }

    static List<Sample> samples() {
        List<Participant> participants = List.of(
                new Participant(ANJU, "Guest 4821", ParticipantKind.GUEST),
                new Participant(BOT, "Minnal Bot", ParticipantKind.BOT));
        RoomView lobby = new RoomView(ANJU, new RoomSource(QuestionSource.BANK, TOPIC_ID), 10, true,
                Instant.parse("2026-11-13T10:15:30.123Z"), List.of(new Participant(ANJU, "Anju", ParticipantKind.USER)), 1);
        RoomView joinedLobby = new RoomView(ANJU, new RoomSource(QuestionSource.BANK, TOPIC_ID), 10, true,
                Instant.parse("2026-11-13T10:15:30.123Z"), List.of(new Participant(ANJU, "Anju", ParticipantKind.USER),
                        new Participant(BOT, "ബിജു", ParticipantKind.USER)), 2);
        return List.of(
                new Sample("room-joined.json",
                        ServerMessage.roomReply(MessageType.ROOM_JOINED, ROOM_ID, 1, SERVER_TIME,
                                new RoomJoinedPayload(ROOM_ID, "K7MQ2X", RoomRole.HOST, ANJU, lobby)),
                        new TypeReference<ServerMessage<RoomJoinedPayload>>() { }),
                new Sample("room-joined-member.json",
                        ServerMessage.roomReply(MessageType.ROOM_JOINED, ROOM_ID, 1, SERVER_TIME,
                                new RoomJoinedPayload(ROOM_ID, "K7MQ2X", RoomRole.MEMBER, BOT, joinedLobby)),
                        new TypeReference<ServerMessage<RoomJoinedPayload>>() { }),
                new Sample("room-lobby-updated.json",
                        ServerMessage.roomBroadcast(MessageType.ROOM_LOBBY_UPDATED, ROOM_ID, 2, SERVER_TIME,
                                new RoomLobbyUpdatedPayload(joinedLobby, List.of(BOT), List.of())),
                        new TypeReference<ServerMessage<RoomLobbyUpdatedPayload>>() { }),
                new Sample("room-lobby-updated-starting.json",
                        ServerMessage.roomBroadcast(MessageType.ROOM_LOBBY_UPDATED, ROOM_ID, 3, SERVER_TIME,
                                new RoomLobbyUpdatedPayload(joinedLobby, List.of(), List.of(), RoomLobbyPhase.STARTING)),
                        new TypeReference<ServerMessage<RoomLobbyUpdatedPayload>>() { }),
                new Sample("room-start-failed.json",
                        ServerMessage.roomBroadcast(MessageType.ROOM_START_FAILED, ROOM_ID, 4, SERVER_TIME,
                                new RoomStartFailedPayload(RoomStartFailedReason.TOPIC_UNAVAILABLE)),
                        new TypeReference<ServerMessage<RoomStartFailedPayload>>() { }),
                new Sample("room-match-started.json",
                        ServerMessage.roomBroadcast(MessageType.ROOM_MATCH_STARTED, ROOM_ID, 5, SERVER_TIME,
                                new RoomMatchStartedPayload(ROOM_ID, MATCH_ID, MatchMode.BATTLE_ROOM,
                                        joinedLobby.participants(), 10, TOPIC, Instant.parse("2026-11-12T10:15:33.623Z"))),
                        new TypeReference<ServerMessage<RoomMatchStartedPayload>>() { }),
                new Sample("room-closed.json",
                        ServerMessage.roomBroadcast(MessageType.ROOM_CLOSED, ROOM_ID, 3, SERVER_TIME,
                                new RoomClosedPayload(RoomClosedReason.EXPIRED)),
                        new TypeReference<ServerMessage<RoomClosedPayload>>() { }),
                new Sample("error-room-already-in-room.json",
                        ServerMessage.error(ErrorCode.ALREADY_IN_MATCH, null, ROOM_ID, null, SERVER_TIME),
                        new TypeReference<ServerMessage<ErrorPayload>>() { }),
                new Sample("error-room-not-host.json",
                        ServerMessage.roomError(ErrorCode.NOT_HOST, ROOM_ID, SERVER_TIME),
                        new TypeReference<ServerMessage<ErrorPayload>>() { }),
                new Sample("error-room-invalid-config.json",
                        ServerMessage.error(ErrorCode.INVALID_ROOM_CONFIG, null, SERVER_TIME),
                        new TypeReference<ServerMessage<ErrorPayload>>() { }),
                new Sample("error-room-not-found.json",
                        ServerMessage.error(ErrorCode.ROOM_NOT_FOUND, null, SERVER_TIME),
                        new TypeReference<ServerMessage<ErrorPayload>>() { }),
                new Sample("error-room-expired.json",
                        ServerMessage.error(ErrorCode.ROOM_EXPIRED, null, SERVER_TIME),
                        new TypeReference<ServerMessage<ErrorPayload>>() { }),
                new Sample("error-room-full.json",
                        ServerMessage.error(ErrorCode.ROOM_FULL, null, SERVER_TIME),
                        new TypeReference<ServerMessage<ErrorPayload>>() { }),
                new Sample("error-room-started.json",
                        ServerMessage.error(ErrorCode.ROOM_STARTED, null, SERVER_TIME),
                        new TypeReference<ServerMessage<ErrorPayload>>() { }),
                new Sample("error-room-not-enough-players.json",
                        ServerMessage.roomError(ErrorCode.NOT_ENOUGH_PLAYERS, ROOM_ID, SERVER_TIME),
                        new TypeReference<ServerMessage<ErrorPayload>>() { }),
                new Sample("client-room-join.json", new RoomJoinSample("K7M-Q2X"), new TypeReference<RoomJoinSample>() { }),
                new Sample("client-room-create.json",
                        new RoomCreateSample(new RoomSource(QuestionSource.BANK, TOPIC_ID), 10),
                        new TypeReference<RoomCreateSample>() { }),
                new Sample("match-found.json",
                        ServerMessage.aboutMatch(MessageType.MATCH_FOUND, MATCH_ID, SERVER_TIME, new MatchFoundPayload(
                                MATCH_ID, MatchMode.QUICK, participants, 10, QuestionSource.BANK, ANJU, null)),
                        new TypeReference<ServerMessage<MatchFoundPayload>>() { }),
                new Sample("match-found-topic-duel.json",
                        ServerMessage.aboutMatch(MessageType.MATCH_FOUND, MATCH_ID, SERVER_TIME, new MatchFoundPayload(
                                MATCH_ID, MatchMode.TOPIC_DUEL, participants, 10, QuestionSource.BANK, ANJU, TOPIC)),
                        new TypeReference<ServerMessage<MatchFoundPayload>>() { }),
                new Sample("snapshot-topic-duel.json",
                        ServerMessage.reply(MessageType.SNAPSHOT, MATCH_ID, 14, SERVER_TIME, new SnapshotPayload(
                                SnapshotPhase.REVEAL, 3, 10, null, null, null, revealed(3), List.of(),
                                List.of(new ParticipantScore(ANJU, 2140, false), new ParticipantScore(BOT, 1310, false)),
                                participants, false, null, ANJU, TOPIC)),
                        new TypeReference<ServerMessage<SnapshotPayload>>() { }),
                new Sample("match-ended-topic-duel.json",
                        ServerMessage.aboutMatch(MessageType.MATCH_ENDED, MATCH_ID, SERVER_TIME, new MatchEndedPayload(
                                MATCH_ID, MatchMode.TOPIC_DUEL, QuestionSource.BANK, List.of(
                                        new ResultParticipant(ANJU, "Anju", ParticipantKind.USER, 1500, 2, false, 1),
                                        new ResultParticipant(BOT, "Minnal Bot", ParticipantKind.BOT, 642, 1, false, 2)),
                                List.of(), List.of(), TOPIC)),
                        new TypeReference<ServerMessage<MatchEndedPayload>>() { }),
                new Sample("matchmaking-failed-topic-unavailable.json",
                        ServerMessage.direct(MessageType.MATCHMAKING_FAILED, SERVER_TIME,
                                new MatchmakingFailedPayload(MatchmakingFailedPayload.TOPIC_UNAVAILABLE)),
                        new TypeReference<ServerMessage<MatchmakingFailedPayload>>() { }),
                new Sample("error-invalid-topic.json",
                        ServerMessage.error(ErrorCode.INVALID_TOPIC, null, SERVER_TIME),
                        new TypeReference<ServerMessage<ErrorPayload>>() { }),
                new Sample("question-set-response-topic.json",
                        new QuestionSetResponse(List.of(new InternalQuestion(QUESTION_ID, 2,
                                "കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദി?", null, List.of("a", "b", "c", "d"), 0, "x", null, TOPIC_ID)),
                                new QuestionSetTopic(TOPIC_ID, "കേരള ചരിത്രം", SUBJECT_ID, "ചരിത്രം")),
                        new TypeReference<QuestionSetResponse>() { }),
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
                new Sample("question-started.json",
                        ServerMessage.broadcast(MessageType.QUESTION_STARTED, MATCH_ID, 1, SERVER_TIME,
                                new QuestionStartedPayload(0, 10, SERVER_TIME, SERVER_TIME.plusSeconds(15), questionView())),
                        new TypeReference<ServerMessage<QuestionStartedPayload>>() { }),
                new Sample("answer-accepted.json",
                        ServerMessage.reply(MessageType.ANSWER_ACCEPTED, MATCH_ID, 1, SERVER_TIME, AnswerAcceptedPayload.receipt(0)),
                        new TypeReference<ServerMessage<AnswerAcceptedPayload>>() { }),
                new Sample("answer-accepted-1v1.json",
                        ServerMessage.reply(MessageType.ANSWER_ACCEPTED, MATCH_ID, 1, SERVER_TIME,
                                AnswerAcceptedPayload.withResult(0, true, 750, 0, 1625)),
                        new TypeReference<ServerMessage<AnswerAcceptedPayload>>() { }),
                new Sample("scoreboard.json",
                        ServerMessage.broadcast(MessageType.SCOREBOARD, MATCH_ID, 2, SERVER_TIME,
                                new ScoreboardPayload(0, List.of(ANJU))),
                        new TypeReference<ServerMessage<ScoreboardPayload>>() { }),
                new Sample("question-revealed.json",
                        ServerMessage.broadcast(MessageType.QUESTION_REVEALED, MATCH_ID, 4, SERVER_TIME,
                                new QuestionRevealedPayload(0, 10, QUESTION_ID, 2, 0, "പെരിയാറിന് 244 കി.മീ. നീളമുണ്ട്.",
                                        "Kerala PSC 2019, Q 14", List.of(
                                                new ParticipantResult(ANJU, 0, true, 875, 875),
                                                new ParticipantResult(BOT, 2, false, 0, 0)))),
                        new TypeReference<ServerMessage<QuestionRevealedPayload>>() { }),
                new Sample("question-revealed-no-attribution.json",
                        ServerMessage.broadcast(MessageType.QUESTION_REVEALED, MATCH_ID, 9, SERVER_TIME,
                                new QuestionRevealedPayload(1, 10, QUESTION_ID, 2, 3, "x", null, List.of(
                                        new ParticipantResult(ANJU, null, false, 0, 875),
                                        new ParticipantResult(BOT, 3, true, 642, 642)))),
                        new TypeReference<ServerMessage<QuestionRevealedPayload>>() { }),
                new Sample("snapshot.json",
                        ServerMessage.reply(MessageType.SNAPSHOT, MATCH_ID, 12, SERVER_TIME, new SnapshotPayload(
                                SnapshotPhase.QUESTION_OPEN, 3, 10, questionView(), SERVER_TIME.minusSeconds(6),
                                SERVER_TIME.plusSeconds(9), revealed(2), List.of(ANJU),
                                List.of(new ParticipantScore(ANJU, 2140, false), new ParticipantScore(BOT, 1310, false)),
                                participants, false, MyAnswer.withResult(1, true, 900, 1, 3040), ANJU, null)),
                        new TypeReference<ServerMessage<SnapshotPayload>>() { }),
                new Sample("snapshot-forfeited.json",
                        ServerMessage.reply(MessageType.SNAPSHOT, MATCH_ID, 14, SERVER_TIME, new SnapshotPayload(
                                SnapshotPhase.REVEAL, 3, 10, null, null, null, revealed(3), List.of(),
                                List.of(new ParticipantScore(ANJU, 2140, true), new ParticipantScore(BOT, 1310, false)),
                                participants, true, null, ANJU, null)),
                        new TypeReference<ServerMessage<SnapshotPayload>>() { }),
                new Sample("participant-forfeited.json",
                        ServerMessage.broadcast(MessageType.PARTICIPANT_FORFEITED, MATCH_ID, 13, SERVER_TIME,
                                new ParticipantForfeitedPayload(ANJU, 3)),
                        new TypeReference<ServerMessage<ParticipantForfeitedPayload>>() { }),
                new Sample("match-aborted.json",
                        ServerMessage.broadcast(MessageType.MATCH_ABORTED, MATCH_ID, 2, SERVER_TIME,
                                new MatchAbortedPayload(AbortReason.ALL_LEFT)),
                        new TypeReference<ServerMessage<MatchAbortedPayload>>() { }),
                new Sample("match-ended.json",
                        ServerMessage.aboutMatch(MessageType.MATCH_ENDED, MATCH_ID, SERVER_TIME, new MatchEndedPayload(
                                MATCH_ID, MatchMode.QUICK, QuestionSource.BANK, List.of(
                                        new ResultParticipant(ANJU, "Guest 4821", ParticipantKind.GUEST, 1500, 2, false, 1),
                                        new ResultParticipant(BOT, "Minnal Bot", ParticipantKind.BOT, 642, 1, false, 2)),
                                List.of(
                                        new ResultQuestion(QUESTION_ID, 2, "കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദി?",
                                                "Which is the longest river in Kerala?",
                                                List.of("പെരിയാർ", "ഭാരതപ്പുഴ", "പമ്പ", "ചാലിയാർ"), 0,
                                                "പെരിയാറിന് 244 കി.മീ. നീളമുണ്ട്.", "Kerala PSC 2019, Q 14", TOPIC_ID),
                                        new ResultQuestion(QUESTION_2_ID, 1, null, "Who wrote Indulekha?",
                                                List.of("O. Chandu Menon", "Kumaran Asan", "Vallathol", "C. V. Raman Pillai"), 0,
                                                "x", null),
                                        new ResultQuestion(QUESTION_3_ID, 1, "ചോദ്യം", null,
                                                List.of("a", "b", "c", "d"), 3, "y", null)),
                                List.of(
                                        new ParticipantBreakdown(ANJU, List.of(
                                                new BreakdownAnswer(0, true, 3750L, 875),
                                                new BreakdownAnswer(0, true, 5250L, 625),
                                                BreakdownAnswer.missed())),
                                        new ParticipantBreakdown(BOT, List.of(
                                                new BreakdownAnswer(2, false, 6000L, 0),
                                                new BreakdownAnswer(1, false, 2100L, 0),
                                                new BreakdownAnswer(3, true, 5370L, 642)))), null)),
                        new TypeReference<ServerMessage<MatchEndedPayload>>() { }),
                new Sample("match-completed.json",
                        new MatchCompletedEvent(EVENT_ID, MATCH_ID, MatchMode.QUICK, null, QuestionSource.BANK, true,
                                SERVER_TIME.minusSeconds(80), SERVER_TIME, 8000L, List.of(
                                        new CompletedParticipant(ANJU, null, ParticipantKind.GUEST, "Guest 4821", 1500, 2,
                                                false, 1),
                                        new CompletedParticipant(BOT, null, ParticipantKind.BOT, "Minnal Bot", 642, 1,
                                                false, 2))),
                        new TypeReference<MatchCompletedEvent>() { }),
                new Sample("rematch-requested.json",
                        ServerMessage.aboutMatch(MessageType.REMATCH_REQUESTED, MATCH_ID, SERVER_TIME,
                                new RematchRequestedPayload(ANJU, SERVER_TIME.plusSeconds(60))),
                        new TypeReference<ServerMessage<RematchRequestedPayload>>() { }),
                new Sample("rematch-declined.json",
                        ServerMessage.aboutMatch(MessageType.REMATCH_DECLINED, MATCH_ID, SERVER_TIME,
                                new RematchDeclinedPayload(RematchDeclineReason.CANCELLED)),
                        new TypeReference<ServerMessage<RematchDeclinedPayload>>() { }),
                new Sample("rematch-declined-unavailable.json",
                        ServerMessage.aboutMatch(MessageType.REMATCH_DECLINED, MATCH_ID, SERVER_TIME,
                                new RematchDeclinedPayload(RematchDeclineReason.UNAVAILABLE)),
                        new TypeReference<ServerMessage<RematchDeclinedPayload>>() { }),
                new Sample("rematch-expired.json",
                        ServerMessage.aboutMatch(MessageType.REMATCH_EXPIRED, MATCH_ID, SERVER_TIME,
                                new RematchExpiredPayload()),
                        new TypeReference<ServerMessage<RematchExpiredPayload>>() { }),
                new Sample("error-answer-rejected.json",
                        ServerMessage.error(ErrorCode.ANSWER_REJECTED, MATCH_ID, 3L, SERVER_TIME),
                        new TypeReference<ServerMessage<ErrorPayload>>() { }),
                new Sample("error-not-in-match.json",
                        ServerMessage.error(ErrorCode.NOT_IN_MATCH, MATCH_ID, SERVER_TIME),
                        new TypeReference<ServerMessage<ErrorPayload>>() { }),
                new Sample("error-rate-limited.json",
                        ServerMessage.error(ErrorCode.RATE_LIMITED, null, SERVER_TIME),
                        new TypeReference<ServerMessage<ErrorPayload>>() { }),
                new Sample("client-answer.json",
                        new AnswerRequest(0, 2),
                        new TypeReference<AnswerRequest>() { }),
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

    /** The reveal of question {@code index} (the last one revealed before the snapshot). */
    static QuestionRevealedPayload revealed(int index) {
        return new QuestionRevealedPayload(index, 10, QUESTION_ID, 2, 0, "x", null, List.of(
                new ParticipantResult(ANJU, 0, true, 800, 2140),
                new ParticipantResult(BOT, null, false, 0, 1310)));
    }

    static QuestionView questionView() {
        return new QuestionView(QUESTION_ID, 2, "കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദി?", "Which is the longest river in Kerala?",
                List.of("പെരിയാർ", "ഭാരതപ്പുഴ", "പമ്പ", "ചാലിയാർ"));
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
                MatchMode.class, ParticipantKind.class, QuestionSource.class, SnapshotPhase.class, AbortReason.class,
                RematchDeclineReason.class, RoomRole.class, RoomClosedReason.class, RoomLobbyPhase.class,
                RoomStartFailedReason.class)) {
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

    /** AD-5: the open question carries exactly these five fields; nothing about the answer. */
    @Test
    void questionViewJsonHasExactlyItsFiveFields() {
        JsonNode view = ContractJson.MAPPER.valueToTree(questionView());
        assertThat(view.propertyNames()).containsExactly("questionId", "version", "textMl", "textEn", "options");
        assertThat(Arrays.stream(QuestionView.class.getRecordComponents()).map(c -> c.getName()))
                .containsExactly("questionId", "version", "textMl", "textEn", "options");

        InternalQuestion full = new InternalQuestion(QUESTION_ID, 2, "ml", null, List.of("a", "b", "c", "d"), 3,
                "because", "source");
        JsonNode fromInternal = ContractJson.MAPPER.valueToTree(QuestionView.of(full));
        assertThat(fromInternal.propertyNames()).containsExactly("questionId", "version", "textMl", "options");
        assertThat(fromInternal.toString()).doesNotContain("because").doesNotContain("source").doesNotContain("answer");
    }

    @Test
    void anAnswerRequestIgnoresClientTimestampsAndExtraFields() {
        AnswerRequest request = ContractJson.MAPPER.readValue(
                "{\"questionIndex\":3,\"optionIndex\":1,\"clientTime\":\"2026-01-01T00:00:00Z\",\"prevAckRttMs\":80}",
                AnswerRequest.class);
        assertThat(request).isEqualTo(new AnswerRequest(3, 1));
        assertThat(ContractJson.MAPPER.readValue("{}", AnswerRequest.class)).isEqualTo(new AnswerRequest(null, null));
    }

    @Test
    void broadcastsCarrySeqAndRepliesRefSeqOnly() {
        JsonNode broadcast = ContractJson.MAPPER.valueToTree(ServerMessage.broadcast(MessageType.SCOREBOARD, MATCH_ID, 5,
                SERVER_TIME, new ScoreboardPayload(0, List.of())));
        assertThat(broadcast.get("seq").asLong()).isEqualTo(5);
        assertThat(broadcast.has("refSeq")).isFalse();
        JsonNode reply = ContractJson.MAPPER.valueToTree(ServerMessage.reply(MessageType.ANSWER_ACCEPTED, MATCH_ID, 5,
                SERVER_TIME, AnswerAcceptedPayload.receipt(0)));
        assertThat(reply.get("refSeq").asLong()).isEqualTo(5);
        assertThat(reply.has("seq")).isFalse();
    }

    /** Story 1.11: 1v1 acks carry the player's own result; Battle Room keeps the receipt. */
    @Test
    void onlyOneVersusOneModesRevealTheOwnAnswerAtTheAck() {
        assertThat(MatchMode.QUICK.revealsOwnAnswerAtAck()).isTrue();
        assertThat(MatchMode.TOPIC_DUEL.revealsOwnAnswerAtAck()).isTrue();
        assertThat(MatchMode.BATTLE_ROOM.revealsOwnAnswerAtAck()).isFalse();
    }

    @Test
    void aReceiptAckHasOnlyTheQuestionIndex() {
        JsonNode receipt = ContractJson.MAPPER.valueToTree(AnswerAcceptedPayload.receipt(4));
        assertThat(receipt.propertyNames()).containsExactly("questionIndex");
        JsonNode full = ContractJson.MAPPER.valueToTree(AnswerAcceptedPayload.withResult(4, false, 0, 2, 900));
        assertThat(full.propertyNames())
                .containsExactly("questionIndex", "correct", "points", "answerIndex", "totalScore");
    }

    @Test
    void theRematchAndRoomTypesAreTheAd10Set() {
        assertThat(Arrays.stream(MessageType.values()).map(Enum::name).filter(n -> n.startsWith("REMATCH_")))
                .containsExactly("REMATCH_REQUESTED", "REMATCH_ACCEPTED", "REMATCH_DECLINED", "REMATCH_EXPIRED");
        assertThat(Arrays.stream(MessageType.values()).map(Enum::name).filter(n -> n.startsWith("ROOM_")))
                .containsExactly("ROOM_JOINED", "ROOM_LOBBY_UPDATED", "ROOM_CLOSED", "ROOM_START_FAILED",
                        "ROOM_MATCH_STARTED", "ROOM_SUCCEEDED");
    }

    /** Story 5.1: the room JSON has the epic's shape; a room error carries its roomId on both the envelope and the payload. */
    @Test
    void theRoomPayloadsHaveTheEpicShape() {
        JsonNode joined = ContractJson.MAPPER.valueToTree(samples().stream().filter(s -> s.file().equals("room-joined.json"))
                .findFirst().orElseThrow().value());
        assertThat(joined.get("roomId").asString()).isEqualTo(ROOM_ID.toString());
        assertThat(joined.get("matchId")).isNull();
        assertThat(joined.get("payload").propertyNames()).containsExactly("roomId", "code", "role", "selfParticipantId", "room");
        JsonNode room = joined.get("payload").get("room");
        assertThat(room.propertyNames()).containsExactly("hostParticipantId", "source", "questionCount", "rated",
                "expiresAt", "participants", "humanCount");
        assertThat(room.get("source").propertyNames()).containsExactly("type", "topicId");
        JsonNode updated = ContractJson.MAPPER.valueToTree(samples().stream()
                .filter(s -> s.file().equals("room-lobby-updated.json")).findFirst().orElseThrow().value());
        assertThat(updated.get("payload").propertyNames()).containsExactly("room", "joined", "left", "phase");
        assertThat(ContractJson.MAPPER.valueToTree(new RoomLobbyUpdatedPayload(null, null, null)).get("joined").isArray()).isTrue();
        JsonNode busy = ContractJson.MAPPER.valueToTree(ServerMessage.error(ErrorCode.ALREADY_IN_MATCH, null, ROOM_ID, null, SERVER_TIME));
        assertThat(busy.get("roomId").asString()).isEqualTo(ROOM_ID.toString());
        assertThat(busy.get("payload").get("roomId").asString()).isEqualTo(ROOM_ID.toString());
        assertThat(new RoomSource(QuestionSource.BANK, TOPIC_ID).rated()).isTrue();
        assertThat(new RoomSource(QuestionSource.CUSTOM, null).rated()).isFalse();
    }

    @Test
    void destinationsExpandTheirTemplates() {
        assertThat(Destinations.matchmakingJoin(MatchMode.QUICK)).isEqualTo("/app/matchmaking/QUICK/join");
        assertThat(Destinations.matchmakingCancel(MatchMode.QUICK)).isEqualTo("/app/matchmaking/QUICK/cancel");
        assertThat(Destinations.matchTopic(MATCH_ID)).isEqualTo("/topic/match/" + MATCH_ID);
        assertThat(Destinations.roomTopic(MATCH_ID)).isEqualTo("/topic/room/" + MATCH_ID);
        assertThat(Destinations.USER_PRIVATE_QUEUE).isEqualTo("/user/queue/game");
        assertThat(Destinations.matchRematch(MATCH_ID)).isEqualTo("/app/match/" + MATCH_ID + "/rematch");
        assertThat(Destinations.matchRematchCancel(MATCH_ID)).isEqualTo("/app/match/" + MATCH_ID + "/rematch/cancel");
    }

    /** Story 1.9: a snapshot outside an open question carries no question, times or own answer. */
    @Test
    void aSnapshotOutsideAnOpenQuestionOmitsTheQuestionFields() {
        JsonNode snapshot = ContractJson.MAPPER.valueToTree(new SnapshotPayload(SnapshotPhase.LEAD_IN, 0, 10, null, null,
                null, null, List.of(), List.of(), List.of(), false, null, ANJU, null));
        assertThat(snapshot.propertyNames()).containsExactly("phase", "questionIndex", "total", "answered", "scores",
                "participants", "youForfeited", "selfParticipantId");
        JsonNode receipt = ContractJson.MAPPER.valueToTree(MyAnswer.receipt(2));
        assertThat(receipt.propertyNames()).containsExactly("pickedIndex");
    }

    /** Story 1.10: an unanswered breakdown slot carries only {@code correct} and {@code points}. */
    @Test
    void aMissedBreakdownAnswerOmitsPickAndResponseTime() {
        JsonNode missed = ContractJson.MAPPER.valueToTree(BreakdownAnswer.missed());
        assertThat(missed.propertyNames()).containsExactly("correct", "points");
    }

    /** AD-8: a guest's event has no userId; rated follows the source; the stream key has no prefix. */
    @Test
    void theCompletedEventOmitsGuestIdsAndDerivesRated() {
        MatchCompletedEvent event = MatchCompletedEvent.of(MATCH_ID, MatchMode.QUICK, null, QuestionSource.BANK,
                SERVER_TIME, SERVER_TIME, null, List.of(
                        new CompletedParticipant(ANJU, null, ParticipantKind.GUEST, "Guest", 0, 0, false, 1)));
        assertThat(event.rated()).isTrue();
        assertThat(event.eventId()).isNotNull();
        assertThat(MatchCompletedEvent.of(MATCH_ID, MatchMode.QUICK, null, QuestionSource.CUSTOM, SERVER_TIME,
                SERVER_TIME, null, List.of()).rated()).isFalse();
        JsonNode json = ContractJson.MAPPER.valueToTree(event);
        assertThat(json.has("queueWaitMs")).isFalse();
        assertThat(json.has("roomId")).isFalse();
        assertThat(json.get("participants").get(0).has("userId")).isFalse();
        assertThat(MatchCompletedEvent.STREAM).isEqualTo("minnal.match.completed");
        assertThat(MatchCompletedEvent.PAYLOAD_FIELD).isEqualTo("payload");
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

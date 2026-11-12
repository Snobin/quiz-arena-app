/**
 * The real-time (STOMP over WebSocket) protocol between game-service and the web client (AD-10).
 *
 * <p>Every server frame body is a {@link ServerMessage} envelope; {@link MessageType} names it and
 * the payload records ({@link MatchFoundPayload}, {@link MatchmakingFailedPayload},
 * {@link QuestionStartedPayload}, {@link AnswerAcceptedPayload}, {@link ScoreboardPayload},
 * {@link QuestionRevealedPayload}, {@link ErrorPayload}) carry the data; {@link AnswerRequest} is the
 * client's answer body. {@code questionIndex} is 0-based everywhere. {@link Destinations} lists the topics, queues and client
 * sends. JSON is camelCase, nulls are omitted, enums are written by name and instants as ISO-8601
 * UTC. Plain Java only: no Jackson annotations, no Spring.
 *
 * <p>{@code contracts/samples/*.json} holds one golden sample of each message, produced by
 * {@code RealtimeSamplesTest}; the web client's contract test parses them with its runtime parsers.
 */
package in.minnal.contracts.realtime;

package in.minnal.game.matchmaking.application;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.internal.QuestionSetFilters;
import in.minnal.contracts.internal.QuestionSetRequest;
import in.minnal.contracts.internal.QuestionSetResponse;
import in.minnal.contracts.internal.QuestionSetTopic;
import in.minnal.contracts.internal.QuestionSource;
import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.MatchFoundPayload;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.MatchmakingFailedPayload;
import in.minnal.contracts.realtime.MessageType;
import in.minnal.contracts.realtime.Participant;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.contracts.realtime.TopicInfo;
import in.minnal.game.match.application.MatchRegistry;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.platform.session.Activity;
import in.minnal.game.platform.session.ParticipationRegistry;
import in.minnal.game.platform.session.PlayerChannel;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletionException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The start path shared by matchmaking and rematch (Story 1.10): build the {@link MatchSetup} from
 * the humans (each holding a {@code Queued(mode)} claim) and an optional bot, start it through
 * {@link MatchRegistry#start} (which moves the claims to {@code InMatch}), then send each human her
 * {@code MATCH_FOUND}. Draining refuses the start: the claims are released and each human gets
 * {@code ERROR SERVER_DRAINING}. A failed question-set fetch releases the claims and sends
 * {@code MATCHMAKING_FAILED}.
 *
 * <p>Stateless: called on the calling actor's thread.
 */
final class MatchStarter {

    private static final Logger log = LoggerFactory.getLogger(MatchStarter.class);

    static final int QUESTION_COUNT = 10;
    static final String CATEGORY = "KERALA_PSC";

    /**
     * A human about to play.
     *
     * @param queueWaitMs her wait before the pairing (0 for a rematch)
     */
    record Human(String sub, String displayName, ParticipantKind kind, int rating, long queueWaitMs) {
    }

    private final MatchRegistry matches;
    private final ParticipationRegistry participation;
    private final PlayerChannel channel;

    MatchStarter(MatchRegistry matches, ParticipationRegistry participation, PlayerChannel channel) {
        this.matches = matches;
        this.participation = participation;
        this.channel = channel;
    }

    /** The Quick Match question-set request: a random bank mix, asked for on behalf of {@code requesterSub}. */
    static QuestionSetRequest questionSetRequest(String requesterSub) {
        return questionSetRequest(requesterSub, null);
    }

    /** The question-set request, narrowed to {@code topicId} for a Topic Duel (null for Quick Match). */
    static QuestionSetRequest questionSetRequest(String requesterSub, UUID topicId) {
        QuestionSetFilters filters = topicId == null ? QuestionSetFilters.category(CATEGORY)
                : new QuestionSetFilters(CATEGORY, null, topicId, null);
        return new QuestionSetRequest(QuestionSource.BANK, filters, null, QUESTION_COUNT, requesterSub);
    }

    /** Whether {@code set} is usable: no failure and exactly the asked count. */
    static boolean usable(QuestionSetResponse set, Throwable failure) {
        return failure == null && set != null && set.questions().size() == QUESTION_COUNT;
    }

    /** As {@link #usable(QuestionSetResponse, Throwable)}; a Topic Duel set must also name its topic. */
    static boolean usable(QuestionSetResponse set, Throwable failure, MatchMode mode) {
        return usable(set, failure) && (mode != MatchMode.TOPIC_DUEL || set.topic() != null);
    }

    /** The topic block a Topic Duel carries on the wire; null when the set has none. */
    static TopicInfo topicOf(QuestionSetResponse set) {
        QuestionSetTopic topic = set == null ? null : set.topic();
        return topic == null ? null : new TopicInfo(topic.topicId(), topic.name(), topic.subjectName());
    }

    /**
     * Starts the match, or, once draining, releases the humans with {@code SERVER_DRAINING}.
     *
     * @param botName   the bot's display name, or null for a match without one
     * @param botRating the bot's rating (its human's), ignored without a bot
     * @return whether the match started
     */
    boolean start(UUID matchId, MatchMode mode, List<Human> humans, String botName, int botRating,
            List<InternalQuestion> questions, Instant now) {
        return start(matchId, mode, humans, botName, botRating, questions, now, null);
    }

    /** As above, for a Topic Duel on {@code topic} (null for Quick Match). */
    boolean start(UUID matchId, MatchMode mode, List<Human> humans, String botName, int botRating,
            List<InternalQuestion> questions, Instant now, TopicInfo topic) {
        List<Participant> participants = new ArrayList<>();
        Map<String, UUID> bySub = new LinkedHashMap<>();
        Map<String, Long> waits = new LinkedHashMap<>();
        Map<UUID, Integer> ratings = new LinkedHashMap<>();
        for (Human human : humans) {
            UUID participantId = UUID.randomUUID();
            participants.add(new Participant(participantId, human.displayName(), human.kind()));
            bySub.put(human.sub(), participantId);
            waits.put(human.sub(), human.queueWaitMs());
            ratings.put(participantId, human.rating());
        }
        if (botName != null) {
            UUID botId = UUID.randomUUID();
            participants.add(new Participant(botId, botName, ParticipantKind.BOT));
            ratings.put(botId, botRating);
        }
        // Begins the match: its lead-in gives the clients time to subscribe after MATCH_FOUND. Once
        // draining, no match may start (the shutdown waits only for matches already live).
        if (matches.start(new MatchSetup(matchId, mode, participants, bySub, questions, waits, ratings, now,
                QuestionSource.BANK, topic)).isEmpty()) {
            log.atWarn().addKeyValue("matchId", matchId).log("match not started: draining");
            ServerMessage<?> draining = ServerMessage.error(ErrorCode.SERVER_DRAINING, null, now);
            for (Human human : humans) {
                participation.release(human.sub(), queued(mode, topic));
                channel.toPlayer(human.sub(), draining);
            }
            return false;
        }
        for (Map.Entry<String, UUID> human : bySub.entrySet()) {
            channel.toPlayer(human.getKey(), ServerMessage.aboutMatch(MessageType.MATCH_FOUND, matchId, now,
                    new MatchFoundPayload(matchId, mode, participants, QUESTION_COUNT, QuestionSource.BANK,
                            human.getValue(), topic)));
        }
        return true;
    }

    /** The question set did not come: release each human's claim and send her {@code MATCHMAKING_FAILED}. */
    void failed(UUID matchId, MatchMode mode, List<String> humanSubs, Throwable failure, Instant now) {
        failed(matchId, mode, null, humanSubs, failure, now);
    }

    /**
     * As above; {@code topicId} names the Topic Duel queue the claims were taken in (null otherwise). A
     * {@code 422} in a Topic Duel is the {@code TOPIC_UNAVAILABLE} reason, every other failure keeps
     * {@code QUESTION_SET_UNAVAILABLE}.
     */
    void failed(UUID matchId, MatchMode mode, UUID topicId, List<String> humanSubs, Throwable failure, Instant now) {
        log.atWarn().addKeyValue("matchId", matchId)
                .log("question set unavailable, match not started: {}", describe(failure));
        boolean topicGone = mode == MatchMode.TOPIC_DUEL && cause(failure) instanceof QuestionSetClient.TopicUnavailableException;
        ServerMessage<MatchmakingFailedPayload> failed = ServerMessage.direct(MessageType.MATCHMAKING_FAILED, now,
                new MatchmakingFailedPayload(topicGone ? MatchmakingFailedPayload.TOPIC_UNAVAILABLE
                        : MatchmakingFailedPayload.QUESTION_SET_UNAVAILABLE));
        for (String sub : humanSubs) {
            participation.release(sub, new Activity.Queued(mode, topicId));
            channel.toPlayer(sub, failed);
        }
    }

    private static Activity queued(MatchMode mode, TopicInfo topic) {
        return new Activity.Queued(mode, topic == null ? null : topic.topicId());
    }

    private static Throwable cause(Throwable failure) {
        return failure instanceof CompletionException && failure.getCause() != null ? failure.getCause() : failure;
    }

    private static String describe(Throwable failure) {
        if (failure == null) {
            return "short or empty set";
        }
        Throwable cause = cause(failure);
        return cause.getClass().getSimpleName() + ": " + cause.getMessage();
    }
}

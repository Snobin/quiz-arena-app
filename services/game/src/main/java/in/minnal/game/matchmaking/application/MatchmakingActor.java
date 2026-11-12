package in.minnal.game.matchmaking.application;

import in.minnal.contracts.internal.QuestionSetFilters;
import in.minnal.contracts.internal.QuestionSetRequest;
import in.minnal.contracts.internal.QuestionSetResponse;
import in.minnal.contracts.internal.QuestionSource;
import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.MatchFoundPayload;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.MatchmakingFailedPayload;
import in.minnal.contracts.realtime.MessageType;
import in.minnal.contracts.realtime.Participant;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.match.application.MatchRegistry;
import in.minnal.game.match.domain.MatchShell;
import in.minnal.game.matchmaking.domain.MatchmakingQueue;
import in.minnal.game.matchmaking.domain.Pairing;
import in.minnal.game.matchmaking.domain.Seeker;
import in.minnal.game.platform.actor.Actor;
import in.minnal.game.platform.session.Activity;
import in.minnal.game.platform.session.ParticipationRegistry;
import in.minnal.game.platform.session.PlayerChannel;
import in.minnal.game.platform.session.PlayerSessions;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Clock;
import java.time.Duration;
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
 * The matchmaking actor of one mode (AD-4, AD-13): JOIN, CANCEL, DISCONNECT, TICK and SET_FETCHED
 * are queued events handled one at a time on its thread; only that thread touches the
 * {@link MatchmakingQueue}. Its effects are private sends, participation releases, the async
 * question-set fetch (whose result comes back as an event) and creating the match shell.
 */
final class MatchmakingActor implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(MatchmakingActor.class);

    static final int QUESTION_COUNT = 10;
    static final String CATEGORY = "KERALA_PSC";

    private final MatchMode mode;
    private final MatchmakingQueue queue;
    private final Clock clock;
    private final RatingCache ratings;
    private final ParticipationRegistry participation;
    private final PlayerSessions sessions;
    private final PlayerChannel channel;
    private final QuestionSetClient questionSets;
    private final MatchRegistry matches;
    private final Timer queueWait;
    private final Counter humanPairings;
    private final Counter botPairings;
    private final Actor<MatchmakingEvent> actor;

    MatchmakingActor(MatchMode mode, MatchmakingQueue queue, Clock clock, RatingCache ratings,
            ParticipationRegistry participation, PlayerSessions sessions, PlayerChannel channel,
            QuestionSetClient questionSets, MatchRegistry matches, MeterRegistry meters) {
        this.mode = mode;
        this.queue = queue;
        this.clock = clock;
        this.ratings = ratings;
        this.participation = participation;
        this.sessions = sessions;
        this.channel = channel;
        this.questionSets = questionSets;
        this.matches = matches;
        this.queueWait = Timer.builder("minnal.matchmaking.queue.wait")
                .description("Time a human waited in the matchmaking queue before pairing")
                .tag("mode", mode.name())
                .publishPercentiles(0.5)
                .register(meters);
        this.humanPairings = pairings(meters, "human");
        this.botPairings = pairings(meters, "bot");
        this.actor = new Actor<>("matchmaking-" + mode.name().toLowerCase(), this::handle);
    }

    private Counter pairings(MeterRegistry meters, String opponent) {
        return Counter.builder("minnal.matchmaking.pairings")
                .description("Pairings formed, by opponent (bot-fill rate)")
                .tag("mode", mode.name())
                .tag("opponent", opponent)
                .register(meters);
    }

    void tell(MatchmakingEvent event) {
        actor.tell(event);
    }

    private void handle(MatchmakingEvent event) {
        switch (event) {
            case MatchmakingEvent.Join join -> onJoin(join);
            case MatchmakingEvent.Cancel cancel -> onCancel(cancel);
            case MatchmakingEvent.Disconnect disconnect -> onDisconnect(disconnect);
            case MatchmakingEvent.Tick tick -> pairDue();
            case MatchmakingEvent.SetFetched fetched -> onSetFetched(fetched);
        }
    }

    private Activity queued() {
        return new Activity.Queued(mode);
    }

    private void onJoin(MatchmakingEvent.Join join) {
        String sub = join.player().sub();
        // The socket may have closed between the gate's claim and this event: nobody to pair.
        if (!sessions.hasSession(sub)) {
            participation.release(sub, queued());
            return;
        }
        Seeker seeker = new Seeker(sub, join.player().name(), Matchmaking.kindOf(join.player()),
                ratings.ratingOf(join.player()), clock.instant());
        if (queue.join(seeker)) {
            log.debug("{} joined {} at rating {}", sub, mode, seeker.rating());
            pairDue();
        }
    }

    private void onCancel(MatchmakingEvent.Cancel cancel) {
        Instant now = clock.instant();
        switch (queue.cancel(cancel.sub())) {
            case CANCELLED -> {
                participation.release(cancel.sub(), queued());
                channel.toSession(cancel.sub(), cancel.sessionId(),
                        ServerMessage.direct(MessageType.MATCHMAKING_CANCELLED, now, null));
            }
            case REJECTED_PAIRED -> channel.toSession(cancel.sub(), cancel.sessionId(),
                    ServerMessage.error(ErrorCode.CANCEL_REJECTED, null, now));
            case NOT_QUEUED -> {
                UUID matchId = participation.matchOf(cancel.sub()).orElse(null);
                ErrorCode code = matchId != null ? ErrorCode.CANCEL_REJECTED : ErrorCode.NOT_IN_QUEUE;
                channel.toSession(cancel.sub(), cancel.sessionId(), ServerMessage.error(code, matchId, now));
            }
        }
    }

    private void onDisconnect(MatchmakingEvent.Disconnect disconnect) {
        if (queue.leave(disconnect.sub())) {
            participation.release(disconnect.sub(), queued());
            log.debug("{} left {} (disconnected)", disconnect.sub(), mode);
        }
    }

    private void pairDue() {
        for (Pairing pairing : queue.pair(clock.instant())) {
            recordPairing(pairing);
            QuestionSetRequest request = new QuestionSetRequest(QuestionSource.BANK, QuestionSetFilters.category(CATEGORY),
                    null, QUESTION_COUNT, pairing.first().sub());
            questionSets.fetch(request).whenComplete((set, failure) ->
                    actor.tell(new MatchmakingEvent.SetFetched(pairing.id(), set, failure)));
        }
    }

    private void recordPairing(Pairing pairing) {
        List<String> userIds = new ArrayList<>();
        List<Long> waits = new ArrayList<>();
        for (Seeker human : pairing.humans()) {
            long waitMs = pairing.queueWaitMs(human);
            queueWait.record(Duration.ofMillis(waitMs));
            userIds.add(human.sub());
            waits.add(waitMs);
        }
        (pairing.withBot() ? botPairings : humanPairings).increment();
        log.atInfo()
                .addKeyValue("matchId", pairing.id())
                .addKeyValue("userId", userIds)
                .addKeyValue("queueWaitMs", waits)
                .addKeyValue("mode", mode)
                .addKeyValue("opponent", pairing.withBot() ? "bot" : "human")
                .log("matchmaking pairing formed");
    }

    private void onSetFetched(MatchmakingEvent.SetFetched fetched) {
        Pairing pairing = queue.complete(fetched.pairingId()).orElse(null);
        if (pairing == null) {
            return;
        }
        Instant now = clock.instant();
        QuestionSetResponse set = fetched.set();
        if (fetched.failure() != null || set == null || set.questions().size() != QUESTION_COUNT) {
            log.atWarn().addKeyValue("matchId", pairing.id())
                    .log("question set unavailable, pairing failed: {}", describe(fetched.failure()));
            ServerMessage<MatchmakingFailedPayload> failed = ServerMessage.direct(MessageType.MATCHMAKING_FAILED, now,
                    new MatchmakingFailedPayload(MatchmakingFailedPayload.QUESTION_SET_UNAVAILABLE));
            for (Seeker human : pairing.humans()) {
                participation.release(human.sub(), queued());
                channel.toPlayer(human.sub(), failed);
            }
            return;
        }
        UUID matchId = pairing.id();
        List<Participant> participants = new ArrayList<>();
        Map<String, UUID> humans = new LinkedHashMap<>();
        Map<String, Long> waits = new LinkedHashMap<>();
        Map<UUID, Integer> ratingsByParticipant = new LinkedHashMap<>();
        for (Seeker human : pairing.humans()) {
            UUID participantId = UUID.randomUUID();
            participants.add(new Participant(participantId, human.displayName(), human.kind()));
            humans.put(human.sub(), participantId);
            waits.put(human.sub(), pairing.queueWaitMs(human));
            ratingsByParticipant.put(participantId, human.rating());
        }
        if (pairing.withBot()) {
            UUID botId = UUID.randomUUID();
            participants.add(new Participant(botId, Matchmaking.BOT_NAME, ParticipantKind.BOT));
            ratingsByParticipant.put(botId, pairing.botRating());
        }
        matches.create(new MatchShell(matchId, mode, participants, humans, set.questions(), waits, ratingsByParticipant, now));
        for (Map.Entry<String, UUID> human : humans.entrySet()) {
            channel.toPlayer(human.getKey(), ServerMessage.aboutMatch(MessageType.MATCH_FOUND, matchId, now,
                    new MatchFoundPayload(matchId, mode, participants, QUESTION_COUNT, QuestionSource.BANK, human.getValue())));
        }
    }

    private static String describe(Throwable failure) {
        if (failure == null) {
            return "short or empty set";
        }
        Throwable cause = failure instanceof CompletionException && failure.getCause() != null ? failure.getCause() : failure;
        return cause.getClass().getSimpleName() + ": " + cause.getMessage();
    }

    @Override
    public void close() {
        actor.close();
    }
}

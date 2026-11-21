package in.minnal.game.matchmaking.application;

import in.minnal.contracts.internal.QuestionSetRequest;
import in.minnal.contracts.internal.QuestionSetResponse;
import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.MessageType;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.match.application.MatchRegistry;
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
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The matchmaking actor of one mode (AD-4, AD-13): JOIN, CANCEL, DISCONNECT, TICK and SET_FETCHED
 * are queued events handled one at a time on its thread; only that thread touches the
 * {@link MatchmakingQueue}. Its effects are private sends, participation releases, the async
 * question-set fetch (whose result comes back as an event) and starting the match.
 */
final class MatchmakingActor implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(MatchmakingActor.class);

    private final MatchMode mode;
    /** The Topic Duel topic this actor serves; null for Quick Match. */
    private final UUID topicId;
    private final MatchmakingQueue queue;
    private final Clock clock;
    private final RatingCache ratings;
    private final ParticipationRegistry participation;
    private final PlayerSessions sessions;
    private final PlayerChannel channel;
    private final QuestionSetClient questionSets;
    private final MatchStarter starter;
    private final Timer queueWait;
    private final Counter humanPairings;
    private final Counter botPairings;
    private final Actor<MatchmakingEvent> actor;
    /** Whether anyone is queued or pairing, as of the end of the last event; read by the idle reaper. */
    private volatile boolean busy;
    /** The last time a join arrived or the queue emptied. */
    private volatile Instant lastTouched;

    MatchmakingActor(MatchMode mode, UUID topicId, MatchmakingQueue queue, Clock clock, RatingCache ratings,
            ParticipationRegistry participation, PlayerSessions sessions, PlayerChannel channel,
            QuestionSetClient questionSets, MatchRegistry matches, MeterRegistry meters) {
        this.mode = mode;
        this.topicId = topicId;
        this.queue = queue;
        this.clock = clock;
        this.lastTouched = clock.instant();
        this.ratings = ratings;
        this.participation = participation;
        this.sessions = sessions;
        this.channel = channel;
        this.questionSets = questionSets;
        this.starter = new MatchStarter(matches, participation, channel);
        this.queueWait = Timer.builder("minnal.matchmaking.queue.wait")
                .description("Time a human waited in the matchmaking queue before pairing")
                .tag("mode", mode.name())
                .publishPercentiles(0.5)
                .register(meters);
        this.humanPairings = pairings(meters, "human");
        this.botPairings = pairings(meters, "bot");
        this.actor = new Actor<>("matchmaking-" + mode.name().toLowerCase()
                + (topicId == null ? "" : "-" + topicId.toString().substring(0, 8)), this::handle);
    }

    private Counter pairings(MeterRegistry meters, String opponent) {
        return Counter.builder("minnal.matchmaking.pairings")
                .description("Pairings formed, by opponent (bot-fill rate)")
                .tag("mode", mode.name())
                .tag("opponent", opponent)
                .register(meters);
    }

    void tell(MatchmakingEvent event) {
        if (event instanceof MatchmakingEvent.Join) {
            lastTouched = clock.instant();
            busy = true; // until the actor has looked at the join
        }
        actor.tell(event);
    }

    /** Nothing queued or pairing for at least {@code idle} (the topic actor may then be stopped). */
    boolean idleFor(Duration idle) {
        return !busy && !lastTouched.plus(idle).isAfter(clock.instant());
    }

    private void handle(MatchmakingEvent event) {
        try {
            dispatch(event);
        } finally {
            if (queue.isEmpty()) {
                if (busy) {
                    lastTouched = clock.instant();
                }
                busy = false;
            } else {
                busy = true;
            }
        }
    }

    private void dispatch(MatchmakingEvent event) {
        switch (event) {
            case MatchmakingEvent.Join join -> onJoin(join);
            case MatchmakingEvent.Cancel cancel -> onCancel(cancel);
            case MatchmakingEvent.Disconnect disconnect -> onDisconnect(disconnect);
            case MatchmakingEvent.Tick tick -> pairDue();
            case MatchmakingEvent.SetFetched fetched -> onSetFetched(fetched);
        }
    }

    private Activity queued() {
        return new Activity.Queued(mode, topicId);
    }

    private void onJoin(MatchmakingEvent.Join join) {
        String sub = join.player().sub();
        // The socket may have closed between the gate's claim and this event: nobody to pair.
        if (!sessions.hasSession(sub)) {
            participation.release(sub, queued());
            return;
        }
        Seeker seeker = new Seeker(sub, join.player().name(), Matchmaking.kindOf(join.player()),
                ratings.ratingOf(join.player(), mode), clock.instant());
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
            QuestionSetRequest request = MatchStarter.questionSetRequest(pairing.first().sub(), topicId);
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
        var line = log.atInfo()
                .addKeyValue("matchId", pairing.id())
                .addKeyValue("userId", userIds)
                .addKeyValue("queueWaitMs", waits)
                .addKeyValue("mode", mode)
                .addKeyValue("opponent", pairing.withBot() ? "bot" : "human");
        if (topicId != null) {
            line = line.addKeyValue("topicId", topicId); // a log field only: never a metric tag (cardinality)
        }
        line.log("matchmaking pairing formed");
    }

    private void onSetFetched(MatchmakingEvent.SetFetched fetched) {
        Pairing pairing = queue.complete(fetched.pairingId()).orElse(null);
        if (pairing == null) {
            return;
        }
        Instant now = clock.instant();
        QuestionSetResponse set = fetched.set();
        if (!MatchStarter.usable(set, fetched.failure(), mode)) {
            starter.failed(pairing.id(), mode, topicId, pairing.humans().stream().map(Seeker::sub).toList(),
                    fetched.failure(), now);
            return;
        }
        List<MatchStarter.Human> humans = pairing.humans().stream()
                .map(h -> new MatchStarter.Human(h.sub(), h.displayName(), h.kind(), h.rating(), pairing.queueWaitMs(h)))
                .toList();
        starter.start(pairing.id(), mode, humans, pairing.withBot() ? Matchmaking.BOT_NAME : null, pairing.botRating(),
                set.questions(), now, MatchStarter.topicOf(set));
    }

    @Override
    public void close() {
        actor.close();
    }
}

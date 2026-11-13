package in.minnal.game.matchmaking.application;

import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.MessageType;
import in.minnal.contracts.realtime.Participant;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.contracts.realtime.RematchDeclineReason;
import in.minnal.contracts.realtime.RematchDeclinedPayload;
import in.minnal.contracts.realtime.RematchExpiredPayload;
import in.minnal.contracts.realtime.RematchRequestedPayload;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.match.application.MatchCompletedForRematch;
import in.minnal.game.match.application.MatchRegistry;
import in.minnal.game.match.application.MatchTimers;
import in.minnal.game.match.application.RematchRequests;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.platform.actor.Actor;
import in.minnal.game.platform.drain.DrainState;
import in.minnal.game.platform.session.Activity;
import in.minnal.game.platform.session.LastSessionClosed;
import in.minnal.game.platform.session.ParticipationRegistry;
import in.minnal.game.platform.session.PlayerChannel;
import in.minnal.game.platform.session.PlayerSessions;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

/**
 * The post-match rematch windows (Story 1.10). A single-threaded actor, like the matchmaking queue:
 * every change is a queued {@link RematchEvent}; only its thread touches the windows. Timers only
 * tell it events, and the question-set fetch runs off its thread (its result comes back as an event).
 *
 * <p>Rules, per completed QUICK match:
 * <ul>
 *   <li>The window opens at the match end ({@link MatchCompletedForRematch}). It closes after
 *       {@code minnal.rematch.window} (60 s) with nothing pending, counted from the match end or from
 *       the moment the last request expired or was withdrawn, or once a rematch starts. So a re-send
 *       after an expiry works and starts a fresh 60 s.
 *   <li>Either human may request. A bot accepts at once; a human opponent must request too. A
 *       request (or a re-send) is pending until now + the window; then both humans get
 *       {@code REMATCH_EXPIRED}. Each request is echoed to both humans as {@code REMATCH_REQUESTED}.
 *   <li>{@code REMATCH_DECLINED UNAVAILABLE} goes to the requester when there is no open window for
 *       the match, she was not one of its humans, she is queued or in a match, or the opponent has
 *       no live session, or is queued or in a match. A human who forfeited the ended match may
 *       still rematch. A pending request
 *       that becomes impossible (either side leaves or joins matchmaking) reverts the other side the
 *       same way. A cancel sends the opponent {@code REMATCH_DECLINED CANCELLED}.
 *   <li>When both have requested, both humans are claimed ({@code Queued(QUICK)}) while a fresh set
 *       is fetched, then the new match (fresh id, same participants, ratings from the old setup,
 *       {@code queueWaitMs} 0) starts through {@link MatchStarter}, so the clients get an ordinary
 *       {@code MATCH_FOUND}. A failed fetch sends {@code MATCHMAKING_FAILED}; the window stays open.
 *   <li>A cancel while the set is being fetched, or a human whose last session closed by then,
 *       calls the start off: both claims are released and the other human gets
 *       {@code REMATCH_DECLINED CANCELLED} (or {@code UNAVAILABLE}).
 *   <li>While draining, a request gets {@code ERROR SERVER_DRAINING}.
 * </ul>
 */
@Service
public class RematchCoordinator implements RematchRequests, DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(RematchCoordinator.class);

    private static final Activity QUEUED = new Activity.Queued(MatchMode.QUICK);

    /** A pending request: its number (a re-send gets a new one) and when it lapses. */
    private record Pending(long token, Instant expiresAt) {
    }

    /** One ended match's window. Actor thread only. */
    private static final class Window {

        final MatchSetup setup;
        final Map<UUID, String> subByParticipant = new HashMap<>();
        final Map<String, Pending> pending = new LinkedHashMap<>();
        /** The current idle period's number while nothing is pending (its timer closes the window); 0 otherwise. */
        long idleToken;
        /** Non-zero while the new match's question set is being fetched. */
        long fetchToken;
        /** Who cancelled while the set was being fetched (the start is then called off); null otherwise. */
        String cancelledWhileStarting;

        Window(MatchCompletedForRematch ended) {
            this.setup = ended.setup();
            setup.humans().forEach((sub, id) -> subByParticipant.put(id, sub));
        }

        UUID matchId() {
            return setup.matchId();
        }

        boolean isHuman(String sub) {
            return setup.humans().containsKey(sub);
        }

        Optional<String> opponentOf(String sub) {
            return setup.humans().keySet().stream().filter(other -> !other.equals(sub)).findFirst();
        }

        boolean withBot() {
            return setup.participants().stream().anyMatch(p -> p.kind() == ParticipantKind.BOT);
        }

        boolean starting() {
            return fetchToken != 0;
        }
    }

    private final DrainState drain;
    private final ParticipationRegistry participation;
    private final PlayerSessions sessions;
    private final PlayerChannel channel;
    private final Clock clock;
    private final QuestionSetClient questionSets;
    private final MatchTimers timers;
    private final MatchStarter starter;
    private final Duration window;
    private final Map<UUID, Window> windows = new HashMap<>();
    private final Actor<RematchEvent> actor;
    private long tokens;

    public RematchCoordinator(DrainState drain, ParticipationRegistry participation, PlayerSessions sessions,
            PlayerChannel channel, Clock clock, QuestionSetClient questionSets, MatchRegistry matches, MatchTimers timers,
            @Value("${minnal.rematch.window:60s}") Duration window) {
        this.drain = drain;
        this.participation = participation;
        this.sessions = sessions;
        this.channel = channel;
        this.clock = clock;
        this.questionSets = questionSets;
        this.timers = timers;
        this.window = window;
        this.starter = new MatchStarter(matches, participation, channel);
        this.actor = new Actor<>("rematch", this::handle);
    }

    @Override
    public void request(String sub, String sessionId, String matchIdText) {
        actor.tell(new RematchEvent.Request(sub, sessionId, matchIdText));
    }

    @Override
    public void cancel(String sub, String matchIdText) {
        actor.tell(new RematchEvent.Cancel(sub, matchIdText));
    }

    /** {@code sub} joined matchmaking: any pending rematch with her is now impossible. */
    public void joinedMatchmaking(String sub) {
        actor.tell(new RematchEvent.OptedOut(sub));
    }

    @EventListener
    void onMatchCompleted(MatchCompletedForRematch ended) {
        actor.tell(new RematchEvent.Opened(ended));
    }

    @EventListener
    void onLastSessionClosed(LastSessionClosed event) {
        actor.tell(new RematchEvent.OptedOut(event.sub()));
    }

    private void handle(RematchEvent event) {
        switch (event) {
            case RematchEvent.Opened opened -> onOpened(opened.ended());
            case RematchEvent.Request request -> onRequest(request);
            case RematchEvent.Cancel cancel -> onCancel(cancel);
            case RematchEvent.Deadline deadline -> onDeadline(deadline);
            case RematchEvent.WindowOver over -> onWindowOver(over.matchId(), over.token());
            case RematchEvent.OptedOut out -> optOut(out.sub(), null);
            case RematchEvent.SetFetched fetched -> onSetFetched(fetched);
        }
    }

    private void onOpened(MatchCompletedForRematch ended) {
        MatchSetup setup = ended.setup();
        if (setup.mode() != MatchMode.QUICK || setup.humans().isEmpty()) {
            return;
        }
        Window w = new Window(ended);
        windows.put(setup.matchId(), w);
        startIdle(w);
        log.atDebug().addKeyValue("matchId", setup.matchId()).log("rematch window opened");
    }

    private void onRequest(RematchEvent.Request request) {
        String sub = request.sub();
        UUID matchId = parse(request.matchIdText());
        Instant now = clock.instant();
        if (drain.isDraining()) {
            channel.toSession(sub, request.sessionId(), ServerMessage.error(ErrorCode.SERVER_DRAINING, null, now));
            return;
        }
        Window w = matchId == null ? null : windows.get(matchId);
        if (w == null || !w.isHuman(sub)) {
            declined(sub, matchId, RematchDeclineReason.UNAVAILABLE, now);
            return;
        }
        if (w.starting()) {
            return; // the rematch is already on its way
        }
        if (participation.activityOf(sub).isPresent()) {
            withdraw(w, sub, RematchDeclineReason.UNAVAILABLE, now);
            declined(sub, matchId, RematchDeclineReason.UNAVAILABLE, now);
            idleIfDone(w);
            return;
        }
        Optional<String> opponent = w.opponentOf(sub);
        if (opponent.isEmpty()) {
            if (w.withBot()) {
                start(w, sub, now); // the bot accepts at once
            } else {
                declined(sub, matchId, RematchDeclineReason.UNAVAILABLE, now);
            }
            return;
        }
        String other = opponent.get();
        if (!sessions.hasSession(other) || participation.activityOf(other).isPresent()) {
            w.pending.remove(sub);
            w.pending.remove(other);
            declined(sub, matchId, RematchDeclineReason.UNAVAILABLE, now);
            idleIfDone(w);
            return;
        }
        if (w.pending.containsKey(other)) {
            start(w, sub, now);
            return;
        }
        long token = ++tokens;
        Instant expiresAt = now.plus(window);
        w.pending.put(sub, new Pending(token, expiresAt));
        w.idleToken = 0; // something is pending: the idle clock stops
        ServerMessage<RematchRequestedPayload> requested = ServerMessage.aboutMatch(MessageType.REMATCH_REQUESTED, matchId,
                now, new RematchRequestedPayload(w.setup.humans().get(sub), expiresAt));
        channel.toPlayer(sub, requested);
        channel.toPlayer(other, requested);
        timers.schedule(window, () -> actor.tell(new RematchEvent.Deadline(matchId, sub, token)));
    }

    private void onCancel(RematchEvent.Cancel cancel) {
        UUID matchId = parse(cancel.matchIdText());
        Window w = matchId == null ? null : windows.get(matchId);
        if (w == null) {
            return;
        }
        if (w.starting()) {
            // Too late to withdraw a request, not too late to stay out: the start is called off.
            if (w.isHuman(cancel.sub()) && w.cancelledWhileStarting == null) {
                w.cancelledWhileStarting = cancel.sub();
            }
            return;
        }
        if (withdraw(w, cancel.sub(), RematchDeclineReason.CANCELLED, clock.instant())) {
            idleIfDone(w);
        }
    }

    private void onDeadline(RematchEvent.Deadline deadline) {
        Window w = windows.get(deadline.matchId());
        if (w == null || w.starting()) {
            return;
        }
        Pending pending = w.pending.get(deadline.sub());
        if (pending == null || pending.token() != deadline.token()) {
            return; // withdrawn, or re-sent with a later deadline
        }
        w.pending.remove(deadline.sub());
        ServerMessage<RematchExpiredPayload> expired = ServerMessage.aboutMatch(MessageType.REMATCH_EXPIRED, w.matchId(),
                clock.instant(), new RematchExpiredPayload());
        for (String sub : w.setup.humans().keySet()) {
            channel.toPlayer(sub, expired);
        }
        idleIfDone(w);
    }

    private void onWindowOver(UUID matchId, long token) {
        Window w = windows.get(matchId);
        if (w != null && w.idleToken == token && w.pending.isEmpty() && !w.starting()) {
            windows.remove(matchId);
        }
    }

    /**
     * {@code sub} can no longer rematch in any window but {@code except}: her pending requests are
     * withdrawn (the opponent reverts), and requests waiting on her revert their requesters.
     */
    private void optOut(String sub, UUID except) {
        Instant now = clock.instant();
        for (Window w : List.copyOf(windows.values())) {
            if (w.matchId().equals(except) || !w.isHuman(sub) || w.starting()) {
                continue;
            }
            withdraw(w, sub, RematchDeclineReason.UNAVAILABLE, now);
            Optional<String> other = w.opponentOf(sub);
            if (other.isPresent() && w.pending.remove(other.get()) != null) {
                declined(other.get(), w.matchId(), RematchDeclineReason.UNAVAILABLE, now);
            }
            idleIfDone(w);
        }
    }

    /** Removes {@code sub}'s pending request; the opponent, who saw it, reverts with {@code reason}. */
    private boolean withdraw(Window w, String sub, RematchDeclineReason reason, Instant now) {
        if (w.pending.remove(sub) == null) {
            return false;
        }
        w.opponentOf(sub).ifPresent(other -> declined(other, w.matchId(), reason, now));
        return true;
    }

    /** Both said yes (or the bot did): claim the humans and fetch a fresh set off this thread. */
    private void start(Window w, String requester, Instant now) {
        List<String> humans = List.copyOf(w.setup.humans().keySet());
        List<String> claimed = new ArrayList<>();
        boolean allFree = true;
        for (String sub : humans) {
            if (participation.claim(sub, QUEUED).isEmpty()) {
                claimed.add(sub);
            } else {
                allFree = false;
            }
        }
        if (!allFree) {
            // Someone got busy since: whoever is still free reverts.
            for (String sub : claimed) {
                participation.release(sub, QUEUED);
                declined(sub, w.matchId(), RematchDeclineReason.UNAVAILABLE, now);
            }
            w.pending.clear();
            idleIfDone(w);
            return;
        }
        w.pending.clear();
        long token = ++tokens;
        w.fetchToken = token;
        w.idleToken = 0;
        w.cancelledWhileStarting = null;
        for (String sub : humans) {
            optOut(sub, w.matchId());
        }
        UUID matchId = w.matchId();
        log.atInfo().addKeyValue("matchId", matchId).addKeyValue("userId", humans).log("rematch accepted; fetching a set");
        questionSets.fetch(MatchStarter.questionSetRequest(requester)).whenComplete((set, failure) ->
                actor.tell(new RematchEvent.SetFetched(matchId, token, set, failure)));
    }

    private void onSetFetched(RematchEvent.SetFetched fetched) {
        Window w = windows.get(fetched.matchId());
        if (w == null || w.fetchToken != fetched.token()) {
            return;
        }
        Instant now = clock.instant();
        MatchSetup old = w.setup;
        List<String> humanSubs = List.copyOf(old.humans().keySet());
        UUID newMatchId = UUID.randomUUID();
        String canceller = w.cancelledWhileStarting;
        List<String> gone = humanSubs.stream().filter(sub -> !sessions.hasSession(sub)).toList();
        if (canceller != null || !gone.isEmpty()) {
            // Someone cancelled, or left, while the set was fetched: nobody is pulled into a match.
            RematchDeclineReason reason = canceller != null ? RematchDeclineReason.CANCELLED : RematchDeclineReason.UNAVAILABLE;
            for (String sub : humanSubs) {
                participation.release(sub, QUEUED);
                if (!sub.equals(canceller) && !gone.contains(sub)) {
                    declined(sub, w.matchId(), reason, now);
                }
            }
            w.fetchToken = 0;
            w.cancelledWhileStarting = null;
            idleIfDone(w);
            return;
        }
        if (!MatchStarter.usable(fetched.set(), fetched.failure())) {
            starter.failed(newMatchId, MatchMode.QUICK, humanSubs, fetched.failure(), now);
            w.fetchToken = 0; // she may ask again while the window lasts
            idleIfDone(w);
            return;
        }
        windows.remove(w.matchId());
        List<MatchStarter.Human> humans = new ArrayList<>();
        String botName = null;
        for (Participant participant : old.participants()) {
            if (participant.kind() == ParticipantKind.BOT) {
                botName = participant.displayName();
                continue;
            }
            String sub = w.subByParticipant.get(participant.participantId());
            humans.add(new MatchStarter.Human(sub, participant.displayName(), participant.kind(),
                    ratingOf(old, participant.participantId()), 0L));
        }
        int botRating = humans.isEmpty() ? RatingCache.DEFAULT_RATING : humans.getFirst().rating();
        if (starter.start(newMatchId, MatchMode.QUICK, humans, botName, botRating, fetched.set().questions(), now)) {
            log.atInfo().addKeyValue("matchId", newMatchId).addKeyValue("rematchOf", old.matchId()).log("rematch started");
        }
    }

    private static int ratingOf(MatchSetup setup, UUID participantId) {
        return setup.ratings().getOrDefault(participantId, RatingCache.DEFAULT_RATING);
    }

    /** Nothing is pending (any more): a fresh idle period starts, unless one is already running. */
    private void idleIfDone(Window w) {
        if (w.pending.isEmpty() && !w.starting() && w.idleToken == 0) {
            startIdle(w);
        }
    }

    private void startIdle(Window w) {
        long token = ++tokens;
        w.idleToken = token;
        UUID matchId = w.matchId();
        timers.schedule(window, () -> actor.tell(new RematchEvent.WindowOver(matchId, token)));
    }

    private void declined(String sub, UUID matchId, RematchDeclineReason reason, Instant now) {
        channel.toPlayer(sub, ServerMessage.aboutMatch(MessageType.REMATCH_DECLINED, matchId, now,
                new RematchDeclinedPayload(reason)));
    }

    private static UUID parse(String text) {
        try {
            return text == null ? null : UUID.fromString(text);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    @Override
    public void destroy() {
        actor.close();
    }
}

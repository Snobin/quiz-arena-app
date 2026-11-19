package in.minnal.game.match.application;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.MessageType;
import in.minnal.contracts.realtime.Participant;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.platform.session.MatchBroadcaster;
import in.minnal.game.platform.session.PlayerChannel;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

/** Recording fakes and builders for the match actor tests (no Spring, no sockets). */
final class MatchTestKit {

    private MatchTestKit() {
    }

    /** A private send: to every session of {@code sub} ({@code sessionId} null) or to one. */
    record Sent(String sub, String sessionId, ServerMessage<?> message) {
    }

    static final class RecordingChannel implements PlayerChannel {

        final List<Sent> sent = new CopyOnWriteArrayList<>();

        @Override
        public void toPlayer(String sub, ServerMessage<?> message) {
            sent.add(new Sent(sub, null, message));
        }

        @Override
        public void toSession(String sub, String sessionId, ServerMessage<?> message) {
            sent.add(new Sent(sub, sessionId, message));
        }

        List<Sent> to(String sub) {
            return sent.stream().filter(s -> s.sub().equals(sub)).toList();
        }
    }

    static final class RecordingBroadcaster implements MatchBroadcaster {

        final List<ServerMessage<?>> all = new CopyOnWriteArrayList<>();
        final BlockingQueue<ServerMessage<?>> queue = new LinkedBlockingQueue<>();

        @Override
        public void broadcast(UUID matchId, ServerMessage<?> message) {
            all.add(message);
            queue.add(message);
        }

        /** The next broadcast of {@code type} (others skipped), failing after {@code within}. */
        ServerMessage<?> next(MessageType type, Duration within) throws InterruptedException {
            long deadline = System.nanoTime() + within.toNanos();
            while (true) {
                long left = deadline - System.nanoTime();
                ServerMessage<?> message = left > 0 ? queue.poll(left, TimeUnit.NANOSECONDS) : null;
                if (message == null) {
                    throw new AssertionError("no " + type + " broadcast within " + within);
                }
                if (message.type() == type) {
                    return message;
                }
            }
        }

        List<ServerMessage<?>> ofType(MessageType type) {
            return all.stream().filter(m -> m.type() == type).toList();
        }
    }

    static List<InternalQuestion> questions(int count) {
        return IntStream.range(0, count).mapToObj(i -> new InternalQuestion(UUID.randomUUID(), 1, "ചോദ്യം " + i,
                "Question " + i, List.of("a", "b", "c", "d"), i % 4, "explanation " + i, null)).toList();
    }

    /** {@code humans} guests with sub "h0", "h1"…, then {@code bots} bots, over {@code questionCount} questions. */
    static MatchSetup setup(int humans, int bots, int questionCount) {
        List<Participant> participants = new ArrayList<>();
        Map<String, UUID> subs = new LinkedHashMap<>();
        Map<UUID, Integer> ratings = new LinkedHashMap<>();
        for (int i = 0; i < humans; i++) {
            UUID id = UUID.randomUUID();
            participants.add(new Participant(id, "Guest " + i, ParticipantKind.GUEST));
            subs.put("h" + i, id);
            ratings.put(id, 1200);
        }
        for (int i = 0; i < bots; i++) {
            UUID id = UUID.randomUUID();
            participants.add(new Participant(id, "Minnal Bot", ParticipantKind.BOT));
            ratings.put(id, 1200);
        }
        return new MatchSetup(UUID.randomUUID(), MatchMode.QUICK, participants, subs, questions(questionCount),
                Map.of(), ratings, Instant.now());
    }

    static MatchSettings fast(Duration window) {
        return new MatchSettings(Duration.ofMillis(10), window, Duration.ofMillis(50), Duration.ofMillis(10));
    }

    /** {@link #fast(Duration)} with a reconnect grace of {@code grace}. */
    static MatchSettings fast(Duration window, Duration grace) {
        return new MatchSettings(Duration.ofMillis(10), window, Duration.ofMillis(50), Duration.ofMillis(10), grace);
    }

    /** The same setup as a Battle Room (a forfeit there never ends the match). */
    static MatchSetup room(MatchSetup base) {
        return new MatchSetup(base.matchId(), MatchMode.BATTLE_ROOM, base.participants(), base.humans(),
                base.questions(), base.queueWaitMs(), base.ratings(), base.createdAt(), base.questionSource());
    }
}

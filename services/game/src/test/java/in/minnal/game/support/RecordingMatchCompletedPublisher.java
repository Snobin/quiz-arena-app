package in.minnal.game.support;

import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.game.match.application.MatchCompletedPublisher;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Records every {@code minnal.match.completed} instead of publishing it: the {@code test} profile
 * has no Valkey. Shared by every test in a context, so read it by {@code matchId}.
 */
public final class RecordingMatchCompletedPublisher implements MatchCompletedPublisher {

    private final List<MatchCompletedEvent> events = new CopyOnWriteArrayList<>();

    @Override
    public void publish(MatchCompletedEvent event) {
        events.add(event);
    }

    /** The events published for {@code matchId}, in order. */
    public List<MatchCompletedEvent> of(UUID matchId) {
        return events.stream().filter(event -> event.matchId().equals(matchId)).toList();
    }
}

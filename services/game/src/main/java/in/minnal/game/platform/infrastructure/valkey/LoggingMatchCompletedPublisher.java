package in.minnal.game.platform.infrastructure.valkey;

import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.game.match.application.MatchCompletedPublisher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** The publisher when no Valkey connection is configured (e.g. the {@code test} profile): logs and drops. */
final class LoggingMatchCompletedPublisher implements MatchCompletedPublisher {

    private static final Logger log = LoggerFactory.getLogger(LoggingMatchCompletedPublisher.class);

    @Override
    public void publish(MatchCompletedEvent event) {
        log.atInfo().addKeyValue("matchId", event.matchId()).addKeyValue("eventId", event.eventId())
                .log("no Valkey configured; {} not published", MatchCompletedEvent.STREAM);
    }
}

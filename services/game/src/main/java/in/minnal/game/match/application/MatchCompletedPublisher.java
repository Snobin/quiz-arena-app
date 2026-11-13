package in.minnal.game.match.application;

import in.minnal.contracts.events.MatchCompletedEvent;

/**
 * Publishes {@code minnal.match.completed} (AD-8). The match actor calls it once per completed
 * match, on its own thread, after the final reveal and after {@code MATCH_ENDED} is sent, so an
 * implementation must return at once: any I/O, and any retry, happens off the actor thread. A
 * failed publish never reaches the caller.
 */
public interface MatchCompletedPublisher {

    /** Hands the event off for publishing; returns at once and never throws for a publish failure. */
    void publish(MatchCompletedEvent event);
}

package in.minnal.game.platform.infrastructure.valkey;

/** A read-only follower of one Valkey stream, driven by {@link RatingFeederRunner}. */
interface StreamFeeder {

    /** Logs a known limitation once, at start. */
    void announce();

    /** Reads and applies one batch; returns how many entries were applied. */
    int pollOnce();
}

package in.minnal.game.match.domain;

/** Whether a participant has an open session. A bot is always {@code CONNECTED}. */
public enum Connection {
    CONNECTED,
    DISCONNECTED
}

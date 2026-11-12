package in.minnal.game.platform.session;

/**
 * Published when a new session of {@code sub} opens (AD-11). A player in a match is connected
 * again: her reconnect grace is cancelled (Story 1.9).
 */
public record SessionOpened(String sub) {
}

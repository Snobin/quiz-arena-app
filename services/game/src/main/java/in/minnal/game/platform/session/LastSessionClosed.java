package in.minnal.game.platform.session;

/** Published when the last open session of {@code sub} closes: the player is disconnected (AD-11). */
public record LastSessionClosed(String sub) {
}

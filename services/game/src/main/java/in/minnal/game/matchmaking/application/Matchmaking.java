package in.minnal.game.matchmaking.application;

import in.minnal.contracts.identity.Role;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.game.platform.infrastructure.security.MinnalPrincipal;

/** Small identity rules shared by the gate and the actor. */
final class Matchmaking {

    static final String BOT_NAME = "Minnal Bot";

    private Matchmaking() {
    }

    /** A guest is anyone without the {@code USER} role (guest tokens carry only {@code GUEST}). */
    static boolean isGuest(MinnalPrincipal player) {
        return !player.hasRole(Role.USER);
    }

    static ParticipantKind kindOf(MinnalPrincipal player) {
        return isGuest(player) ? ParticipantKind.GUEST : ParticipantKind.USER;
    }
}

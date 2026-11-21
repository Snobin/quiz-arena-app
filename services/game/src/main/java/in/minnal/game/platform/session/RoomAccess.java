package in.minnal.game.platform.session;

import java.util.UUID;

/** Who may see a live room: the subscription check of {@code /topic/room/{roomId}} (Story 5.1). */
public interface RoomAccess {

    /** Whether {@code sub} is a human member of the live room {@code roomId}. */
    boolean isMember(UUID roomId, String sub);
}

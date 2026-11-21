package in.minnal.game.platform.session;

import in.minnal.contracts.realtime.ServerMessage;
import java.util.UUID;

/** Broadcasts on {@code /topic/room/{roomId}} (AD-10), which only the room's members may subscribe to. */
public interface RoomBroadcaster {

    void broadcast(UUID roomId, ServerMessage<?> message);
}

package in.minnal.contracts.realtime;

import java.util.List;
import java.util.UUID;

/**
 * {@code ROOM_LOBBY_UPDATED} (broadcast on {@code /topic/room/{roomId}}): the lobby as it now stands, and who came and
 * went since the previous broadcast (Story 5.3). Membership changes are coalesced: at most one broadcast per 250 ms.
 *
 * @param room   the whole lobby ({@code participants[]} and {@code humanCount} included); it replaces what the client had
 * @param joined participant ids added since the previous broadcast, in join order (empty for a config change)
 * @param left   participant ids removed since the previous broadcast
 * @param phase  {@code LOBBY}, or {@code STARTING} while the host's start fetches the question set (Story 5.4)
 */
public record RoomLobbyUpdatedPayload(RoomView room, List<UUID> joined, List<UUID> left, RoomLobbyPhase phase) {

    public RoomLobbyUpdatedPayload {
        joined = joined == null ? List.of() : List.copyOf(joined);
        left = left == null ? List.of() : List.copyOf(left);
        phase = phase == null ? RoomLobbyPhase.LOBBY : phase;
    }

    /** A lobby change in the {@code LOBBY} phase. */
    public RoomLobbyUpdatedPayload(RoomView room, List<UUID> joined, List<UUID> left) {
        this(room, joined, left, RoomLobbyPhase.LOBBY);
    }

    /** A change with no membership in it (a configure). */
    public RoomLobbyUpdatedPayload(RoomView room) {
        this(room, List.of(), List.of());
    }
}

package in.minnal.contracts.realtime;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * A room as the lobby shows it (inside {@code ROOM_JOINED} and {@code ROOM_LOBBY_UPDATED}).
 *
 * @param hostParticipantId the host's participant id (random per room, never her {@code sub})
 * @param rated             derived on the server: {@code source.type == BANK}
 * @param expiresAt         absolute: the lobby closes then
 * @param participants      the humans in the lobby, host first; a room never holds a {@code BOT}
 * @param humanCount        {@code participants.size()}
 */
public record RoomView(
        UUID hostParticipantId,
        RoomSource source,
        int questionCount,
        boolean rated,
        Instant expiresAt,
        List<Participant> participants,
        int humanCount) {

    public RoomView {
        participants = List.copyOf(participants);
    }
}

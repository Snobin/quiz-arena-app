package in.minnal.game.room.application;

import in.minnal.contracts.identity.Role;
import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.matchmaking.application.RematchCoordinator;
import in.minnal.game.platform.drain.DrainState;
import in.minnal.game.platform.infrastructure.security.MinnalPrincipal;
import in.minnal.game.platform.session.Activity;
import in.minnal.game.platform.session.DeletedUsers;
import in.minnal.game.platform.session.PlayerChannel;
import in.minnal.game.room.domain.RoomConfigInput;
import in.minnal.game.room.domain.RoomConfigRules;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * The room gate (Story 5.1): every {@code /app/room/...} message passes through here and either answers an
 * {@code ERROR} or becomes an event on the room's actor.
 *
 * <p>Create, in order: draining → {@code SERVER_DRAINING}; a deleted account → {@code UNAUTHENTICATED} (as in
 * matchmaking); a guest → {@code FORBIDDEN_MODE}; a token without {@code profileComplete} → {@code PROFILE_REQUIRED};
 * a bad source or count (see {@link RoomConfigRules}; core is never asked: AD-2); {@code max-live} rooms → {@code
 * MODE_UNAVAILABLE}; a {@code sub} already queued, in a room or in a match → {@code ALREADY_IN_MATCH} with the
 * {@code matchId} or {@code roomId}. Join, start and play again are stubs ({@code NOT_AVAILABLE_YET}) until Stories
 * 5.3 to 5.6.
 */
@Service
public class RoomService {

    private final DrainState drain;
    private final DeletedUsers deleted;
    private final RoomRegistry rooms;
    private final RematchCoordinator rematches;
    private final PlayerChannel channel;
    private final Clock clock;

    public RoomService(DrainState drain, DeletedUsers deleted, RoomRegistry rooms, RematchCoordinator rematches,
            PlayerChannel channel, Clock clock) {
        this.drain = drain;
        this.deleted = deleted;
        this.rooms = rooms;
        this.rematches = rematches;
        this.channel = channel;
        this.clock = clock;
    }

    public void create(MinnalPrincipal player, String sessionId, RoomConfigInput input) {
        if (drain.isDraining()) {
            reject(player, sessionId, ErrorCode.SERVER_DRAINING, null, null);
            return;
        }
        if (deleted.contains(player.sub())) {
            reject(player, sessionId, ErrorCode.UNAUTHENTICATED, null, null);
            return;
        }
        if (!player.hasRole(Role.USER)) {
            reject(player, sessionId, ErrorCode.FORBIDDEN_MODE, null, null);
            return;
        }
        if (!player.profileComplete()) {
            reject(player, sessionId, ErrorCode.PROFILE_REQUIRED, null, null);
            return;
        }
        RoomConfigRules.Result config = RoomConfigRules.forCreate(input);
        if (!config.valid()) {
            reject(player, sessionId, config.error(), null, null);
            return;
        }
        switch (rooms.open(player, config.config())) {
            case RoomRegistry.Opening.Opened opened ->
                // In a room now: a pending rematch with her can no longer happen (Story 1.10).
                rematches.joinedMatchmaking(player.sub());
            case RoomRegistry.Opening.Busy busy -> reject(player, sessionId, ErrorCode.ALREADY_IN_MATCH,
                    busy.held() instanceof Activity.InMatch(var matchId) ? matchId : null,
                    busy.held() instanceof Activity.InRoom(var roomId) ? roomId : null);
            case RoomRegistry.Opening.Full full -> reject(player, sessionId, ErrorCode.MODE_UNAVAILABLE, null, null);
            case RoomRegistry.Opening.Draining draining -> reject(player, sessionId, ErrorCode.SERVER_DRAINING, null, null);
        }
    }

    /** Story 5.3 builds join. */
    public void join(MinnalPrincipal player, String sessionId) {
        reject(player, sessionId, ErrorCode.NOT_AVAILABLE_YET, null, null);
    }

    public void configure(MinnalPrincipal player, String sessionId, String roomIdText, RoomConfigInput input) {
        UUID roomId = parse(roomIdText);
        if (roomId == null) {
            reject(player, sessionId, ErrorCode.BAD_REQUEST, null, null);
            return;
        }
        Optional<RoomActor> room = rooms.find(roomId);
        if (room.isEmpty()) {
            // Not a room she hosts: the same answer as for a member who is not the host.
            reject(player, sessionId, ErrorCode.NOT_HOST, null, roomId);
            return;
        }
        room.get().tell(new RoomEvent.Configure(player.sub(), sessionId, input));
    }

    /** Story 5.4 builds start. */
    public void start(MinnalPrincipal player, String sessionId, String roomIdText) {
        reject(player, sessionId, ErrorCode.NOT_AVAILABLE_YET, null, parse(roomIdText));
    }

    public void leave(MinnalPrincipal player, String sessionId, String roomIdText) {
        UUID roomId = parse(roomIdText);
        if (roomId == null) {
            reject(player, sessionId, ErrorCode.BAD_REQUEST, null, null);
            return;
        }
        // A room that is gone (closed, expired) has nothing to leave: ignored, as for a match.
        rooms.find(roomId).ifPresent(room -> room.tell(new RoomEvent.Leave(player.sub(), sessionId)));
    }

    /** Story 5.6 builds play again. */
    public void playAgain(MinnalPrincipal player, String sessionId, String roomIdText) {
        reject(player, sessionId, ErrorCode.NOT_AVAILABLE_YET, null, parse(roomIdText));
    }

    private void reject(MinnalPrincipal player, String sessionId, ErrorCode code, UUID matchId, UUID roomId) {
        channel.toSession(player.sub(), sessionId, ServerMessage.error(code, matchId, roomId, null, clock.instant()));
    }

    private static UUID parse(String text) {
        try {
            return text == null ? null : UUID.fromString(text);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}

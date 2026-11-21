package in.minnal.game.room.application;

import java.time.Duration;

/**
 * Battle Room settings ({@code minnal.room.*}).
 *
 * @param ttl     how long a room lives from creation before it expires (24 h)
 * @param grace   how long a host whose last session closed has to come back before the room closes (AD-11: 10 s)
 * @param maxLive the most rooms open at once; beyond it a create gets {@code MODE_UNAVAILABLE}
 */
public record RoomSettings(Duration ttl, Duration grace, int maxLive) {
}

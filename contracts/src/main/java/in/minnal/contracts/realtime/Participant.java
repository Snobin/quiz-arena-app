package in.minnal.contracts.realtime;

import java.util.UUID;

/**
 * A match participant as every payload shows it (AD-10).
 *
 * @param participantId random per match; never the player's {@code sub}, so an opponent never
 *                      learns a registered user's id
 * @param displayName   shown as is, never inflected
 * @param kind          drives the BOT badge
 */
public record Participant(UUID participantId, String displayName, ParticipantKind kind) {
}

package in.minnal.core.identity.application;

import java.time.Instant;

/** A signed guest access JWT and the instant it expires. */
public record GuestToken(String accessToken, Instant expiresAt) {
}

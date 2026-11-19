package in.minnal.core.identity.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Refresh tokens (AD-9): 30 days, random, stored only as a SHA-256 hash. This story does not rotate:
 * a token is reused until it expires (Story 2.2 adds rotation and reuse detection).
 */
@Service
public class RefreshTokenService {

    public static final Duration TTL = Duration.ofDays(30);

    private final RefreshTokenRepository tokens;
    private final AccountRepository accounts;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public RefreshTokenService(RefreshTokenRepository tokens, AccountRepository accounts, Clock clock) {
        this.tokens = tokens;
        this.accounts = accounts;
        this.clock = clock;
    }

    /** A new refresh token for {@code userId}; the returned raw value is never stored. */
    public String issue(UUID userId) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        Instant now = clock.instant();
        tokens.save(UUID.randomUUID(), userId, hash(raw), now.plus(TTL), now);
        return raw;
    }

    /** The ACTIVE account a valid, unexpired refresh token belongs to; empty for unknown/expired/deleted. */
    public Optional<Account> resolve(String raw) {
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }
        return tokens.findUserId(hash(raw), clock.instant()).flatMap(accounts::findActive);
    }

    static String hash(String raw) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}

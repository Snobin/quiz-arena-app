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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Refresh tokens (AD-9): 30 days, random, stored only as a SHA-256 hash, rotated on every use inside a
 * family. Presenting a token that was already rotated is reuse (a copy was stolen, or replayed): the
 * whole family is revoked. Rotation locks the presented row, so two concurrent uses cannot both win.
 */
@Service
public class RefreshTokenService {

    public static final Duration TTL = Duration.ofDays(30);
    private static final Logger log = LoggerFactory.getLogger(RefreshTokenService.class);

    /** The outcome of presenting a refresh token. */
    public sealed interface Rotation {
        /** Valid: {@code refreshToken} is the replacement to set as the cookie. */
        record Rotated(Account account, String refreshToken) implements Rotation {
        }

        /** An already-rotated token was presented; its family is now revoked. */
        record Reuse(UUID userId) implements Rotation {
        }

        /** Unknown, expired, revoked, or the account is gone. */
        record Rejected() implements Rotation {
        }
    }

    private final RefreshTokenRepository tokens;
    private final AccountRepository accounts;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public RefreshTokenService(RefreshTokenRepository tokens, AccountRepository accounts, TransactionTemplate tx, Clock clock) {
        this.tokens = tokens;
        this.accounts = accounts;
        this.tx = tx;
        this.clock = clock;
    }

    /** A first token for {@code userId}, starting a new family (a sign-in); the raw value is never stored. */
    public String issue(UUID userId) {
        return create(userId, UUID.randomUUID(), clock.instant());
    }

    public Rotation rotate(String raw) {
        if (raw == null || raw.isBlank()) {
            return new Rotation.Rejected();
        }
        return tx.execute(status -> {
            Instant now = clock.instant();
            Optional<RefreshTokenRepository.Stored> found = tokens.lockByHash(hash(raw));
            if (found.isEmpty()) {
                return new Rotation.Rejected();
            }
            RefreshTokenRepository.Stored stored = found.get();
            if (stored.rotatedAt() != null) {
                tokens.revokeFamily(stored.familyId(), now);
                log.atWarn().addKeyValue("event", "refresh_reuse").addKeyValue("userId", stored.userId().toString())
                        .log("refresh token reuse detected, family revoked");
                return new Rotation.Reuse(stored.userId());
            }
            if (stored.revokedAt() != null || !stored.expiresAt().isAfter(now)) {
                return new Rotation.Rejected();
            }
            Optional<Account> account = accounts.findActive(stored.userId());
            if (account.isEmpty()) {
                return new Rotation.Rejected();
            }
            String next = create(stored.userId(), stored.familyId(), now);
            tokens.markRotated(stored.id(), now);
            return new Rotation.Rotated(account.get(), next);
        });
    }

    /** Sign-out: revokes the presented token's whole family. An unknown or missing token is a no-op. */
    public void revokeFamilyOf(String raw) {
        if (raw == null || raw.isBlank()) {
            return;
        }
        tx.executeWithoutResult(status -> tokens.familyOf(hash(raw)).ifPresent(family -> tokens.revokeFamily(family, clock.instant())));
    }

    private String create(UUID userId, UUID familyId, Instant now) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        tokens.save(UUID.randomUUID(), userId, familyId, hash(raw), now.plus(TTL), now);
        return raw;
    }

    static String hash(String raw) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}

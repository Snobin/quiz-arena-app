package in.minnal.core.identity.infrastructure;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.RSAKey;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.interfaces.RSAPublicKey;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;

/**
 * core-service's JWT keys (AD-9): one active RSA signing key plus any extra public keys that are
 * published in the JWKS but never used to sign (key rotation: tokens signed by the previous key
 * keep verifying until they expire).
 *
 * <ul>
 *   <li>{@code minnal.jwt.signing-key} ({@code MINNAL_JWT_SIGNING_KEY}): base64 of a PKCS#8 PEM
 *       RSA key of at least 2048 bits.</li>
 *   <li>{@code minnal.jwt.key-id} ({@code MINNAL_JWT_KEY_ID}): its {@code kid}; when blank the
 *       RFC 7638 thumbprint of the key is used.</li>
 *   <li>{@code minnal.jwt.extra-public-keys} ({@code MINNAL_JWT_EXTRA_PUBLIC_KEYS}): comma-separated
 *       {@code kid=base64(SPKI PEM)} pairs.</li>
 * </ul>
 *
 * With no signing key, the {@code local}, {@code test} and {@code it} profiles get an ephemeral key
 * with a fresh {@code ephemeral-<uuid>} kid, ignoring any configured kid (a WARN is logged;
 * restarting core invalidates every guest token). Any other profile, and
 * {@code prod} always, fails at startup.
 */
public final class JwtSigningKeys {

    static final Set<String> EPHEMERAL_PROFILES = Set.of("local", "test", "it");

    private static final Logger log = LoggerFactory.getLogger(JwtSigningKeys.class);

    private final RSAKey signingKey;
    private final JWKSet publicJwkSet;

    JwtSigningKeys(RSAKey signingKey, List<RSAKey> extraPublicKeys) {
        Set<String> kids = new HashSet<>();
        List<JWK> published = new ArrayList<>();
        for (RSAKey key : prepend(signingKey.toPublicJWK(), extraPublicKeys)) {
            if (!kids.add(key.getKeyID())) {
                throw new IllegalStateException("JWT key id '" + key.getKeyID() + "' is used by more than one key");
            }
            published.add(key);
        }
        this.signingKey = signingKey;
        this.publicJwkSet = new JWKSet(published);
    }

    private static List<RSAKey> prepend(RSAKey first, List<RSAKey> rest) {
        List<RSAKey> all = new ArrayList<>(rest.size() + 1);
        all.add(first);
        all.addAll(rest);
        return all;
    }

    /** Loads the keys from configuration, applying the ephemeral and prod rules above. */
    public static JwtSigningKeys load(String signingKey, String keyId, String extraPublicKeys, Environment environment) {
        RSAKey active;
        if (isBlank(signingKey)) {
            if (environment.matchesProfiles("prod") || !environment.matchesProfiles(EPHEMERAL_PROFILES.toArray(String[]::new))) {
                throw new IllegalStateException("MINNAL_JWT_SIGNING_KEY (minnal.jwt.signing-key) is not set: core-service "
                        + "cannot sign guest tokens. Generate one with: openssl genpkey -algorithm RSA "
                        + "-pkeyopt rsa_keygen_bits:2048 | base64 | tr -d '\\n'");
            }
            // Always a fresh kid: resource servers cache keys by kid, so reusing a configured one would
            // keep the previous run's key in their cache and reject every new token.
            active = ephemeral("ephemeral-" + UUID.randomUUID());
            log.warn("MINNAL_JWT_SIGNING_KEY is not set: signing guest tokens with an ephemeral key (kid {}{}); "
                    + "every guest token becomes invalid when core-service restarts", active.getKeyID(),
                    isBlank(keyId) ? "" : ", MINNAL_JWT_KEY_ID '" + keyId.strip() + "' ignored");
        } else {
            PemKeys.RsaKeyPair pair = PemKeys.privateKey(signingKey, "MINNAL_JWT_SIGNING_KEY");
            active = rsaKey(pair.publicKey(), pair.privateKey(), keyId);
        }
        return new JwtSigningKeys(active, parseExtraPublicKeys(extraPublicKeys));
    }

    static List<RSAKey> parseExtraPublicKeys(String value) {
        List<RSAKey> keys = new ArrayList<>();
        if (isBlank(value)) {
            return keys;
        }
        for (String entry : value.split(",")) {
            if (entry.isBlank()) {
                continue;
            }
            int at = entry.indexOf('=');
            // Split on the first '=' only: base64 padding also uses '='.
            if (at <= 0 || entry.substring(0, at).isBlank()) {
                throw new IllegalStateException("MINNAL_JWT_EXTRA_PUBLIC_KEYS entries must be kid=base64(SPKI PEM)");
            }
            String kid = entry.substring(0, at).strip();
            RSAPublicKey key = PemKeys.publicKey(entry.substring(at + 1), "MINNAL_JWT_EXTRA_PUBLIC_KEYS[" + kid + "]");
            keys.add(rsaKey(key, null, kid));
        }
        return keys;
    }

    static RSAKey ephemeral(String keyId) {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(PemKeys.MIN_RSA_BITS);
            var pair = generator.generateKeyPair();
            return rsaKey((RSAPublicKey) pair.getPublic(), (RSAPrivateCrtKey) pair.getPrivate(), keyId);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("RSA key generation is unavailable", e);
        }
    }

    private static RSAKey rsaKey(RSAPublicKey publicKey, RSAPrivateCrtKey privateKey, String keyId) {
        RSAKey.Builder builder = new RSAKey.Builder(publicKey)
                .keyUse(KeyUse.SIGNATURE)
                .algorithm(JWSAlgorithm.RS256);
        if (privateKey != null) {
            builder.privateKey(privateKey);
        }
        if (isBlank(keyId)) {
            try {
                builder.keyIDFromThumbprint();
            } catch (JOSEException e) {
                throw new IllegalStateException("cannot compute the JWK thumbprint", e);
            }
        } else {
            builder.keyID(keyId.strip());
        }
        return builder.build();
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    /** The active key, private half included. Used only to sign. */
    public RSAKey signingKey() {
        return signingKey;
    }

    /** The {@code kid} the issued tokens carry. */
    public String activeKeyId() {
        return signingKey.getKeyID();
    }

    /** The public JWK Set: the active key first, then the extra keys. No private members. */
    public JWKSet publicJwkSet() {
        return publicJwkSet;
    }

    /** {@link #publicJwkSet()} as its JSON object (RFC 7517). */
    public Map<String, Object> publicJwkSetJson() {
        return publicJwkSet.toJSONObject(true);
    }
}

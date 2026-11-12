package in.minnal.game.platform.infrastructure.security;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import in.minnal.contracts.identity.MinnalClaims;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.UnaryOperator;

/**
 * A stand-in for core-service's JWKS: a JDK HTTP server on a random loopback port serving one RSA
 * public key, plus helpers that mint tokens the way core does (and ways it never would).
 */
final class TestJwks implements AutoCloseable {

    static final String PATH = "/api/core/v1/auth/jwks";

    private volatile RSAKey key;
    private final RSAKey stranger;
    private final AtomicInteger generation = new AtomicInteger(1);
    private final HttpServer server;
    private final AtomicInteger fetches = new AtomicInteger();

    private TestJwks() throws IOException, JOSEException {
        key = new RSAKeyGenerator(2048).keyID("test-key").keyUse(KeyUse.SIGNATURE).algorithm(JWSAlgorithm.RS256).generate();
        // Same kid, different key: a forged signature that the JWKS cannot verify.
        stranger = new RSAKeyGenerator(2048).keyID("test-key").generate();
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.createContext(PATH, exchange -> {
            fetches.incrementAndGet();
            byte[] body = new JWKSet(key.toPublicJWK()).toString(true).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        });
        server.start();
    }

    static TestJwks start() {
        try {
            return new TestJwks();
        } catch (IOException | JOSEException e) {
            throw new IllegalStateException(e);
        }
    }

    String uri() {
        return "http://" + server.getAddress().getHostString() + ":" + server.getAddress().getPort() + PATH;
    }

    int fetches() {
        return fetches.get();
    }

    /** Replaces the served key with a new one under a new kid (core restarted or rotated). */
    void rotate() {
        try {
            key = new RSAKeyGenerator(2048).keyID("test-key-" + generation.incrementAndGet()).keyUse(KeyUse.SIGNATURE)
                    .algorithm(JWSAlgorithm.RS256).generate();
        } catch (JOSEException e) {
            throw new IllegalStateException(e);
        }
    }

    String keyId() {
        return key.getKeyID();
    }

    static JWTClaimsSet.Builder guestClaims() {
        Instant now = Instant.now();
        return new JWTClaimsSet.Builder()
                .issuer(MinnalClaims.ISSUER)
                .subject(UUID.randomUUID().toString())
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plus(Duration.ofHours(24))))
                .claim(MinnalClaims.ROLES, List.of("GUEST"))
                .claim(MinnalClaims.NAME, "Guest 4821")
                .claim(MinnalClaims.LANG, "ml");
    }

    String token(UnaryOperator<JWTClaimsSet.Builder> claims) {
        return sign(key, claims.apply(guestClaims()).build());
    }

    String validToken() {
        return token(c -> c);
    }

    String forgedToken() {
        return sign(stranger, guestClaims().build());
    }

    /** A valid token whose payload was swapped after signing (roles escalated to ADMIN). */
    String tamperedToken() {
        String[] parts = validToken().split("\\.");
        String forged = sign(key, guestClaims().claim(MinnalClaims.ROLES, List.of("ADMIN")).build()).split("\\.")[1];
        return parts[0] + "." + forged + "." + parts[2];
    }

    String expiredToken() {
        Instant past = Instant.now().minus(Duration.ofHours(2));
        return token(c -> c.issueTime(Date.from(past.minus(Duration.ofHours(24)))).expirationTime(Date.from(past)));
    }

    private static String sign(RSAKey signer, JWTClaimsSet claims) {
        try {
            SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(signer.getKeyID()).build(), claims);
            jwt.sign(new RSASSASigner(signer));
            return jwt.serialize();
        } catch (JOSEException e) {
            throw new IllegalStateException(e);
        }
    }

    @Override
    public void close() {
        server.stop(0);
    }
}

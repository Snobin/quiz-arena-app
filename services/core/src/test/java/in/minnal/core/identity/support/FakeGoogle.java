package in.minnal.core.identity.support;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

/**
 * A fake Google OIDC provider (JWKS + token endpoint) on a local port: real Google is never called.
 * The token endpoint enforces PKCE (the code_verifier must hash to the challenge the test saw on the
 * authorization redirect) and answers with an ID token built by {@link #nextToken}.
 */
public final class FakeGoogle implements AutoCloseable {

    public static final String CLIENT_ID = "minnal-test-client";
    public static final String CLIENT_SECRET = "minnal-test-secret";
    public static final String ISSUER = "https://fake-issuer.test";

    private final HttpServer server;
    private final RSAKey key;
    private final RSAKey otherKey;

    private volatile String expectedChallenge;
    private volatile String nonce;
    private volatile Map<String, Object> claimOverrides = Map.of();
    private volatile boolean signWithOtherKey;
    private volatile boolean tokenEndpointFails;
    private volatile String lastCode;

    public FakeGoogle() {
        try {
            key = new RSAKeyGenerator(2048).keyID("fake-google").generate();
            otherKey = new RSAKeyGenerator(2048).keyID("fake-google").generate();
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        server.createContext("/jwks", exchange -> {
            byte[] body = new JWKSet(key.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.createContext("/token", exchange -> {
            String form = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            Map<String, String> params = new HashMap<>();
            for (String pair : form.split("&")) {
                int eq = pair.indexOf('=');
                params.put(URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
                        URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
            }
            lastCode = params.get("code");
            boolean ok = !tokenEndpointFails
                    && CLIENT_ID.equals(params.get("client_id"))
                    && CLIENT_SECRET.equals(params.get("client_secret"))
                    && "authorization_code".equals(params.get("grant_type"))
                    && params.get("code_verifier") != null
                    && s256(params.get("code_verifier")).equals(expectedChallenge);
            byte[] body = (ok ? "{\"id_token\":\"" + idToken() + "\",\"token_type\":\"Bearer\"}" : "{\"error\":\"invalid_grant\"}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(ok ? 200 : 400, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
    }

    public String base() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    public URI tokenUri() {
        return URI.create(base() + "/token");
    }

    public URI jwksUri() {
        return URI.create(base() + "/jwks");
    }

    /**
     * Prepares the next token exchange: the challenge and nonce come from the authorization redirect;
     * {@code claims} override the default valid claims (a null value removes the claim).
     */
    public void nextToken(String codeChallenge, String authNonce, Map<String, Object> claims) {
        this.expectedChallenge = codeChallenge;
        this.nonce = authNonce;
        this.claimOverrides = claims;
        this.signWithOtherKey = false;
        this.tokenEndpointFails = false;
    }

    public void signWithWrongKey() {
        this.signWithOtherKey = true;
    }

    public void failTokenEndpoint() {
        this.tokenEndpointFails = true;
    }

    public String lastCode() {
        return lastCode;
    }

    private String idToken() {
        Instant now = Instant.now();
        Map<String, Object> claims = new HashMap<>();
        claims.put("iss", ISSUER);
        claims.put("aud", CLIENT_ID);
        claims.put("sub", "google-subject-1");
        claims.put("iat", Date.from(now));
        claims.put("exp", Date.from(now.plusSeconds(300)));
        claims.put("nonce", nonce);
        claims.put("email", "anju@example.com");
        claims.put("email_verified", true);
        claims.put("given_name", "Anju");
        claimOverrides.forEach((k, v) -> {
            if (v == null) {
                claims.remove(k);
            } else {
                claims.put(k, v);
            }
        });
        JWTClaimsSet.Builder builder = new JWTClaimsSet.Builder();
        claims.forEach(builder::claim);
        try {
            RSAKey signer = signWithOtherKey ? otherKey : key;
            SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(signer.getKeyID()).type(JOSEObjectType.JWT).build(),
                    builder.build());
            jwt.sign(new RSASSASigner(signer));
            return jwt.serialize();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String s256(String verifier) {
        try {
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Override
    public void close() throws IOException {
        server.stop(0);
    }
}

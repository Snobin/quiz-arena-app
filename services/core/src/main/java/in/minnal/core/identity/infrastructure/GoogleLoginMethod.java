package in.minnal.core.identity.infrastructure;

import in.minnal.core.identity.application.ExternalIdentity;
import in.minnal.core.identity.application.LoginChallenge;
import in.minnal.core.identity.application.LoginMethod;
import in.minnal.core.identity.application.SignInFailedException;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Google OpenID Connect, authorization-code + PKCE (AD-9). The only class that knows Google: it builds
 * the authorization URL, exchanges the code server-side and verifies the ID token (signature against
 * Google's JWKS, {@code iss}, {@code aud}, {@code exp}, {@code nonce}).
 */
public class GoogleLoginMethod implements LoginMethod {

    public static final String PROVIDER = "GOOGLE";

    /** Endpoints and credentials; the endpoints are overridable so tests can point at a fake provider. */
    public record Settings(String clientId, String clientSecret, String redirectUri,
                           URI authorizationUri, URI tokenUri, URI jwksUri, String issuer) {
    }

    private final Settings settings;
    private final RestClient http;
    private final JwtDecoder decoder;

    public GoogleLoginMethod(Settings settings) {
        this.settings = settings;
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(Duration.ofSeconds(10));
        this.http = RestClient.builder().requestFactory(factory).build();
        NimbusJwtDecoder nimbus = NimbusJwtDecoder.withJwkSetUri(settings.jwksUri().toString())
                .jwsAlgorithm(SignatureAlgorithm.RS256).build();
        nimbus.setJwtValidator(validator());
        this.decoder = nimbus;
    }

    @Override
    public String provider() {
        return PROVIDER;
    }

    @Override
    public boolean configured() {
        return !settings.clientId().isBlank() && !settings.clientSecret().isBlank();
    }

    @Override
    public URI authorizationUri(LoginChallenge challenge) {
        return UriComponentsBuilder.fromUri(settings.authorizationUri())
                .queryParam("client_id", settings.clientId())
                .queryParam("redirect_uri", settings.redirectUri())
                .queryParam("response_type", "code")
                .queryParam("scope", "openid email profile")
                .queryParam("state", challenge.state())
                .queryParam("nonce", challenge.nonce())
                .queryParam("code_challenge", s256(challenge.codeVerifier()))
                .queryParam("code_challenge_method", "S256")
                .build().encode().toUri();
    }

    @Override
    public ExternalIdentity verify(String code, LoginChallenge challenge) {
        LinkedMultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("code", code);
        form.add("client_id", settings.clientId());
        form.add("client_secret", settings.clientSecret());
        form.add("redirect_uri", settings.redirectUri());
        form.add("code_verifier", challenge.codeVerifier());
        Map<String, Object> response;
        try {
            response = http.post().uri(settings.tokenUri()).contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form).retrieve().body(new ParameterizedTypeReference<>() {
                    });
        } catch (RuntimeException e) {
            throw new SignInFailedException("token exchange failed", e);
        }
        Object idToken = response == null ? null : response.get("id_token");
        if (!(idToken instanceof String raw) || raw.isBlank()) {
            throw new SignInFailedException("token response has no id_token");
        }
        Jwt jwt;
        try {
            jwt = decoder.decode(raw);
        } catch (RuntimeException e) {
            throw new SignInFailedException("id_token rejected: " + e.getMessage(), e);
        }
        String nonce = jwt.getClaimAsString("nonce");
        if (nonce == null || !MessageDigest.isEqual(nonce.getBytes(StandardCharsets.UTF_8), challenge.nonce().getBytes(StandardCharsets.UTF_8))) {
            throw new SignInFailedException("nonce mismatch");
        }
        String subject = jwt.getSubject();
        if (subject == null || subject.isBlank()) {
            throw new SignInFailedException("id_token has no subject");
        }
        return new ExternalIdentity(PROVIDER, subject, jwt.getClaimAsString("email"),
                emailVerified(jwt.getClaim("email_verified")), jwt.getClaimAsString("given_name"));
    }

    private static boolean emailVerified(Object claim) {
        return Boolean.TRUE.equals(claim) || "true".equals(claim);
    }

    private OAuth2TokenValidator<Jwt> validator() {
        Set<String> issuers = "https://accounts.google.com".equals(settings.issuer())
                ? Set.of(settings.issuer(), "accounts.google.com") : Set.of(settings.issuer());
        OAuth2TokenValidator<Jwt> claims = jwt -> {
            if (jwt.getExpiresAt() == null) {
                return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "missing exp", null));
            }
            String iss = jwt.getIssuer() == null ? jwt.getClaimAsString("iss") : jwt.getIssuer().toString();
            List<String> aud = jwt.getAudience();
            if (iss == null || !issuers.contains(iss)) {
                return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "wrong issuer", null));
            }
            if (aud == null || !aud.contains(settings.clientId())) {
                return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "wrong audience", null));
            }
            if (aud.size() > 1 && !settings.clientId().equals(jwt.getClaimAsString("azp"))) {
                return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "wrong authorized party", null));
            }
            return OAuth2TokenValidatorResult.success();
        };
        JwtTimestampValidator timestamps = new JwtTimestampValidator(Duration.ofSeconds(30));
        return token -> {
            OAuth2TokenValidatorResult first = timestamps.validate(token);
            return first.hasErrors() ? first : claims.validate(token);
        };
    }

    private static String s256(String verifier) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}

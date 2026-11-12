package in.minnal.core.identity.api;

import in.minnal.core.identity.infrastructure.JwtSigningKeys;
import java.time.Duration;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/core/v1/auth/jwks} (AD-9): the public JWK Set game-service and ratings-service
 * verify Minnal tokens against. Lists the active key and any extra (rotation) keys; never a private
 * member.
 */
@RestController
public class JwksController {

    private final JwtSigningKeys keys;

    public JwksController(JwtSigningKeys keys) {
        this.keys = keys;
    }

    @GetMapping(path = "/api/core/v1/auth/jwks", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> jwks() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic())
                .body(keys.publicJwkSetJson());
    }
}

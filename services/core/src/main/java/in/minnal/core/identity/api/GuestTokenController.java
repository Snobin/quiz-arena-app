package in.minnal.core.identity.api;

import in.minnal.core.identity.application.GuestToken;
import in.minnal.core.identity.application.GuestTokenService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code POST /api/core/v1/auth/guest {lang}} (AD-9): issues a 24 h guest JWT. Public (Caddy routes
 * {@code /api/core/*}); nothing about the guest is persisted. An unsupported {@code lang}, a missing
 * one or an unreadable body is a 400 Problem Details.
 */
@RestController
@RequestMapping("/api/core/v1/auth")
public class GuestTokenController {

    private final GuestTokenService guestTokens;

    public GuestTokenController(GuestTokenService guestTokens) {
        this.guestTokens = guestTokens;
    }

    @PostMapping(path = "/guest", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<GuestTokenResponse> guest(@RequestBody GuestTokenRequest request) {
        GuestToken token = guestTokens.issue(request.lang());
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new GuestTokenResponse(token.accessToken(), token.expiresAt()));
    }
}

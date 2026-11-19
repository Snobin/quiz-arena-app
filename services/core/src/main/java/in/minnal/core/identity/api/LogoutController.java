package in.minnal.core.identity.api;

import in.minnal.core.identity.application.AuthSettings;
import in.minnal.core.identity.application.RefreshTokenService;
import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code POST /api/core/v1/auth/logout} (AD-9): revokes the presented refresh token's family and clears the
 * cookie. Same CSRF guard as refresh. A missing or unknown cookie is still a 204 (already signed out).
 */
@RestController
@RequestMapping("/api/core/v1/auth")
public class LogoutController {

    private final RefreshTokenService refreshTokens;
    private final AuthSettings settings;

    public LogoutController(RefreshTokenService refreshTokens, AuthSettings settings) {
        this.refreshTokens = refreshTokens;
        this.settings = settings;
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(@CookieValue(name = RefreshController.REFRESH_COOKIE, required = false) String cookie,
                                    @RequestHeader(name = HttpHeaders.ORIGIN, required = false) String origin,
                                    @RequestHeader(name = RefreshController.GUARD_HEADER, required = false) String guard) {
        if (origin == null || !settings.corsOrigins().contains(origin) || !RefreshController.GUARD_VALUE.equals(guard)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).cacheControl(CacheControl.noStore())
                    .body(ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "Sign-out must come from the Minnal app."));
        }
        refreshTokens.revokeFamilyOf(cookie);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore())
                .header(HttpHeaders.SET_COOKIE, SignInController.refreshCookie(settings, "", Duration.ZERO).toString())
                .build();
    }
}

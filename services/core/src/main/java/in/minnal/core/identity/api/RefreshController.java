package in.minnal.core.identity.api;

import in.minnal.core.identity.application.AuthSettings;
import in.minnal.core.identity.application.GuestToken;
import in.minnal.core.identity.application.RefreshTokenService;
import in.minnal.core.identity.application.UserTokenService;
import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code POST /api/core/v1/auth/refresh} (AD-9): trades the refresh cookie for a 1 h access token and rotates the
 * cookie (family reuse detection; the Origin plus {@code X-Minnal-Auth} guard is a 403 otherwise). A dead
 * cookie is a 401 {@code reason: session_ended} (and is cleared), after which the client carries on as a guest.
 */
@RestController
@RequestMapping("/api/core/v1/auth")
public class RefreshController {

    static final String REFRESH_COOKIE = "minnal_refresh";
    static final String GUARD_HEADER = "X-Minnal-Auth";
    static final String GUARD_VALUE = "1";
    static final String SESSION_ENDED = "session_ended";

    private final RefreshTokenService refreshTokens;
    private final UserTokenService userTokens;
    private final AuthSettings settings;

    public RefreshController(RefreshTokenService refreshTokens, UserTokenService userTokens, AuthSettings settings) {
        this.refreshTokens = refreshTokens;
        this.userTokens = userTokens;
        this.settings = settings;
    }

    @PostMapping(path = "/refresh", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> refresh(@CookieValue(name = REFRESH_COOKIE, required = false) String cookie,
                                     @RequestHeader(name = HttpHeaders.ORIGIN, required = false) String origin,
                                     @RequestHeader(name = GUARD_HEADER, required = false) String guard,
                                     @RequestBody(required = false) RefreshRequest request) {
        // CSRF guard: only the PWA (right Origin plus the custom header a cross-site form cannot send).
        if (origin == null || !settings.corsOrigins().contains(origin) || !GUARD_VALUE.equals(guard)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).cacheControl(CacheControl.noStore())
                    .body(ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "Refresh must come from the Minnal app."));
        }
        // Validated before the token is rotated: a 400 must never consume the cookie.
        String lang = request == null || request.lang() == null ? "en" : request.lang();
        UserTokenService.requireSupported(lang);
        if (cookie == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).cacheControl(CacheControl.noStore())
                    .body(ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "Not signed in."));
        }
        RefreshTokenService.Rotation rotation = refreshTokens.rotate(cookie);
        if (!(rotation instanceof RefreshTokenService.Rotation.Rotated rotated)) {
            // Reuse, expired, revoked or unknown: the cookie is dead, and the client is told to sign in again.
            ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "Please sign in again.");
            problem.setProperty("reason", SESSION_ENDED);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).cacheControl(CacheControl.noStore())
                    .header(HttpHeaders.SET_COOKIE, SignInController.refreshCookie(settings, "", Duration.ZERO).toString())
                    .body(problem);
        }
        GuestToken token = userTokens.issue(rotated.account(), lang);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header(HttpHeaders.SET_COOKIE, SignInController.refreshCookie(settings, rotated.refreshToken(), RefreshTokenService.TTL).toString())
                .body(new AccessTokenResponse(token.accessToken(), token.expiresAt()));
    }
}

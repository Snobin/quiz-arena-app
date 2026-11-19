package in.minnal.core.identity.api;

import in.minnal.core.identity.application.SignInService;
import java.net.URI;
import java.time.Duration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import in.minnal.core.identity.application.AuthSettings;
import in.minnal.core.identity.application.RefreshTokenService;

/**
 * {@code GET /api/core/v1/auth/google/start?returnTo=} and {@code /google/callback} (AD-9): the
 * redirect flow. Whole-page navigations, so every outcome is a 302; nothing is ever put in a URL
 * except the in-app {@code to} path.
 */
@RestController
@RequestMapping("/api/core/v1/auth/google")
public class SignInController {

    static final String STATE_COOKIE = "minnal_oidc";
    static final String STATE_PATH = "/api/core/v1/auth/google";

    private final SignInService signIn;
    private final AuthSettings settings;

    public SignInController(SignInService signIn, AuthSettings settings) {
        this.signIn = signIn;
        this.settings = settings;
    }

    @GetMapping("/start")
    public ResponseEntity<?> start(@RequestParam(name = "returnTo", required = false) String returnTo) {
        if (!signIn.configured()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, "Google sign-in is not configured."));
        }
        SignInService.Started started = signIn.start(returnTo);
        ResponseCookie cookie = ResponseCookie.from(STATE_COOKIE, started.cookieValue())
                .httpOnly(true).secure(settings.cookieSecure()).sameSite("Lax")
                .path(STATE_PATH).maxAge(Duration.ofMinutes(10)).build();
        return ResponseEntity.status(HttpStatus.FOUND).location(started.location())
                .header(HttpHeaders.SET_COOKIE, cookie.toString()).header(HttpHeaders.CACHE_CONTROL, "no-store").build();
    }

    @GetMapping("/callback")
    public ResponseEntity<Void> callback(@RequestParam(name = "code", required = false) String code,
                                         @RequestParam(name = "state", required = false) String state,
                                         @RequestParam(name = "error", required = false) String error,
                                         @CookieValue(name = STATE_COOKIE, required = false) String stateCookie) {
        SignInService.Completed done = signIn.callback(code, state, error, stateCookie);
        ResponseEntity.BodyBuilder response = ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(done.location())).header(HttpHeaders.CACHE_CONTROL, "no-store");
        // The challenge is single-use: clear it whatever the outcome.
        response.header(HttpHeaders.SET_COOKIE, ResponseCookie.from(STATE_COOKIE, "").httpOnly(true)
                .secure(settings.cookieSecure()).sameSite("Lax").path(STATE_PATH).maxAge(0).build().toString());
        if (done.refreshToken() != null) {
            response.header(HttpHeaders.SET_COOKIE, refreshCookie(settings, done.refreshToken(), RefreshTokenService.TTL).toString());
        }
        return response.build();
    }

    static ResponseCookie refreshCookie(AuthSettings settings, String value, Duration maxAge) {
        return ResponseCookie.from(RefreshController.REFRESH_COOKIE, value)
                .httpOnly(true).secure(settings.cookieSecure()).sameSite("Strict")
                .path("/api/core/v1/auth").maxAge(maxAge).build();
    }
}

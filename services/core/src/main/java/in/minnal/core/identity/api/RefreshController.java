package in.minnal.core.identity.api;

import in.minnal.core.identity.application.Account;
import in.minnal.core.identity.application.AuthSettings;
import in.minnal.core.identity.application.GuestToken;
import in.minnal.core.identity.application.RefreshTokenService;
import in.minnal.core.identity.application.UserTokenService;
import java.time.Duration;
import java.util.Optional;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code POST /api/core/v1/auth/refresh} (AD-9): trades the refresh cookie for a 1 h access token. The
 * cookie is not rotated in this story. An unknown or expired cookie is a 401 (and is cleared), after
 * which the client carries on as a guest.
 */
@RestController
@RequestMapping("/api/core/v1/auth")
public class RefreshController {

    static final String REFRESH_COOKIE = "minnal_refresh";

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
                                     @RequestBody(required = false) RefreshRequest request) {
        Optional<Account> account = refreshTokens.resolve(cookie);
        if (account.isEmpty()) {
            ResponseEntity.BodyBuilder denied = ResponseEntity.status(HttpStatus.UNAUTHORIZED).cacheControl(CacheControl.noStore());
            if (cookie != null) {
                denied.header(HttpHeaders.SET_COOKIE, SignInController.refreshCookie(settings, "", Duration.ZERO).toString());
            }
            return denied.body(ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "Not signed in."));
        }
        String lang = request == null || request.lang() == null ? "en" : request.lang();
        GuestToken token = userTokens.issue(account.get(), lang);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(new AccessTokenResponse(token.accessToken(), token.expiresAt()));
    }
}

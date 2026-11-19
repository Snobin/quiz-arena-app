package in.minnal.core.identity.application;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * The sign-in redirect flow (AD-9): {@code start} builds the challenge and the provider URL;
 * {@code callback} checks it, verifies the identity, creates or resumes the account and decides where
 * the browser goes next. It knows {@link LoginMethod}, never Google.
 */
@Service
public class SignInService {

    private static final Logger log = LoggerFactory.getLogger(SignInService.class);

    private final LoginMethod login;
    private final AccountService accounts;
    private final RefreshTokenService refreshTokens;
    private final AuthSettings settings;
    private final SecureRandom random = new SecureRandom();

    public SignInService(LoginMethod login, AccountService accounts, RefreshTokenService refreshTokens, AuthSettings settings) {
        this.login = login;
        this.accounts = accounts;
        this.refreshTokens = refreshTokens;
        this.settings = settings;
    }

    /** Where to send the browser, and the cookie value that must come back on the callback. */
    public record Started(URI location, String cookieValue) {
    }

    /** Where to send the browser; {@code refreshToken} is set only on success. */
    public record Completed(String location, String refreshToken) {
    }

    public boolean configured() {
        return login.configured();
    }

    public Started start(String returnTo) {
        String safeReturn = ReturnPath.safe(returnTo);
        LoginChallenge challenge = new LoginChallenge(token(), token(), token());
        String cookie = String.join(".", challenge.state(), challenge.nonce(), challenge.codeVerifier(),
                Base64.getUrlEncoder().withoutPadding().encodeToString(safeReturn.getBytes(StandardCharsets.UTF_8)));
        return new Started(login.authorizationUri(challenge), cookie);
    }

    public Completed callback(String code, String state, String error, String cookieValue) {
        String[] parts = cookieValue == null ? new String[0] : cookieValue.split("\\.", -1);
        boolean cookieOk = parts.length == 4;
        String returnTo = "/";
        if (cookieOk) {
            try {
                returnTo = ReturnPath.safe(new String(Base64.getUrlDecoder().decode(parts[3]), StandardCharsets.UTF_8));
            } catch (IllegalArgumentException e) {
                cookieOk = false;
            }
        }
        if ("access_denied".equals(error)) {
            return back(returnTo, "cancelled");
        }
        if (error != null || !cookieOk || code == null || code.isBlank() || state == null
                || !MessageDigest.isEqual(parts[0].getBytes(StandardCharsets.UTF_8), state.getBytes(StandardCharsets.UTF_8))) {
            return back(returnTo, "failed");
        }
        try {
            ExternalIdentity identity = login.verify(code, new LoginChallenge(parts[0], parts[1], parts[2]));
            Account account = accounts.signIn(identity);
            String refresh = refreshTokens.issue(account.id());
            String to = URLEncoder.encode(returnTo, StandardCharsets.UTF_8).replace("%2F", "/");
            return new Completed(settings.webUrlFor("/auth/return?to=" + to), refresh);
        } catch (RuntimeException e) {
            log.warn("sign-in failed: {}", e.toString());
            return back(returnTo, "failed");
        }
    }

    private Completed back(String returnTo, String outcome) {
        return new Completed(settings.webUrlFor(ReturnPath.withQuery(returnTo, "signin", outcome)), null);
    }

    private String token() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}

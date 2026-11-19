package in.minnal.core.identity.application;

import java.net.URI;

/**
 * One way to sign in (FR1). Token issuing, account creation and refresh only ever see the
 * {@link ExternalIdentity} it returns, so another method (phone OTP) can be added without touching them.
 */
public interface LoginMethod {

    /** Stored in {@code user_identity.provider}, e.g. {@code GOOGLE}. */
    String provider();

    /** True when the deployment has the settings this method needs. */
    boolean configured();

    /** Where to send the browser to authenticate. */
    URI authorizationUri(LoginChallenge challenge);

    /** Exchanges the callback {@code code} and returns the verified identity; throws {@link SignInFailedException}. */
    ExternalIdentity verify(String code, LoginChallenge challenge);
}

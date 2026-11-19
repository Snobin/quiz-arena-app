package in.minnal.core.identity.application;

/** A login method could not verify the external identity (bad code, signature, audience, nonce...). */
public class SignInFailedException extends RuntimeException {

    public SignInFailedException(String message) {
        super(message);
    }

    public SignInFailedException(String message, Throwable cause) {
        super(message, cause);
    }
}

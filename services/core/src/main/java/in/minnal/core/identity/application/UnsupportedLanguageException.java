package in.minnal.core.identity.application;

/** A guest-token request whose {@code lang} is not {@code ml} or {@code en}. */
public class UnsupportedLanguageException extends RuntimeException {

    public UnsupportedLanguageException() {
        super("lang must be \"ml\" or \"en\"");
    }
}

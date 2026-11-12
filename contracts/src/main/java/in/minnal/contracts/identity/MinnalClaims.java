package in.minnal.contracts.identity;

/**
 * Claim names and the issuer of a Minnal access JWT (AD-9). The standard claims ({@code iss},
 * {@code sub}, {@code iat}, {@code exp}) keep their RFC 7519 names; these are the Minnal ones.
 */
public final class MinnalClaims {

    /** The {@code iss} value of every Minnal access token. */
    public static final String ISSUER = "minnal-core";

    /** Array of {@link Role} names, e.g. {@code ["GUEST"]}. */
    public static final String ROLES = "roles";

    /** Display name, e.g. {@code "Guest 4821"}. Never inflected. */
    public static final String NAME = "name";

    /** UI / question language: {@code ml} or {@code en}. */
    public static final String LANG = "lang";

    private MinnalClaims() {
    }
}

package in.minnal.core.identity.application;

import java.net.URI;
import java.net.URISyntaxException;

/** The {@code returnTo} guard: only a relative in-app path survives, so sign-in is never an open redirect. */
public final class ReturnPath {

    private ReturnPath() {
    }

    /** {@code value} when it is a single-slash relative path, else {@code "/"}. */
    public static String safe(String value) {
        if (value == null || value.length() > 512 || !value.startsWith("/") || value.startsWith("//")) {
            return "/";
        }
        try {
            URI uri = new URI(value);
            if (uri.getScheme() != null || uri.getAuthority() != null || uri.getRawPath() == null
                    || !uri.getRawPath().startsWith("/") || uri.getRawPath().startsWith("//")) {
                return "/";
            }
            // Never return to the sign-in plumbing itself (it would loop).
            String path = uri.getRawPath();
            return path.equals("/auth/return") || path.startsWith("/auth/return/") ? "/" : value;
        } catch (URISyntaxException e) {
            // Backslashes, spaces and control characters do not parse; browsers would normalise them.
            return "/";
        }
    }

    /** {@code path} with {@code key=value} added to its query (before any fragment). */
    public static String withQuery(String path, String key, String value) {
        int hash = path.indexOf('#');
        String fragment = hash < 0 ? "" : path.substring(hash);
        String base = hash < 0 ? path : path.substring(0, hash);
        return base + (base.contains("?") ? "&" : "?") + key + "=" + value + fragment;
    }
}

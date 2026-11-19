package in.minnal.core.identity.application;

import java.net.URI;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Sign-in settings, all from the environment. {@code webUrl} is the PWA's public URL (where the browser
 * is sent after sign-in); {@code corsOrigins} are the browser origins allowed to call refresh with cookies.
 */
public record AuthSettings(URI webUrl, boolean cookieSecure, Set<String> adminEmails, List<String> corsOrigins) {

    public boolean isAdminEmail(String email) {
        return email != null && adminEmails.contains(email.trim().toLowerCase(Locale.ROOT));
    }

    /** {@code https://host[:port]} of the PWA. */
    public String webOrigin() {
        int port = webUrl.getPort();
        return webUrl.getScheme() + "://" + webUrl.getHost() + (port == -1 ? "" : ":" + port);
    }

    /** The PWA URL for an in-app path, honouring a non-root base path in {@code webUrl}. */
    public String webUrlFor(String path) {
        String base = webUrl.getPath() == null ? "" : webUrl.getPath().replaceAll("/+$", "");
        return webOrigin() + base + path;
    }
}

package in.minnal.ratings.platform.infrastructure.security;

import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Test-only protected endpoint: echoes the principal taken from the token. */
@RestController
class WhoAmITestController {

    @GetMapping("/api/ratings/v1/test/whoami")
    Map<String, Object> whoami(@AuthenticationPrincipal MinnalPrincipal principal) {
        return Map.of("sub", principal.sub(), "roles", principal.roles(), "name", principal.name(), "lang", principal.lang());
    }
}

package in.minnal.core.profile.api;

import in.minnal.core.identity.infrastructure.BearerAuthenticator;
import in.minnal.core.profile.application.InvalidProfileException;
import in.minnal.core.profile.application.ProfileRequest;
import in.minnal.core.profile.application.ProfileService;
import in.minnal.core.profile.application.ProfileView;
import in.minnal.core.profile.domain.FieldError;
import java.util.List;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * {@code GET|PUT /api/core/v1/me/profile} (FR6): the signed-in player's profile. USER or ADMIN token
 * only (a guest gets 403, no token 401); an invalid {@code PUT} is a 400 with field-level errors.
 */
@RestController
@RequestMapping("/api/core/v1/me/profile")
public class ProfileController {

    private final BearerAuthenticator auth;
    private final ProfileService profiles;

    public ProfileController(BearerAuthenticator auth, ProfileService profiles) {
        this.auth = auth;
        this.profiles = profiles;
    }

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ProfileView> get(@RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        BearerAuthenticator.Caller caller = auth.requireRegistered(authorization);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(profiles.view(caller.userId()));
    }

    @PutMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ProfileView> put(@RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
                                           @RequestBody ProfileRequest request) {
        BearerAuthenticator.Caller caller = auth.requireRegistered(authorization);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(profiles.save(caller.userId(), request));
    }

    @RestControllerAdvice(assignableTypes = ProfileController.class)
    static class Errors {

        @ExceptionHandler(BearerAuthenticator.Rejected.class)
        ProblemDetail rejected(BearerAuthenticator.Rejected e) {
            return ProblemDetail.forStatusAndDetail(e.status(), e.getMessage());
        }

        @ExceptionHandler(InvalidProfileException.class)
        ProblemDetail invalid(InvalidProfileException e) {
            ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Some fields need fixing.");
            List<Map<String, String>> errors = e.errors().stream().map(Errors::map).toList();
            problem.setProperty("errors", errors);
            return problem;
        }

        private static Map<String, String> map(FieldError error) {
            return Map.of("field", error.field(), "code", error.code(), "message", error.message());
        }
    }
}

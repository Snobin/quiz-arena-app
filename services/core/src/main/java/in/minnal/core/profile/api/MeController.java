package in.minnal.core.profile.api;

import in.minnal.core.identity.infrastructure.BearerAuthenticator;
import in.minnal.core.profile.application.AccountDeletionService;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** {@code DELETE /api/core/v1/me}: deletes the signed-in player's account (204). A guest token is 403. */
@RestController
@RequestMapping("/api/core/v1/me")
public class MeController {

    private final BearerAuthenticator auth;
    private final AccountDeletionService deletion;

    public MeController(BearerAuthenticator auth, AccountDeletionService deletion) {
        this.auth = auth;
        this.deletion = deletion;
    }

    @DeleteMapping
    public ResponseEntity<Void> delete(@RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        BearerAuthenticator.Caller caller = auth.requireRegistered(authorization);
        deletion.delete(caller.userId());
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @RestControllerAdvice(assignableTypes = MeController.class)
    static class Errors {

        @ExceptionHandler(BearerAuthenticator.Rejected.class)
        ProblemDetail rejected(BearerAuthenticator.Rejected e) {
            return ProblemDetail.forStatusAndDetail(e.status(), e.getMessage());
        }
    }
}

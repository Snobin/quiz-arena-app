package in.minnal.core.profile.api;

import in.minnal.core.identity.infrastructure.BearerAuthenticator;
import in.minnal.core.platform.infrastructure.ratelimit.RateLimitPolicy;
import in.minnal.core.platform.infrastructure.ratelimit.RateLimiter;
import in.minnal.core.question.application.TopicCatalogueService;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/** Story 4.1: the signed-in player's recent topics. Registered only (guest 403, no token 401); the PUT is rate-limited per player. */
@RestController
@RequestMapping("/api/core/v1/me/recent-topics")
public class RecentTopicsController {

    private final BearerAuthenticator auth;
    private final RateLimiter limiter;
    private final TopicCatalogueService service;

    public RecentTopicsController(BearerAuthenticator auth, RateLimiter limiter, TopicCatalogueService service) {
        this.auth = auth;
        this.limiter = limiter;
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<TopicCatalogueService.RecentTopic>> recent(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        BearerAuthenticator.Caller caller = auth.requireRegistered(authorization);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.recent(caller.userId()));
    }

    @PutMapping("/{topicId}")
    public ResponseEntity<Void> use(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable UUID topicId) {
        BearerAuthenticator.Caller caller = auth.requireRegistered(authorization);
        RateLimiter.Decision decision = limiter.tryAcquire(RateLimitPolicy.RECENT_TOPIC, caller.userId().toString());
        if (!decision.allowed()) {
            return problem(HttpStatus.TOO_MANY_REQUESTS, "Too many requests. Try again later.", Math.max(1, decision.retryAfterSeconds()));
        }
        if (!service.markUsed(caller.userId(), topicId)) {
            return problem(HttpStatus.NOT_FOUND, "Topic not found.", 0);
        }
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    private static <T> ResponseEntity<T> problem(HttpStatus status, String detail, long retryAfter) {
        throw new Problem(status, detail, retryAfter);
    }

    static class Problem extends RuntimeException {
        final HttpStatus status;
        final long retryAfter;

        Problem(HttpStatus status, String detail, long retryAfter) {
            super(detail);
            this.status = status;
            this.retryAfter = retryAfter;
        }
    }

    /** RFC 9457 Problem Details: 400, 401, 403, 404, 429. */
    @RestControllerAdvice(assignableTypes = RecentTopicsController.class)
    static class Errors {

        @ExceptionHandler(BearerAuthenticator.Rejected.class)
        ResponseEntity<ProblemDetail> rejected(BearerAuthenticator.Rejected e) {
            return respond(e.status(), e.getMessage(), 0);
        }

        @ExceptionHandler(Problem.class)
        ResponseEntity<ProblemDetail> problem(Problem e) {
            return respond(e.status, e.getMessage(), e.retryAfter);
        }

        @ExceptionHandler(MethodArgumentTypeMismatchException.class)
        ResponseEntity<ProblemDetail> unreadable(Exception e) {
            return respond(HttpStatus.BAD_REQUEST, "The request is not valid.", 0);
        }

        private static ResponseEntity<ProblemDetail> respond(HttpStatus status, String detail, long retryAfter) {
            ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
            problem.setType(URI.create("urn:minnal:problem:" + status.name().toLowerCase().replace('_', '-')));
            ResponseEntity.BodyBuilder response = ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON);
            if (retryAfter > 0) {
                response.header(HttpHeaders.RETRY_AFTER, Long.toString(retryAfter));
            }
            return response.body(problem);
        }
    }
}

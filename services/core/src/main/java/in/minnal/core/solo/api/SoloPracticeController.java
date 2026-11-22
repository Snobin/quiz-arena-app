package in.minnal.core.solo.api;

import in.minnal.core.identity.infrastructure.BearerAuthenticator;
import in.minnal.core.platform.infrastructure.ratelimit.RateLimitPolicy;
import in.minnal.core.platform.infrastructure.ratelimit.RateLimiter;
import in.minnal.core.solo.application.SoloException;
import in.minnal.core.solo.application.SoloPracticeService;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * Story 4.3: Solo Practice. Registered players only (guest 403, no token 401); starting and answering are rate-limited
 * per player. A session of another player, or an expired one, is 404.
 */
@RestController
@RequestMapping("/api/core/v1/solo/sessions")
public class SoloPracticeController {

    /** {@code source} is tagged: {@code type} plus its type-specific id. */
    public record SourceRequest(String type, UUID topicId, UUID customTopicId) {
    }

    public record StartRequest(SourceRequest source) {
    }

    public record AnswerRequest(UUID questionId, Integer version, Integer optionIndex) {
    }

    private final BearerAuthenticator auth;
    private final RateLimiter limiter;
    private final SoloPracticeService service;

    public SoloPracticeController(BearerAuthenticator auth, RateLimiter limiter, SoloPracticeService service) {
        this.auth = auth;
        this.limiter = limiter;
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<SoloPracticeService.Started> start(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestBody(required = false) StartRequest body) {
        BearerAuthenticator.Caller caller = auth.requireRegistered(authorization);
        limit(RateLimitPolicy.SOLO_START, caller);
        if (body == null || body.source() == null) {
            throw new SoloException(SoloException.Kind.INVALID, "source is required.");
        }
        SoloPracticeService.Started started = service.start(caller.userId(), body.source().type(),
                "CUSTOM".equals(body.source().type()) ? body.source().customTopicId() : body.source().topicId());
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(started);
    }

    @GetMapping("/{sessionId}/next")
    public ResponseEntity<SoloPracticeService.Next> next(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable UUID sessionId) {
        BearerAuthenticator.Caller caller = auth.requireRegistered(authorization);
        limit(RateLimitPolicy.SOLO_ANSWER, caller);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.next(caller.userId(), sessionId));
    }

    @PostMapping("/{sessionId}/answers")
    public ResponseEntity<SoloPracticeService.AnswerResult> answer(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable UUID sessionId, @RequestBody(required = false) AnswerRequest body) {
        BearerAuthenticator.Caller caller = auth.requireRegistered(authorization);
        limit(RateLimitPolicy.SOLO_ANSWER, caller);
        if (body == null || body.questionId() == null || body.version() == null || body.optionIndex() == null) {
            throw new SoloException(SoloException.Kind.INVALID, "questionId, version and optionIndex are required.");
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.answer(caller.userId(), sessionId, body.questionId(), body.version(), body.optionIndex()));
    }

    @PostMapping("/{sessionId}/end")
    public ResponseEntity<SoloPracticeService.Summary> end(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable UUID sessionId) {
        BearerAuthenticator.Caller caller = auth.requireRegistered(authorization);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.end(caller.userId(), sessionId));
    }

    private void limit(RateLimitPolicy policy, BearerAuthenticator.Caller caller) {
        RateLimiter.Decision decision = limiter.tryAcquire(policy, caller.userId().toString());
        if (!decision.allowed()) {
            throw new SoloException(SoloException.Kind.RATE_LIMITED, "Too many requests. Try again later.",
                    Math.max(1, decision.retryAfterSeconds()));
        }
    }

    /** RFC 9457 Problem Details: 400, 401, 403, 404, 409, 422 (topic-unavailable), 429. */
    @RestControllerAdvice(assignableTypes = SoloPracticeController.class)
    static class Errors {

        @ExceptionHandler(BearerAuthenticator.Rejected.class)
        ResponseEntity<ProblemDetail> rejected(BearerAuthenticator.Rejected e) {
            return respond(e.status(), null, e.getMessage(), 0);
        }

        @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
        ResponseEntity<ProblemDetail> unreadable(Exception e) {
            return respond(HttpStatus.BAD_REQUEST, null, "The request is not valid.", 0);
        }

        @ExceptionHandler(SoloException.class)
        ResponseEntity<ProblemDetail> solo(SoloException e) {
            return switch (e.kind()) {
                case INVALID -> respond(HttpStatus.BAD_REQUEST, null, e.getMessage(), 0);
                case NOT_FOUND -> respond(HttpStatus.NOT_FOUND, null, e.getMessage(), 0);
                case CONFLICT -> respond(HttpStatus.CONFLICT, null, e.getMessage(), 0);
                case TOPIC_UNAVAILABLE -> respond(HttpStatus.UNPROCESSABLE_CONTENT, "topic-unavailable", e.getMessage(), 0);
                case TOPIC_CHANGED -> respond(HttpStatus.CONFLICT, "topic-changed", e.getMessage(), 0);
                case TOPIC_DELETED -> respond(HttpStatus.NOT_FOUND, "topic-deleted", e.getMessage(), 0);
                case RATE_LIMITED -> respond(HttpStatus.TOO_MANY_REQUESTS, null, e.getMessage(), e.retryAfterSeconds());
            };
        }

        private static ResponseEntity<ProblemDetail> respond(HttpStatus status, String type, String detail, long retryAfter) {
            ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
            problem.setType(URI.create("urn:minnal:problem:" + (type != null ? type : status.name().toLowerCase().replace('_', '-'))));
            ResponseEntity.BodyBuilder response = ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON)
                    .cacheControl(CacheControl.noStore());
            if (retryAfter > 0) {
                response.header(HttpHeaders.RETRY_AFTER, Long.toString(retryAfter));
            }
            return response.body(problem);
        }
    }
}

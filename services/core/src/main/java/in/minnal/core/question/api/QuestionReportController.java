package in.minnal.core.question.api;

import in.minnal.core.identity.infrastructure.BearerAuthenticator;
import in.minnal.core.platform.infrastructure.ratelimit.RateLimitPolicy;
import in.minnal.core.platform.infrastructure.ratelimit.RateLimiter;
import in.minnal.core.question.application.AdminWriteException;
import in.minnal.core.question.application.QuestionReportRequest;
import in.minnal.core.question.application.QuestionReportService;
import in.minnal.core.question.domain.FieldError;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * Story 3.5: {@code POST /api/core/v1/questions/{questionId}/versions/{version}/reports}. Registered players
 * only (guest 403, no token 401), rate-limited per player. Not an admin endpoint.
 */
@RestController
@RequestMapping("/api/core/v1/questions/{questionId}/versions/{version}/reports")
public class QuestionReportController {

    private static final Logger LOG = LoggerFactory.getLogger(QuestionReportController.class);

    /** The created report. */
    public record Created(UUID reportId) {
    }

    private final BearerAuthenticator auth;
    private final RateLimiter limiter;
    private final QuestionReportService service;

    public QuestionReportController(BearerAuthenticator auth, RateLimiter limiter, QuestionReportService service) {
        this.auth = auth;
        this.limiter = limiter;
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<Created> report(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable UUID questionId, @PathVariable int version,
            @RequestBody(required = false) QuestionReportRequest body) {
        BearerAuthenticator.Caller caller = auth.requireRegistered(authorization);
        RateLimiter.Decision decision = limiter.tryAcquire(RateLimitPolicy.QUESTION_REPORT, caller.userId().toString());
        if (!decision.allowed()) {
            LOG.atInfo().addKeyValue("userId", caller.userId()).addKeyValue("route", "questions.reports.create").log("report rate limited");
            throw AdminWriteException.rateLimited(decision.retryAfterSeconds());
        }
        UUID id = service.report(caller.userId(), questionId, version, body);
        LOG.atInfo().addKeyValue("userId", caller.userId()).addKeyValue("route", "questions.reports.create").log("question reported");
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(new Created(id));
    }

    /** RFC 9457 Problem Details for this endpoint: 400 (with {@code errors[]}), 401, 403, 404, 409, 429. */
    @RestControllerAdvice(assignableTypes = QuestionReportController.class)
    static class Errors {

        @ExceptionHandler(BearerAuthenticator.Rejected.class)
        ResponseEntity<ProblemDetail> rejected(BearerAuthenticator.Rejected e) {
            return respond(e.status(), e.getMessage(), List.of(), 0);
        }

        @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
        ResponseEntity<ProblemDetail> unreadable(Exception e) {
            return respond(HttpStatus.BAD_REQUEST, "The request is not valid.", List.of(), 0);
        }

        @ExceptionHandler(AdminWriteException.class)
        ResponseEntity<ProblemDetail> write(AdminWriteException e) {
            HttpStatus status = switch (e.kind()) {
                case INVALID -> HttpStatus.BAD_REQUEST;
                case NOT_FOUND -> HttpStatus.NOT_FOUND;
                case CONFLICT -> HttpStatus.CONFLICT;
                case RATE_LIMITED -> HttpStatus.TOO_MANY_REQUESTS;
                case INTERNAL -> HttpStatus.INTERNAL_SERVER_ERROR;
            };
            return respond(status, e.getMessage(), e.errors(), e.kind() == AdminWriteException.Kind.RATE_LIMITED ? Math.max(1, e.retryAfterSeconds()) : 0);
        }

        private static ResponseEntity<ProblemDetail> respond(HttpStatus status, String detail, List<FieldError> errors, long retryAfter) {
            ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
            problem.setType(URI.create("urn:minnal:problem:" + status.name().toLowerCase().replace('_', '-')));
            if (!errors.isEmpty()) {
                List<Map<String, String>> items = new ArrayList<>();
                for (FieldError error : errors) {
                    Map<String, String> item = new LinkedHashMap<>();
                    item.put("field", error.field());
                    item.put("problem", error.problem());
                    if (error.fix() != null) {
                        item.put("fix", error.fix());
                    }
                    items.add(item);
                }
                problem.setProperty("errors", items);
            }
            ResponseEntity.BodyBuilder response = ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON);
            if (retryAfter > 0) {
                response.header(HttpHeaders.RETRY_AFTER, Long.toString(retryAfter));
            }
            return response.body(problem);
        }
    }
}

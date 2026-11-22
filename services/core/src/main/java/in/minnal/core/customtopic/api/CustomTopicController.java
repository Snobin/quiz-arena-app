package in.minnal.core.customtopic.api;

import in.minnal.core.customtopic.application.CustomTopicException;
import in.minnal.core.customtopic.application.CustomTopicLimits;
import in.minnal.core.customtopic.application.CustomTopicService;
import in.minnal.core.identity.infrastructure.BearerAuthenticator;
import in.minnal.core.platform.infrastructure.ratelimit.RateLimitPolicy;
import in.minnal.core.platform.infrastructure.ratelimit.RateLimiter;
import in.minnal.core.profile.application.ProfileRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.net.URI;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Story 6.1: a registered player's private custom topics. USER only (guest 403, no token 401), with a saved profile
 * (403 PROFILE_REQUIRED). The import is rate-limited per player; a rejected import gives its token back.
 */
@RestController
@RequestMapping("/api/core/v1/me/custom-topics")
public class CustomTopicController {

    private static final Logger LOG = LoggerFactory.getLogger(CustomTopicController.class);

    /** The request body: the topic name and the raw pasted text. */
    record ImportRequest(String name, String json) {
    }

    private final BearerAuthenticator auth;
    private final RateLimiter limiter;
    private final ProfileRepository profiles;
    private final CustomTopicService service;
    private final CustomTopicLimits limits;
    private final JsonMapper mapper;

    public CustomTopicController(BearerAuthenticator auth, RateLimiter limiter, ProfileRepository profiles,
            CustomTopicService service, CustomTopicLimits limits, JsonMapper mapper) {
        this.auth = auth;
        this.limiter = limiter;
        this.profiles = profiles;
        this.service = service;
        this.limits = limits;
        this.mapper = mapper;
    }

    @PostMapping
    public ResponseEntity<CustomTopicService.ImportResult> create(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            HttpServletRequest request) {
        BearerAuthenticator.Caller caller = caller(authorization);
        acquire(caller);
        try {
            ImportRequest body = read(request);
            CustomTopicService.ImportResult result = service.importTopic(caller.userId(), body.name(), body.json());
            LOG.atInfo().addKeyValue("userId", caller.userId()).addKeyValue("route", "custom-topics.create")
                    .addKeyValue("questions", result.questionCount()).log("custom topic imported");
            return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(result);
        } catch (CustomTopicException e) {
            if (e.callerMistake()) {
                refund(caller);
            }
            throw e;
        }
    }

    @GetMapping("/usage")
    public ResponseEntity<CustomTopicService.UsageView> usage(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        BearerAuthenticator.Caller caller = caller(authorization);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.usage(caller.userId()));
    }

    private BearerAuthenticator.Caller caller(String authorization) {
        BearerAuthenticator.Caller caller = auth.requireRegistered(authorization);
        if (profiles.find(caller.userId()).isEmpty()) {
            throw CustomTopicException.profileRequired();
        }
        return caller;
    }

    /** Fails closed: if the limiter store is down the import is refused with a 503. */
    private void acquire(BearerAuthenticator.Caller caller) {
        RateLimiter.Decision decision;
        try {
            decision = limiter.tryAcquire(RateLimitPolicy.CUSTOM_IMPORT, caller.userId().toString());
        } catch (RuntimeException e) {
            LOG.atError().setCause(e).addKeyValue("route", "custom-topics.create").log("rate limiter unavailable");
            throw CustomTopicException.unavailable();
        }
        if (!decision.allowed()) {
            LOG.atInfo().addKeyValue("userId", caller.userId()).addKeyValue("route", "custom-topics.create").log("custom import rate limited");
            throw CustomTopicException.rateLimited(decision.retryAfterSeconds());
        }
    }

    private void refund(BearerAuthenticator.Caller caller) {
        try {
            limiter.refund(RateLimitPolicy.CUSTOM_IMPORT, caller.userId().toString());
        } catch (RuntimeException e) {
            LOG.atWarn().setCause(e).addKeyValue("route", "custom-topics.create").log("rate limit refund failed");
        }
    }

    /** Reads at most the size cap plus one byte, so an oversize paste is refused without being loaded. */
    private ImportRequest read(HttpServletRequest request) {
        int max = limits.maxBodyBytes();
        if (request.getContentLengthLong() > max) {
            throw CustomTopicException.tooLarge();
        }
        byte[] bytes;
        try {
            bytes = request.getInputStream().readNBytes(max + 1);
        } catch (IOException e) {
            throw CustomTopicException.invalid("The request could not be read. Try again.");
        }
        if (bytes.length > max) {
            throw CustomTopicException.tooLarge();
        }
        try {
            ImportRequest body = mapper.readValue(bytes, ImportRequest.class);
            if (body == null || body.json() == null) {
                throw CustomTopicException.invalid("Send {\"name\": ..., \"json\": ...} with the pasted text in \"json\".");
            }
            return body;
        } catch (JacksonException e) {
            throw CustomTopicException.invalid("Send {\"name\": ..., \"json\": ...} with the pasted text in \"json\".");
        }
    }

    /** RFC 9457 Problem Details: 400 (with {@code errors[]}), 401, 403, 413, 422, 429, 500, 503. */
    @RestControllerAdvice(assignableTypes = CustomTopicController.class)
    static class Errors {

        @ExceptionHandler(BearerAuthenticator.Rejected.class)
        ResponseEntity<ProblemDetail> rejected(BearerAuthenticator.Rejected e) {
            return respond(e.status(), e.status().name().toLowerCase().replace('_', '-'), e.getMessage(), null, 0, null);
        }

        @ExceptionHandler(CustomTopicException.class)
        ResponseEntity<ProblemDetail> failed(CustomTopicException e) {
            String code = e.type().equals("profile-required") ? "PROFILE_REQUIRED" : null;
            return respond(e.status(), e.type(), e.getMessage(), e.errors().isEmpty() ? null : e.errors(), e.retryAfterSeconds(), code);
        }

        private static ResponseEntity<ProblemDetail> respond(HttpStatus status, String type, String detail, Object errors, long retryAfter, String code) {
            ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
            problem.setType(URI.create("urn:minnal:problem:" + type));
            if (errors != null) {
                problem.setProperty("errors", errors);
            }
            if (code != null) {
                problem.setProperty("code", code);
            }
            ResponseEntity.BodyBuilder response = ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON);
            if (retryAfter > 0) {
                response.header(HttpHeaders.RETRY_AFTER, Long.toString(retryAfter));
            }
            return response.body(problem);
        }
    }
}

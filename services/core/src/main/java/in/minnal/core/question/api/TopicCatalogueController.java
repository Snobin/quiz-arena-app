package in.minnal.core.question.api;

import in.minnal.core.identity.infrastructure.BearerAuthenticator;
import in.minnal.core.question.application.TopicCatalogueService;
import in.minnal.core.question.domain.ContentCategory;
import java.net.URI;
import java.util.Arrays;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Story 4.1: {@code GET /api/core/v1/topics?category=KERALA_PSC}. Registered players only (guest 403, no
 * token 401). Strong ETag and {@code Cache-Control: private, no-cache}; a matching {@code If-None-Match} gets 304.
 */
@RestController
@RequestMapping("/api/core/v1/topics")
public class TopicCatalogueController {

    private final BearerAuthenticator auth;
    private final TopicCatalogueService service;

    public TopicCatalogueController(BearerAuthenticator auth, TopicCatalogueService service) {
        this.auth = auth;
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<String> topics(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestHeader(name = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
            @RequestParam(name = "category", required = false) String category) {
        auth.requireRegistered(authorization);
        ContentCategory parsed = category == null || category.isBlank()
                ? ContentCategory.KERALA_PSC
                : ContentCategory.parse(category).orElseThrow(() -> new IllegalArgumentException("category is not a known category"));
        TopicCatalogueService.Snapshot snapshot = service.catalogue(parsed);
        String cache = "private, no-cache";
        if (matches(ifNoneMatch, snapshot.etag())) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(snapshot.etag()).header(HttpHeaders.CACHE_CONTROL, cache).build();
        }
        return ResponseEntity.ok().eTag(snapshot.etag()).header(HttpHeaders.CACHE_CONTROL, cache).contentType(MediaType.APPLICATION_JSON).body(snapshot.body());
    }

    private static boolean matches(String header, String etag) {
        if (header == null || header.isBlank()) {
            return false;
        }
        return Arrays.stream(header.split(",")).map(String::strip).anyMatch(t -> t.equals("*") || t.equals(etag));
    }

    /** RFC 9457 Problem Details: 400, 401, 403. */
    @RestControllerAdvice(assignableTypes = TopicCatalogueController.class)
    static class Errors {

        @ExceptionHandler(BearerAuthenticator.Rejected.class)
        ResponseEntity<ProblemDetail> rejected(BearerAuthenticator.Rejected e) {
            return respond(e.status(), e.getMessage());
        }

        @ExceptionHandler(IllegalArgumentException.class)
        ResponseEntity<ProblemDetail> invalid(IllegalArgumentException e) {
            return respond(HttpStatus.BAD_REQUEST, e.getMessage());
        }

        private static ResponseEntity<ProblemDetail> respond(HttpStatus status, String detail) {
            ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
            problem.setType(URI.create("urn:minnal:problem:" + status.name().toLowerCase().replace('_', '-')));
            return ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
        }
    }
}

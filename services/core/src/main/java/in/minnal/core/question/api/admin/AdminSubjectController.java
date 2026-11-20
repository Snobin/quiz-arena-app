package in.minnal.core.question.api.admin;

import in.minnal.core.identity.infrastructure.BearerAuthenticator;
import in.minnal.core.question.application.AdminQuestionService;
import in.minnal.core.question.application.AdminSubject;
import in.minnal.core.question.infrastructure.JdbcAdminQuestionRepository;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Subjects and topics: {@code GET} lists them with their topics (Story 3.1); {@code POST} creates one (Story 3.2). ADMIN only. */
@RestController
@RequestMapping("/api/core/v1/admin/subjects")
public class AdminSubjectController {

    private static final Logger LOG = LoggerFactory.getLogger(AdminSubjectController.class);

    private final BearerAuthenticator auth;
    private final JdbcAdminQuestionRepository repository;

    private final AdminQuestionService service;

    public AdminSubjectController(BearerAuthenticator auth, JdbcAdminQuestionRepository repository, AdminQuestionService service) {
        this.auth = auth;
        this.repository = repository;
        this.service = service;
    }

    public record NameBody(String name) {
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createSubject(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestBody(required = false) NameBody body) {
        BearerAuthenticator.Caller caller = auth.requireAdmin(authorization);
        LOG.atInfo().addKeyValue("userId", caller.userId()).addKeyValue("route", "admin.subjects.create").log("admin request");
        var created = service.createSubject(body == null ? null : body.name());
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(Map.of("id", created.id()));
    }

    @PostMapping("{subjectId}/topics")
    public ResponseEntity<Map<String, Object>> createTopic(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable String subjectId,
            @RequestBody(required = false) NameBody body) {
        BearerAuthenticator.Caller caller = auth.requireAdmin(authorization);
        LOG.atInfo().addKeyValue("userId", caller.userId()).addKeyValue("route", "admin.topics.create").log("admin request");
        java.util.UUID id;
        try {
            id = java.util.UUID.fromString(subjectId);
        } catch (IllegalArgumentException e) {
            throw in.minnal.core.question.application.AdminWriteException.notFound("No such subject.");
        }
        var created = service.createTopic(id, body == null ? null : body.name());
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(Map.of("id", created.id()));
    }

    @GetMapping
    public ResponseEntity<List<AdminSubject>> list(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        BearerAuthenticator.Caller caller = auth.requireAdmin(authorization);
        LOG.atInfo().addKeyValue("userId", caller.userId()).addKeyValue("route", "admin.subjects.list").log("admin request");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(repository.subjects());
    }
}

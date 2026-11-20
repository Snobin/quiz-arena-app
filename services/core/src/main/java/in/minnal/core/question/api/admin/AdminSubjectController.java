package in.minnal.core.question.api.admin;

import in.minnal.core.identity.infrastructure.BearerAuthenticator;
import in.minnal.core.question.application.AdminSubject;
import in.minnal.core.question.infrastructure.JdbcAdminQuestionRepository;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /api/core/v1/admin/subjects}: every subject with its topics, for the filter controls. ADMIN only. */
@RestController
@RequestMapping("/api/core/v1/admin/subjects")
public class AdminSubjectController {

    private static final Logger LOG = LoggerFactory.getLogger(AdminSubjectController.class);

    private final BearerAuthenticator auth;
    private final JdbcAdminQuestionRepository repository;

    public AdminSubjectController(BearerAuthenticator auth, JdbcAdminQuestionRepository repository) {
        this.auth = auth;
        this.repository = repository;
    }

    @GetMapping
    public ResponseEntity<List<AdminSubject>> list(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        BearerAuthenticator.Caller caller = auth.requireAdmin(authorization);
        LOG.atInfo().addKeyValue("userId", caller.userId()).addKeyValue("route", "admin.subjects.list").log("admin request");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(repository.subjects());
    }
}

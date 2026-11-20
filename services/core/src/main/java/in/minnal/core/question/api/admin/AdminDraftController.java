package in.minnal.core.question.api.admin;

import in.minnal.core.identity.infrastructure.BearerAuthenticator;
import in.minnal.core.question.application.AdminDraftPage;
import in.minnal.core.question.application.AdminDraftService;
import in.minnal.core.question.application.DraftActionResult;
import in.minnal.core.question.application.DraftItem;
import in.minnal.core.question.domain.ContentCategory;
import in.minnal.core.question.infrastructure.JdbcAdminQuestionRepository;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Story 3.4: the draft queue and bulk publish or discard. ADMIN only. */
@RestController
@RequestMapping("/api/core/v1/admin/drafts")
public class AdminDraftController {

    static final int MAX_SIZE = 100;
    private static final Logger LOG = LoggerFactory.getLogger(AdminDraftController.class);

    /** The body of a bulk call. */
    public record BulkRequest(List<DraftItem> items) {
    }

    private final BearerAuthenticator auth;
    private final JdbcAdminQuestionRepository reads;
    private final AdminDraftService service;

    public AdminDraftController(BearerAuthenticator auth, JdbcAdminQuestionRepository reads, AdminDraftService service) {
        this.auth = auth;
        this.reads = reads;
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<AdminDraftPage> list(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String subjectId,
            @RequestParam(required = false) String topicId,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String size) {
        BearerAuthenticator.Caller caller = auth.requireAdmin(authorization);
        log(caller, "admin.drafts.list");
        int pageNo = AdminQuestionController.integer("page", page, 0);
        int pageSize = AdminQuestionController.integer("size", size, 50);
        if (pageNo < 0) {
            throw new InvalidAdminRequestException("page must not be negative.");
        }
        if (pageSize < 1) {
            throw new InvalidAdminRequestException("size must be at least 1.");
        }
        String cat = AdminQuestionController.enumName("category", category,
                ContentCategory.parse(AdminQuestionController.blankToNull(category)).map(Enum::name).orElse(null));
        AdminDraftPage body = reads.drafts(cat, AdminQuestionController.uuid("subjectId", subjectId),
                AdminQuestionController.uuid("topicId", topicId), pageNo, Math.min(pageSize, MAX_SIZE));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @PostMapping("publish")
    public ResponseEntity<Map<String, List<DraftActionResult>>> publish(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestBody(required = false) BulkRequest body) {
        BearerAuthenticator.Caller caller = auth.requireAdmin(authorization);
        log(caller, "admin.drafts.publishAll");
        List<DraftActionResult> results = service.publishAll(caller.userId(), body == null ? null : body.items());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("results", results));
    }

    @PostMapping("discard")
    public ResponseEntity<Map<String, List<DraftActionResult>>> discard(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestBody(required = false) BulkRequest body) {
        BearerAuthenticator.Caller caller = auth.requireAdmin(authorization);
        log(caller, "admin.drafts.discardAll");
        List<DraftActionResult> results = service.discardAll(caller.userId(), body == null ? null : body.items());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("results", results));
    }

    private static void log(BearerAuthenticator.Caller caller, String route) {
        LOG.atInfo().addKeyValue("userId", caller.userId()).addKeyValue("route", route).log("admin request");
    }
}

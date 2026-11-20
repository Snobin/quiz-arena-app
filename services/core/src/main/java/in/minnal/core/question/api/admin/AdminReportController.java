package in.minnal.core.question.api.admin;

import in.minnal.core.identity.infrastructure.BearerAuthenticator;
import in.minnal.core.question.application.AdminReportPage;
import in.minnal.core.question.application.AdminReportService;
import in.minnal.core.question.infrastructure.JdbcQuestionReportRepository;
import java.util.Map;
import java.util.UUID;
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

/** Story 3.6: the report queue, the nav badge count and dismissing reports. ADMIN only. */
@RestController
@RequestMapping("/api/core/v1/admin/reports")
public class AdminReportController {

    static final int MAX_SIZE = 100;
    private static final Logger LOG = LoggerFactory.getLogger(AdminReportController.class);

    /** The body of a dismiss call. */
    public record DismissRequest(String questionId, Integer version, String note) {
    }

    private final BearerAuthenticator auth;
    private final JdbcQuestionReportRepository reports;
    private final AdminReportService service;

    public AdminReportController(BearerAuthenticator auth, JdbcQuestionReportRepository reports, AdminReportService service) {
        this.auth = auth;
        this.reports = reports;
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<AdminReportPage> list(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String questionId,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String size) {
        BearerAuthenticator.Caller caller = auth.requireAdmin(authorization);
        log(caller, "admin.reports.list");
        String state = AdminQuestionController.blankToNull(status);
        if (state != null && !state.equals("OPEN") && !state.equals("CLOSED")) {
            throw new InvalidAdminRequestException("status must be OPEN or CLOSED.");
        }
        int pageNo = AdminQuestionController.integer("page", page, 0);
        int pageSize = AdminQuestionController.integer("size", size, 50);
        if (pageNo < 0) {
            throw new InvalidAdminRequestException("page must not be negative.");
        }
        if (pageSize < 1) {
            throw new InvalidAdminRequestException("size must be at least 1.");
        }
        UUID question = AdminQuestionController.uuid("questionId", questionId);
        AdminReportPage body = reports.page(!"CLOSED".equals(state), question, pageNo, Math.min(pageSize, MAX_SIZE));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @GetMapping("summary")
    public ResponseEntity<Map<String, Long>> summary(@RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        BearerAuthenticator.Caller caller = auth.requireAdmin(authorization);
        log(caller, "admin.reports.summary");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("openCount", reports.openCount()));
    }

    @PostMapping("dismiss")
    public ResponseEntity<Map<String, Object>> dismiss(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestBody(required = false) DismissRequest body) {
        BearerAuthenticator.Caller caller = auth.requireAdmin(authorization);
        log(caller, "admin.reports.dismiss");
        UUID question = body == null ? null : AdminQuestionController.uuid("questionId", body.questionId());
        int closed = service.dismiss(caller.userId(), question, body == null ? null : body.version(), body == null ? null : body.note());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("ok", true, "dismissed", closed));
    }

    private static void log(BearerAuthenticator.Caller caller, String route) {
        LOG.atInfo().addKeyValue("userId", caller.userId()).addKeyValue("route", route).log("admin request");
    }
}

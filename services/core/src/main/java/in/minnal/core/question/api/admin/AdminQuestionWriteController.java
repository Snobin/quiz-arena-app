package in.minnal.core.question.api.admin;

import in.minnal.core.identity.infrastructure.BearerAuthenticator;
import in.minnal.core.question.application.AdminQuestionDetail;
import in.minnal.core.question.application.AdminDraftService;
import in.minnal.core.question.application.AdminQuestionService;
import in.minnal.core.question.application.DraftActionResult;
import in.minnal.core.question.application.AdminWriteException;
import in.minnal.core.question.application.QuestionPayload;
import in.minnal.core.question.infrastructure.JdbcAdminQuestionRepository;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Story 3.2 and 3.4: read one question for the editor, and create, edit (as a draft), delete, restore, publish and discard. ADMIN only. */
@RestController
@RequestMapping("/api/core/v1/admin/questions")
public class AdminQuestionWriteController {

    private static final Logger LOG = LoggerFactory.getLogger(AdminQuestionWriteController.class);

    private final BearerAuthenticator auth;
    private final AdminQuestionService service;
    private final JdbcAdminQuestionRepository reads;
    private final AdminDraftService drafts;

    public AdminQuestionWriteController(BearerAuthenticator auth, AdminQuestionService service, JdbcAdminQuestionRepository reads, AdminDraftService drafts) {
        this.drafts = drafts;
        this.auth = auth;
        this.service = service;
        this.reads = reads;
    }

    @GetMapping("{questionId}")
    public ResponseEntity<AdminQuestionDetail> get(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable String questionId) {
        BearerAuthenticator.Caller caller = auth.requireAdmin(authorization);
        log(caller, "admin.questions.get");
        AdminQuestionDetail detail = reads.detail(id(questionId)).orElseThrow(() -> AdminWriteException.notFound("No such question."));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(detail);
    }

    @PostMapping
    public ResponseEntity<AdminQuestionService.Saved> create(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestBody(required = false) QuestionPayload body) {
        BearerAuthenticator.Caller caller = auth.requireAdmin(authorization);
        log(caller, "admin.questions.create");
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(service.create(caller.userId(), body));
    }

    @PutMapping("{questionId}/draft")
    public ResponseEntity<AdminQuestionService.Saved> saveDraft(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable String questionId,
            @RequestBody(required = false) QuestionPayload body) {
        BearerAuthenticator.Caller caller = auth.requireAdmin(authorization);
        log(caller, "admin.questions.saveDraft");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.saveDraft(caller.userId(), id(questionId), body));
    }

    @DeleteMapping("{questionId}")
    public ResponseEntity<Void> delete(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable String questionId) {
        BearerAuthenticator.Caller caller = auth.requireAdmin(authorization);
        log(caller, "admin.questions.delete");
        service.delete(caller.userId(), id(questionId));
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @PostMapping("{questionId}/restore")
    public ResponseEntity<Void> restore(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable String questionId) {
        BearerAuthenticator.Caller caller = auth.requireAdmin(authorization);
        log(caller, "admin.questions.restore");
        service.restore(id(questionId));
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @PostMapping("{questionId}/versions/{version}/publish")
    public ResponseEntity<DraftActionResult> publish(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable String questionId, @PathVariable String version) {
        BearerAuthenticator.Caller caller = auth.requireAdmin(authorization);
        log(caller, "admin.questions.publish");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(drafts.publish(caller.userId(), id(questionId), versionNo(version)));
    }

    @PostMapping("{questionId}/versions/{version}/discard")
    public ResponseEntity<DraftActionResult> discard(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable String questionId, @PathVariable String version) {
        BearerAuthenticator.Caller caller = auth.requireAdmin(authorization);
        log(caller, "admin.questions.discard");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(drafts.discard(caller.userId(), id(questionId), versionNo(version)));
    }

    private static int versionNo(String raw) {
        try {
            int version = Integer.parseInt(raw);
            if (version >= 1) {
                return version;
            }
        } catch (NumberFormatException e) {
            // falls through to the not-found below
        }
        throw AdminWriteException.notFound("No such version of this question.");
    }

    static UUID id(String raw) {
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException e) {
            throw AdminWriteException.notFound("No such question.");
        }
    }

    private static void log(BearerAuthenticator.Caller caller, String route) {
        LOG.atInfo().addKeyValue("userId", caller.userId()).addKeyValue("route", route).log("admin request");
    }
}

package in.minnal.core.question.api.admin;

import in.minnal.core.identity.infrastructure.BearerAuthenticator;
import in.minnal.core.question.application.AdminQuestionPage;
import in.minnal.core.question.application.AdminQuestionQuery;
import in.minnal.core.question.domain.ContentCategory;
import in.minnal.core.question.domain.Difficulty;
import in.minnal.core.question.domain.ExamLevel;
import in.minnal.core.question.domain.Text;
import in.minnal.core.question.infrastructure.JdbcAdminQuestionRepository;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /api/core/v1/admin/questions}: the searchable, filterable list of the whole bank. ADMIN only. */
@RestController
@RequestMapping("/api/core/v1/admin/questions")
public class AdminQuestionController {

    static final int MAX_SIZE = 100;
    private static final Logger LOG = LoggerFactory.getLogger(AdminQuestionController.class);

    private final BearerAuthenticator auth;
    private final JdbcAdminQuestionRepository repository;

    public AdminQuestionController(BearerAuthenticator auth, JdbcAdminQuestionRepository repository) {
        this.auth = auth;
        this.repository = repository;
    }

    @GetMapping
    public ResponseEntity<AdminQuestionPage> list(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String subjectId,
            @RequestParam(required = false) String topicId,
            @RequestParam(required = false) String examLevel,
            @RequestParam(required = false) String difficulty,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String size) {
        BearerAuthenticator.Caller caller = auth.requireAdmin(authorization);
        LOG.atInfo().addKeyValue("userId", caller.userId()).addKeyValue("route", "admin.questions.list").log("admin request");
        String state = blankToNull(status);
        if (state != null && !java.util.Set.of("PUBLISHED", "DRAFT", "DISCARDED", "DELETED").contains(state)) {
            throw new InvalidAdminRequestException("status must be one of PUBLISHED, DRAFT, DISCARDED, DELETED.");
        }
        String search = Text.normaliseToNull(q);
        if (search != null && search.codePointCount(0, search.length()) < 2) {
            search = null;
        }
        int pageNo = integer("page", page, 0);
        int pageSize = integer("size", size, 50);
        if (pageNo < 0) {
            throw new InvalidAdminRequestException("page must not be negative.");
        }
        if (pageSize < 1) {
            throw new InvalidAdminRequestException("size must be at least 1.");
        }
        AdminQuestionQuery query = new AdminQuestionQuery(state,
                enumName("category", category, ContentCategory.parse(blankToNull(category)).map(Enum::name).orElse(null)),
                uuid("subjectId", subjectId), uuid("topicId", topicId),
                enumName("examLevel", examLevel, ExamLevel.parse(blankToNull(examLevel)).map(Enum::name).orElse(null)),
                enumName("difficulty", difficulty, Difficulty.parse(blankToNull(difficulty)).map(Enum::name).orElse(null)),
                search, pageNo, Math.min(pageSize, MAX_SIZE));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(repository.list(query));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    private static String enumName(String field, String raw, String parsed) {
        if (blankToNull(raw) != null && parsed == null) {
            throw new InvalidAdminRequestException(field + " is not a known value.");
        }
        return parsed;
    }

    private static UUID uuid(String field, String raw) {
        if (blankToNull(raw) == null) {
            return null;
        }
        try {
            return UUID.fromString(raw.strip());
        } catch (IllegalArgumentException e) {
            throw new InvalidAdminRequestException(field + " must be an id.");
        }
    }

    private static int integer(String field, String raw, int fallback) {
        if (blankToNull(raw) == null) {
            return fallback;
        }
        try {
            return Integer.parseInt(raw.strip());
        } catch (NumberFormatException e) {
            throw new InvalidAdminRequestException(field + " must be a whole number.");
        }
    }
}

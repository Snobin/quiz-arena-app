package in.minnal.core.question.api.admin;

import in.minnal.core.identity.infrastructure.BearerAuthenticator;
import in.minnal.core.platform.infrastructure.ratelimit.RateLimitPolicy;
import in.minnal.core.platform.infrastructure.ratelimit.RateLimiter;
import in.minnal.core.question.application.AdminUploadService;
import in.minnal.core.question.application.AdminWriteException;
import in.minnal.core.question.application.CsvUploadResult;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartRequest;
import org.springframework.web.util.WebUtils;

/**
 * Story 3.3: {@code POST /api/core/v1/admin/uploads}, a multipart CSV (field {@code file}) imported as
 * drafts. ADMIN only, rate-limited per admin. Multipart parsing is lazy (see application.yaml), so the
 * role and the limit are checked before the file is read.
 */
@RestController
@RequestMapping("/api/core/v1/admin/uploads")
public class AdminUploadController {

    private static final Logger LOG = LoggerFactory.getLogger(AdminUploadController.class);

    private final BearerAuthenticator auth;
    private final RateLimiter limiter;
    private final AdminUploadService service;

    public AdminUploadController(BearerAuthenticator auth, RateLimiter limiter, AdminUploadService service) {
        this.auth = auth;
        this.limiter = limiter;
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<CsvUploadResult> upload(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            HttpServletRequest request) {
        BearerAuthenticator.Caller caller = auth.requireAdmin(authorization);
        RateLimiter.Decision decision = acquire(caller);
        if (!decision.allowed()) {
            LOG.atInfo().addKeyValue("userId", caller.userId()).addKeyValue("route", "admin.uploads.create").log("admin upload rate limited");
            throw AdminWriteException.rateLimited(decision.retryAfterSeconds());
        }
        LOG.atInfo().addKeyValue("userId", caller.userId()).addKeyValue("route", "admin.uploads.create").log("admin request");
        byte[] bytes = read(request);
        CsvUploadResult result = service.upload(caller.userId(), bytes);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);
    }

    /** Fails closed: if the limiter store is down the upload is refused with a 503, not an unshaped 500. */
    private RateLimiter.Decision acquire(BearerAuthenticator.Caller caller) {
        try {
            return limiter.tryAcquire(RateLimitPolicy.ADMIN_UPLOAD, caller.userId().toString());
        } catch (RuntimeException e) {
            LOG.atError().setCause(e).addKeyValue("route", "admin.uploads.create").log("rate limiter unavailable");
            throw AdminWriteException.unavailable();
        }
    }

    private static byte[] read(HttpServletRequest request) {
        MultipartRequest multipart = WebUtils.getNativeRequest(request, MultipartRequest.class);
        if (multipart == null) {
            throw AdminWriteException.invalidFile("Send the CSV as multipart/form-data in a field named file.");
        }
        try {
            MultipartFile file = multipart.getFile("file");
            if (file == null) {
                throw AdminWriteException.invalidFile("No file was sent. Choose a CSV file and upload again.");
            }
            return file.getBytes();
        } catch (MaxUploadSizeExceededException e) {
            throw AdminWriteException.invalidFile("File is over 2 MB; the limit is 2 MB. Split it into smaller files.");
        } catch (MultipartException e) {
            throw AdminWriteException.invalidFile("The upload could not be read. Choose the file again and upload.");
        } catch (IOException e) {
            throw AdminWriteException.invalidFile("The file could not be read. Choose it again and upload.");
        }
    }
}

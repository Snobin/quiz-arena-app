package in.minnal.core.question.api.admin;

import in.minnal.core.identity.infrastructure.BearerAuthenticator;
import in.minnal.core.question.application.AdminWriteException;
import in.minnal.core.question.domain.FieldError;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** RFC 9457 Problem Details for the admin API: 401, 403, 400 (with {@code errors[]}), 404 and 409. */
@RestControllerAdvice(assignableTypes = {AdminQuestionController.class, AdminSubjectController.class, AdminQuestionWriteController.class, AdminUploadController.class, AdminDraftController.class, AdminReportController.class})
class AdminExceptionHandler {

    @ExceptionHandler(BearerAuthenticator.Rejected.class)
    ProblemDetail rejected(BearerAuthenticator.Rejected e) {
        return problem(e.status(), e.getMessage());
    }

    @ExceptionHandler(InvalidAdminRequestException.class)
    ProblemDetail invalid(InvalidAdminRequestException e) {
        return problem(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ProblemDetail unreadable(HttpMessageNotReadableException e) {
        return problem(HttpStatus.BAD_REQUEST, "The request body is not valid JSON of the expected shape.");
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
        ProblemDetail problem = problem(status, e.getMessage());
        if (!e.errors().isEmpty()) {
            List<Map<String, String>> errors = new ArrayList<>();
            for (FieldError error : e.errors()) {
                Map<String, String> item = new LinkedHashMap<>();
                item.put("field", error.field());
                item.put("problem", error.problem());
                if (error.fix() != null) {
                    item.put("fix", error.fix());
                }
                errors.add(item);
            }
            problem.setProperty("errors", errors);
        }
        e.properties().forEach(problem::setProperty);
        ResponseEntity.BodyBuilder response = ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON);
        if (e.kind() == AdminWriteException.Kind.RATE_LIMITED) {
            response.header(HttpHeaders.RETRY_AFTER, Long.toString(Math.max(1, e.retryAfterSeconds())));
        }
        return response.body(problem);
    }

    private static ProblemDetail problem(HttpStatus status, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setType(URI.create("urn:minnal:problem:" + status.name().toLowerCase().replace('_', '-')));
        return problem;
    }
}

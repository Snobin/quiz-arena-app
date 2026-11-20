package in.minnal.core.question.api.admin;

import in.minnal.core.identity.infrastructure.BearerAuthenticator;
import java.net.URI;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** RFC 9457 Problem Details for the admin API: 401, 403 and 400. */
@RestControllerAdvice(assignableTypes = {AdminQuestionController.class, AdminSubjectController.class})
class AdminExceptionHandler {

    @ExceptionHandler(BearerAuthenticator.Rejected.class)
    ProblemDetail rejected(BearerAuthenticator.Rejected e) {
        return problem(e.status(), e.getMessage());
    }

    @ExceptionHandler(InvalidAdminRequestException.class)
    ProblemDetail invalid(InvalidAdminRequestException e) {
        return problem(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    private static ProblemDetail problem(HttpStatus status, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setType(URI.create("urn:minnal:problem:" + status.name().toLowerCase().replace('_', '-')));
        return problem;
    }
}

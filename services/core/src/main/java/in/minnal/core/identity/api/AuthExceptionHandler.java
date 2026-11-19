package in.minnal.core.identity.api;

import in.minnal.core.identity.application.UnsupportedLanguageException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** A guest request with an unsupported {@code lang} is a 400 RFC 9457 Problem Details. */
@RestControllerAdvice(assignableTypes = {GuestTokenController.class, RefreshController.class})
class AuthExceptionHandler {

    @ExceptionHandler(UnsupportedLanguageException.class)
    ProblemDetail unsupportedLanguage(UnsupportedLanguageException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
    }
}

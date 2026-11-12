package in.minnal.core.question.api.internal;

import in.minnal.core.question.application.InvalidQuestionSetRequestException;
import in.minnal.core.question.application.QuestionSetUnavailableException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Maps question-set failures to RFC 9457 Problem Details: 400 for bad input, 422 when unservable. */
@RestControllerAdvice(assignableTypes = QuestionSetController.class)
class QuestionSetExceptionHandler {

    @ExceptionHandler(InvalidQuestionSetRequestException.class)
    ProblemDetail invalid(InvalidQuestionSetRequestException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    @ExceptionHandler(QuestionSetUnavailableException.class)
    ProblemDetail unavailable(QuestionSetUnavailableException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_CONTENT, e.getMessage());
    }
}

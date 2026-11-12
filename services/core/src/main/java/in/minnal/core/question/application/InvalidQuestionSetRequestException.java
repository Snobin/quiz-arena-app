package in.minnal.core.question.application;

/** The question-set request is malformed (answered with 400). */
public class InvalidQuestionSetRequestException extends RuntimeException {

    public InvalidQuestionSetRequestException(String message) {
        super(message);
    }
}

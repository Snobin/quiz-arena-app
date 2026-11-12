package in.minnal.core.question.application;

/** A well-formed request that cannot be served in full (answered with 422; never a short set). */
public class QuestionSetUnavailableException extends RuntimeException {

    public QuestionSetUnavailableException(String message) {
        super(message);
    }
}

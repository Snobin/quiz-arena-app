package in.minnal.core.question.application;

/** The custom topic does not exist or is not the requester's (answered with 404; the same for both). */
public class QuestionSetNotFoundException extends RuntimeException {

    public QuestionSetNotFoundException(String message) {
        super(message);
    }
}

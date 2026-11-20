package in.minnal.core.question.api.admin;

/** A malformed admin query; becomes a 400 Problem Details. */
class InvalidAdminRequestException extends RuntimeException {

    InvalidAdminRequestException(String message) {
        super(message);
    }
}

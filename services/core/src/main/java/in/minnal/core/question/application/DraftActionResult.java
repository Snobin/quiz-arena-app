package in.minnal.core.question.application;

import com.fasterxml.jackson.annotation.JsonInclude;
import in.minnal.core.question.domain.FieldError;
import java.util.List;
import java.util.UUID;

/**
 * The outcome of publishing or discarding one draft in a bulk call. {@code ok} items carry the new {@code status}; a
 * failed item carries the HTTP {@code problemStatus}, the {@code detail} and any field {@code errors}.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DraftActionResult(UUID questionId, Integer version, boolean ok, String status, Integer problemStatus,
                                String detail, List<Error> errors) {

    public record Error(String field, String problem, @JsonInclude(JsonInclude.Include.NON_NULL) String fix) {
    }

    public static DraftActionResult done(UUID questionId, int version, String status) {
        return new DraftActionResult(questionId, version, true, status, null, null, null);
    }

    public static DraftActionResult failed(UUID questionId, Integer version, AdminWriteException e) {
        int code = switch (e.kind()) {
            case INVALID -> 400;
            case NOT_FOUND -> 404;
            case CONFLICT -> 409;
            case RATE_LIMITED -> 429;
            case INTERNAL -> 500;
            case UNAVAILABLE -> 503;
        };
        List<Error> errors = e.errors().isEmpty() ? null : e.errors().stream().map(DraftActionResult::error).toList();
        return new DraftActionResult(questionId, version, false, null, code, e.getMessage(), errors);
    }

    private static Error error(FieldError e) {
        return new Error(e.field(), e.problem(), e.fix());
    }
}

package in.minnal.core.question.application;

import in.minnal.core.question.domain.FieldError;
import in.minnal.core.question.domain.Text;
import in.minnal.core.question.infrastructure.JdbcQuestionReportRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** Story 3.6: closing player reports by dismissing them. Fixing closes them in the publish transaction. */
@Service
public class AdminReportService {

    public static final int MAX_NOTE = 500;

    private final JdbcQuestionReportRepository reports;

    public AdminReportService(JdbcQuestionReportRepository reports) {
        this.reports = reports;
    }

    /** Dismisses every open report on one version, or throws 400 (no or too long a note) or 409 (nothing open). */
    public int dismiss(UUID actor, UUID questionId, Integer version, String rawNote) {
        List<FieldError> errors = new java.util.ArrayList<>();
        if (questionId == null) {
            errors.add(new FieldError("questionId", "required"));
        }
        if (version == null || version < 1) {
            errors.add(new FieldError("version", "required: 1 or more"));
        }
        String note = Text.normaliseToNull(rawNote);
        if (note == null) {
            errors.add(new FieldError("note", "required", "Say why these reports are being dismissed."));
        } else {
            int length = note.codePointCount(0, note.length());
            if (length > MAX_NOTE) {
                errors.add(new FieldError("note", "must be at most " + MAX_NOTE + " characters (got " + length + ")",
                        "Shorten it by " + (length - MAX_NOTE) + " characters."));
            }
        }
        if (!errors.isEmpty()) {
            throw AdminWriteException.invalid(errors);
        }
        int closed = reports.dismiss(questionId, version, note, actor, Instant.now());
        if (closed == 0) {
            throw AdminWriteException.conflict("These reports are already closed.");
        }
        return closed;
    }
}

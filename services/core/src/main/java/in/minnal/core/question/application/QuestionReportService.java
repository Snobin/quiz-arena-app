package in.minnal.core.question.application;

import in.minnal.core.question.domain.FieldError;
import in.minnal.core.question.domain.Text;
import in.minnal.core.question.infrastructure.JdbcQuestionReportRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

/**
 * Story 3.5: a registered player reports a published bank question version. Core checks only that the version
 * is a {@code PUBLISHED} bank version (custom-topic ids are not in the bank, so they are 404); it never checks
 * that the reporter played the question.
 */
@Service
public class QuestionReportService {

    public static final int MAX_NOTE = 500;
    private static final int MAX_MATCH_ID = 64;
    private static final Set<String> SURFACES = Set.of("LIVE_REVEAL", "RESULTS", "SOLO");

    private final JdbcQuestionReportRepository reports;

    public QuestionReportService(JdbcQuestionReportRepository reports) {
        this.reports = reports;
    }

    public UUID report(UUID reporterId, UUID questionId, int version, QuestionReportRequest request) {
        List<FieldError> errors = new ArrayList<>();
        String note = Text.normaliseToNull(request == null ? null : request.note());
        if (note != null && note.codePointCount(0, note.length()) > MAX_NOTE) {
            errors.add(new FieldError("note", "Note is over " + MAX_NOTE + " characters.", "Shorten the note to " + MAX_NOTE + " characters or fewer."));
        }
        String surface = request == null ? null : request.surface();
        if (surface == null || !SURFACES.contains(surface)) {
            errors.add(new FieldError("surface", "Surface must be one of LIVE_REVEAL, RESULTS or SOLO."));
        }
        String matchId = request == null ? null : Text.normaliseToNull(request.matchId());
        if (matchId != null && matchId.length() > MAX_MATCH_ID) {
            errors.add(new FieldError("matchId", "Match id is over " + MAX_MATCH_ID + " characters."));
        }
        if (!errors.isEmpty()) {
            throw AdminWriteException.invalid(errors);
        }
        if (!reports.isPublishedVersion(questionId, version)) {
            throw AdminWriteException.notFound("That question version cannot be reported.");
        }
        UUID id = UUID.randomUUID();
        try {
            reports.insert(id, questionId, version, reporterId, note, surface, matchId, Instant.now());
        } catch (DuplicateKeyException e) {
            throw AdminWriteException.conflict("You've already reported this question.");
        }
        return id;
    }
}

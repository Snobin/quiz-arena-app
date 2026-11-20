package in.minnal.core.question.application;

import in.minnal.core.question.domain.FieldError;
import in.minnal.core.question.domain.Question;
import in.minnal.core.question.domain.QuestionCandidate;
import in.minnal.core.question.domain.QuestionContent;
import in.minnal.core.question.domain.QuestionValidator;
import in.minnal.core.question.domain.QuestionVersion;
import in.minnal.core.question.domain.VersionStatus;
import in.minnal.core.question.infrastructure.JdbcQuestionReportRepository;
import in.minnal.core.question.infrastructure.JdbcQuestionRepository;
import in.minnal.core.question.infrastructure.JdbcSubjectTopicRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Story 3.4: publish or discard a draft, one or many. Every item runs in its own transaction, so a bulk call applies
 * each item independently. A published version is never changed; publishing only adds the newest published version.
 */
@Service
public class AdminDraftService {

    public static final int MAX_BULK = 100;
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(AdminDraftService.class);

    private final JdbcQuestionRepository questions;
    private final JdbcSubjectTopicRepository subjectsAndTopics;
    private final QuestionValidator validator;
    private final TransactionTemplate transactions;
    private final JdbcQuestionReportRepository reports;

    public AdminDraftService(JdbcQuestionRepository questions, JdbcSubjectTopicRepository subjectsAndTopics,
                             QuestionValidator validator, TransactionTemplate transactions, JdbcQuestionReportRepository reports) {
        this.reports = reports;
        this.questions = questions;
        this.subjectsAndTopics = subjectsAndTopics;
        this.validator = validator;
        this.transactions = transactions;
    }

    /** Publishes one draft, or throws a 400, 404 or 409 {@link AdminWriteException}. */
    public DraftActionResult publish(UUID actor, UUID questionId, int version) {
        return transactions.execute(status -> publishInTransaction(actor, questionId, version));
    }

    public DraftActionResult discard(UUID actor, UUID questionId, int version) {
        return transactions.execute(status -> discardInTransaction(actor, questionId, version));
    }

    public List<DraftActionResult> publishAll(UUID actor, List<DraftItem> items) {
        return apply(items, (id, version) -> publish(actor, id, version));
    }

    public List<DraftActionResult> discardAll(UUID actor, List<DraftItem> items) {
        return apply(items, (id, version) -> discard(actor, id, version));
    }

    private interface Action {
        DraftActionResult run(UUID questionId, int version);
    }

    private static List<DraftActionResult> apply(List<DraftItem> items, Action action) {
        if (items == null || items.isEmpty()) {
            throw AdminWriteException.invalid(List.of(new FieldError("items", "required: 1 to " + MAX_BULK + " items",
                    "Select at least one draft.")));
        }
        if (items.size() > MAX_BULK) {
            throw AdminWriteException.invalid(List.of(new FieldError("items", "at most " + MAX_BULK + " items per request (got " + items.size() + ")",
                    "Send the drafts in batches of " + MAX_BULK + " or fewer.")));
        }
        List<DraftActionResult> results = new ArrayList<>();
        for (DraftItem item : items) {
            UUID id = item == null ? null : parseId(item.questionId());
            Integer version = item == null ? null : item.version();
            if (id == null || version == null || version < 1) {
                results.add(DraftActionResult.failed(id, version, AdminWriteException.invalid(
                        List.of(new FieldError("item", "needs a questionId and a version of 1 or more")))));
                continue;
            }
            try {
                results.add(action.run(id, version));
            } catch (AdminWriteException e) {
                results.add(DraftActionResult.failed(id, version, e));
            } catch (RuntimeException e) {
                // One item's unexpected failure (a database error, say) must not hide the items already committed.
                LOG.atError().setCause(e).addKeyValue("questionId", id).log("bulk draft item failed");
                results.add(DraftActionResult.failed(id, version, AdminWriteException.internal("This draft could not be saved. Try again.")));
            }
        }
        return results;
    }

    private DraftActionResult publishInTransaction(UUID actor, UUID questionId, int version) {
        OpenDraft open = requireOpenDraft(questionId, version);
        QuestionVersion draft = open.version();
        List<FieldError> errors = revalidate(draft.content());
        if (!errors.isEmpty()) {
            throw AdminWriteException.invalid(errors);
        }
        Instant now = Instant.now();
        QuestionVersion published = draft.publish(actor.toString(), now);
        if (!questions.publishDraft(draft.id(), open.rowVersion(), published.reviewedBy(), actor, now)) {
            throw notDraft();
        }
        // Same transaction as the publish: if either fails, the reports stay open.
        reports.resolveOlderOpen(questionId, version, actor, now);
        return DraftActionResult.done(questionId, version, VersionStatus.PUBLISHED.name());
    }

    private DraftActionResult discardInTransaction(UUID actor, UUID questionId, int version) {
        OpenDraft open = requireOpenDraft(questionId, version);
        QuestionVersion draft = open.version();
        draft.discard();
        if (!questions.discardDraft(draft.id(), open.rowVersion(), actor, Instant.now())) {
            throw notDraft();
        }
        return DraftActionResult.done(questionId, version, VersionStatus.DISCARDED.name());
    }

    /** The draft as validated and the row version it was read at: the write succeeds only if that is still current. */
    private record OpenDraft(QuestionVersion version, int rowVersion) {
    }

    private OpenDraft requireOpenDraft(UUID questionId, int version) {
        Question question = questions.findQuestion(questionId).orElseThrow(() -> AdminWriteException.notFound("No such question."));
        // The row version is read before the content: an edit in between leaves it stale, so the guarded write fails.
        int rowVersion = questions.rowVersion(questionId, version).orElseThrow(() -> AdminWriteException.notFound("No such version of this question."));
        QuestionVersion found = questions.findVersion(questionId, version)
                .orElseThrow(() -> AdminWriteException.notFound("No such version of this question."));
        if (question.isDeleted()) {
            throw AdminWriteException.conflict("This question is deleted. Restore it first.");
        }
        if (found.status() != VersionStatus.DRAFT) {
            throw notDraft();
        }
        return new OpenDraft(found, rowVersion);
    }

    private static AdminWriteException notDraft() {
        return AdminWriteException.conflict("Only a draft can be published or discarded, and this version is not a draft any more.");
    }

    /** Runs the shared validator on the stored content, with the subject and topic resolved to their names. */
    private List<FieldError> revalidate(QuestionContent c) {
        String subject = subjectsAndTopics.subjectName(c.subjectId()).orElse(null);
        String topic = subjectsAndTopics.topicName(c.subjectId(), c.topicId()).orElse(null);
        QuestionCandidate candidate = new QuestionCandidate(c.category().name(), subject, topic, c.examLevel().name(),
                c.difficulty().name(), c.textMl(), c.textEn(), c.options(), c.answerIndex(), c.explanation(), c.attribution());
        List<FieldError> errors = new ArrayList<>();
        for (FieldError e : validator.validate(candidate)) {
            String field = switch (e.field()) {
                case "subject" -> "subjectId";
                case "topic" -> "topicId";
                default -> e.field();
            };
            errors.add(new FieldError(field, e.problem(), e.fix()));
        }
        return errors;
    }

    private static UUID parseId(String raw) {
        try {
            return raw == null ? null : UUID.fromString(raw.strip());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}

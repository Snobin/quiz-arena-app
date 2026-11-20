package in.minnal.core.question.application;

import in.minnal.core.question.domain.ContentCategory;
import in.minnal.core.question.domain.Difficulty;
import in.minnal.core.question.domain.ExamLevel;
import in.minnal.core.question.domain.FieldError;
import in.minnal.core.question.domain.Question;
import in.minnal.core.question.domain.QuestionCandidate;
import in.minnal.core.question.domain.QuestionContent;
import in.minnal.core.question.domain.QuestionValidator;
import in.minnal.core.question.domain.QuestionVersion;
import in.minnal.core.question.domain.Text;
import in.minnal.core.question.domain.VersionStatus;
import in.minnal.core.question.infrastructure.JdbcQuestionReportRepository;
import in.minnal.core.question.infrastructure.JdbcQuestionRepository;
import in.minnal.core.question.infrastructure.JdbcSubjectTopicRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin writes to the question bank (Story 3.2). Everything saved here is a DRAFT; publishing and
 * discarding belong to Story 3.4. A published version is never changed.
 */
@Service
public class AdminQuestionService {

    static final int MAX_NAME = 100;

    public record Saved(UUID questionId, long displayNo, int version, String status, int rowVersion) {
    }

    private final JdbcQuestionRepository questions;
    private final JdbcSubjectTopicRepository subjectsAndTopics;
    private final QuestionValidator validator;
    private final JdbcQuestionReportRepository reports;

    public AdminQuestionService(JdbcQuestionRepository questions, JdbcSubjectTopicRepository subjectsAndTopics, QuestionValidator validator,
                                JdbcQuestionReportRepository reports) {
        this.reports = reports;
        this.questions = questions;
        this.subjectsAndTopics = subjectsAndTopics;
        this.validator = validator;
    }

    @Transactional
    public Saved create(UUID actor, QuestionPayload payload) {
        Instant now = Instant.now();
        String sourceRef = Text.normaliseToNull(payload == null ? null : payload.sourceRef());
        List<FieldError> extra = new ArrayList<>();
        if (sourceRef != null && questions.existsBySourceRef(sourceRef)) {
            extra.add(new FieldError("sourceRef", "already used by another question", "Use a different source ref, or leave it blank."));
        }
        QuestionContent content = prepare(payload, extra);
        Question question = Question.create(sourceRef, now);
        QuestionVersion version = new QuestionVersion(UUID.randomUUID(), question.id(), 1, VersionStatus.DRAFT, content, null, null, now);
        try {
            questions.insert(question, actor);
            questions.insertVersion(version, actor);
        } catch (DuplicateKeyException e) {
            throw AdminWriteException.invalid(List.of(new FieldError("sourceRef", "already used by another question", "Use a different source ref, or leave it blank.")));
        }
        return new Saved(question.id(), questions.displayNo(question.id()), 1, VersionStatus.DRAFT.name(), 0);
    }

    /** Updates the open draft in place, or creates version max + 1 as a draft when there is none. */
    @Transactional
    public Saved saveDraft(UUID actor, UUID questionId, QuestionPayload payload) {
        Question question = questions.findQuestion(questionId).orElseThrow(() -> AdminWriteException.notFound("No such question."));
        if (question.isDeleted()) {
            throw AdminWriteException.conflict("This question is deleted. Restore it before editing.");
        }
        QuestionContent content = prepare(payload, List.of());
        Instant now = Instant.now();
        long displayNo = questions.displayNo(questionId);
        Optional<JdbcQuestionRepository.OpenDraft> open = questions.findOpenDraft(questionId);
        if (open.isPresent()) {
            JdbcQuestionRepository.OpenDraft draft = open.get();
            Integer expected = payload.rowVersion();
            if (expected == null || expected != draft.rowVersion()) {
                throw staleDraft();
            }
            QuestionVersion revised = questions.findVersion(draft.versionId()).orElseThrow().reviseDraft(content);
            if (!questions.updateDraftChecked(revised, expected, actor, now)) {
                throw staleDraft();
            }
            return new Saved(questionId, displayNo, draft.version(), VersionStatus.DRAFT.name(), draft.rowVersion() + 1);
        }
        int next = questions.maxVersion(questionId) + 1;
        try {
            questions.insertVersion(new QuestionVersion(UUID.randomUUID(), questionId, next, VersionStatus.DRAFT, content, null, null, now), actor);
        } catch (DuplicateKeyException e) {
            throw staleDraft();
        }
        return new Saved(questionId, displayNo, next, VersionStatus.DRAFT.name(), 0);
    }

    @Transactional
    public void delete(UUID actor, UUID questionId) {
        Question question = questions.findQuestion(questionId).orElseThrow(() -> AdminWriteException.notFound("No such question."));
        Instant now = Instant.now();
        if (!questions.softDelete(question.id(), now, actor)) {
            throw AdminWriteException.conflict("This question is already deleted.");
        }
        questions.discardOpenDraft(question.id());
        reports.dismissAllForQuestion(question.id(), "Question deleted", actor, now);
    }

    @Transactional
    public void restore(UUID questionId) {
        Question question = questions.findQuestion(questionId).orElseThrow(() -> AdminWriteException.notFound("No such question."));
        if (!questions.restore(question.id())) {
            throw AdminWriteException.conflict("This question is not deleted.");
        }
    }

    public JdbcSubjectTopicRepository.Created createSubject(String name) {
        String normalised = checkName(name);
        JdbcSubjectTopicRepository.Created created = subjectsAndTopics.createSubject(normalised, Instant.now());
        if (!created.created()) {
            throw AdminWriteException.conflict("A subject with this name already exists.", Map.of("id", created.id().toString()));
        }
        return created;
    }

    public JdbcSubjectTopicRepository.Created createTopic(UUID subjectId, String name) {
        if (!subjectsAndTopics.subjectExists(subjectId)) {
            throw AdminWriteException.notFound("No such subject.");
        }
        String normalised = checkName(name);
        JdbcSubjectTopicRepository.Created created = subjectsAndTopics.createTopic(subjectId, normalised, Instant.now());
        if (!created.created()) {
            throw AdminWriteException.conflict("A topic with this name already exists in this subject.", Map.of("id", created.id().toString()));
        }
        return created;
    }

    private static String checkName(String name) {
        String normalised = Text.normaliseToNull(name);
        if (normalised == null) {
            throw AdminWriteException.invalid(List.of(new FieldError("name", "required")));
        }
        int length = normalised.codePointCount(0, normalised.length());
        if (length > MAX_NAME) {
            throw AdminWriteException.invalid(List.of(new FieldError("name", "must be at most " + MAX_NAME + " characters (got " + length + ")",
                    "Shorten it by " + (length - MAX_NAME) + " characters.")));
        }
        return normalised;
    }

    private static AdminWriteException staleDraft() {
        return AdminWriteException.conflict("This draft changed since you opened it.");
    }

    /**
     * Resolves subject and topic by id, runs the shared validator on the normalised values and returns
     * the content, or throws one 400 listing every problem ({@code extra} are errors found earlier).
     */
    private QuestionContent prepare(QuestionPayload p, List<FieldError> extra) {
        if (p == null) {
            throw AdminWriteException.invalid(List.of(new FieldError("question", "required")));
        }
        List<FieldError> errors = new ArrayList<>(extra);
        UUID subjectId = parseId(p.subjectId());
        UUID topicId = parseId(p.topicId());
        String subjectName = null;
        String topicName = null;
        boolean subjectProblem = false;
        boolean topicProblem = false;
        if (Text.isBlank(p.subjectId())) {
            // the validator reports "subject required"
        } else if (subjectId == null || (subjectName = subjectsAndTopics.subjectName(subjectId).orElse(null)) == null) {
            errors.add(new FieldError("subjectId", "unknown subject", "Pick a subject from the list or create it."));
            subjectProblem = true;
        }
        if (!Text.isBlank(p.topicId())) {
            if (topicId == null) {
                errors.add(new FieldError("topicId", "unknown topic", "Pick a topic from the list or create it."));
                topicProblem = true;
            } else if (subjectName == null) {
                // the subject is missing or unknown, so the topic cannot be checked against it
                topicProblem = true;
            } else if ((topicName = subjectsAndTopics.topicName(subjectId, topicId).orElse(null)) == null) {
                errors.add(new FieldError("topicId", "unknown topic for this subject", "Pick a topic from the list or create it."));
                topicProblem = true;
            }
        }
        QuestionCandidate candidate = new QuestionCandidate(p.category(),
                subjectName != null ? subjectName : (subjectProblem ? "?" : null),
                topicName != null ? topicName : (topicProblem ? "?" : null),
                p.examLevel(), p.difficulty(), p.textMl(), p.textEn(), p.options(), p.answerIndex(), p.explanation(), p.attribution());
        for (FieldError e : validator.validate(candidate)) {
            String field = switch (e.field()) {
                case "subject" -> "subjectId";
                case "topic" -> "topicId";
                default -> e.field();
            };
            errors.add(new FieldError(field, e.problem(), e.fix()));
        }
        if (!errors.isEmpty()) {
            throw AdminWriteException.invalid(errors);
        }
        List<String> options = p.options().stream().map(Text::normalise).toList();
        return new QuestionContent(
                ContentCategory.parse(p.category()).orElseThrow(), subjectId, topicId,
                ExamLevel.parse(p.examLevel()).orElseThrow(), Difficulty.parse(p.difficulty()).orElseThrow(),
                Text.normaliseToNull(p.textMl()), Text.normaliseToNull(p.textEn()), options, p.answerIndex(),
                Text.normalise(p.explanation()), Text.normaliseToNull(p.attribution()));
    }

    private static UUID parseId(String raw) {
        if (Text.isBlank(raw)) {
            return null;
        }
        try {
            return UUID.fromString(raw.strip());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}

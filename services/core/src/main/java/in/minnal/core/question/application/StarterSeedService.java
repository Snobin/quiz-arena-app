package in.minnal.core.question.application;

import in.minnal.core.question.domain.ContentCategory;
import in.minnal.core.question.domain.Difficulty;
import in.minnal.core.question.domain.ExamLevel;
import in.minnal.core.question.domain.FieldError;
import in.minnal.core.question.domain.Question;
import in.minnal.core.question.domain.QuestionCandidate;
import in.minnal.core.question.domain.QuestionContent;
import in.minnal.core.question.domain.QuestionVersion;
import in.minnal.core.question.domain.Text;
import in.minnal.core.question.infrastructure.JdbcQuestionRepository;
import in.minnal.core.question.infrastructure.JdbcSubjectTopicRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Loads reviewed seed rows as {@code PUBLISHED} version-1 questions. Idempotent by
 * {@code sourceRef}: a row whose {@code sourceRef} already exists is counted as unchanged and its
 * content is ignored (later edits go through admin versions). Each row is its own transaction, so
 * one bad row never blocks the others.
 */
@Service
public class StarterSeedService {

    /** The unique index on {@code question.source_ref} (V1__question_bank.sql). */
    static final String SOURCE_REF_CONSTRAINT = "question_source_ref_key";

    private static final Logger log = LoggerFactory.getLogger(StarterSeedService.class);

    private final SeedRowMapper mapper;
    private final JdbcQuestionRepository questions;
    private final JdbcSubjectTopicRepository subjectsAndTopics;
    private final TransactionTemplate transactions;

    public StarterSeedService(SeedRowMapper mapper, JdbcQuestionRepository questions,
            JdbcSubjectTopicRepository subjectsAndTopics, TransactionTemplate transactions) {
        this.mapper = mapper;
        this.questions = questions;
        this.subjectsAndTopics = subjectsAndTopics;
        this.transactions = transactions;
    }

    public SeedReport load(List<SeedRow> rows) {
        int loaded = 0;
        int skipped = 0;
        int unchanged = 0;
        List<String> problems = new ArrayList<>();
        for (SeedRow row : rows) {
            MappedSeedRow mapped = mapper.map(row);
            try {
                if (mapped.sourceRef() != null && questions.existsBySourceRef(mapped.sourceRef())) {
                    unchanged++;
                    continue;
                }
                if (!mapped.isValid()) {
                    skipped++;
                    for (FieldError error : mapped.errors()) {
                        problems.add(line(row.rowNumber(), error));
                    }
                    continue;
                }
                transactions.executeWithoutResult(status -> store(mapped));
                loaded++;
            } catch (RuntimeException e) {
                if (e instanceof DuplicateKeyException && isSourceRefConflict(e)) {
                    // The same sourceRef was stored earlier in this run (or concurrently).
                    unchanged++;
                } else {
                    // One row's failure never aborts the run.
                    skipped++;
                    problems.add(line(row.rowNumber(), new FieldError("row", "could not be stored: " + describe(e))));
                }
            }
        }
        problems.forEach(log::warn);
        SeedReport report = new SeedReport(loaded, skipped, unchanged, problems);
        log.info(report.summary());
        return report;
    }

    private void store(MappedSeedRow mapped) {
        Instant now = Instant.now();
        QuestionCandidate c = mapped.candidate();
        var subjectId = subjectsAndTopics.upsertSubject(c.subject(), now);
        var topicId = subjectsAndTopics.upsertTopic(subjectId, c.topic(), now);
        QuestionContent content = new QuestionContent(
                ContentCategory.parse(c.category()).orElseThrow(),
                subjectId,
                topicId,
                ExamLevel.parse(c.examLevel()).orElseThrow(),
                Difficulty.parse(c.difficulty()).orElseThrow(),
                Text.normaliseToNull(c.textMl()),
                Text.normaliseToNull(c.textEn()),
                c.options().stream().map(Text::normalise).toList(),
                c.answerIndex(),
                Text.normalise(c.explanation()),
                c.attribution());
        Question question = Question.create(mapped.sourceRef(), now);
        questions.insert(question);
        Instant reviewedAt = mapped.reviewedAt() != null ? mapped.reviewedAt() : now;
        questions.insertVersion(QuestionVersion.reviewedFirstVersion(question.id(), content, mapped.reviewedBy(), reviewedAt, now));
    }

    private static boolean isSourceRefConflict(RuntimeException e) {
        String message = NestedExceptionUtils.getMostSpecificCause(e).getMessage();
        return message != null && message.contains(SOURCE_REF_CONSTRAINT);
    }

    private static String describe(RuntimeException e) {
        String message = NestedExceptionUtils.getMostSpecificCause(e).getMessage();
        return message == null ? e.getClass().getSimpleName() : message;
    }

    private static String line(int rowNumber, FieldError error) {
        return "row " + rowNumber + " · " + error.field() + " · " + error.problem();
    }
}

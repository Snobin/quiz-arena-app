package in.minnal.core.question.application;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.internal.QuestionSetFilters;
import in.minnal.contracts.internal.QuestionSetRequest;
import in.minnal.contracts.internal.QuestionSetResponse;
import in.minnal.contracts.internal.QuestionSetTopic;
import in.minnal.contracts.internal.QuestionSource;
import in.minnal.core.question.domain.ContentCategory;
import in.minnal.core.question.domain.DrawCriteria;
import in.minnal.core.question.domain.ExamLevel;
import in.minnal.core.question.domain.QuestionContent;
import in.minnal.core.question.domain.QuestionVersion;
import in.minnal.core.question.domain.Text;
import in.minnal.core.question.infrastructure.JdbcQuestionRepository;
import in.minnal.core.question.infrastructure.JdbcSubjectTopicRepository;
import java.util.List;
import org.springframework.stereotype.Service;

/** Draws question sets for game-service (AD-12): exactly {@code count} questions, or an error. */
@Service
public class QuestionSetService {

    static final String CUSTOM_NOT_AVAILABLE = "custom source not available";

    private final JdbcQuestionRepository questions;
    private final JdbcSubjectTopicRepository topics;

    public QuestionSetService(JdbcQuestionRepository questions, JdbcSubjectTopicRepository topics) {
        this.questions = questions;
        this.topics = topics;
    }

    public QuestionSetResponse draw(QuestionSetRequest request) {
        DrawCriteria criteria = validate(request);
        List<QuestionVersion> drawn = questions.drawPublished(criteria);
        if (drawn.size() < criteria.count()) {
            throw new QuestionSetUnavailableException("not enough published questions match: requested "
                    + criteria.count() + ", available " + drawn.size());
        }
        QuestionSetTopic topic = null;
        if (criteria.topicId() != null) {
            topic = topics.topicWithSubject(criteria.topicId())
                    .map(t -> new QuestionSetTopic(t.topicId(), t.topicName(), t.subjectId(), t.subjectName()))
                    .orElseThrow(() -> new QuestionSetUnavailableException("topic not found"));
        }
        return new QuestionSetResponse(drawn.stream().map(QuestionSetService::toInternal).toList(), topic);
    }

    private static DrawCriteria validate(QuestionSetRequest request) {
        if (request == null) {
            throw new InvalidQuestionSetRequestException("request body is required");
        }
        if (request.source() == null) {
            throw new InvalidQuestionSetRequestException("source is required: BANK or CUSTOM");
        }
        Integer count = request.count();
        if (count == null || count < QuestionSetRequest.MIN_COUNT || count > QuestionSetRequest.MAX_COUNT) {
            throw new InvalidQuestionSetRequestException("count must be between " + QuestionSetRequest.MIN_COUNT
                    + " and " + QuestionSetRequest.MAX_COUNT);
        }
        QuestionSetFilters filters = request.filters();
        if (filters == null || Text.isBlank(filters.category())) {
            throw new InvalidQuestionSetRequestException("filters.category is required");
        }
        if (Text.isBlank(request.requesterId())) {
            throw new InvalidQuestionSetRequestException("requesterId is required");
        }
        if (request.source() == QuestionSource.CUSTOM) {
            throw new QuestionSetUnavailableException(CUSTOM_NOT_AVAILABLE);
        }
        ContentCategory category = ContentCategory.parse(filters.category())
                .orElseThrow(() -> new InvalidQuestionSetRequestException("filters.category is not a known category"));
        ExamLevel examLevel = null;
        if (!Text.isBlank(filters.examLevel())) {
            examLevel = ExamLevel.parse(filters.examLevel())
                    .orElseThrow(() -> new InvalidQuestionSetRequestException("filters.examLevel is not a known exam level"));
        }
        return new DrawCriteria(category, filters.subjectId(), filters.topicId(), examLevel, count);
    }

    private static InternalQuestion toInternal(QuestionVersion version) {
        QuestionContent c = version.content();
        return new InternalQuestion(version.questionId(), version.version(), c.textMl(), c.textEn(), c.options(),
                c.answerIndex(), c.explanation(), c.attribution());
    }
}

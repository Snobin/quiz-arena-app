package in.minnal.core.question.application;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.internal.QuestionSetCustomTopic;
import in.minnal.contracts.internal.QuestionSetFilters;
import in.minnal.contracts.internal.QuestionSetRequest;
import in.minnal.contracts.internal.QuestionSetResponse;
import in.minnal.contracts.internal.QuestionSetTopic;
import in.minnal.contracts.internal.QuestionSource;
import in.minnal.core.customtopic.application.CustomTopicRepository;
import in.minnal.core.question.domain.ContentCategory;
import in.minnal.core.question.domain.DrawCriteria;
import in.minnal.core.question.domain.ExamLevel;
import in.minnal.core.question.domain.OptionOrder;
import in.minnal.core.question.domain.QuestionContent;
import in.minnal.core.question.domain.QuestionVersion;
import in.minnal.core.question.domain.Text;
import in.minnal.core.question.infrastructure.JdbcQuestionRepository;
import in.minnal.core.question.infrastructure.JdbcSubjectTopicRepository;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** Draws question sets for game-service (AD-12): exactly {@code count} questions, or an error. */
@Service
public class QuestionSetService {

    private final JdbcQuestionRepository questions;
    private final JdbcSubjectTopicRepository topics;
    private final CustomTopicRepository custom;

    public QuestionSetService(JdbcQuestionRepository questions, JdbcSubjectTopicRepository topics, CustomTopicRepository custom) {
        this.questions = questions;
        this.topics = topics;
        this.custom = custom;
    }

    public QuestionSetResponse draw(QuestionSetRequest request) {
        if (request != null && request.source() == QuestionSource.CUSTOM) {
            return drawCustom(request);
        }
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

    /**
     * Story 6.5a: a host's own topic for a Battle Room. Owner-scoped in the SQL (a foreign and an unknown topic are the same
     * 404), exactly {@code count} distinct questions or a 422, never a short set.
     */
    private QuestionSetResponse drawCustom(QuestionSetRequest request) {
        Integer count = request.count();
        if (count == null || count < QuestionSetRequest.MIN_COUNT || count > QuestionSetRequest.MAX_COUNT) {
            throw new InvalidQuestionSetRequestException("count must be between " + QuestionSetRequest.MIN_COUNT
                    + " and " + QuestionSetRequest.MAX_COUNT);
        }
        if (request.filters() != null) {
            throw new InvalidQuestionSetRequestException("filters are not allowed for a CUSTOM source");
        }
        if (request.customTopicId() == null) {
            throw new InvalidQuestionSetRequestException("customTopicId is required for a CUSTOM source");
        }
        UUID requester;
        try {
            requester = Text.isBlank(request.requesterId()) ? null : UUID.fromString(request.requesterId());
        } catch (IllegalArgumentException e) {
            requester = null;
        }
        if (requester == null) {
            throw new InvalidQuestionSetRequestException("requesterId is required and must be a user id for a CUSTOM source");
        }
        CustomTopicRepository.Header header = custom.header(requester, request.customTopicId())
                .orElseThrow(() -> new QuestionSetNotFoundException("custom topic not found"));
        List<UUID> ids = new ArrayList<>(custom.questionIds(header.id()));
        if (ids.size() < count) {
            throw new QuestionSetUnavailableException("not enough questions in the custom topic: requested " + count
                    + ", available " + ids.size());
        }
        Collections.shuffle(ids, java.util.concurrent.ThreadLocalRandom.current());
        List<InternalQuestion> drawn = new ArrayList<>(count);
        for (UUID id : ids) {
            if (drawn.size() == count) {
                break;
            }
            // A re-import between the two reads removes the row: skip it and take the next.
            custom.question(header.id(), id).ifPresent(q -> drawn.add(toInternal(q, header.revision())));
        }
        if (drawn.size() < count) {
            throw new QuestionSetUnavailableException("not enough questions in the custom topic: requested " + count
                    + ", available " + drawn.size());
        }
        return new QuestionSetResponse(drawn, null, new QuestionSetCustomTopic(header.id(), header.name()));
    }

    private static InternalQuestion toInternal(CustomTopicRepository.Stored stored, int revision) {
        CustomTopicRepository.Row row = stored.row();
        OptionOrder order = OptionOrder.random(java.util.concurrent.ThreadLocalRandom.current());
        boolean ml = "ml".equals(row.lang());
        return new InternalQuestion(stored.id(), revision, ml ? row.text() : null, ml ? null : row.text(),
                order.apply(row.options()), order.shownIndexOf(row.answerIndex()), row.explanation(), null, null);
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
        // A fresh option order for every drawn set, so the same question is not always laid out the same way.
        OptionOrder order = OptionOrder.random(java.util.concurrent.ThreadLocalRandom.current());
        return new InternalQuestion(version.questionId(), version.version(), c.textMl(), c.textEn(),
                order.apply(c.options()), order.shownIndexOf(c.answerIndex()), c.explanation(), c.attribution(), c.topicId());
    }
}

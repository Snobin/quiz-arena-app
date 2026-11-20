package in.minnal.core.support;

import in.minnal.core.question.domain.ContentCategory;
import in.minnal.core.question.domain.Difficulty;
import in.minnal.core.question.domain.ExamLevel;
import in.minnal.core.question.domain.Question;
import in.minnal.core.question.domain.QuestionContent;
import in.minnal.core.question.domain.QuestionVersion;
import in.minnal.core.question.infrastructure.JdbcQuestionRepository;
import in.minnal.core.question.infrastructure.JdbcSubjectTopicRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** Inserts questions straight through the repositories for integration tests. */
@Component
public class QuestionFixtures {

    private final JdbcQuestionRepository questions;
    private final JdbcSubjectTopicRepository subjectsAndTopics;

    public QuestionFixtures(JdbcQuestionRepository questions, JdbcSubjectTopicRepository subjectsAndTopics) {
        this.questions = questions;
        this.subjectsAndTopics = subjectsAndTopics;
    }

    public record Placement(UUID subjectId, UUID topicId) {
    }

    public Placement placement(String subject, String topic) {
        Instant now = Instant.now();
        UUID subjectId = subjectsAndTopics.upsertSubject(subject, now);
        return new Placement(subjectId, subjectsAndTopics.upsertTopic(subjectId, topic, now));
    }

    public QuestionContent content(Placement placement, ContentCategory category, ExamLevel level, String textEn) {
        return content(placement, category, level, null, textEn);
    }

    public QuestionContent content(Placement placement, ContentCategory category, ExamLevel level, String textMl, String textEn) {
        return new QuestionContent(category, placement.subjectId(), placement.topicId(), level, Difficulty.EASY,
                textMl, textEn, List.of("A " + textEn, "B " + textEn, "C " + textEn, "D " + textEn), 2,
                "Explanation of " + textEn, "Kerala PSC test");
    }

    /** A live question with a published version 1; returns that version. */
    public QuestionVersion published(Placement placement, ContentCategory category, ExamLevel level, String textEn) {
        return published(placement, category, level, null, textEn);
    }

    public QuestionVersion published(Placement placement, ContentCategory category, ExamLevel level, String textMl, String textEn) {
        Instant now = Instant.now();
        Question question = Question.create(null, now);
        questions.insert(question);
        QuestionVersion v1 = QuestionVersion.reviewedFirstVersion(question.id(), content(placement, category, level, textMl, textEn), "Snobin", now, now);
        questions.insertVersion(v1);
        return v1;
    }

    public QuestionVersion published(Placement placement, String textEn) {
        return published(placement, ContentCategory.KERALA_PSC, ExamLevel.TENTH, textEn);
    }

    public QuestionVersion draft(Placement placement, String textEn) {
        return draft(placement, ContentCategory.KERALA_PSC, textEn);
    }

    public QuestionVersion draft(Placement placement, ContentCategory category, String textEn) {
        Instant now = Instant.now();
        Question question = Question.create(null, now);
        questions.insert(question);
        QuestionVersion v1 = QuestionVersion.firstDraft(question.id(), content(placement, category, ExamLevel.TENTH, textEn), now);
        questions.insertVersion(v1);
        return v1;
    }

    public QuestionVersion discarded(Placement placement, String textEn) {
        Instant now = Instant.now();
        Question question = Question.create(null, now);
        questions.insert(question);
        QuestionVersion v1 = QuestionVersion.firstDraft(question.id(), content(placement, ContentCategory.KERALA_PSC, ExamLevel.TENTH, textEn), now).discard();
        questions.insertVersion(v1);
        return v1;
    }

    public void insertVersion(QuestionVersion version) {
        questions.insertVersion(version);
    }

    public void softDelete(UUID questionId) {
        questions.softDelete(questionId, Instant.now());
    }
}

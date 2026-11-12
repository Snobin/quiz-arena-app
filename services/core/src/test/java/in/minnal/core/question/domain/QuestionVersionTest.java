package in.minnal.core.question.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class QuestionVersionTest {

    private static final Instant NOW = Instant.parse("2026-11-11T09:30:00Z");

    static QuestionContent content(String textEn) {
        return new QuestionContent(ContentCategory.KERALA_PSC, UUID.randomUUID(), UUID.randomUUID(), ExamLevel.TENTH,
                Difficulty.EASY, null, textEn, List.of("a", "b", "c", "d"), 1, "because", null);
    }

    @Test
    void publishedVersionRejectsEveryInPlaceChange() {
        QuestionVersion published = QuestionVersion.reviewedFirstVersion(UUID.randomUUID(), content("v1"), "Snobin", NOW, NOW);

        assertThatThrownBy(() -> published.reviseDraft(content("changed"))).isInstanceOf(ImmutableVersionException.class);
        assertThatThrownBy(() -> published.publish("Snobin", NOW)).isInstanceOf(ImmutableVersionException.class);
        assertThatThrownBy(published::discard).isInstanceOf(ImmutableVersionException.class);
        assertThat(published.content().textEn()).isEqualTo("v1");
    }

    @Test
    void discardedVersionIsAlsoFinal() {
        QuestionVersion discarded = QuestionVersion.firstDraft(UUID.randomUUID(), content("v1"), NOW).discard();
        assertThatThrownBy(() -> discarded.reviseDraft(content("x"))).isInstanceOf(ImmutableVersionException.class);
    }

    @Test
    void aChangeToAPublishedQuestionIsANewDraftVersion() {
        QuestionVersion published = QuestionVersion.reviewedFirstVersion(UUID.randomUUID(), content("v1"), "Snobin", NOW, NOW);
        QuestionVersion next = published.nextDraft(content("v2"), NOW);

        assertThat(next.version()).isEqualTo(2);
        assertThat(next.status()).isEqualTo(VersionStatus.DRAFT);
        assertThat(next.questionId()).isEqualTo(published.questionId());
        assertThat(next.id()).isNotEqualTo(published.id());
        assertThat(published.content().textEn()).isEqualTo("v1");
    }

    @Test
    void draftCanBeRevisedAndPublished() {
        QuestionVersion draft = QuestionVersion.firstDraft(UUID.randomUUID(), content("v1"), NOW);
        QuestionVersion published = draft.reviseDraft(content("v1 fixed")).publish("Snobin", NOW);

        assertThat(published.status()).isEqualTo(VersionStatus.PUBLISHED);
        assertThat(published.content().textEn()).isEqualTo("v1 fixed");
        assertThat(published.reviewedBy()).isEqualTo("Snobin");
    }
}

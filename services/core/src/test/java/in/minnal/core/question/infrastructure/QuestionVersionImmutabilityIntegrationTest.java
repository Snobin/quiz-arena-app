package in.minnal.core.question.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.minnal.core.question.domain.ContentCategory;
import in.minnal.core.question.domain.ExamLevel;
import in.minnal.core.question.domain.ImmutableVersionException;
import in.minnal.core.question.domain.QuestionVersion;
import in.minnal.core.question.domain.VersionStatus;
import in.minnal.core.support.PostgresIntegrationTest;
import in.minnal.core.support.QuestionFixtures;
import in.minnal.core.support.QuestionFixtures.Placement;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class QuestionVersionImmutabilityIntegrationTest extends PostgresIntegrationTest {

    @Autowired
    QuestionFixtures fixtures;

    @Autowired
    JdbcQuestionRepository questions;

    @Test
    void updatingAPublishedVersionInPlaceIsRejectedAndTheRowIsUnchanged() {
        Placement placement = fixtures.placement("Kerala Geography", "Rivers");
        QuestionVersion published = fixtures.published(placement, "original");
        // Bypass the domain guard on purpose: the repository must still refuse.
        QuestionVersion tampered = new QuestionVersion(published.id(), published.questionId(), published.version(),
                VersionStatus.PUBLISHED, fixtures.content(placement, ContentCategory.KERALA_PSC, ExamLevel.DEGREE, "tampered"),
                published.reviewedBy(), published.reviewedAt(), published.createdAt());

        assertThatThrownBy(() -> questions.updateDraft(tampered)).isInstanceOf(ImmutableVersionException.class);
        assertThatThrownBy(() -> published.reviseDraft(tampered.content())).isInstanceOf(ImmutableVersionException.class);

        QuestionVersion stored = questions.findVersion(published.id()).orElseThrow();
        assertThat(stored.content().textEn()).isEqualTo("original");
        assertThat(stored.content().examLevel()).isEqualTo(ExamLevel.TENTH);
        assertThat(stored.status()).isEqualTo(VersionStatus.PUBLISHED);
    }

    @Test
    void aDraftCanBeUpdatedAndPublished() {
        Placement placement = fixtures.placement("Kerala Geography", "Rivers");
        QuestionVersion draft = fixtures.draft(placement, "draft");

        questions.updateDraft(draft.reviseDraft(fixtures.content(placement, ContentCategory.KERALA_PSC, ExamLevel.TENTH, "draft fixed")));
        QuestionVersion revised = questions.findVersion(draft.id()).orElseThrow();
        questions.updateDraft(revised.publish("Snobin", Instant.now()));

        QuestionVersion stored = questions.findVersion(draft.id()).orElseThrow();
        assertThat(stored.content().textEn()).isEqualTo("draft fixed");
        assertThat(stored.status()).isEqualTo(VersionStatus.PUBLISHED);
        assertThat(stored.reviewedBy()).isEqualTo("Snobin");
    }

    @Test
    void aChangeToAPublishedQuestionIsStoredAsANewVersion() {
        Placement placement = fixtures.placement("Kerala Geography", "Rivers");
        QuestionVersion v1 = fixtures.published(placement, "v1");
        fixtures.insertVersion(v1.nextDraft(fixtures.content(placement, ContentCategory.KERALA_PSC, ExamLevel.TENTH, "v2"), Instant.now()));

        assertThat(questions.findVersions(v1.questionId()))
                .extracting(QuestionVersion::version, QuestionVersion::status, v -> v.content().textEn())
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(1, VersionStatus.PUBLISHED, "v1"),
                        org.assertj.core.groups.Tuple.tuple(2, VersionStatus.DRAFT, "v2"));
    }
}

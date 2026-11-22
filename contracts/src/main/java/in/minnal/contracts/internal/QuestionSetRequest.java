package in.minnal.contracts.internal;

import java.util.UUID;

/**
 * Body of {@code POST /internal/question-sets}.
 *
 * @param source        {@code BANK}, or {@code CUSTOM} (with {@code customTopicId} and no {@code filters}, Story 6.5a)
 * @param filters       required for {@code BANK} ({@code filters.category} is required); must be absent for {@code CUSTOM}
 * @param customTopicId only for {@code CUSTOM}
 * @param count         1–30; the response holds exactly this many questions or is a 422
 * @param requesterId   the JWT {@code sub} of the player the set is drawn for
 */
public record QuestionSetRequest(
        QuestionSource source, QuestionSetFilters filters, UUID customTopicId, Integer count, String requesterId) {

    public static final int MIN_COUNT = 1;
    public static final int MAX_COUNT = 30;
}

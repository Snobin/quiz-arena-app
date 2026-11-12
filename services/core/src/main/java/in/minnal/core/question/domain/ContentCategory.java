package in.minnal.core.question.domain;

import java.util.Optional;

/** The content family a question belongs to. Only {@code KERALA_PSC} is drawn by Quick Match. */
public enum ContentCategory {
    KERALA_PSC,
    SCHOOL_QUIZ,
    GENERAL_KERALA;

    public static Optional<ContentCategory> parse(String value) {
        return Enums.parse(ContentCategory.class, value);
    }
}

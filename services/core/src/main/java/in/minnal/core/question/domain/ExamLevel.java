package in.minnal.core.question.domain;

import java.util.Optional;

public enum ExamLevel {
    TENTH,
    DEGREE,
    OTHER;

    public static Optional<ExamLevel> parse(String value) {
        return Enums.parse(ExamLevel.class, value);
    }
}

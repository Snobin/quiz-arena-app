package in.minnal.core.question.domain;

import java.util.Optional;

public enum Difficulty {
    EASY,
    MEDIUM,
    HARD;

    public static Optional<Difficulty> parse(String value) {
        return Enums.parse(Difficulty.class, value);
    }
}

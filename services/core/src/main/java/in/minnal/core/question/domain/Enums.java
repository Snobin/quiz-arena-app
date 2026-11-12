package in.minnal.core.question.domain;

import java.util.Arrays;
import java.util.Optional;
import java.util.stream.Collectors;

final class Enums {

    private Enums() {
    }

    /** Exact, case-sensitive match on the constant name; blank or unknown values are empty. */
    static <E extends Enum<E>> Optional<E> parse(Class<E> type, String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        String trimmed = value.strip();
        return Arrays.stream(type.getEnumConstants()).filter(e -> e.name().equals(trimmed)).findFirst();
    }

    static String names(Class<? extends Enum<?>> type) {
        return Arrays.stream(type.getEnumConstants()).map(Enum::name).collect(Collectors.joining(", "));
    }
}

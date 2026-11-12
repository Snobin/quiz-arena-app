package in.minnal.core.question.domain;

import java.text.Normalizer;

/** Text normalisation shared by every question write path. */
public final class Text {

    private Text() {
    }

    /** NFC-normalises and trims; null stays null. */
    public static String normalise(String value) {
        return value == null ? null : Normalizer.normalize(value, Normalizer.Form.NFC).strip();
    }

    /** {@link #normalise(String)}, with a blank result returned as null. */
    public static String normaliseToNull(String value) {
        String normalised = normalise(value);
        return normalised == null || normalised.isEmpty() ? null : normalised;
    }

    public static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}

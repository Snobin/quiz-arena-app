package in.minnal.core.profile.domain;

import java.text.BreakIterator;
import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * The display-name rule (FR6, [ASSUMPTION] pending product sign-off). The web validator mirrors it; this
 * class is authoritative. NFC-normalise, trim, collapse whitespace, then require: 2-24 grapheme clusters,
 * only Latin letters, Malayalam (U+0D00-U+0D7F), ZWJ/ZWNJ, digits 0-9, space and . ' -, a leading letter,
 * no two punctuation marks in a row, and not a reserved name.
 */
public final class NameRule {

    public static final int MIN = 2;
    public static final int MAX = 24;

    private static final Pattern WHITESPACE = Pattern.compile("[\\s\\p{Z}\\uFEFF]+");
    private static final Pattern JOINER_RUN = Pattern.compile("[\\u200C\\u200D]{2,}");
    private static final Pattern GUEST = Pattern.compile("guest \\d+");

    private NameRule() {
    }

    /** The accepted, normalised name; or the error. */
    public record Result(String name, FieldError error) {
        public boolean valid() {
            return error == null;
        }
    }

    public static String normalise(String raw) {
        String nfc = Normalizer.normalize(raw == null ? "" : raw, Normalizer.Form.NFC);
        return WHITESPACE.matcher(nfc).replaceAll(" ").strip();
    }

    public static Result validate(String raw) {
        String name = normalise(raw);
        int length = graphemes(name);
        if (length < MIN || length > MAX) {
            return fail("length", "Use 2–24 letters");
        }
        for (int i = 0; i < name.length(); ) {
            int cp = name.codePointAt(i);
            if (!allowed(cp)) {
                return fail("chars", "Only letters, numbers, spaces and . ' - are allowed");
            }
            i += Character.charCount(cp);
        }
        if (JOINER_RUN.matcher(name).find()) {
            return fail("chars", "Only letters, numbers, spaces and . ' - are allowed");
        }
        if (!isLetter(name.codePointAt(0))) {
            return fail("start", "Start with a letter");
        }
        for (int i = 1; i < name.length(); i++) {
            if (isPunctuation(name.charAt(i)) && isPunctuation(name.charAt(i - 1))) {
                return fail("punctuation", "Don't use two punctuation marks in a row");
            }
        }
        if (reserved(name)) {
            return fail("reserved", "Choose a different name");
        }
        return new Result(name, null);
    }

    private static Result fail(String code, String message) {
        return new Result(null, new FieldError("displayName", code, message));
    }

    private static int graphemes(String text) {
        BreakIterator it = BreakIterator.getCharacterInstance(Locale.ROOT);
        it.setText(text);
        int count = 0;
        while (it.next() != BreakIterator.DONE) {
            count++;
        }
        return count;
    }

    private static boolean isMalayalam(int cp) {
        return cp >= 0x0D00 && cp <= 0x0D7F;
    }

    private static boolean isLetter(int cp) {
        if (isMalayalam(cp)) {
            return Character.isLetter(cp);
        }
        return Character.isLetter(cp) && Character.UnicodeScript.of(cp) == Character.UnicodeScript.LATIN;
    }

    private static boolean allowed(int cp) {
        return isLetter(cp) || isMalayalam(cp) || cp == 0x200C || cp == 0x200D
                || (cp >= '0' && cp <= '9') || cp == ' ' || isPunctuation(cp);
    }

    private static boolean isPunctuation(int cp) {
        return cp == '.' || cp == '\'' || cp == '-';
    }

    private static boolean reserved(String name) {
        // Compared without invisible joiners and with width/compatibility forms folded, so Ad<ZWJ>min or fullwidth
        // letters cannot stand in for a reserved name.
        String folded = Normalizer.normalize(name, Normalizer.Form.NFKC).replace("\u200C", "").replace("\u200D", "")
                .toLowerCase(Locale.ROOT);
        return folded.equals("minnal") || folded.equals("മിന്നൽ") || folded.equals("minnal bot")
                || folded.equals("bot") || folded.equals("admin") || GUEST.matcher(folded).matches();
    }
}

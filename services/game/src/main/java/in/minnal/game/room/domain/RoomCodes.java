package in.minnal.game.room.domain;

import java.util.Locale;
import java.util.Optional;
import java.util.function.Predicate;
import java.util.random.RandomGenerator;

/**
 * Room codes: 6 characters from the 31-character alphabet {@code A-Z} and {@code 2-9} without {@code 0 O 1 I L}
 * (about 8.9 x 10^8 codes), drawn from the injected generator (a {@code SecureRandom} in production, a seeded one in
 * tests). The canonical code has no hyphen and is shown as {@code XXX-XXX}; it is accepted in any case, with or without
 * the hyphen.
 */
public final class RoomCodes {

    public static final String ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    public static final int LENGTH = 6;
    /** More collisions than this in a row means the registry is absurdly full, not unlucky. */
    static final int MAX_DRAWS = 1000;

    private final RandomGenerator random;

    public RoomCodes(RandomGenerator random) {
        this.random = random;
    }

    /**
     * A code that {@code live} says is not taken: a collision is simply redrawn.
     *
     * @throws IllegalStateException when {@value #MAX_DRAWS} draws in a row collide
     */
    public String draw(Predicate<String> live) {
        for (int attempt = 0; attempt < MAX_DRAWS; attempt++) {
            StringBuilder code = new StringBuilder(LENGTH);
            for (int i = 0; i < LENGTH; i++) {
                code.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
            }
            String candidate = code.toString();
            if (!live.test(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException("no free room code after " + MAX_DRAWS + " draws");
    }

    /** The canonical form of what a player typed (any case, optional hyphen and spaces), or empty when it is no code. */
    public static Optional<String> normalize(String typed) {
        if (typed == null) {
            return Optional.empty();
        }
        String canonical = typed.replace("-", "").replace(" ", "").toUpperCase(Locale.ROOT);
        if (canonical.length() != LENGTH) {
            return Optional.empty();
        }
        for (int i = 0; i < LENGTH; i++) {
            if (ALPHABET.indexOf(canonical.charAt(i)) < 0) {
                return Optional.empty();
            }
        }
        return Optional.of(canonical);
    }

    /** {@code K7MQ2X} shown as {@code K7M-Q2X}. */
    public static String display(String canonical) {
        return canonical.substring(0, LENGTH / 2) + "-" + canonical.substring(LENGTH / 2);
    }
}

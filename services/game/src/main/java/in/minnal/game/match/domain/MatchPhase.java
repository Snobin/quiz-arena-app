package in.minnal.game.match.domain;

/**
 * Where a match is: {@code LEAD_IN} until Q1 opens, then {@code QUESTION_OPEN} and
 * {@code REVEALED} in turn per question, and {@code ENDED} after the last reveal.
 */
public enum MatchPhase {
    LEAD_IN,
    QUESTION_OPEN,
    REVEALED,
    ENDED
}

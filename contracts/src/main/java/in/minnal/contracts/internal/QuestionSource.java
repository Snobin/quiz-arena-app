package in.minnal.contracts.internal;

/** Where a match draws its questions from. {@code CUSTOM} is rejected with 422 until Epic 6. */
public enum QuestionSource {
    BANK,
    CUSTOM
}

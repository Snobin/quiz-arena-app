package in.minnal.core.question.application;

/** One {@code {questionId, version}} in a bulk request; both are raw so a bad item fails alone. */
public record DraftItem(String questionId, Integer version) {
}

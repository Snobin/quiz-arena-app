package in.minnal.core.question.application;

/** A player's report body. {@code matchId} is an opaque string from the client; core holds no match data. */
public record QuestionReportRequest(String note, String surface, String matchId) {
}

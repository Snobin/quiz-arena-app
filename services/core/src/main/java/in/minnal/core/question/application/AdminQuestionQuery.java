package in.minnal.core.question.application;

import java.util.UUID;

/** Validated filters for the admin question list; null means "no filter". */
public record AdminQuestionQuery(String state, String category, UUID subjectId, UUID topicId, String examLevel,
                                 String difficulty, String search, int page, int size) {
}

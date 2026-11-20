package in.minnal.core.question.application;

import java.util.List;

public record AdminQuestionPage(List<AdminQuestionRow> items, int page, int size, long totalItems) {
}

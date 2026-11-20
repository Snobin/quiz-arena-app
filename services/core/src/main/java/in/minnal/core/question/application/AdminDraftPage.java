package in.minnal.core.question.application;

import java.util.List;

public record AdminDraftPage(List<AdminDraft> items, int page, int size, long totalItems) {
}

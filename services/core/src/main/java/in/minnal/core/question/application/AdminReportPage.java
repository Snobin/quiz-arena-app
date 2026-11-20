package in.minnal.core.question.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Story 3.6: the report queue, one group per question version. */
public record AdminReportPage(List<Group> items, int page, int size, long totalItems) {

    public record Group(UUID questionId, long displayNo, int version, String textMl, String textEn,
                        Integer currentPublishedVersion, Integer pendingDraftVersion, int reportCount,
                        Instant firstReportedAt, Instant lastReportedAt, List<Report> reports) {
    }

    public record Report(UUID reportId, String note, String reporterName, String surface, Instant createdAt, String status,
                         String resolvedBy, Instant resolvedAt, String resolutionNote, Integer fixedByVersion) {
    }
}

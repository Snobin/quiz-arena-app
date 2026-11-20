package in.minnal.core.question.application;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.UUID;

/** The response of a CSV upload: what was imported as drafts and the rows that need fixing. */
public record CsvUploadResult(
        int importedCount,
        int errorCount,
        List<Imported> imported,
        List<String> createdSubjects,
        List<String> createdTopics,
        List<RowError> errors) {

    /** A question created from a row; {@code row} follows the spreadsheet (header = row 1). */
    public record Imported(int row, UUID questionId, long displayNo) {
    }

    /** One problem on a row; {@code errorCount} counts rows, not problems. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RowError(int row, String field, String problem, String fix) {
    }
}

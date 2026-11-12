package in.minnal.core.question.application;

import java.util.Map;

/**
 * One data row of a seed CSV, by column name. {@code rowNumber} follows the spreadsheet view: the
 * header is row 1 and the first data row is row 2. {@code structureProblem} is set when the row
 * cannot be trusted column by column (its cell count differs from the header's).
 */
public record SeedRow(int rowNumber, Map<String, String> values, String structureProblem) {

    public SeedRow(int rowNumber, Map<String, String> values) {
        this(rowNumber, values, null);
    }


    public static final java.util.List<String> COLUMNS = java.util.List.of(
            "category", "subject", "topic", "examLevel", "difficulty", "textMl", "textEn",
            "optionA", "optionB", "optionC", "optionD", "answerIndex", "explanation", "attribution",
            "sourceRef", "reviewedBy", "reviewedAt");

    public SeedRow {
        values = Map.copyOf(values);
    }


    /** The raw value, or an empty string when the column is absent. */
    public String get(String column) {
        return values.getOrDefault(column, "");
    }
}

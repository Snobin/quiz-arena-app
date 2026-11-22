package in.minnal.core.customtopic.application;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * One problem in a custom-topic import. {@code item} is the 1-based question number (null for the topic as a whole),
 * {@code line} and {@code column} point into the pasted text.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ImportError(Integer item, String field, String problem, String fix, Integer line, Integer column) {

    public static ImportError of(Integer item, String field, String problem, String fix) {
        return new ImportError(item, field, problem, fix, null, null);
    }
}

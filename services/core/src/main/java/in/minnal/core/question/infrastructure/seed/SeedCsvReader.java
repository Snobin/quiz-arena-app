package in.minnal.core.question.infrastructure.seed;

import in.minnal.core.question.application.SeedRow;
import java.io.IOException;
import java.io.InputStream;
import java.io.StringReader;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.core.io.Resource;

/**
 * Reads a seed CSV: strict UTF-8 (a leading BOM is tolerated), RFC 4180, header row first. Rows
 * are numbered as in a spreadsheet (header = row 1). A row whose cell count differs from the header
 * carries a structure problem. A file that cannot be read, is not valid UTF-8, lacks a required
 * column or repeats a header column is an {@link IOException}.
 */
public final class SeedCsvReader {

    private static final CSVFormat FORMAT = CSVFormat.RFC4180.builder()
            .setHeader()
            .setSkipHeaderRecord(true)
            .setIgnoreEmptyLines(true)
            .get();

    private SeedCsvReader() {
    }

    public static List<SeedRow> read(Resource resource) throws IOException {
        byte[] bytes;
        try (InputStream in = resource.getInputStream()) {
            bytes = in.readAllBytes();
        }
        return parse(decodeUtf8(bytes));
    }

    static List<SeedRow> parse(String content) throws IOException {
        if (!content.isEmpty() && content.charAt(0) == '﻿') {
            content = content.substring(1);
        }
        try (CSVParser parser = CSVParser.parse(new StringReader(content), FORMAT)) {
            List<String> header = parser.getHeaderNames().stream().map(String::strip).toList();
            List<String> duplicates = header.stream().filter(h -> header.indexOf(h) != header.lastIndexOf(h)).distinct().toList();
            if (!duplicates.isEmpty()) {
                throw new IOException("seed CSV header repeats column(s): " + String.join(", ", duplicates));
            }
            List<String> missing = SeedRow.COLUMNS.stream().filter(c -> !header.contains(c)).toList();
            if (!missing.isEmpty()) {
                throw new IOException("seed CSV header is missing column(s): " + String.join(", ", missing));
            }
            List<SeedRow> rows = new ArrayList<>();
            for (CSVRecord record : parser) {
                Map<String, String> values = new LinkedHashMap<>();
                List<String> cells = record.toList();
                for (int i = 0; i < header.size() && i < cells.size(); i++) {
                    values.put(header.get(i), cells.get(i) == null ? "" : cells.get(i));
                }
                String problem = cells.size() == header.size() ? null
                        : "has " + cells.size() + " cells, header has " + header.size();
                // The header is spreadsheet row 1. Records spanning several lines keep their own number.
                rows.add(new SeedRow((int) record.getRecordNumber() + 1, values, problem));
            }
            return rows;
        } catch (IllegalArgumentException | IllegalStateException | java.io.UncheckedIOException e) {
            throw new IOException("seed CSV could not be parsed: " + e.getMessage(), e);
        }
    }

    private static String decodeUtf8(byte[] bytes) throws IOException {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes))
                    .toString();
        } catch (CharacterCodingException e) {
            throw new IOException("seed CSV is not valid UTF-8", e);
        }
    }
}

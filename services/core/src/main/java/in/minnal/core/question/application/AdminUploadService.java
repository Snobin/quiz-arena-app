package in.minnal.core.question.application;

import in.minnal.core.question.domain.ContentCategory;
import in.minnal.core.question.domain.Difficulty;
import in.minnal.core.question.domain.ExamLevel;
import in.minnal.core.question.domain.FieldError;
import in.minnal.core.question.domain.Question;
import in.minnal.core.question.domain.QuestionCandidate;
import in.minnal.core.question.domain.QuestionContent;
import in.minnal.core.question.domain.QuestionValidator;
import in.minnal.core.question.domain.QuestionVersion;
import in.minnal.core.question.domain.Text;
import in.minnal.core.question.domain.VersionStatus;
import in.minnal.core.question.infrastructure.JdbcQuestionRepository;
import in.minnal.core.question.infrastructure.JdbcSubjectTopicRepository;
import in.minnal.core.question.infrastructure.csv.CsvText;
import java.io.IOException;
import java.io.StringReader;
import java.io.UncheckedIOException;
import java.nio.charset.CharacterCodingException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Story 3.3: imports a CSV of questions as DRAFT version-1 questions in one transaction. The whole
 * file is checked first (size, UTF-8, RFC 4180, header, row cap), then every row goes through the
 * shared {@link QuestionValidator}; valid rows are written together and bad rows are listed with
 * their spreadsheet row number (header = row 1). Duplicates by {@code sourceRef} (soft-deleted
 * questions included, and earlier rows of the same file) are never imported or overwritten. Nothing
 * is published.
 */
@Service
public class AdminUploadService {

    private static final Logger LOG = LoggerFactory.getLogger(AdminUploadService.class);

    public static final int MAX_BYTES = 2 * 1024 * 1024;
    public static final int MAX_ROWS = 1000;

    static final List<String> COLUMNS = List.of("category", "subject", "topic", "examLevel", "difficulty", "textMl", "textEn",
            "optionA", "optionB", "optionC", "optionD", "answerIndex", "explanation", "attribution", "sourceRef");
    /** Allowed but never read: a downloaded error file keeps its {@code errors} column, and seed files carry reviewer columns. */
    static final Set<String> IGNORED = Set.of("errors", "reviewedby", "reviewedat");

    static final String NOT_UTF8 = "Save the file as CSV UTF-8 and upload again";
    static final String ANSWER_FIX = "Use 0 for A … 3 for D";

    private static final CSVFormat FORMAT = CSVFormat.RFC4180.builder().setIgnoreEmptyLines(false).get();

    private final QuestionValidator validator;
    private final JdbcQuestionRepository questions;
    private final JdbcSubjectTopicRepository subjectsAndTopics;
    private final TransactionTemplate transactions;

    public AdminUploadService(QuestionValidator validator, JdbcQuestionRepository questions,
            JdbcSubjectTopicRepository subjectsAndTopics, TransactionTemplate transactions) {
        this.validator = validator;
        this.questions = questions;
        this.subjectsAndTopics = subjectsAndTopics;
        this.transactions = transactions;
    }

    /** A row with the right cell count, by lower-case column name, NFC-normalised, blank as null. */
    private record Pending(int row, Map<String, String> values) {
    }

    /** A row that passed validation, ready to store. */
    private record Valid(int row, String sourceRef, QuestionCandidate candidate) {
    }

    public CsvUploadResult upload(UUID actor, byte[] bytes) {
        List<CSVRecord> records = parse(bytes);
        List<String> header = checkHeader(records.get(0));
        List<CSVRecord> data = new ArrayList<>();
        for (CSVRecord record : records.subList(1, records.size())) {
            if (!isBlank(record)) {
                data.add(record);
            }
        }
        if (data.isEmpty()) {
            throw AdminWriteException.invalidFile("The file has a header but no questions. Add at least one question row.");
        }
        if (data.size() > MAX_ROWS) {
            throw AdminWriteException.invalidFile("File has " + String.format(Locale.US, "%,d", data.size())
                    + " rows; the limit is " + String.format(Locale.US, "%,d", MAX_ROWS) + ". Split it into smaller files.");
        }

        List<CsvUploadResult.RowError> errors = new ArrayList<>();
        List<Valid> valid = new ArrayList<>();
        Set<Integer> failedRows = new LinkedHashSet<>();
        Map<String, Integer> firstRowOfRef = new HashMap<>();
        List<Pending> pending = new ArrayList<>();
        for (CSVRecord record : data) {
            int row = (int) record.getRecordNumber();
            if (record.size() != header.size()) {
                errors.add(new CsvUploadResult.RowError(row, "row", "has " + record.size() + " cells, header has " + header.size(),
                        "Check for a missing or extra comma, or an unclosed quote."));
                failedRows.add(row);
                continue;
            }
            Map<String, String> values = new LinkedHashMap<>();
            for (int i = 0; i < header.size(); i++) {
                values.put(header.get(i), Text.normaliseToNull(record.get(i)));
            }
            pending.add(new Pending(row, values));
        }
        // Existing questions are looked up in one query for every sourceRef in the file.
        Set<String> refs = new LinkedHashSet<>();
        for (Pending p : pending) {
            String ref = p.values().get("sourceref");
            if (ref != null) {
                refs.add(ref);
            }
        }
        Map<String, Long> existing = questions.displayNosBySourceRef(refs);
        for (Pending p : pending) {
            int row = p.row();
            Map<String, String> values = p.values();
            String sourceRef = values.get("sourceref");
            List<FieldError> problems = new ArrayList<>();
            if (sourceRef != null && existing.containsKey(sourceRef)) {
                problems.add(new FieldError("sourceRef", "duplicate of Q " + existing.get(sourceRef),
                        "Remove this row, or give it a new sourceRef."));
            } else if (sourceRef != null && firstRowOfRef.containsKey(sourceRef)) {
                problems.add(new FieldError("sourceRef", "duplicate of row " + firstRowOfRef.get(sourceRef),
                        "Remove this row, or give it a new sourceRef."));
            } else {
                problems.addAll(check(values));
            }
            if (sourceRef != null) {
                firstRowOfRef.putIfAbsent(sourceRef, row);
            }
            if (problems.isEmpty()) {
                valid.add(new Valid(row, sourceRef, candidate(values)));
            } else {
                failedRows.add(row);
                for (FieldError e : problems) {
                    errors.add(new CsvUploadResult.RowError(row, e.field(), e.problem(), e.fix()));
                }
            }
        }
        errors.sort(java.util.Comparator.comparingInt(CsvUploadResult.RowError::row));

        if (valid.isEmpty()) {
            return new CsvUploadResult(0, failedRows.size(), List.of(), List.of(), List.of(), errors);
        }
        Stored stored = store(actor, valid);
        return new CsvUploadResult(stored.imported().size(), failedRows.size(), stored.imported(), stored.subjects(), stored.topics(), errors);
    }

    private record Stored(List<CsvUploadResult.Imported> imported, List<String> subjects, List<String> topics) {
    }

    private Stored store(UUID actor, List<Valid> valid) {
        try {
            return transactions.execute(status -> {
                Instant now = Instant.now();
                List<CsvUploadResult.Imported> imported = new ArrayList<>();
                List<String> createdSubjects = new ArrayList<>();
                List<String> createdTopics = new ArrayList<>();
                Map<String, UUID> subjectIds = new HashMap<>();
                Map<String, UUID> topicIds = new HashMap<>();
                for (Valid v : valid) {
                    QuestionCandidate c = v.candidate();
                    String subjectKey = c.subject().toLowerCase(Locale.ROOT);
                    UUID subjectId = subjectIds.get(subjectKey);
                    if (subjectId == null) {
                        JdbcSubjectTopicRepository.Created created = subjectsAndTopics.createSubject(c.subject(), now);
                        subjectId = created.id();
                        subjectIds.put(subjectKey, subjectId);
                        if (created.created()) {
                            createdSubjects.add(c.subject());
                        }
                    }
                    String topicKey = subjectKey + "\u0000" + c.topic().toLowerCase(Locale.ROOT);
                    UUID topicId = topicIds.get(topicKey);
                    if (topicId == null) {
                        JdbcSubjectTopicRepository.Created created = subjectsAndTopics.createTopic(subjectId, c.topic(), now);
                        topicId = created.id();
                        topicIds.put(topicKey, topicId);
                        if (created.created()) {
                            createdTopics.add(c.topic());
                        }
                    }
                    QuestionContent content = new QuestionContent(
                            ContentCategory.parse(c.category()).orElseThrow(), subjectId, topicId,
                            ExamLevel.parse(c.examLevel()).orElseThrow(), Difficulty.parse(c.difficulty()).orElseThrow(),
                            Text.normaliseToNull(c.textMl()), Text.normaliseToNull(c.textEn()),
                            c.options().stream().map(Text::normalise).toList(), c.answerIndex(),
                            Text.normalise(c.explanation()), Text.normaliseToNull(c.attribution()));
                    Question question = Question.create(v.sourceRef(), now);
                    questions.insert(question, actor);
                    questions.insertVersion(new QuestionVersion(UUID.randomUUID(), question.id(), 1, VersionStatus.DRAFT, content, null, null, now), actor);
                    imported.add(new CsvUploadResult.Imported(v.row(), question.id(), questions.displayNo(question.id())));
                }
                return new Stored(imported, createdSubjects, createdTopics);
            });
        } catch (DuplicateKeyException e) {
            // Another request stored the same sourceRef after the duplicate check; nothing was imported.
            throw AdminWriteException.conflict("Another upload added one of these source refs a moment ago. Nothing was imported. Upload the file again.");
        } catch (DataAccessException | TransactionException e) {
            LOG.atError().setCause(e).log("csv import failed");
            throw AdminWriteException.internal("The import failed and nothing was imported. Try again.");
        }
    }

    /** Decoded, parsed records (blank trailing lines dropped). Throws a file-level error when the file cannot be used. */
    private static List<CSVRecord> parse(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw AdminWriteException.invalidFile("The file is empty. Choose a CSV with a header row and at least one question.");
        }
        if (bytes.length > MAX_BYTES) {
            throw AdminWriteException.invalidFile("File is " + String.format(Locale.US, "%.1f", bytes.length / (1024.0 * 1024.0))
                    + " MB; the limit is 2 MB. Split it into smaller files.");
        }
        String content;
        try {
            content = CsvText.stripBom(CsvText.decodeUtf8(bytes));
        } catch (CharacterCodingException e) {
            throw AdminWriteException.invalidFile(NOT_UTF8);
        }
        List<CSVRecord> records;
        try (CSVParser parser = CSVParser.parse(new StringReader(content), FORMAT)) {
            records = new ArrayList<>(parser.getRecords());
        } catch (IOException | UncheckedIOException | IllegalStateException | IllegalArgumentException e) {
            throw AdminWriteException.invalidFile("The file is not valid CSV (" + e.getMessage() + "). Check for an unclosed quote.");
        }
        while (!records.isEmpty() && isBlank(records.get(records.size() - 1))) {
            records.remove(records.size() - 1);
        }
        if (records.isEmpty() || isBlank(records.get(0))) {
            throw AdminWriteException.invalidFile("The file is empty. Choose a CSV with a header row and at least one question.");
        }
        return records;
    }

    private static boolean isBlank(CSVRecord record) {
        for (String cell : record) {
            if (!Text.isBlank(cell)) {
                return false;
            }
        }
        return true;
    }

    /** The header as lower-case names (matched case-insensitively); a file-level error for a missing, unknown or repeated column. */
    private static List<String> checkHeader(CSVRecord record) {
        Map<String, String> canonical = new HashMap<>();
        COLUMNS.forEach(c -> canonical.put(c.toLowerCase(Locale.ROOT), c));
        List<String> header = new ArrayList<>();
        List<String> unknown = new ArrayList<>();
        List<String> repeated = new ArrayList<>();
        for (int i = 0; i < record.size(); i++) {
            String name = Text.normalise(record.get(i));
            String key = name.toLowerCase(Locale.ROOT);
            header.add(key);
            if (!canonical.containsKey(key) && !IGNORED.contains(key)) {
                unknown.add(name.isEmpty() ? "(column " + (i + 1) + " has no name)" : name);
            }
        }
        for (String key : header) {
            if (!key.isEmpty() && header.indexOf(key) != header.lastIndexOf(key) && !repeated.contains(key)) {
                repeated.add(canonical.getOrDefault(key, key));
            }
        }
        List<String> missing = COLUMNS.stream().filter(c -> !header.contains(c.toLowerCase(Locale.ROOT))).toList();
        if (!missing.isEmpty()) {
            throw AdminWriteException.invalidFile("The header is missing " + (missing.size() == 1 ? "the column " : "the columns ")
                    + String.join(", ", missing) + ".");
        }
        if (!unknown.isEmpty()) {
            throw AdminWriteException.invalidFile("The header has " + (unknown.size() == 1 ? "an unknown column: " : "unknown columns: ")
                    + String.join(", ", unknown) + ". Remove " + (unknown.size() == 1 ? "it" : "them") + " and upload again.");
        }
        if (!repeated.isEmpty()) {
            throw AdminWriteException.invalidFile("The header repeats " + (repeated.size() == 1 ? "the column " : "the columns ")
                    + String.join(", ", repeated) + ".");
        }
        return header;
    }

    private static QuestionCandidate candidate(Map<String, String> values) {
        Integer answerIndex = null;
        String raw = values.get("answerindex");
        if (raw != null) {
            try {
                answerIndex = Integer.valueOf(raw);
            } catch (NumberFormatException ignored) {
                // reported by check()
            }
        }
        return new QuestionCandidate(values.get("category"), values.get("subject"), values.get("topic"), values.get("examlevel"),
                values.get("difficulty"), values.get("textml"), values.get("texten"),
                List.of(orEmpty(values, "optiona"), orEmpty(values, "optionb"), orEmpty(values, "optionc"), orEmpty(values, "optiond")),
                answerIndex, values.get("explanation"), values.get("attribution"));
    }

    private static String orEmpty(Map<String, String> values, String key) {
        String v = values.get(key);
        return v == null ? "" : v;
    }

    /** Every problem with one row, from the shared validator plus the upload-only checks. */
    private List<FieldError> check(Map<String, String> values) {
        List<FieldError> problems = new ArrayList<>();
        String raw = values.get("answerindex");
        boolean answerNotANumber = false;
        if (raw != null) {
            try {
                Integer.parseInt(raw);
            } catch (NumberFormatException e) {
                answerNotANumber = true;
                problems.add(new FieldError("answerIndex", "must be a whole number 0–3 (got " + raw + ")", ANSWER_FIX));
            }
        }
        for (FieldError e : validator.validate(candidate(values))) {
            if (e.field().equals("answerIndex")) {
                if (!answerNotANumber) {
                    problems.add(new FieldError(e.field(), e.problem(), ANSWER_FIX));
                }
            } else {
                problems.add(e);
            }
        }
        for (String field : List.of("subject", "topic")) {
            String name = values.get(field);
            if (name != null && name.codePointCount(0, name.length()) > AdminQuestionService.MAX_NAME) {
                int length = name.codePointCount(0, name.length());
                problems.add(new FieldError(field, "must be at most " + AdminQuestionService.MAX_NAME + " characters (got " + length + ")",
                        "Shorten it by " + (length - AdminQuestionService.MAX_NAME) + " characters."));
            }
        }
        return problems;
    }
}

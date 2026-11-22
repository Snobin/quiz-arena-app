package in.minnal.core.customtopic.application;

import in.minnal.core.customtopic.application.CustomTopicJsonParser.ParsedImport;
import in.minnal.core.customtopic.application.CustomTopicJsonParser.ParsedQuestion;
import in.minnal.core.customtopic.application.CustomTopicRepository.Row;
import in.minnal.core.customtopic.application.CustomTopicRepository.Usage;
import in.minnal.core.question.domain.FieldError;
import in.minnal.core.question.domain.QuestionCandidate;
import in.minnal.core.question.domain.QuestionValidator;
import in.minnal.core.question.domain.Text;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;
import org.springframework.transaction.support.TransactionTemplate;

/** Story 6.1: validates a pasted custom topic completely and stores it, or stores nothing. */
@Service
public class CustomTopicService {

    public static final int MAX_NAME = 80;

    public record UsageView(int topics, int topicCap, int questions, int questionCap, boolean warn) {
    }

    public record ImportResult(UUID customTopicId, String name, int questionCount, int revision, UsageView usage) {
    }

    private final CustomTopicJsonParser parser;
    private final QuestionValidator validator;
    private final CustomTopicRepository repository;
    private final CustomTopicLimits limits;
    private final TransactionTemplate transactions;

    public CustomTopicService(CustomTopicJsonParser parser, QuestionValidator validator, CustomTopicRepository repository,
            CustomTopicLimits limits, TransactionTemplate transactions) {
        this.parser = parser;
        this.validator = validator;
        this.repository = repository;
        this.limits = limits;
        this.transactions = transactions;
    }

    public UsageView usage(UUID ownerId) {
        try {
            return view(repository.usage(ownerId));
        } catch (DataAccessException e) {
            throw CustomTopicException.internal();
        }
    }

    public ImportResult importTopic(UUID ownerId, String rawName, String json) {
        List<ImportError> errors = new ArrayList<>();
        String name = Text.normalise(rawName);
        String candidateName = name;
        ParsedImport parsed = parser.parse(json == null ? "" : json);
        if (parsed.syntaxError() != null) {
            nameProblem(errors, name == null || name.isEmpty() ? parsed.topic() : name, ownerId, false);
            errors.add(parsed.syntaxError());
            throw CustomTopicException.invalid(errors);
        }
        if (name == null || name.isEmpty()) {
            candidateName = Text.normalise(parsed.topic());
        }
        nameProblem(errors, candidateName, ownerId, true);
        errors.addAll(parsed.errors());
        if (parsed.questions().isEmpty() && parsed.errors().isEmpty()) {
            errors.add(ImportError.of(null, "questions", "needs at least 1 question", "Add at least one question to the list."));
        }
        List<Row> rows = new ArrayList<>();
        for (ParsedQuestion q : parsed.questions()) {
            validateQuestion(q, errors, rows);
        }
        if (!errors.isEmpty()) {
            errors.sort(Comparator.comparing((ImportError e) -> e.item() == null ? 0 : e.item())
                    .thenComparing(e -> e.line() == null ? 0 : e.line()));
            throw CustomTopicException.invalid(errors);
        }
        return store(ownerId, candidateName, rows);
    }

    /** Adds the topic-name problems (length, duplicate) so they are reported together with everything else. */
    private void nameProblem(List<ImportError> errors, String name, UUID ownerId, boolean checkDuplicate) {
        String normalised = Text.normalise(name);
        if (normalised == null || normalised.isEmpty()) {
            errors.add(ImportError.of(null, "name", "required: 1 to " + MAX_NAME + " characters", "Type a name for the topic."));
            return;
        }
        int length = normalised.codePointCount(0, normalised.length());
        if (length > MAX_NAME) {
            errors.add(ImportError.of(null, "name", "must be at most " + MAX_NAME + " characters (got " + length + ")",
                    "Shorten it by " + (length - MAX_NAME) + " characters."));
            return;
        }
        if (checkDuplicate && repositoryNameExists(ownerId, normalised)) {
            errors.add(duplicate(normalised));
        }
    }

    private boolean repositoryNameExists(UUID ownerId, String name) {
        try {
            return repository.nameExists(ownerId, key(name));
        } catch (DataAccessException e) {
            throw CustomTopicException.internal();
        }
    }

    private static ImportError duplicate(String name) {
        return ImportError.of(null, "name", "You already have a topic called '" + name + "'", "Choose a different name.");
    }

    private void validateQuestion(ParsedQuestion q, List<ImportError> errors, List<Row> rows) {
        QuestionCandidate candidate = new QuestionCandidate(null, null, null, null, null, null, q.text(), q.options(), q.answer(), q.explanation(), null);
        Set<ImportError> found = new LinkedHashSet<>();
        for (FieldError e : validator.validate(candidate, QuestionValidator.Profile.CUSTOM_TOPIC)) {
            String field = jsonField(e.field());
            if (q.typeErrors().contains(field)) {
                continue; // the parser already said what is wrong with this field
            }
            int[] at = q.fieldAt().get(field);
            int line = at != null ? at[0] : q.line();
            int column = at != null ? at[1] : q.column();
            found.add(new ImportError(q.item(), field, e.problem(), e.fix() != null ? e.fix() : defaultFix(field), line, column));
        }
        if (found.isEmpty() && q.typeErrors().isEmpty()) {
            String text = Text.normalise(q.text());
            List<String> options = q.options().stream().map(Text::normalise).toList();
            rows.add(new Row(q.item(), text, language(text), options, q.answer(), Text.normalise(q.explanation())));
        }
        errors.addAll(found);
    }

    private ImportResult store(UUID ownerId, String name, List<Row> rows) {
        UUID topicId = UUID.randomUUID();
        try {
            Usage after = transactions.execute(status -> {
                repository.lockOwner(ownerId);
                Usage usage = repository.usage(ownerId);
                if (repository.nameExists(ownerId, key(name))) {
                    throw CustomTopicException.invalid(List.of(duplicate(name)));
                }
                if (usage.topics() >= limits.maxTopics()) {
                    throw CustomTopicException.cap("You have " + usage.topics() + " of " + limits.maxTopics()
                            + " topics. Delete one to import a new topic.");
                }
                if (usage.questions() + rows.size() > limits.maxQuestions()) {
                    int left = Math.max(0, limits.maxQuestions() - usage.questions());
                    int over = rows.size() - left;
                    throw CustomTopicException.cap("This import has " + rows.size() + " questions. You have " + usage.questions() + " of "
                            + limits.maxQuestions() + " left, so remove " + over + " questions or delete an old topic.");
                }
                Instant now = Instant.now();
                repository.insertTopic(topicId, ownerId, name, key(name), rows.size(), now);
                repository.insertQuestions(topicId, rows);
                return new Usage(usage.topics() + 1, usage.questions() + rows.size());
            });
            return new ImportResult(topicId, name, rows.size(), 1, view(after));
        } catch (CustomTopicException e) {
            throw e;
        } catch (DataAccessException | TransactionException e) {
            throw CustomTopicException.internal();
        }
    }

    private UsageView view(Usage usage) {
        return new UsageView(usage.topics(), limits.maxTopics(), usage.questions(), limits.maxQuestions(), limits.warn(usage.topics(), usage.questions()));
    }

    /** NFC, trimmed, case-folded: the uniqueness key for a player's topic names. */
    static String key(String name) {
        return Text.normalise(name).toLowerCase(Locale.ROOT);
    }

    /** {@code ml} when the text has more Malayalam-script letters than Latin letters, else {@code en}. */
    static String language(String text) {
        int malayalam = 0;
        int latin = 0;
        for (int i = 0; i < text.length(); ) {
            int cp = text.codePointAt(i);
            i += Character.charCount(cp);
            if (cp >= 0x0D00 && cp <= 0x0D7F && Character.isLetter(cp)) {
                malayalam++;
            } else if (Character.isLetter(cp) && Character.UnicodeScript.of(cp) == Character.UnicodeScript.LATIN) {
                latin++;
            }
        }
        return malayalam > latin ? "ml" : "en";
    }

    private static final Map<String, String> FIELDS = Map.of("textMl", "question", "textEn", "question", "textMl/textEn", "question",
            "optionA", "options", "optionB", "options", "optionC", "options", "optionD", "options", "options", "options",
            "answerIndex", "answer", "explanation", "explanation");

    private static String jsonField(String validatorField) {
        return FIELDS.getOrDefault(validatorField, validatorField);
    }

    private static String defaultFix(String field) {
        return switch (field) {
            case "question" -> "Write the question text.";
            case "options" -> "Give exactly 4 different options.";
            case "answer" -> "Use a number from 0 to 3: the position of the right option, counting from 0.";
            case "explanation" -> "Add a short explanation of the answer.";
            default -> null;
        };
    }
}

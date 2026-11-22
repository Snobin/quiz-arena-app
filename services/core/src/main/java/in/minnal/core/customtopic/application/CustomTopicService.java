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
import java.util.Optional;
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

    public record TopicListItem(UUID customTopicId, String name, int questionCount, Instant updatedAt) {
    }

    public record TopicList(UsageView usage, List<TopicListItem> topics) {
    }

    public record QuestionView(int position, String text, String lang, List<String> options, int answerIndex, String explanation) {
    }

    public record TopicView(UUID customTopicId, String name, int questionCount, int revision, Instant updatedAt, List<QuestionView> questions) {
    }

    /** The validated name and rows of an import, ready to store. */
    private record Prepared(String name, List<Row> rows) {
    }

    public TopicList list(UUID ownerId) {
        try {
            List<TopicListItem> topics = repository.list(ownerId).stream()
                    .map(t -> new TopicListItem(t.id(), t.name(), t.questionCount(), t.updatedAt())).toList();
            return new TopicList(view(repository.usage(ownerId)), topics);
        } catch (DataAccessException e) {
            throw CustomTopicException.internal();
        }
    }

    /** One topic with its questions; the same 404 whether it does not exist or is someone else's. */
    public TopicView get(UUID ownerId, UUID topicId) {
        try {
            CustomTopicRepository.Detail d = repository.find(ownerId, topicId).orElseThrow(CustomTopicException::notFound);
            return new TopicView(d.id(), d.name(), d.questionCount(), d.revision(), d.updatedAt(),
                    d.rows().stream().map(r -> new QuestionView(r.position(), r.text(), r.lang(), r.options(), r.answerIndex(), r.explanation())).toList());
        } catch (DataAccessException e) {
            throw CustomTopicException.internal();
        }
    }

    public void delete(UUID ownerId, UUID topicId) {
        try {
            if (!repository.delete(ownerId, topicId)) {
                throw CustomTopicException.notFound();
            }
        } catch (DataAccessException e) {
            throw CustomTopicException.internal();
        }
    }

    public ImportResult importTopic(UUID ownerId, String rawName, String json) {
        Prepared prepared = prepare(ownerId, rawName, json, null);
        return store(ownerId, prepared.name(), prepared.rows());
    }

    /** Replaces a topic's name and questions with a re-import; the old ones count as freed, and a failure changes nothing. */
    public ImportResult replaceTopic(UUID ownerId, UUID topicId, String rawName, String json) {
        if (repositoryFind(ownerId, topicId).isEmpty()) {
            throw CustomTopicException.notFound();
        }
        Prepared prepared = prepare(ownerId, rawName, json, topicId);
        return storeReplacement(ownerId, topicId, prepared.name(), prepared.rows());
    }

    private Optional<CustomTopicRepository.Detail> repositoryFind(UUID ownerId, UUID topicId) {
        try {
            return repository.find(ownerId, topicId);
        } catch (DataAccessException e) {
            throw CustomTopicException.internal();
        }
    }

    /** Parses and validates a paste; {@code selfId} is the topic being replaced (its own name is not a clash). */
    private Prepared prepare(UUID ownerId, String rawName, String json, UUID selfId) {
        List<ImportError> errors = new ArrayList<>();
        String name = Text.normalise(rawName);
        String candidateName = name;
        ParsedImport parsed = parser.parse(json == null ? "" : json);
        if (parsed.syntaxError() != null) {
            nameProblem(errors, name == null || name.isEmpty() ? parsed.topic() : name, ownerId, selfId, false);
            errors.add(parsed.syntaxError());
            throw CustomTopicException.invalid(errors);
        }
        if (name == null || name.isEmpty()) {
            candidateName = Text.normalise(parsed.topic());
        }
        nameProblem(errors, candidateName, ownerId, selfId, true);
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
        return new Prepared(candidateName, rows);
    }

    /** Adds the topic-name problems (length, duplicate) so they are reported together with everything else. */
    private void nameProblem(List<ImportError> errors, String name, UUID ownerId, UUID selfId, boolean checkDuplicate) {
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
        if (checkDuplicate && repositoryNameExists(ownerId, normalised, selfId)) {
            errors.add(duplicate(normalised));
        }
    }

    private boolean repositoryNameExists(UUID ownerId, String name, UUID selfId) {
        try {
            return selfId == null ? repository.nameExists(ownerId, key(name)) : repository.nameExistsOther(ownerId, key(name), selfId);
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

    private ImportResult storeReplacement(UUID ownerId, UUID topicId, String name, List<Row> rows) {
        try {
            Usage[] after = new Usage[1];
            int[] revision = new int[1];
            transactions.executeWithoutResult(status -> {
                repository.lockOwner(ownerId);
                CustomTopicRepository.Detail old = repository.find(ownerId, topicId).orElseThrow(CustomTopicException::notFound);
                Usage usage = repository.usage(ownerId);
                int usedWithoutThis = usage.questions() - old.questionCount();
                if (repository.nameExistsOther(ownerId, key(name), topicId)) {
                    throw CustomTopicException.invalid(List.of(duplicate(name)));
                }
                if (usedWithoutThis + rows.size() > limits.maxQuestions()) {
                    int left = Math.max(0, limits.maxQuestions() - usedWithoutThis);
                    throw CustomTopicException.cap("This import has " + rows.size() + " questions. You have " + usedWithoutThis + " of "
                            + limits.maxQuestions() + " left, so remove " + (rows.size() - left) + " questions or delete an old topic.");
                }
                if (!repository.updateTopic(ownerId, topicId, name, key(name), rows.size(), Instant.now())) {
                    throw CustomTopicException.notFound();
                }
                repository.deleteQuestions(topicId);
                repository.insertQuestions(topicId, rows);
                after[0] = new Usage(usage.topics(), usedWithoutThis + rows.size());
                revision[0] = old.revision() + 1;
            });
            return new ImportResult(topicId, name, rows.size(), revision[0], view(after[0]));
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

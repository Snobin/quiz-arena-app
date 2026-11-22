package in.minnal.core.customtopic.application;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.core.ObjectReadContext;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.core.TokenStreamLocation;
import tools.jackson.core.exc.InputCoercionException;
import tools.jackson.core.json.JsonFactory;

/**
 * Strict streaming reader for the pasted custom-topic JSON {@code {"topic", "questions":[{question, options[4], answer,
 * explanation}]}}. No comments, no trailing commas, no duplicate keys. Unknown keys are skipped. It records where each
 * question and field starts so errors can point at a line and column, and reports type problems itself; the content
 * rules (counts, lengths, ranges) belong to the shared {@code QuestionValidator}.
 */
@Component
public class CustomTopicJsonParser {

    /** One question as written. A field with a wrong JSON type is left null and listed in {@code typeErrors}. */
    public record ParsedQuestion(int item, int line, int column, String text, List<String> options, Integer answer,
            String explanation, Map<String, int[]> fieldAt, Set<String> typeErrors) {
    }

    /** {@code syntaxError} is set when the text is not valid JSON; then nothing else is meaningful. */
    public record ParsedImport(String topic, List<ParsedQuestion> questions, List<ImportError> errors, ImportError syntaxError) {
    }

    private static final JsonFactory FACTORY = JsonFactory.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build();

    public ParsedImport parse(String text) {
        List<ImportError> errors = new ArrayList<>();
        List<ParsedQuestion> questions = new ArrayList<>();
        String topic = null;
        try (JsonParser p = FACTORY.createParser(ObjectReadContext.empty(), text)) {
            JsonToken t = p.nextToken();
            if (t == null) {
                errors.add(rootError("json", "is empty", "Paste the questions JSON."));
                return new ParsedImport(null, questions, errors, null);
            }
            if (t != JsonToken.START_OBJECT) {
                errors.add(at(null, "json", "must be a JSON object with a \"questions\" list", "Start with { and put the questions in a \"questions\" list.", p.currentTokenLocation()));
                p.skipChildren();
            } else {
                boolean hasQuestions = false;
                while ((t = p.nextToken()) == JsonToken.PROPERTY_NAME) {
                    String name = p.currentName();
                    t = p.nextToken();
                    if ("topic".equals(name)) {
                        if (t == JsonToken.VALUE_STRING) {
                            topic = p.getString();
                        } else if (t != JsonToken.VALUE_NULL) {
                            errors.add(at(null, "topic", "must be text", "Write the topic name in quotes, or remove the \"topic\" key.", p.currentTokenLocation()));
                            p.skipChildren();
                        }
                    } else if ("questions".equals(name)) {
                        hasQuestions = true;
                        if (t == JsonToken.START_ARRAY) {
                            readQuestions(p, questions, errors);
                        } else {
                            errors.add(at(null, "questions", "must be a list", "Put the questions in a list: \"questions\": [ ... ].", p.currentTokenLocation()));
                            p.skipChildren();
                        }
                    } else {
                        p.skipChildren();
                    }
                }
                if (!hasQuestions) {
                    errors.add(at(null, "questions", "required: a list of questions", "Add a \"questions\" list with at least 1 question.", p.currentTokenLocation()));
                }
            }
            if (p.nextToken() != null) {
                return new ParsedImport(null, List.of(), List.of(), at(null, "json", "has extra text after the JSON ends",
                        "Remove everything after the final }.", p.currentTokenLocation()));
            }
        } catch (JacksonException e) {
            return new ParsedImport(null, List.of(), List.of(), syntax(e));
        }
        return new ParsedImport(topic, questions, errors, null);
    }

    private static void readQuestions(JsonParser p, List<ParsedQuestion> questions, List<ImportError> errors) {
        int item = 0;
        JsonToken t;
        while ((t = p.nextToken()) != JsonToken.END_ARRAY) {
            item++;
            if (t != JsonToken.START_OBJECT) {
                errors.add(at(item, "question", "must be an object", "Write each question as { \"question\": ..., \"options\": [...], \"answer\": 0, \"explanation\": ... }.", p.currentTokenLocation()));
                p.skipChildren();
                continue;
            }
            questions.add(readQuestion(p, item, errors));
        }
    }

    private static ParsedQuestion readQuestion(JsonParser p, int item, List<ImportError> errors) {
        TokenStreamLocation start = p.currentTokenLocation();
        String text = null;
        String explanation = null;
        List<String> options = null;
        Integer answer = null;
        Map<String, int[]> fieldAt = new HashMap<>();
        Set<String> typeErrors = new HashSet<>();
        while (p.nextToken() == JsonToken.PROPERTY_NAME) {
            String name = p.currentName();
            JsonToken t = p.nextToken();
            TokenStreamLocation loc = p.currentTokenLocation();
            switch (name) {
                case "question" -> {
                    fieldAt.put("question", where(loc));
                    text = textValue(p, t, item, "question", loc, errors, typeErrors);
                }
                case "explanation" -> {
                    fieldAt.put("explanation", where(loc));
                    explanation = textValue(p, t, item, "explanation", loc, errors, typeErrors);
                }
                case "options" -> {
                    fieldAt.put("options", where(loc));
                    options = readOptions(p, t, item, loc, errors, typeErrors);
                }
                case "answer" -> {
                    fieldAt.put("answer", where(loc));
                    if (t == JsonToken.VALUE_NUMBER_INT) {
                        try {
                            answer = p.getIntValue();
                        } catch (InputCoercionException e) {
                            answer = Integer.MAX_VALUE;
                        }
                    } else if (t != JsonToken.VALUE_NULL) {
                        typeErrors.add("answer");
                        errors.add(at(item, "answer", "must be a whole number 0 to 3", "Use the position of the right option, counting from 0.", loc));
                        p.skipChildren();
                    }
                }
                default -> p.skipChildren();
            }
        }
        return new ParsedQuestion(item, start.getLineNr(), start.getColumnNr(), text, options, answer, explanation, fieldAt, typeErrors);
    }

    private static String textValue(JsonParser p, JsonToken t, int item, String field, TokenStreamLocation loc,
            List<ImportError> errors, Set<String> typeErrors) {
        if (t == JsonToken.VALUE_STRING) {
            return p.getString();
        }
        if (t != JsonToken.VALUE_NULL) {
            typeErrors.add(field);
            errors.add(at(item, field, "must be text", "Write it as text in quotes.", loc));
            p.skipChildren();
        }
        return null;
    }

    private static List<String> readOptions(JsonParser p, JsonToken t, int item, TokenStreamLocation loc,
            List<ImportError> errors, Set<String> typeErrors) {
        if (t == JsonToken.VALUE_NULL) {
            return null;
        }
        if (t != JsonToken.START_ARRAY) {
            typeErrors.add("options");
            errors.add(at(item, "options", "must be a list of 4 texts", "Write the options as [\"A\", \"B\", \"C\", \"D\"].", loc));
            p.skipChildren();
            return null;
        }
        List<String> options = new ArrayList<>();
        boolean bad = false;
        int n = 0;
        JsonToken e;
        while ((e = p.nextToken()) != JsonToken.END_ARRAY) {
            n++;
            if (e == JsonToken.VALUE_STRING) {
                options.add(p.getString());
            } else {
                bad = true;
                errors.add(at(item, "options", "option " + n + " must be text", "Write each option as text in quotes.", p.currentTokenLocation()));
                p.skipChildren();
            }
        }
        if (bad) {
            typeErrors.add("options");
            return null;
        }
        return options;
    }

    private static int[] where(TokenStreamLocation loc) {
        return new int[] {loc.getLineNr(), loc.getColumnNr()};
    }

    private static ImportError at(Integer item, String field, String problem, String fix, TokenStreamLocation loc) {
        return new ImportError(item, field, problem, fix, loc.getLineNr(), loc.getColumnNr());
    }

    private static ImportError rootError(String field, String problem, String fix) {
        return new ImportError(null, field, problem, fix, 1, 1);
    }

    private static ImportError syntax(JacksonException e) {
        TokenStreamLocation loc = e.getLocation();
        int line = loc == null ? 1 : Math.max(1, loc.getLineNr());
        int column = loc == null ? 1 : Math.max(1, loc.getColumnNr());
        String raw = e.getOriginalMessage() == null ? "" : e.getOriginalMessage();
        String firstLine = raw.lines().findFirst().orElse("");
        String problem;
        String fix;
        if (raw.contains("expecting comma") || raw.contains("expected a comma")) {
            problem = "Missing comma or closing bracket before line " + line + ", column " + column;
            fix = "Check the end of the previous line: add a comma between items, or close it with ] or }.";
        } else if (raw.contains("end-of-input") || raw.contains("Unexpected end")) {
            problem = "The JSON ends too early (line " + line + ", column " + column + ")";
            fix = "A closing ] or } is missing. Make sure every [ and { is closed.";
        } else if (raw.contains("Duplicate field")) {
            problem = "A key appears twice in the same object (line " + line + ", column " + column + ")";
            fix = "Remove the repeated key.";
        } else {
            problem = "Not valid JSON near line " + line + ", column " + column + ": " + firstLine;
            fix = "Check for a missing quote, an extra comma, or text outside the JSON.";
        }
        return new ImportError(null, "json", problem, fix, line, column);
    }
}

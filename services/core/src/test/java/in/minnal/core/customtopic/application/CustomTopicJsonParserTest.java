package in.minnal.core.customtopic.application;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.core.customtopic.application.CustomTopicJsonParser.ParsedImport;
import org.junit.jupiter.api.Test;

class CustomTopicJsonParserTest {

    private final CustomTopicJsonParser parser = new CustomTopicJsonParser();

    static final String OK = """
            {
              "topic": "Renaissance",
              "questions": [
                { "question": "Q1?", "options": ["a", "b", "c", "d"], "answer": 1, "explanation": "E1" },
                { "question": "Q2?", "options": ["a", "b", "c", "d"], "answer": 3, "explanation": "E2" }
              ]
            }
            """;

    @Test
    void readsAValidTopicWithPositions() {
        ParsedImport parsed = parser.parse(OK);
        assertThat(parsed.syntaxError()).isNull();
        assertThat(parsed.errors()).isEmpty();
        assertThat(parsed.topic()).isEqualTo("Renaissance");
        assertThat(parsed.questions()).hasSize(2);
        var second = parsed.questions().get(1);
        assertThat(second.item()).isEqualTo(2);
        assertThat(second.line()).isEqualTo(5);
        assertThat(second.options()).containsExactly("a", "b", "c", "d");
        assertThat(second.answer()).isEqualTo(3);
        assertThat(second.fieldAt().get("answer")[0]).isEqualTo(5);
    }

    @Test
    void ignoresUnknownKeysOnTheRootAndOnAQuestion() {
        ParsedImport parsed = parser.parse("""
                {"id": 7, "meta": {"x": [1, 2]}, "questions": [
                  {"id": 1, "difficulty": "easy", "question": "Q?", "options": ["a","b","c","d"], "answer": 0, "explanation": "E"}]}
                """);
        assertThat(parsed.errors()).isEmpty();
        assertThat(parsed.topic()).isNull();
        assertThat(parsed.questions()).hasSize(1);
    }

    @Test
    void aMissingCommaIsASyntaxErrorWithLineColumnAndALikelyCause() {
        ParsedImport parsed = parser.parse("{\n  \"questions\": [\n    {\"question\": \"Q?\" \"options\": []}\n  ]\n}");
        assertThat(parsed.syntaxError()).isNotNull();
        assertThat(parsed.syntaxError().line()).isEqualTo(3);
        assertThat(parsed.syntaxError().column()).isPositive();
        assertThat(parsed.syntaxError().problem()).contains("Missing comma");
    }

    @Test
    void aTruncatedPasteSaysTheJsonEndsTooEarly() {
        ParsedImport parsed = parser.parse("{\"questions\": [{\"question\": \"Q?\"");
        assertThat(parsed.syntaxError()).isNotNull();
        assertThat(parsed.syntaxError().problem()).contains("ends too early");
    }

    @Test
    void commentsTrailingCommasSingleQuotesAndDuplicateKeysAreSyntaxErrors() {
        for (String bad : new String[] {
                "{\"questions\": [] /* c */}",
                "{\"questions\": [],}",
                "{'questions': []}",
                "{\"questions\": [], \"questions\": []}"}) {
            assertThat(parser.parse(bad).syntaxError()).as(bad).isNotNull();
        }
    }

    @Test
    void textAfterTheJsonEndsIsRefused() {
        ParsedImport parsed = parser.parse("{\"questions\": []} trailing");
        assertThat(parsed.syntaxError()).isNotNull();
    }

    @Test
    void wrongTypesAreSchemaErrorsWithTheQuestionNumberAndPosition() {
        ParsedImport parsed = parser.parse("""
                {"topic": 5, "questions": [
                  {"question": "Q1?", "options": ["a","b","c","d"], "answer": 0, "explanation": "E"},
                  {"question": 7, "options": ["a", 2, "c", "d"], "answer": "1", "explanation": ["x"]},
                  "not an object"
                ]}
                """);
        assertThat(parsed.syntaxError()).isNull();
        assertThat(parsed.errors()).extracting(ImportError::item, ImportError::field)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(null, "topic"), org.assertj.core.groups.Tuple.tuple(2, "question"),
                        org.assertj.core.groups.Tuple.tuple(2, "options"), org.assertj.core.groups.Tuple.tuple(2, "answer"),
                        org.assertj.core.groups.Tuple.tuple(2, "explanation"), org.assertj.core.groups.Tuple.tuple(3, "question"));
        assertThat(parsed.errors()).allSatisfy(e -> assertThat(e.line()).isPositive());
        assertThat(parsed.questions().get(1).typeErrors()).contains("question", "options", "answer", "explanation");
    }

    @Test
    void aFloatAnswerAndAnOverflowingAnswerAreHandled() {
        ParsedImport parsed = parser.parse("""
                {"questions": [
                  {"question": "Q?", "options": ["a","b","c","d"], "answer": 1.5, "explanation": "E"},
                  {"question": "Q?", "options": ["a","b","c","d"], "answer": 99999999999999999999, "explanation": "E"}]}
                """);
        assertThat(parsed.errors()).extracting(ImportError::field).containsExactly("answer");
        assertThat(parsed.questions().get(1).answer()).isEqualTo(Integer.MAX_VALUE);
    }

    @Test
    void missingQuestionsAndANonObjectRootAreSchemaErrors() {
        assertThat(parser.parse("{\"topic\": \"T\"}").errors()).extracting(ImportError::field).containsExactly("questions");
        assertThat(parser.parse("[1, 2]").errors()).extracting(ImportError::field).containsExactly("json");
        assertThat(parser.parse("").errors()).extracting(ImportError::field).containsExactly("json");
        assertThat(parser.parse("{\"questions\": {}}").errors()).extracting(ImportError::field).containsExactly("questions");
    }
}

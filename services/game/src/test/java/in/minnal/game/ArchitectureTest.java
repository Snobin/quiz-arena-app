package in.minnal.game;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.contracts.scoring.Scoring;
import in.minnal.game.match.domain.MatchParticipant;
import in.minnal.game.match.domain.MatchState;
import in.minnal.game.matchmaking.application.QuestionSetClient;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * AD-4: no DB, Valkey or network I/O between a match's first question and its final reveal. The
 * match code may not even reach a JDBC, Spring Data (repositories, Redis) or HTTP client type, nor
 * the question-set client; its only effects are WebSocket sends. AD-7: scoring and reveal have no
 * bot branch.
 */
class ArchitectureTest {

    static JavaClasses classes;

    @BeforeAll
    static void importMain() {
        classes = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("in.minnal.game", "in.minnal.contracts");
    }

    @Test
    void matchCodeReachesNoDatabaseValkeyOrHttpClient() {
        ArchRule rule = noClasses().that().resideInAPackage("in.minnal.game.match..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "java.sql..",
                        "javax.sql..",
                        "org.springframework.jdbc..",
                        "org.springframework.data..",
                        "org.springframework.web.client..",
                        "org.springframework.http.client..",
                        "org.springframework.web.reactive.function.client..",
                        "java.net.http..",
                        "io.lettuce..",
                        "redis.clients..",
                        "org.redisson..")
                .orShould().dependOnClassesThat().areAssignableTo(QuestionSetClient.class)
                .orShould().dependOnClassesThat().areAssignableTo(java.net.URLConnection.class)
                .orShould().dependOnClassesThat().areAssignableTo(java.net.Socket.class)
                .because("AD-4: no DB, Valkey or network I/O during a match; effects are WebSocket sends only");
        rule.check(classes);
    }

    @Test
    void scoringAndRevealHaveNoBotBranch() {
        noClasses().that().belongToAnyOf(MatchState.class, MatchParticipant.class, Scoring.class)
                .should().dependOnClassesThat().belongToAnyOf(ParticipantKind.class)
                .because("AD-7: a bot is scored and revealed exactly like a human")
                .check(classes);
    }
}

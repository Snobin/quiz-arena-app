package in.minnal.game;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.contracts.scoring.Scoring;
import in.minnal.game.match.application.BotBrain;
import in.minnal.game.match.application.BotSettings;
import in.minnal.game.match.domain.MatchParticipant;
import in.minnal.game.match.domain.MatchState;
import in.minnal.game.matchmaking.application.MatchmakingService;
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

    /** FR40: a Battle Room holds humans only; its code cannot reach the bot brain, its settings or the pairing that adds a bot. */
    @Test
    void roomCodeCannotReachTheBotPath() {
        noClasses().that().resideInAPackage("in.minnal.game.room..")
                .should().dependOnClassesThat().belongToAnyOf(BotBrain.class, BotSettings.class, MatchmakingService.class)
                .orShould().dependOnClassesThat().haveFullyQualifiedName("in.minnal.game.matchmaking.application.MatchStarter")
                .orShould().dependOnClassesThat().haveFullyQualifiedName("in.minnal.game.matchmaking.application.MatchmakingActor")
                .orShould().dependOnClassesThat().haveSimpleNameStartingWith("Bot")
                .because("FR40: there is no bot path in rooms")
                .check(classes);
    }

    @Test
    void roomCodeDoesNotCallCore() {
        // Story 5.4: the room actor's start step (and the registry that hands it the client) is the one place a room asks
        // core for a set; nothing else in rooms may, and no room class may do I/O by itself.
        noClasses().that().resideInAPackage("in.minnal.game.room..")
                .and().haveSimpleNameNotStartingWith("RoomActor").and().haveSimpleNameNotStartingWith("RoomRegistry")
                .should().dependOnClassesThat().areAssignableTo(QuestionSetClient.class)
                .because("AD-2: game-service calls core only at match start, never while a room is in the lobby")
                .check(classes);
        noClasses().that().resideInAPackage("in.minnal.game.room..")
                .should().dependOnClassesThat().resideInAnyPackage("org.springframework.web.client..",
                        "org.springframework.http.client..", "java.net.http..", "java.sql..", "org.springframework.data..", "io.lettuce..")
                .because("AD-2: a room reaches core only through the question-set client")
                .check(classes);
    }

    @Test
    void matchmakingCanOnlyRequestBankSets() {
        // Story 6.5a: a player's own questions are for Battle Rooms and Solo Practice; Quick Match and Topic Duel have no
        // custom path. Only the HTTP client (which maps core's 404 for a custom request) may name the custom source.
        noClasses().that().resideInAPackage("in.minnal.game.matchmaking..")
                .and().haveSimpleNameNotStartingWith("HttpQuestionSetClient")
                .should().accessField(in.minnal.contracts.internal.QuestionSource.class, "CUSTOM")
                .because("Quick Match and Topic Duel only draw from the question bank")
                .check(classes);
    }

    @Test
    void scoringAndRevealHaveNoBotBranch() {
        noClasses().that().belongToAnyOf(MatchState.class, MatchParticipant.class, Scoring.class)
                .should().dependOnClassesThat().belongToAnyOf(ParticipantKind.class)
                .because("AD-7: a bot is scored and revealed exactly like a human")
                .check(classes);
    }
}

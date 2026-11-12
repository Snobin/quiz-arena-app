package in.minnal.game.match.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.Participant;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.game.match.domain.MatchShell;
import in.minnal.game.platform.session.Activity;
import in.minnal.game.platform.session.LastSessionClosed;
import in.minnal.game.platform.session.ParticipationRegistry;
import in.minnal.game.platform.session.PlayerSessions;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class MatchRegistryTest {

    final ParticipationRegistry participation = new ParticipationRegistry();
    final PlayerSessions sessions = new PlayerSessions(event -> { });
    MatchRegistry registry;

    @AfterEach
    void stop() {
        if (registry != null) {
            registry.destroy();
        }
    }

    MatchShell shell(String... subs) {
        Map<String, UUID> humans = new LinkedHashMap<>();
        for (String sub : subs) {
            humans.put(sub, UUID.randomUUID());
            participation.claim(sub, new Activity.Queued(MatchMode.QUICK));
        }
        List<Participant> participants = humans.entrySet().stream()
                .map(h -> new Participant(h.getValue(), h.getKey(), ParticipantKind.GUEST)).toList();
        return new MatchShell(UUID.randomUUID(), MatchMode.QUICK, participants, humans, List.of(), Map.of(), Map.of(), Instant.now());
    }

    @Test
    void creatingMovesHumansInMatchAndReleasesThemWhenAllDisconnect() {
        registry = new MatchRegistry(participation, sessions, Duration.ofMinutes(5));
        sessions.connected("a", "s1");
        sessions.connected("b", "s2");
        MatchShell shell = registry.create(shell("a", "b"));
        assertThat(participation.matchOf("a")).contains(shell.matchId());
        assertThat(participation.matchOf("b")).contains(shell.matchId());

        sessions.disconnected("a", "s1");
        registry.onLastSessionClosed(new LastSessionClosed("a"));
        assertThat(registry.find(shell.matchId())).isPresent(); // b is still here

        sessions.disconnected("b", "s2");
        registry.onLastSessionClosed(new LastSessionClosed("b"));
        assertThat(registry.find(shell.matchId())).isEmpty();
        assertThat(participation.activityOf("a")).isEmpty();
        assertThat(participation.activityOf("b")).isEmpty();
    }

    @Test
    void aShellWhoseHumansAreAlreadyGoneIsDiscardedAtOnce() {
        registry = new MatchRegistry(participation, sessions, Duration.ofMinutes(5));
        MatchShell shell = registry.create(shell("ghost"));
        assertThat(registry.find(shell.matchId())).isEmpty();
        assertThat(participation.activityOf("ghost")).isEmpty();
    }

    @Test
    void theTtlReleasesTheHumans() {
        registry = new MatchRegistry(participation, sessions, Duration.ofMillis(100));
        sessions.connected("a", "s1");
        MatchShell shell = registry.create(shell("a"));
        assertThat(participation.matchOf("a")).contains(shell.matchId());
        await().atMost(Duration.ofSeconds(3)).until(() -> registry.find(shell.matchId()).isEmpty());
        assertThat(participation.activityOf("a")).isEmpty();
    }

    @Test
    void releaseNeverFreesALaterActivity() {
        registry = new MatchRegistry(participation, sessions, Duration.ofMinutes(5));
        sessions.connected("a", "s1");
        MatchShell shell = registry.create(shell("a"));
        UUID later = UUID.randomUUID();
        participation.replace("a", new Activity.InMatch(later));
        registry.discard(shell.matchId(), "test");
        assertThat(participation.matchOf("a")).contains(later);
        // The expiry was cancelled with the discard (and leaves the queue).
        assertThat(registry.pendingExpiries()).isZero();
    }
}

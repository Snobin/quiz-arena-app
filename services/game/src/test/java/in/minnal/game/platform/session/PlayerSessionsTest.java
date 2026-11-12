package in.minnal.game.platform.session;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class PlayerSessionsTest {

    final List<Object> published = new ArrayList<>();
    final PlayerSessions sessions = new PlayerSessions(published::add);

    @Test
    void onlyTheLastSessionClosingPublishesOnce() {
        sessions.connected("anju", "s1");
        sessions.connected("anju", "s2");
        assertThat(sessions.sessionsOf("anju")).containsExactlyInAnyOrder("s1", "s2");
        published.clear(); // the SessionOpened events

        sessions.disconnected("anju", "s1");
        assertThat(published).isEmpty();
        assertThat(sessions.hasSession("anju")).isTrue();

        sessions.disconnected("anju", "s2");
        assertThat(published).containsExactly(new LastSessionClosed("anju"));
        assertThat(sessions.hasSession("anju")).isFalse();

        // Disconnect events may repeat for one session.
        sessions.disconnected("anju", "s2");
        sessions.disconnected("anju", "unknown");
        assertThat(published).hasSize(1);
    }

    @Test
    void anUnknownSessionDoesNotCloseTheOthers() {
        sessions.connected("vishnu", "s1");
        published.clear();
        sessions.disconnected("vishnu", "other");
        assertThat(sessions.hasSession("vishnu")).isTrue();
        assertThat(published).isEmpty();
    }

    /** Story 1.9: every new session is announced (a player in a match is connected again). */
    @Test
    void eachNewSessionPublishesSessionOpenedOnce() {
        sessions.connected("anju", "s1");
        sessions.connected("anju", "s2");
        sessions.connected("anju", "s2"); // a repeated connect event for the same session
        assertThat(published).containsExactly(new SessionOpened("anju"), new SessionOpened("anju"));
    }
}

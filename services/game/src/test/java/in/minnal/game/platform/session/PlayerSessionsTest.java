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
        sessions.disconnected("vishnu", "other");
        assertThat(sessions.hasSession("vishnu")).isTrue();
        assertThat(published).isEmpty();
    }
}

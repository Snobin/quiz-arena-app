package in.minnal.game.match.application;

/**
 * The rematch requests of an ended match (Story 1.10), as the match controller hands them on. The
 * rematch window lives outside {@code match..} (it fetches a question set), so this port is
 * implemented there.
 */
public interface RematchRequests {

    /** {@code sub} (from {@code sessionId}) asks for a rematch of the ended match {@code matchIdText}. */
    void request(String sub, String sessionId, String matchIdText);

    /** {@code sub} withdraws her pending request for {@code matchIdText}; ignored when none is pending. */
    void cancel(String sub, String matchIdText);
}

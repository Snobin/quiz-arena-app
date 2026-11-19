package in.minnal.game.platform.session;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * The players whose accounts were deleted (Story 2.8), in memory, rebuilt on boot by replaying
 * {@code minnal.user.deleted} from the start of the stream (like the rating cache). A deleted {@code sub} is refused at
 * STOMP CONNECT and matchmaking join, even with an unexpired access token; a match she is already in continues.
 * Nothing is ever removed: deletion is permanent.
 */
@Component
public class DeletedUsers {

    private final Set<String> subs = ConcurrentHashMap.newKeySet();

    public void add(String sub) {
        subs.add(sub);
    }

    public boolean contains(String sub) {
        return sub != null && subs.contains(sub);
    }
}

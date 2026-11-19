package in.minnal.core.profile.application;

import in.minnal.core.profile.domain.Profile;
import java.util.Optional;
import java.util.UUID;

public interface ProfileRepository {

    Optional<Profile> find(UUID userId);

    /** Insert or replace the player's profile. */
    void upsert(Profile profile);
}

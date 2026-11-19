package in.minnal.core.profile.application;

import in.minnal.core.identity.application.UserTokenService;
import in.minnal.core.profile.domain.District;
import in.minnal.core.profile.domain.FieldError;
import in.minnal.core.profile.domain.NameRule;
import in.minnal.core.profile.domain.Profile;
import in.minnal.core.question.domain.ExamLevel;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reads and saves the profile. A save validates every field (core is authoritative), then stores the
 * profile and the {@code minnal.user.profileUpdated} outbox row in one transaction.
 */
@Service
public class ProfileService {

    public static final String PROFILE_UPDATED = "minnal.user.profileUpdated";

    private final ProfileRepository profiles;
    private final OutboxRepository outbox;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final JsonMapper json;

    public ProfileService(ProfileRepository profiles, OutboxRepository outbox, TransactionTemplate tx, Clock clock, JsonMapper json) {
        this.profiles = profiles;
        this.outbox = outbox;
        this.tx = tx;
        this.clock = clock;
        this.json = json;
    }

    public ProfileView view(UUID userId) {
        return profiles.find(userId)
                .map(p -> new ProfileView(p.displayName(), p.district(), p.examLevel().name(), p.language(), true))
                .orElse(new ProfileView(null, null, null, null, false));
    }

    public ProfileView save(UUID userId, ProfileRequest request) {
        List<FieldError> errors = new ArrayList<>();
        NameRule.Result name = NameRule.validate(request == null ? null : request.displayName());
        if (!name.valid()) {
            errors.add(name.error());
        }
        String district = request == null ? null : request.district();
        if (district == null || !District.CODES.contains(district)) {
            errors.add(new FieldError("district", "district", "Choose your district"));
        }
        ExamLevel level = request == null ? null : ExamLevel.parse(request.examLevel()).orElse(null);
        if (level == null) {
            errors.add(new FieldError("examLevel", "examLevel", "Choose your exam level"));
        }
        String language = request == null ? null : request.language();
        try {
            UserTokenService.requireSupported(language);
        } catch (RuntimeException e) {
            errors.add(new FieldError("language", "language", "Choose Malayalam or English"));
        }
        if (!errors.isEmpty()) {
            throw new InvalidProfileException(errors);
        }
        Instant now = clock.instant();
        Profile profile = new Profile(userId, name.name(), district, level, language, now);
        tx.executeWithoutResult(status -> {
            profiles.upsert(profile);
            outbox.add(PROFILE_UPDATED, event(profile), now);
        });
        return new ProfileView(profile.displayName(), district, level.name(), language, true);
    }

    private String event(Profile p) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("eventId", UUID.randomUUID().toString());
        event.put("userId", p.userId().toString());
        event.put("displayName", p.displayName());
        event.put("district", p.district());
        event.put("examLevel", p.examLevel().name());
        event.put("language", p.language());
        event.put("updatedAt", p.updatedAt().toString());
        return json.writeValueAsString(event);
    }
}

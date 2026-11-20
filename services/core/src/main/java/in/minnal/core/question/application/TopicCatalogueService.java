package in.minnal.core.question.application;

import in.minnal.core.question.domain.ContentCategory;
import in.minnal.core.question.infrastructure.JdbcTopicCatalogueRepository;
import in.minnal.core.question.infrastructure.JdbcTopicCatalogueRepository.TopicRow;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * The player-facing topic catalogue (Story 4.1): topics with at least {@link TopicThreshold} published
 * questions, kept in memory for at most 60 s per category, plus each player's recent topics.
 */
@Service
public class TopicCatalogueService {

    static final Duration TTL = Duration.ofSeconds(60);
    static final int RECENT_KEEP = 5;
    static final int RECENT_SHOWN = 3;

    public record TopicItem(UUID topicId, String name, int publishedCount) {
    }

    public record SubjectItem(UUID subjectId, String name, List<TopicItem> topics) {
    }

    public record Catalogue(ContentCategory category, int minQuestions, List<SubjectItem> subjects) {
    }

    public record RecentTopic(UUID topicId, UUID subjectId, String name, int publishedCount) {
    }

    /** The serialized catalogue and its strong ETag (quoted hash of the body). */
    public record Snapshot(String body, String etag) {
    }

    private record Cached(Snapshot snapshot, Instant expiresAt) {
    }

    private final JdbcTopicCatalogueRepository repository;
    private final TopicThreshold threshold;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final JsonMapper json;
    private final Map<ContentCategory, Cached> cache = new EnumMap<>(ContentCategory.class);

    public TopicCatalogueService(JdbcTopicCatalogueRepository repository, TopicThreshold threshold, TransactionTemplate tx,
                                 Clock clock, JsonMapper json) {
        this.repository = repository;
        this.threshold = threshold;
        this.tx = tx;
        this.clock = clock;
        this.json = json;
    }

    public synchronized Snapshot catalogue(ContentCategory category) {
        Instant now = clock.instant();
        Cached cached = cache.get(category);
        if (cached != null && now.isBefore(cached.expiresAt())) {
            return cached.snapshot();
        }
        List<SubjectItem> subjects = new ArrayList<>();
        UUID current = null;
        List<TopicItem> topics = null;
        for (TopicRow row : repository.eligible(category, threshold.minQuestions())) {
            if (!row.subjectId().equals(current)) {
                topics = new ArrayList<>();
                subjects.add(new SubjectItem(row.subjectId(), row.subjectName(), topics));
                current = row.subjectId();
            }
            topics.add(new TopicItem(row.topicId(), row.topicName(), row.publishedCount()));
        }
        String body = json.writeValueAsString(new Catalogue(category, threshold.minQuestions(), subjects));
        Snapshot snapshot = new Snapshot(body, "\"" + sha256(body) + "\"");
        cache.put(category, new Cached(snapshot, now.plus(TTL)));
        return snapshot;
    }

    /** Drops the in-memory catalogue (tests share one service across cases). */
    public synchronized void invalidate() {
        cache.clear();
    }

    /** Records the use of a topic and keeps the 5 newest; false when the topic does not exist. */
    public boolean markUsed(UUID userId, UUID topicId) {
        if (!repository.topicExists(topicId)) {
            return false;
        }
        Instant now = clock.instant();
        try {
            tx.executeWithoutResult(status -> repository.touch(userId, topicId, now, RECENT_KEEP));
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            return false; // the topic was deleted after the check
        }
        return true;
    }

    /** Up to 3 recent topics, newest first, leaving out any that is no longer eligible. */
    public List<RecentTopic> recent(UUID userId) {
        return repository.recentEligible(userId, ContentCategory.KERALA_PSC, threshold.minQuestions(), RECENT_SHOWN).stream()
                .map(r -> new RecentTopic(r.topicId(), r.subjectId(), r.topicName(), r.publishedCount()))
                .toList();
    }

    private static String sha256(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}

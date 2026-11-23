package in.minnal.core.solo.application;

import com.fasterxml.jackson.annotation.JsonInclude;
import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.realtime.QuestionView;
import in.minnal.core.customtopic.application.CustomTopicRepository;
import in.minnal.core.question.application.TopicThreshold;
import in.minnal.core.question.domain.ContentCategory;
import in.minnal.core.question.domain.OptionOrder;
import in.minnal.core.question.domain.QuestionContent;
import in.minnal.core.question.domain.QuestionVersion;
import in.minnal.core.question.infrastructure.JdbcQuestionRepository;
import in.minnal.core.question.infrastructure.JdbcSubjectTopicRepository;
import in.minnal.core.solo.application.SoloException.Kind;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.random.RandomGenerator;
import org.springframework.stereotype.Service;

/**
 * Story 4.3: untimed, unrated practice on one bank topic. State lives only in Valkey; nothing here touches ratings,
 * boards or match history, publishes an event or calls another service. Correctness, the answer index, the explanation
 * and the attribution leave this class only in {@link AnswerResult} (AD-5).
 */
@Service
public class SoloPracticeService {

    private static final ContentCategory CATEGORY = ContentCategory.KERALA_PSC;
    private static final int CAS_ATTEMPTS = 4;

    /** The tagged source on the wire. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record SourceView(String type, UUID topicId, UUID customTopicId, String topicName, String subjectName) {
    }

    public record Started(UUID sessionId, SourceView source, int poolSize) {
    }

    /** A question without its answer, omitting absent languages. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record QuestionBody(UUID questionId, int version, String textMl, String textEn, List<String> options) {
        static QuestionBody of(QuestionView view) {
            return new QuestionBody(view.questionId(), view.version(), view.textMl(), view.textEn(), view.options());
        }
    }

    public record Next(int position, SourceView source, boolean reshuffled, QuestionBody question) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AnswerResult(boolean correct, int answerIndex, String explanation, String attribution,
                               int answeredCount, int correctCount) {
    }

    public record Summary(int answeredCount, int correctCount) {
    }

    private final SoloSessionStore store;
    private final JdbcQuestionRepository questions;
    private final JdbcSubjectTopicRepository topics;
    private final TopicThreshold threshold;
    private final CustomTopicRepository custom;
    private final RandomGenerator random;

    @org.springframework.beans.factory.annotation.Autowired
    public SoloPracticeService(SoloSessionStore store, JdbcQuestionRepository questions, JdbcSubjectTopicRepository topics,
                               TopicThreshold threshold, CustomTopicRepository custom) {
        this(store, questions, topics, threshold, custom, RandomGenerator.getDefault());
    }

    SoloPracticeService(SoloSessionStore store, JdbcQuestionRepository questions, JdbcSubjectTopicRepository topics,
                        TopicThreshold threshold, CustomTopicRepository custom, RandomGenerator random) {
        this.store = store;
        this.questions = questions;
        this.topics = topics;
        this.threshold = threshold;
        this.custom = custom;
        this.random = random;
    }

    public Started start(UUID userId, String sourceType, UUID topicId) {
        if (SoloSession.Source.CUSTOM.equals(sourceType)) {
            return startCustom(userId, topicId);
        }
        if (!SoloSession.Source.BANK.equals(sourceType) || topicId == null) {
            throw new SoloException(Kind.INVALID, "source must be {type: BANK, topicId}.");
        }
        JdbcSubjectTopicRepository.TopicWithSubject topic = topics.topicWithSubject(topicId)
                .orElseThrow(() -> new SoloException(Kind.NOT_FOUND, "Topic not found."));
        List<UUID> pool = shuffled(questions.publishedQuestionIds(topicId, CATEGORY));
        if (pool.size() < threshold.minQuestions()) {
            throw new SoloException(Kind.TOPIC_UNAVAILABLE, "This topic has too few questions right now.");
        }
        SoloSession session = new SoloSession(UUID.randomUUID(), userId, new SoloSession.Source(SoloSession.Source.BANK, topicId),
                1, pool, 0, null, 0, 0);
        store.create(session);
        return new Started(session.sessionId(), view(session.source(), topic), pool.size());
    }

    /** Story 6.4: owner-only; no minimum size (nothing is rated), and an unknown or foreign topic is the same 404. */
    private Started startCustom(UUID userId, UUID customTopicId) {
        if (customTopicId == null) {
            throw new SoloException(Kind.INVALID, "source must be {type: CUSTOM, customTopicId}.");
        }
        CustomTopicRepository.Header header = custom.header(userId, customTopicId)
                .orElseThrow(() -> new SoloException(Kind.NOT_FOUND, "Topic not found."));
        List<UUID> pool = shuffled(custom.questionIds(customTopicId));
        if (pool.isEmpty()) {
            throw new SoloException(Kind.TOPIC_UNAVAILABLE, "This topic has no questions right now.");
        }
        SoloSession session = new SoloSession(UUID.randomUUID(), userId, SoloSession.Source.custom(customTopicId, header.revision()),
                1, pool, 0, null, 0, 0);
        store.create(session);
        return new Started(session.sessionId(), customView(session.source(), header.name()), pool.size());
    }

    public Next next(UUID userId, UUID sessionId) {
        for (int attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
            SoloSessionStore.Versioned stored = owned(userId, sessionId);
            SoloSession session = stored.session();
            if (session.source().isCustom()) {
                Next served = nextCustom(userId, stored);
                if (served != null) {
                    return served;
                }
                continue;
            }
            JdbcSubjectTopicRepository.TopicWithSubject topic = topicOf(session);
            SoloSession.Current open = session.current();
            if (open != null && !open.answered()) {
                QuestionVersion served = questions.findVersion(open.questionId(), open.version())
                        .orElseThrow(() -> new SoloException(Kind.NOT_FOUND, "Practice session not found."));
                return next(session, topic, served, open.reshuffled());
            }
            Advance advance = advance(session);
            if (store.replace(stored, advance.session())) {
                return next(advance.session(), topic, advance.served(), advance.session().current().reshuffled());
            }
        }
        throw new SoloException(Kind.CONFLICT, "The session changed; try again.");
    }

    public AnswerResult answer(UUID userId, UUID sessionId, UUID questionId, int version, int optionIndex) {
        if (optionIndex < 0 || optionIndex > 3) {
            throw new SoloException(Kind.INVALID, "optionIndex must be 0-3.");
        }
        for (int attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
            SoloSessionStore.Versioned stored = owned(userId, sessionId);
            SoloSession session = stored.session();
            if (session.source().isCustom()) {
                AnswerResult result = answerCustom(userId, stored, questionId, version, optionIndex);
                if (result != null) {
                    return result;
                }
                continue;
            }
            SoloSession.Current current = session.current();
            if (current == null || current.answered() || !current.questionId().equals(questionId) || current.version() != version) {
                throw new SoloException(Kind.CONFLICT, "That question is not the one being practised.");
            }
            QuestionContent content = questions.findVersion(questionId, version)
                    .orElseThrow(() -> new SoloException(Kind.CONFLICT, "That question is not the one being practised."))
                    .content();
            OptionOrder order = orderFor(session, questionId, version);
            int shownAnswer = order.shownIndexOf(content.answerIndex());
            boolean correct = optionIndex == shownAnswer;
            SoloSession next = session.withAnswer(correct);
            if (store.replace(stored, next)) {
                return new AnswerResult(correct, shownAnswer, content.explanation(), content.attribution(),
                        next.answeredCount(), next.correctCount());
            }
        }
        throw new SoloException(Kind.CONFLICT, "That question was already answered.");
    }

    public Summary end(UUID userId, UUID sessionId) {
        SoloSession session = owned(userId, sessionId).session();
        store.delete(session);
        return new Summary(session.answeredCount(), session.correctCount());
    }

    /** The custom topic as it is now, owner-scoped; a deleted topic ends the session's usefulness with 404 topic-deleted. */
    private CustomTopicRepository.Header customHeader(UUID userId, SoloSession session) {
        return custom.header(userId, session.source().topicId())
                .orElseThrow(() -> new SoloException(Kind.TOPIC_DELETED, "This topic was deleted."));
    }

    /** Null when the compare-and-set lost a race (the caller retries). */
    private Next nextCustom(UUID userId, SoloSessionStore.Versioned stored) {
        SoloSession session = stored.session();
        CustomTopicRepository.Header header = customHeader(userId, session);
        UUID topicId = header.id();
        boolean stale = session.source().revision() == null || session.source().revision() != header.revision();
        SoloSession.Current open = session.current();
        if (!stale && open != null && !open.answered()) {
            Optional<CustomTopicRepository.Stored> served = custom.question(topicId, open.questionId());
            if (served.isPresent()) {
                return customNext(session, header, served.get(), open.reshuffled());
            }
            stale = true;
        }
        SoloSession base = session;
        boolean reshuffled = false;
        if (stale) {
            // Re-imported: every question id changed. Rebuild from the current questions and keep the tally.
            base = session.withSource(SoloSession.Source.custom(topicId, header.revision()))
                    .withCurrent(null, 0, session.cycle() + 1, shuffled(custom.questionIds(topicId)));
            reshuffled = true;
        }
        List<UUID> order = base.order();
        int cursor = base.cursor();
        int cycle = base.cycle();
        while (true) {
            if (cursor >= order.size()) {
                if (reshuffled) {
                    // The pool was already rebuilt in this call and is spent (or empty): nothing servable.
                    throw new SoloException(Kind.TOPIC_UNAVAILABLE, "This topic has no questions right now.");
                }
                UUID last = base.current() == null ? null : base.current().questionId();
                order = shuffled(custom.questionIds(topicId));
                if (last != null && order.size() > 1 && order.get(0).equals(last)) {
                    Collections.swap(order, 0, 1 + random.nextInt(order.size() - 1));
                }
                cursor = 0;
                cycle++;
                reshuffled = true;
                continue;
            }
            UUID id = order.get(cursor++);
            Optional<CustomTopicRepository.Stored> found = custom.question(topicId, id);
            if (found.isPresent()) {
                SoloSession next = base.withCurrent(new SoloSession.Current(id, header.revision(), false, reshuffled), cursor, cycle, order);
                if (store.replace(stored, next)) {
                    return customNext(next, header, found.get(), reshuffled);
                }
                return null;
            }
            // A question vanished between reads (re-import): skip it; the next call sees the new revision.
        }
    }

    /** Null when the compare-and-set lost a race (the caller retries). */
    private AnswerResult answerCustom(UUID userId, SoloSessionStore.Versioned stored, UUID questionId, int version, int optionIndex) {
        SoloSession session = stored.session();
        CustomTopicRepository.Header header = customHeader(userId, session);
        if (session.source().revision() == null || session.source().revision() != header.revision()) {
            throw new SoloException(Kind.TOPIC_CHANGED, "This topic was updated.");
        }
        SoloSession.Current current = session.current();
        if (current == null || current.answered() || !current.questionId().equals(questionId) || current.version() != version) {
            throw new SoloException(Kind.CONFLICT, "That question is not the one being practised.");
        }
        CustomTopicRepository.Row row = custom.question(header.id(), questionId)
                .orElseThrow(() -> new SoloException(Kind.TOPIC_CHANGED, "This topic was updated.")).row();
        int shownAnswer = orderFor(session, questionId, version).shownIndexOf(row.answerIndex());
        boolean correct = optionIndex == shownAnswer;
        SoloSession next = session.withAnswer(correct);
        if (!store.replace(stored, next)) {
            return null;
        }
        return new AnswerResult(correct, shownAnswer, row.explanation(), null, next.answeredCount(), next.correctCount());
    }

    private Next customNext(SoloSession session, CustomTopicRepository.Header header, CustomTopicRepository.Stored served, boolean reshuffled) {
        CustomTopicRepository.Row row = served.row();
        OptionOrder order = orderFor(session, served.id(), header.revision());
        InternalQuestion internal = new InternalQuestion(served.id(), header.revision(), row.textMl(), row.textEn(),
                order.apply(row.options()), order.shownIndexOf(row.answerIndex()), row.explanation(), null);
        return new Next(session.answeredCount() + 1, customView(session.source(), header.name()), reshuffled,
                QuestionBody.of(QuestionView.of(internal)));
    }

    private static SourceView customView(SoloSession.Source source, String topicName) {
        return new SourceView(SoloSession.Source.CUSTOM, null, source.topicId(), topicName, null);
    }

    private record Advance(SoloSession session, QuestionVersion served) {
    }

    /** Moves to the next servable question, rebuilding the pool once when every id has been served. */
    private Advance advance(SoloSession session) {
        List<UUID> order = session.order();
        int cursor = session.cursor();
        int cycle = session.cycle();
        boolean reshuffled = false;
        UUID topicId = session.source().topicId();
        while (true) {
            if (cursor >= order.size()) {
                if (reshuffled) {
                    throw new SoloException(Kind.TOPIC_UNAVAILABLE, "This topic has no questions right now.");
                }
                UUID last = session.current() == null ? null : session.current().questionId();
                order = rebuild(topicId, last);
                cursor = 0;
                cycle++;
                reshuffled = true;
                continue;
            }
            UUID id = order.get(cursor++);
            Optional<QuestionVersion> latest = questions.latestPublished(id)
                    .filter(v -> v.content().topicId().equals(topicId) && v.content().category() == CATEGORY);
            if (latest.isPresent()) {
                QuestionVersion v = latest.get();
                SoloSession next = session.withCurrent(new SoloSession.Current(id, v.version(), false, reshuffled), cursor, cycle, order);
                return new Advance(next, v);
            }
        }
    }

    private List<UUID> rebuild(UUID topicId, UUID lastAnswered) {
        List<UUID> pool = shuffled(questions.publishedQuestionIds(topicId, CATEGORY));
        if (lastAnswered != null && pool.size() > 1 && pool.get(0).equals(lastAnswered)) {
            Collections.swap(pool, 0, 1 + random.nextInt(pool.size() - 1));
        }
        return pool;
    }

    private List<UUID> shuffled(List<UUID> ids) {
        List<UUID> copy = new ArrayList<>(ids);
        Collections.shuffle(copy, random);
        return copy;
    }

    private SoloSessionStore.Versioned owned(UUID userId, UUID sessionId) {
        return store.find(sessionId).filter(s -> s.session().userId().equals(userId))
                .orElseThrow(() -> new SoloException(Kind.NOT_FOUND, "Practice session not found."));
    }

    private JdbcSubjectTopicRepository.TopicWithSubject topicOf(SoloSession session) {
        return topics.topicWithSubject(session.source().topicId())
                .orElseThrow(() -> new SoloException(Kind.NOT_FOUND, "Practice session not found."));
    }

    private static SourceView view(SoloSession.Source source, JdbcSubjectTopicRepository.TopicWithSubject topic) {
        return new SourceView(source.type(), source.topicId(), null, topic.topicName(), topic.subjectName());
    }

    private static Next next(SoloSession session, JdbcSubjectTopicRepository.TopicWithSubject topic, QuestionVersion served,
                             boolean reshuffled) {
        QuestionContent c = served.content();
        OptionOrder order = orderFor(session, served.questionId(), served.version());
        InternalQuestion internal = new InternalQuestion(served.questionId(), served.version(), c.textMl(), c.textEn(),
                order.apply(c.options()), order.shownIndexOf(c.answerIndex()), c.explanation(), c.attribution());
        return new Next(session.answeredCount() + 1, view(session.source(), topic), reshuffled,
                QuestionBody.of(QuestionView.of(internal)));
    }

    /** Stable for a session, question and version, so a reload and the answer check see the order that was shown. */
    private static OptionOrder orderFor(SoloSession session, UUID questionId, int version) {
        return OptionOrder.seeded(java.util.Objects.hash(session.sessionId(), questionId, version));
    }
}

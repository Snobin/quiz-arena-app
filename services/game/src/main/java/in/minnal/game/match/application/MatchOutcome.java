package in.minnal.game.match.application;

import in.minnal.contracts.events.CompletedParticipant;
import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.realtime.BreakdownAnswer;
import in.minnal.contracts.realtime.MatchEndedPayload;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.ParticipantBreakdown;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.contracts.realtime.ResultParticipant;
import in.minnal.contracts.realtime.ResultQuestion;
import in.minnal.contracts.scoring.Ranking;
import in.minnal.game.match.domain.MatchResults;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.match.domain.RecordedAnswer;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Turns a completed match's {@link MatchResults} into its {@code MATCH_ENDED} payload and its
 * {@code minnal.match.completed} event (Story 1.10). Both place participants with the shared
 * {@link Ranking}. The participant kind is read here, never in the scoring domain: only to map the
 * event's {@code userId} (the {@code sub} of a {@code USER} participant; absent for guests and bots).
 */
final class MatchOutcome {

    private final MatchSetup setup;
    private final MatchResults results;
    private final List<Integer> placements;

    MatchOutcome(MatchSetup setup, MatchResults results) {
        this.setup = setup;
        this.results = results;
        this.placements = Ranking.placements(results.entries(), MatchResults.Entry::score,
                MatchResults.Entry::correctCount, MatchResults.Entry::forfeited, setup.mode() != MatchMode.BATTLE_ROOM);
    }

    MatchEndedPayload matchEnded() {
        List<ResultParticipant> participants = new ArrayList<>();
        List<ParticipantBreakdown> breakdown = new ArrayList<>();
        for (int i = 0; i < results.entries().size(); i++) {
            MatchResults.Entry entry = results.entries().get(i);
            participants.add(new ResultParticipant(entry.participant().participantId(), entry.participant().displayName(),
                    entry.participant().kind(), entry.score(), entry.correctCount(), entry.forfeited(), placements.get(i)));
            List<BreakdownAnswer> answers = new ArrayList<>();
            for (int q = 0; q < results.asked().size(); q++) {
                int answerIndex = results.asked().get(q).answerIndex();
                answers.add(entry.answers().get(q).map(answer -> answerOf(answer, answerIndex))
                        .orElseGet(BreakdownAnswer::missed));
            }
            breakdown.add(new ParticipantBreakdown(entry.participant().participantId(), answers));
        }
        List<ResultQuestion> questions = results.asked().stream().map(MatchOutcome::questionOf).toList();
        return new MatchEndedPayload(setup.matchId(), setup.mode(), setup.questionSource(), participants, questions,
                breakdown, setup.topic(), setup.room());
    }

    MatchCompletedEvent completedEvent(Instant endedAt) {
        List<CompletedParticipant> participants = new ArrayList<>();
        for (int i = 0; i < results.entries().size(); i++) {
            MatchResults.Entry entry = results.entries().get(i);
            String userId = entry.participant().kind() == ParticipantKind.USER ? entry.sub().orElse(null) : null;
            participants.add(new CompletedParticipant(entry.participant().participantId(), userId,
                    entry.participant().kind(), entry.participant().displayName(), entry.score(), entry.correctCount(),
                    entry.forfeited(), placements.get(i)));
        }
        Long queueWaitMs = setup.queueWaitMs().values().stream().max(Long::compare).orElse(null);
        UUID roomId = setup.room() == null ? null : setup.room().roomId();
        return MatchCompletedEvent.of(setup.matchId(), setup.mode(), roomId, setup.questionSource(),
                results.q1StartedAt() != null ? results.q1StartedAt() : endedAt, endedAt, queueWaitMs, participants);
    }

    private static BreakdownAnswer answerOf(RecordedAnswer answer, int answerIndex) {
        return new BreakdownAnswer(answer.pickedIndex(), answer.pickedIndex() == answerIndex, answer.responseMs(),
                answer.points());
    }

    private static ResultQuestion questionOf(InternalQuestion question) {
        return new ResultQuestion(question.questionId(), question.version(), question.textMl(), question.textEn(),
                question.options(), question.answerIndex(), question.explanation(), question.attribution(), question.topicId());
    }
}

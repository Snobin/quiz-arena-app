package in.minnal.contracts.realtime;

import java.util.UUID;

/**
 * One participant's outcome on a revealed question.
 *
 * @param pickedIndex the option she picked, or null (omitted) when she did not answer
 * @param correct     whether the pick was the answer
 * @param points      what the answer scored ({@code Scoring.points})
 * @param totalScore  her running total after this question
 */
public record ParticipantResult(UUID participantId, Integer pickedIndex, boolean correct, int points, int totalScore) {
}

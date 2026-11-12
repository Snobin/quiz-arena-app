package in.minnal.contracts.realtime;

/** Live match modes. Guests may play only {@code QUICK} (AD-9). */
public enum MatchMode {
    QUICK,
    TOPIC_DUEL,
    BATTLE_ROOM;

    /**
     * Whether {@code ANSWER_ACCEPTED} tells the answering player her own result (1v1 modes), or is a
     * receipt only (Battle Room, where a fast player could call out answers). AD-5, Story 1.11.
     */
    public boolean revealsOwnAnswerAtAck() {
        return this == QUICK || this == TOPIC_DUEL;
    }
}

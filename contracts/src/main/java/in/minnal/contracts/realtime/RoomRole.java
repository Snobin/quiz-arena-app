package in.minnal.contracts.realtime;

/** What a player is in a Battle Room: its host (creator) or a member. Story 5.1 only ever sends {@code HOST}. */
public enum RoomRole {
    HOST,
    MEMBER
}

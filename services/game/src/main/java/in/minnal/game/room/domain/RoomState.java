package in.minnal.game.room.domain;

import in.minnal.contracts.realtime.Participant;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.contracts.realtime.RoomSource;
import in.minnal.contracts.realtime.RoomView;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * A Battle Room's state. Thread-confined: only the room actor's thread touches it. The humans are kept in join order,
 * the host first; a room has no way to add a bot (FR40: every participant is built {@code USER}).
 */
public final class RoomState {

    /** The most humans a room holds, the host included (FR34). */
    public static final int MAX_HUMANS = 50;

    private record Member(UUID participantId, String displayName) {
    }

    private final UUID roomId;
    private final String code;
    private final String hostSub;
    private final Instant createdAt;
    private final Instant expiresAt;
    private final Map<String, Member> members = new LinkedHashMap<>();
    private RoomSource source;
    private int questionCount;
    private RoomPhase phase = RoomPhase.LOBBY;
    private long seq;

    /** A new lobby holding only its host. */
    public RoomState(UUID roomId, String code, String hostSub, String hostName, RoomConfigRules.Config config,
            Instant createdAt, Instant expiresAt) {
        this.roomId = roomId;
        this.code = code;
        this.hostSub = hostSub;
        this.source = config.source();
        this.questionCount = config.questionCount();
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
        members.put(hostSub, new Member(UUID.randomUUID(), hostName));
    }

    public UUID roomId() {
        return roomId;
    }

    public String code() {
        return code;
    }

    public String hostSub() {
        return hostSub;
    }

    public Instant createdAt() {
        return createdAt;
    }

    public Instant expiresAt() {
        return expiresAt;
    }

    public RoomPhase phase() {
        return phase;
    }

    public void end() {
        phase = RoomPhase.ENDED;
    }

    public boolean isHost(String sub) {
        return hostSub.equals(sub);
    }

    public boolean isMember(String sub) {
        return members.containsKey(sub);
    }

    public List<String> memberSubs() {
        return List.copyOf(members.keySet());
    }

    public int humanCount() {
        return members.size();
    }

    public boolean isFull() {
        return members.size() >= MAX_HUMANS;
    }

    /**
     * Adds {@code sub} as a {@code USER} participant with a fresh participant id (never her {@code sub}); the caller has
     * checked the phase, the cap and that she is not in yet.
     *
     * @return her participant id
     */
    public UUID add(String sub, String displayName) {
        if (members.containsKey(sub)) {
            throw new IllegalStateException("already a member");
        }
        if (isFull()) {
            throw new IllegalStateException("room full");
        }
        Member member = new Member(UUID.randomUUID(), displayName);
        members.put(sub, member);
        return member.participantId();
    }

    /**
     * Removes a member who is not the host (a host leaving closes the room instead).
     *
     * @return her participant id, or null when she was not in the room
     */
    public UUID remove(String sub) {
        if (isHost(sub)) {
            throw new IllegalStateException("the host is not removed; the room closes");
        }
        Member member = members.remove(sub);
        return member == null ? null : member.participantId();
    }

    public UUID participantIdOf(String sub) {
        Member member = members.get(sub);
        return member == null ? null : member.participantId();
    }

    public RoomConfigRules.Config config() {
        return new RoomConfigRules.Config(source, questionCount);
    }

    /** Replaces the configuration; the caller then broadcasts {@code ROOM_LOBBY_UPDATED} with {@link #nextSeq()}. */
    public void configure(RoomConfigRules.Config config) {
        this.source = config.source();
        this.questionCount = config.questionCount();
    }

    /** The last lobby broadcast's {@code seq}; 0 before the first. */
    public long seq() {
        return seq;
    }

    public long nextSeq() {
        return ++seq;
    }

    public RoomView view() {
        List<Participant> participants = new ArrayList<>();
        members.values().forEach(m -> participants.add(new Participant(m.participantId(), m.displayName(), ParticipantKind.USER)));
        return new RoomView(participantIdOf(hostSub), source, questionCount, source.rated(), expiresAt, participants,
                participants.size());
    }
}

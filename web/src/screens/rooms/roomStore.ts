import { create } from 'zustand';
import type {
  ErrorCode,
  RoomConfigRequest,
  RoomLobbyPhase,
  RoomRole,
  RoomStartFailedReason,
  RoomView,
} from '../../realtime/protocol.ts';

/**
 * The Battle Room client's public surface (split out of `roomClient.ts`, Epic 6 retro): the session and store types, the
 * Zustand store the screens read, the timeouts and the `RoomClient` interface. `roomClient.ts` holds the one
 * implementation (the socket, the ordering rules) and re-exports all of this, so importers are unchanged.
 */

export type RoomSession = { roomId: string; code: string; role: RoomRole; selfParticipantId: string; room: RoomView; lastSeq: number };

/** Why a create, join, configure or resume failed: a server `ERROR` code, or a local reason (`BAD_CODE`: never sent). */
export type RoomErrorCode = ErrorCode | 'CONNECTION' | 'TIMEOUT' | 'BAD_CODE';
export type RoomError = { code: RoomErrorCode; roomId?: string; matchId?: string };

/**
 * Why she was sent back to the Rooms tab. `HOST_CLOSED`: a player whose host left (or dropped past her grace), with
 * `noticeHost` naming the host; `LOST`: a player whose own connection did not come back.
 */
export type RoomNotice = 'EXPIRED' | 'DISCONNECTED' | 'DRAINING' | 'CLOSED' | 'HOST_CLOSED' | 'LOST';

export type RoomPhase = 'idle' | 'creating' | 'joining' | 'resuming' | 'lobby';

/** The membership change of the last applied lobby broadcast (for the chips and the announcements). */
export type LobbyEvent = { seq: number; joined: string[]; left: string[] };

/** A join that failed from a link: the Rooms tab shows it under the field, with the code prefilled. */
export type JoinFailure = { typed: string; error: RoomError };

export type RoomState = {
  phase: RoomPhase;
  session: RoomSession | null;
  /** A configure sent and not yet answered. */
  configuring: boolean;
  /** The last failed create (before a lobby exists) or configure (inside it). */
  error: RoomError | null;
  /** Set when the room ended under her; the Rooms tab shows it once. */
  notice: RoomNotice | null;
  /** The host's name for a `HOST_CLOSED` notice (inserted unchanged). */
  noticeHost: string | null;
  reconnecting: boolean;
  /** A start sent and not yet answered, and the last start's refusal (`SERVER_DRAINING`, a timeout...). */
  starting: boolean;
  startError: RoomError | null;
  /** `STARTING` while the host's start fetches the set (every lobby shows it), else `LOBBY` (Story 5.4). */
  lobbyPhase: RoomLobbyPhase;
  /** Why the last start did not go ahead (ROOM_START_FAILED); cleared by the next start or a change of topic. */
  startFailure: RoomStartFailedReason | null;
  lobbyEvent: LobbyEvent | null;
  joinFailure: JoinFailure | null;
};

export const INITIAL_ROOM_STATE: RoomState = {
  phase: 'idle',
  session: null,
  configuring: false,
  error: null,
  notice: null,
  noticeHost: null,
  reconnecting: false,
  starting: false,
  startError: null,
  lobbyPhase: 'LOBBY',
  startFailure: null,
  lobbyEvent: null,
  joinFailure: null,
};

export const useRoom = create<RoomState>(() => INITIAL_ROOM_STATE);

/** A create with no reply within this fails (the player can try again). */
export const CREATE_TIMEOUT_MS = 10_000;
/** A configure with no reply within this stops waiting. */
export const CONFIGURE_TIMEOUT_MS = 8_000;
/** A resume, or a reconnect, with no `ROOM_JOINED` within this finds the room gone. */
export const RESUME_TIMEOUT_MS = 5_000;
/** A join with no reply within this fails (she can try again). */
export const JOIN_TIMEOUT_MS = 10_000;
/** A lobby `resync` with no `ROOM_JOINED` within this is sent again. */
export const RESYNC_RETRY_MS = 3_000;

export type CreateResult = { ok: true; session: RoomSession } | { ok: false; error: RoomError };
export type JoinResult = CreateResult;

export type RoomClient = {
  /** Opens a room with `config`. Resolves with the lobby, or with the error to show inline. */
  create(config: Required<RoomConfigRequest>): Promise<CreateResult>;
  /**
   * The host of the finished room match `oldRoomId` plays again (Story 5.6): the successor lobby with `config` (the old
   * room's source and count). Resolves with the new lobby, or with the error (`ROOM_NOT_FOUND` once the window passed).
   */
  playAgain(oldRoomId: string, config: Required<RoomConfigRequest>): Promise<CreateResult>;
  /** Joins the room with `code` (canonical). A second call while one is in flight returns the same promise. */
  join(code: string): Promise<JoinResult>;
  /** Re-reads a room she is already in. Resolves false when there is none. */
  resume(): Promise<boolean>;
  /** The host asks to start: STARTING follows, then the match (or a failure back in the lobby). */
  start(): void;
  /** Hands a link's failed join to the Rooms tab; `clearJoinFailure` once shown. */
  setJoinFailure(failure: JoinFailure): void;
  clearJoinFailure(): void;
  /** Sends a configure for the room she is in. */
  configure(config: RoomConfigRequest): void;
  /** Leaves on purpose: nothing is shown (a host's leave closes the room; the UI confirmed when others were in). */
  leave(): void;
  clearError(): void;
  dismissNotice(): void;
  reset(): void;
};

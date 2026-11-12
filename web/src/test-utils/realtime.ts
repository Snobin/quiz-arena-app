import type { IFrame, StompConfig } from '@stomp/stompjs';
import { configureRealtimeForTests, type RealtimeClient } from '../realtime/connection.ts';
import { USER_PRIVATE_QUEUE, type ParticipantKind } from '../realtime/protocol.ts';

/** A scripted stand-in for the stompjs Client: the test opens, refuses, drops and delivers. */
export class FakeStomp implements RealtimeClient {
  connected = false;
  activations = 0;
  deactivations = 0;
  readonly published: { destination: string; body?: string }[] = [];
  private readonly subscriptions = new Map<string, (message: { body: string }) => void>();

  constructor(readonly config: StompConfig) {}

  activate(): void {
    this.activations++;
  }

  deactivate(): void {
    this.deactivations++;
    this.connected = false;
  }

  publish(params: { destination: string; body?: string }): void {
    this.published.push(params);
  }

  subscribe(destination: string, callback: (message: { body: string }) => void) {
    this.subscriptions.set(destination, callback);
    return { unsubscribe: () => this.subscriptions.delete(destination) };
  }

  /** The server accepted CONNECT. */
  open(): void {
    this.connected = true;
    this.config.onConnect?.({} as IFrame);
  }

  /** The server refused CONNECT (ERROR frame, then the socket closes). */
  refuse(message = 'UNAUTHENTICATED'): void {
    this.config.onStompError?.({ headers: { message } } as unknown as IFrame);
    this.drop();
  }

  /** The socket closed. */
  drop(): void {
    this.connected = false;
    this.config.onWebSocketClose?.(new CloseEvent('close'));
  }

  /** A private message from the server. */
  deliver(message: unknown): void {
    const handler = this.subscriptions.get(USER_PRIVATE_QUEUE);
    if (!handler) throw new Error('not subscribed to ' + USER_PRIVATE_QUEUE);
    handler({ body: typeof message === 'string' ? message : JSON.stringify(message) });
  }

  sentTo(destination: string): number {
    return this.published.filter((p) => p.destination === destination).length;
  }

  get authorization(): string | undefined {
    return (this.config.connectHeaders as Record<string, string> | undefined)?.Authorization;
  }
}

/** Routes the app's realtime module to FakeStomp clients; returns the list they are added to. */
export function useFakeRealtime(): FakeStomp[] {
  const clients: FakeStomp[] = [];
  configureRealtimeForTests({
    factory: (config) => {
      const client = new FakeStomp(config);
      clients.push(client);
      return client;
    },
    url: () => 'ws://localhost/ws',
  });
  return clients;
}

export const SERVER_TIME = '2026-11-12T10:15:30.123Z';
export const JOIN = '/app/matchmaking/QUICK/join';
export const CANCEL = '/app/matchmaking/QUICK/cancel';

export function matchFound(opponent: { name: string; kind: ParticipantKind }, matchId = crypto.randomUUID()) {
  const self = crypto.randomUUID();
  return {
    type: 'MATCH_FOUND',
    matchId,
    serverTime: SERVER_TIME,
    payload: {
      matchId,
      mode: 'QUICK',
      participants: [
        { participantId: self, displayName: 'Guest 4821', kind: 'GUEST' },
        { participantId: crypto.randomUUID(), displayName: opponent.name, kind: opponent.kind },
      ],
      questionCount: 10,
      questionSource: 'BANK',
      selfParticipantId: self,
    },
  };
}

export function serverError(code: string, matchId?: string) {
  return { type: 'ERROR', serverTime: SERVER_TIME, ...(matchId ? { matchId } : {}), payload: { code, ...(matchId ? { matchId } : {}) } };
}

export const MATCHMAKING_FAILED = {
  type: 'MATCHMAKING_FAILED',
  serverTime: SERVER_TIME,
  payload: { reason: 'QUESTION_SET_UNAVAILABLE' },
};

export const MATCHMAKING_CANCELLED = { type: 'MATCHMAKING_CANCELLED', serverTime: SERVER_TIME };

import type { IFrame } from '@stomp/stompjs';
import { HEARTBEAT_MS, UNAUTHENTICATED, type RealtimeClient, type RealtimeEnv } from '../../realtime/connection.ts';
import { USER_PRIVATE_QUEUE } from '../../realtime/protocol.ts';
import { roomTopic } from './roomProtocol.ts';

/**
 * The room client's one STOMP socket and nothing else: open it (retrying once on a refused token), queue sends until it is
 * open, subscribe the private queue and the room topic, and say when it opened or was lost. It does not know what a room is
 * beyond the topic name; what to do about a lost socket (reconnect, give up, fail a pending create) is `roomClient.ts`'s.
 * Every callback of an abandoned attempt is ignored, through `generation`.
 */
export type Status = 'closed' | 'connecting' | 'open';

export type RoomTransport = {
  status(): Status;
  isOpen(): boolean;
  /** Opens the socket; with `retryOnAuth` a refused token is renewed and the open tried once more. */
  open(retryOnAuth: boolean): void;
  /** Runs `action` once the socket is open, opening it first when it is closed. */
  send(action: (client: RealtimeClient) => void): void;
  /** Publishes now; false (nothing sent) when the socket is not open. A publish that throws is swallowed: the socket is going. */
  publishIfOpen(destination: string, body: string): boolean;
  /** Subscribes `/topic/room/{roomId}` (once per room; a no-op when not open). */
  subscribeTopic(roomId: string): void;
  /** Sends that were waiting for the socket are dropped. */
  clearPending(): void;
  /** Closes the socket, abandoning the attempt in flight. */
  close(): void;
};

export type TransportHandlers = {
  /** A message on the private queue. */
  onPrivate(body: string): void;
  /** A message on the room topic. */
  onTopic(body: string): void;
  /** The socket just opened and the private queue is subscribed; the waiting sends have gone out. */
  onOpen(): void;
  /** The socket closed or never opened. `wasOpen`: it had been open. */
  onLost(wasOpen: boolean): void;
};

export function createRoomTransport(env: RealtimeEnv, handlers: TransportHandlers): RoomTransport {
  let client: RealtimeClient | null = null;
  let status: Status = 'closed';
  /** Sends waiting for the socket to open. */
  let pending: Array<(c: RealtimeClient) => void> = [];
  /** Bumped whenever an attempt is abandoned, so its late callbacks are ignored. */
  let generation = 0;
  let topic: { roomId: string; unsubscribe: () => void } | null = null;

  function dropTopic(): void {
    const previous = topic;
    topic = null;
    try {
      previous?.unsubscribe();
    } catch {
      // The socket is already gone.
    }
  }

  function open(retryOnAuth: boolean): void {
    status = 'connecting';
    const attempt = ++generation;
    env.getAccessToken().then(
      (token) => {
        if (attempt !== generation) return;
        let refused = false;
        const created = env.factory({
          brokerURL: env.url(),
          connectHeaders: { Authorization: `Bearer ${token}` },
          reconnectDelay: 0,
          heartbeatIncoming: HEARTBEAT_MS,
          heartbeatOutgoing: HEARTBEAT_MS,
          onConnect: () => {
            if (attempt !== generation) return;
            status = 'open';
            created.subscribe(USER_PRIVATE_QUEUE, (message) => {
              if (attempt !== generation) return;
              handlers.onPrivate(message.body);
            });
            const sends = pending;
            pending = [];
            for (const send of sends) send(created);
            handlers.onOpen();
          },
          onStompError: (frame: IFrame) => {
            if (attempt !== generation) return;
            if (status === 'connecting' && frame.headers.message === UNAUTHENTICATED) refused = true;
          },
          onWebSocketClose: () => {
            if (attempt !== generation) return;
            const wasOpen = status === 'open';
            client = null;
            topic = null;
            status = 'closed';
            if (!wasOpen && refused && retryOnAuth) {
              env.invalidate(token);
              open(false);
              return;
            }
            handlers.onLost(wasOpen);
          },
        });
        client = created;
        created.activate();
      },
      () => {
        if (attempt !== generation) return;
        status = 'closed';
        handlers.onLost(false);
      },
    );
  }

  return {
    status: () => status,
    isOpen: () => status === 'open' && client !== null,
    open,
    send(action) {
      if (status === 'open' && client) {
        action(client);
        return;
      }
      pending.push(action);
      if (status === 'closed') open(true);
    },
    publishIfOpen(destination, body) {
      if (status !== 'open' || !client) return false;
      try {
        client.publish({ destination, body });
      } catch {
        // The socket is going; the reconnect (or the server's grace) settles it.
      }
      return true;
    },
    subscribeTopic(roomId) {
      if (topic?.roomId === roomId) return;
      dropTopic();
      if (status !== 'open' || !client) return;
      const attempt = generation;
      const subscription = client.subscribe(roomTopic(roomId), (message) => {
        if (attempt !== generation || topic !== handle) return;
        handlers.onTopic(message.body);
      });
      const handle = { roomId, unsubscribe: () => subscription.unsubscribe() };
      topic = handle;
    },
    clearPending() {
      pending = [];
    },
    close() {
      generation++;
      dropTopic();
      const closing = client;
      client = null;
      status = 'closed';
      pending = [];
      void closing?.deactivate();
    },
  };
}

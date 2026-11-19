package in.minnal.game.support;

import java.time.Duration;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/** Raw STOMP frames over a plain WebSocket, for the protocol-level (auth) tests. */
public final class RawStomp implements AutoCloseable {

    private final WebSocketSession session;
    private final BlockingQueue<String> frames = new LinkedBlockingQueue<>();
    private final CountDownLatch closed = new CountDownLatch(1);

    private RawStomp(int port) throws Exception {
        session = new StandardWebSocketClient().execute(new TextWebSocketHandler() {
            @Override
            protected void handleTextMessage(WebSocketSession s, TextMessage message) {
                frames.add(message.getPayload());
            }

            @Override
            public void afterConnectionClosed(WebSocketSession s, CloseStatus status) {
                closed.countDown();
            }
        }, "ws://localhost:" + port + "/ws").get(5, TimeUnit.SECONDS);
    }

    public static RawStomp open(int port) {
        try {
            return new RawStomp(port);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** Sends a frame: command, header lines, then an empty body. */
    public void send(String command, String... headers) {
        StringBuilder frame = new StringBuilder(command).append('\n');
        for (String header : headers) {
            frame.append(header).append('\n');
        }
        frame.append('\n').append('\0');
        try {
            session.sendMessage(new TextMessage(frame.toString()));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public void connect(String authorization) {
        if (authorization == null) {
            send("CONNECT", "accept-version:1.2", "host:localhost");
        } else {
            send("CONNECT", "accept-version:1.2", "host:localhost", "Authorization:" + authorization);
        }
    }

    /** The next frame (heartbeat newlines skipped), or null after {@code within}. */
    /**
     * The next non-blank frame, or null when none comes within {@code within}. It returns null at once when
     * the socket has closed with nothing left to read, so a refused connection that is closed without an
     * ERROR frame does not eat the whole wait (long waits also let a participant's reconnect grace expire).
     */
    public String nextFrame(Duration within) throws InterruptedException {
        long deadline = System.nanoTime() + within.toNanos();
        while (System.nanoTime() < deadline) {
            long leftMs = Math.max(1, (deadline - System.nanoTime()) / 1_000_000);
            String frame = frames.poll(Math.min(leftMs, 100), TimeUnit.MILLISECONDS);
            if (frame != null && !frame.isBlank()) {
                return frame;
            }
            if (frame == null && closed.getCount() == 0 && frames.isEmpty()) {
                return null;
            }
        }
        return null;
    }

    public boolean awaitClosed(Duration within) throws InterruptedException {
        return closed.await(within.toMillis(), TimeUnit.MILLISECONDS);
    }

    @Override
    public void close() throws Exception {
        if (session.isOpen()) {
            session.close();
        }
    }
}

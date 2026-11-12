package in.minnal.game.platform.actor;

import java.util.Objects;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * A single-threaded actor (AD-4): events are queued with {@link #tell} from any thread and handled
 * one at a time, in arrival order, on the actor's own named daemon thread. State touched only by
 * the handler is thread-confined and needs no locking.
 *
 * <p>A handler that throws a {@link RuntimeException} is logged and the actor carries on with the
 * next event; anything worse (an {@link Error}) ends the thread through the logging uncaught
 * exception handler.
 *
 * @param <E> the event type
 */
public final class Actor<E> implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(Actor.class);

    private final String name;
    private final Consumer<? super E> handler;
    private final LinkedBlockingQueue<E> mailbox = new LinkedBlockingQueue<>();
    private final Thread thread;
    private volatile boolean running = true;

    public Actor(String name, Consumer<? super E> handler) {
        this.name = Objects.requireNonNull(name);
        this.handler = Objects.requireNonNull(handler);
        this.thread = Thread.ofPlatform()
                .name(name)
                .daemon(true)
                .uncaughtExceptionHandler((t, e) -> log.error("actor {} stopped by an uncaught error", t.getName(), e))
                .unstarted(this::loop);
        thread.start();
    }

    /** Queues {@code event}; it is handled after every event queued before it. Ignored once closed. */
    public void tell(E event) {
        Objects.requireNonNull(event);
        if (running) {
            mailbox.add(event);
        }
    }

    /** True when called from this actor's thread (for assertions). */
    public boolean onActorThread() {
        return Thread.currentThread() == thread;
    }

    public String name() {
        return name;
    }

    private void loop() {
        while (running) {
            E event;
            try {
                event = mailbox.take();
            } catch (InterruptedException e) {
                continue; // close() interrupts; the loop condition decides.
            }
            try {
                handler.accept(event);
            } catch (RuntimeException e) {
                log.error("actor {} failed on {}", name, event.getClass().getSimpleName(), e);
            }
        }
    }

    /** Stops after the event in progress; queued events are dropped. */
    @Override
    public void close() {
        running = false;
        thread.interrupt();
    }

    /** Waits for the actor thread to end (after {@link #close()}). */
    public void join(long millis) throws InterruptedException {
        thread.join(millis);
    }
}

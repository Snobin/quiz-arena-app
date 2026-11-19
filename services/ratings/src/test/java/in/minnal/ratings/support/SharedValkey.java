package in.minnal.ratings.support;

import org.testcontainers.containers.GenericContainer;

/** One Valkey container for every test class that needs a real one (started once, stopped with the JVM). */
public final class SharedValkey {

    public static final GenericContainer<?> VALKEY = new GenericContainer<>("valkey/valkey:8-alpine").withExposedPorts(6379);

    static {
        VALKEY.start();
    }

    private SharedValkey() {
    }
}

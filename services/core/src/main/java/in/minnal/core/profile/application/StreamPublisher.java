package in.minnal.core.profile.application;

/** Publishes one event to a Valkey stream; throws when it cannot. */
public interface StreamPublisher {

    void publish(String stream, String payloadJson);
}

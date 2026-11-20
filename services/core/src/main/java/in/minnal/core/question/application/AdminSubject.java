package in.minnal.core.question.application;

import java.util.List;
import java.util.UUID;

public record AdminSubject(UUID id, String name, List<Topic> topics) {

    public record Topic(UUID id, String name) {
    }
}

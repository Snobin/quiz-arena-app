package in.minnal.core.question.application;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * The one place that says how many published questions make a topic playable (default 10). The topic
 * catalogue and recent topics read it here; Story 4.3 (Solo Practice) reuses it.
 */
@Component
public class TopicThreshold {

    private final int minQuestions;

    public TopicThreshold(@Value("${minnal.topics.min-questions:10}") int minQuestions) {
        if (minQuestions < 1) {
            throw new IllegalArgumentException("minnal.topics.min-questions must be at least 1");
        }
        this.minQuestions = minQuestions;
    }

    public int minQuestions() {
        return minQuestions;
    }
}

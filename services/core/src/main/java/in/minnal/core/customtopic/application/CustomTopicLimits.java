package in.minnal.core.customtopic.application;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** The fair-use caps and the paste size cap, read in one place (Story 6.1). */
@Component
public class CustomTopicLimits {

    private final int maxTopics;
    private final int maxQuestions;
    private final int maxBodyBytes;

    public CustomTopicLimits(
            @Value("${minnal.custom-topics.max-topics:50}") int maxTopics,
            @Value("${minnal.custom-topics.max-questions:500}") int maxQuestions,
            @Value("${minnal.custom-topics.max-body-bytes:1048576}") int maxBodyBytes) {
        this.maxTopics = maxTopics;
        this.maxQuestions = maxQuestions;
        this.maxBodyBytes = maxBodyBytes;
    }

    public int maxTopics() {
        return maxTopics;
    }

    public int maxQuestions() {
        return maxQuestions;
    }

    public int maxBodyBytes() {
        return maxBodyBytes;
    }

    /** True at 80% or more of either cap. */
    public boolean warn(int topics, int questions) {
        return topics * 5 >= maxTopics * 4 || questions * 5 >= maxQuestions * 4;
    }
}

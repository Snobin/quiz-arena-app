package in.minnal.ratings.metrics;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Turns scheduling on for the nightly return-rate job even when the stream loops are off (enabling twice is harmless). */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
class SchedulingConfiguration {
}

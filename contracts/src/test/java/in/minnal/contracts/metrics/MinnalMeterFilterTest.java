package in.minnal.contracts.metrics;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.core.spi.FilterReply;
import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.Tags;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

class MinnalMeterFilterTest {

    private final MinnalMeterFilter filter = new MinnalMeterFilter();

    private static Meter.Id id(String name, String... kv) {
        return new Meter.Id(name, Tags.of(kv), null, null, Meter.Type.COUNTER);
    }

    private String tagsOf(Meter.Id id) {
        return id.getTags().stream().map(t -> t.getKey() + "=" + t.getValue()).sorted().collect(Collectors.joining(","));
    }

    @Test
    void ownMetersKeepOnlyAllowedKeys() {
        var mapped = filter.map(id("minnal.match.ended", "mode", "QUICK", "kind", "BOT", "userId", "abc", "outcome", "x", "reason", "r", "source", "BANK", "status", "ok", "service", "game", "topic", "Kerala"));
        assertThat(tagsOf(mapped)).isEqualTo("kind=BOT,mode=QUICK,outcome=x,reason=r,service=game,source=BANK,status=ok");
    }

    @Test
    void frameworkMetersKeepTheirStandardTags() {
        var mapped = filter.map(id("http.server.requests", "method", "GET", "uri", "/api/core/v1/topics/{id}", "status", "200"));
        assertThat(tagsOf(mapped)).isEqualTo("method=GET,status=200,uri=/api/core/v1/topics/{id}");
    }

    @Test
    void valuesThatLookLikeUuidsEmailsOrRoomCodesAreDropped() {
        for (String bad : new String[] {"3f2b8c1e-5d4a-4b7e-9a10-1c2d3e4f5a6b", "3F2B8C1E5D4A4B7E9A101C2D3E4F5A6B", "anju@example.com", "K7M-4PQ", "K7M4PQ"}) {
            assertThat(filter.map(id("minnal.x", "kind", bad)).getTags()).as(bad).isEmpty();
            assertThat(filter.map(id("http.server.requests", "uri", bad)).getTags()).as(bad).isEmpty();
        }
    }

    @Test
    void ordinaryValuesSurvive() {
        for (String ok : new String[] {"QUICK", "BATTLE_ROOM", "human", "bot", "SCOREBOARD", "200", "ABANDONED"}) {
            assertThat(filter.map(id("minnal.x", "kind", ok)).getTags()).as(ok).hasSize(1);
        }
    }

    @Test
    void anUnchangedIdIsReturnedAsIs() {
        var same = id("minnal.x", "mode", "QUICK");
        assertThat(filter.map(same)).isSameAs(same);
    }

    @Test
    void theThrottleLetsOneFailureThroughPerWindow() {
        var clock = new AtomicLong(1);
        var throttle = new PushFailureThrottle(Duration.ofMinutes(10), clock::get);
        var otlp = new LoggerContext().getLogger("io.micrometer.registry.otlp.OtlpMeterRegistry");
        var other = new LoggerContext().getLogger("in.minnal.game");
        assertThat(throttle.decide(null, otlp, Level.WARN, "x", null, null)).isEqualTo(FilterReply.NEUTRAL);
        clock.addAndGet(Duration.ofMinutes(9).toNanos());
        assertThat(throttle.decide(null, otlp, Level.WARN, "x", null, null)).isEqualTo(FilterReply.DENY);
        assertThat(throttle.decide(null, other, Level.WARN, "x", null, null)).isEqualTo(FilterReply.NEUTRAL);
        assertThat(throttle.decide(null, otlp, Level.INFO, "x", null, null)).isEqualTo(FilterReply.NEUTRAL);
        clock.addAndGet(Duration.ofMinutes(2).toNanos());
        assertThat(throttle.decide(null, otlp, Level.ERROR, "x", null, null)).isEqualTo(FilterReply.NEUTRAL);
    }

    @Test
    void installAddsTheFilterOnce() {
        PushFailureThrottle.install();
        PushFailureThrottle.install();
        var context = (LoggerContext) LoggerFactory.getILoggerFactory();
        assertThat(context.getTurboFilterList().stream().filter(PushFailureThrottle.class::isInstance)).hasSize(1);
        context.getTurboFilterList().removeIf(PushFailureThrottle.class::isInstance);
    }
}

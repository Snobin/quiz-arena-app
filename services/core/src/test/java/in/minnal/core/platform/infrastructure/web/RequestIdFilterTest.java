package in.minnal.core.platform.infrastructure.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import jakarta.servlet.DispatcherType;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class RequestIdFilterTest {

    @Test
    void validIdPassesThroughUnchanged() {
        assertThat(RequestIdFilter.resolveRequestId("abc-123_X.y:z")).isEqualTo("abc-123_X.y:z");
        String max = "a".repeat(128);
        assertThat(RequestIdFilter.resolveRequestId(max)).isEqualTo(max);
    }

    @Test
    void missingIdIsReplacedByUuid() {
        assertIsUuid(RequestIdFilter.resolveRequestId(null));
    }

    @ParameterizedTest
    @ValueSource(strings = {"abc\r\nX-Injected: 1", "abc\ndef", "abc\"def", "abc def", ""})
    void malformedIdIsReplacedByUuid(String header) {
        assertIsUuid(RequestIdFilter.resolveRequestId(header));
    }

    @Test
    void tooLongIdIsReplacedByUuid() {
        assertIsUuid(RequestIdFilter.resolveRequestId("a".repeat(129)));
    }

    @Test
    void filterRunsOnErrorDispatch() {
        assertThat(new RequestIdFilter() {
            boolean skipsErrorDispatch() {
                return shouldNotFilterErrorDispatch();
            }
        }.skipsErrorDispatch()).isFalse();
    }

    @Test
    void errorDispatchKeepsTheOriginalRequestIdInMdc() throws Exception {
        RequestIdFilter filter = new RequestIdFilter();
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/x/v1/boom");
        request.addHeader(RequestIdFilter.HEADER, "bad id");
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, (req, res) -> { });
        String generated = response.getHeader(RequestIdFilter.HEADER);
        assertIsUuid(generated);
        assertThat(MDC.get(RequestIdFilter.MDC_KEY)).isNull();

        request.setDispatcherType(DispatcherType.ERROR);
        AtomicReference<String> seenInErrorDispatch = new AtomicReference<>();
        filter.doFilter(request, response, (req, res) -> seenInErrorDispatch.set(MDC.get(RequestIdFilter.MDC_KEY)));
        assertThat(seenInErrorDispatch.get()).isEqualTo(generated);
        assertThat(MDC.get(RequestIdFilter.MDC_KEY)).isNull();
    }

    private static void assertIsUuid(String value) {
        assertThatCode(() -> UUID.fromString(value)).doesNotThrowAnyException();
        assertThat(value).hasSize(36);
    }
}

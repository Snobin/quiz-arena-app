package in.minnal.core.platform.infrastructure.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.server.ResponseStatusException;

class InternalTokenInterceptorTest {

    @InternalApi
    static class MarkedController {
        public void handle() {
        }
    }

    static class PublicController {
        public void handle() {
        }
    }

    private static HandlerMethod handler(Object bean) throws NoSuchMethodException {
        return new HandlerMethod(bean, bean.getClass().getMethod("handle"));
    }

    private static MockHttpServletRequest request(String token) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/internal/question-sets");
        if (token != null) {
            request.addHeader(InternalTokenInterceptor.HEADER, token);
        }
        return request;
    }

    private static void assertRejected(InternalTokenInterceptor interceptor, String token) throws Exception {
        HandlerMethod internal = handler(new MarkedController());
        assertThatThrownBy(() -> interceptor.preHandle(request(token), new MockHttpServletResponse(), internal))
                .as("token %s", token)
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED));
    }

    @Test
    void correctTokenPasses() throws Exception {
        assertThat(new InternalTokenInterceptor("s3cret").preHandle(request("s3cret"), new MockHttpServletResponse(),
                handler(new MarkedController()))).isTrue();
    }

    @Test
    void missingOrWrongTokenIsRejected() throws Exception {
        InternalTokenInterceptor interceptor = new InternalTokenInterceptor("s3cret");
        for (String token : new String[] {null, "", "s3cre", "s3cret2", "S3CRET", " s3cret", "s3cret "}) {
            assertRejected(interceptor, token);
        }
    }

    @Test
    void bothSidesAreComparedUnstripped() throws Exception {
        InternalTokenInterceptor padded = new InternalTokenInterceptor("s3cret ");
        assertRejected(padded, "s3cret");
        assertThat(padded.authorised("s3cret ")).isTrue();
    }

    @Test
    void unsetOrPlaceholderTokenFailsClosed() throws Exception {
        for (String configured : new String[] {"", "  ", null, "change-me-internal-token", "change-me"}) {
            InternalTokenInterceptor interceptor = new InternalTokenInterceptor(configured);
            assertRejected(interceptor, "");
            assertRejected(interceptor, configured);
            assertRejected(interceptor, "anything");
        }
    }

    @Test
    void onlyInternalHandlersAreGuarded() throws Exception {
        InternalTokenInterceptor interceptor = new InternalTokenInterceptor("s3cret");
        assertThatCode(() -> interceptor.preHandle(request(null), new MockHttpServletResponse(), handler(new PublicController())))
                .doesNotThrowAnyException();
        assertThatCode(() -> interceptor.preHandle(request(null), new MockHttpServletResponse(), new Object()))
                .doesNotThrowAnyException();
        assertThat(InternalTokenInterceptor.isInternal(handler(new MarkedController()))).isTrue();
        assertThat(InternalTokenInterceptor.isInternal(handler(new PublicController()))).isFalse();
    }
}

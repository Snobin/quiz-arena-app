package in.minnal.core.platform.infrastructure.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Guards internal APIs with the service token (AD-12, NFR13). It runs on the handler Spring MVC
 * actually resolved, so no spelling of the URL (encoded characters, {@code ;matrix} parameters) can
 * route around it. A handler is internal when its controller carries {@link InternalApi} or lives in
 * an {@code .api.internal} package.
 *
 * <p>The {@code X-Internal-Token} header is compared in constant time with
 * {@code minnal.internal.token}, both sides exactly as given. An unset token, or the
 * {@code change-me…} placeholder from {@code deploy/.env.example}, fails closed: every internal call
 * gets 401 and a WARN is logged at startup; the rest of the app still works. A failure is thrown as a
 * {@link ResponseStatusException}, so the standard RFC 9457 Problem Details body is written.
 */
@Component
public class InternalTokenInterceptor implements HandlerInterceptor {

    public static final String HEADER = "X-Internal-Token";
    static final String PLACEHOLDER_PREFIX = "change-me";
    static final String INTERNAL_PACKAGE_MARKER = ".api.internal";

    private static final Logger log = LoggerFactory.getLogger(InternalTokenInterceptor.class);

    private final byte[] expected;

    public InternalTokenInterceptor(@Value("${minnal.internal.token:}") String token) {
        if (token == null || token.isBlank() || token.strip().startsWith(PLACEHOLDER_PREFIX)) {
            this.expected = null;
            log.warn("minnal.internal.token (MINNAL_INTERNAL_TOKEN) is not set or is a placeholder: every /internal/** request will get 401");
        } else {
            this.expected = token.getBytes(StandardCharsets.UTF_8);
        }
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (isInternal(handler) && !authorised(request.getHeader(HEADER))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "missing or invalid internal service token");
        }
        return true;
    }

    static boolean isInternal(Object handler) {
        if (!(handler instanceof HandlerMethod method)) {
            return false;
        }
        Class<?> type = method.getBeanType();
        return type.isAnnotationPresent(InternalApi.class) || type.getPackageName().contains(INTERNAL_PACKAGE_MARKER);
    }

    boolean authorised(String presented) {
        if (expected == null || presented == null) {
            return false;
        }
        // MessageDigest.isEqual does not short-circuit on the first differing byte.
        return MessageDigest.isEqual(expected, presented.getBytes(StandardCharsets.UTF_8));
    }
}

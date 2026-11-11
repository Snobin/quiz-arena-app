package in.minnal.ratings.platform.infrastructure.web;

import jakarta.servlet.DispatcherType;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Puts the {@code X-Request-Id} header (set by Caddy) into the MDC as {@code requestId} so every
 * structured log line of the request carries it, echoes it on the response, and writes one access
 * log line per request. A missing or malformed header is replaced by a generated UUID.
 *
 * <p>Also runs on the ERROR dispatch so error-path logs keep the same {@code requestId}; only the
 * original dispatch writes the access line.
 *
 * <p>Each service owns a copy of this filter: {@code contracts} holds no Spring code (AD-1).
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Request-Id";
    public static final String MDC_KEY = "requestId";
    private static final String ATTRIBUTE = RequestIdFilter.class.getName() + ".requestId";

    private static final Pattern VALID_ID = Pattern.compile("[A-Za-z0-9._:-]{1,128}");
    private static final Logger log = LoggerFactory.getLogger(RequestIdFilter.class);

    @Override
    protected boolean shouldNotFilterErrorDispatch() {
        return false;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        boolean errorDispatch = request.getDispatcherType() == DispatcherType.ERROR;
        // Reuse the id chosen on the original dispatch so a generated id does not change mid-request.
        String requestId = request.getAttribute(ATTRIBUTE) instanceof String id ? id : resolveRequestId(request.getHeader(HEADER));
        request.setAttribute(ATTRIBUTE, requestId);
        long startNanos = System.nanoTime();
        MDC.put(MDC_KEY, requestId);
        if (!errorDispatch) {
            response.setHeader(HEADER, requestId);
        }
        try {
            chain.doFilter(request, response);
        } finally {
            if (!errorDispatch && !request.getRequestURI().startsWith("/actuator")) {
                long elapsedMs = (System.nanoTime() - startNanos) / 1_000_000;
                log.info("{} {} -> {} ({} ms)", request.getMethod(), request.getRequestURI(), response.getStatus(), elapsedMs);
            }
            MDC.remove(MDC_KEY);
        }
    }

    static String resolveRequestId(String header) {
        if (header != null && VALID_ID.matcher(header).matches()) {
            return header;
        }
        return UUID.randomUUID().toString();
    }
}

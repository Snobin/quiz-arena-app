package in.minnal.game.platform.infrastructure.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import tools.jackson.databind.json.JsonMapper;

/**
 * Writes security failures as RFC 9457 Problem Details: 401 for a missing, tampered, expired or
 * otherwise invalid token (with {@code WWW-Authenticate: Bearer}), 403 when authenticated but not
 * allowed, and 503 when the token could not be checked because core-service's JWKS is unreachable
 * (an {@link AuthenticationServiceException} from the bearer filter, otherwise a generic 500). The detail never echoes token contents. {@code X-Request-Id} is already on the response
 * ({@code RequestIdFilter} runs before the security chain).
 */
final class ProblemDetailSecurityHandler implements AuthenticationEntryPoint, AccessDeniedHandler, AuthenticationFailureHandler {

    private final JsonMapper json;

    ProblemDetailSecurityHandler(JsonMapper json) {
        this.json = json;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException e) throws IOException {
        boolean presented = e instanceof InvalidBearerTokenException || isBearer(request.getHeader(HttpHeaders.AUTHORIZATION));
        response.setHeader(HttpHeaders.WWW_AUTHENTICATE, presented ? "Bearer error=\"invalid_token\"" : "Bearer");
        write(request, response, HttpStatus.UNAUTHORIZED, presented ? "invalid or expired bearer token" : "missing bearer token");
    }

    /** Bearer-filter failures: the keys being unavailable is our problem (503), anything else a bad token (401). */
    @Override
    public void onAuthenticationFailure(HttpServletRequest request, HttpServletResponse response, AuthenticationException e)
            throws IOException {
        if (e instanceof AuthenticationServiceException) {
            response.setHeader(HttpHeaders.RETRY_AFTER, "5");
            write(request, response, HttpStatus.SERVICE_UNAVAILABLE, "token keys unavailable");
        } else {
            commence(request, response, e);
        }
    }

    private static boolean isBearer(String authorization) {
        return authorization != null && authorization.regionMatches(true, 0, "Bearer ", 0, 7);
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException e) throws IOException {
        write(request, response, HttpStatus.FORBIDDEN, "not allowed");
    }

    private void write(HttpServletRequest request, HttpServletResponse response, HttpStatus status, String detail) throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", "about:blank");
        body.put("title", status.getReasonPhrase());
        body.put("status", status.value());
        body.put("detail", detail);
        body.put("instance", request.getRequestURI());
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(json.writeValueAsString(body));
    }
}

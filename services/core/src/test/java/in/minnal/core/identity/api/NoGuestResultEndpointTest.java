package in.minnal.core.identity.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.RecordComponent;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * Story 2.4: a guest's match result can never be migrated into an account. core's public API is a closed
 * list, and no request body carries a match, a score or a guest id. Adding an endpoint or a field that does
 * must fail here and be argued for.
 */
@SpringBootTest
@ActiveProfiles("test")
class NoGuestResultEndpointTest {

    private static final Set<String> PUBLIC_API = Set.of(
            "/api/core/v1/auth/guest", "/api/core/v1/auth/jwks", "/api/core/v1/auth/google/start",
            "/api/core/v1/auth/google/callback", "/api/core/v1/auth/refresh", "/api/core/v1/auth/logout", "/api/core/v1/me",
            "/api/core/v1/me/profile");

    @Autowired
    @org.springframework.beans.factory.annotation.Qualifier("requestMappingHandlerMapping")
    RequestMappingHandlerMapping mappings;

    /** Non-public paths core serves; each is service-to-service and takes no player result. */
    private static final Set<String> INTERNAL = Set.of("/internal/question-sets",
            "/api/core/v1/admin/questions", "/api/core/v1/admin/subjects", "/api/core/v1/admin/questions/{questionId}",
            "/api/core/v1/admin/questions/{questionId}/draft", "/api/core/v1/admin/questions/{questionId}/restore",
            "/api/core/v1/admin/subjects/{subjectId}/topics", "/api/core/v1/admin/uploads",
            "/api/core/v1/admin/drafts", "/api/core/v1/admin/drafts/publish", "/api/core/v1/admin/drafts/discard",
            "/api/core/v1/admin/questions/{questionId}/versions/{version}/publish",
            "/api/core/v1/admin/questions/{questionId}/versions/{version}/discard");

    private static final Set<String> FORBIDDEN_WORDS = Set.of("match", "score", "scores", "guest", "participant", "participants", "result", "results", "points");

    @Test
    void everyPathCoreServesIsOnAClosedListWithNoEndpointForAGuestResult() {
        Set<String> found = new TreeSet<>();
        for (RequestMappingInfo info : mappings.getHandlerMethods().keySet()) {
            if (info.getPathPatternsCondition() != null) {
                info.getPathPatternsCondition().getPatterns().forEach(p -> found.add(p.getPatternString()));
            } else if (info.getPatternsCondition() != null) {
                found.addAll(info.getPatternsCondition().getPatterns());
            }
        }
        found.removeIf(path -> path.startsWith("/error"));
        Set<String> allowed = new TreeSet<>(PUBLIC_API);
        allowed.addAll(INTERNAL);
        assertThat(found).isEqualTo(allowed);
    }

    @Test
    void noRequestBodyAcceptsAMatchAScoreOrAGuestId() {
        Set<String> names = new TreeSet<>();
        for (HandlerMethod method : mappings.getHandlerMethods().values()) {
            if (!method.getBeanType().getName().startsWith("in.minnal.core")) {
                continue;
            }
            for (var parameter : method.getMethodParameters()) {
                if (parameter.hasParameterAnnotation(RequestBody.class)) {
                    // A body that is not a record (a Map, JsonNode or a free-form class) cannot be checked field by
                    // field, so it is not allowed at all.
                    assertThat(parameter.getParameterType().isRecord()).as(method + " takes a non-record body").isTrue();
                    collect(parameter.getParameterType(), names);
                }
            }
        }
        assertThat(names).isNotEmpty().allSatisfy(name -> assertThat(words(name)).doesNotContainAnyElementsOf(FORBIDDEN_WORDS));
    }

    private static void collect(Class<?> record, Set<String> names) {
        for (RecordComponent component : record.getRecordComponents()) {
            names.add(component.getName());
            if (component.getType().isRecord()) {
                collect(component.getType(), names);
            }
        }
    }

    /** camelCase split into lower-case words, so "subject" is fine and "matchId" is not. */
    private static java.util.List<String> words(String name) {
        return java.util.Arrays.stream(name.split("(?<=[a-z0-9])(?=[A-Z])|_")).map(String::toLowerCase).toList();
    }
}

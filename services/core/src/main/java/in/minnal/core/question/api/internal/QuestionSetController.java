package in.minnal.core.question.api.internal;

import in.minnal.contracts.internal.QuestionSetRequest;
import in.minnal.contracts.internal.QuestionSetResponse;
import in.minnal.core.platform.infrastructure.web.InternalApi;
import in.minnal.core.question.application.QuestionSetService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code POST /internal/question-sets} (AD-12): game-service's only synchronous call. Reachable only
 * on the private network; {@code InternalTokenInterceptor} checks the service token before the body is read.
 */
@InternalApi
@RestController
@RequestMapping("/internal/question-sets")
public class QuestionSetController {

    private final QuestionSetService service;

    public QuestionSetController(QuestionSetService service) {
        this.service = service;
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public QuestionSetResponse draw(@RequestBody QuestionSetRequest request) {
        return service.draw(request);
    }
}

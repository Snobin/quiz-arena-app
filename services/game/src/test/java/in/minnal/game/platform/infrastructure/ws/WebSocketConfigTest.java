package in.minnal.game.platform.infrastructure.ws;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class WebSocketConfigTest {

    @Test
    void prodWithoutAllowedOriginsFailsFast() {
        MockEnvironment prod = new MockEnvironment();
        prod.setActiveProfiles("prod");
        assertThatThrownBy(() -> new WebSocketConfig(List.of(), prod)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new WebSocketConfig(List.of(" "), prod)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void prodWithAllowedOriginsStarts() {
        MockEnvironment prod = new MockEnvironment();
        prod.setActiveProfiles("prod");
        assertThatCode(() -> new WebSocketConfig(List.of("https://minnal.pages.dev"), prod)).doesNotThrowAnyException();
    }

    @Test
    void nonProdMayHaveNoAllowedOrigins() {
        MockEnvironment local = new MockEnvironment();
        local.setActiveProfiles("local");
        assertThatCode(() -> new WebSocketConfig(List.of(), local)).doesNotThrowAnyException();
    }
}

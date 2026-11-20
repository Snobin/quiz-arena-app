package in.minnal.core.question.api.admin;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import in.minnal.core.identity.application.Account;
import in.minnal.core.identity.application.UserTokenService;
import in.minnal.core.support.PostgresIntegrationTest;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Arrays;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

/** The real servlet multipart path (lazy parsing, 2 MB file limit), which MockMvc does not enforce. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {"minnal.auth.admin-emails=boss@example.com", "minnal.auth.web-url=http://localhost:5173"})
class AdminUploadServletLimitsIntegrationTest extends PostgresIntegrationTest {

    @Autowired UserTokenService userTokens;
    @Value("${local.server.port}") int port;

    String token(String email) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO app_user (id, status, email, given_name, created_at, last_sign_in_at) VALUES (:id, 'ACTIVE', :email, 'X', :t, :t)")
                .param("id", id).param("email", email).param("t", Timestamp.from(Instant.now())).update();
        return "Bearer " + userTokens.issue(new Account(id, email, "X"), "en").accessToken();
    }

    HttpResponse<String> post(String auth, int fileBytes) throws Exception {
        byte[] content = new byte[fileBytes];
        Arrays.fill(content, (byte) 'a');
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        body.write("--bnd\r\nContent-Disposition: form-data; name=\"file\"; filename=\"q.csv\"\r\nContent-Type: text/csv\r\n\r\n".getBytes(StandardCharsets.UTF_8));
        body.write(content);
        body.write("\r\n--bnd--\r\n".getBytes(StandardCharsets.UTF_8));
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/core/v1/admin/uploads"))
                .header("Authorization", auth).header("Content-Type", "multipart/form-data; boundary=bnd")
                .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray())).build();
        return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void anAdminFileOver2MbIsA400ProblemDetailsWithTheLimit() throws Exception {
        HttpResponse<String> response = post(token("boss@example.com"), 2 * 1024 * 1024 + 1024);
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat((String) JsonPath.read(response.body(), "$.errors[0].problem")).contains("limit is 2 MB");
        assertThat((String) JsonPath.read(response.body(), "$.errors[0].field")).isEqualTo("file");
    }

    @Test
    void aLargeBodyFromANonAdminIs403WithoutReadingTheFile() throws Exception {
        HttpResponse<String> response = post(token("player@example.com"), 2 * 1024 * 1024 + 1024);
        assertThat(response.statusCode()).isEqualTo(403);
        assertThat((Integer) JsonPath.read(response.body(), "$.status")).isEqualTo(403);
    }
}

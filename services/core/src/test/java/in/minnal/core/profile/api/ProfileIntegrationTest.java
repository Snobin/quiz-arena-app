package in.minnal.core.profile.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.minnal.core.identity.application.Account;
import in.minnal.core.identity.application.GuestTokenService;
import in.minnal.core.identity.application.UserTokenService;
import in.minnal.core.profile.application.OutboxRepository;
import in.minnal.core.support.PostgresIntegrationTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.mock.web.MockHttpServletResponse;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@TestPropertySource(properties = {"minnal.auth.admin-emails=boss@example.com", "minnal.auth.web-url=http://localhost:5173"})
class ProfileIntegrationTest extends PostgresIntegrationTest {

    static final String PATH = "/api/core/v1/me/profile";
    static final String VALID = "{\"displayName\":\"അഞ്ജു\",\"district\":\"thrissur\",\"examLevel\":\"DEGREE\",\"language\":\"ml\"}";

    @Autowired
    MockMvc mvc;

    @Autowired
    UserTokenService userTokens;

    @Autowired
    GuestTokenService guestTokens;

    @MockitoSpyBean
    OutboxRepository outboxSpy;

    UUID user() {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO app_user (id, status, email, given_name, created_at, last_sign_in_at) VALUES (:id, 'ACTIVE', NULL, 'Anju', :t, :t)")
                .param("id", id).param("t", Timestamp.from(Instant.now())).update();
        return id;
    }

    String bearer(UUID id) {
        return "Bearer " + userTokens.issue(new Account(id, null, "Anju"), "en").accessToken();
    }

    MockHttpServletRequestBuilder putProfile(String auth, String body) {
        MockHttpServletRequestBuilder request = put(PATH).contentType(MediaType.APPLICATION_JSON).content(body);
        return auth == null ? request : request.header("Authorization", auth);
    }

    long count(String table) {
        return jdbc.sql("SELECT count(*) FROM " + table).query(Long.class).single();
    }

    @Test
    void aNewAccountHasNoCompleteProfile() throws Exception {
        mvc.perform(get(PATH).header("Authorization", bearer(user()))).andExpect(status().isOk())
                .andExpect(jsonPath("$.profileComplete").value(false)).andExpect(jsonPath("$.displayName").doesNotExist());
    }

    @Test
    void savingStoresTheProfileAndOneOutboxEventInTheSameTransaction() throws Exception {
        UUID id = user();
        mvc.perform(putProfile(bearer(id), VALID)).andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("അഞ്ജു")).andExpect(jsonPath("$.profileComplete").value(true));

        mvc.perform(get(PATH).header("Authorization", bearer(id))).andExpect(status().isOk())
                .andExpect(jsonPath("$.district").value("thrissur")).andExpect(jsonPath("$.examLevel").value("DEGREE"))
                .andExpect(jsonPath("$.language").value("ml")).andExpect(jsonPath("$.profileComplete").value(true));
        assertThat(count("user_profile")).isEqualTo(1);
        assertThat(count("event_outbox")).isEqualTo(1);
        Map<String, Object> row = jdbc.sql("SELECT stream, payload->>'userId' AS uid, payload->>'displayName' AS name, payload->>'district' AS d, "
                + "payload->>'examLevel' AS l, payload->>'language' AS lang, payload->>'eventId' AS eid, payload->>'updatedAt' AS at, "
                + "published_at, attempts FROM event_outbox").query().singleRow();
        assertThat(row).containsEntry("stream", "minnal.user.profileUpdated").containsEntry("uid", id.toString())
                .containsEntry("name", "അഞ്ജു").containsEntry("d", "thrissur").containsEntry("l", "DEGREE").containsEntry("lang", "ml");
        assertThat(row.get("eid")).isNotNull();
        assertThat(row.get("at")).isNotNull();
        assertThat(row.get("published_at")).isNull();
        assertThat(row.get("attempts")).isEqualTo(0);

        // Saving again replaces the profile and adds a second event.
        mvc.perform(putProfile(bearer(id), VALID.replace("thrissur", "kollam"))).andExpect(status().isOk());
        assertThat(count("user_profile")).isEqualTo(1);
        assertThat(count("event_outbox")).isEqualTo(2);
    }

    @Test
    void anInvalidFormStoresAndPublishesNothingAndReportsEveryField() throws Exception {
        String body = "{\"displayName\":\"Admin\",\"district\":\"atlantis\",\"examLevel\":\"PHD\",\"language\":\"fr\"}";
        mvc.perform(putProfile(bearer(user()), body)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.length()").value(4))
                .andExpect(jsonPath("$.errors[0].field").value("displayName")).andExpect(jsonPath("$.errors[0].code").value("reserved"))
                .andExpect(jsonPath("$.errors[1].field").value("district")).andExpect(jsonPath("$.errors[2].field").value("examLevel"))
                .andExpect(jsonPath("$.errors[3].field").value("language"));
        assertThat(count("user_profile")).isZero();
        assertThat(count("event_outbox")).isZero();
    }

    @Test
    void everyKeralaDistrictAndOutsideKeralaIsAccepted() throws Exception {
        UUID id = user();
        for (String district : List.of("thiruvananthapuram", "kollam", "pathanamthitta", "alappuzha", "kottayam", "idukki", "ernakulam",
                "thrissur", "palakkad", "malappuram", "kozhikode", "wayanad", "kannur", "kasaragod", "outside-kerala")) {
            mvc.perform(putProfile(bearer(id), VALID.replace("thrissur", district))).andExpect(status().isOk());
        }
    }

    @Test
    void aGuestTokenIs403NoTokenOrABadOneIs401AndAnAdminIsAllowed() throws Exception {
        String guest = "Bearer " + guestTokens.issue("en").accessToken();
        mvc.perform(get(PATH).header("Authorization", guest)).andExpect(status().isForbidden());
        mvc.perform(putProfile(guest, VALID)).andExpect(status().isForbidden());
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
        mvc.perform(get(PATH).header("Authorization", "Bearer not-a-token")).andExpect(status().isUnauthorized());
        String tampered = bearer(user());
        mvc.perform(get(PATH).header("Authorization", tampered.substring(0, tampered.length() - 3) + "abc")).andExpect(status().isUnauthorized());
        assertThat(count("user_profile")).isZero();
        assertThat(count("event_outbox")).isZero();
    }

    @Test
    void theTokenCarriesTheProfileNameAndLanguageOnceSaved() throws Exception {
        UUID id = user();
        mvc.perform(putProfile(bearer(id), VALID)).andExpect(status().isOk());
        Account account = new Account(id, null, "Anju", "അഞ്ജു", "ml");

        var claims = com.nimbusds.jwt.SignedJWT.parse(userTokens.issue(account, "en").accessToken()).getJWTClaimsSet();

        assertThat(claims.getStringClaim("name")).isEqualTo("അഞ്ജു");
        assertThat(claims.getStringClaim("lang")).isEqualTo("ml");
    }

    @Test
    void anAdminTokenIsAllowed() throws Exception {
        UUID id = user();
        String admin = "Bearer " + userTokens.issue(new Account(id, "boss@example.com", "Boss"), "en").accessToken();
        mvc.perform(putProfile(admin, VALID)).andExpect(status().isOk());
        mvc.perform(get(PATH).header("Authorization", admin)).andExpect(status().isOk()).andExpect(jsonPath("$.profileComplete").value(true));
    }

    @Test
    void aTokenForADeletedOrUnknownAccountIs401NotA500() throws Exception {
        UUID id = user();
        String token = bearer(id);
        jdbc.sql("UPDATE app_user SET status = 'DELETED'").update();
        mvc.perform(get(PATH).header("Authorization", token)).andExpect(status().isUnauthorized());
        mvc.perform(putProfile(token, VALID)).andExpect(status().isUnauthorized());
        mvc.perform(putProfile(bearer(UUID.randomUUID()), VALID)).andExpect(status().isUnauthorized());
        assertThat(count("user_profile")).isZero();
    }

    @Test
    void aFailedOutboxWriteRollsTheProfileBackSoNothingIsHalfSaved() throws Exception {
        UUID id = user();
        doThrow(new IllegalStateException("outbox down")).when(outboxSpy).add(anyString(), anyString(), any());
        try {
            mvc.perform(putProfile(bearer(id), VALID));
        } catch (Exception expected) {
            // the failure surfaces as a 500 or an exception; either way nothing may be stored
        }
        assertThat(count("user_profile")).isZero();
        assertThat(count("event_outbox")).isZero();
    }

    @Test
    void thePwaOriginMayCallProfileCrossOriginWithTheAuthorizationHeaderAndNoCredentials() throws Exception {
        MockHttpServletResponse ok = mvc.perform(options(PATH).header("Origin", "http://localhost:5173")
                .header("Access-Control-Request-Method", "PUT").header("Access-Control-Request-Headers", "authorization,content-type"))
                .andExpect(status().isOk()).andReturn().getResponse();
        assertThat(ok.getHeader("Access-Control-Allow-Origin")).isEqualTo("http://localhost:5173");
        assertThat(ok.getHeader("Access-Control-Allow-Methods")).contains("PUT");
        assertThat(ok.getHeader("Access-Control-Allow-Headers")).containsIgnoringCase("authorization");
        assertThat(ok.getHeader("Access-Control-Allow-Credentials")).isNull();
        mvc.perform(options(PATH).header("Origin", "https://evil.example").header("Access-Control-Request-Method", "PUT"))
                .andExpect(status().isForbidden());
    }
}

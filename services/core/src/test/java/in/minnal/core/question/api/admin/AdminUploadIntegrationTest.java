package in.minnal.core.question.api.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import in.minnal.core.identity.application.Account;
import in.minnal.core.identity.application.GuestTokenService;
import in.minnal.core.identity.application.UserTokenService;
import in.minnal.core.support.PostgresIntegrationTest;
import in.minnal.core.support.QuestionFixtures;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.text.Normalizer;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@TestPropertySource(properties = {"minnal.auth.admin-emails=boss@example.com", "minnal.auth.web-url=http://localhost:5173"})
class AdminUploadIntegrationTest extends PostgresIntegrationTest {

    static final String UPLOADS = "/api/core/v1/admin/uploads";
    static final String HEADER = "category,subject,topic,examLevel,difficulty,textMl,textEn,optionA,optionB,optionC,optionD,answerIndex,explanation,attribution,sourceRef";

    @Autowired MockMvc mvc;
    @Autowired UserTokenService userTokens;
    @Autowired GuestTokenService guestTokens;
    @Autowired QuestionFixtures fixtures;

    UUID adminId;

    String admin() {
        adminId = UUID.randomUUID();
        jdbc.sql("INSERT INTO app_user (id, status, email, given_name, created_at, last_sign_in_at) VALUES (:id, 'ACTIVE', 'boss@example.com', 'Boss', :t, :t)")
                .param("id", adminId).param("t", Timestamp.from(Instant.now())).update();
        return "Bearer " + userTokens.issue(new Account(adminId, "boss@example.com", "Boss"), "en").accessToken();
    }

    String player() {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO app_user (id, status, email, given_name, created_at, last_sign_in_at) VALUES (:id, 'ACTIVE', null, 'X', :t, :t)")
                .param("id", id).param("t", Timestamp.from(Instant.now())).update();
        return "Bearer " + userTokens.issue(new Account(id, null, "P"), "en").accessToken();
    }

    static String row(String subject, String topic, String textEn, String answer, String sourceRef) {
        return "KERALA_PSC," + subject + "," + topic + ",TENTH,EASY,," + textEn + ",Periyar,Pamba,Bharathapuzha,Chaliyar," + answer + ",Because.,PSC 2019," + sourceRef;
    }

    static String csv(String... rows) {
        return HEADER + "\n" + String.join("\n", rows) + "\n";
    }

    ResultActions upload(String auth, byte[] bytes) throws Exception {
        var request = multipart(UPLOADS).file(new MockMultipartFile("file", "q.csv", "text/csv", bytes));
        if (auth != null) {
            request.header("Authorization", auth);
        }
        return mvc.perform(request);
    }

    ResultActions upload(String auth, String csv) throws Exception {
        return upload(auth, csv.getBytes(StandardCharsets.UTF_8));
    }

    int count(String table) {
        return jdbc.sql("SELECT count(*) FROM " + table).query(Integer.class).single();
    }

    @Test
    void authMatrix() throws Exception {
        String guest = "Bearer " + guestTokens.issue("en").accessToken();
        String body = csv(row("History", "Kerala", "Q?", "0", "A-1"));
        upload(null, body).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.status").value(401));
        upload(player(), body).andExpect(status().isForbidden()).andExpect(jsonPath("$.status").value(403));
        upload(guest, body).andExpect(status().isForbidden());
        assertThat(count("question")).isZero();
    }

    @Test
    void goodFileImportsEveryRowAsAnUnpublishedDraftAndCreatesSubjectsAndTopics() throws Exception {
        fixtures.placement("History", "Kerala");
        String a = admin();
        String json = upload(a, csv(
                row("history", "kerala", "Q one?", "0", "A-1"),
                row("Science", "Physics", "Q two?", "1", "A-2"),
                row("Science", "Physics", "Q three?", "2", "")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.importedCount").value(3))
                .andExpect(jsonPath("$.errorCount").value(0))
                .andExpect(jsonPath("$.errors.length()").value(0))
                .andExpect(jsonPath("$.createdSubjects[0]").value("Science"))
                .andExpect(jsonPath("$.createdTopics[0]").value("Physics"))
                .andExpect(jsonPath("$.imported[0].row").value(2))
                .andExpect(jsonPath("$.imported[2].row").value(4))
                .andReturn().getResponse().getContentAsString();
        assertThat((List<?>) JsonPath.read(json, "$.createdSubjects")).hasSize(1);
        assertThat(count("question")).isEqualTo(3);
        assertThat(jdbc.sql("SELECT count(*) FROM question_version WHERE status = 'DRAFT' AND version = 1 AND created_by = :a").param("a", adminId)
                .query(Integer.class).single()).isEqualTo(3);
        assertThat(jdbc.sql("SELECT count(*) FROM question WHERE created_by = :a").param("a", adminId).query(Integer.class).single()).isEqualTo(3);
        assertThat(jdbc.sql("SELECT count(*) FROM question_version WHERE status <> 'DRAFT'").query(Integer.class).single()).isZero();
        assertThat(count("subject")).isEqualTo(2); // History matched case-insensitively, not duplicated
        assertThat(count("topic")).isEqualTo(2);
        assertThat(jdbc.sql("SELECT count(*) FROM question WHERE source_ref IS NULL").query(Integer.class).single()).isEqualTo(1);
    }

    @Test
    void mixedFileImportsTheValidRowsAndListsTheBadOnesWithSpreadsheetRowNumbers() throws Exception {
        String a = admin();
        upload(a, csv(
                row("History", "Kerala", "Good one?", "0", "A-1"),
                row("History", "Kerala", "Bad answer?", "7", "A-2"),
                row("History", "Kerala", "Good two?", "3", "A-3"),
                row("History", "Kerala", "Not a number?", "x", "A-4")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.importedCount").value(2))
                .andExpect(jsonPath("$.errorCount").value(2))
                .andExpect(jsonPath("$.errors[0].row").value(3))
                .andExpect(jsonPath("$.errors[0].field").value("answerIndex"))
                .andExpect(jsonPath("$.errors[0].fix").value("Use 0 for A … 3 for D"))
                .andExpect(jsonPath("$.errors[1].row").value(5))
                .andExpect(jsonPath("$.errors[1].problem").value("must be a whole number 0–3 (got x)"));
        assertThat(count("question")).isEqualTo(2);
    }

    @Test
    void everyProblemOfARowIsListedAndUnknownEnumsAreRejected() throws Exception {
        String a = admin();
        upload(a, csv("NOPE,History,Kerala,PHD,HARDEST,,,A,a,C,D,9,,,")).andExpect(status().isOk())
                .andExpect(jsonPath("$.importedCount").value(0))
                .andExpect(jsonPath("$.errorCount").value(1))
                .andExpect(jsonPath("$.errors[?(@.field=='category')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='examLevel')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='difficulty')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='textMl/textEn')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='options')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='answerIndex')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='explanation')]").exists());
        assertThat(count("question")).isZero();
        assertThat(count("subject")).isZero();
    }

    @Test
    void rowWithWrongCellCountIsReportedAndOthersImport() throws Exception {
        String a = admin();
        upload(a, csv(row("History", "Kerala", "Good?", "0", "A-1"), "KERALA_PSC,History,Kerala"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.importedCount").value(1))
                .andExpect(jsonPath("$.errors[0].row").value(3))
                .andExpect(jsonPath("$.errors[0].field").value("row"));
    }

    @Test
    void duplicatesOfExistingQuestionsIncludingDeletedAndOfEarlierRowsAreListedAndNeverOverwritten() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        var existing = fixtures.published(p, in.minnal.core.question.domain.ContentCategory.KERALA_PSC, in.minnal.core.question.domain.ExamLevel.TENTH, "Old");
        jdbc.sql("UPDATE question SET source_ref = 'OLD-1' WHERE id = :id").param("id", existing.questionId()).update();
        long displayNo = jdbc.sql("SELECT display_no FROM question WHERE id = :id").param("id", existing.questionId()).query(Long.class).single();
        jdbc.sql("UPDATE question SET deleted_at = now() WHERE id = :id").param("id", existing.questionId()).update();
        String a = admin();
        upload(a, csv(
                row("History", "Kerala", "New?", "0", "NEW-1"),
                row("History", "Kerala", "Clash with deleted?", "0", "OLD-1"),
                row("History", "Kerala", "Clash with row 2?", "0", "NEW-1"),
                row("History", "Kerala", "No ref one?", "0", ""),
                row("History", "Kerala", "No ref two?", "0", "")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.importedCount").value(3))
                .andExpect(jsonPath("$.errorCount").value(2))
                .andExpect(jsonPath("$.errors[0].row").value(3))
                .andExpect(jsonPath("$.errors[0].field").value("sourceRef"))
                .andExpect(jsonPath("$.errors[0].problem").value("duplicate of Q " + displayNo))
                .andExpect(jsonPath("$.errors[1].row").value(4))
                .andExpect(jsonPath("$.errors[1].problem").value("duplicate of row 2"));
        assertThat(jdbc.sql("SELECT text_en FROM question_version WHERE question_id = :id").param("id", existing.questionId()).query(String.class).single())
                .isEqualTo("Old");
    }

    @Test
    void allRowsFailingImportsNothing() throws Exception {
        String a = admin();
        upload(a, csv(row("History", "Kerala", "Bad?", "8", "A-1"), row("History", "Kerala", "Bad too?", "8", "A-2")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.importedCount").value(0)).andExpect(jsonPath("$.errorCount").value(2));
        assertThat(count("question")).isZero();
    }

    @Test
    void fileLevelProblemsAreOne400AndImportNothing() throws Exception {
        String a = admin();
        upload(a, new byte[0]).andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.length()").value(1))
                .andExpect(jsonPath("$.errors[0].field").value("file")).andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("empty")));
        upload(a, HEADER + "\n").andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("no questions")));
        upload(a, new byte[2 * 1024 * 1024 + 1]).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].problem").value(org.hamcrest.Matchers.containsString("limit is 2 MB")));
        StringBuilder many = new StringBuilder(HEADER).append('\n');
        for (int i = 0; i < 1001; i++) {
            many.append(row("History", "Kerala", "Q" + i + "?", "0", "R-" + i)).append('\n');
        }
        upload(a, many.toString()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("File has 1,001 rows; the limit is 1,000. Split it into smaller files."));
        assertThat(count("question")).isZero();
    }

    @Test
    void exactlyThe1000RowCapIsAccepted() throws Exception {
        StringBuilder rows = new StringBuilder(HEADER).append('\n');
        for (int i = 0; i < 1000; i++) {
            rows.append(row("History", "Kerala", "Q" + i + "?", "0", "R-" + i)).append('\n');
        }
        upload(admin(), rows.toString()).andExpect(status().isOk()).andExpect(jsonPath("$.importedCount").value(1000));
    }

    @Test
    void invalidUtf8RejectsTheWholeFile() throws Exception {
        byte[] head = (HEADER + "\n" + row("History", "Kerala", "Caf", "0", "A-1")).getBytes(StandardCharsets.UTF_8);
        byte[] bad = new byte[head.length + 1];
        System.arraycopy(head, 0, bad, 0, head.length);
        bad[head.length] = (byte) 0xE9; // Latin-1 é, invalid UTF-8
        upload(admin(), bad).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Save the file as CSV UTF-8 and upload again"));
        assertThat(count("question")).isZero();
    }

    @Test
    void headerRulesAreCaseInsensitiveAnyOrderAndIgnoreErrorsAndReviewerColumns() throws Exception {
        String a = admin();
        String reordered = "EXPLANATION,errors,sourceRef,category,subject,topic,examLevel,difficulty,textMl,TextEn,optionA,optionB,optionC,optionD,answerIndex,attribution,reviewedBy,reviewedAt\n"
                + "Because.,\"row 5 problem\",A-1,KERALA_PSC,History,Kerala,TENTH,EASY,,Q?,A,B,C,D,1,,someone,2026-01-01T00:00:00Z\n";
        upload(a, reordered).andExpect(status().isOk()).andExpect(jsonPath("$.importedCount").value(1));
        assertThat(jdbc.sql("SELECT count(*) FROM question_version WHERE reviewed_by IS NULL AND reviewed_at IS NULL").query(Integer.class).single()).isEqualTo(1);

        upload(a, HEADER.replace(",explanation", "") + "\nx\n").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("The header is missing the column explanation."));
        upload(a, HEADER + ",colour\n" + row("History", "Kerala", "Q?", "0", "A-2") + ",red\n").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("colour")));
        assertThat(count("question")).isEqualTo(1);
    }

    @Test
    void quotedFieldsHoldCommasQuotesAndLineBreaksAndBlankLinesKeepSpreadsheetNumbering() throws Exception {
        String a = admin();
        String body = HEADER + "\n"
                + "KERALA_PSC,History,Kerala,TENTH,EASY,,\"Who said \"\"hi\"\", then\nleft?\",A,B,C,D,0,Because.,,R-1\n"
                + "\n"
                + "KERALA_PSC,History,Kerala,TENTH,EASY,,Bad?,A,B,C,D,9,Because.,,R-2\n";
        upload(a, body).andExpect(status().isOk()).andExpect(jsonPath("$.importedCount").value(1))
                .andExpect(jsonPath("$.errors[0].row").value(4));
        assertThat(jdbc.sql("SELECT text_en FROM question_version").query(String.class).single()).isEqualTo("Who said \"hi\", then\nleft?");
    }

    @Test
    void malayalamSurvivesTheRoundTripByteForByte() throws Exception {
        byte[] file = Files.readAllBytes(Path.of("src/test/resources/upload/malayalam.csv"));
        assertThat(file[0]).isEqualTo((byte) 0xEF); // the fixture starts with a BOM, which is stripped
        upload(admin(), file).andExpect(status().isOk()).andExpect(jsonPath("$.importedCount").value(1)).andExpect(jsonPath("$.errorCount").value(0));
        String expectedText = "കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദി ഏത്? \"ക്ഷ\" ന്‍ന, ക്‌ഷ";
        String stored = jdbc.sql("SELECT text_ml FROM question_version").query(String.class).single();
        assertThat(stored).isEqualTo(Normalizer.normalize(expectedText, Normalizer.Form.NFC));
        assertThat(stored.getBytes(StandardCharsets.UTF_8)).isEqualTo(expectedText.getBytes(StandardCharsets.UTF_8));
        assertThat(stored).contains("‍").contains("‌");
        String explanation = jdbc.sql("SELECT explanation FROM question_version").query(String.class).single();
        assertThat(explanation).contains("ൻ ൺ ർ ൽ ൾ").contains("\n");
        assertThat(jdbc.sql("SELECT subject.name FROM subject").query(String.class).single()).isEqualTo("ചരിത്രം");
    }

    @Test
    void nonNormalisedTextIsStoredNfc() throws Exception {
        String decomposed = "Café?"; // e + combining acute
        upload(admin(), csv(row("History", "Kerala", decomposed, "0", "N-1"))).andExpect(status().isOk());
        assertThat(jdbc.sql("SELECT text_en FROM question_version").query(String.class).single()).isEqualTo("Café?");
    }

    @Test
    void aDatabaseFailureMidImportImportsNothingAndReturns500ProblemDetails() throws Exception {
        String a = admin();
        // Postgres cannot store a NUL character, so the second row fails after the first was written.
        upload(a, csv(row("History", "Kerala", "Fine?", "0", "F-1"), row("History", "Kerala", "Bad\u0000nul?", "0", "F-2")))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.status").value(500))
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("nothing was imported")));
        assertThat(count("question")).isZero();
        assertThat(count("question_version")).isZero();
        assertThat(count("subject")).isZero();
    }

    @Test
    void theEleventhUploadInTheHourIsRefusedWith429AndRetryAfterAndProcessesNothing() throws Exception {
        String a = admin();
        for (int i = 0; i < 10; i++) {
            upload(a, csv(row("History", "Kerala", "Q" + i + "?", "0", "L-" + i))).andExpect(status().isOk());
        }
        upload(a, csv(row("History", "Kerala", "Eleventh?", "0", "L-11")))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.status").value(429));
        assertThat(count("question")).isEqualTo(10);
        // another admin has their own bucket
        upload(admin(), csv(row("History", "Kerala", "Other admin?", "0", "L-12"))).andExpect(status().isOk());
    }

    @Test
    void rejectedUploadsGiveTheirTokenBackSoMistakesDoNotUseTheHour() throws Exception {
        String a = admin();
        for (int i = 0; i < 12; i++) {
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(UPLOADS).header("Authorization", a)
                    .contentType("application/json").content("{}")).andExpect(status().isBadRequest());
        }
        // twelve rejected uploads would have emptied a bucket of ten
        upload(a, csv(row("History", "Kerala", "After the slips?", "0", "R-1"))).andExpect(status().isOk());
    }

    @Test
    void aMalformedMultipartBodyIs400ProblemDetails() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(UPLOADS).header("Authorization", admin())
                .contentType("multipart/form-data; boundary=xyz").content("--xyz\r\nbroken"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.errors[0].field").value("file"));
    }

    @Test
    void nonMultipartRequestIsA400() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(UPLOADS).header("Authorization", admin())
                .contentType("application/json").content("{}")).andExpect(status().isBadRequest());
    }
}

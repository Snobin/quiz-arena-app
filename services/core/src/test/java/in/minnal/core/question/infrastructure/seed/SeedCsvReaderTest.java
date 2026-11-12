package in.minnal.core.question.infrastructure.seed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.minnal.core.question.application.MappedSeedRow;
import in.minnal.core.question.application.SeedRow;
import in.minnal.core.question.application.SeedRowMapper;
import in.minnal.core.question.domain.FieldError;
import in.minnal.core.question.domain.QuestionValidator;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;

class SeedCsvReaderTest {

    static final String HEADER = String.join(",", SeedRow.COLUMNS);

    @Test
    void readsRowsNumberedAsInASpreadsheet() throws IOException {
        String csv = HEADER + "\n"
                + "KERALA_PSC,Kerala Geography,Rivers,TENTH,EASY,,\"Longest river, by length?\",Periyar,Pamba,Chaliyar,Kabani,0,\"Line one\nline two\",,r-1,Snobin,\n"
                + "KERALA_PSC,Science,Physics,TENTH,EASY,,Unit of force?,Newton,Joule,Watt,Pascal,0,N,,r-2,Snobin,\n";

        List<SeedRow> rows = SeedCsvReader.parse(csv);

        assertThat(rows).extracting(SeedRow::rowNumber).containsExactly(2, 3);
        assertThat(rows.getFirst().get("textEn")).isEqualTo("Longest river, by length?");
        assertThat(rows.getFirst().get("explanation")).isEqualTo("Line one\nline two");
        assertThat(rows.get(1).get("sourceRef")).isEqualTo("r-2");
    }

    @Test
    void toleratesALeadingBom() throws IOException {
        byte[] bytes = ("﻿" + HEADER + "\nKERALA_PSC,S,T,TENTH,EASY,,Q?,a,b,c,d,0,e,,r-1,Snobin,\n").getBytes(StandardCharsets.UTF_8);
        List<SeedRow> rows = SeedCsvReader.read(new ByteArrayResource(bytes));
        assertThat(rows).hasSize(1);
        assertThat(rows.getFirst().get("category")).isEqualTo("KERALA_PSC");
    }

    @Test
    void cellCountMismatchIsARowProblem() throws IOException {
        String full = "KERALA_PSC,S,T,TENTH,EASY,,Q?,a,b,c,d,0,e,,r-1,Snobin,";
        List<SeedRow> rows = SeedCsvReader.parse(HEADER + "\nKERALA_PSC,S\n" + full + ",extra\n" + full + "\n");

        assertThat(rows).extracting(SeedRow::structureProblem).containsExactly(
                "has 2 cells, header has 17", "has 18 cells, header has 17", null);
        MappedSeedRow mapped = new SeedRowMapper(new QuestionValidator()).map(rows.getFirst());
        assertThat(mapped.errors()).containsExactly(new FieldError("row", "has 2 cells, header has 17"));
        assertThat(mapped.sourceRef()).isNull();
    }

    @Test
    void duplicateHeaderColumnIsAnUnreadableFile() {
        assertThatThrownBy(() -> SeedCsvReader.parse(HEADER + ",topic\n"))
                .isInstanceOf(IOException.class);
        assertThatThrownBy(() -> SeedCsvReader.parse(HEADER + ", topic\n"))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("topic");
    }

    @Test
    void missingColumnIsAnUnreadableFile() {
        assertThatThrownBy(() -> SeedCsvReader.parse("category,subject\nKERALA_PSC,S\n"))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("reviewedBy");
    }

    @Test
    void invalidUtf8IsAnUnreadableFile() {
        byte[] bytes = (HEADER + "\n").getBytes(StandardCharsets.UTF_8);
        byte[] broken = new byte[bytes.length + 2];
        System.arraycopy(bytes, 0, broken, 0, bytes.length);
        broken[bytes.length] = (byte) 0xC3;
        broken[bytes.length + 1] = (byte) 0x28;
        assertThatThrownBy(() -> SeedCsvReader.read(new ByteArrayResource(broken))).isInstanceOf(IOException.class);
    }

    /** The committed starter file: 30 unsigned drafts, each rejected only for reviewedBy. */
    @Test
    void starterFileHasThirtyUnsignedRowsThatFailOnlyOnReviewedBy() throws IOException {
        List<SeedRow> rows = SeedCsvReader.read(new ClassPathResource("seed/kerala-psc-starter.csv"));
        SeedRowMapper mapper = new SeedRowMapper(new QuestionValidator());

        assertThat(rows).hasSize(30);
        Set<String> sourceRefs = new HashSet<>();
        Set<String> subjects = new HashSet<>();
        for (SeedRow row : rows) {
            MappedSeedRow mapped = mapper.map(row);
            assertThat(mapped.errors()).as("row %d", row.rowNumber())
                    .containsExactly(new FieldError("reviewedBy", SeedRowMapper.REVIEWED_BY_REQUIRED));
            assertThat(row.get("attribution")).as("row %d attribution", row.rowNumber()).isEmpty();
            assertThat(row.get("reviewedAt")).as("row %d reviewedAt", row.rowNumber()).isEmpty();
            assertThat(sourceRefs.add(mapped.sourceRef())).as("unique sourceRef %s", mapped.sourceRef()).isTrue();
            subjects.add(mapped.candidate().subject());
        }
        assertThat(subjects).hasSizeBetween(5, 6);
        int[] correctPerPosition = new int[4];
        rows.forEach(row -> correctPerPosition[Integer.parseInt(row.get("answerIndex"))]++);
        assertThat(java.util.Arrays.stream(correctPerPosition).max().orElseThrow()).as("most answers correct at one option position A–D").isLessThanOrEqualTo(9);
    }
}

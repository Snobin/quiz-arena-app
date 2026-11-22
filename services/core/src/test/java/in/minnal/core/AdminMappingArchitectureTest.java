package in.minnal.core;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Story 3.1: admin controllers live only in a {@code .api.admin} package, and every
 * {@code /api/core/v1/admin/**} mapping lives only there. Source scan; no ArchUnit.
 */
class AdminMappingArchitectureTest {

    private static final String ADMIN_PATH = "/api/core/v1/admin";
    private static final Pattern MAPPING = Pattern.compile("@(Request|Get|Post|Put|Patch|Delete)Mapping\\s*\\(([^)]*)\\)");
    private static final Pattern CLASS_PATH = Pattern.compile("@RequestMapping\\s*\\(\\s*(?:value\\s*=\\s*)?\"([^\"]*)\"");

    private static boolean inAdminPackage(Path file) {
        return file.toString().replace('\\', '/').contains("/api/admin/");
    }

    @Test
    void adminControllersAreMappedUnderTheAdminPathAndNowhereElse() throws IOException {
        List<String> violations = new ArrayList<>();
        try (Stream<Path> files = Files.walk(Path.of("src/main/java"))) {
            for (Path file : files.filter(f -> f.toString().endsWith(".java")).toList()) {
                String text = Files.readString(file);
                boolean controller = Pattern.compile("@(Rest)?Controller\\b").matcher(text).find();
                boolean mentionsAdminPath = text.contains(ADMIN_PATH);
                if (inAdminPackage(file)) {
                    if (controller) {
                        var m = CLASS_PATH.matcher(text);
                        if (!m.find() || !m.group(1).startsWith(ADMIN_PATH)) {
                            violations.add(file + " is an admin controller not mapped under " + ADMIN_PATH);
                        }
                        var any = MAPPING.matcher(text);
                        while (any.find()) {
                            String args = any.group(2);
                            if (args.contains("\"/") && !args.contains(ADMIN_PATH)) {
                                violations.add(file + " has an absolute mapping outside " + ADMIN_PATH + ": " + args);
                            }
                        }
                    }
                } else if (mentionsAdminPath && controller) {
                    violations.add(file + " maps " + ADMIN_PATH + " outside the admin package");
                }
            }
        }
        assertThat(violations).isEmpty();
    }

    /** Every handler method in an admin controller must authenticate with requireAdmin (source scan). */
    @Test
    void everyAdminHandlerMethodCallsRequireAdmin() throws IOException {
        Pattern handler = Pattern.compile("@(Get|Post|Put|Patch|Delete)Mapping\\b");
        List<String> violations = new ArrayList<>();
        try (Stream<Path> files = Files.walk(Path.of("src/main/java"))) {
            for (Path file : files.filter(f -> f.toString().endsWith(".java")).filter(AdminMappingArchitectureTest::inAdminPackage).toList()) {
                String text = Files.readString(file);
                if (!Pattern.compile("@(Rest)?Controller\\b").matcher(text).find()) {
                    continue;
                }
                var m = handler.matcher(text);
                List<Integer> starts = new ArrayList<>();
                while (m.find()) {
                    starts.add(m.start());
                }
                for (int i = 0; i < starts.size(); i++) {
                    int end = i + 1 < starts.size() ? starts.get(i + 1) : text.length();
                    String method = text.substring(starts.get(i), end);
                    if (!method.contains("requireAdmin(")) {
                        violations.add(file + ": handler near offset " + starts.get(i) + " does not call requireAdmin");
                    }
                }
            }
        }
        assertThat(violations).isEmpty();
    }

    @Test
    void thereIsAtLeastOneAdminController() throws IOException {
        try (Stream<Path> files = Files.walk(Path.of("src/main/java"))) {
            assertThat(files.filter(AdminMappingArchitectureTest::inAdminPackage).count()).isGreaterThan(0);
        }
    }
}

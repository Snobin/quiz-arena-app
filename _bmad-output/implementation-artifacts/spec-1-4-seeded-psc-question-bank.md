---
title: 'Story 1.4: A seeded PSC question bank'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: '4d8d502096858f0b6f51535786bcdc0f6b9b5af0'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-quiz-arena-2026-11-10/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** core-service has no questions. Matches need a trusted, attributed, admin-reviewed question bank, served to game-service only through `/internal/question-sets`.

**Approach:** Add a Flyway schema for subject, topic, question and question_version, an immutable-version domain, and one shared `QuestionValidator`. A `seed` profile loader imports the CSV idempotently, and a token-guarded `/internal/question-sets` makes the random draw. Its DTOs live in `contracts`. The epics.md Story 1.4 acceptance criteria are the contract; this spec adds the decisions below.

## Boundaries & Constraints

**Always:**
- **Schema (`V1__question_bank.sql`, core schema only):**
  - `subject(id, name, created_at)`, unique on `lower(name)`.
  - `topic(id, subject_id, name, created_at)`, unique on `(subject_id, lower(name))`.
  - `question(id, source_ref?, created_at, deleted_at?)`, with a partial unique index on `source_ref` where it is not null.
  - `question_version`: every epics.md column, plus `question_id`, `subject_id` and `topic_id` (FKs). `options text[]` has `CHECK (cardinality = 4)`; `answer_index` has `CHECK 0–3`; a `CHECK` requires `text_ml` or `text_en`; enums are `CHECK`-constrained text. It is `UNIQUE(question_id, version)`.
  - UUIDs are generated in Java. Timestamps are `timestamptz` mapped to `Instant`.
  - There is no other table.
- **Persistence:** `JdbcClient` (spring-boot-starter-jdbc, already present). No JPA.
- **Package:** `in.minnal.core.question.(api|application|domain|infrastructure)`.
- **Published versions are immutable:** the domain rejects any change to a `PUBLISHED` version. The only write path for an existing version is draft-only (`… WHERE status = 'DRAFT'`; zero rows updated throws).
- **`QuestionValidator`** is one Spring component. It returns `List<FieldError(field, problem)>` covering every rule in epics.md, and never throws.
- Subject and topic names are trimmed and NFC-normalised, and matched case-insensitively.
- **Loader (`seed` profile, an `ApplicationRunner`):**
  - It reads `minnal.seed.file`, defaulting to `classpath:seed/kerala-psc-starter.csv` (UTF-8; BOM tolerated), and parses it with Apache Commons CSV, a new runtime dependency (an agent decision, open to change at approval: a boring, well-tested parser that Story 3.3 reuses).
  - Per row: `sourceRef` is required for seed rows (it is the idempotency key). It applies the epics.md rules and messages exactly. A `sourceRef` that already exists counts as unchanged; content differences are ignored, because edits go through admin versions later.
  - It logs `row N · field · problem` and the summary `N loaded · M rows skipped · K unchanged`, then exits the JVM (code 0, or 1 if the file can't be read).
  - Each row is its own transaction.
- **Internal token:**
  - The header is `X-Internal-Token`. It is compared in constant time against `minnal.internal.token`, taken from env `MINNAL_INTERNAL_TOKEN`.
  - If the token is unset, the endpoint fails closed with 401 and a WARN at startup; the app still boots.
  - Add it to `deploy/.env.example` and to the compose environment of core-service and game-service. Never write `deploy/.env`.
- **`POST /internal/question-sets`:**
  - The request and response records live in `contracts` (`in.minnal.contracts.internal`). The response is `{questions: [...]}`.
  - Status codes and messages follow the epics.md acceptance criteria: 401, 400 for a count outside 1–30 or a missing category or requesterId, 422 for `CUSTOM` ("custom source not available"), and 422 when fewer than `count` match (never a short set).
  - The draw selects each non-deleted question's latest `PUBLISHED` version, applies the filters, then `ORDER BY random() LIMIT count` in one query.
  - All errors are ProblemDetail responses.
- **Starter CSV content (user decision):** about 30 questions drafted by the agent across 5–6 Kerala PSC subjects, on stable, checkable facts.
  - They are bilingual where the agent is confident. Options are language-neutral where possible (numbers, years, proper names).
  - **`reviewedBy`, `reviewedAt` and `attribution` are blank on every row**, so the loader rejects them all until Snobin reviews each row and signs it. Nothing is presented as a real PYQ.
- **Tests:**
  - Unit tests: the validator (table-driven) and CSV row mapping.
  - Integration tests with Testcontainers Postgres 18 (test scope; `./mvnw verify` now needs Docker): migrations, immutability, loader idempotency, every endpoint status, the randomness across calls, never DRAFT/DISCARDED/deleted, and a 30-question draw under 500 ms over about 2,000 seeded rows.
  - The Docker-free `CoreApplicationTests` keeps working.

**Never:** admin APIs or UI (Epic 3), topic counts or caching (4.1), `CUSTOM` behaviour beyond the 422, game-service code, routing `/internal` through Caddy, presenting the agent's drafts as reviewed or attributed.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Seed twice | same CSV with 12 valid rows | run 1: 12 loaded; run 2: 0 loaded · 12 unchanged | N/A |
| Unreviewed row | `reviewedBy` blank | skipped with the exact epics.md message | summary counts it |
| Bad row | 3 options, blank explanation | one row with both problems reported | other rows still load |
| Draw | 15 published, count 10 | 10 distinct, latest published version each | N/A |
| Short pool | 9 published, count 10 | 422 ProblemDetail | never 9 |
| Hidden versions | DRAFT v2 over PUBLISHED v1; a deleted question | v1 served; deleted question never | N/A |
| Bad auth / count | wrong token; count 31 | 401; 400 | unset token → 401 |
| Edit published | update a PUBLISHED version | rejected | DB row unchanged |

</frozen-after-approval>

## Code Map

- `services/core/pom.xml`: has webmvc, jdbc, flyway(+postgresql) and actuator. Add `commons-csv`, plus `spring-boot-testcontainers` and `testcontainers-postgresql` (test scope).
- `services/core/src/main/resources/application.yaml`: Flyway `schemas: core`, `create-schemas: false`, `mvc.problemdetails.enabled`. Add `minnal.internal.token: ${MINNAL_INTERNAL_TOKEN:}` and `minnal.seed.file`.
- `services/core/src/test/resources/application-test.yaml`: excludes the DataSource, Flyway and Redis auto-configuration, for the context-load test only. The integration tests use a separate profile or `@ServiceConnection`.
- `services/core/src/main/java/in/minnal/core/platform/infrastructure/web/RequestIdFilter.java`: the existing platform package. Put the internal-token filter beside it, scoped to `/internal/**`.
- `contracts/`: currently only `package-info.java`. Add the `internal` DTO records (no Spring).
- `deploy/compose.yaml`: the comment at line 4 says `/internal` is never exposed. Add the env var. `deploy/verify-local.sh`: add an assertion that `/internal/question-sets` through Caddy returns 404.
- `README.md`: add the seed command and the token setup.

## Tasks & Acceptance

**Execution:**
- [x] `services/core/src/main/resources/db/migration/V1__question_bank.sql` -- the schema above
- [x] `in.minnal.core.question.domain` -- `Question`, `QuestionVersion` (immutability guard), enums, `QuestionCandidate`, `QuestionValidator`, `FieldError`
- [x] `in.minnal.core.question.infrastructure` -- JDBC repositories (subject/topic upsert, versions, draw query)
- [x] `in.minnal.core.question.application` -- `QuestionSetService`, `StarterSeedService`
- [x] `in.minnal.core.question.infrastructure.seed.SeedRunner` -- the `seed` profile runner, logging and exit code
- [x] `in.minnal.core.question.api.internal.QuestionSetController` + `platform…/InternalTokenFilter` -- the endpoint
- [x] `contracts/src/main/java/in/minnal/contracts/internal/*` -- the DTO records
- [x] `services/core/src/main/resources/seed/kerala-psc-starter.csv` -- about 30 drafted, unsigned rows
- [x] `deploy/compose.yaml`, `deploy/.env.example`, `deploy/verify-local.sh`, `README.md` -- token, Caddy 404 check, seed how-to
- [x] Tests -- one per matrix row, plus the epics.md acceptance criteria (validator table, migration shape, randomness, the 500 ms draw)

**Acceptance Criteria:**
- Given `./mvnw verify` with Docker running, when it runs, then every module passes, including the Testcontainers suites.
- Given the stack running with the starter CSV unchanged, when the seed command runs, then it reports `0 loaded · 30 rows skipped · 0 unchanged` and each skip names `reviewedBy`.
- Given `deploy/verify-local.sh`, when it runs, then `/internal/question-sets` through Caddy is 404.

## Implementation Notes

- The token guard is a `HandlerInterceptor` (`InternalTokenInterceptor`, registered by `InternalApiWebConfig`) acting on `@InternalApi` controllers, not a servlet filter. A filter on the raw URI could be bypassed with `;matrix` params or percent-encoding (triage row 1). Its 401 is the standard ProblemDetail with `instance` and `X-Request-Id`. A configured token that is blank or starts with `change-me` fails closed with a WARN.
- `application-test.yaml` no longer excludes the DataSource auto-configuration: the JDBC repositories need the bean. It never connects, so `CoreApplicationTests` stays Docker-free. Integration tests use the `it` profile with Testcontainers Postgres 18.
- Starter CSV: 30 rows over 5 subjects (27 bilingual, 3 English-only). Answer positions are rebalanced to A 8 / B 8 / C 7 / D 7. Every row is unsigned and awaits Snobin's review of facts and Malayalam wording.
- An already-migrated local DB needs `down -v` after V1 changed during review (Flyway checksum mismatch). That is fine because V1 was never merged.
- Review loop 0 applied 19 patches, deferred 1 (a `seed` profile context test) and rejected 7. Verified afterwards: `./mvnw verify` BUILD SUCCESS (120 tests incl. Testcontainers); `deploy/verify-local.sh` 23/23 PASS on a fresh stack; the seed run printed `0 loaded · 30 rows skipped · 0 unchanged` and exited 0. The 500 ms draw test ran on a MacBook, not on VPS-class hardware.

## Spec Change Log

## Review Triage Log

Layers: BH = Blind Hunter, ECH = Edge Case Hunter, VG = Verification Gap, self = orchestrator check.

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | BH, ECH, VG | Token check bypass via `;matrix` params or percent-encoding | high | `shouldNotFilter` reads the raw `getRequestURI()`; Spring MVC routes on the decoded, matrix-stripped path, so `/internal;x=1/…` reaches the controller with no token (Caddy blocks this only from outside) | patch |
| 2 | BH | 401 is hand-written JSON, possibly ahead of `RequestIdFilter`, with no `instance` | low | Same filter; folded into the interceptor fix for row 1 | patch |
| 3 | BH, ECH | `.env.example` placeholder token accepted; only the configured side is stripped | medium | `change-me-internal-token` is a known value; the comparison is asymmetric | patch |
| 4 | BH | Compose uses `:-` (empty) instead of `:?` for the token | false | Deliberate: the spec requires fail-closed while the app still boots | reject |
| 5 | BH | Draw runs `DISTINCT ON` before filters; slows at scale | low | 30 questions from about 2,000 rows meets 500 ms in the test; MVP bank size is about 2,000 | reject |
| 6 | BH | `requesterId` required but unused | false | Part of the AD-12 contract; `CUSTOM` ownership (Epic 6) uses it | reject |
| 7 | BH, self | Starter answer key skewed (A×10, B×12, C×7, D×1) | medium | Players could game the key | patch |
| 8 | BH | Validator accepts duplicate options; no length caps | medium | Duplicate options are a real content defect inherited by every write path; length caps are an unstated product rule (rejected) | patch |
| 9 | BH, ECH | `SeedRowMapper` doc claims attribution is normalised | low | The spec says verbatim; the doc is wrong | patch |
| 10 | BH, ECH, VG | Non-`DataAccessException` failures or an `existsBySourceRef` error abort the run; runner exit unplanned; store-failure path untested | medium | Only `DataAccessException` is caught, inside the try; no test reaches the catch | patch |
| 11 | BH, ECH | Any `DuplicateKeyException` counted as unchanged | low | Another unique key would be miscounted silently | patch |
| 12 | BH, ECH | No DB CHECK for reviewed PUBLISHED rows or blank explanation/options | medium | Only the repository guards these; V1 is unmerged, so it can still change | patch |
| 13 | BH | No immutability trigger | low | Domain + draft-only update meet the acceptance criterion; a trigger adds DB logic | reject |
| 14 | BH | Randomness test counts a reshuffle as a new mix | medium | A `Set<List<String>>` of ordered lists | patch |
| 15 | BH | README seed summary omits `· 0 unchanged`; spec/sprint status out of sync | low | README is a direct fix; status is a spec record (rejected part) | patch |
| 16 | BH | `verify-local.sh` exact core table list breaks with later migrations | low | Story 4.1 adds `recent_topic` | patch |
| 17 | BH | `InternalQuestion` lacks subject/topic/difficulty | false | AD-12 fixes the response shape exactly | reject |
| 18 | BH | Starter rows 005/019 under the wrong topic; 3 rows English-only | low | Wrong topics skew `topicId` pools; English-only rows are allowed and left for the human review | patch |
| 19 | ECH | CSV record cell count ≠ header is silently truncated/padded; duplicate header overwrites | medium | An unquoted comma shifts every later field | patch |
| 20 | ECH | Fractional `count` (1.9) truncated by Jackson | low | Internal caller only (game-service) | reject |
| 21 | ECH | Future `reviewedAt` accepted | low | Unlikely in a hand-reviewed file; adds a rule | reject |
| 22 | ECH | `nextDraft` on non-published or non-latest; `updateDraft` on a missing id mislabels the error | low | No caller until Epic 3 | reject |
| 23 | ECH | `updateDraft` can publish without a review | low | Covered by the DB CHECK in row 12 | patch (via row 12) |
| 24 | VG | `textMl` never value-checked in the draw response | medium | Fixtures always pass `textMl = null` | patch |
| 25 | VG | The `seed` profile is never started through Spring | medium | Only the package-private constructor is tested; testing needs an overridable exit | defer |
| 26 | VG | No stack check that core received `MINNAL_INTERNAL_TOKEN` | medium | A dropped env key still boots healthy | patch |
| 27 | VG | `CoreApplicationTests` Javadoc is stale about the DataSource | low | Direct doc fix | patch |

## Design Notes

- **The draw:**
  `WITH latest AS (SELECT DISTINCT ON (qv.question_id) qv.* FROM question_version qv JOIN question q ON q.id = qv.question_id WHERE q.deleted_at IS NULL AND qv.status = 'PUBLISHED' ORDER BY qv.question_id, qv.version DESC) SELECT … FROM latest WHERE <filters> ORDER BY random() LIMIT :count`.
  Index `(question_id, version DESC) WHERE status = 'PUBLISHED'`.
- **Seed run:** `docker compose -f deploy/compose.yaml --env-file deploy/.env run --rm -e SPRING_PROFILES_ACTIVE=local,seed core-service`.

## Verification

**Commands:**
- `./mvnw verify` -- expected: BUILD SUCCESS (Docker running)
- `deploy/verify-local.sh` -- expected: all checks pass, including the `/internal` 404

**Manual checks:**
- Run the seed command on the stack. All 30 rows are skipped for `reviewedBy` until Snobin signs them.

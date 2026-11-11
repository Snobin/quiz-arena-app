---
title: 'Story 1.1: Project scaffold runs locally'
type: 'chore'
created: '2026-11-11'
status: 'done'
baseline_commit: '27b6d8547a0cfc183f76b01e62cae3d4b6e8ed08'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-quiz-arena-2026-11-10/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repo has no code. Every later story needs one consistent, runnable base, and the same stack must run locally and in production.

**Approach:** Hand-build the monorepo (no starter): a Maven multi-module build (`contracts` + `core`/`game`/`ratings` Spring Boot 4.1 services on Java 25), a React PWA shell in `web/`, and one `deploy/compose.yaml` that brings up Caddy, the three services, Postgres 18 and Valkey 9 healthy, with schema-per-service isolation, request-id JSON logging and ProblemDetail errors.

## Boundaries & Constraints

**Always:**
- Layout: `contracts/`, `services/{core,game,ratings}`, `web/`, `deploy/`. Group id `in.minnal`. Packages: `in.minnal.<service>`, with features as `<feature>.(api|application|domain|infrastructure)`.
- `contracts` is the only shared module, and the build fails if a service module depends on another service module.
- Profiles `local` and `prod`. Every secret comes from an env var; only `deploy/.env.example` (placeholders) is committed, and `deploy/.env` is gitignored.
- One Compose file for local and prod. Images: `caddy:2.11`, `postgres:18`, `valkey/valkey:9.0`; services are built from Dockerfiles (JDK 25 build, JRE 25 runtime). Memory limits are set per container, with JVM heaps capped at about 384 MB.
- Postgres has logins `core` and `ratings`, each with rights on its own schema only. There is no `game` schema or login. Flyway is wired into core and ratings with zero application tables.
- Valkey has `appendonly yes`, `appendfsync everysec` and a named volume. Key prefixes are `core:`, `game:`, `ratings:`.
- Caddy routes `/api/core/**` → core, `/api/ratings/**` → ratings and `/ws` → game (WebSocket upgrade). `/internal/**` returns 404 at Caddy. `GET /health` goes to core `/actuator/health`. Caddy sets `X-Request-Id` when it's absent and forwards it.
- Service logs are structured JSON, and each line includes `requestId`.
- Unknown `/api/<service>/v1/**` paths return an RFC 9457 `ProblemDetail` 404.
- The Maven Wrapper (`mvnw`) is committed, so contributors only need JDK 25.
- Pin the versions to the latest patch of each line, checked at implementation time: Spring Boot 4.1.x, React 19.3, TS 6.0, Vite 8.1, vite-plugin-pwa 1.x, Tailwind 4.3, TanStack Query 5, Zustand 5, react-i18next 17, @stomp/stompjs 7.3.

**Never:** application tables, auth, real STOMP messaging, design tokens, CI/CD or deploy (those belong to Stories 1.2–1.6); a public `/actuator/**` route; secrets in git; any cross-schema grant.

**Decisions:**
- **Local toolchain.** The agent installs it with Homebrew: `brew install --cask temurin@25` and `brew install --cask orbstack` (OrbStack is the Docker runtime). Maven comes only through the committed wrapper.
- **Spec size.** Kept as one spec at about 2,000 tokens; the user accepted this over a split.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Health | `GET :8080/health` via Caddy | 200 `{"status":"UP"}` from core | N/A |
| Internal path | `GET :8080/internal/anything` | 404 from Caddy; no service log line | N/A |
| Unknown API path | `GET /api/core/v1/nope` | 404 `application/problem+json` | N/A |
| Request id | request without `X-Request-Id` | Caddy generates one; the service log line carries it | an existing header is forwarded unchanged |
| Cross-schema | `core` login queries the `ratings` schema | permission denied | N/A |
| WebSocket | upgrade to `/ws` | 101 Switching Protocols from game | N/A |

</frozen-after-approval>

## Code Map

- Repo is empty apart from `_bmad*`, `.claude/`, `docs/`, and `.gitignore` (which ignores only `.DS_Store`). There is no existing code to reuse or preserve.
- `.gitignore`: extend it with `target/`, `node_modules/`, `dist/`, `deploy/.env`, and IDE files.

## Tasks & Acceptance

**Execution:**
- [x] Toolchain: run `brew install --cask temurin@25 orbstack`, start OrbStack, then confirm `java -version` reports 25 and that `docker compose version` works.
- [x] `pom.xml`, `.mvn/wrapper/*`, `mvnw*`: create the parent POM (Spring Boot 4.1.x parent, Java 25, modules list), the Maven Wrapper, and an Enforcer `bannedDependencies` rule that bans `in.minnal:*-service` artifacts inside service modules.
- [x] `contracts/pom.xml` + `in/minnal/contracts/package-info.java`: create the empty shared module.
- [x] `services/{core,game,ratings}/pom.xml` + `in/minnal/<svc>/<Svc>Application.java`: add Web and Actuator to every service, Flyway and Postgres to core and ratings, WebSocket to game, Spring Data Redis to all three, and a context-load test in each.
- [x] `services/*/src/main/resources/application{,-local,-prod}.yaml`: set ports, datasource, Valkey host and key prefix (`minnal.valkey.key-prefix`) from env, `spring.mvc.problemdetails.enabled`, structured JSON console logging with MDC, and expose only health over actuator.
- [x] `services/*/.../infrastructure/web/RequestIdFilter.java`: put `X-Request-Id` into MDC as `requestId`, generating one if it's absent. Each service gets its own copy, because contracts holds no Spring code.
- [x] `services/game/.../infrastructure/ws/WebSocketConfig.java`: add a minimal endpoint `/ws` that accepts the upgrade (STOMP arrives in Story 1.6).
- [x] `services/*/Dockerfile`: multi-stage build using the wrapper, Temurin 25, a non-root runtime user, and a healthcheck-capable runtime.
- [x] `deploy/compose.yaml`, `deploy/.env.example`: define the six services, healthchecks, `depends_on: service_healthy`, `mem_limit`, `JAVA_TOOL_OPTIONS=-Xmx384m`, named volumes `pgdata` and `valkeydata`, and `SPRING_PROFILES_ACTIVE` taken from env.
- [x] `deploy/caddy/Caddyfile`: listen on `:8080` locally, with the routes, `/internal` 404, `/health` rewrite, and request-id header described above.
- [x] `deploy/postgres/init/01-schemas.sh`: create logins from env passwords, create the schemas owned by their logins, `REVOKE ALL ON SCHEMA public FROM PUBLIC`, and grant nothing across schemas.
- [x] `deploy/valkey/valkey.conf`: set the AOF settings.
- [x] `web/*`: Vite React-TS app with all the pinned libraries, a Tailwind 4 import, a placeholder shell page, vite-plugin-pwa with a minimal manifest, scripts `dev`/`typecheck`/`build`, and dev proxy `/api/core`, `/api/ratings`, `/ws` (ws: true) → `http://localhost:8080`.
- [x] `README.md`: document prerequisites and how to run, build and verify.
- [x] `deploy/verify-local.sh`: script the stack-level ACs (health, routing, 404s, ProblemDetail, request id in logs, cross-schema denial, AOF config, WS upgrade).

**Acceptance Criteria:**
- Given a fresh clone with JDK 25, when `./mvnw verify` runs, then all modules build and the three context-load tests pass, and adding a service-to-service dependency fails the Enforcer rule.
- Given Docker, when `docker compose -f deploy/compose.yaml --env-file deploy/.env up -d` runs, then all six containers report healthy and `deploy/verify-local.sh` passes.
- Given `web/` installed, when `npm run typecheck && npm run build` run, then both succeed, and `npm run dev` renders the shell and proxies to Caddy.

## Implementation Notes

- **JDK install:** `brew install --cask temurin@25` needs an interactive sudo password, which the agent cannot supply. The same Homebrew-fetched Temurin 25.0.5 pkg was unpacked into `~/Library/Java/JavaVirtualMachines/temurin-25.jdk` (no sudo); `/usr/libexec/java_home -v 25` finds it. The default `java` on PATH is still JDK 17, so run Maven with `JAVA_HOME=$(/usr/libexec/java_home -v 25)` or re-run the cask install in a terminal. OrbStack installed normally; its `docker` is in `~/.orbstack/bin`.
- **Pinned versions (2026-11-11):** Spring Boot 4.1.2, Maven 3.9.16 (wrapper 3.3.4, only-script), React 19.3.1, TypeScript 6.0.3, Vite 8.1.7, vite-plugin-pwa 1.3.0, Tailwind 4.3.5, TanStack Query 5.107.1, Zustand 5.1.0, react-i18next 17.1.13 (with i18next 26.7.2), @stomp/stompjs 7.3.0, @vitejs/plugin-react 6.3.0. Images: caddy:2.11, postgres:18, valkey/valkey:9.0, eclipse-temurin:25-jdk/-jre.
- **Cross-cutting code location:** `RequestIdFilter` and `WebSocketConfig` live under a `platform` feature (`in.minnal.<svc>.platform.infrastructure.{web,ws}`) to respect the `<feature>.(api|...)` package rule.
- **Health body:** Boot 4 adds `"groups"` to health when probes are on, so `management.endpoint.health.probes.enabled=false` keeps `/health` exactly `{"status":"UP"}`.
- **Valkey** gets `--requirepass` from `VALKEY_PASSWORD` (a secret from env), in addition to the AOF config.
- **CORS env var** is `CORS_ALLOWED_ORIGINS` (prod profile only), not `MINNAL_CORS_ALLOWED_ORIGINS`, because the latter would relax-bind over the local profile's `minnal.cors.allowed-origins`. Today it gates only the `/ws` handshake origin; REST CORS is not configured yet.
- **Access log:** `RequestIdFilter` writes one JSON line per request (skipping `/actuator/**` so healthchecks don't flood the logs); this is the line `verify-local.sh` greps for `requestId`.
- **Caddy healthcheck** uses the admin API on `127.0.0.1:2019` inside the container. Caddy's site address is `{$CADDY_SITE_ADDRESS::8080}`, ready for the prod domain in Story 1.2.
- **Review patches (review loop 0):** applied all 19 patch findings from the triage log. Verified afterwards: `./mvnw verify` passes 36 tests (core 11, game 14, ratings 11); `verify-local.sh` passes 20 of 20 checks against a rebuilt stack; the web typecheck and build pass. Four findings were deferred to `deferred-work.md`.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | VG, BH | `RequestIdFilter` (3 copies) has no tests | medium | Repo search finds no test that references it; the regex and fallback are unverified, and the copies can drift | patch |
| 2 | VG, BH | verify check 6 passes without Caddy's id rule; Caddy has no access log | medium | The filter makes and echoes its own UUID when the header is absent, so the check can't tell who made the id | patch |
| 3 | VG, ECH | `/ws` origin allow-list never exercised | medium | Check 10 sends no Origin, and Spring's handshake treats a missing Origin as same-origin | patch |
| 4 | ECH, BH | prod with empty `CORS_ALLOWED_ORIGINS` silently allows same-origin only; outside Compose, an unresolvable placeholder | medium | Compose passes `${CORS_ALLOWED_ORIGINS:-}` and `WebSocketConfig` filters out blanks | patch |
| 5 | ECH | REST CORS not configured in core/ratings | medium | `minnal.cors.allowed-origins` is read only by `WebSocketConfig`; the Story 1.2 AC owns CORS | defer |
| 6 | ECH, BH | MDC cleared before the ERROR dispatch, so error-path logs lose `requestId` | medium | `OncePerRequestFilter` skips the error dispatch by default and the `finally` removes the MDC | patch |
| 7 | ECH | async dispatch logs early and loses MDC | false | The scaffold has no async endpoints | reject |
| 8 | ECH | public `/health` never access-logged | low | Skipping `/actuator` is intentional, so healthchecks don't flood the logs; changing it adds branching | reject |
| 9 | ECH | Caddy forwards a malformed id, then the service swaps it, so the ids differ | low | True for malformed client headers; the fix is a one-line Caddy matcher | patch |
| 10 | ECH | non-default `CADDY_SITE_ADDRESS` listens on an unpublished port | low | Only relevant to the prod domain work in Story 1.2; the fix adds config surface | reject (note for 1.2) |
| 11 | ECH | verify script ignores `CADDY_HTTP_PORT` | low | `BASE_URL` is hard-coded to 8080; deriving it from `.env` is a one-line fix | patch |
| 12 | ECH, BH | `.env` sourced the bash way, unlike Compose | low | Passwords containing `$`, quotes or spaces diverge; reading them with `printenv` from the container is trivial | patch |
| 13 | ECH | missing `.env` aborts the script without a summary | low | `set -u` is active; a two-line guard fixes it | patch |
| 14 | ECH | fixed `sleep 1` before log greps is flaky | low | Logs flush asynchronously; a short retry loop fixes it | patch |
| 15 | ECH, BH | Valkey has no `maxmemory` under a 256m container limit | medium | `valkey.conf` sets no maxmemory, so the container gets OOM-killed | patch |
| 16 | ECH, BH | Enforcer ban depends on the `-service` suffix; no rule keeps Spring out of contracts | medium | The pattern is `in.minnal:*-service`, and the contracts POM has no ban | patch |
| 17 | ECH | `mvnw` CRLF or lost exec bit breaks image builds | low | There is no `.gitattributes`; a one-file fix | patch |
| 18 | VG | no negative test proving the Enforcer rule fires | medium | Only the passing case runs; an invoker fixture is heavy before CI exists | defer |
| 19 | VG | stack checks run only manually | medium | There is no CI yet (Story 1.2) | defer |
| 20 | VG | check 3 can't tell the `/internal` block from the catch-all 404 | low | Behaviour is identical and a distinguishing fix adds complexity | reject |
| 21 | BH | Valkey password visible in `ps`/inspect via `-a` and `--requirepass` | low | The same secret is already in the container env, but using `REDISCLI_AUTH` for the CLI is a direct correction | patch |
| 22 | BH | no per-service Valkey ACLs (prefixes are only a convention) | medium | AD-3 defines prefixes, not enforcement; this hardens beyond the intent | defer |
| 23 | BH | Caddy depends on all three services being healthy, so one bad service takes the whole site down | medium | `depends_on` uses `service_healthy` for core, game and ratings | patch |
| 24 | BH | container logs never rotate | medium | No `logging` options, an access line per request, and `restart: unless-stopped` | patch |
| 25 | BH | three near-identical Dockerfiles; no dependency layer | low | Developer-only duplication; consolidating them is more than a direct fix | reject |
| 26 | BH | PWA icons incomplete; splash color mismatch | low | Placeholder shell; installability is Story 7.2 | reject (note for 7.2) |
| 27 | BH | `App.tsx` probe ignores `response.ok` and mistypes the body | low | Verified: it calls `response.json()` unconditionally; trivial fix | patch |
| 28 | BH | JSON-log check reads only core; predictable `/tmp` path | low | Verified: check 7 reads core only and uses `/tmp/minnal-pd.$$` | patch |

## Design Notes

- **Context-load tests without Docker:** core and ratings need Postgres and Valkey at startup, so the tests use a `test` profile that excludes the DataSource, Flyway and Redis auto-configuration. Tests stay fast and Docker-free; the stack ACs are covered by `verify-local.sh`.
- **Enforcer over ArchUnit:** a module-level dependency ban is enforced at build time with no test code, which is the precise guarantee AD-1 asks for.
- **Valkey key prefix:** this story only exposes it as a config property; it's applied when a story first writes keys.

## Verification

**Commands:**
- `./mvnw -q verify` -- expected: BUILD SUCCESS, 3 context tests pass
- `docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --wait` -- expected: all 6 healthy
- `bash deploy/verify-local.sh` -- expected: every check prints PASS
- `cd web && npm ci && npm run typecheck && npm run build` -- expected: exit 0

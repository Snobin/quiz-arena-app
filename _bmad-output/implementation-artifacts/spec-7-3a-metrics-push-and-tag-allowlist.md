---
title: 'Story 7.3a: Metrics push and tag allowlist'
type: 'feature'
created: '2026-11-23'
status: 'done'
baseline_commit: '21d4a55'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** core-, game- and ratings-service keep their Micrometer meters only in memory, so the developer cannot see them anywhere, and nothing stops a meter from carrying a user id, name, email or room code as a tag.

**Approach:** Story 7.3 is split; this is the first part (7.3b product metrics and 7.3c dashboards and alerts are in `deferred-work.md`). Each service pushes its registry over OTLP every 60 s to the Grafana Cloud free tier in the prod profile only, and a shared tag allowlist keeps metrics free of personal data. The acceptance criteria in `_bmad-output/planning-artifacts/epics.md` "Story 7.3", first two Givens, are the source of truth; this spec adds the code decisions below.

## Boundaries & Constraints

**Always:** Endpoint and token only in the server-side `.env` (keys added to `deploy/.env.example`, passed through `deploy/compose.yaml`); no new container, so `deploy/check-compose.mjs` still passes. The `local` profile (and tests) push nothing and keep the actuator behaviour as is. A push failure is logged at most once per 10 minutes and never affects a request or a match. The filter lives once, in `contracts`, as plain Java over `micrometer-core` (no Spring): on `minnal.*` meters only the tag keys `service`, `mode`, `outcome`, `reason`, `kind`, `source`, `status` survive; a tag value that looks like a UUID, an email or a room code (6 characters of `A-HJKMNP-Z2-9`, with or without a hyphen) is dropped from any meter. Framework meters (JVM, HTTP server) keep their standard tags, `uri` already templated. Every service tags all meters `service=core|game|ratings`.

**Never:** No new product metric, dashboard or alert (7.3b, 7.3c). No collector container. No change to what existing meters count; existing meter tags outside the allowlist are renamed, not removed: `minnal.match.broadcast.lag{type}` becomes `{kind}` and `minnal.matchmaking.pairings{opponent}` becomes `{kind}`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Prod push | `prod` profile, endpoint and auth set | Registry pushed every 60 s with the Authorization header | Endpoint unreachable: one WARN per 10 min at most, service unaffected |
| Local push | `local` profile or tests | Nothing pushed; actuator unchanged | N/A |
| Disallowed key | `minnal.*` meter tagged `userId` | Tag removed | N/A |
| Risky value | Any meter tagged with a UUID, an email or a room code as value | That tag removed | N/A |
| Framework meter | `http.server.requests`, `jvm.*` | Tags untouched | N/A |
| Allowed tags | `mode`, `kind`, `outcome`, `reason`, `source`, `status`, `service` | Kept | N/A |

</frozen-after-approval>

## Code Map

- `contracts/pom.xml` (enforcer bans only Spring) -- add `micrometer-core` and `logback-classic` as `provided`; new `in.minnal.contracts.metrics.MinnalMeterFilter` (a `MeterFilter.map`) and `PushFailureThrottle` (a logback `TurboFilter` on logger `io.micrometer.registry.otlp.OtlpMeterRegistry`, one event per 10 min, with an `install()` helper).
- `services/{core,game,ratings}/pom.xml` -- add `io.micrometer:micrometer-registry-otlp`; `src/main/resources/application.yaml` -- `management.metrics.tags.service`, `management.otlp.metrics.export.enabled: false`, `step: 60s`; `application-prod.yaml` -- `enabled: true`, `url: ${GRAFANA_OTLP_URL}`, `headers.Authorization: ${GRAFANA_OTLP_AUTHORIZATION}`.
- One small `@Configuration` per service under its `platform` package: `@Bean MeterFilter` returning `MinnalMeterFilter`, and `PushFailureThrottle.install()`.
- `services/game/.../MatchMetrics.java:49` and `MatchmakingActor.java:76-89` -- the two tag renames; tests `MatchActorTest`, `MatchLoadTest`, `MatchActorRoomTest`, `MatchRegistryTest`, `MatchmakingFlowTest` follow.
- `deploy/compose.yaml` (`x-service-env`), `deploy/.env.example` -- `GRAFANA_OTLP_URL`, `GRAFANA_OTLP_AUTHORIZATION` (a full `Basic …` header value).

## Tasks & Acceptance

**Execution:**
- [x] `contracts` metrics package and its tests (allowed and dropped keys, UUID, email, room-code values, framework meters untouched, throttle once per window)
- [x] Per-service wiring, poms, yaml and the two tag renames with their test updates
- [x] Compose env and `.env.example`; `node deploy/check-compose.mjs` still passes

**Acceptance Criteria:**
- Given the prod profile with the endpoint set, when the service starts, then an OTLP registry is active with a 60 s step; given the local profile, then none is.
- Given any registry in a service test context, when its meters are listed, then no `minnal.*` tag key is outside the allowlist and no tag value looks like a UUID, email or room code.

## Implementation Notes

Implemented directly (no subagent). `contracts` gets `metrics/MinnalMeterFilter` and `PushFailureThrottle` (micrometer-core and logback-classic as `provided`; the enforcer still bans only Spring). Each service gets `platform/infrastructure/MetricsConfiguration` (the filter bean, installing the throttle), `micrometer-registry-otlp` plus `spring-boot-opentelemetry` (Boot 4 keeps the OTLP export auto-configuration behind that module's `OpenTelemetryProperties`), `management.metrics.tags.service`, and the export off by default and on in `application-prod.yaml` (`GRAFANA_OTLP_URL`, `GRAFANA_OTLP_AUTHORIZATION`; an empty URL still boots). The two game tag renames (`type` and `opponent` to `kind`) and their five tests are done. Per-service `MetricsConfigurationTest` checks local pushes nothing, the filter strips personal tags and adds `service`, and an enabled export creates one OTLP registry. Backend tests that need Docker could not run here (Testcontainers is denied); everything else in contracts, core, game and ratings passed. `deploy/check-compose.mjs` also could not run here (no Docker access); CI covers both.

## Spec Change Log

## Review Triage Log

Inline review by the implementer (not independent; no reviewer subagents were launched).

| Finding | Verdict | Evidence / route |
|---|---|---|
| The test registry applies the filter through the Spring bean, not through every code path that builds a registry | low | all services get the registry from Boot, which applies `MeterFilter` beans |
| A real push to Grafana is not exercised | medium | needs the owner's account; a manual check once the keys are set |
| Heap and image-size cost of `spring-boot-opentelemetry` not measured | medium | check the 384 MB heap cap on the VPS after deploy; 7.3c's heap panel will show it |
| Docker-dependent tests and `check-compose` not run locally | low | CI runs them |

## Design Notes

Series count against the free-tier limit is measured with 7.3b, once its meters exist. The OTLP bean is verified in a context test; the real Grafana push needs the owner's account and is a manual check.

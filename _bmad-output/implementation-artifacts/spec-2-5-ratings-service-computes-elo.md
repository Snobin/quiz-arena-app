---
title: 'Story 2.5: Ratings service computes ELO (ratings-service)'
type: 'feature'
created: '2026-11-19'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-3-profile-setup-and-editing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rated matches finish and publish `minnal.match.completed`, but nothing consumes it: no rating is computed, no history kept, and nobody is told a rating changed.

**Approach:** ratings-service becomes the only place ELO is computed. It consumes `minnal.match.completed` and `minnal.user.profileUpdated` through the `ratings-service` consumer group, stores ratings, rating events, match records and a player directory in its own schema, and relays `minnal.rating.updated` from a transactional outbox. The Story 2.5 criteria in `epics.md` are the contract, except the game-service rating cache and its matchmaking end-to-end test (the last-but-one criterion), which are split out (see `deferred-work.md`). This spec adds the decisions below.

## Boundaries & Constraints

**Always:**
- Flyway `V1` creates only `rating`, `rating_event`, `match_record`, `player_directory`, `event_outbox` exactly as in the epic (modes `QUICK | TOPIC_DUEL | BATTLE_ROOM`, no foreign keys, `event_outbox` shaped like core's with `payload` jsonb).
- ELO is a pure function: for one rated USER, pairwise over every other participant, `E = 1/(1+10^((Ropp−Rself)/400))`, actual 1/0.5/0 from placement only, `K = 32/(N−1)`, terms summed and rounded once half away from zero, all from pre-match ratings, integer ratings, no floor. A GUEST opponent counts as 1200, a BOT as the rated human's own rating, a USER with no row as 1200.
- A completed event is handled in one transaction: lock the USER participants' rating rows in user-id order, and if any `match_record` already exists for the `matchId` the whole event is a no-op (still acknowledged). `rated: true` writes `rating_event`, `rating`, `match_record` (WIN for a sole first place, DRAW for a shared first, else LOSS; a forfeiter by the placement in the event) and one `minnal.rating.updated {eventId, userId, mode, rating, ratedAt = endedAt}` outbox row per user. `rated: false` writes only `match_record` rows with `rated=false` and a null delta. GUEST and BOT participants are never stored anywhere.
- The stream consumer reads group `ratings-service` on both streams from the start of the stream, creates the group when missing, reclaims pending entries at boot and periodically (`XAUTOCLAIM`, or `XPENDING` plus `XCLAIM`) before reading new ones, and `XACK`s only after the handler's commit. A failing entry stays pending; at delivery count 5 it is copied to `minnal.deadletter` (source stream, entry id, `eventId`, last error), acknowledged, logged at error, and counted by the Micrometer counter `minnal.stream.deadletter`.
- `profileUpdated` upserts `player_directory` only when its `updatedAt` is newer than the stored one, and never when `tombstoned_at` is set.
- The relay publishes outbox rows oldest first with `XADD … MAXLEN ~100000`, marks them published, backs off on failure (2^attempts s, max 30 s). Consumer and relay are off under the Docker-free `test` profile (`minnal.streams.enabled=false`).
- game-service and core-service gain an architecture test: no main class or source reaches ELO or writes `rating`, `rating_event` or `match_record`.

**Never:**
- No HTTP endpoints, no change to game or core behavior, no rating floor, no reading of Valkey by anything but the consumer and relay, and no guest data in any table.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 1v1 win, loss, draw | Both 1200, rated | Deltas +16 / −16 / 0 | N/A |
| 4 players with a tie | Equal ratings | Symmetric where placements mirror; K = 32/3 | N/A |
| Guest or bot opponent | USER vs GUEST or BOT | USER rated against 1200 (guest) or her own rating (bot, delta 16 on a win); nothing stored for the opponent | N/A |
| Unrated match | `rated: false` | `match_record` only, `rated=false`, null delta, no `rating.updated` | N/A |
| Duplicate | Same `eventId`, or another `eventId` for the same `matchId` | No-op, no extra row, entry acknowledged | N/A |
| Restart | Entries pending | Reclaimed and processed before new ones | N/A |
| Poison entry | Handler fails five deliveries | Copied to `minnal.deadletter`, acknowledged, counter +1, error log | N/A |
| Out of order | Older `profileUpdated` after a newer | Directory keeps the newer | N/A |
| Relay down | First publish fails | Row stays first, attempts rise, delivered in order later | N/A |

</frozen-after-approval>

## Code Map

- `services/ratings` -- skeleton only (security, request id, JDBC/Flyway/Redis starters present, no migration, no domain code); add `src/main/resources/db/migration/V1__ratings.sql`, packages `rating` (pure `Elo`), `ingest` (handlers, `StreamClient` interface plus a Valkey implementation, consumer loop, dead letter), `outbox` (repository, relay), `directory`; Micrometer via actuator.
- `contracts/.../events/{MatchCompletedEvent,CompletedParticipant}.java` -- the input payload (`STREAM`, `PAYLOAD_FIELD`); `ParticipantKind` GUEST, USER, BOT. `core` already defines the `minnal.user.profileUpdated` event shape (`ProfileService.event`) and a relay pattern to copy (`OutboxRelay`, `JdbcOutboxRepository`).
- `deploy/postgres/init/01-schemas.sh` -- `ratings` schema and login already exist; mirror core's `it-init.sql` for tests (`services/ratings/src/test/resources/db/it-init.sql`) and its `PostgresIntegrationTest` base; add Testcontainers, a real-Valkey container test if the image pulls, otherwise a fake `StreamClient`.
- `services/game/src/test/.../ArchitectureTest.java` (ArchUnit) -- extend; add the same style of test to core.

## Tasks & Acceptance

**Execution:**
- [ ] `ratings` V1 migration, schema test, `Elo` with unit tests (1v1 win/loss/draw, 4-player tie, symmetric equal-rated, guest, bot, rounding)
- [ ] `ratings` match-completed handler (transaction, idempotency, rated/unrated, results, outbox) with Postgres integration tests incl. no row for a guest id and a duplicate event
- [ ] `ratings` profile-updated handler (last-write-wins, tombstone) and test with out-of-order delivery
- [ ] `ratings` stream consumer (group, reclaim, ack after commit, dead letter at 5, counter) and outbox relay with tests (fake stream; real Valkey if available), config flag
- [ ] `game` and `core` architecture tests; README note

**Acceptance Criteria:**
- Given the epics.md Story 2.5 criteria except the game-service cache, when ratings-service runs against Postgres and the stream, then each passes.
- Given a ratings table dump after any mix of events, when searched for a GUEST or BOT participant id, then there is no row.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `./mvnw -B -pl contracts,services/ratings,services/core,services/game -am test` -- expected: green (JDK 25 `JAVA_HOME`, `MAVEN_SKIP_RC=1`; podman `DOCKER_HOST` here)

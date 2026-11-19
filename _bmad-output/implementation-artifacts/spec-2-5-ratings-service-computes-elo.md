---
title: 'Story 2.5: Ratings service computes ELO (ratings-service)'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: '0714d7b1cfe13aa23b6c772cb9b1f6abcdceaaa5'
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
- [x] `ratings` V1 migration, schema test, `Elo` with unit tests (1v1 win/loss/draw, 4-player tie, symmetric equal-rated, guest, bot, rounding)
- [x] `ratings` match-completed handler (transaction, idempotency, rated/unrated, results, outbox) with Postgres integration tests incl. no row for a guest id and a duplicate event
- [x] `ratings` profile-updated handler (last-write-wins, tombstone) and test with out-of-order delivery
- [x] `ratings` stream consumer (group, reclaim, ack after commit, dead letter at 5, counter) and outbox relay with tests (fake stream; real Valkey if available), config flag
- [x] `game` and `core` architecture tests; README note

**Acceptance Criteria:**
- Given the epics.md Story 2.5 criteria except the game-service cache, when ratings-service runs against Postgres and the stream, then each passes.
- Given a ratings table dump after any mix of events, when searched for a GUEST or BOT participant id, then there is no row.

## Implementation Notes

- `MatchCompletedHandler` locks rating rows in user-id order, treats an existing `match_record` for the match as a duplicate (also catching a unique-key race), and `ratedAt` is the match's `endedAt`.
- The consumer reclaims with `XPENDING` plus `XCLAIM` (delivery count = pending count + 1); a failing entry is dead-lettered when its delivery count reaches 5. Group creation uses `MKSTREAM` from offset 0, so the first boot processes the whole stream.
- `StreamClient` is an interface with a Valkey implementation and an in-memory fake for logic tests; `ValkeyStreamIntegrationTest` runs the real client, reclaim, dead letter and capped add against a Valkey container.
- The Docker-free `test` profile now keeps the DataSource (lazy, like core) with the DB health check off; `it` and `test` both set `minnal.streams.enabled=false`.
- Architecture tests in core and game are source scans for ELO terms and rating-table SQL (no ArchUnit in core); a planted `Elo` in core main fails the test.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| A user listed twice in one rated event rolled back and was acknowledged as a duplicate, silently dropping the match | high | patch (fixed) | a repeated user id is now a malformed event (poison, dead-lettered); tests added |
| Unrated replay could commit part of a match; any unique violation was reported as a duplicate | high | patch (fixed) | unrated path checks the match first; the catch re-checks `match_record` and rethrows otherwise; tests added |
| A failed ack after a commit counted as a handler failure (dead-lettered at the 5th delivery); a failing dead-letter write or one failing stream starved the poll; a vanished group never recovered | high | patch (fixed) | ack, dead letter and each stream are guarded separately; NOGROUP re-creates the group; tests added |
| The first poll after boot only reclaimed entries idle 30 s, so newer matches could be rated before an older pending one | medium | patch (fixed) | the first poll reclaims every pending entry; later polls use the idle time; README corrected |
| Reclaim looked at only the 50 oldest pending entries | medium | patch (fixed) | looks at 500, claims up to 50 idle ones |
| `rating.updated_at` could move backwards for a late older match; Elo rounding at exact halves | medium | patch (fixed) | `GREATEST`; nine-decimal pre-round; test added |
| Relay failure in the scheduled loop unguarded; dead-letter `error` unbounded; architecture test scanned binaries and missed qualified or quoted table names | low | patch (fixed) | guarded, truncated to 500 chars, extension filter and a stronger pattern |
| No tests for rollback, the scheduled wiring, unrated replay | medium | patch (fixed) | tests added, including a Spring context with the loop on |
| Tombstone is only a SQL guard: nothing sets `tombstoned_at` yet | medium | defer | the deletion event is Story 2.8; the guard and its test are in place |
| Relay is single-writer (no SKIP LOCKED), poison outbox head, no purge; `ratedAt` ordering for late matches; non-retryable errors wait the idle time; metrics and health; schema CHECKs and indexes later stories need | low | defer | recorded in `deferred-work.md` |

## Verification

**Commands:**
- `./mvnw -B -pl contracts,services/ratings,services/core,services/game -am test` -- expected: green (JDK 25 `JAVA_HOME`, `MAVEN_SKIP_RC=1`; podman `DOCKER_HOST` here)

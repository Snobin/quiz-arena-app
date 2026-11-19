---
title: 'Story 2.7: Leaderboards (ratings-service backend and API)'
type: 'feature'
created: '2026-11-19'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-ratings-service-computes-elo.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-6-rating-change-and-match-history.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ratings exist but there is no ranking: nobody can see where they stand today, this week or of all time.

**Approach:** ratings-service keeps Valkey sorted-set leaderboards per mode and period, written only by itself: a projector runs from each `rating.updated` outbox entry and writes absolute values recomputed from Postgres, a rebuild (command and automatic on boot) restores every current board from Postgres alone, and `GET /api/ratings/v1/leaderboards/{mode}/{period}` serves them. The Story 2.7 criteria in `epics.md` are the contract for the backend; the Ranks tab and Home rank snippet are split out (see `deferred-work.md`). This spec adds the decisions below.

## Boundaries & Constraints

**Always:**
- Keys are `ratings:lb:{mode}:{daily|weekly|alltime}:{periodKey}` (the existing `minnal.valkey.key-prefix` plus `lb:…`), periodKey the IST date, the ISO week with Monday start (`2026-W46`), or `all`. Daily keys expire after 8 days, weekly after 5 weeks. Members are user ids, scores are doubles holding integers. No other service writes them.
- The projector runs inside the outbox relay, before a `rating.updated` row is published, for that row's user, mode and `ratedAt` (the match's end): all-time score = her current rating; daily and weekly scores = the sum of her `rating_event` deltas whose `ended_at` falls in the IST day and Monday-start IST week of `ratedAt`. It uses `ZADD` of absolute values, never `ZINCRBY`, so a retried or duplicated row gives the same board; a failure leaves the row unpublished and retried. A tombstoned user is never written. Unrated matches, guests, bots and Solo Practice write nothing (only rated outbox rows exist).
- Anyone with a rated match in the period has a position, including a zero or negative daily total.
- Rebuild: for every mode and every current period (daily today, weekly this week, all-time) it recomputes all boards from Postgres alone (skipping tombstoned users), builds each into a temporary key and renames it over the live one, then sets the marker `ratings:lb:meta:builtAt`. It runs on the command-line option `--rebuild-leaderboards` (then the process exits; `docker compose run --rm ratings-service --rebuild-leaderboards`) and on boot when the marker is missing. A flushed Valkey rebuilt this way yields identical boards (integration test with real Valkey).
- API: any valid token. Path mode in QUICK, TOPIC_DUEL, BATTLE_ROOM and period in daily, weekly, alltime, else 400 Problem Details. `offset` default 0, `limit` default 50, 1 to 50; only the top 100 positions are listed. Response `{mode, period, periodKey, measure: RATING_GAINED | RATING, entries[{rank, userId, displayName, district, value}], me}` with name and district from `player_directory` (blank when a player has no directory row yet). Rank is standard competition ranking, one plus the count of strictly higher values. `me` is `{rank, value}` for a registered caller with a position (even beyond the top 100), `null` for a registered caller without one, and absent for a guest. Responses are not cached. Time comes from an injectable clock (IST for periods).

**Never:**
- No change to ELO, the consumer, or what ratings-service stores; no web screens (the Ranks tab and Home snippet are the follow-up); no ZINCRBY; no board entry for a guest or bot; no per-request recomputation from Postgres on the read path.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rated match | `rating.updated` row published | Her all-time, daily and weekly entries equal Postgres | Projection fails: row stays unpublished and retries |
| Retry or duplicate | Same row projected twice | Same board | N/A |
| Day boundary | Match ends 23:59:59 IST, then 00:00:00 IST | First counts in that day, second in the next | N/A |
| Week boundary | Sunday night vs Monday 00:00 IST | Different ISO week keys | N/A |
| Zero or negative daily | Net gain 0 or -18 | Still listed with that value | N/A |
| Valkey flushed | Boards lost | Rebuild restores identical boards; marker missing triggers it on boot | N/A |
| Ties | Values 30, 20, 20, 10 | Ranks 1, 2, 2, 4 | N/A |
| Registered caller | With and without a position | `me` is `{rank, value}` or `null` | N/A |
| Guest caller | Guest token | Boards served, no `me` field | N/A |
| Bad mode or period | `/leaderboards/CHESS/daily` | 400 Problem Details | N/A |
| Paging | `limit` 50, `offset` 100 or more | Empty entries (top 100 only); `limit` over 50 is 400 | N/A |

</frozen-after-approval>

## Code Map

- `services/ratings` -- `outbox/OutboxRelay.java` (publish loop; add a pre-publish hook, and `OutboxRepository` rows carry stream and payload), `ingest/StreamClient.java` + `ValkeyStreamClient.java` (Valkey access pattern, `ObjectProvider<StringRedisTemplate>`), `ingest/StreamsConfiguration.java` (wiring, scheduling, `Clock`), `rating/api/RatingsController.java` (+ `RatingsReadRepository`, `RatingsViews`) as the API pattern, `directory/PlayerDirectory.java` and the `player_directory` table, `rating`, `rating_event` tables; `application.yaml` (`minnal.valkey.key-prefix`).
- New package `leaderboard` (`PeriodKeys`, `LeaderboardStore` with a Valkey implementation and an in-memory fake, `LeaderboardProjector`, `LeaderboardRebuild`, a boot and command-line runner, `LeaderboardController`); tests beside the existing `PostgresIntegrationTest` and the real-Valkey pattern in `ingest/ValkeyStreamIntegrationTest.java`; README note.

## Tasks & Acceptance

**Execution:**
- [ ] `ratings` `PeriodKeys` (IST day, Monday-start ISO week, `all`) with boundary tests on a controllable clock; `LeaderboardStore` (Valkey and fake)
- [ ] `ratings` projector from Postgres plus the relay hook; tests: absolute values, retry and duplicate, day and week boundaries, zero and negative, unrated, guest, tombstoned
- [ ] `ratings` rebuild service, command-line option and boot-if-missing runner; real-Valkey test: flush, rebuild, identical boards
- [ ] `ratings` leaderboard endpoint with ranking, paging, `me`, names, 400s, guest access; integration tests for every matrix row; README note

**Acceptance Criteria:**
- Given the epics.md Story 2.7 criteria except the Ranks tab and Home snippet, when ratings-service runs against Postgres and Valkey, then each passes.
- Given a flushed Valkey, when the rebuild runs, then every current board equals the boards before the flush.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `./mvnw -B -pl contracts,services/ratings -am test` -- expected: green (JDK 25 `JAVA_HOME`, `MAVEN_SKIP_RC=1`; podman `DOCKER_HOST` here)

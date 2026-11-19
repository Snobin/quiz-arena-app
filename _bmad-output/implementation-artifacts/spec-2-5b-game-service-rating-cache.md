---
title: 'Story 2.5 part B: game-service rating cache feeds matchmaking'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: '89c669a40e70beab51492c6962a66ba60f125940'
route: 'oneshot'
review_loop_iteration: 0
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** ratings-service now publishes `minnal.rating.updated`, but game-service's `RatingCache` is still empty, so matchmaking pairs everyone as 1200 and real ratings change nothing.

**Approach:** On boot game-service replays `minnal.rating.updated` from the start of the stream with plain `XREAD` (no consumer group: the cache lives only in memory), then follows new entries. Each `(userId, mode)` keeps the value with the latest `ratedAt`, so a replayed older value never overwrites a newer one, and a missing entry (and any guest) reads as 1200. The Story 1.6 matchmaking actor already reads the cache, so two players rated 1500 and 1250 are no longer paired before the 4 s band widening (end-to-end test). Because the stream is capped at about 100,000 entries, a long-inactive player whose last update was trimmed reads as 1200 after a restart; this is logged once at start as a known limitation. This is part B of Story 2.5, split out when part A (ratings-service) was built.

</frozen-after-approval>

## Implementation Notes

- `RatingCache` now keys by `(userId, mode)` with the latest `ratedAt` winning (an equal `ratedAt` replaces, so a repeated entry is harmless); `ratingOf(player)` reads the QUICK rating, which is what matchmaking uses; `put(sub, rating)` stays as an unconditional test helper with `ratedAt = EPOCH`.
- `RatingFeeder` (parse and apply, position moves only after a batch is applied) over a `RatingUpdateSource`; `ValkeyRatingUpdateSource` is a plain `XREAD COUNT 500 BLOCK 1000` from the last id (no consumer group), run by `RatingFeederRunner` on one daemon thread that retries a failed read from the same position after 1 s. The feeder bean exists only where a `StringRedisTemplate` does (the Docker-free `test` profile has none and the cache stays empty).
- The trimmed-stream limitation is logged once at start (`RatingFeeder.announce`) and documented on the class.
- Tests: cache rules, feeder replay and follow, malformed entries, retry-in-place, the Valkey reader with a mock, a real-Valkey test (Testcontainers, new test dependency in game), and an end-to-end matchmaking test where ratings arrive through the feeder (1500 and 1250 pair only at the 4 s widening).

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Payload fields were coerced (a text rating, a numeric user id) and a missing `payload` field was dropped silently | medium | patch (fixed) | strict type checks in `RatingFeeder`, a warning for a missing field; tests added |
| The feeder thread died on an `Error`; `close()` did not wait | medium | patch (fixed) | catches `Throwable` and retries; `close()` joins for 2 s; runner test added |
| `RatingFeederRunner` and its configuration untested | medium | patch (fixed) | retry, shutdown, and the with and without Valkey wiring tests added |
| Blocking `XREAD` stalls a shared Lettuce connection | low | false | Spring Data uses a dedicated connection for blocking reads; the real-Valkey test returns normally |
| Players who queue during the initial replay match as 1200; no readiness signal | medium | defer | not in scope; a caught-up flag or metric is a follow-up |
| A future `ratedAt` could pin a rating; equal `ratedAt` ties; no metrics for replay progress | low | defer | needs a producer bug to matter; recorded |
| Trimmed-stream limitation, WARN on every boot | low | false | required by the story (logged as a known limitation) |


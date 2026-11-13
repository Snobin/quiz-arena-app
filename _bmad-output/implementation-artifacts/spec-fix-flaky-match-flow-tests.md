---
title: 'Fix: make the flaky MatchFlowTest cases deterministic'
type: 'bugfix'
created: '2026-11-13'
status: 'done'
baseline_commit: '1ca22d66d6f2480bcd72ec1c4862c7f044eb8544'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Two `MatchFlowTest` cases depend on wall-clock timing, so CI goes red at random. This was seen on CI run 43384699841 and in a local `./mvnw verify`; both cases are logged in `deferred-work.md`.
- **`aFloodIsCutToTheRateAndOtherSessionsAreUnaffected`** runs against the real `System.nanoTime` token bucket and reads replies with a 700 ms timeout. A slow first reply ends the loop with 0 processed. A slow sender lets the bucket refill past the 8–12 bounds.
- **`outsidersCannotAnswerOrSubscribe`** expects an `ERROR` frame within 5 s for a refused `SUBSCRIBE`. The ERROR can race the socket close and never arrive.

**Approach:** test-side changes only.
- **Flood case:** integration tests get an `InboundRateLimiter` whose time source follows `System.nanoTime` until a test freezes it. The flood test freezes it before the clients connect, so the counts are exact. It reads an exact number of replies, each with the normal wait, then checks that nothing more arrives. It advances the time by 1 s to prove the bucket refills.
- **Refused-subscribe case:** the refusal counts as either an `ERROR` frame or the socket closing.
- No production behaviour changes.

</frozen-after-approval>

## Implementation Notes

- **Time source:** `support/ControllableNanos` follows `System.nanoTime` until `freeze()`, then moves only on `advance()`. `release()` resumes from the frozen reading, so time never goes backwards. `TestClockConfiguration` makes it the `@Primary` `InboundRateLimiter` for every integration test, through the test-only `platform/infrastructure/ws/TestRateLimiters`, which reaches the package-private time-source constructor. There is no production change.
- **Flood test:** it freezes the time before connecting, reads exactly 10 replies and expects 9 `NOT_IN_QUEUE` plus 1 `RATE_LIMITED` in any order. The first attempt asserted their order and failed every time, because the interceptor sends `RATE_LIMITED` synchronously while the matchmaking actor answers asynchronously, so `RATE_LIMITED` can overtake. The test then expects nothing for 500 ms, advances 1 s and checks that the bucket has refilled. `release()` runs in a `finally`.
- **Refused subscribes:** `assertRefused(raw, destination)` accepts an `ERROR` frame or a closed socket. Both the stranger case and the participant's foreign-topic cases use it.
- **Verified:** `MatchFlowTest` passed 8 of 8 local runs (5 before the review patches, 3 after); `./mvnw verify` BUILD SUCCESS after the patches. CI on push is the load check.

## Review Triage Log

- **Patched:**
  - **Release safety net** (low): a frozen time source could leak into later tests in the shared context. `GameIntegrationTest` now releases it in an `@AfterEach`.
  - **Weak refill check** (low): one reply after `advance` proved only a single token. The test now sends 11 frames and expects 10 processed plus a fresh `RATE_LIMITED`.
  - **Undocumented assumptions** (low), three comments added:
    - integration tests must run one at a time;
    - the production limiter bean is shadowed;
    - the verify result is now recorded.
- **Rejected:**
  - **No unit test for `ControllableNanos`** (low): the flood test exercises it, including `release()` after `advance()`. A dedicated test adds code for a test helper.
  - **`assertRefused` accepts any close and can wait 5 s** (low): a refused subscribe is the only thing these sockets do, and the 5 s wait happens only in the rare lost-ERROR case.
  - **Lost ERROR may be a server defect** (low): the web client never subscribes to a foreign topic, so no real user meets a bare close. It would only matter for third-party clients.
  - **Deferred entry not closed** (false): `deferred-work.md` entries are append-only; this spec is the record that resolves it.
  - **Hard-coded 10 instead of the configured rate** (low): the test rate is fixed in config; deriving it adds plumbing for no current harm.

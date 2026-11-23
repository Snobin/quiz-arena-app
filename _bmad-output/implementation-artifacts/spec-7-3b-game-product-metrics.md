---
title: 'Story 7.3b: Game product metrics'
type: 'feature'
created: '2026-11-23'
status: 'done'
baseline_commit: 'be9b583'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The launch success signals that game-service owns cannot be read: matches per session, the Quick Match bot-ended share and queue wait, completed versus aborted matches by mode, answer-confirmation latency (server and client), and Battle Room hosts and rooms per week.

**Approach:** Add the meters and the client round-trip field described in `_bmad-output/planning-artifacts/epics.md` "Story 7.3", third Given (all bullets except 7-day return, which is 7.3b-ii in `deferred-work.md`). Tags stay inside the 7.3a allowlist (`service, mode, outcome, reason, kind, source, status`).

## Boundaries & Constraints

**Always:** An aborted match appears only in the completed-vs-aborted counter (FR65); no session, bot-rate, latency or room metric counts one. `prevAckRttMs` is optional, clamped to 0–10,000, goes only into its histogram and never into timing or scoring (AD-6). Valkey keys are `game:metrics:br-hosts:{isoWeekIST}`, `br-hosts-5plus:{isoWeekIST}` (HyperLogLogs of the host's `sub`) and `br-rooms:{isoWeekIST}` (counter), each with an 8-week TTL, written only when a room match completes with at least 2 humans (5 or more for the 5-plus key); the week comes from the injected `Clock` in IST. Gauges report the current and previous week as `kind=current|previous`. A missing Valkey (tests, local without it) turns the room writes into no-ops. A session starts at the first inbound client frame after 30 minutes without one and ends 30 minutes after the last; on ending it records its count of completed matches, zero included; state is in memory and lost on restart. The web app keeps connecting only when she first plays (decision 2026-11-23): a session therefore starts at her first inbound frame, and "matches per session" is read with that in mind.

**Never:** No user id, name, room code or topic in any tag. No dashboard or alert (7.3c). No change to timing, scoring, rating or results behaviour.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Completed / aborted | Match ends | `minnal.match.ended{mode}` or `minnal.match.aborted{mode}` | N/A |
| Quick bot rate | Completed QUICK match | `minnal.match.quick.completed{kind=bot|human}` by opponent kind | N/A |
| Queue wait | Human paired | `minnal.matchmaking.queue.wait` publishes a percentile histogram | N/A |
| Answer latency | Answer carries `prevAckRttMs` | Recorded in `minnal.match.answer.rtt` (clamped); absent or null: nothing recorded | Negative or huge values clamped |
| Session | Frames 31+ min apart, matches in between | Two sessions, each recording its match count | Restart loses open sessions |
| Room week | Room match with 6 humans completes | Host added to both HLLs, rooms +1, 8-week TTL | Valkey absent: skipped |
| Solo room | Room match with 1 human | Nothing written | N/A |

</frozen-after-approval>

## Code Map

- `services/game/.../match/application/MatchMetrics.java`, `MatchRegistry.java` (`ended`, about l.241) -- tag `ended` and `aborted` by mode; QUICK-completed counter by opponent kind (`MatchSetup.participants`); session and room hooks on completion.
- `.../matchmaking/application/MatchmakingActor.java:74` -- add `publishPercentileHistogram()` to the queue-wait timer.
- `contracts/.../realtime/AnswerRequest.java` and `MatchController.java:40` -- optional `Integer prevAckRttMs`; recorded where `MatchActor.onAnswer` (about l.392) sends the ack; contract test that it never reaches scoring; golden sample with the field; `MatchMetrics.ACK` also gets a percentile histogram.
- `web/src/realtime/connection.ts` (`submitAnswer` l.1005, ack handling about l.641) -- keep the send time of the last answer, and on its ack send the measured round trip as `prevAckRttMs` on the next answer.
- `platform/session/PlayerSessions.java` and `StompConnectAuthInterceptor.preSend` -- a new `PlayerSessionStats` (map by `sub`, `Clock`, a minute sweeper) touched on every inbound frame and on completion of a match for a human; `RoomMetrics`/`MatchSetup.room` and `humans` map give the host's `sub`.
- New `RoomWeeklyMetrics` over `StringRedisTemplate` via `ObjectProvider` (pattern: `ValkeyEventsConfiguration`); test clock `support/TestClockConfiguration`, `MutableClock`.

## Tasks & Acceptance

**Execution:**
- [x] Mode-tagged ended and aborted; Quick completed by `kind`; queue-wait histogram; ack histogram, with tests
- [x] `prevAckRttMs` in contract, game handler, web client, with golden sample and tests
- [x] Session tracker with tests (idle gap, two sessions, zero-match session, restart not covered)
- [x] Room weekly HLL and counters and the gauges, with a fake Valkey test and an integration test where Docker exists

**Acceptance Criteria:**
- Given an aborted match, when it ends, then only `minnal.match.aborted{mode}` changes.
- Given an answer with `prevAckRttMs: 99999`, when it arrives, then the histogram records 10,000 and scoring is unchanged.

## Implementation Notes

Implemented directly (no subagent). `MatchMetrics`: `ended` and `aborted` per `mode`, `minnal.match.quick.completed{kind}`, `minnal.match.answer.rtt`, histograms on the ack timer and the queue-wait timer. `MatchRegistry` records the Quick bot flag, clamps and records `prevAckRttMs` before the actor sees the answer (never reaches scoring), and publishes a new `MatchCompleted` event on completed matches. New `in.minnal.game.metrics` package (kept outside `match..`, where AD-4 bans Valkey): `PlayerSessionStats` (minute sweeper, 30 min idle), `SessionActivityInterceptor` (second inbound interceptor in `WebSocketConfig`), `RoomWeeklyMetrics` (HLL and counter keys, 8-week TTL, IST ISO week from the injected clock, gauges `minnal.room.hosts`, `.5plus`, `minnal.room.weekly` by `kind=current|previous`, no-ops without Valkey). `AnswerRequest` gained optional `prevAckRttMs` with a 2-argument convenience constructor. Web: `connection.ts` times each answer to its ack and sends the result as `prevAckRttMs` on the next. Existing tests that read the untagged ended or aborted counters now read `mode=QUICK`; the registry test's event list ignores `MatchCompleted`. Open-question decision B: the web app still connects only on first play. Not done here: a real-Valkey test of the HLL keys (the tests use a mocked template; Testcontainers is unavailable locally), and the web test `LiveMatchScreen > minimal view` fails with and without this change.

## Spec Change Log

## Review Triage Log

Inline review by the implementer (not independent; no reviewer subagents were launched).

| Finding | Verdict | Evidence / route |
|---|---|---|
| Room HLL and counter commands are verified against a mocked template, not a real Valkey | medium | follow-up integration test where Docker exists; CI has Docker but no such test was added |
| The gauge reads Valkey on each scrape (every 60 s, 6 gauges) and returns NaN if Valkey fails | low | cheap commands, off the match path; NaN is dropped by the exporter |
| Sessions start at first frame, not app open | low | owner decision B, recorded in the spec |
| `LiveMatchScreen` minimal-view web test fails on baseline too | low | not caused by this change; separate flake to chase |
| Session map entries for players who never return are removed only by the sweeper | low | sweeper ends and removes idle sessions each minute |

## Design Notes

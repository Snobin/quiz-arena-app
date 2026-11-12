---
title: 'Story 1.7: Live match engine'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: 'b4afab2632789f8d3848bb673c1c73e8d1d6d835'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-quiz-arena-2026-11-10/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-6-matchmaking-with-bot-fallback.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After `MATCH_FOUND`, the Story 1.6 match shell just holds the set and releases players after 5 min. Nothing runs the 10 questions, times or scores answers, reveals results, or lets bots play.

**Approach:**
- Replace the shell with a real single-threaded N-participant match actor.
- The actor runs the 10 × 15 s windows on the server clock and scores with one `Scoring` function in `contracts`.
- Answers stay secret until each reveal. Bots answer through the same path as humans.
- Broadcasts on `/topic/match/{matchId}` (participants only) are `seq`-numbered.
- Add a per-connection inbound rate limit and drain-safe shutdown.
- The epics.md Story 1.7 acceptance criteria are the contract. This spec adds the decisions below.

## Boundaries & Constraints

**Always:**
- **Contracts (plain Java, `in.minnal.contracts.realtime` unless noted):**
  - `Scoring.points(boolean correct, long remainingMs)`: `500 + Math.round(500 × clamp(remainingMs, 0, 15000) / 15000.0)` when correct, else 0. Plus `Scoring.WINDOW = 15 s`. Package `in.minnal.contracts.scoring`.
  - `QuestionView(questionId, version, textMl?, textEn?, options)`.
  - `QuestionStartedPayload(questionIndex, total, startedAt, deadline, question)`.
  - `AnswerRequest(questionIndex, optionIndex)` (client body; any other field ignored).
  - `AnswerAcceptedPayload(questionIndex)`.
  - `ScoreboardPayload(questionIndex, answered: List<UUID participantId>)`.
  - `QuestionRevealedPayload(questionIndex, total, questionId, version, answerIndex, explanation, attribution?, results: List<ParticipantResult(participantId, pickedIndex?, correct, points, totalScore)>)`.
  - `questionIndex` is **0-based** (0–9); `total` = 10.
  - New `ErrorCode`s: `NOT_IN_MATCH`, `ANSWER_REJECTED`.
  - Golden samples for every new message, with drift tests.
  - A serialization test asserts that `QuestionView` JSON has exactly the five fields above.
  - On the wire, nulls are omitted (Story 1.6 convention), so "attribution null" means the field is absent. The web parsers map absent to `null`.
- **Match actor (replaces `MatchShell`):**
  - A pure, clock-driven `MatchState` in `in.minnal.game.match.domain` holds `participants: List<MatchParticipant>`. Each has its `Participant`, `sub?`, `rating`, `connection` (CONNECTED/DISCONNECTED), `forfeited` (always false until 1.9), `score`, and `answers[10]` (pickedIndex, receivedAt, points).
  - There are no per-player fields and no 1v1 branches. Every computation iterates the list.
  - `MatchActor` wraps it in the Story 1.6 `Actor<E>`. Its events: `Begin`, `Answer(participantId, questionIndex, optionIndex, receivedAt)`, `CloseWindow(i)`, `NextQuestion(i)`, `BotAnswer`, `Disconnect(sub)`.
  - Timers are scheduled on one shared `match-timers` scheduler that only `tell`s events.
  - Outbound effects are WebSocket sends only, through `PlayerChannel` and a new `MatchBroadcaster`.
- **Timeline:**
  - Lead-in `minnal.match.lead-in` = 3 s after `MATCH_FOUND`, so clients can subscribe. Then Q1.
  - `startedAt` = the actor's clock when it broadcasts `QUESTION_STARTED`; `deadline = startedAt + 15 s`.
  - `CloseWindow` fires at `deadline + minnal.match.close-grace` (50 ms). Then comes `QUESTION_REVEALED`, then a `minnal.match.reveal-hold` (2 s) pause before the next question. There is no hold after the 10th reveal.
  - Total: about 3 + 150 + 18 s ≈ 2.85 min.
- **Answers:**
  - The STOMP handler stamps `receivedAt = clock.instant()` on arrival; client timestamps are never read. `remainingMs = deadline − receivedAt`.
  - Accepted when `questionIndex` is the open question, `receivedAt ≤ deadline`, the window is not yet closed, `optionIndex` is 0–3, and this is the participant's first answer to that question.
  - A second answer is dropped silently.
  - Wrong index, late, or a bad option → private `ERROR ANSWER_REJECTED` (with `refSeq`).
  - Not a participant, or an unknown match → `ERROR NOT_IN_MATCH`.
  - An accepted answer gets a private `ANSWER_ACCEPTED` (with `refSeq`), then a `SCOREBOARD` broadcast.
- **Sequencing:** each match keeps one `seq` counter, starting at 1 and rising by 1 per broadcast (`QUESTION_STARTED`, `SCOREBOARD`, `QUESTION_REVEALED`). Private messages carry `refSeq` = the last broadcast `seq`, and no `seq`.
- **Bots** (`minnal.bot.*`, `RandomGenerator` injectable and seeded in tests):
  - Per question, a uniform random delay of 2–12 s after `startedAt`.
  - They answer correctly with p = 0.65, otherwise pick a uniformly random wrong option. With p = 0.10 they don't answer at all.
  - A bot answer is an ordinary `Answer` event stamped at fire time, scored by `Scoring`.
  - There is no bot-specific code in the scoring or reveal paths.
- **Subscriptions:** `SUBSCRIBE /topic/match/{matchId}` is allowed only for a `sub` that is a human participant of that live match (through a `MatchAccess` port the interceptor calls). Every other `/topic/**` subscription, `/topic/room/**` included, is rejected (`ERROR` frame). `/user/**` is unchanged.
- **Rate limit:** a token bucket per STOMP session (capacity and refill `minnal.ws.inbound-rate` = 10/s) in the inbound interceptor. CONNECT and DISCONNECT are exempt.
  - An excess frame is dropped and the session gets a private `ERROR RATE_LIMITED`, at most one per second.
  - The bucket is removed on disconnect.
- **End:** after the 10th reveal the match is `ENDED`. Its humans are released (`IN_MATCH` → free), and the actor is closed and removed. `MATCH_ENDED`, results and post-match belong to 1.10.
  - A `Disconnect` only marks the participant `DISCONNECTED`. The match always runs to the end; grace, forfeit and abort belong to 1.9.
  - The 1.6 TTL and all-disconnect release are removed.
- **Drain:** a `MatchDrain` `SmartLifecycle` (phase just below `DrainState`) blocks `stop` until no match is live, or 5 min pass. `spring.lifecycle.timeout-per-shutdown-phase: 5m`; compose game-service `stop_grace_period: 330s`.
- **Metrics:**
  - The timer `minnal.match.answer.ack`, from `receivedAt` to the `ANSWER_ACCEPTED` send.
  - The timer `minnal.match.broadcast.lag{type}`, from the triggering instant (the answer's `receivedAt`, or the timer's scheduled instant) to the send.
  - The counter `minnal.match.ended`.
- **Architecture test (ArchUnit, test scope; pin a version released ≥ 2 weeks ago, e.g. 1.4.1):** classes in `in.minnal.game.match..` must not depend on `java.sql..`, `javax.sql..`, `org.springframework.jdbc..`, `org.springframework.data..`, `org.springframework.web.client..`, `org.springframework.http.client..`, `java.net.http..`, or the `QuestionSetClient` types.
- **Load test:** `MatchLoadTest`, tagged `load` and excluded from the default build, run with `-Dgroups=load`. 100 concurrent matches × 2 real STOMP clients with shortened windows; it asserts ack p95 < 200 ms and broadcast lag p95 < 500 ms from the Micrometer timers.
- **Web (contract only, no UI):** `realtime/protocol.ts` gains the types and parsers for the new payloads and error codes, so `contract.test.ts` and the `enums.json` check stay green. `parseIncoming` returns the typed variants; `connection.ts` stays unchanged.

**Never:**
- UI for the live match (1.8).
- Reconnect, SNAPSHOT, resync, forfeit, leave or abort (1.9).
- `MATCH_ENDED`, `Ranking`, results, rematch or `minnal.match.completed` (1.10).
- DB, Valkey or HTTP from match code.
- Sending a question before its window opens, or any answer, explanation or correctness before the reveal.
- Using client timestamps.
- Bot branches in scoring.
- A 3-2-1 countdown (Battle Room only).
- A new runtime dependency (ArchUnit is test-only).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Q starts | lead-in elapsed | `QUESTION_STARTED{questionIndex 0,total 10,startedAt,deadline=+15 s,question}` seq 1; no answer fields | N/A |
| Fast correct | correct at remaining 15000 / 7500 / 0 ms | 1000 / 750 / 500 points | N/A |
| Wrong / none | wrong pick, or no answer | 0 points, `pickedIndex` absent for none | N/A |
| Ack | in-window answer | private `ANSWER_ACCEPTED{questionIndex}` with `refSeq`; then `SCOREBOARD{answered:[pid]}` | N/A |
| Duplicate | second answer, same question | ignored; score uses the first | N/A |
| Late | `receivedAt` > deadline, or after close | `ERROR ANSWER_REJECTED` | N/A |
| Wrong index / option | `questionIndex` ≠ open, or option 5 | `ERROR ANSWER_REJECTED` | N/A |
| Outsider | non-participant answers / subscribes | `ERROR NOT_IN_MATCH` / subscription refused | N/A |
| Race | answers stamped just before the deadline vs CloseWindow, from many threads | same result on every run | N/A |
| Reveal | window closes | `QUESTION_REVEALED` with answerIndex, explanation, attribution?, per-participant pick/correct/points/total | N/A |
| Bot | bot in the match | varied delays across questions; sometimes wrong or silent; scored by `Scoring` | N/A |
| N = 5 | five participants | same flow; the scoreboard and reveal list all five | N/A |
| Flood | 25 frames in 1 s on one session | about 10 processed; one `ERROR RATE_LIMITED`; other sessions unaffected | N/A |
| End | 10th reveal | humans released; a new join works | N/A |
| Drain | shutdown mid-match | new joins `SERVER_DRAINING`; the match finishes; shutdown then completes | N/A |
| Short set | core returns 9 of 10 | both players get `MATCHMAKING_FAILED` and are released | N/A |

</frozen-after-approval>

## Code Map

**Contracts:**
- `contracts/src/main/java/in/minnal/contracts/realtime/`: `ServerMessage` already has `direct`, `aboutMatch` and `error`. Add factories `broadcast(type, matchId, seq, now, payload)` and `reply(type, matchId, refSeq, now, payload)`, and extend `error` with a `refSeq` overload.
  - `Destinations.MATCH_ANSWER` and `matchTopic(UUID)` exist.
  - `MessageType` already lists `QUESTION_STARTED`, `ANSWER_ACCEPTED`, `SCOREBOARD` and `QUESTION_REVEALED`.
- `contracts/src/main/java/in/minnal/contracts/internal/InternalQuestion.java`: the source for `QuestionView` (copy every field except `answerIndex`, `explanation` and `attribution`).
- `contracts/src/test/java/.../realtime/RealtimeSamplesTest.java`: add the new samples (the `basedir`-aware path is already fixed). `ContractJson` is the test mapper.

**game-service** (`services/game/src/main/java/in/minnal/game/`):
- `match/domain/MatchShell.java`: delete it. Move its fields (participants, humans sub→pid, questions, queueWaitMs, ratings) into the actor's construction input (`MatchSetup`).
- `match/application/MatchRegistry.java`: rewrite. `start(MatchSetup)` creates and registers a `MatchActor`, moves humans to `IN_MATCH`, and tells `Begin`. Remove the TTL and the abandon logic.
  - `onLastSessionClosed` forwards `Disconnect` to the player's match.
  - It implements `MatchAccess` (`isParticipant(matchId, sub)`, `participantId(matchId, sub)`) and `liveCount()`.
  - On end it removes the actor and releases the humans.
  - Fix `MatchRegistryTest` and the `MatchmakingFlowTest` shell assertions to match.
- `matchmaking/application/MatchmakingActor.java` L219: `matches.create(new MatchShell(...))` becomes `matches.start(new MatchSetup(...))`. `MATCH_FOUND` sending is unchanged.
- `platform/actor/Actor.java`: reuse it as is.
- `platform/session/PlayerChannel.java`: `toPlayer`/`toSession`. Add `MatchBroadcaster` (`SimpMessagingTemplate.convertAndSend(Destinations.matchTopic(id), msg)`) in `platform/infrastructure/ws/`.
- `platform/infrastructure/security/StompConnectAuthInterceptor.java`: the SUBSCRIBE branch currently allows any `/topic/**`. Add the `MatchAccess` check and deny other topics, plus the rate-limit bucket.
  - The interceptor is constructed in `WebSocketConfig.configureClientInboundChannel`. Pass `MatchAccess` and the rate config through it, using `@Lazy` injection to avoid a cycle with `MatchRegistry` → `SimpMessagingTemplate`.
  - Sending `ERROR RATE_LIMITED` from the interceptor needs the `PlayerChannel`, also `@Lazy`.
- New `match/api/MatchController.java`: `@MessageMapping("/match/{matchId}/answer")` with `@Payload AnswerRequest`, the `Principal` and the session id. It stamps `receivedAt` before anything else.
- `platform/drain/DrainState.java`: phase `Integer.MAX_VALUE`. `MatchDrain` uses `MAX_VALUE - 1`.
- `matchmaking/infrastructure/HttpQuestionSetClient.java`: the size check exists. Add the missing test only (`FakeCore` gains a `shortBy(n)` knob).
- `src/main/resources/application.yaml`: replace `minnal.match.shell-ttl` with `lead-in`, `close-grace` and `reveal-hold`. Add `minnal.bot.*`, `minnal.ws.inbound-rate` and `spring.lifecycle.timeout-per-shutdown-phase: 5m`.
- Tests:
  - Support in `src/test/java/in/minnal/game/support/`: `GameIntegrationTest` (with `TestClockConfiguration`/`MutableClock`), `StompTestClient` (add `subscribe(destination)` and topic frame capture), `RawStomp` and `FakeCore`.
  - Integration tests set short `minnal.match.*` timings through properties; domain tests use `MutableClock` with no sleeps.
- `services/game/pom.xml`: add `com.tngtech.archunit:archunit-junit5` (test scope, explicit version) and configure surefire `excludedGroups=load`.

**Deploy:** in `deploy/compose.yaml`, give game-service `stop_grace_period: 330s`.

**Web:** `web/src/realtime/protocol.ts`: the `parseIncoming` switch (L173–200) returns `OTHER` for unknown types. Add typed cases and the `ENUMS`/`ErrorCode` entries. `contract.test.ts` reads every sample automatically.

## Tasks & Acceptance

**Execution:**
- [x] `contracts/**` + `contracts/samples/*`: `Scoring` (unit tests plus an exhaustive 0–15000 ms sweep as the property test), the payload records, the error codes, the envelope factories, the samples, and the `QuestionView` field-set test.
- [x] `services/game/.../match/domain/*` + unit tests: `MatchState` driven with N = 2 and N = 5 on a `MutableClock`. Cover first-answer-wins, late, wrong index, bad option, scoring through `Scoring`, scoreboard contents, reveal contents, seq/refSeq, end-of-match, and no answer data in `QUESTION_STARTED`.
- [x] `services/game/.../match/application/*` (`MatchActor`, `MatchRegistry`, `MatchSetup`, bot scheduling, `MatchDrain`) + tests: a concurrency test (≥ 50 threads answering around the deadline while CloseWindow fires, repeated 20×, identical results), a bot test (seeded; delays vary, wrong and silent answers occur, no scoring branch), and a drain test.
- [x] `services/game/.../match/api/MatchController.java`, the interceptor, `WebSocketConfig`, `MatchBroadcaster` + integration tests: a full match between two STOMP clients with short timings; outsider subscribe refused; `NOT_IN_MATCH`; flood → `RATE_LIMITED`, other session unaffected; end → re-join works; short set → `MATCHMAKING_FAILED`.
- [x] `services/game/src/test/.../ArchitectureTest.java` + `MatchLoadTest.java` (tagged `load`); `services/game/pom.xml`.
- [x] `services/game/src/main/resources/application.yaml`, `deploy/compose.yaml`: config.
- [x] `web/src/realtime/protocol.ts` + `contract.test.ts`: parsers for the new samples.

**Acceptance Criteria:**
- Given `./mvnw verify` with Docker running, when it runs, then every module passes, the architecture test included, and the enforcer rules hold.
- Given `./mvnw -pl services/game -Dgroups=load test`, when it runs, then ack p95 < 200 ms and broadcast lag p95 < 500 ms.
- Given `cd web && npm run typecheck && npm test && npm run check:i18n && npm run build:check`, when it runs, then everything passes.
- Given the stack running, when `deploy/verify-local.sh` runs, then every check passes.

## Implementation Notes

- **Choices the spec left open:**
  - `minnal.match.window` (default 15 s = `Scoring.WINDOW`) exists so tests can shorten windows; `Scoring` still clamps to 15 000 ms. `minnal.match.drain-timeout` (5m) backs `MatchDrain`.
  - `MatchAccess` and `MatchBroadcaster` are ports in `platform.session` (beside `PlayerChannel`); `StompMatchBroadcaster` is the STOMP adapter. `InboundRateLimiter` is a bean in `platform/infrastructure/ws` (monotonic `nanoTime`, not the server clock).
  - `MatchEvent.Answer` also carries a `ReplyTo(sub, sessionId)` (null for a bot). `BotAnswer` is stamped when its timer fires and is handled as an ordinary `Answer`.
  - `ANSWER_ACCEPTED` goes to every session of the player; `ANSWER_REJECTED`/`NOT_IN_MATCH` go to the asking session only. `NOT_IN_MATCH` carries the addressed `matchId` (when it parses) and no `refSeq`.
  - A duplicate is checked before validity: any repeat for a question the participant already answered is dropped silently, even after its reveal.
  - Bot rule order: silent with p = 0.10; otherwise correct with p = 0.65, else a uniform wrong option. `botRandom` is a `java.util.Random` bean (thread-safe), replaceable by a seeded one.
  - A body that is not JSON gets `ERROR BAD_REQUEST` (`@MessageExceptionHandler`); missing fields get `ANSWER_REJECTED`.
  - An exception inside a match actor ends the match (released) instead of leaving it stuck.
  - The `broadcast-envelope.json` sample was dropped: `scoreboard.json` and friends now cover broadcasts, and a payload-less SCOREBOARD no longer parses. `client-answer.json` pins the client body.
  - **Drain addition:** `MatchRegistry.start` refuses once draining, checking under the monitor `awaitNoLiveMatches` uses, so a match either counts for `MatchDrain` or never starts; the pairing's humans are released with a private `ERROR SERVER_DRAINING`. `MatchDrain` warns (fails under prod) when `spring.lifecycle.timeout-per-shutdown-phase` < `minnal.match.drain-timeout`.
  - Answers stamped before `startedAt` are rejected. An ended match stays resolvable for 30 s (tombstone), so its players' late answers get `ANSWER_REJECTED` (with the last `seq`); others get `NOT_IN_MATCH`.
  - `minnal.match.ended` counts only matches that reached the last reveal; `minnal.match.failed` counts matches ended by an error.
  - Spring's broker and WebSocket handler stop at phase 0 and Boot's graceful web shutdown at `MAX-2048`, all after `MatchDrain` (`MAX-1`); `MatchDrainIntegrationTest` proves a match keeps broadcasting through a context close.
  - `MatchState.of` gives a participant without a `sub` (a bot) `CONNECTED`; nothing in `MatchState`/`MatchParticipant`/`Scoring` references `ParticipantKind` (an ArchUnit rule).
- **Verified:**
  - `./mvnw clean verify`: BUILD SUCCESS (contracts 38, core 114, game 137, ratings 23 tests incl. ArchitectureTest; core and ratings unchanged and green).
  - `./mvnw -pl services/game -Dgroups=load test` (contracts installed first): PASS. 100 matches × 2 clients: ack p95 ≈ 0.3 ms; lag p95 QUESTION_STARTED ≈ 11–15 ms, SCOREBOARD ≈ 0.4 ms, QUESTION_REVEALED ≈ 13–18 ms. Measured on a laptop, not the 2 vCPU VPS; the timers stop at the hand-off to the broker, not the socket write.
  - Web: typecheck, 436 tests, `check:i18n`, `build:check` (113.9 KB initial JS) all pass.
  - `deploy/verify-local.sh`: all 30 PASS on a throwaway `minnal-verify17` stack (since removed), built before the last two small patches (drain-fails-pairing, release-before-remove); `docker compose stop game-service` with no live match took 1 s.
- **Not done:**
  - The manual 2.85 min Quick Match against the bot on the stack: the bank has 0 published questions (seed still needs `reviewedBy`, Story 1.4), so every match ends in `MATCHMAKING_FAILED`.
## Spec Change Log

## Review Triage Log

Layers: BH = Blind Hunter, ECH = Edge Case Hunter, VG = Verification Gap.

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | BH | An answer stamped before `startedAt` (a guess for the next question during the hold, queued after NextQuestion) is accepted and scores 1000 | medium | `MatchState.answer` checks only `receivedAt ≤ deadline`; remaining > window clamps to 15000 | patch |
| 2 | BH, ECH | Drain check-then-act race: a pairing passes `isDraining()`, then MatchDrain sees 0 live matches and returns before `start()` | low | No shared monitor between `MatchmakingActor` L195 and `MatchDrain` L36; the window is tiny, but the AC promises live matches finish | patch |
| 3 | BH | The shutdown budget doesn't add up (5 min drain + 5 min graceful web) | false | `server.shutdown` isn't graceful; only MatchDrain's phase is long, and 330 s covers it | reject |
| 4 | BH, ECH, VG | A crashed match ends silently for clients, and the failure path is untested | medium | No test makes a handler throw (VG pre-verified). A client notice is 1.9's abort scope | patch (test); notice deferred |
| 5 | BH, ECH, VG | `minnal.match.ended` counts crashed matches | low | `MatchRegistry.ended` increments unconditionally; direct correction | patch |
| 6 | BH, ECH, VG | The 50 ms close grace is called a guarantee and is never exercised | medium | The 50-thread test fires 15 ms before the deadline (VG pre-verified) | patch |
| 7 | BH, ECH | A late answer to Q10, or one landing as the actor ends, gets NOT_IN_MATCH or no reply instead of ANSWER_REJECTED | low | The match is removed from `live` at once; the matrix "Late" row requires ANSWER_REJECTED, and late taps on Q10 are everyday | patch |
| 8 | BH, ECH | `minnal.match.window` can diverge from `Scoring.WINDOW`; bot and match settings are unvalidated | low | Configuration only; the window is shortened deliberately by tests | reject |
| 9 | BH, ECH | Question shape (4 options, answerIndex, text) isn't validated at match start | low | core's shared `QuestionValidator` guarantees the shape for every served version | reject |
| 10 | BH | `QuestionView` with both texts null is dropped by the web parser | low | Unreachable: core requires at least one text | reject |
| 11 | BH | The ArchUnit rule misses Lettuce/Redis, WebClient and raw `java.net` I/O | low | Lettuce is on game's classpath (data-redis), so match code could reach Valkey unflagged; direct correction | patch |
| 12 | BH, ECH | Without a web subscriber, humans stay `IN_MATCH` about 2.85 min; the abandoned-shell release is gone | low | Approved frozen decision (the 1.6 release removed; leave/abort in 1.9); shorter than 1.6's 5 min TTL | reject |
| 13 | BH, ECH | `Connection` never returns to CONNECTED after a reconnect | low | Real; reconnect is 1.9's scope and nothing reads the field yet | defer |
| 14 | BH, ECH | A rate-limited SUBSCRIBE is dropped with only a generic RATE_LIMITED | low | A client sends one or two frames around MATCH_FOUND, far under 10/s | reject |
| 15 | BH | Tracking files inconsistent; verify-local ran before the last patches | false | sprint-status moves to `review` at step 5 by design; the verify-local timing is recorded in Implementation Notes | reject |
| 16 | ECH | A pairing refused while draining tells players QUESTION_SET_UNAVAILABLE | low | Wrong client message (no draining notice); direct correction | patch |
| 17 | ECH | The rate limiter samples `nanoTime` outside the bucket lock | false | The inbound channel runs inline per session (SyncTaskExecutor), so one session's frames never run concurrently | reject |
| 18 | VG | A non-JSON answer body → BAD_REQUEST is untested | medium | Pre-verified: no test sends a non-JSON answer | patch |
| 19 | VG | Bucket removal on disconnect isn't exercised through a real disconnect | medium | Pre-verified; a slow leak, not a correctness failure | defer |
| 20 | VG | Nothing pins `timeout-per-shutdown-phase` ≥ drain timeout | medium | Pre-verified: dropping it cuts matches at 30 s with every test green | patch |
| 21 | VG | `NOT_IN_MATCH` from `MatchState` carries `refSeq`, unlike the notes | low | Unreachable: `MatchRegistry.answer` filters non-participants first | reject |

## Design Notes

- **Close grace (50 ms):** `receivedAt` is stamped on the socket thread, so an answer stamped at 14 999 ms can reach the mailbox after a `CloseWindow` timed exactly at the deadline. Closing a little late makes the stamp, not thread timing, decide. The result is deterministic, which is what the concurrency test proves.
- **Pure `MatchState` + thin actor:** this is the same shape as 1.6's `MatchmakingQueue`. Timing rules and N-participant behaviour are tested without threads, and the actor only serialises events and performs effects. Battle Room (5.4) becomes configuration: participant count and hold.
- **Lead-in instead of a SNAPSHOT:** 1.9 adds SNAPSHOT for late joiners. Until then, 3 s after `MATCH_FOUND` covers the client's subscribe step. The 1.6 web client doesn't subscribe to the topic yet (1.8 does), so a human currently scores 0 while the match runs on the server.

## Verification

**Commands:**
- `./mvnw verify`: expected BUILD SUCCESS.
- `./mvnw -pl services/game -Dgroups=load test`: expected PASS, with the p95s logged.
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run build:check`: expected all green.
- `deploy/verify-local.sh`: expected all PASS.

**Manual checks:**
- With the stack running and a seeded bank, a raw STOMP client (or the Story 1.6 harness) plays a Quick Match against the bot and sees 10 `QUESTION_STARTED`/`QUESTION_REVEALED` pairs in about 2.85 min.

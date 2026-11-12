---
title: 'Story 1.11: Instant 1v1 feedback and early close'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: '03d21e04b2cf5956693335f4ce5e0cb75863496f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-12.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-live-match-engine.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-8-live-match-screen-and-peak-moments.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every question waits out the full 15 s even when everyone has answered, and in 1v1 a player learns whether she was right only at that close. Matches feel slow (about 2.85 min) and feedback feels delayed.

**Approach (approved Sprint Change Proposal of 2026-11-12):**
- The match actor closes a question as soon as every participant still in the match has answered (every mode).
- In 1v1 modes (QUICK, TOPIC_DUEL), `ANSWER_ACCEPTED` also tells the player her own result, so the screen shows her band at her tap. The question-close reveal then adds the opponent's pick, the explanation and the attribution, with no second peak.
- Battle Room keeps the receipt-only ack.
- The epics.md Story 1.11 acceptance criteria are the contract. This spec adds the decisions below.

## Boundaries & Constraints

**Always:**
- **Contracts:** `AnswerAcceptedPayload(questionIndex, correct?, points?, answerIndex?, totalScore?)`. The four new fields are `Boolean`/`Integer`, present only in 1v1 modes. Absent fields are omitted on the wire, following the convention so far.
  - **Decision:** `totalScore` (her running total including this answer) is added beyond the story's field list, so the client shows the total without computing a score.
  - Add golden samples `answer-accepted-1v1.json` and keep `answer-accepted.json` as the room/receipt shape. The drift test and the web parsers follow.
- **Which modes count as 1v1:** `MatchMode.QUICK` and `TOPIC_DUEL` → 1v1; `BATTLE_ROOM` → receipt only. This is one static helper in contracts (`MatchMode.revealsOwnAnswerAtAck()` or similar), not a check in each service.
- **Early close (game `MatchState`/`MatchActor`, every mode):**
  - After an `Accepted` outcome, if every participant with `forfeited == false` (bots included; DISCONNECTED participants still count) has an answer for the current index, the actor closes the question at once. That means `closeWindow(current, now)`, the broadcast, then the reveal hold, then the next question, exactly as a timed close.
  - The scheduled `CloseWindow` for that index is cancelled. If it fires anyway, it is the existing stale-timer no-op.
  - Points are untouched: they stay `Scoring` on `deadline − receivedAt` at accept time.
  - A silent bot, or a human who never answers, leaves the window open to its deadline.
- **1v1 ack:** when an answer is accepted in a 1v1 mode, the private `ANSWER_ACCEPTED` (still to the answering player only, with `refSeq`) carries `correct`, `points`, the question's `answerIndex` and `totalScore`. `SCOREBOARD` is unchanged: it never carries a pick or correctness.
- **Web store/connection:** in 1v1, `myAnswer` gains `result {correct, points, answerIndex, totalScore} | null`, set from the ack. A Battle Room ack keeps `result = null`.
- **Web screen (1v1, own answer accepted with a result):**
  - The `RevealBand` shows at once, with the same visuals as a Story 1.8 reveal: the correct one with band drop, volt points, total and one strike through `requestFlash`; the wrong one naming the correct answer, own pick in brick.
  - It is announced politely: `match.revealCorrect` / `match.revealWrong`.
  - The options show the correct answer and her pick. The opponent's pick and the other options' final styling wait for `QUESTION_REVEALED`.
  - The footer reads `match.waitingFor` ("Waiting for {{name}}…", with the name unchanged) until the question closes.
  - At `QUESTION_REVEALED` for that index, the opponent's pick, the explanation and the attribution are added. The band stays as it is: no remount, no second drop, strike or announcement. Its numbers update to the reveal's values (they are equal).
  - With no answer, or a room match, the Story 1.8 reveal is unchanged.
  - The reduced path is a 200 ms fade, as before.
- **Timer freeze:** when the question closes (a reveal for the current index) before the deadline, the bar stops at its current position (no transition), the seconds label stops, and no 5 s cue fires after the close. Everything else about the timer is unchanged.
- **Strings:** add `match.waitingFor` in both languages with `signoff: ['ml','en']`.
- **No mention of any AI tool** anywhere in code, comments, docs, commits or PRs.

**Never:**
- Instant feedback in Battle Room.
- Showing the opponent's pick or correctness before `QUESTION_REVEALED`.
- Client-side scoring or totals (every number comes from a payload).
- Changing `Scoring`, the reveal hold, or Story 1.9 scope (reconnect, SNAPSHOT, leave, forfeit). The SNAPSHOT part of the story AC is satisfied in Story 1.9; this story only keeps `myAnswer.result` in the store so 1.9 can restore it.
- New runtime dependencies.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Both answer early | 1v1, A at 3 s, B at 5 s | at B's accept: `QUESTION_REVEALED` immediately (about 5 s), hold 2 s, next question | N/A |
| N = 5 | 4 of 5 answered | stays open; the 5th answers → closes at once | N/A |
| Silent bot | the bot doesn't answer | closes at deadline + grace, as before | N/A |
| Disconnected human | DISCONNECTED, not forfeited, no answer | waits for the deadline | N/A |
| Points unchanged | same answers, early vs timed close | identical points and totals | N/A |
| 1v1 ack | QUICK, correct at 7.5 s remaining | `ANSWER_ACCEPTED{questionIndex, correct:true, points:750, answerIndex, totalScore}` to the sender only | N/A |
| Opponent secrecy | B's frames while A is answered and B is not | only `SCOREBOARD` `answered:[A]`; no pick, correctness or answerIndex before the reveal | N/A |
| Room ack | BATTLE_ROOM setup | `ANSWER_ACCEPTED{questionIndex}` only | N/A |
| Screen, own correct | 1v1 ack correct | band + strike + "Correct. Answer: X. +750, total …" at once; footer "Waiting for <name>…" | N/A |
| Screen, own wrong | 1v1 ack wrong | band naming the correct answer; own pick brick; no strike | N/A |
| Close after own result | `QUESTION_REVEALED` | opponent's pick, explanation and attribution added; no second drop or strike or announcement | N/A |
| Timer freeze | reveal at 9 s left | bar holds, label stops, no 5 s cue later | N/A |
| No answer | the player never taps | the Story 1.8 reveal at close | N/A |

</frozen-after-approval>

## Code Map

**Contracts:**
- `contracts/src/main/java/in/minnal/contracts/realtime/AnswerAcceptedPayload.java`: currently `record AnswerAcceptedPayload(int questionIndex)`. Add the nullable fields and a 1v1 factory.
- `MatchMode.java`: add the 1v1 helper.
- `contracts/samples/answer-accepted.json` stays. Add `answer-accepted-1v1.json` through `RealtimeSamplesTest` (regenerate with `-Dcontracts.updateSamples=true`).

**game-service** (`services/game/src/main/java/in/minnal/game/match/`):
- `domain/MatchState.java`:
  - `answer(...)` (L136) builds the ack: add the result fields when the mode is 1v1, and compute `totalScore = participant.score() + points` (the score is applied at `closeWindow` L173, so don't double-count).
  - The constructor and `of(MatchSetup…)` (L55, L73) need the mode; `MatchSetup` already carries `mode`.
  - Add `allAnswered()`: every participant with `!forfeited` has an answer for `current`.
- `application/MatchActor.java`: `onAnswer` (L149) → after `Accepted`, if `state.allAnswered()`, call the same path as `closeWindow` (L173) with `dueAt = now`.
  - Keep the per-index `CloseWindow` future so it can be cancelled. `pending` (L56) holds every timer; track the current close timer in a field.
  - `closeWindow` already ignores stale indices.
- Tests:
  - `MatchStateTest` (N = 2 and N = 5 helpers exist), `MatchActorTest` (timers through `MatchTestKit`) and `MatchFlowTest` (two STOMP clients; `StompTestClient.next(type)` fails on unexpected frames, so secrecy is checked by reading every frame B receives).
  - Add a guest-vs-bot early-close case with a seeded `BotBrain`.

**Web** (`web/src/`):
- `realtime/protocol.ts` `parseAnswerAccepted` (L241): accept the optional fields (all or none).
- `realtime/liveGameStore.ts` `MyAnswer`: add `result`.
- `realtime/connection.ts` ANSWER_ACCEPTED case (L192): set `result` when present.
- `screens/match/LiveMatchScreen.tsx`:
  - The reveal is computed at L70 and the band at L161–170 (`key=reveal-<index>`). Derive a single "own result" source: the ack result first, then the reveal's self result. Render the band once per question under a stable key, so the close doesn't remount it.
  - The announcement effect is at L104–114, and the footer at L200–202.
  - Options get `optionReveal` (L125–133): build a partial reveal from the ack (answerIndex and own pick, no opponent picks) until the reveal arrives.
- `screens/match/TimerBar.tsx` (L30): add a `closed` prop (true when a reveal for the current index exists) that freezes the bar and the label and suppresses the 5 s cue.
- `design/peak/RevealBand.tsx`: unchanged API; the stable key avoids a replay.
- `i18n/catalogue.ts`: `match.waitingFor`.
- Tests: `screens/match/LiveMatchScreen.test.tsx` and `realtime/connection.test.ts` (with the `test-utils/realtime.ts` frame helpers; add an ack-with-result helper) and `realtime/contract.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `contracts/**` + samples: the payload fields, the 1v1 helper, samples and drift/round-trip tests.
- [x] `services/game/.../match/domain/MatchState.java` + tests: the 1v1 ack fields, `totalScore` without double-counting, `allAnswered` with N = 2 and N = 5, forfeited excluded, disconnected included.
- [x] `services/game/.../match/application/MatchActor.java` + tests: early close cancels the timer and keeps the hold; a silent bot keeps the full window; points are identical early vs timed.
- [x] `services/game/src/test/.../MatchFlowTest.java`: a two-client 1v1 with early close, the opponent never seeing a pick or correctness before the reveal, and a room-mode ack with receipt only.
- [x] `web/src/realtime/*` + tests: parse, store and connection.
- [x] `web/src/screens/match/*` + `i18n/catalogue.ts` + tests: every web matrix row.

**Acceptance Criteria:**
- Given `./mvnw verify`, when it runs, then every module passes, the architecture test included.
- Given `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check`, when it runs, then everything passes.
- Given the running stack, when a guest plays Quick Match against the bot, then her result shows at her tap, each question moves on about 2 s after both have answered, and the whole match takes about 1–1.5 min.

## Implementation Notes

- **Choices the spec left open:**
  - `AnswerAcceptedPayload` has the factories `receipt(i)` and `withResult(i, correct, points, answerIndex, totalScore)`; `MatchMode.revealsOwnAnswerAtAck()` is the one 1v1 rule. `MatchState` takes the mode (from `MatchSetup`) and builds the ack with `totalScore = score + points` (the score itself is still applied at the close).
  - `MatchParticipant.forfeit()` is package-private (Story 1.9 will drive it); tests use it to prove a forfeited participant is not waited for.
  - `MatchActor` keeps the open question's `CloseWindow` future in `closeTimer`; an early close cancels it and runs the timed-close path with `dueAt = now`.
  - The two-client early-close and Battle Room checks live in a new `MatchEarlyCloseFlowTest` (window 3 s through `@TestPropertySource`, a second Spring context), because the 200 ms window of `application-test.yaml` cannot tell an early close from a timed one. `MatchFlowTest` was updated for the 1v1 ack. The Battle Room match is started directly through `MatchRegistry.start` (no room matchmaking exists yet).
  - Web: `AnswerAcceptedPayload` is `{ questionIndex, result: AnswerResult | null }` (the parser maps all-four-absent to null and rejects a partial result). `MyAnswer.result` is null while pending and for a receipt.
  - Screen: the band is keyed `band-<index>`; its source is the reveal when present (its numbers), else the ack. The result is announced once per question from whichever comes first; a 1v1 ack does not also announce "Locked in". `OptionReveal.partial` marks only the answer and her pick (other options stay `idle`) until the close. The footer uses the first opponent's unchanged name.
  - `TimerBar` captures the clock offset once per question (keyed by deadline and index) so the freeze at the close uses the same clock as the running bar, not the offset re-sampled from the reveal's `serverTime`.
  - `match.waitingFor` ml: "{{name}} · കാത്തിരിക്കുന്നു…" (drafted; name + separator, never inflected).
- **Verified:**
  - `./mvnw verify` (no `clean`): all modules pass, ArchitectureTest included; contracts samples regenerated (`answer-accepted-1v1.json` added, `answer-accepted.json` unchanged).
  - `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check`: all green, 502 tests, initial JS 120.4 KB of 150 KB.
- **Not done:** the manual Quick Match against the bot in the browser (pacing about 1–1.5 min, band at the tap, opponent pick at the close).

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | verification-gap | Reduced-path timer freeze unverified (only non-reduced, whole-second test) | low | patch | Pre-verified; added a reduced-path freeze test at a non-whole second. |
| 2 | blind + edge | Forfeit mid-question never triggers early close; all-forfeited makes `allAnswered` vacuous | maybe-false (medium if real) | defer | Nothing calls `forfeit()` outside tests; Story 1.9 owns the forfeit path. Logged in deferred-work.md. |
| 3 | blind | Java `AnswerAcceptedPayload` allows a partial result | low | reject | Only the two factories build it; a guard adds complexity for an unreachable case. |
| 4 | blind + edge | "Waiting for <name>…" shown when the opponent already answered / empty name | low | reject | If the opponent already answered, the ack, scoreboard and reveal leave in the same actor turn, so the footer lasts milliseconds; 1v1 always has a named opponent. |
| 5 | blind | Battle Room "result when time runs out" copy now inaccurate | low | reject | The epic UX keeps this copy; no Battle Room UI exists in Epic 1. |
| 6 | blind | Announcement effect may read an empty answer text | false | reject | `own` needs an ack for the current index, so `view` (the started question) is always present. |
| 7 | blind | 5 s cue still fires between ack and close | false | reject | Spec: the timer changes only at the close ("everything else unchanged"). |
| 8 | blind | Timer cancel not directly asserted | low | reject | A fired stale timer is the spec's accepted no-op; behaviour is correct either way. |
| 9 | blind | Cancelled timers accumulate in `pending` | false | reject | `MatchActor` prunes done (incl. cancelled) futures with `pending.removeIf(Future::isDone)` on each schedule. |
| 10 | blind | Wall-clock asserts in `MatchEarlyCloseFlowTest` may flake | low | reject | 1.5 s bound vs a 3 s window leaves a 2x margin. |
| 11 | blind | No early-close metric | false | reject | Not required by the intent; no harm named. |
| 12 | blind | AD-5/AD-6 architecture amendment missing from diff | false | reject | The amendment shipped in the planning PR (#15); planning docs were excluded from the review diff. |
| 13 | blind | No actor-level disconnected-opponent test | low | reject | `MatchStateTest` covers disconnected-included; the actor only calls `allAnswered()`. |
| 14 | blind | `assertNoResultIn` uses substring matching | low | reject | Test-only robustness; current frames have no colliding names. |
| 15 | edge | Explicit JSON null result fields reject the ack | false | reject | The server omits nulls on the wire (`aReceiptAckHasOnlyTheQuestionIndex`). |

## Design Notes

- **Why close on "every participant not forfeited":** a disconnected player inside the Story 1.9 grace may still come back and answer, so she still counts. A forfeited one never will, so she doesn't. Until 1.9 lands nobody is forfeited, so a disconnected human simply keeps the timed close.
- **One band per question:** keying the band by question index, not by its source, means the ack-driven band and the close don't replay the peak. That keeps the flash budget simple: at most one drop and one strike per question.

## Verification

**Commands:**
- `./mvnw verify`: expected BUILD SUCCESS. Warn before running it while IntelliJ services run, and never use `clean`.
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check`: expected all green.

**Manual checks:**
- Play Quick Match against the bot in the browser: the band at each tap, the quick move-on, the opponent's pick shown at the close, and the full match in about 1–1.5 min.

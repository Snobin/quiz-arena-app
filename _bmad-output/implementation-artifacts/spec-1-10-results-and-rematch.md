---
title: 'Story 1.10 (part 1): Match end, results screen and match-completed event'
type: 'feature'
created: '2026-11-13'
status: 'done'
baseline_commit: '5169d9b23c203c6336e8e52277e99b52c306f807'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-9-reconnect-forfeit-and-leave.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A completed match ends on an in-place "match over" line with a Home link. There are no placements, no per-question breakdown, nothing survives a reload, and nothing tells the rest of the system that a match finished.

**Approach:**
- **Server:** a shared `Ranking` in contracts. At the end of a completed match, the actor sends each live participant a private `MATCH_ENDED` with standings, the asked questions and a full breakdown. game-service then publishes exactly one `minnal.match.completed` to a Valkey stream, off the actor thread, with retry.
- **Web:** a full results screen (win takeover, loss and draw bands, dot strip, breakdown, Home bar) replaces the 1.9 minimal view and rehydrates from `sessionStorage`.

**Decisions:**
- **Scope split (owner, 2026-11-12):** rematch is part 2 (`deferred-work.md`). Rematch is part 2, so `POST_MATCH` (which only accepts rematch requests, AD-14) waits for part 2 as well. In this part the actor ends as it does today, right after `MATCH_ENDED`. The action bar shows Home only, and the Rematch button arrives with part 2.
- **`MATCH_ENDED`:** a private message (`ServerMessage.aboutMatch`, no `seq`).
  - Payload: `{matchId, mode, questionSource, participants[{participantId, displayName, kind, score, correctCount, forfeited, placement}], questions[{questionId, version, textMl?, textEn?, options, answerIndex, explanation, attribution?}], breakdown[{participantId, answers[{pickedIndex?, correct, responseMs?, points}]}]}`.
  - `answers[i]` lines up with `questions[i]`.
  - `questions` lists only the questions that were actually asked. If every human left early, the questions that never opened are not revealed.
- **Event:**
  - Stream key: `minnal.match.completed`, with no service prefix, because it is shared across services. Each entry has one field `payload` holding the JSON.
  - `startedAt` is the Q1 `startedAt`, and `endedAt` is the end instant.
  - `queueWaitMs` is the longest human wait, or omitted when no wait is known.
  - `userId` is the JWT `sub` for `USER` participants only, so it is absent for every Epic 1 guest.
  - Retry: 5 attempts with exponential backoff from 1 s. A final failure is logged as an error and increments `minnal.match.publish.failed`.
- **Hand-off to results:** the client navigates to `/results` once it has both the final `QUESTION_REVEALED` and `MATCH_ENDED`, in either order, after the 2 s reveal hold. A forfeited or left player who is already on `/results` sees the 1.9 minimal view (her earned score plus a "match still going" line), and it upgrades in place when `MATCH_ENDED` arrives. The same view covers a completed match with no `MATCH_ENDED`, such as a NOT_IN_MATCH settle.
- **Takeover:** shown only when she won (placement 1, not shared) and did not forfeit, and only on a live arrival, never on a reload. A forfeited opponent shows a "left" tag (the existing `match.leftStatus`).
- **Screen readers (owner, 2026-11-13):** there is no reliable way to detect a screen reader, so the takeover's auto-advance is turned off only under reduced effects. Under a screen reader it still collapses after `winHold`, and focus then lands on the results heading, whose accessible name carries the full result. This is a known limitation against UX-DR38.
- **New copy** is drafted in both languages and flagged for native review (`signoff`): the win title, Continue, the heading names, the dot labels, "You:"/"Answer:", not answered, and "match still going".

## Boundaries & Constraints

**Always:**
- **`Ranking`** (contracts `scoring`, next to `Scoring`): score desc, then correctCount desc, else a shared placement using competition ranking (1, 1, 3). It is used for both `MATCH_ENDED` and the event.
- **No I/O on the actor thread or in `match..`.** The publisher is a port in `match.application`, and its Valkey adapter lives outside `match..` (the ArchitectureTest stays green). `MatchState`, `MatchParticipant` and `Scoring` stay free of `ParticipantKind`.
- **One event per completed match** (Q1 revealed), published after the final reveal. Never for an aborted or failed match. A publish failure never delays or blocks `MATCH_ENDED`.
- **`MATCH_ENDED` goes to every human with a live session, forfeited ones included.** `correct` and `points` come from the server only, and the client never computes them.
- **Client:**
  - Only the connection module writes the store. `MATCH_ENDED` is stored in the store and in `sessionStorage` (`minnal.lastResult`, holding `{matchId, selfId, payload}`). A new `MATCH_FOUND` clears it.
  - `/results` with nothing stored or held redirects Home.
- **Win takeover:**
  - Its flood goes through `requestFlash`, so it starts at least 1000 ms after the last strike.
  - It is `role="dialog"`, labelled by its title, with Continue focused. It holds for `winHold`, or until Continue or a tap, then collapses over `winCollapse` into the compact band.
  - The dismissing tap is consumed, and results ignore taps for 400 ms.
  - Under reduced effects it uses a 200 ms fade and never auto-advances (Continue only).
- **Loss** opens settled: ink band, no volt, `result.lossBand` with the opponent's unchanged name. **Draw:** `result.draw` band, both scores white, no volt, bolt or takeover.
- **Breakdown and focus:**
  - The dot strip is a list, and its glyphs are `aria-hidden`.
  - Correct rows are `<button aria-expanded="false">` showing "Q3 ✓ 9 s +800".
  - Wrong and missed rows are always expanded, with "You:" (brick), "Answer:" (bold), the explanation, and the attribution or `match.sourceNotAvailable`.
  - Rows have no height animation under reduced effects.
  - The BOT badge always shows. Focus lands on the h1, whose accessible name carries the result. `document.title` names results.

**Never:** rematch, `POST_MATCH`, Share, a rating-delta area or placeholder, report links, a stream consumer, Testcontainers, client-side ranking or scoring, or replaying the takeover on reload.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Win vs bot | final reveal, she leads | `MATCH_ENDED` + one event; takeover ≥1 s after the strike, then the compact band | — |
| Tiebreak | equal score, she has more correct answers | placements 1/2 | — |
| Full tie | equal score and correct count | both get placement 1; draw band | — |
| Forfeiter, 1v1 human | she leaves at Q3, the opponent plays on | she gets `MATCH_ENDED` at the end (`forfeited: true`, ranked on her earned score); her `/results` upgrades in place | socket gone → the minimal view stays |
| All humans gone after Q1 | the only human leaves at Q5 | `questions` has Q1–Q5; the event is published | — |
| Abort / error | before the Q1 reveal | no `MATCH_ENDED`, no event | — |
| Valkey down | XADD throws | results unaffected; 5 attempts; error log + counter | — |
| Reload on `/results` | `sessionStorage` holds the result | same settled view, no takeover | corrupt entry → Home |
| Ordering | `MATCH_ENDED` arrives before the final reveal | held; navigate after the reveal hold | — |

</frozen-after-approval>

## Code Map

**Contracts** (`contracts/src/main/java/in/minnal/contracts/`):
- `scoring/Ranking.java`: new; `RankingTest`.
- `realtime/`:
  - `MessageType.MATCH_ENDED` already exists (add a Javadoc).
  - New: `MatchEndedPayload`, `ResultParticipant`, `ResultQuestion`, `ParticipantBreakdown`, `BreakdownAnswer`.
  - Reuse `ParticipantKind`, `MatchMode`, and `internal/QuestionSource`.
- `events/`: new package with `MatchCompletedEvent` + `CompletedParticipant`, and a `STREAM = "minnal.match.completed"` constant.
- Samples: `match-ended.json` and `match-completed.json` through `RealtimeSamplesTest.samples()` (~line 50; `-Dcontracts.updateSamples=true`). Add any new enum to `enumsJsonListsEveryEnumValue` (line 168).

**game-service** (`services/game/src/main/java/in/minnal/game/`):
- `match/domain/RecordedAnswer`: add `responseMs`, computed from that question's `startedAt` when the answer is recorded.
- `match/domain/MatchState`: keep `q1StartedAt` and the asked count. Add `results()`, returning per-participant score, correctCount (pick == answerIndex), forfeited, answers and the asked questions. It must not use kind.
- `match/domain/MatchSetup`: add `questionSource`, set from `MatchmakingActor` (~line 158 / 200–222; BANK).
- `match/application/MatchActor.end()` (396–406): when `isCompleted()`, rank, then send `MATCH_ENDED` to each human `sub` with `hasSession`. Then build the event (kind and userId mapped here) and call `MatchCompletedPublisher.publish(event)`, which must return at once. `closeWindow` (360–373) and `finishNow` (280–289) both reach `end()`.
- `match/application/MatchCompletedPublisher`: new port. It is wired through `MatchRegistry`, which builds the actors.
- `platform/infrastructure/valkey/ValkeyMatchCompletedPublisher`:
  - new; uses `StringRedisTemplate.opsForStream().add(record, XAddOptions.maxlen(100000).approximateTrimming(true))`;
  - runs on its own single-thread scheduled executor for the retry backoff;
  - is a conditional bean, with a logging no-op when Redis is absent. `application-test.yaml` excludes the Redis auto-config, so tests use a recording fake.
- `match/application/MatchMetrics`: add the `minnal.match.publish.failed` counter.
- Tests:
  - `MatchStateTest`: results and correctCount for N = 2 and N = 5.
  - `MatchActorTest`: `MATCH_ENDED` recipients and fields; no message or event on abort.
  - Publisher retry: unit test with a mocked `StreamOperations`.
  - New `MatchEndFlowTest` (model on `MatchEarlyCloseFlowTest`, using a short window): STOMP client gets `MATCH_ENDED`, and the fake publisher gets one event.

**Web** (`web/src/`):
- `realtime/protocol.ts`: `parseMatchEnded` (guard style ~228–248, optional → `null`); add an `Incoming` arm (446–458) and a case (461–487). Update the `contract.test.ts` expected list (40–60).
- `realtime/liveGameStore.ts`: `LiveMatch.ended?: MatchEnded`.
- `realtime/connection.ts`: handle `MATCH_ENDED`, including after an outcome exists. Write and clear `sessionStorage` (wrapped in try/catch).
- New `realtime/lastResult.ts` with `load`/`save`/`clear`.
- `test-utils/realtime.ts`: a `matchEnded()` builder.
- `screens/match/LiveMatchScreen.tsx`: replace the `match.over` + Home block (390–398) and its announcement (153–158) with navigation to `/results`, using the hand-off rule.
- `screens/results/`:
  - Rewrite `ResultsScreen.tsx`, keeping its minimal fallback.
  - New `WinTakeover.tsx` (copy the `requestFlash`/`reducedFade` pattern from `design/peak/RevealBand.tsx` and `BoltStrike`; volt only under `design/peak/`, so put the takeover's volt parts there).
  - New `ResultsBand.tsx`, `DotStrip.tsx`, `BreakdownRow.tsx` (reuse `screens/match/RevealDetails.tsx` for explanation + attribution).
  - New `ResultsScreen.test.tsx`. Keep `ReconnectLeave.test.tsx` /results cases green.
- Reuse: `design/Button`, `BotBadge`, `PageColumn` (spacer for the fixed bar), the `TabBar` fixed-bar pattern, `useHideTabBar`, `useDocumentTitle`, `announce`, `useReducedEffects`, and motion tokens `winHold`/`winCollapse`/`reducedFade`. Add a `resultsTapGuard: 400` token.
- `i18n/catalogue.ts`:
  - Reuse `results.title`, `result.lossBand`, `result.draw`, `match.sourceNotAvailable`, `match.leftStatus`, `common.home`, `badge.bot`.
  - Add `result.winTitle`, `results.continue`, `results.heading.{win,loss,draw}` ("You won, {{you}} to {{them}}"), `results.dot.{correct,wrong,missed}`, `results.yours`, `results.answer`, `results.notAnswered`, `results.pending`, all with `signoff`.

## Tasks & Acceptance

**Execution:**
- [x] `contracts/**`: `Ranking` and its tests (clear win, correctCount tiebreak, full tie, forfeiter), `MatchEndedPayload` and its records, the `events` package, and samples. The wire contract comes first.
- [x] `services/game/.../match/domain/*` + tests: `responseMs`, `results()`, `q1StartedAt`, `questionSource` on the setup.
- [x] `services/game/.../match/application/*` + `platform/infrastructure/valkey/*` + tests: `MATCH_ENDED` send, event build, publisher port and adapter with retry, the counter.
- [x] `services/game/src/test/.../MatchEndFlowTest.java`: end to end over STOMP with the recording publisher, covering the win, forfeiter and all-gone rows.
- [x] `web/src/realtime/*` + `test-utils` + tests: parser, store, `sessionStorage`, ordering hold.
- [x] `web/src/screens/results/*`, `design/peak/*`, `LiveMatchScreen.tsx`, `catalogue.ts`, `tokens.ts` + tests: takeover, bands, dot strip, breakdown, focus, title, rehydrate, fallback, navigation.

**Acceptance Criteria:**
- Given `./mvnw verify`, when it runs, then every module passes, the ArchitectureTest included.
- Given `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check`, when it runs, then all pass and the initial JS stays ≤ 150 KB gzip.
- Given the running stack, a guest who beats the bot, when the last question closes, then the takeover plays and collapses into the results with the breakdown; a reload shows the same settled screen; and `XRANGE minnal.match.completed - +` in Valkey holds one entry for the match.

## Implementation Notes

- **Choices the spec left open:**
  - Contracts: `Ranking.placements(List<Standing>)` plus a generic overload over any items (score and correct-count extractors); competition ranking is "1 + how many rank strictly ahead". `BreakdownAnswer.missed()` is the unanswered slot (`correct: false, points: 0`, no pick or time). `MatchCompletedEvent.of(...)` mints the `eventId` and derives `rated`; `STREAM` and `PAYLOAD_FIELD` are constants on it. New samples: `match-ended.json` (3 questions, one with no attribution, one missed answer) and `match-completed.json` (a guest, so no `userId`). No new enum, so `enums.json` is unchanged.
  - game-service domain: `MatchState.results()` returns a new `MatchResults` record (asked questions, `q1StartedAt`, one entry per participant with `Optional` answers); it never reads the kind. `MatchSetup` gained `questionSource` with an 8-argument constructor that defaults to `BANK`, so existing callers and tests are unchanged; `MatchmakingActor` passes `BANK` explicitly.
  - game-service application: a package-private `MatchOutcome` builds both the `MATCH_ENDED` payload and the event from one `Ranking` call; it is the only place that maps the kind (for `userId`). `MatchActor.end()` runs `completed()` only when not failed, not aborted and Q1 was revealed; a throwing send or publisher is logged and never stops `onEnded` (the release). `MATCH_ENDED` goes out with `toPlayer` (every session of the `sub`). The actor keeps its old constructors (no-op publisher).
  - Publisher: `ValkeyEventsConfiguration` builds the bean from `ObjectProvider<StringRedisTemplate>`: the Valkey adapter when Redis is configured, else `LoggingMatchCompletedPublisher` (the `test` profile). This avoids `@ConditionalOnBean` ordering against Boot's auto-config. The adapter serialises with Boot's `JsonMapper` rebuilt to omit nulls, retries on its own daemon thread (1, 2, 4, 8 s) and, on close, lets queued work run for up to 5 s. `MatchMetrics.publishFailedCounter` registers `minnal.match.publish.failed` (description included) and the adapter increments the same meter.
  - Tests share a `RecordingMatchCompletedPublisher` (`@Primary`, in `TestClockConfiguration`), read by `matchId`. `MatchFlowTest` and `MatchReconnectFlowTest` now expect the `MATCH_ENDED` that follows a completed match.
  - Web store: `LiveMatch.ended: MatchEndedPayload | null` (non-optional, null until it arrives). `lastResult.save` writes the wire shape (nulls dropped), and `load` drops an entry that does not parse, whose `matchId` differs from its payload, or whose `selfId` is not a participant.
  - Hand-off: `/match` opens `/results` after `RESULTS_HOLD_MS` (2 s) from the completed outcome, once `ended` is in. **Added:** with no `MATCH_ENDED` by `MATCH_ENDED_WAIT_MS` (3 s) after the hold, it opens `/results` anyway on the minimal view (it upgrades in place if `MATCH_ENDED` still comes). Without it, a NOT_IN_MATCH settle would leave her on `/match` with no way forward, since the "match over" line is gone. The 1.9 "match over" line and its announcement are removed.
  - Results: the takeover plays once per match per page session (an in-memory set), only from a store arrival, never from storage, and never when she forfeited. Its bolt shows with the flood: the flood is the only flash, so there is no second strike inside the 1000 ms window. Tap, Continue or Esc dismisses it; the tap is handled on the dialog, which stops it there. The 400 ms guard is a capture-phase click/pointerdown blocker on the results surface. The action bar measures its own height and renders an in-flow spacer instead of using `--fixed-bar-height`: the tab bar's hide effect removes that variable after the results mount.
  - Breakdown rows never animate height, on any path. Correct rows render the details only when expanded. The time is rounded to 0.1 s ("4.2 s").
  - Volt pieces live in `design/peak/volt.tsx` (`VoltText`, `PeakBandSurface`, `TakeoverBolt`, `TAKEOVER_SURFACE`); `WinTakeover`, `ResultsBand`, `DotStrip` and `BreakdownRow` are in `screens/results/`, with `outcome.ts` reading win/loss/draw off the server's placements only.
  - Copy added beyond the spec's list, all drafted and flagged `signoff`: `results.dots` (the strip's list name), `results.questionShort` ("Q3"), `results.seconds`. `motion.resultsTapGuard` is a TS constant only (DESIGN.md has no CSS motion token for it, and `tokens.test` pins `motionTokens` to DESIGN.md).
- **Verified:**
  - `./mvnw verify` (no `clean`): BUILD SUCCESS, every module, ArchitectureTest included. Samples regenerated with `-Dcontracts.updateSamples=true`.
  - `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check`: all green, 578 tests, initial JS 127.2 KB of 150 KB.
- **Not done:** the manual checks (the browser runs against the bot, and `XRANGE minnal.match.completed - +` in Valkey). The Valkey adapter is covered only by the mocked `StreamOperations` test.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | verification-gap | `ValkeyEventsConfiguration` branch and its NON_NULL mapper are never run by a test | medium | patch | Pre-verified; the adapter test builds its own mapper and every context test takes the logging branch. |
| 2 | verification-gap | Esc dismissing the takeover is untested | low | patch | Pre-verified; `Escape` appears only in `WinTakeover.tsx`. |
| 3 | verification-gap | The NOT_IN_MATCH test lost its Back-guard assertion; nothing checks Back after the hand-off | medium | patch | Pre-verified; the `minnalGuard` assertion was removed from `ReconnectLeave.test.tsx`. |
| 4 | edge + blind | `close()` drops retries still pending after 5 s with no error log or counter | low | patch | `shutdownNow()`'s returned tasks are ignored; the backoffs add up to 15 s. Direct fix. |
| 5 | blind | The logging fallback could silently drop every event in a deployed profile | low | patch | The fallback is taken whenever no `StringRedisTemplate` exists, with only info logs; a one-time WARN at bean creation is a direct fix. |
| 6 | blind | Takeover focuses Continue while the dialog is still invisible (up to the flash window) | low | patch | `WinTakeover` focuses on mount, while opacity stays 0 until `requestFlash` runs. |
| 7 | blind | Response times show "4 s" next to "4.2 s" | low | patch | `results.seconds` has no minimum fraction digits; met on any whole-second answer. |
| 8 | blind | `MatchOutcome.placements()` is dead code | low | patch | No caller in main or test. Direct deletion. |
| 9 | blind | The bolt polygon is duplicated between `BoltStrike` and `volt.tsx` | low | patch | Identical `points` strings at BoltStrike.tsx:33 and volt.tsx:69. |
| 10 | blind | The deferred rematch entry has `source_spec: none` | low | patch | Fixed directly in `deferred-work.md`. |
| 11 | edge + blind | A serialisation failure is retried 5 times | low | reject | Unlikely: the event is a plain record; the fix restructures the retry. |
| 12 | edge | `hasSession` throwing stops the other sends and the event | low | reject | It is an in-memory map read; a throw is not shown to be reachable. |
| 13 | edge | The parser accepts a breakdown missing a participant | low | reject | The server builds one entry per participant by construction; the parser already rejects misaligned answers. |
| 14 | edge | `correct: true` with no `pickedIndex` | low | reject | The server never sends it (`BreakdownAnswer.missed()` is always false). |
| 15 | edge | A correct answer scoring 0 is shown in brick | false | reject | `Scoring.points` gives at least `BASE_POINTS` (500) for a correct answer. |
| 16 | edge | Back from `/results` lands on a dead `/match` | false | reject | The hand-off uses `navigate(..., {replace: true})` after the guard is popped, so `/match` leaves history; the guard path is covered by #3. |
| 17 | edge | The match-over announcement was removed | low | reject | The last reveal is still announced, and the results heading, which carries the result, is focused after the hold. |
| 18 | edge + blind | `match.over` is now an orphaned catalogue key | false | reject | `catalogue.test.ts:148` requires it as a Voice & Tone moment, so it stays. |
| 19 | blind | The `MatchSetup` short constructor defaults to BANK, which would rate a future CUSTOM match | low | reject | No CUSTOM caller until Epic 6; removing it touches every test caller. |
| 20 | blind | A forfeiter who reloads before the match ends goes Home | low | reject | Rare (a reload inside the remaining minute); the fix needs a new pending marker and an accept path. |
| 21 | blind | `correct` is computed twice (state and outcome) | low | reject | Same expression over the same data; no named divergence today. |
| 22 | blind | Missing tests: ML heading, MATCH_ENDED with no live match, a server-side invariant check, `Thread.sleep` in the no-duplicate checks | low | reject | The behaviour is covered elsewhere or the case is impossible by construction; no named harm. |
| 23 | blind | The breakdown list has no heading | low | reject | The list follows the labelled dot strip; it needs new copy. |
| 24 | blind | Spec status `in-review` while the manual checks are open; a duplicated "part 2" sentence | false | reject | Process state: manual checks are listed under Verification. Fixing it means editing the spec. |
| 25 | verification-gap (other) | Shutdown relies on the inferred `close()` destroy method | low | reject | Inference works on the instance's `AutoCloseable`; #4 handles the drop. |

## Verification

**Commands:**
- `./mvnw verify` -- expected: BUILD SUCCESS. Warn first if IntelliJ services are running; never `clean`.
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` -- expected: all green.

**Manual checks:**
- In the browser against the bot: win (takeover timing and tap guard), loss, a reload on `/results`, Leave at Q5 (minimal view upgrades to full), and the `XRANGE` in Valkey.

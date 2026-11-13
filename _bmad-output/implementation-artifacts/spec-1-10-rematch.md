---
title: 'Story 1.10 (part 2): Rematch'
type: 'feature'
created: '2026-11-13'
status: 'done'
baseline_commit: '37417aa25758efb8a2f0780b70473905eedff60e'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-10-results-and-rematch.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The results screen ends at Home. To play the same opponent again, a player has to queue and hope to be paired with them, and against the bot she has to wait for the 8 s bot fallback all over again. Story 1.10's rematch ACs (split off as part 2 on 2026-11-12) are unbuilt.

**Approach:**
- **Server:** when a completed 1v1 match ends, game-service opens a 60 s post-match window for it, outside the (closed) match actor.
  - Either human can request a rematch. A bot accepts at once, and a human opponent must request too.
  - When both have requested, a new match starts with the same mode and participants, a fresh `matchId` and a newly fetched question set, through the same start path as matchmaking.
  - Cancel, expiry and "unavailable" revert it.
- **Web:** the results action bar gains Rematch, with these states: waiting, accept and notes.

**Decisions:**
- **Where the window lives:** a `RematchCoordinator` in `matchmaking/application`, a single-threaded actor like the queue. It does not live in the `MatchActor`, which closes at end; keeping that actor alive would block drain for 60 s. It cannot live in `match..` either, because the ArchitectureTest bars `QuestionSetClient` there. `MatchRegistry.ended` publishes a Spring event for completed QUICK matches, and the coordinator listens for it.
- **Wire (amends AD-10):**
  - Client sends:
    - `/app/match/{id}/rematch` (exists);
    - new `/app/match/{id}/rematch/cancel`.
  - Server private messages (the types already exist in `MessageType`):
    - `REMATCH_REQUESTED {requestedBy: participantId, expiresAt}`, sent to both humans, so the requester gets her waiting state and the opponent gets "Accept rematch";
    - `REMATCH_DECLINED {reason: CANCELLED | UNAVAILABLE}`, sent to whoever must revert;
    - `REMATCH_EXPIRED {}`, sent to both.
  - The new match arrives as an ordinary `MATCH_FOUND`; `REMATCH_ACCEPTED` stays unused. A failed question fetch sends both the existing `MATCHMAKING_FAILED`.
- **Window timing (owner, 2026-11-13; resolves the contradiction with the re-send rule):** the window opens at the match end. A request, or a re-send, sets that requester's deadline to now + 60 s. A pending request that reaches its deadline expires (`REMATCH_EXPIRED`). The window closes only after 60 s with nothing pending, counted from the match end or from the moment the last request expired or was cancelled. It also closes once a rematch starts. So a re-send after an expiry works and starts a fresh 60 s.
- **Forfeiters (owner, 2026-11-13):** a human who forfeited or left the ended match may still request, or be asked for, a rematch, as long as she has a live session and is free (not queued or in another match).
- **Unavailable** (`REMATCH_DECLINED UNAVAILABLE` to the requester) when:
  - there is no open window for that match, or the sender wasn't one of its humans;
  - the opponent has no live session, or is now queued or in another match;
  - the requester herself is queued or in another match.
  - When a pending request becomes impossible because the opponent joins something else, the requester gets `UNAVAILABLE`.
- **Participation:** both humans are claimed (`Queued(mode)`) while the set is fetched, and `MatchRegistry.start` turns that into `InMatch`. On failure they are released.
- **Ratings:** the new match reuses each participant's rating from the old setup (the bot at its human's). `queueWaitMs` is 0.
- **Web:**
  - **Bar:** Rematch (primary) and Home (secondary), stacking when they don't fit. The minimal (no `MATCH_ENDED`) view keeps Home only.
  - **Waiting:** a 1.5px ink-outline card, "Waiting for <name>…" (`rematch.waiting`), a seconds count to `expiresAt`, and a Cancel text link with a 48 px hit area.
  - **Incoming:** when the opponent asked first, the button reads "Accept rematch".
  - **Notes:** one-line notes, each announced politely once: expired, cancelled by the opponent, unavailable, failed (`MATCHMAKING_FAILED`). After any of them Rematch can be sent again.
  - **New match:** on the new `MATCH_FOUND` the app goes straight to `/match`.
  - **Leaving:** Home, or leaving `/results`, sends a cancel when a request is pending.
  - **Copy:** new strings are drafted in both languages and flagged for sign-off.

## Boundaries & Constraints

**Always:**
- The coordinator alone owns window state, on its own thread. Timers only send it events. The question fetch runs off its thread, as matchmaking does.
- Starting a rematch reuses the matchmaking start path: an extracted shared helper for build → `MatchRegistry.start` → `MATCH_FOUND`, plus the draining path. The new matches count in the same metrics.
- One queue or match per `sub`, as today (`ParticipationRegistry`). Guests can rematch like registered players.
- Only QUICK matches open a window in this story. Topic Duel (Epic 4) and rooms (Epic 5) come later.
- The client computes nothing: every state comes from these server messages.
- Contracts first, with samples and parsers, as in earlier stories.

**Never:** Battle Room play-again, rating deltas, Share, or keeping the `MatchActor` alive after the end.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Bot | she taps Rematch within 60 s | the bot accepts at once; a fetch, then `MATCH_FOUND` (new id); her app opens `/match` | fetch fails → `MATCHMAKING_FAILED`, a note, Rematch again |
| Human, both | A requests, then B taps Accept rematch | B's button reads "Accept rematch" after A asks; on B's request the new match starts for both | — |
| Cancel | A cancels while waiting | A reverts; B gets `DECLINED CANCELLED` and a note | — |
| Expiry | A waits 60 s | both get `REMATCH_EXPIRED`; notes; A can re-send (a new 60 s) | — |
| Opponent gone | B closed the app, or joined Quick Match | A's request → `DECLINED UNAVAILABLE` | — |
| Late request | more than 60 s after the end with nothing pending, or an unknown match | `DECLINED UNAVAILABLE` | — |
| Home | A taps Home while waiting | cancel sent; Home with the tab bar | — |
| Draining | rematch while game-service drains | `ERROR SERVER_DRAINING`, a note | — |

</frozen-after-approval>

## Code Map

**Contracts** (`contracts/src/main/java/in/minnal/contracts/realtime/`):
- `MessageType`: add Javadoc to `REMATCH_REQUESTED`, `REMATCH_DECLINED` and `REMATCH_EXPIRED` (lines 26–29); keep `REMATCH_ACCEPTED`.
- New `RematchRequestedPayload`, `RematchDeclinedPayload` + `RematchDeclineReason`, and `RematchExpiredPayload` (empty).
- `Destinations`: add `MATCH_REMATCH_CANCEL` next to `MATCH_REMATCH` (:38).
- Samples via `RealtimeSamplesTest`, and add the new enum to `enumsJsonListsEveryEnumValue`.

**game-service** (`services/game/src/main/java/in/minnal/game/`):
- **`matchmaking/application/MatchmakingActor.java`:** extract the start half of `onSetFetched` (202–234: participants, humans, bot `Participant(…, Matchmaking.BOT_NAME, BOT)`, ratings, `matches.start`, the draining branch, `MATCH_FOUND` per human) and the failure branch (191–200) into a package-level helper, for example `MatchStarter`. The fetch itself is at 158–161 (`QuestionSetRequest(BANK, category("KERALA_PSC"), null, 10, sub)`).
- **`matchmaking/application/RematchCoordinator.java`** (new): the window map, the events (`Opened`, `Request`, `Cancel`, `Deadline`, `SetFetched`) and the rules above.
  - Uses `ParticipationRegistry` (`claim`/`release`/`activityOf`, G/platform/session) and `PlayerSessions.hasSession`.
  - Uses the shared starter and `PlayerChannel.toPlayer`.
  - Follows the `MatchmakingActor` actor and timers pattern.
- **`match/application/MatchRegistry.ended`** (199–224): for a completed QUICK match, publish e.g. `MatchCompletedForRematch(setup, forfeitedParticipantIds, endedAt)`. The forfeit flags come from `match.state().participants()` (MatchActor:458, package-private, so read them there).
- **`match/api/MatchController.java`** (36–53): `@MessageMapping` for `/match/{matchId}/rematch` and `/match/{matchId}/rematch/cancel`. Get the principal as `MatchmakingController.principal()` does (`MinnalAuthentication` → `MinnalPrincipal`). If the controller must not depend on `matchmaking`, route through a small port interface in `match.application` that the coordinator implements.
- **Tests:**
  - `RematchCoordinatorTest`, using fake timers and the channel/sessions/participation fakes: every matrix row.
  - `MatchmakingActorTest`: unchanged behaviour after the extraction.
  - New `RematchFlowTest`, modelled on `MatchEndFlowTest` with short windows: bot rematch end to end; human A+B; cancel; expiry with a short configurable window (`minnal.rematch.window`, default 60 s); unavailable.
  - ArchitectureTest stays green.

**Web** (`web/src/`):
- **`realtime/protocol.ts`:** parsers and `Incoming` arms for the three `REMATCH_*` types (they are listed at 18–21 and fall to `OTHER` today). Add `matchRematch(id)` and `matchRematchCancel(id)` send helpers next to `matchLeave`. Update `contract.test.ts`.
- **`realtime/liveGameStore.ts` + `connection.ts`:**
  - Add `rematch: {matchId, state: 'idle' | 'waiting' | 'incoming' | 'starting', expiresAt?, note?: 'expired' | 'cancelled' | 'unavailable' | 'failed' | 'draining'} | null`.
  - Add `requestRematch()` and `cancelRematch()`.
  - `MATCH_FOUND` (662–668) clears `rematch`. While a rematch is starting, `MATCHMAKING_FAILED` and `ERROR SERVER_DRAINING` become rematch notes, not the matchmaking problem.
- **`screens/results/ResultsScreen.tsx`:**
  - `ActionBar` (160) gets Rematch or Accept, or the waiting card, plus Home. Home and the unmount cancel a pending request.
  - On a new `MATCH_FOUND` while here: `navigate('/match', {replace})`.
  - Notes are announced politely once.
  - Add a new `RematchCard.tsx`.
- **`i18n/catalogue.ts`:** reuse `rematch.waiting` (411) and `common.cancel` (56). Add `rematch.request`, `rematch.accept`, `rematch.note.{expired,cancelled,unavailable,failed,draining}` and `rematch.secondsLeft`, all with `signoff`.
- **`test-utils/realtime.ts`:** builders for the three messages.

## Tasks & Acceptance

**Execution:**
- [x] `contracts/**`: payloads, the decline reason, the cancel destination, samples.
- [x] `services/game/.../matchmaking/application/*`: extract the shared starter (behaviour unchanged, existing tests green), then `RematchCoordinator` + tests.
- [x] `services/game/.../match/application/MatchRegistry.java`, `match/api/MatchController.java`: the completed-match event, the two mappings.
- [x] `services/game/src/test/.../RematchFlowTest.java`: end to end over STOMP for every server row of the matrix.
- [x] `web/src/realtime/*` + `test-utils` + tests: parsers, store, actions, `MATCH_FOUND`/failure handling.
- [x] `web/src/screens/results/*` + `i18n/catalogue.ts` + tests: the bar states, waiting card with countdown and Cancel, Accept, notes and announcements, Home cancel, navigation on the new match.

**Acceptance Criteria:**
- Given `./mvnw verify`, when it runs, then every module passes, the ArchitectureTest included.
- Given `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check`, when it runs, then everything passes and the initial JS stays ≤ 150 KB gzip.
- Given CI on the pushed branch, when it runs, then `backend`, `web` and `compose` are green.
- Given the running stack, a guest who finishes against the bot, when she taps Rematch, then a new match against the bot starts within the lead-in.

## Implementation Notes

- **Choices the spec left open:**
  - Contracts: `RematchRequestedPayload`, `RematchDeclinedPayload` + `RematchDeclineReason`, empty `RematchExpiredPayload` (serialised `{}`); `Destinations.MATCH_REMATCH_CANCEL` plus `matchRematch(id)`/`matchRematchCancel(id)` helpers. Samples: `rematch-requested.json`, `rematch-declined.json`, `rematch-declined-unavailable.json`, `rematch-expired.json`; `enums.json` gains `RematchDeclineReason`. All `REMATCH_*` go out as `ServerMessage.aboutMatch` (the ended match's id, no `seq`).
  - game-service: `MatchStarter` (package-private, `matchmaking.application`) holds the shared build → `MatchRegistry.start` → `MATCH_FOUND` path, the draining branch and the fetch-failure branch, plus the Quick Match question-set request. `MatchmakingActor` now delegates to it (behaviour unchanged; `MatchmakingFlowTest` and `DrainingTest` green). There is no `MatchmakingActorTest` in the repo, so the flow tests are the regression net.
  - `MatchRegistry.ended` publishes `MatchCompletedForRematch(setup, forfeitedParticipantIds, endedAt)` (a Spring event, after the release) for a completed, non-failed, non-aborted QUICK match. A second constructor takes the `ApplicationEventPublisher`; the old one is kept (no-op) for the unit tests.
  - `RematchRequests` is a port in `match.application`; `RematchCoordinator` implements it, so `MatchController` does not depend on `matchmaking`. The controller reads the `sub` with `user.getName()`, like its other mappings.
  - Coordinator rules beyond the spec's list: a request while the new match's set is being fetched is ignored; a pending request also reverts the other side when its requester's last session closes or she joins matchmaking (`MatchmakingService.join` tells the coordinator after a successful claim); starting a rematch withdraws any other window's pending requests involving its humans. Forfeiters are treated like anyone else (owner, 2026-11-13): `forfeitedParticipantIds` is still carried on the event but no rule reads it. Each request's deadline uses the shared `MatchTimers`; a re-send gets a new token so the old deadline is stale.
  - During the set fetch: a cancel from one of the humans, or a human with no live session when the set arrives, calls the start off. Both claims are released, the other human gets `REMATCH_DECLINED CANCELLED` (or `UNAVAILABLE`), nobody gets `MATCH_FOUND`, and the window starts a new idle period. On the web, her own `REMATCH_REQUESTED` echo moves her to `waiting` only while her state is `starting`; an echo after a local cancel is ignored.
  - Window timing (owner, 2026-11-13): the window runs numbered idle periods. One starts at the match end and again whenever it goes from "something pending or starting" to "nothing pending" (an expiry, a cancel, a withdrawal or unavailable revert, a failed fetch). A request stops the current one (its `WindowOver` timer becomes stale). When an idle period's 60 s pass with nothing pending, the window closes. A re-send after `REMATCH_EXPIRED` therefore works and starts a fresh 60 s; a decline that changes nothing (e.g. the opponent is busy) does not extend the window.
  - Rematch matches do not record queue-wait or pairing metrics (`queueWaitMs` 0 would skew the median and the bot-fill rate); they count in the match metrics (ended/aborted/failed) through `MatchRegistry`.
  - Web: `rematch: {matchId, state, expiresAt?, note?}` in the store; `requestRematch(matchId)` (opens the socket if needed, e.g. after a reload) and `cancelRematch()`. Her participant id for a `REMATCH_REQUESTED` comes from the live match, else the stored result. A dropped socket with a rematch under way reverts it with the `unavailable` note. `/results` remembers the match it shows at mount; a different live match with no outcome (the new `MATCH_FOUND`) opens `/match` with `replace`. The waiting card has `min-w-[min(14rem,100%)]` so it stacks above Home on narrow screens. "Accept rematch" is announced once when it appears. Focus follows the swap between the Rematch button and the waiting card's Cancel.
  - Copy added (all `signoff` in both languages): `rematch.request`, `rematch.accept`, `rematch.secondsLeft`, `rematch.note.{expired,cancelled,unavailable,failed,draining}`; `rematch.note.cancelled` names the opponent.
- **Resolved by the owner (2026-11-13):** the re-send-after-expiry contradiction and the forfeiter rule; both now follow the frozen Decisions. Tests: `RematchCoordinatorTest` (re-send after expiry past the end + 60 s then accepted; 60 s idle after an expiry or cancel closes it; a forfeiter requests and is asked, human and bot) and `RematchFlowTest` (request → expiry → re-send → accepted).

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | edge + blind | A cancel (or Home) while the new match's set is being fetched is dropped, so she is still pulled into the match | medium | patch | `RematchCoordinator.onCancel` ignores a `starting()` window; `onSetFetched` then starts. Against the bot this happens whenever she taps Home within the fetch. |
| 2 | edge + blind | A late self-echo of `REMATCH_REQUESTED` after a local cancel sets `waiting` again, stuck at 0 s | medium | patch | The `connection.ts` handler sets `waiting` for `requestedBy === self` whatever the local state; the server already withdrew the request, so no expiry follows. |
| 3 | edge + blind | A human whose last session closes during the fetch is still started | low | patch | `optOut` skips `starting` windows and `onSetFetched` never re-checks `hasSession`; the opponent then plays a ghost until the grace forfeit. Same fix site as #1. |
| 4 | verification-gap | Leaving `/results` another way while waiting is not tested to send a cancel | medium | patch | Pre-verified; removing the unmount effect keeps every test green. |
| 5 | verification-gap | The countdown is tested only with a zero clock offset | low | patch | Pre-verified; a sign flip on `clockOffsetMs` would pass. |
| 6 | verification-gap | Nothing asserts that the queue wait reaches the setup after the `MatchStarter` extraction | medium | patch | Pre-verified; passing 0 keeps every test green, and the value feeds `minnal.match.completed`. |
| 7 | verification-gap + blind | Starting a rematch withdrawing other windows' requests is untested | low | patch | Pre-verified; deleting the `optOut` loop in `start` keeps tests green. |
| 8 | verification-gap | The `LastSessionClosed` listener wiring is untested end to end | low | patch | Pre-verified; the unit test calls the method directly. |
| 9 | blind | The window closes silently; Rematch stays offered and later taps get "unavailable" | low | reject | The note is accurate and the spec's matrix covers late requests; a close message adds wire surface. |
| 10 | blind | Rematch state is lost on reload; `connectionLost` reverts even if another tab keeps a session | low | reject | Rare (reload or a second tab within the window); fixing it needs a rematch resync path. |
| 11 | edge + blind | A busy opponent's own pending request, or the non-claimed human in the `!allFree` race, is not told | low | reject | A busy human has already left results (queued or in another match), so a stale card isn't shown to her. |
| 12 | edge | `starter.start` throwing, or a null `sub`, leaks the `Queued` claims | false | reject | `subByParticipant` comes from the same `setup.humans()` that built the participants; no throwing path is shown. |
| 13 | edge + verification-gap (other) | A Rematch tap could reach the coordinator before `Opened` | low | reject | `Opened` is queued synchronously in `ended`, before any client round trip completes. |
| 14 | edge | Leaving in the `incoming` state leaves the requester waiting 60 s | low | reject | She gets the expiry note; telling her sooner needs a new decline path. |
| 15 | edge | A late `REMATCH_DECLINED` on an idle rematch shows a stale note | low | reject | Only after her own cancel, and the server sends a decline only to the other side. |
| 16 | edge | Bot rating uses the human's rating | false | reject | This matches the spec ("the bot at its human's"). |
| 17 | blind | No countdown on the incoming side; no visible "starting" text against the bot | low | reject | Not required by the intent; a cosmetic addition. |
| 18 | blind | No rematch-specific metrics; the log uses an unborn match id; the shared log text changed | low | reject | No named harm; logs carry `rematchOf` context elsewhere. |
| 19 | blind | AD-10 in the architecture doc is not amended for the new wire | low | defer | A planning-doc edit, out of the code diff. |
| 20 | blind | `forfeitedParticipantIds` is dead data; there is a test-only constructor; test helpers duplicate send paths; naming and qualified-import nits | low | reject | No harm today; churn without benefit. |
| 21 | blind | ml `rematch.note.cancelled` separator; empty rival name | low | reject | All new copy is flagged for native sign-off; a 1v1 result always has a rival. |

## Verification

**Commands:**
- `./mvnw verify` -- expected: BUILD SUCCESS. Warn first if IntelliJ services are running; never `clean`.
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` -- expected: all green.

**Manual checks:**
- Against the bot: Rematch → new match. Two windows as two guests (normal + incognito, Quick Match within 8 s): Rematch on one, "Accept rematch" on the other → new match; then Cancel; then a 60 s wait (expiry note).

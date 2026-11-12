---
title: 'Story 1.9: Reconnect, forfeit and leave'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: '2382d0f38a8a14cfbb116327c51d29a6b684497f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-11-instant-1v1-feedback-and-early-close.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A dropped socket mid-match does nothing today: the client sits on a dead screen, the server never forfeits her, and a match whose humans have all gone keeps running out its timers. There is no way to leave on purpose, and nothing tells a player that her opponent left or that a match was abandoned.

**Approach:** On the server, the match actor gets a 10 s reconnect grace, forfeit (after the grace, or at once on `/leave`), reconnect via `resync` → private `SNAPSHOT`, abort before the Q1 reveal, and an immediate finish once every human has gone after it. On the web, the connection module reconnects automatically, buffers broadcasts until the `SNAPSHOT`, and resyncs on a `seq` gap. The live screen gets the reconnect banner, a Leave button with its confirm dialog, the forfeited, opponent-left and aborted notices, and a minimal `/results` view.

**Decisions (made in planning; the user would not see them, or they follow the UX docs):**
- **Two new broadcasts** (they amend the AD-10 type list): `PARTICIPANT_FORFEITED {participantId, questionIndex}` and `MATCH_ABORTED {reason: ALL_LEFT | ERROR}`. Both carry `seq`. `ERROR` covers the deferred "the match ended on a handler exception" notice.
- **Reconnect** = a fresh STOMP CONNECT with a fresh token, then subscribe to the private queue and the match topic, then send `/app/match/{id}/resync`, which the server answers with a `SNAPSHOT` to that session. Any new session of a `sub` in a match also tells the actor `Reconnected`, which marks her CONNECTED and cancels the grace.
- **Release on forfeit:** a forfeited `sub` is released from `IN_MATCH`, so she can queue again from Home at once.
- **Gave up locally:** when the client's ring reaches 0, it treats her as forfeited (shows the notice, then `/results`). If the socket comes back afterwards, it sends `leave` instead of `resync`.
- **Leave placement:** a quiet "Leave" text button sits at the end of the score strip row (48 px hit area). Android back during the live match opens the same dialog.
- **Minimal `/results`** (replaced by Story 1.10): it reads `outcome` from the store only and shows each participant's name and score, with the own row marked, plus a Home button. With no outcome in the store it redirects Home.
- **New copy** is drafted in both languages and flagged for native review: Leave, Stay, opponent left, aborted, the results heading. The Forfeited copy and the leave-confirm title are already in the catalogue.

## Boundaries & Constraints

**Always:**
- Everything changes on the actor thread, as `MatchEvent`s. Timers only `tell`. No I/O between Q1 and the end (the architecture test stays green).
- A player is `DISCONNECTED` only when her last session closes, and that alone arms the 10 s grace. Reconnecting inside the grace cancels it. The grace timer carries an epoch, so a stale timer is a no-op.
- Forfeit (grace expiry or `leave`; idempotent): set `forfeited`, keep the answers already recorded (the earned score), broadcast `PARTICIPANT_FORFEITED`, release her `IN_MATCH`. Later answers from her get `ANSWER_REJECTED`. Then re-check `allAnswered()` and close early if it holds. `allAnswered()` is false when no non-forfeited participant remains.
- After a forfeit, if every human is forfeited:
  - before the Q1 reveal: broadcast `MATCH_ABORTED{ALL_LEFT}`, increment the `minnal.match.aborted` counter, end (no results, nothing published);
  - after it: close the open question at once (as an early close), score the remaining questions 0 without timers (no further `QUESTION_STARTED`), end as completed, and increment `minnal.match.ended` (now meaning completed).
- A handler exception broadcasts `MATCH_ABORTED{ERROR}` before ending (it still counts as `failed`).
- `SNAPSHOT` is a private reply with `refSeq = lastSeq`: `{phase: LEAD_IN|QUESTION_OPEN|REVEAL|ENDED, questionIndex, total, question?, startedAt?, deadline?, lastReveal?, answered[], scores[{participantId, score, forfeited}], participants, youForfeited, myAnswer?}`.
  - `question`, `startedAt` and `deadline` are present only while a question is open.
  - `lastReveal` is the last `QUESTION_REVEALED` payload.
  - `myAnswer` is present when she has an accepted answer to the open question: `{pickedIndex}` always, plus `correct`, `points`, `answerIndex` and `totalScore` in 1v1 modes.
  - No other participant's pick, and no answer or explanation for the open question, ever appears in it (AD-5).
- `resync` for a match she isn't in, or one that has ended, gets `ERROR NOT_IN_MATCH`. `leave` from a non-participant is ignored. Both go through the existing rate limiter and the auth interceptor; a reconnect with an expired or invalid token is refused at CONNECT, as today.
- Client:
  - Only the connection module writes the store.
  - While `reconnecting`, it buffers topic frames. When the `SNAPSHOT` arrives it replaces the match state, drops buffered frames with `seq ≤ refSeq` and applies the rest in order.
  - After that, any `seq` gap (`seq > lastSeq + 1`) sends one `resync` and buffers until the next `SNAPSHOT`. Duplicates (`seq ≤ lastSeq`) are dropped.
  - The countdown never pauses.
- Accessibility: the banner start is announced once on the assertive channel, its end once politely, with nothing per second. Forfeited, opponent-left and aborted are each announced politely once. While the banner or the dialog shows, the content below is `inert` and `aria-hidden` and dimmed 42%. The banner is monochrome and never flashes.

**Never:**
- `MATCH_ENDED`, `POST_MATCH`, `minnal.match.completed` publishing, the full results screen, rematch (all Story 1.10).
- Surviving a page reload mid-match (no sessionStorage of live state).
- The matchmaking per-session queue item (stays deferred).
- A pause of the server timer; client-side scoring; announcements per second.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Two tabs | one of two sessions closes | stays CONNECTED, keeps broadcasts | — |
| Blip | last session drops at Q4, back at 6 s, resyncs | grace cancelled; `SNAPSHOT` at Q4 with deadline and scores; can answer if open and unanswered; 1v1 `myAnswer` restores her band | — |
| Grace expires | 10 s with no session | `PARTICIPANT_FORFEITED`; the opponent sees the "opponent left" notice and keeps playing; questions close early once the opponent answers | her later reconnect: `SNAPSHOT youForfeited=true`; her answers are rejected |
| Leave | confirm Leave at Q3 | forfeited at once; her client goes to `/results` with her earned score | no reply within 3 s → `/results` anyway |
| Abort | guest vs bot, she leaves before the Q1 reveal | `MATCH_ABORTED{ALL_LEFT}`, aborted counter +1; her client goes Home with the aborted notice | — |
| All gone after Q1 | the only human forfeits at Q5 | Q5 closes at once and the match ends as completed right away; completed counter +1 | — |
| Gap | client has `seq` 7, receives 9 | sends one `resync`, buffers, applies the `SNAPSHOT`, then the buffered frames with `seq > refSeq` | — |
| Out of order | during reconnect, topic 12 and 13 arrive before `SNAPSHOT refSeq=12` | 12 dropped, 13 applied after the snapshot | — |
| Local give-up | ring reaches 0 while still offline | Forfeited notice, then `/results`; if the socket returns, sends `leave` | — |
| Handler error | exception in the actor | `MATCH_ABORTED{ERROR}`; clients go Home with the aborted notice | `failed` counter as today |

</frozen-after-approval>

## Code Map

**Contracts** (`contracts/src/main/java/in/minnal/contracts/realtime/`):
- `MessageType`: add `PARTICIPANT_FORFEITED` and `MATCH_ABORTED`. `SNAPSHOT` already exists.
- New records:
  - `SnapshotPayload`, `SnapshotPhase`, `ParticipantScore`, `MyAnswer` (nullable result fields, `withResult`/`receipt` factories like `AnswerAcceptedPayload`);
  - `ParticipantForfeitedPayload`;
  - `MatchAbortedPayload` + `AbortReason`.
- `Destinations` already has `MATCH_RESYNC` and `MATCH_LEAVE`.
- Golden samples through `RealtimeSamplesTest` (`-Dcontracts.updateSamples=true`).

**game-service** (`services/game/src/main/java/in/minnal/game/`):
- `match/application/MatchEvent.java`: add `Reconnected(sub)`, `GraceExpired(sub, epoch)`, `Leave(sub)`, `Resync(sub, sessionId)`.
- `match/application/MatchActor.java`:
  - `Disconnect` today only calls `state::disconnect`; arm the grace there, with a `grace` setting (10 s) on `MatchSettings` and `application*.yaml`.
  - `handle`'s catch → broadcast the ERROR abort.
  - `isCompleted()` becomes "Q1 revealed".
  - `closeEarly()` is reused for the forfeit re-check.
  - After a Q1+ all-gone: loop `closeWindow` with no timers.
  - Grace timers must be in `pending` so that `close()` cancels them.
- `match/domain/MatchState.java`:
  - `forfeit(participantId, now) → Optional<broadcast>`;
  - `reconnect`;
  - `answer` rejects forfeited senders;
  - `allAnswered` handles all-forfeited;
  - `snapshot(participantId, now)`;
  - keep `lastReveal`;
  - `humansAllForfeited()`, `q1Revealed()`.
  - `MatchParticipant.forfeit()`/`connection()` stay package-private (used by `MatchState`).
- `match/application/MatchRegistry.java`:
  - `resync(sub, sessionId, matchId)` and `leave(sub, matchId)` route to the actor or reply `NOT_IN_MATCH`;
  - add an `@EventListener` for a new `platform/session/SessionOpened(sub)`, published by `PlayerSessions.connected` when a session opens, which tells the match `Reconnected`;
  - `ended`: the completed/aborted/failed counters;
  - releasing on forfeit happens through a callback from the actor (`participation.release(sub, InMatch)`).
- `match/application/MatchMetrics.java`: add the `ABORTED = "minnal.match.aborted"` counter; update the `ENDED` description.
- `match/api/MatchController.java`: `@MessageMapping` for `/match/{matchId}/resync` and `/match/{matchId}/leave`.
- Tests:
  - `MatchStateTest` (N = 2 and N = 5);
  - `MatchActorTest` (via `MatchTestKit` fake timers);
  - `MatchRegistryTest`, `PlayerSessionsTest`;
  - a new `MatchReconnectFlowTest` (two `StompTestClient`s: drop, reconnect + resync → `SNAPSHOT`, grace forfeit, leave, abort, an expired-token reconnect refused). Reuse the `@TestPropertySource` short-window pattern from `MatchEarlyCloseFlowTest`, with a short grace (e.g. 1 s).

**Web** (`web/src/`):
- `realtime/protocol.ts`: parsers for `SNAPSHOT`, `PARTICIPANT_FORFEITED` and `MATCH_ABORTED`; add them to `Incoming`/`parseIncoming` (:298–310); add the `matchResync`/`matchLeave` helpers next to `matchAnswer` (:152–157). `contract.test.ts` + samples.
- `realtime/liveGameStore.ts`: `LiveMatch` gains `connection: 'live' | 'reconnecting'`, `reconnectDeadline` (client ms), `forfeited: Set|ids`, `outcome?: {kind: 'forfeited'|'left'|'aborted'|'completed', scores}`.
- `realtime/connection.ts`:
  - `onWebSocketClose` (:301) mid-match → `reconnecting`, then retry with backoff (e.g. 0.5/1/2 s) through `open()` (which fetches a fresh token); the `generation` guard is kept.
  - `onConnect` re-subscribes and sends `resync`, or `leave` after a local give-up.
  - Replace `acceptBroadcast` (:131) with a buffer/apply/gap function.
  - Add `leaveMatch()`.
  - `submitAnswer` is refused while reconnecting.
- `test-utils/realtime.ts`: `snapshot()`, `participantForfeited()` and `matchAborted()` builders. `FakeStomp.drop()` exists, and reconnects appear as `clients[n]`.
- `screens/match/`:
  - `ReconnectBanner.tsx` (new): a 40 px ring driven by `reconnectDeadline`, replacing the `TimerBar` (:160);
  - `LeaveDialog.tsx` (new): `role="alertdialog"`, focus on Stay, Esc = Stay, focus back to the question heading;
  - `LiveMatchScreen.tsx`: Leave button, `inert` + dim wrapper below the timer, notices, navigation (`shell/router.ts` `navigate`), an Android-back guard (push a history entry on mount; `popstate` → open the dialog);
  - `ScoreStrip`: a "left" state for a forfeited opponent.
- `screens/results/ResultsScreen.tsx` (new, minimal) + a route in `App.tsx` (:12–20).
- `design/Button.tsx`: add a `danger-text` (brick text) variant.
- `i18n/catalogue.ts`: `match.leave`, `match.stay`, `match.opponentLeft`, `match.aborted`, `results.title`. The existing `match.reconnecting` (:316), `match.forfeited` (:322) and `match.leaveConfirm` (:328) are kept.
- `shell/announce.ts`: `announce(text, {assertive: true})` for the reconnect start.

## Tasks & Acceptance

**Execution:**
- [x] `contracts/**` -- new types, payloads and samples, with round-trip and drift tests -- the wire contract first.
- [x] `services/game/.../match/domain/*` + tests -- forfeit, reconnect, snapshot, reject forfeited answers, `allAnswered` edge cases, completion rule; N = 2 and N = 5.
- [x] `services/game/.../match/application/*`, `platform/session/*`, `match/api/MatchController.java` + tests -- grace timers with epochs, leave, resync, abort and all-gone finish, ERROR abort, release on forfeit, counters.
- [x] `services/game/src/test/.../MatchReconnectFlowTest.java` -- end-to-end over STOMP for every server row of the matrix, plus an expired-token reconnect refused.
- [x] `web/src/realtime/*` + `test-utils/realtime.ts` + tests -- parsers, store fields, reconnect loop, buffer/gap/resync (out-of-order and gapped sequences), leave, local give-up.
- [x] `web/src/screens/match/*`, `screens/results/*`, `App.tsx`, `design/Button.tsx`, `i18n/catalogue.ts` + tests -- banner, dialog, notices, announcements, inert/dim, back guard, minimal results.

**Acceptance Criteria:**
- Given `./mvnw verify`, when it runs, then every module passes, the architecture test included.
- Given `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check`, when it runs, then everything passes and the initial JS stays ≤ 150 KB gzip.
- Given the running stack and a guest vs the bot, when she toggles the network off for 5 s at Q3 and back on, then the banner counts down, she resumes on the open question with her score, and the opponent's game was never paused.

## Implementation Notes

- **Choices the spec left open:**
  - Contracts: `SnapshotPayload`, `SnapshotPhase`, `ParticipantScore`, `MyAnswer` (`receipt`/`withResult`), `ParticipantForfeitedPayload`, `MatchAbortedPayload` + `AbortReason`. `PARTICIPANT_FORFEITED` and `MATCH_ABORTED` are appended at the end of `MessageType`. New samples: `snapshot.json` (open, 1v1 `myAnswer`), `snapshot-forfeited.json` (REVEAL, `youForfeited`), `participant-forfeited.json`, `match-aborted.json`; `enums.json` now also lists `SnapshotPhase` and `AbortReason`.
  - `MatchSettings` gained `grace` (`minnal.match.grace`, default 10 s); the old 4-argument constructor stays and defaults it.
  - Finishing after the Q1 reveal (`MatchState.finishNow`) closes the open question with a normal `QUESTION_REVEALED`, then marks the match `ENDED` with no reveal for the questions that never opened: their answers are never broadcast (AD-5), and the unanswered slots already score 0. It does not loop `closeWindow` over unasked questions.
  - Completion counting: `MatchActor.isCompleted()` is "Q1 revealed"; the actor also tracks `isAborted()` and `isFailed()`. The registry counts `failed` first, then `aborted`, then `ended` (completed). A handler error after Q1 still counts as `failed`.
  - The grace timer carries a per-`sub` epoch, is added to `pending`, and is also cancelled on a reconnect. When it fires, the actor checks `PlayerSessions.hasSession(sub)` (an in-memory read) in case a new session raced the disconnect; then it treats her as reconnected instead of forfeiting. `Resync` also marks her connected.
  - `PlayerSessions.connected` publishes `SessionOpened` only for a session it had not seen.
  - A `Resync` that reaches an actor that has just ended gets `NOT_IN_MATCH` from the actor itself.
  - Web store: `forfeited` is a `string[]`. `outcome = {kind, scores[{participantId, score}]}`. Her own score includes an accepted 1v1 answer to the still-open question (the ack's `totalScore`); otherwise the scores are the last totals. An abort replaces any outcome; the other kinds never replace one. The last reveal sets `completed`.
  - Web connection: retries at 0.5 / 1 / 2 / 2… s for up to 2 min after the drop (long enough to deliver a `leave` after a local give-up). A `NOT_IN_MATCH` in reply to the resync settles the match as `completed` if Q1 was revealed, else `aborted`.
  - Screen: Forfeited shows its notice for 2 s (`FORFEIT_NOTICE_MS`), then `/results`. Leave goes to `/results` at once (or after 3 s with no reply). An abort announces itself and goes Home, and `GuestHome` shows the one-line notice until the next search. If an abort lands on `/results` (Leave before the Q1 reveal), `/results` announces it and goes Home. An outcome that already existed when `/match` mounted does not navigate again (so Back from `/results` cannot loop). The TimerBar is hidden, not unmounted, while the banner shows, so the countdown and its 5 s cue state carry on. The Back guard pushes one duplicate `/match` history entry while the match is in play.
  - Two strings were added beyond the spec's list, both drafted and flagged for review: `match.reconnected` (the polite end-of-reconnect announcement) and `match.leftStatus` (the score strip's "left").
  - `Button` `danger-text` keeps its classes in a `DANGER_TEXT` constant so that `check:dist` doesn't read the variant name as a utility class. The dialog uses `inset-[0]` because the spacing scale has no `0` step.
- **Verified:**
  - `./mvnw verify` (no `clean`): BUILD SUCCESS, every module passes, ArchitectureTest included. Contracts samples were regenerated with `-Dcontracts.updateSamples=true`.
  - `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check`: all green, 535 tests, initial JS 123.4 KB of 150 KB.
- **Review patches (triage rows 1–9):**
  - The NOT_IN_MATCH settle now applies held frames with `seq > lastSeq` first and sets `phase: 'ended'` with the outcome.
  - Every `resync` arms a 3 s retry (`RESYNC_RETRY_MS`) until a SNAPSHOT arrives.
  - `joinQuickMatch` queues a pending `leave` before the join.
  - The Back-guard entry carries a `minnalGuard` marker and is popped once when play ends without navigation.
  - `snapshot-forfeited.json` now uses a Q3 reveal fixture.
  - The `SnapshotPayload` and `protocol.ts` docs state the 1v1 own-result exception.
  - Tests added for leave while offline, the open-ack outcome score, the completed settle (store and screen), the held-frame replay, the resync retry, the join after a give-up, and Back after a normal end. Web: 543 tests green.
- **Not done:** the manual browser checks (network blip at Q3, Leave at Q5, Leave before the Q1 reveal, offline for more than 10 s, two tabs).

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | verification-gap | Leave while offline (`pendingLeave` from `leaveMatch`/`startReconnect`) is untested | medium | patch | Pre-verified; every `leaveMatch` test runs on an open socket. |
| 2 | verification-gap | The outcome score with an accepted 1v1 answer to the open question is untested | medium | patch | Pre-verified; no test locks an open answer before an outcome. |
| 3 | verification-gap | The `completed` branch of NOT_IN_MATCH after a resync is untested | medium | patch | Pre-verified; the only test covers `aborted`. |
| 4 | verification-gap (other) + edge | A NOT_IN_MATCH settle as `completed` leaves `/match` stuck; buffered frames (e.g. the final reveal) are discarded first | medium | patch | `connection.ts` ERROR case sets `outcome` without `phase: 'ended'`; `inPlay` false hides Leave, `match-over` needs `phase === 'ended'`, the effect navigates only for aborted/left/forfeited. `buffer = []` drops held frames before `finish`. |
| 5 | verification-gap (other) + edge + blind | A gap resync with no reply freezes the client (buffering forever, answers refused) | medium | patch | `onTopic` sends one `resync`; nothing re-sends it. A RATE_LIMITED reply or a resync queued as the actor closes (`close()` drops queued events) leaves `awaitingSnapshot` true. |
| 6 | edge | After a local give-up, Quick Match before the socket returns clears `pendingLeave`; the leave is never sent | medium | patch | `joinQuickMatch` calls `resetResilience()` when an outcome exists; the new session then cancels the server grace (`SessionOpened`), so join gets ALREADY_IN_MATCH. |
| 7 | edge + blind | The Back-guard history entry stays after a normal end; the first Back does nothing | low | patch | `LiveMatchScreen` pushes a duplicate entry on mount and never removes it; met on every completed match. |
| 8 | blind | `snapshot-forfeited.json` has `phase REVEAL`, `questionIndex 3` and `lastReveal.questionIndex 2` (impossible) | low | patch | Checked the sample: REVEAL 3 / 2. Direct fixture correction. |
| 9 | blind | `SnapshotPayload` Javadoc says the open question's answer never appears, yet the 1v1 `myAnswer.answerIndex` carries it | low | patch | `SnapshotPayload.java:10`; the 1v1 own result is the AD-5 exception from Story 1.11. Doc fix only. |
| 10 | blind | A silent network drop is detected only at the heartbeat timeout, so the server forfeit comes at about heartbeat + 10 s | medium | defer | Real for silent drops (all flow tests use a clean close); the fix is heartbeat/transport tuning beyond this story. The client still sends `leave` when it returns. |
| 11 | verification-gap (other) | `SessionOpened` → `Reconnected` has no independent test | low | reject | Nothing reads `connection()` for decisions; the grace-expiry `hasSession` check covers it in effect. |
| 12 | edge | Forfeited by grace, then the match ended before her resync: the client records `completed` | low | reject | Needs a reconnect inside her local 10 s while the match ends inside the same window; the fix needs tombstone state on the server. |
| 13 | edge | A tombstoned match never answers a SNAPSHOT `ENDED` | low | reject | Final standings are `MATCH_ENDED` in Story 1.10; NOT_IN_MATCH is the spec's reply. |
| 14 | edge | One session's failed snapshot send aborts the match for everyone | maybe-false | reject | `StompPlayerChannel` sends are not shown to throw; it would only be low if real. |
| 15 | edge | A repeated Disconnect re-arms and extends the grace | false | reject | `LastSessionClosed` fires once per last-session close; a second needs a reconnect, and resetting the grace then is the spec. |
| 16 | blind | A flapping connection (reconnect before resync, repeat) can extend the grace indefinitely | low | reject | Each is a real reconnect, which by spec resets the grace; a cap adds new rules and the case is unusual. |
| 17 | edge | `minnal.match.grace` of zero/negative/null is not validated | low | reject | Operator config with a 10 s default; not met in normal use. |
| 18 | edge + blind | `reconnectDeadline` uses `Date.now()` while other timing uses `env.now()`; ring and give-up can drift under throttling | low | reject | In production `env.now` is `Date.now`; the drift is cosmetic (the ring shows 0 slightly before the notice). |
| 19 | blind | The client grace is hard-coded (10 s) while the server's is configurable | low | reject | Both are 10 s in every deployed config; putting it in the contract is a new surface. |
| 20 | blind | After confirming Leave the options look tappable for up to 3 s | low | reject | The server's PARTICIPANT_FORFEITED normally arrives within milliseconds; taps are dropped safely; a fix needs a new store field. |
| 21 | blind | No forfeit/reconnect/resync counters; grace log lines lack a participant id | low | reject | Not required by the intent; no harm named beyond tracing convenience. |
| 22 | blind | Wall-clock bounds and `Thread.sleep` in the new tests may flake on loaded CI | maybe-false | reject | Margins are 2x or more; would only be low if real. |
| 23 | blind | The handler-error row is not covered end to end; a lead-in forfeit reports `questionIndex` 0 | low | reject | Covered at actor, registry and screen level; the client does not read the forfeit index. |
| 24 | blind | The spec says in-review while sprint-status says in-progress; AC3 is manual | false | reject | Sprint status moves to review at the presentation step; AC3 is listed in Verification as a manual check. |

## Design Notes

- **Why reconnect is client-pulled (`resync`) rather than pushed at CONNECT:** the server can't know when the new session has subscribed to `/user/queue/game`, so a pushed `SNAPSHOT` could be lost. One `resync` path then serves both reconnect and gap recovery.
- **Why release on forfeit:** a forfeited player can never act in that match again, and keeping her `IN_MATCH` would block Quick Match from Home with `ALREADY_IN_MATCH` for up to ~2 min.

## Verification

**Commands:**
- `./mvnw verify` -- expected: BUILD SUCCESS (warn first if IntelliJ services are running; never `clean`).
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` -- expected: all green.

**Manual checks:**
- In the browser against the bot: a network blip at Q3 (banner, resume); Leave at Q5 (dialog, `/results`); Leave before the Q1 reveal (Home + aborted notice); offline for more than 10 s (Forfeited, `/results`); a two-tab session where closing one tab keeps playing.

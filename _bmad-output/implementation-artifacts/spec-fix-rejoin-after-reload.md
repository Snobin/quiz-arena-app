---
title: 'Fix: rejoin a live match after a page reload'
type: 'bugfix'
created: '2026-11-13'
status: 'done'
baseline_commit: '9e924f6e47fb86cdf0fc25f0750f3baabce18942'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-9-reconnect-forfeit-and-leave.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-10-results-and-rematch.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** reloading `/match` mid-match leaves the player stranded.
- The reload wipes the client's in-memory live state, but her guest token survives in `localStorage`.
- So the server sees the same `sub` reconnect, cancels the 10 s grace, and keeps her `IN_MATCH` while the match plays on.
- `/match` then shows "There's no match on this screen". Quick Match gets `ALREADY_IN_MATCH`, and its "Back to your match" button (`/match?matchId=…`) lands on that same empty screen. She is stuck until the match ends without her (owner hit this in manual testing on 2026-11-13).

**Approach:**
- The client remembers the live match id in `sessionStorage`.
- When `/match` opens with no live state but with a match id (from the URL or from storage), the client rejoins through the existing Story 1.9 path: subscribe to the topic, send `resync`, and rebuild the live match from the `SNAPSHOT`.
- The `SNAPSHOT` gains `selfParticipantId`, so a client with no prior state knows which participant she is.
- A match that has already gone (`NOT_IN_MATCH`) opens `/results` if its result is stored, else goes Home.

**Decisions:**
- **Contract:** `SnapshotPayload` gets one new field, `selfParticipantId` (UUID). The server always sets it. The web parser treats it as optional, so an older sample still parses. No other contract change.
- **Storage:** `minnal.liveMatchId` in `sessionStorage` holds `{matchId}`. It is set at `MATCH_FOUND` and cleared when the match settles for her (any outcome) or at the next `MATCH_FOUND`. `sessionStorage` is per tab: a fresh tab learns the id from `ALREADY_IN_MATCH`'s "Back to your match" instead.
- **While rejoining:** `/match` shows the existing "Reconnecting…" wording (`match.reconnecting` without the countdown, or a new `match.rejoining` string flagged for sign-off) with no options, until the `SNAPSHOT` arrives. If none arrives within 10 s, it goes Home.
- **After a rejoin:** play continues exactly as after a Story 1.9 reconnect: the open question if unanswered, the 1v1 own result via `myAnswer`, and her forfeit via `youForfeited` (for example after a reload that took more than 10 s), which then shows the Forfeited notice and `/results`.

## Boundaries & Constraints

**Always:**
- Reuse the 1.9 machinery: `awaitingSnapshot` buffering, `requestResync` with its retry, `applySnapshot`, and the NOT_IN_MATCH settle. A rejoin is that path with a live match built from the `SNAPSHOT` (participants, total, `selfParticipantId`), not a second implementation.
- While rejoining, topic frames for the rejoining match id are buffered (today `onTopic` drops them when `live` is null) and are applied after the `SNAPSHOT` with the usual `seq > refSeq` rule.
- Only the connection module writes the store and `minnal.liveMatchId`. Every storage access is wrapped in try/catch.
- `resync` stays authorised by the server only: a match she isn't in, or one that has ended, gets `NOT_IN_MATCH`, as today. The stored id is a hint, never a trust boundary.
- A wanted match id that differs from the live match in the store is not shown as that match (the current `/match` rule stays).

**Never:**
- Surviving a reload of the matchmaking search, or changing the server's grace and session rules.
- Any server change besides the `SNAPSHOT` field.
- A rejoin attempt from screens other than `/match`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Reload mid-question | Q4 open, unanswered, reload within 10 s | "Reconnecting…", then the Q4 screen with the right countdown and scores; she can answer | — |
| Reload after a 1v1 answer | answered Q4, reload | Q4 shows locked with her own result (band), waiting for the close | — |
| Reload in lead-in | before Q1 | lead-in view, then Q1 starts normally | — |
| Back to your match | new tab, Quick Match → `ALREADY_IN_MATCH{matchId}` → tap | rejoins as above | — |
| Slow reload | reload took more than 10 s (grace expired) | `SNAPSHOT youForfeited` → Forfeited notice → `/results` (minimal, then full on `MATCH_ENDED`) | — |
| Match already over | reload after the end, result stored | `NOT_IN_MATCH` → `/results` from `sessionStorage` | no stored result → Home |
| Stale or foreign id | stored id for a match she isn't in | `NOT_IN_MATCH` → Home; the stored id is cleared | — |
| No answer | no `SNAPSHOT` within 10 s (resync retries every 3 s) | Home; the stored id is cleared | — |
| Frames during rejoin | topic seq 12, 13 arrive before `SNAPSHOT refSeq=12` | 12 dropped, 13 applied | — |

</frozen-after-approval>

## Code Map

**Contracts:**
- `contracts/src/main/java/in/minnal/contracts/realtime/SnapshotPayload.java`: add `UUID selfParticipantId` (Javadoc: "which participant the receiver is").
- Update `contracts/samples/snapshot*.json` through `RealtimeSamplesTest` (`-Dcontracts.updateSamples=true`).

**game-service:**
- `services/game/src/main/java/in/minnal/game/match/domain/MatchState.java`: in `snapshot(participantId, now)` (~347–374), pass `participantId` into the new field. That is the only constructor call in main code.
- Extend an existing `MatchStateTest` snapshot case. `MatchReconnectFlowTest` should assert that the field equals the reconnecting participant.

**Web** (`web/src/`):
- `realtime/protocol.ts`: in `parseSnapshot` (~384–433), read optional `selfParticipantId` (string → `string | null`) and add it to the `SnapshotPayload` type. `contract.test.ts` follows the regenerated samples.
- `realtime/liveMatchId.ts` (new, modelled on `realtime/lastResult.ts`): `load`/`save`/`clear` for `minnal.liveMatchId`.
- `realtime/connection.ts`:
  - Add a `rejoining: string | null` variable (the match id).
  - New exported `rejoinMatch(matchId)`, which does nothing when `live()` is already that match. Otherwise it sets `rejoining`, sets `awaitingSnapshot`, and does `send` → `subscribeTopic(matchId)` + publish `matchResync(matchId)`. `requestResync` (~247) currently needs `live()`, so let it take the id from `rejoining`. Arm a 10 s give-up (clear storage, set the store's problem or idle so the screen goes Home).
  - `onTopic` (~263): when `live` is null and the frame's match is `rejoining`, buffer it.
  - `SNAPSHOT` case (~445): when `live` is null and `rejoining` matches and `selfParticipantId` is present, build the base with a `liveMatchFor`-style helper (participants, total, self), then `applySnapshot`.
  - `ERROR NOT_IN_MATCH` (~508): when `rejoining` matches, clear it and the stored id, and mark the rejoin gone.
  - `MATCH_FOUND` (~559): `liveMatchId.save`. `finish()` (~217): `liveMatchId.clear`.
  - `onConnect` (~614): when `rejoining` is set and the socket reopens, re-subscribe and resync.
- `realtime/liveGameStore.ts`: a store flag for the screen, e.g. `rejoin: {matchId, state: 'pending' | 'gone'} | null`, written only by the connection module. Export `rejoinMatch`.
- `screens/match/LiveMatchScreen.tsx` (~61–88):
  - When `!live`, take `wanted ?? liveMatchId.load()?.matchId`. If there is an id, call `rejoinMatch(id)` in an effect and render the rejoining view (heading + polite "Reconnecting…").
  - On `gone`: if `lastResult.load()?.matchId === id`, `navigate('/results', {replace})`, else `navigate('/', {replace})`.
  - With no id, keep the current "no match" view.
- `screens/matchmaking/MatchmakingScreen.tsx:145`: unchanged (it already navigates with `?matchId=`).
- `test-utils/realtime.ts`: `snapshot()` builder gains `selfParticipantId`.
- `i18n/catalogue.ts`: a `match.rejoining` string only if `match.reconnecting` needs its countdown param (flag `signoff`).

## Tasks & Acceptance

**Execution:**
- [x] `contracts/**` + samples: the `selfParticipantId` field. The contract comes first.
- [x] `services/game/.../MatchState.java` + `MatchStateTest`/`MatchReconnectFlowTest`: set and assert the field.
- [x] `web/src/realtime/*` + `test-utils` + tests: parser, `liveMatchId` storage, `rejoinMatch`, buffering while rejoining, the SNAPSHOT build, NOT_IN_MATCH gone, the 10 s give-up, re-subscribe on reconnect. Cover every matrix row at the connection level.
- [x] `web/src/screens/match/LiveMatchScreen.tsx` + tests: the rejoining view, auto-rejoin from storage and from `?matchId=`, navigation on gone (`/results` vs Home), and the no-id view unchanged.

**Acceptance Criteria:**
- Given `./mvnw verify`, when it runs, then every module passes.
- Given `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check`, when it runs, then everything passes and the initial JS stays ≤ 150 KB gzip.
- Given the running stack and a guest playing the bot, when she reloads at Q3 and later taps Quick Match in a new tab and then "Back to your match", then both times she is back in the live match with her score.

## Implementation Notes

- **Choices the spec left open:**
  - Contracts: `selfParticipantId` is the last `SnapshotPayload` component; both snapshot samples regenerated (`-Dcontracts.updateSamples=true`). `MatchState.snapshot` passes the asked-for `participantId`.
  - Web store: `LiveGameState.rejoin: {matchId, state: 'pending' | 'gone'} | null`. `liveMatchFor` now delegates to a new `liveMatchBase({matchId, participants, selfParticipantId, total})`, which the rejoin also uses.
  - Connection: `rejoinMatch` arms a 10 s give-up (`REJOIN_TIMEOUT_MS`) and reuses `awaitingSnapshot`/`buffer`/`requestResync` (now `rejoining ?? live().matchId`) and `applySnapshot`. A closed socket while rejoining reopens after 1 s; `onConnect` re-subscribes and resyncs. A SNAPSHOT without `selfParticipantId` cannot rebuild the match and is ignored (the give-up then fires). The stored id is also saved after a successful rejoin, so a fresh tab that came in through "Back to your match" survives its next reload. `finish()` clears it for every outcome; `MATCH_FOUND` replaces it and cancels a pending rejoin. A rejoin asked for while another match is in play is marked `gone` at once (defensive; the screen never asks then).
  - Screen: it rejoins only when the store has no live match at all, so `?matchId=` for a different live match still shows "no match" (the existing rule and test). The stored id is read once per mount. A `gone` that predates the screen's own request is ignored. After a rejoin the `LiveMatchView` treats the SNAPSHOT's outcome as a live arrival, so a slow-reload forfeit shows the notice and then `/results`.
  - Copy: `match.reconnecting` needs its countdown, so a new `match.rejoining` ("Reconnecting…", flagged `signoff` in both languages) is used and announced politely once.
  - Test helpers `resetRealtime`/`configureRealtimeForTests` also clear `minnal.liveMatchId`, so a stored id never leaks between tests.
  - `MatchmakingScreen.test.tsx`'s "Back to your match" case asserted the old stranded screen; it now asserts the rejoin and the resumed match.
- **Verified:**
  - `./mvnw verify` (no `clean`): BUILD SUCCESS, every module.
  - `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check`: all green, 606 tests, initial JS 127.9 KB of 150 KB.
- **Not done:** the manual checks against the running stack (AC3 and the Verification list).

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | verification-gap | No client rejoin test has self other than `participants[0]` | medium | patch | Pre-verified; `matchFound()` puts self first and `snapshot()` defaults to `participants[0]`. |
| 2 | verification-gap | The guard against a leftover `gone` in `RejoiningView` is untested | medium | patch | Pre-verified; every screen test starts with `rejoin: null`. |
| 3 | blind + verification-gap (other) | A settled match in the store stops the rejoin of a different match ("no match" dead end again) | low | patch | `rejoinId = stored ? null : …` while `rejoinMatch` itself refuses only when `inPlay`; direct condition fix. |
| 4 | blind + edge | A pending rejoin keeps running after she leaves `/match` | medium | patch | `RejoiningView`'s effect has no cleanup; a late SNAPSHOT sets `live`/`phase: 'found'` behind another screen, against the spec's Never. |
| 5 | blind | A failed rejoin of a URL id clears the stored id of a different match | low | patch | `endRejoin('gone')` calls `liveMatchId.clear()` unconditionally. Direct guard. |
| 6 | blind + edge | NOT_IN_MATCH with no match id ends a pending rejoin | low | patch | The branch accepts `aboutMatch === undefined`; the server always sends the id (`MatchRegistry.java:146,162`), so require equality. |
| 7 | blind | The rejoin effect announces twice under StrictMode | low | patch | `main.tsx` uses `StrictMode`; with the #4 cleanup the effect re-runs, so announce once through a ref. |
| 8 | edge | The `rejoined` ref stays true for a later match on the same screen instance | low | patch | Keep the rejoined match id in the ref and compare it with `live.matchId`; direct. |
| 9 | blind | The give-up timer starts before the socket opens, so a slow network loses the stored id | low | reject | After 10 s offline the server forfeits her anyway (grace), so Home is the right end; the fix changes the timeout semantics. |
| 10 | blind + edge | `phase: 'found'` with a stale or null `match` after a rejoin | low | reject | The only reader is `MatchmakingScreen`, which already ignores a stale match; no named harm today. |
| 11 | blind | Server: `selfParticipantId` not null-checked; a non-participant id possible | false | reject | `MatchRegistry` resolves the id from the `sub` of a participant before calling `snapshot`; it is never null or foreign. |
| 12 | edge | An explicit `selfParticipantId: null` breaks the SNAPSHOT parse | false | reject | The server always sets it and its mapper omits nulls; no sender produces `null`. |
| 13 | edge | `selfParticipantId` not among the participants | false | reject | Same evidence as #11. |
| 14 | edge | NOT_IN_MATCH for an old settled match clears the rejoin's buffer | low | reject | Requires a resync for the old match during a rejoin, which nothing sends. |
| 15 | edge | Token fetch failure with an old `pendingLeave` skips the rejoin retry | low | reject | Needs a stale give-up leave plus a failed token fetch at once; the 10 s give-up still ends it. |
| 16 | edge | Duplicate tab copies `sessionStorage`, so two tabs rejoin one match | low | reject | Two sessions of one `sub` are supported (Story 1.9 two-tab case); first answer counts. |
| 17 | blind | Missing tests: held frames dropped on `gone`/MATCH_FOUND, timer cleared after success, auth failure while rejoining, URL id vs stored id | low | reject | The behaviour follows from `endRejoin`; #5 brings its own test. |
| 18 | blind | The 10 s screen test counts resyncs on an exact boundary | low | reject | Deterministic fake timers; it breaks only if the constants change, which is the point. |
| 19 | blind | `match.rejoining` ml differs from `match.reconnecting` | low | reject | Both are flagged for native sign-off; noted for the reviewer. |
| 20 | blind | Spec status ahead of the manual checks; empty log headings | false | reject | Process state; the manual checks stay listed under Verification. |

## Verification

**Commands:**
- `./mvnw verify` -- expected: BUILD SUCCESS. Warn first if IntelliJ services are running; never `clean`.
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` -- expected: all green.

**Manual checks:**
- Against the bot: reload at Q3 (resumes), reload after a 1v1 answer (band shows), a new tab with Quick Match then "Back to your match" (resumes), reload after the end (`/results`), and a reload taking more than 10 s with the network off first (Forfeited, then `/results`).

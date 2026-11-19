---
title: 'Story 1.12: A 1v1 forfeit ends the match'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: '6c4272edf3031fddd54f37302cfcb9b07514ec9b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-13.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-9-reconnect-forfeit-and-leave.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When one player leaves a 1v1, the other keeps answering every remaining question against nobody, and a leader who quits would still "win" on score.

**Approach (approved Sprint Change Proposal of 2026-11-13; epics.md Story 1.12 is the contract):** In a human-vs-human 1v1 (QUICK, TOPIC_DUEL), the first forfeit (confirmed Leave or 10 s grace expiry) ends the match at once as completed, even before the Q1 reveal. `Ranking` places a 1v1 forfeiter last whatever her score. The remaining player sees "<name> left · you win" and goes to Results; the leaver's notice reads "You left · <name> wins".

## Boundaries & Constraints

**Always:**
- Human vs bot: a human forfeit before the Q1 reveal still aborts (nothing published); after it, the match ends at once as completed, the human places last, the bot wins.
- Battle Room (BATTLE_ROOM) is unchanged: play continues, forfeiters are ranked on earned score, the all-humans-gone-before-Q1 abort still applies.
- The open question, if any, is closed and revealed as in an early close; no further question starts. `MATCH_ENDED` goes to every human with a live session (forfeiter included); exactly one `minnal.match.completed` is published.
- `minnal.match.completed` and wire contract types are unchanged (`forfeited` and `placement` already carry the outcome). `Ranking` stays the single placement function.
- New copy is bilingual (ml + en) and flagged for native sign-off in the catalogue, like existing copy.

**Never:**
- No change to ratings-service, infra, or CI. No new wire message types.
- Do not touch Battle Room behaviour or the bot-match abort rule.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 1v1 leave mid-question | H-vs-H, Q3 open, A confirms Leave | Q3 revealed, match ends completed; B sees "A left · you win" then Results; A placed last | Forfeit is idempotent |
| 1v1 leave before Q1 reveal | H-vs-H, Q1 open or lead-in | Completed (not aborted); leaver last, remaining wins | N/A |
| 1v1 grace expiry | A disconnected 10 s | Same as leave | Stale grace epoch ignored |
| Leader quits | A leads on score, then leaves | A places last, B first | N/A |
| Bot, leave before Q1 reveal | Human vs bot | Aborted, nothing published | N/A |
| Bot, leave after Q1 reveal | Human vs bot | Completed, human last, bot wins | N/A |
| Battle Room forfeit | 3+ players | Others play on; forfeiter ranked on score | N/A |

</frozen-after-approval>

## Code Map

Paths relative to `services/game/src/main/java/in/minnal/game/match` (GA) unless noted.
- `GA/application/MatchActor.java:267-292` `forfeit(sub)` -- the one place to change; `:280` branch on `humansAllForfeited`, `:299-309` `finishNow()` (reuse for the 1v1 end), `:411-431` `end()` decides completed via `!aborted && state.q1Revealed()` (needs a forced-complete flag), `:439-454` `completed()`.
- `GA/domain/MatchState.java:284` `forfeit()`, `:314` `finishNow()` (excludes unasked questions), `:322` `humansAllForfeited()`, `:337` `q1Revealed()`, `:418` `mode()`; a participant is a bot when `MatchParticipant.sub()` is empty.
- `GA/application/MatchOutcome.java:35` -- calls `Ranking.placements`; must pass forfeit + 1v1 info.
- `contracts/src/main/java/in/minnal/contracts/scoring/Ranking.java` -- `Standing(score, correctCount)`; add forfeit awareness for 1v1. Only caller is MatchOutcome. `MatchMode.java`: QUICK, TOPIC_DUEL, BATTLE_ROOM.
- `web/src/screens/match/LiveMatchScreen.tsx` -- `:255-265` opponent-left announce, `:396-407` notices, `:272-288` outcome effect (`FORFEIT_NOTICE_MS` 2000), `:295-310` MATCH_ENDED handoff (`RESULTS_HOLD_MS`, `MATCH_ENDED_WAIT_MS`).
- `web/src/i18n/catalogue.ts` -- `match.opponentLeft` (~:257), `match.forfeited` (~:433, "the match goes on"); `{ml,en}` entries plus `signoff`. Validated by `catalogue.test.ts` and `npm run check:i18n`.
- Tests to update: `MatchActorTest` (:437, :477, :488, :506, :689), `MatchReconnectFlowTest` (:182, :224 stays abort, :247), `MatchEndFlowTest` (:191, :235), `MatchRegistryTest` (:236), `domain/MatchStateTest`, `contracts/.../RankingTest` (`aForfeiterIsRankedOnHerEarnedScore` :34), `web/.../ReconnectLeave.test.tsx` (:174, :216, :259), `ResultsScreen.test.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] `contracts/.../scoring/Ranking.java` + `RankingTest.java` -- 1v1 rule: forfeiter always last; room forfeiter ranked on score; tests incl. a 1v1 forfeiter who led, and a room forfeiter -- AD-8
- [x] `GA/application/MatchOutcome.java` -- pass forfeited flags and 1v1-ness (mode != BATTLE_ROOM) to Ranking
- [x] `GA/application/MatchActor.java` (+ `MatchState` if needed) -- in `forfeit`, for a human-vs-human 1v1 end via `finishNow()` as completed even before Q1 reveal; bot and room paths unchanged
- [x] `web/.../LiveMatchScreen.tsx` + `i18n/catalogue.ts` -- "<name> left · you win" (polite, once) then Results with win takeover after the usual reveal hold; leaver notice "You left · <name> wins" in 1v1, existing copy kept for rooms
- [ ] Update the existing tests listed in the Code Map and add: H-vs-H leave before Q1 completes, leave mid-question reveals then ends, grace expiry ends, bot abort/complete, room unchanged

**Acceptance Criteria:**
- Given a human-vs-human 1v1 in any phase, when one player forfeits, then the match ends at once as completed, one `MATCH_ENDED` per live human and one `minnal.match.completed`, forfeiter last.
- Given a human vs bot match, when the human leaves before the Q1 reveal, then it aborts; after, it completes with her last.
- Given a Battle Room, when anyone forfeits, then nothing changes.

## Implementation Notes

- `MatchActor.isCompleted()` is now `forcedComplete || q1Revealed()` (unlisted in the spec): `MatchRegistry` uses it for the ended metric and the rematch window.
- `MatchOutcome` falls back to `endedAt` for `startedAt` when the match ends before Q1 opened.
- `connection.ts`: in a 2-participant match with a forfeited opponent, `MATCH_ENDED` completes the match for the remaining player (the reveal hold then opens Results).
- 1v1 copy keys `match.opponentLeftWin` and `match.forfeitedOneVsOne` are flagged for ml sign-off only, per the EXPERIENCE.md `[ASSUMPTION]` marks.
- A confirmed Leave (`left` outcome) goes straight to Results; the "You left" notice shows on the grace-expiry path and on Results.
- Files: contracts `Ranking`; game `MatchActor`, `MatchOutcome`, tests; web `LiveMatchScreen`, `ResultsScreen`, `connection.ts`, `catalogue.ts`, tests.

## Design Notes

Human-vs-human 1v1 = mode is QUICK or TOPIC_DUEL and every participant has a sub. Forced-complete: `end()` currently requires `q1Revealed()`; add an actor flag set by the 1v1 forfeit path rather than changing `q1Revealed()` semantics.

## Verification

**Commands:**
- `./mvnw -B -pl contracts,services/game -am test` -- expected: all green
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` -- expected: all green

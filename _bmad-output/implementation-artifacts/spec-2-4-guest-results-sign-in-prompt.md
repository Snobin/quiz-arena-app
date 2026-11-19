---
title: 'Story 2.4: Guest results sign-in prompt'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: 'ae4ded676d59a2cbfdea196a39160b4dd79a3ed9'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-3-profile-setup-and-editing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A guest who has just finished a Quick Match sees a results screen with no hint that an account would give her a rating, and after signing in she cannot get back to those results.

**Approach:** An inline sign-in card on the guest's results, built from that match's result, that starts Google sign-in with `returnTo` set to the results route. The result already survives in `sessionStorage` (Story 1.10); it is marked as played by a guest, so after sign-in the same results come back without the prompt, with a note and "Play again". The Story 2.4 criteria in `epics.md` are the contract; this spec adds the decisions below.

## Boundaries & Constraints

**Always:**
- Web only, plus one core test. The stored result gains a boolean `guest` (true when the session was not registered at `MATCH_ENDED`); an entry without it reads as false. Nothing about the match, the score or the guest id is ever sent to core: the sign-in URL carries only `returnTo=/results`.
- The card sits between the results band and the dot strip, inside the surface that is inert during the win takeover, so it appears after it. It is inline (never a modal), the only nudge on the screen, with the 1.5px ink outline of the Sign-in nudge and a primary "Continue with Google" button.
- Copy has four variants: win, loss, draw, and a bot opponent (the bot variant wins when the rival is a BOT). Each uses that match's score as the hook, none says this match will be saved, rated or added to history, and an opponent name is inserted unchanged as its own run with a separator. Variants carry sign-off flags in ml and en. The text is rebuilt from the stored result, so a reload shows the same text.
- A registered player's own results never show the card. While the session is still booting nothing is shown yet (no flash).
- A registered player looking at a result with `guest: true` sees a muted one-line note that the match was played as a guest and is not on her record, no rating-delta area, and "Play again" (starts a new Quick Match) in place of Rematch; Home stays.
- Focus goes to the results heading and "Signed in as <name>" is announced after sign-in (both already done by the results screen and `/auth/return`); profile setup for a new account comes first, then the results.

**Never:**
- No change to core, to the sign-in or profile protocols, or to ratings. The result is never uploaded or migrated. A shown guest result stays only in this tab's `sessionStorage` and is replaced by the next match.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Guest win, loss, draw | Guest finishes a Quick Match | Card with that variant and score, between band and strip | N/A |
| Bot opponent | Rival kind BOT | Bot variant | N/A |
| Reload | Guest reloads `/results` | Same card, same text, from storage | Corrupt entry goes Home as before |
| Tap Continue | Guest taps the button | Whole-page navigation to `…/google/start?returnTo=/results`, no match data | N/A |
| Back signed in | Registered, stored `guest: true` | No card; muted note; Play again instead of Rematch; heading focused | N/A |
| Registered match | Registered, stored `guest: false` | No card; Rematch as before | N/A |
| Booting | Session not yet known | No card yet | N/A |
| Core API surface | Any core endpoint | None accepts a match, score or guest id | A test fails if one appears |

</frozen-after-approval>

## Code Map

- `web/src/realtime/lastResult.ts` (`LastResult`, `save`, `load`) and `realtime/connection.ts:608` (the only `save` call) -- add `guest`; `lastResult.test.ts`.
- `web/src/screens/results/ResultsScreen.tsx` (`FullResults`, `RematchActions`, `ActionBar`) and `ResultsScreen.test.tsx` -- insert the card after `ResultsBand`; swap the Rematch button for Play again; `outcome.ts` (`resultView`) gives kind, self and rival.
- New `web/src/screens/results/GuestResultsPrompt.tsx`; reuse `SignInNudge`'s look and `startGoogleSignIn` from `auth/googleSignIn.ts`; `auth/session.ts` (`useSession`) for guest, registered or booting.
- `web/src/i18n/catalogue.ts` and `catalogue.test.ts` -- prompt variants, note, "Play again"; the name-separator test already covers `{{name}}`.
- `services/core/src/test/java/in/minnal/core/identity/` -- a test over the request mappings and request records.

## Tasks & Acceptance

**Execution:**
- [x] `web` `lastResult` + `connection` -- store `guest`; tests
- [x] `web` `GuestResultsPrompt` + `ResultsScreen` -- card, variants, registered-after-guest note and Play again, booting handling; i18n and tests (every variant, reload, no card for a registered match, sign-in URL, no match data in any request)
- [x] `core` test -- no mapping or request field accepts a match, score or guest id

**Acceptance Criteria:**
- Given the epics.md Story 2.4 criteria, when the web app and core test run, then each passes.
- Given any prompt variant in either language, when its text is read, then it contains no promise that this match is saved, rated or in history.

## Implementation Notes

- `LastResult.guest` is written by the connection module from `session.store.getState().status !== 'registered'`; a live arrival decides from the session now, a reload from the stored flag.
- `GuestResultsPrompt` shows only when the match was a guest match and the session is `guest`; `booting` shows nothing, so nothing flashes.
- The bot variant wins over win, loss and draw when the rival is a BOT. The loss variant names the winner (the opponent) as its own run after a space.
- The results test that asserted no "rating" text anywhere now excludes the prompt (it is not a delta).
- `NoGuestResultEndpointTest` pins core's `/api/` mappings to a closed list and checks request-body record fields; the 2.1 to 2.3 endpoints are in the list.
- The three lazy dev-fixture waits got a 5 s timeout: they flaked at the 1 s default on a cold dynamic import.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| A live arrival re-derived guest from the current session, so a later drop to guest showed the prompt on a registered player's own match | high | patch (fixed) | the guest decision is fixed when the results open, from the flag stored at MATCH_ENDED; test added |
| A stored entry from before the flag silently read as registered; `save` defaulted the flag | medium | patch (fixed) | legacy entries read as null (unknown) and fall back to the session; `guest` is now required in `save`; tests added |
| The Quick Match copy showed for other modes; loss text could render with no name | medium | patch (fixed) | prompt only for `QUICK` results with a named opponent; Battle Room test added |
| No test of a registered match through the connection writer, of the live arrival path, or of the Malayalam variants | medium | patch (fixed) | tests added |
| API-surface test weak (only `/api/`, substring blocklist, non-record bodies, null path condition) | medium | patch (fixed) | all served paths on a closed list, whole-word match, nested records, non-record bodies rejected |
| `returnTo=/results` acceptance by core not pinned | low | patch (fixed) | vector added to `ReturnPathTest` |
| Play again with an incomplete profile; stale rematch state; double tap; bidi isolation of names; the title as a promise; guest button label; forfeit copy | low | defer/false | profile gate already holds setup first; a reload clears rematch state; the page navigates away on tap; copy is flagged for sign-off |
| Lazy dev-fixture waits raised to 5 s | low | false | a cold dynamic import took longer than the 1 s default under parallel load; only those three waits changed |

## Verification

**Commands:**
- `./mvnw -B -pl contracts,services/core -am test` -- expected: green (JDK 25 `JAVA_HOME`, `MAVEN_SKIP_RC=1`; podman `DOCKER_HOST` here)
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` -- expected: green

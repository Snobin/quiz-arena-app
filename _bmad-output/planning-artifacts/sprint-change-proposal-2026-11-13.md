# Sprint Change Proposal: a 1v1 forfeit ends the match

- **Date:** 2026-11-13
- **Requested by:** Snobin (product owner)
- **Mode:** Batch
- **Status:** Approved by Snobin on 2026-11-13
- **Scope:** Moderate (one new Epic 1 story plus planning-document updates; no rollback)

## 1. Issue Summary

**Trigger:** On 2026-11-13 the product owner played Quick Match against himself, on a laptop and a phone. He left on one device, and the other device kept playing every remaining question against nobody before it could reach a result.

**Type:** A new requirement from the stakeholder, after hands-on use.

**Today's rule:** the match always continues for whoever remains (Story 1.9, FR64, AD-11). A forfeiter keeps the score she earned, and she is ranked on it (AD-8, FR59). If every human leaves before the Q1 reveal, the match is aborted (FR65).

**Decisions (product owner, 2026-11-13):**
1. **A forfeit ends a 1v1 at once.** In a 1v1 mode (Quick Match, later Topic Duel), when one player forfeits (confirmed Leave, or the 10 s reconnect grace runs out), the match ends immediately. The remaining player wins, and nobody plays the remaining questions.
2. **The 1v1 forfeiter always ranks last,** whatever her score. Without this rule a leader who quits would "win" a match that the early end cuts short.
3. **Leaving early is still a loss,** in human vs human 1v1. Even before the Q1 reveal, the match ends as completed and the leaver loses; it is not aborted.
4. **Bot matches keep the abort.** If a human playing the bot leaves before the Q1 reveal, the match is aborted as today: nothing is counted, so bot practice doesn't pile up losses. After the Q1 reveal her leave ends the match at once, as it already does, and she ranks last (the bot wins).
5. **Battle Room is unchanged.** It keeps playing on with whoever remains, forfeiters are ranked on their earned score, and the all-left-before-Q1 abort still applies.

**Evidence:** owner testing on two devices; the remaining player waited through up to about 1 minute of questions with nobody playing against her.

## 2. Impact Analysis

| # | Item | Status | Notes |
|---|---|---|---|
| 1.1 | Triggering story | [x] | Story 1.9 (reconnect, forfeit, leave; merged PR #17), observed in play after 1.10 |
| 1.2 | Problem statement | [x] | Above |
| 1.3 | Evidence | [x] | Owner's two-device test |
| 2.1 | Current epic completable? | [x] | Yes, with one more story |
| 2.2 | Epic-level changes | [!] | Add Story 1.12; amend the ACs of Stories 1.9 and 1.10 |
| 2.3 | Future epics | [!] | Epic 2 (ratings: 1v1 forfeiter loses), Epic 4 (Topic Duel inherits the rule), Epic 5 (unchanged, stated explicitly) |
| 2.4 | Obsolete or new epics | [N/A] | None |
| 2.5 | Epic order | [N/A] | Unchanged; 1.12 is built before Story 1.2 part 2 (the deploy) |
| 3.1 | PRD | [!] | The "Match recovery" row |
| 3.2 | Architecture | [!] | AD-8 (completed rule, ranking) and AD-11 (forfeit outcome) |
| 3.3 | UX | [!] | Forfeited copy, the new "opponent left, you win" outcome, the Match aborted row |
| 3.4 | Other artifacts | [x] | `contracts` `Ranking`, plus tests; no infra or CI change |
| 4.1 | Direct adjustment | Viable | One new story; Low–Medium effort; Low risk |
| 4.2 | Rollback | Not viable | Nothing to revert; 1.9 and 1.10 are extended, not undone |
| 4.3 | MVP review | Not viable | MVP unaffected |
| 4.4 | Path | [x] | Option 1, direct adjustment |

**Technical impact:**
- **game-service:** the match actor's forfeit path already re-checks the all-humans-gone case; it gains the 1v1 end. `Ranking` gains a 1v1 rule that puts forfeiters last. The `minnal.match.completed` payload is unchanged: `forfeited` and `placement` already carry it.
- **web:** the remaining player hands off to `/results` straight after the end, and the leaver's notice copy changes.
- **No change:** contracts wire types, ratings-service (not built yet), infra.

## 3. Recommended Approach

**Direct adjustment.** Add Story 1.12 to Epic 1, and amend the PRD row, FR59, FR64, FR65, AD-8, AD-11 and the UX rows.
- **Effort:** about one build session.
- **Risk:** low. The early finish path already exists (Story 1.9's all-humans-gone finish), and the results screen already handles any end.
- **Timeline:** Epic 1 gains one small story before the deploy.

## 4. Detailed Change Proposals

### 4.1 PRD (`prds/prd-quiz-arena-2026-11-10/prd.md`, the "Match recovery" row)
- **Old:** "If a player disconnects mid-match, the match continues. The player has 10 seconds to reconnect and resume where the match is; after that they forfeit the remaining questions. A player who quits after the first question still takes the result"
- **New:**
  - "If a player disconnects mid-match, she has 10 seconds to reconnect and resume where the match is. After that, or at once if she leaves, she forfeits.
  - In a 1v1 match a forfeit ends the match at once: the remaining player wins and the leaver loses, whatever the score, even before the first question is revealed. The exception is a match against the bot, which a leave before the first reveal aborts (not counted).
  - In a Battle Room the match continues for the others, and a player who quits after the first question still takes the result her score earned."
- **Rationale:** owner decisions 1–5.

### 4.2 Epics (`epics.md`)

**FR59** (requirements inventory, line ~117)
- **Old:** "…forfeiters are rated on their earned placement."
- **New:** "…in a 1v1 match the forfeiter always places last (a loss); in a Battle Room forfeiters are rated on their earned placement."

**FR64** (line ~125)
- **Old:** "After 10 s disconnected — or on confirmed Leave — the player forfeits the remaining questions (scoring 0), the match continues for everyone else, and the leaver still receives the result their score earned."
- **New:** "After 10 s disconnected — or on confirmed Leave — the player forfeits. In a 1v1 match (Quick Match, Topic Duel) this ends the match at once: the remaining player wins and the leaver loses whatever her score. In a Battle Room she forfeits the remaining questions (scoring 0), the match continues for everyone else, and she still receives the result her score earned."

**FR65** (line ~126)
- **Old:** "A match counts as completed once its first question has been revealed; if every human leaves before the first reveal, the match is aborted…"
- **New:**
  - "A match counts as completed once its first question has been revealed, or, in a human-vs-human 1v1, as soon as one player forfeits while the other remains.
  - A match is aborted when every human leaves before the first reveal; in practice that means a human-vs-bot match, or a Battle Room. An aborted match counts nowhere…" (the rest unchanged)

**Story 1.9: "Given a 1v1 match where the opponent forfeits"**
- **Old:** "Then the remaining player sees a one-line "opponent left" notice, announced politely once, and keeps playing to the end"
- **New:** "Then the match ends at once (Story 1.12): the remaining player sees "<name> left · you win", announced politely once, and goes to her results; in a Battle Room (Epic 5) the others keep playing"

**Story 1.9: the Leave and grace ACs** ("the match continues for everyone else" / "the match continues for the others")
- **New:** append "(in a 1v1, the match ends at once instead; Story 1.12)".

**Story 1.9: the abort AC** ("every human participant has forfeited or left before Q1 is revealed (including a human vs bot match)")
- **New:** "every human has forfeited or left before Q1 is revealed and no human remains (a human vs bot match, or a room)". In a human-vs-human 1v1 the first forfeit ends the match as completed (Story 1.12), so it never aborts.

**Story 1.10: the Ranking AC**
- **Old:** "…unit tests cover a clear win, a correct-count tiebreak, a full tie and a forfeiter ranked on earned score"
- **New:** "…in a 1v1, a forfeiter always places last; in a Battle Room a forfeiter is ranked on earned score; unit tests cover a clear win, a correct-count tiebreak, a full tie, a 1v1 forfeiter who led on score placing last, and a room forfeiter ranked on earned score"

**Epic 2, the ratings consumer story** (line ~1389)
- **Old:** "And a forfeiter is rated on the placement she earned, exactly like any other participant"
- **New:** "And a forfeiter is rated on the placement in the event, exactly like any other participant (in a 1v1 that is always last, a loss)"

**New Story 1.12: A 1v1 forfeit ends the match**

> As Anju, whose Quick Match opponent has left,
> I want to win at once instead of answering the remaining questions against nobody,
> So that a walk-out never wastes my time and the leaver can't escape the loss.
>
> **Requirements:** FR59, FR64, FR65 (as amended 2026-11-13), AD-8, AD-11 (amended). Source: `sprint-change-proposal-2026-11-13.md`.
>
> **Given** a human-vs-human 1v1 (Quick Match or Topic Duel) in any phase (lead-in, question open, reveal)
> **When** one player forfeits (confirmed Leave, or the 10 s grace expires)
> **Then** the actor ends the match at once:
> - the open question, if any, is closed and revealed as in an early close;
> - no further questions start;
> - the match is completed (even before the Q1 reveal);
> - `MATCH_ENDED` goes to both humans with live sessions, and one `minnal.match.completed` is published.
>
> **And** `Ranking`, in a 1v1, places the forfeiter last regardless of score or correct count, with a unit test where the forfeiter led.
>
> **Given** a human vs bot match
> **When** the human forfeits before the Q1 reveal
> **Then** the match is aborted as today.
>
> **When** she forfeits after the Q1 reveal
> **Then** the match ends at once as completed and she places last; the bot wins.
>
> **Given** the remaining player
> **When** the opponent's forfeit arrives
> **Then** she sees "<name> left · you win" (announced politely once), then `/results` with the win takeover once `MATCH_ENDED` is in, after the usual reveal hold if a question was just revealed.
>
> **Given** the leaver (still connected)
> **When** her forfeit is confirmed
> **Then** her notice reads "You left · <name> wins" (replacing "the match goes on" in 1v1), and her results show the loss.
>
> **Given** a Battle Room (Epic 5)
> **When** anyone forfeits
> **Then** nothing changes: the others play on, and forfeiters are ranked on their earned score.

### 4.3 Architecture (`architecture/architecture-quiz-arena-2026-11-10/ARCHITECTURE-SPINE.md`)

**AD-8, Rule**
- **Old:** "A match is **completed** once Q1 has been revealed; it is **aborted** (nothing published) only if every human forfeits before that. … `placement` comes from the single `Ranking` function in `contracts/` (score desc, then correctCount desc, else tie). … Forfeiters are rated on their earned placement."
- **New:**
  - "A match is **completed** once Q1 has been revealed, or, in a human-vs-human 1v1, as soon as one player forfeits while the other remains. It is **aborted** (nothing published) only if every human forfeits before the Q1 reveal and no human remains.
  - `placement` comes from the single `Ranking` function in `contracts/`. In a 1v1 a forfeiter always places last. Otherwise placement is score desc, then correctCount desc, else a tie.
  - … Forfeiters are rated on the placement in the event."

**AD-11, last sentence**
- **Old:** "After 10 s the participant is `forfeited`, scores 0 on remaining questions, and the match continues."
- **New:** "After 10 s (or at once on `leave`) the participant is `forfeited`. In a 1v1 that ends the match immediately, and the remaining player wins (AD-8). Otherwise she scores 0 on the remaining questions and the match continues."

### 4.4 UX (`ux-designs/ux-quiz-arena-2026-11-11/EXPERIENCE.md`)

**Voice & Tone, Forfeited (line ~82)**
- **New:** keep the row for Battle Room. Add three rows:
  - "Forfeited (1v1)": [ASSUMPTION] "നിങ്ങൾ പോയി · {name} ജയിച്ചു" / "You left · {name} wins"
  - "Opponent left (1v1)": [ASSUMPTION] "{name} പോയി · നിങ്ങൾ ജയിച്ചു" / "{name} left · you win"
  - Both flagged for native sign-off.

**States table, Leave confirm / Forfeited / Match aborted (lines ~207–210)**
- **Leave confirm:** "Leave → Results with the score earned so far (forfeit)" becomes "Leave → Results (in 1v1 a loss; in a Battle Room the score earned so far)".
- **Add:** "Opponent left (1v1) | Live match → Results | The match ends at once; a one-line notice, then Results with the win takeover."
- **Match aborted:** "All humans gone before the first reveal" becomes "All humans gone before the first reveal and none remains (vs the bot, or a room)".

**Leave confirm title:** "You'll forfeit the remaining questions" stays accurate for both kinds of match. No change.

## 5. Implementation Handoff

- **Scope:** Moderate. One new story, plus planning-document edits.
- **Planning edits:** applied by the developer agent in this session, on approval, in one docs PR, the same way as the 2026-11-12 change.
- **Sprint status:** add `1-12-a-1v1-forfeit-ends-the-match: backlog` under Epic 1.
- **Build:** run `bmad-build` for Story 1.12 next, before Story 1.2 part 2 (the deploy).
- **Success criteria:**
  - On two devices, Leave on one: the other is on her results with a win within the reveal hold.
  - The leaver sees a loss even when she led.
  - Leaving a bot match before the first reveal still aborts.
  - Battle Room behaviour is untouched (asserted by `Ranking` tests).

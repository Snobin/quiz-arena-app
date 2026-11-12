# Sprint Change Proposal: instant 1v1 feedback and early close

- **Date:** 2026-11-12
- **Requested by:** Snobin (product owner)
- **Mode:** Batch
- **Status:** Approved by Snobin on 2026-11-12
- **Scope:** Moderate (a new Epic 1 story plus planning-document updates; no rollback)

## 1. Issue Summary

**Trigger:** On 2026-11-12, after playing Quick Match end to end on Stories 1.7 and 1.8, the product owner found the pacing too slow and the feedback too delayed:

1. After tapping an option, the player waits until the 15 s window ends to learn whether she was right.
2. When both players have already answered, the match still waits out the full 15 s before revealing and moving on.

**Type:** A new requirement from the stakeholder, after hands-on use.

**Decision (made by the product owner on 2026-11-12, after the trade-offs were presented):**
- **Early close (every mode):** when every participant still in the match has answered the open question, the server closes the window at once and reveals. The reveal hold, then the next question, follow as before.
- **Instant self-feedback (1v1 modes only, Quick Match and Topic Duel):** when her answer is accepted, the player immediately learns whether it was correct, her points and the correct answer. Her opponent still sees only "answered".
  - The full reveal stays at window close, which now usually comes early: the opponent's pick, the explanation, the attribution and the totals.
  - **Battle Room keeps the secret reveal.** A fast player in a classroom could otherwise shout answers to slower players.

**Evidence:**
- A typical Quick Match today takes about 2.85 min even when both players answer in 3–5 s.
- The "Locked in · result when time runs out" wait was the main complaint.
- With early close, a 1v1 against the bot (answering at 2–12 s) should take about 1–1.5 min.

## 2. Impact Analysis

**Checklist results:**

| # | Item | Status | Notes |
|---|---|---|---|
| 1.1 | Triggering story | [x] | Story 1.7 (merged, PR #10) and Story 1.8 (PR #14, open), observed in play |
| 1.2 | Problem statement | [x] | Pacing and feedback (above) |
| 1.3 | Evidence | [x] | Measured match length; owner feedback |
| 2.1 | Current epic completable? | [x] | Yes. Epic 1 gains one story |
| 2.2 | Epic-level changes | [!] | Add Story 1.11; amend the ACs of Stories 1.7, 1.8, 1.9 and 1.10 |
| 2.3 | Future epics | [!] | Epic 4 (Topic Duel = 1v1, gets both), Epic 5 (Battle Room: early close yes, instant feedback no) |
| 2.4 | Obsolete or new epics | [N/A] | None |
| 2.5 | Re-ordering | [!] | Build Story 1.11 next, before 1.9, so reconnect `SNAPSHOT` covers the new state from the start |
| 3.1 | PRD conflicts | [!] | FR-4.6, the secrecy NFR, the duration NFR (still met; typical much shorter) |
| 3.2 | Architecture conflicts | [!] | AD-5 (secrecy), AD-6 (window and hold), the sequence diagram, the protocol notes |
| 3.3 | UX conflicts | [!] | Peak band timing, the locked/waiting state, the announcements, journey step 3 |
| 3.4 | Other artifacts | [!] | `contracts` (`AnswerAcceptedPayload`), golden samples, game `MatchState`, web store and screen, the load-test expectations |
| 4.1 | Direct adjustment | Viable | Effort: Medium. Risk: Low–Medium |
| 4.2 | Rollback | Not viable | Stories 1.7 and 1.8 stay valid; Story 1.11 builds on them |
| 4.3 | MVP review | Not needed | Scope is unchanged; the MVP is still achievable |

**Epic impact:**
- **Epic 1:** a new Story 1.11. Stories 1.7, 1.8, 1.9 and 1.10 get small AC amendments so the planning record matches the new rules.
- **Epic 4:** Story 4.2 (Topic Duel) inherits both behaviours through the shared actor.
- **Epic 5:** Story 5.4 (Battle Room) inherits early close only, and states that rooms keep the secret reveal.

**Technical impact:**
- **game-service `MatchState`/`MatchActor`:**
  - After each accepted answer, close the window early when every non-forfeited participant has answered. Cancel the pending deadline timer.
  - In 1v1 modes, `ANSWER_ACCEPTED` carries `correct`, `points` and `answerIndex`.
- **contracts:** `AnswerAcceptedPayload` gains optional `correct`, `points` and `answerIndex`, present only in 1v1 modes. Plus a new golden sample.
- **web:**
  - In 1v1, the store keeps the instant result, and the screen shows the player's own band at her tap: the strike when correct, the correct answer named when wrong.
  - At close, the full reveal adds the opponent's pick, the explanation, the attribution and the totals, with no second band drop or strike.
  - The timer freezes when the reveal arrives early.
- **Security (accepted risk):** in 1v1, a player learns the answer during the window. That helps nobody but her rival, whose answer the server already holds or who is a bot. Battle Room is unchanged.
- **Deployment, CI, monitoring:** no change. The existing ack and broadcast-lag timers cover the new paths.

## 3. Recommended Approach

**Direct adjustment.** Merge PR #14 (Story 1.8) as it is. Then build a new **Story 1.11: Instant 1v1 feedback and early close** next, before Story 1.9.

- **Rationale:**
  - The engine is already list-based and event-driven, so early close is one check after each accepted answer.
  - Instant feedback is a payload field plus a client state.
  - Nothing already built has to be thrown away.
- **Effort:** Medium (one story, about the size of half a Story 1.8). **Risk:** Low–Medium.
  - The main risk is the client choreography: the own band at the tap, then the full reveal without a second peak.
  - It must stay within the 1 flash per 1000 ms budget, which the flash scheduler already enforces.
- **Timeline impact:** one extra story in Epic 1, before Story 1.9.

## 4. Detailed Change Proposals

### 4.1 PRD (`prds/prd-quiz-arena-2026-11-10/prd.md`)

**FR-4.6**

OLD:
```
| FR-4.6 | Scoring is computed server-side; client never receives the correct answer before time expires |
```
NEW:
```
| FR-4.6 | Scoring is computed server-side. In 1v1 modes (Quick Match, Topic Duel) a player receives her own answer's correctness, points and the correct answer as soon as her answer is accepted; her opponent receives only that she answered. The full reveal (both picks, explanation, attribution, totals) comes when the question closes: when every participant still in the match has answered, or when the 15 s window ends, whichever comes first |
```
Rationale: the owner's decision. Scoring is unchanged.

**NFR: server-side question sequencing and timing**

OLD:
```
| Server-side question sequencing and timing | Client must never receive a question's correct answer before the answer window closes |
```
NEW:
```
| Server-side question sequencing and timing | Client must never receive a question before its window opens, nor any other participant's correctness or pick before the question closes. In Battle Room no client receives the correct answer before the question closes; in 1v1 modes a player receives her own correctness and the correct answer only after her own answer is accepted |
```

**NFR: Quick Match and Topic Duel session duration.** Unchanged ("≤ 4 minutes"). Add a note:
```
(A question closes early once every participant has answered, so typical matches are much shorter.)
```

### 4.2 Architecture (`architecture/architecture-quiz-arena-2026-11-10/ARCHITECTURE-SPINE.md`)

**AD-5: Answer secrecy and no early correctness → rename to "Answer secrecy"**

OLD (Prevents and Rule):
```
- **Prevents:** the correct answer — or a hint of correctness — reaching any client before the window closes.
- **Rule:** The client-facing `QuestionView` has **no** answer or explanation field. A question is sent only when its window opens. During the window, `ANSWER_ACCEPTED` confirms receipt only (no correctness), and `SCOREBOARD` shows who has answered, not scores. After the window closes for everyone, one `QUESTION_REVEALED` carries answer index, explanation, attribution, and updated scores. …
```
NEW:
```
- **Prevents:** the correct answer — or a hint of correctness — reaching a player who could still use it: in Battle Room before the question closes; in every mode, anyone's pick or correctness reaching another participant before the question closes.
- **Rule:** The client-facing `QuestionView` has **no** answer or explanation field. A question is sent only when its window opens. `SCOREBOARD` shows who has answered, never what or whether correct. In Battle Room, `ANSWER_ACCEPTED` is receipt-only. In 1v1 modes (Quick Match, Topic Duel), `ANSWER_ACCEPTED` is private to the answering player and also carries her own `correct`, `points` and the question's `answerIndex` — she can no longer change her answer, and her only rival is the opponent. When the question closes, one `QUESTION_REVEALED` carries answer index, explanation, attribution, every pick and updated scores. Full sets with answers exist only on `/internal/question-sets` and in actor memory. Solo Practice … (unchanged)
```

**AD-6: Server clock and scoring**

OLD (fragment):
```
Window = 15 s; later answers are rejected. First answer per participant per question wins; later ones are dropped. After each reveal the actor holds 2 s (3 s in Battle Room), then starts the next question.
```
NEW:
```
Window = 15 s; later answers are rejected. First answer per participant per question wins; later ones are dropped. A question closes when its window ends or, earlier, as soon as every participant still in the match (not forfeited; bots included) has answered — the actor then reveals at once. After each reveal the actor holds 2 s (3 s in Battle Room), then starts the next question. Scores always use each answer's own receive time, so closing early never changes points.
```

**Sequence diagram**

OLD:
```
    G->>P: ANSWER_ACCEPTED (receipt only)
    G->>P: QUESTION_REVEALED + scores (after 15 s)
```
NEW:
```
    G->>P: ANSWER_ACCEPTED (1v1: own result; rooms: receipt only)
    G->>P: QUESTION_REVEALED + scores (all answered, or 15 s)
```

### 4.3 Epics (`epics.md`)

**Requirements inventory, FR13**

OLD:
```
- FR13: No client receives a question before its answer window opens, and no client receives the correct answer, explanation or any hint of correctness before the window closes for everyone. (PRD FR-3.4, FR-4.6 · CAP-3, AD-5)
```
NEW:
```
- FR13: No client receives a question before its answer window opens. No client receives another participant's pick or correctness, or the explanation, before the question closes. In Battle Room no client receives the correct answer or any hint of correctness before the question closes; in 1v1 modes a player receives her own correctness, points and the correct answer once her own answer is accepted. (PRD FR-3.4, FR-4.6 · CAP-3, AD-5)
```

**Additional requirements, "Answer secrecy" bullet**

OLD:
```
- Answer secrecy: `QuestionView` has no answer/explanation; `ANSWER_ACCEPTED` is receipt-only; `SCOREBOARD` shows who answered; one `QUESTION_REVEALED` carries answer, explanation, attribution, scores (AD-5).
```
NEW:
```
- Answer secrecy: `QuestionView` has no answer/explanation; `ANSWER_ACCEPTED` is receipt-only in Battle Room and carries the player's own `correct`, `points`, `answerIndex` in 1v1 modes; `SCOREBOARD` shows who answered; one `QUESTION_REVEALED` per question (when all have answered, or at 15 s) carries answer, explanation, attribution, every pick and scores (AD-5, AD-6).
```

**UX-DR31 (peak band)**

OLD (fragment): `drops in (band-drop) when the window closes;`
NEW:
```
drops in (band-drop) when the player's own result is known — at her accepted answer in 1v1 modes, at the reveal in Battle Room or when she did not answer;
```

**Story 1.7, the `ANSWER_ACCEPTED` AC.** Append the following, and change "Given the 15 s window closes" to "Given the question closes (every participant still in the match has answered, or the 15 s window ends)":
```
**And** (amended by Story 1.11) in 1v1 modes `ANSWER_ACCEPTED` also carries `{correct, points, answerIndex}`
```

**Story 1.8, the lock AC.** Append:
```
**And** (amended by Story 1.11) in 1v1 modes the player's own result shows at ANSWER_ACCEPTED (Story 1.11); the full reveal at question close adds the opponent's pick, explanation and attribution
```
The last AC changes from "every correctness and point value comes from `QUESTION_REVEALED`" to:
```
every correctness and point value comes from `ANSWER_ACCEPTED` (1v1, own answer) or `QUESTION_REVEALED`
```

**Story 1.9, the `SNAPSHOT` AC.** Append to the `SNAPSHOT` fields:
```
, and in 1v1 modes her own accepted answer's result for the current question (`myAnswer {pickedIndex, correct, points}`), so a reconnect restores the instant feedback
```

**Story 1.10.** No change. The breakdown already carries everything, and the results open after the final reveal, which can now come early.

**Story 4.2 (Topic Duel).** In "the match runs exactly as in Stories 1.7–1.9", change "1.7–1.9" to "1.7–1.9 and 1.11 (early close, instant own feedback)".

**Story 5.4 (Battle Room).** After "…and one `QUESTION_REVEALED` per question…", add:
```
**And** the question closes early once every room participant still in the match has answered (Story 1.11), but `ANSWER_ACCEPTED` stays receipt-only in rooms: no player learns correctness or the answer before the question closes
```

**New story, inserted after Story 1.10 in Epic 1:**
```
### Story 1.11: Instant 1v1 feedback and early close

As Anju, playing a Quick Match or Topic Duel,
I want to know straight away whether my answer was right, and to move on as soon as we have both answered,
So that the match feels fast and responsive instead of making me wait out every 15 s.

**Requirements:** FR-4.5, FR-4.6 (amended), FR13 (amended), AD-5 (amended), AD-6 (amended), UX-DR31 (amended)

**Acceptance Criteria:**

**Given** an open question in any mode
**When** the last participant still in the match (not forfeited; bots included) has an accepted answer
**Then** the actor closes the question at once: it cancels the deadline timer, broadcasts `QUESTION_REVEALED`, holds for the mode's reveal hold and starts the next question; points are unchanged because they use each answer's own receive time (tested with N = 2 and N = 5, and with a silent bot, which leaves the window open to 15 s)

**Given** a 1v1 mode (Quick Match or Topic Duel)
**When** a player's answer is accepted
**Then** her private `ANSWER_ACCEPTED` carries `{questionIndex, correct, points, answerIndex}` from the shared `Scoring`; her opponent receives nothing but the `SCOREBOARD` "answered" (a test asserts the opponent's frames carry no pick, correctness or answer before `QUESTION_REVEALED`)

**Given** a Battle Room match
**When** an answer is accepted
**Then** `ANSWER_ACCEPTED` is exactly `{questionIndex}` (receipt only), as before

**Given** the live match screen in a 1v1 mode
**When** `ANSWER_ACCEPTED` with a result arrives
**Then** the player's own reveal band shows at once (correct: band drop, volt points, total, one strike through the flash scheduler; wrong: band naming the correct answer, own pick in brick), "Correct"/"Wrong" is announced politely, and the footer reads "Waiting for <opponent>…" until the question closes
**And** at `QUESTION_REVEALED` the opponent's pick, explanation and attribution are added with no second band drop or strike; the timer line freezes as soon as the question closes, even before the 15 s deadline; the reduced path is a 200 ms fade
**And** if the player did not answer, the Story 1.8 reveal applies unchanged

**Given** reconnect (Story 1.9)
**When** a `SNAPSHOT` is built in a 1v1 mode
**Then** it includes her own accepted answer's result for the current question

**Given** the contracts
**When** I inspect them
**Then** `AnswerAcceptedPayload` has optional `correct`, `points` and `answerIndex`, with golden samples for the 1v1 and room shapes and matching web parsers
```

### 4.4 UX (`ux-designs/ux-quiz-arena-2026-11-11/EXPERIENCE.md`)

**Component Patterns, Peak band**

OLD:
```
| Peak band | Reveal | Drops in when the window closes. Correct: bolt + volt + points. Wrong: no bolt or volt; the correct answer is always named. |
```
NEW:
```
| Peak band | Reveal | Drops in when the player's own result is known: at her accepted answer in 1v1 modes, at the question's close in Battle Room (or when she did not answer). Correct: bolt + volt + points. Wrong: no bolt or volt; the correct answer is always named. The question-close reveal adds the opponent's pick, explanation and attribution without a second drop or strike. |
```

**Screen states, Locked / waiting**

OLD:
```
| Locked / waiting | Live match | Locked option styled; footer "Locked in · result when time runs out"; no correctness hint. |
```
NEW:
```
| Locked / waiting | Live match | 1v1: own result band at once; footer "Waiting for <opponent>…" until the question closes. Battle Room: locked option styled; footer "Locked in · result when time runs out"; no correctness hint. |
```

**Real-time rules**

OLD:
```
- Correctness and explanation arrive only with `QUESTION_REVEALED`.
```
NEW:
```
- In Battle Room, correctness and explanation arrive only with `QUESTION_REVEALED`. In 1v1 modes, the player's own correctness, points and the correct answer arrive with `ANSWER_ACCEPTED`; the opponent's pick, explanation and attribution arrive with `QUESTION_REVEALED`. A question closes as soon as everyone has answered.
```

**Announcements, Reveal.** Add:
```
In 1v1 the result is announced at the accepted answer ("Correct. +800, total 3,140" / "Wrong. Answer: <option>"); the close adds nothing spoken unless the player did not answer.
```

**Key journey, step 3**

OLD:
```
3. Ten questions: tap → "Locked in" → the reveal band at the end of each window. One wrong answer names the correct one.
```
NEW:
```
3. Ten questions: tap → her result band at once (a strike when right) → as soon as both have answered, the opponent's pick and the explanation show and the next question follows. One wrong answer names the correct one.
```

### 4.5 Sprint tracking (`implementation-artifacts/sprint-status.yaml`)

Add `1-11-instant-1v1-feedback-and-early-close: backlog`, to be built next, before `1-9`.

## 5. Implementation Handoff

**Scope:** Moderate. The backlog gains one story and the planning documents are amended. No PM/Architect replan is needed; the owner made the product decision.

| Who | Responsibility |
|---|---|
| Developer (this session) | Apply the approved document edits above. Add Story 1.11 to `epics.md` and `sprint-status.yaml`. Open a planning PR. |
| Developer (`bmad-build`) | After PR #14 (Story 1.8) and PR #13 merge, build Story 1.11 next, then Story 1.9 |
| Product owner | Review and merge the planning PR; play Quick Match after Story 1.11 to confirm the pacing |

**Success criteria:**
- Both players answering quickly moves to the next question right after the 2 s hold.
- In Quick Match, a player sees right/wrong at her tap.
- An opponent never sees a pick or correctness before the close.
- Battle Room tests prove `ANSWER_ACCEPTED` stays receipt-only.
- Scores are identical whether a question closes early or at 15 s.

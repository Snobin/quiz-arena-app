# Input Reconciliation — Product Brief

**Source:** `_bmad-output/planning-artifacts/briefs/brief-quiz-arena-2026-11-10/brief.md`
**Against:** PRD `prd-quiz-arena-2026-11-10/prd.md`

## Gaps

### 1. Monetization posture not stated in PRD (medium)
The brief explicitly states the MVP is free for all users (no paywalls), and names coaching center B2B analytics as the durable revenue model. The PRD only references monetization in passing (FR-8.8 defers custom topic limits to Phase 2). The PRD has no section or statement confirming "free at MVP." A downstream architect designing the auth/subscription layer has no signal here.

**Fix:** Add a one-line Monetization note in Section 1 (Overview) or Section 8 (Out of Scope): "MVP is free to all users; no paywall at launch. First monetization experiment TBD post-launch data."

### 2. Vision / long-term platform direction missing (low)
The brief has an explicit Vision section: Minnal becomes the default Kerala quiz platform (school competitions, college circuits, general trivia) — the Lichess analogy. The PRD has no equivalent. This matters for the architect when making content-agnostic vs PSC-specific design decisions (e.g. question schema flexibility, topic taxonomy).

**Fix:** Add a brief Vision paragraph to Section 1 or as a standalone Section 12.

### 3. "Show question sources where possible" not in FRs (low)
The brief's risk posture for wrong answers includes "show question sources where possible." FR-3 covers the report button and admin review but does not capture surfacing source attribution on questions.

**Fix:** Add FR-3.7: "Where a question source is recorded, it is displayed to the player on the match result screen."

### 4. Session duration target missing (low)
The brief states "the whole session is under four minutes" as a design intent. This is a UX constraint that matters to the architect (question count × time per question × transitions). The PRD captures 10 questions × 15 seconds = 150 seconds of question time but does not state the overall session target, leaving transition/lobby time unconstrained.

**Fix:** Add a note to FR-4.4 or NFR section: "Total Quick Match session (lobby → last result screen) targets under 4 minutes."

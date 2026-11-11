# Input Reconciliation — Brainstorm

**Source:** brainstorm-intent.md
**Against:** prd.md
**Date:** 2026-11-10

---

## Gaps Found

### 1. Monetization posture not stated in PRD (medium)
Brainstorm explicitly states: "Launch: Free for all users. No paywalls at MVP." The PRD never makes this explicit at a product level — FR-8.8 mentions custom topics are free at MVP, but there is no statement in Overview, Goals, or a dedicated section that the entire app is free at launch. A downstream architect designing auth or account tiers needs to know this.

### 2. Platform expansion intent not reflected as a design constraint (low-medium)
Brainstorm flags: "PSC is the entry wedge, but the platform is designed to expand to school/college/general knowledge competitions without a rebrand." The PRD's Overview mentions this in passing but no FR or NFR reflects the architectural implication — e.g., the question bank schema and tagging system (FR-3.1) only names PSC-specific tags (exam level: 10th/degree/other). An architect building the question bank data model needs to know it must support non-PSC content categories from day one, or will need a migration.

### 3. "Battle-only, zero courses" is a product guardrail, not just positioning (low)
Brainstorm states this as a differentiator and an intentional product constraint. The PRD describes what is in scope but never explicitly rules out content/learning features as a guardrail. A "no learning content ever shipped on this platform" note in Section 8 (Out of Scope) would prevent scope creep and give a future contributor a clear north star.

### 4. WhatsApp-culture fit as a UX tone signal dropped (low)
Brainstorm insight: "The free-for-all room mechanic maps directly onto how Kerala coaching batches already coordinate informally — lowest friction adoption path." This is a qualitative UX directive — Battle Room entry/join flow should feel as instant as sharing a WhatsApp link, not like joining a formal lobby. This tone is absent from the PRD and would be useful for the UX designer.

---

## Already Covered

- All three game modes (Quick Match, Topic Duel, Battle Room) — ✅ FR-4/5/6
- Bot fallback — ✅ FR-4.2
- Effortless spaced repetition framing — ✅ Overview, Section 5 Users
- Coaching center as B2B distribution — ✅ Section 5, Goals
- Core differentiators — ✅ Section 2 Competitive Context
- ELO/leaderboard patterns — ✅ FR-10

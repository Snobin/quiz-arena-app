# PRD Quality Review — Minnal (മിന്നൽ)

## Overall verdict

The PRD is solid and decision-ready on its core mechanics — specific thresholds, resolved open questions, honest scope boundaries, and no persona or NFR theater — but has three fixable gaps: FR-11.3's ambiguous review queue ownership (who submits questions?), a missing question-count range in FR-6.7, and no explicit monetization statement anywhere in the document.

---

## 1. Decision-readiness — **strong**

Trade-offs are stated as decisions, not smoothed over. Guest vs. registered access is explicit. PYQ legal risk is accepted with named mitigation. Bot timing choice (randomised, not difficulty-adaptive) is recorded. ELO parameters are specific. The counter-metrics in §4 are genuinely protective (bot rate + median queue time together; session depth = completed only).

### Findings
- **medium** §4 / §Overview — No explicit statement that the platform is free at MVP. "Free at MVP" appears only as a footnote in FR-8.8 (custom topics). A decision-maker reading §4 Goals or §1 Overview cannot determine the monetization posture without hunting. *Fix:* Add one sentence to §1 Overview or add a Monetization Posture row to §4.

---

## 2. Substance over theater — **strong**

Competitive context is earned — specific named apps, specific gaps. User segments are lean (two, no persona theater). NFRs carry product-specific thresholds (200 ms, 500 ms, 5 s, 2 GB RAM, 3G). The differentiation story ("battle-only, zero courses") is specific to this product.

### Findings
- **low** §1 Overview — The core thesis (competition = disguised spaced repetition; battle-only = tighter product loop) is implied but never stated as the bet the product is making. For §1, one explicit thesis sentence would sharpen downstream alignment. Not a blocker; the brief captures it.

---

## 3. Strategic coherence — **adequate**

Features clearly serve the battle-first thesis. Coaching center distribution is acknowledged as a B2B success metric and reflected in Battle Room design. Counter-metrics are named.

### Findings
- **medium** §6 FR-8 / §1 Overview — Custom Topics (private personal study decks) sits somewhat outside the battle-only identity without explanation. The PRD adds it without connecting it back to the thesis. A reader could reasonably ask: "does this dilute the battle-only focus?" *Fix:* One sentence in §1 or FR-8 intro noting this is a personal utility layer, not a community/battle feature — monetizable later and kept off the core battle loop.
- **medium** §5 Users (Secondary) — Coaching centers are named as the "primary acquisition lever for student users" and a "later B2B customer," but the PRD has no Success Metric for the acquisition mechanism itself (e.g., students acquired per coaching center onboarded). The B2B traction metric (5 centers in 60 days) measures adoption but not the downstream funnel. Low priority for MVP, but worth a [NOTE FOR PM].

---

## 4. Done-ness clarity — **adequate**

Most FRs have testable consequences. Several are fuzzy:

### Findings
- **high** §6 FR-11.3 — "Submitted questions enter a pending state; admin reviews and publishes or rejects." The word *submitted* implies someone other than the admin is submitting questions, but FR-11 covers only admin actions. If this is admin self-staging-before-publish, say so. If users can submit questions, there are missing FRs. An engineer cannot implement this without knowing who the submitter is. *Fix:* Clarify: "Admin-added questions enter a draft/pending state; admin reviews and publishes from that queue." Or add user-submission FRs if that is the intent.
- **high** §6 FR-6.7 — "Host-configurable question count, default 10" — no min or max range stated. An engineer cannot build the UI control or validate the input without bounds. *Fix:* Add a range, e.g., "between 5 and 30 [ASSUMPTION]."
- **medium** §6 FR-8.8 — "Fair-use cap at 50 topics / 500 questions, enforced softly" — "enforced softly" is not testable. Does this mean: a warning UI at 80% capacity? Silent rejection at the cap? An admin alert? *Fix:* Define the enforcement behaviour, even if [ASSUMPTION]: e.g., "user sees a warning at 40 topics; import is blocked at 50 with a prompt to delete topics."
- **medium** §6 FR-9.3 — "Rematch" is unambiguous for 1v1 (Quick Match, Topic Duel) but undefined for Battle Room (3+ players). Does rematch mean the same room restarts? A new room code is issued? Only the host can trigger it? *Fix:* Add a [NOTE FOR PM] or scope rematch to 1v1 modes only for MVP.
- **low** §7 NFR Performance — "Live scoreboard update propagation < 500 ms after answer received" covers score delivery but not question delivery synchronisation. For Battle Room, players must see each question simultaneously (FR-6.5). No latency bound on question-reveal synchronisation is stated. *Fix:* Add a question-synchronisation NFR, e.g., "all players receive a question within 100 ms of the server broadcasting it [ASSUMPTION]."

---

## 5. Scope honesty — **strong**

Out of Scope section is explicit and phased. ASSUMPTION tags are present throughout. PYQ legal risk is accepted with named posture. No silent omissions detected.

### Findings
- **low** §6 FR-1.5 / §7 — What happens to guest match data server-side? FR-1.5 says guest ratings and history are not persisted to the user, but it doesn't say whether the match itself is logged for analytics. For a solo dev, this matters: logging every guest match is infrastructure cost. Not a blocker, but worth tagging. *Fix:* Add [ASSUMPTION: guest match data is not retained server-side beyond the session] or confirm analytics logging intent.

---

## 6. Downstream usability — **adequate**

No Glossary. Terms used consistently (Quick Match, Topic Duel, Battle Room, custom topic) but undefined. PSC domain terms (LGS, LDC, 10th-level, degree-level) appear without definition. Cross-references are sparse but present where they matter (FR-8.7 → FR-7, FR-6.4; FR-3.5 → FR-11.5).

### Findings
- **medium** — No Glossary. Domain terms (PSC, LGS, LDC, 10th-level, degree-level, PYQ) will be opaque to an architect or story writer unfamiliar with Kerala PSC. *Fix:* Add a brief Glossary section (5–8 terms) at the end.
- **low** §6 FR-4 — FR-4.9 is out of sequence. It was added after FR-4.3 in the file but carries ID FR-4.9, creating a non-contiguous read order (4.1, 4.2, 4.3, 4.9, 4.4, 4.5…). Downstream referencing by ID will be confusing. *Fix:* Renumber FR-4.9 to FR-4.4 and shift existing FR-4.4–FR-4.8 up by one.

---

## 7. Shape fit — **strong**

Appropriate shape for a launch-level solo-dev product. No UJ section (correct — this is feature-capability-driven, not consumer-journey-heavy). No over-formalization. Rigor matches stakes. The coaching center use case gets proportionate treatment.

---

## Mechanical notes

- **ID continuity:** FR-4.9 out of sequence (see §6 finding above).
- **Assumptions Index:** Seven inline `[ASSUMPTION]` tags present (FR-2.3, FR-4.1, FR-4.8, FR-6.2, FR-7 NFRs ×2, FR-8.8, FR-10.4) but no collected index. For downstream epics creation, an Assumptions Index section makes all inferences visible at a glance. Low priority but worth adding at finalize.
- **Glossary drift:** None detected — terms used consistently throughout.
- **Required sections present:** Yes for agreed stakes (launch, solo dev, chain-top).

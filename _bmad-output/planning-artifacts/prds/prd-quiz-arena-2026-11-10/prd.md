---
title: "Minnal (മിന്നൽ) — Product Requirements Document"
status: final
created: 2026-11-10
updated: 2026-11-10
---

# Minnal (മിന്നൽ) — Product Requirements Document

---

## 1. Overview

Minnal (lightning in Malayalam) is a live quiz battle platform for Kerala, launching on Kerala PSC exam content. Aspirants compete in real-time matches against other players or intelligent bots; learning happens as a side effect of competing, not through deliberate study.

The first version is a web PWA targeting PSC aspirants across all exam levels, with 10th-level candidates (LGS, LDC) as the primary launch segment. Three live game modes ship at MVP alongside solo practice and a private custom topic system. The coaching center market — which already runs informal batch battles on WhatsApp — is the primary B2B distribution channel and a future revenue source.

**Platform:** Web PWA (mobile-first)
**MVP target:** Phase 1

### Vision

If Minnal works for PSC aspirants, it becomes the default practice arena for competitive quiz culture in Kerala — school interschool competitions, college quiz circuits, general knowledge battles among friends. The platform does not need to rebrand for any of this; it is already Kerala-first and content-agnostic by design.

Coaching centers that start using Battle Room for free become paying customers once the analytics dashboard ships. In three years, Minnal is the app Kerala quizzers use the way chess players use Lichess: a platform that belongs to the community, not a course product that happens to have a practice mode.

---

## 2. Business Model

**MVP:** Entirely free, no paywalls. Acquire users and validate retention before monetizing.

**Phase 2 — B2B:** Coaching centers pay for a dashboard: batch management, student progress tracking, question-set curation. Centers already want this; they will start using Battle Room for free and convert when analytics ship.

**Phase 2 — Consumer:** Custom topic tiers (free tier with limits, premium for unlimited). Specific limits and pricing deferred to Phase 2.

**Phase 3:** Premium subscription plan (content, features TBD at Phase 3 planning).

No investor funding assumed; solo developer building toward a sustainable B2B-led model.

---

## 3. Competitive Context

| App | Category | Battle mechanic | Gap vs. Minnal |
|---|---|---|---|
| PSC Challenger | Course + practice bundle | 1v1 battles exist, buried in heavy course UI | Bloated surface; battle is an add-on, not the core; reported slow |
| Kerala Quiz Battle (mypsclife) | Battle-first PSC | 1v1, bot fallback, time-based scoring, monthly leaderboard | No group/room mode; no custom topics; no coaching center angle |
| Prepscale | Video-first learning | Live tests only, no multiplayer | Not a direct battle competitor |
| Quiz Buzz | Casual quiz | 1v1 + mock tests | Smaller footprint, no PSC depth |

**Confirmed gaps no competitor fills:** N-player live Battle Room for PSC content; coaching center as distribution channel; user-defined custom topic sets; per-mode separate rating tracks.

---

## 4. Problem

PSC preparation in Kerala spans years, and the daily practice loop is grinding and lonely. Mock test apps deliver questions in silence — no opponent, no tension, no sense of winning. Many aspirants start strong and quietly stop.

Coaching centers have found a workaround: batch battles on WhatsApp, where teachers post questions and students race to answer first. It works — students stay engaged — but it is unstructured and untracked. No scores persist, no weak topics surface, and the teacher is the matchmaker, referee, and scorekeeper.

---

## 5. Goals & Success Criteria

### Primary Goals

| Goal | Metric | Target |
|---|---|---|
| Habit formation | 7-day return rate after first match | 40%+ |
| Session depth | Completed matches per session | ≥ 2 |
| Real opponent availability | Quick Match sessions ending with bot | < 60% at 90 days |
| B2B traction | Coaching centers actively using Battle Room | ≥ 5 within 60 days of launch |

### Technical Goals

| Requirement | Target |
|---|---|
| Answer confirmation latency | < 200 ms for Kerala players |
| Device support | Usable on 3G and 2 GB RAM Android |
| Uptime | ≥ 99.5% [ASSUMPTION: standard SLA for a solo-operated app at launch] |

### Counter-metrics

- Bot rate must not be gamed by artificially slowing matchmaking — track median queue wait time alongside bot rate
- Session depth must not be inflated by empty or incomplete matches — count only fully completed matches

---

## 6. Users

### Primary — PSC Aspirants

Kerala has hundreds of thousands of active PSC candidates. The 10th-level cohort (LGS, LDC, and similar posts) is the largest and most price-sensitive: on cheap Android phones, mobile data, and long preparation timelines. Degree-level candidates are a secondary segment within the same launch.

Their core job: feel like they are making real progress — not grinding. Competitive wins, leaderboard movement, and fast feedback deliver this; content volume alone does not.

### Secondary — Coaching Center Teachers and Owners

They already run informal batch battles. They need a tool that is instant to set up, keeps score automatically, and shows which students are struggling and on which topics. They are not early users — they are the later B2B customer and the primary acquisition lever for student users.

---

## 7. Features & Functional Requirements

### FR-1: Authentication

| ID | Requirement |
|---|---|
| FR-1.1 | Phone number + OTP sign-in. **Required, but deferred until SMS budget allows** (about ₹5 per OTP via Firebase, or about ₹0.20 via a DLT-registered Indian gateway). MVP launches with Google sign-in (FR-1.2) only; the login design leaves room to add OTP without rework |
| FR-1.2 | Google OAuth sign-in |
| FR-1.3 | Guest play — no account required; guest access is limited to Quick Match only |
| FR-1.4 | After completing a Quick Match as guest, the app prompts registration with match result as the hook |
| FR-1.5 | Guest ratings and match history are not persisted across sessions |

### FR-2: User Profile

| ID | Requirement |
|---|---|
| FR-2.1 | Profile fields: display name, district, exam target level |
| FR-2.2 | Per-mode rating displayed separately: Quick Match rating, Topic Duel rating, Battle Room rating |
| FR-2.3 | Match history: last 20 completed matches with result, mode, and rating delta [ASSUMPTION: N = 20] |

### FR-3: Question Bank

| ID | Requirement |
|---|---|
| FR-3.1 | Questions tagged by: content category (e.g. Kerala PSC, school quiz, general Kerala — schema supports non-PSC categories from day one), subject, topic, exam level (10th / degree / other), difficulty |
| FR-3.2 | Each question supports Malayalam and English text; player language preference applied at display |
| FR-3.3 | Every question has: question text, exactly 4 options, correct answer index, explanation |
| FR-3.4 | Questions are never transmitted to the client before the answer window opens for that question |
| FR-3.5 | Registered users can report any question via a "report" button; reports go to admin review queue |
| FR-3.6 | Initial bank: Kerala PSC previous year questions (PYQs), admin-reviewed before publish |
| FR-3.7 | Question source attribution displayed where available (e.g. "Kerala PSC LDC 2019") to support trust and correction |

### FR-4: Quick Match

| ID | Requirement |
|---|---|
| FR-4.1 | 1v1 real-time match; server matches players within a similar rating band [ASSUMPTION: ±200 ELO]; initial rating 1200, K-factor 32 |
| FR-4.2 | If no opponent is found within ~8 seconds, a bot opponent joins automatically |
| FR-4.3 | Bot presence is transparently indicated with a bot badge on the opponent slot |
| FR-4.4 | Bot answer timing is randomised per question — not a fixed delay and not tied to difficulty |
| FR-4.5 | Match: 10 questions, 15 seconds per question, speed-weighted scoring (faster correct answer = more points) |
| FR-4.6 | Scoring is computed server-side. In 1v1 modes (Quick Match, Topic Duel) a player receives her own answer's correctness, points and the correct answer as soon as her answer is accepted; her opponent receives only that she answered. The full reveal (both picks, explanation, attribution, totals) comes when the question closes: when every participant still in the match has answered, or when the 15 s window ends, whichever comes first |
| FR-4.7 | Available to both registered users and guests |
| FR-4.8 | Quick Match rating updates after each match for registered users; guest ratings are not persisted |
| FR-4.9 | Questions drawn from the PSC bank across all subjects [ASSUMPTION: mixed-subject draw for Quick Match] |

### FR-5: Topic Duel

| ID | Requirement |
|---|---|
| FR-5.1 | Registered users only — not available to guests |
| FR-5.2 | Player selects a subject/topic before entering the matchmaking queue |
| FR-5.3 | Both players in the match are served questions from that selected topic |
| FR-5.4 | Bot fallback applies on the same ~8-second timer as Quick Match |
| FR-5.5 | Topic Duel rating is tracked separately from Quick Match rating |
| FR-5.6 | Same match format as Quick Match: 10 questions, 15 seconds each, speed-weighted scoring |

### FR-6: Battle Room

| ID | Requirement |
|---|---|
| FR-6.1 | Registered users only — not available to guests |
| FR-6.2 | Host creates a room and receives a shareable room code; room codes expire after 24 hours or when the match ends, whichever comes first |
| FR-6.3 | Players join via room code; minimum 2 players required to start |
| FR-6.4 | Host selects the question source before starting: PSC bank (filtered by topic) or one of the host's custom topics |
| FR-6.5 | Host configures question count before starting; default 10, minimum 5, maximum 30 |
| FR-6.6 | Host starts the match; all players see the same question simultaneously |
| FR-6.7 | Live scoreboard is visible to all players throughout the match |
| FR-6.8 | Match format: host-configured question count (FR-6.5), 15 seconds each, speed-weighted scoring |
| FR-6.9 | Battle Room rating is tracked separately from Quick Match and Topic Duel ratings. Only rooms using PSC bank questions change ratings; rooms using a custom topic are unrated (prevents farming rating on self-written quizzes) but still appear in match history |
| FR-6.10 | No bot fill in Battle Room — human players only |

### FR-7: Solo Practice

| ID | Requirement |
|---|---|
| FR-7.1 | Registered users only — not available to guests |
| FR-7.2 | Player selects a topic from the PSC bank or from their own custom topics |
| FR-7.3 | No timer — questions presented one at a time at the player's own pace |
| FR-7.4 | Correct answer and explanation are shown immediately after each answer |
| FR-7.5 | No rating change from Solo Practice sessions |

### FR-8: Custom Topics

| ID | Requirement |
|---|---|
| FR-8.1 | Registered users only |
| FR-8.2 | User creates a named custom topic and imports questions via a JSON payload |
| FR-8.3 | JSON schema: `{ "topic": string, "questions": [{ "question": string, "options": [string × 4], "answer": 0–3, "explanation": string }] }` |
| FR-8.4 | The app validates JSON on import: schema conformance, minimum 1 question, all required fields present; validation errors surfaced with field-level messages |
| FR-8.5 | Custom topics are private — visible only to the creating user, never to other players or in public leaderboards |
| FR-8.6 | User can view, edit (re-import JSON), and delete their custom topics |
| FR-8.7 | Custom topics are available as a question source in Solo Practice (FR-7) and as the host question source in Battle Room (FR-6.4) |
| FR-8.8 | Free at MVP; fair-use cap: 50 topics / 500 questions per user [ASSUMPTION]; when a user approaches the cap (≥ 80%), the app shows a warning in the UI; imports that would exceed the hard limit are blocked with a clear message; explicit monetization tiers deferred to Phase 2 |
| FR-8.9 | The app surfaces a JSON schema reference and a sample GPT prompt inline in the custom topic creation UI |

### FR-9: Match Results

| ID | Requirement |
|---|---|
| FR-9.1 | Post-match screen shown to all participants immediately after the last question |
| FR-9.2 | Screen shows: final scores for all participants, per-question breakdown (player answer, correct answer, explanation, source attribution if available), rating delta for registered users |
| FR-9.3 | For 1v1 modes (Quick Match, Topic Duel): "Rematch" action starts a new match with the same opponent. For Battle Room: "Play again" creates a new room with the same question source pre-selected. Both modes provide "Return home." |

### FR-10: Ratings & Leaderboards

| ID | Requirement |
|---|---|
| FR-10.1 | Three independent rating tracks: Quick Match, Topic Duel, Battle Room |
| FR-10.2 | Rating algorithm: standard ELO, K-factor 32, initial rating 1200 for all new users across all modes |
| FR-10.3 | Leaderboards: daily, weekly, all-time — scoped per mode |
| FR-10.4 | Leaderboard scope: all-Kerala at launch; district-level deferred to Phase 2 |
| FR-10.5 | Guest play does not affect leaderboards |

### FR-11: Admin Panel

| ID | Requirement |
|---|---|
| FR-11.1 | Add, edit, and delete individual questions |
| FR-11.2 | Bulk upload questions via CSV |
| FR-11.3 | Admin-added questions (via UI or bulk upload) enter a draft/pending state by default; admin explicitly publishes or discards from the review queue — there is no external question submission path in MVP |
| FR-11.4 | Question tagging interface: content category, subject, topic, exam level, difficulty, source attribution |
| FR-11.5 | Reported questions (FR-3.5) surface in a separate admin review queue with the reporter's note |

---

## 8. Non-Functional Requirements

### Performance

| Requirement | Target |
|---|---|
| Answer submission → server confirmation round-trip | < 200 ms (Kerala players on mobile data) |
| Live scoreboard update propagation | < 500 ms after answer received [ASSUMPTION] |
| App initial load on 3G | < 5 seconds [ASSUMPTION] |
| Minimum supported device | Android with 2 GB RAM, 3G connection |
| Quick Match and Topic Duel session duration | ≤ 4 minutes end-to-end (10 questions × 15 seconds + result screen). A question closes early once every participant has answered, so typical matches are much shorter |

### Security

| Requirement | Rationale |
|---|---|
| Server-side question sequencing and timing | Client must never receive a question before its window opens, nor any other participant's correctness or pick before the question closes. In Battle Room no client receives the correct answer before the question closes; in 1v1 modes a player receives her own correctness and the correct answer only after her own answer is accepted |
| Server-side scoring | Score cannot be manipulated client-side |
| Rate limiting on answer submissions | Prevents scripted answer flooding |
| Room code entropy | Room codes must be difficult to guess; collision resistance for concurrent sessions |

### Reliability

| Requirement | Target |
|---|---|
| Uptime | ≥ 99.5% [ASSUMPTION] |
| Match recovery | If a player disconnects mid-match, she has 10 seconds to reconnect and resume where the match is. After that, or at once if she leaves, she forfeits. In a 1v1 match a forfeit ends the match at once: the remaining player wins and the leaver loses, whatever the score, even before the first question is revealed. The exception is a match against the bot, which a leave before the first reveal aborts (not counted). In a Battle Room the match continues for the others, and a player who quits after the first question still takes the result her score earned |

### Accessibility & Localisation

| Requirement | Note |
|---|---|
| Questions in Malayalam and English | Player selects preferred language in profile |
| PWA installable | Meets PWA installability criteria for Android Chrome |

---

## 9. Out of Scope — MVP

The following are explicitly deferred or excluded. Items marked **[NEVER]** are product-level guardrails, not just phase deferrals.

**[NEVER] — not part of this product's identity**
- Video courses, lecture content, or any non-battle learning mode
- Content library browsing (notes, syllabi, PDFs)
- Instructor/student course management

**Deferred — budget-gated (add when funds allow, not tied to a phase)**
- Phone number + OTP sign-in (FR-1.1)

**Phase 2**
- Weak-topic report and spaced-repetition revision queue
- District and college leaderboards
- Private coaching center dashboard and student analytics
- Daily challenge and streaks
- Custom topic monetization tiers (limits, paywall)

**Phase 3**
- Android and iOS native apps
- Tournaments with scheduled start times
- Premium subscription plan

---

## 10. Open Risks

| Risk | Posture |
|---|---|
| PYQ sourcing legal exposure | Accepted bootstrapping risk common in this ecosystem; questions admin-reviewed before publish; source attribution shown where available; report button for corrections; original content is the long-term path |
| Thin player base early — most Quick Matches go to bots | Bot fallback from day one; Battle Room via coaching centers concentrates players; scheduled events in Phase 3 |
| Wrong answers erode trust quickly | Admin review before publish; report button; source attribution (FR-3.7) |
| Cheating: scripted answers, timing exploits | Server-side timer and scoring; answers never sent to client before time expires; rate limiting |
| Scope too large for a solo developer | Web PWA MVP first; mobile native in Phase 3 only; each phase gated on the previous one shipping |
| Custom topic JSON abuse (very large imports) | Hard cap with UI warning (FR-8.8); schema validation on import |

---

## 11. Open Questions

None block the start of development. Both should be settled before public launch.

| Question | Needed by |
|---|---|
| What does India's DPDP Act require for account and data deletion (beyond removing the user from leaderboards and play)? | Public launch |
| How do we count "coaching centers actively using Battle Room" (goal: ≥ 5 within 60 days) when MVP has no coaching-center account? Options: ask hosts to tag a room with their center name, or track repeat hosts with many players | Launch analytics |

---

## 12. Phased Roadmap Summary

| Phase | Scope |
|---|---|
| Phase 1 — MVP (Web PWA) | Auth, profile, PSC question bank, Quick Match, Topic Duel, Battle Room, Solo Practice, Custom Topics (private, JSON), match results, per-mode ratings, all-Kerala leaderboards, admin panel |
| Phase 2 | Weak-topic report, spaced-repetition queue, district/college leaderboards, coaching center dashboard + analytics, daily challenge + streaks, custom topic monetization |
| Phase 3 | Native Android + iOS apps, scheduled tournaments, premium subscription |

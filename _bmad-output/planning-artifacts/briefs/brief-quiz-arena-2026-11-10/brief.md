---
title: "Minnal (മിന്നൽ) — Product Brief"
status: final
created: 2026-11-10
updated: 2026-11-10
---

# Product Brief: Minnal (മിന്നൽ)

## Executive Summary

Minnal — lightning in Malayalam — is a live quiz battle platform for Kerala, launching on Kerala PSC exam content. Aspirants compete in real-time matches against other players or intelligent bots; learning happens as a side effect of competing, not through deliberate study. The app fills a clear gap: PSC Challenger and Prepscale bundle courses and content libraries; Minnal is battle-only, leaner, and culturally rooted in Kerala.

The first version is a web app (PWA) targeting PSC aspirants across all exam levels, with 10th-level candidates as the primary launch segment. Three game modes ship at MVP: Quick Match (1v1 with bot fallback), Topic Duel (1v1, topic-locked), and Battle Room (2–N players, free-for-all, live scoreboard). The Battle Room mechanic formalises something coaching centers already do informally on WhatsApp — making those centers a natural B2B distribution channel and a future revenue source.

PSC is the entry wedge. The platform is designed from the start to expand to school and college quiz circuits, general Kerala trivia, and broader competitive exam content — without a rebrand, because Minnal's identity is Kerala-first, not exam-specific.

## The Problem

PSC preparation in Kerala is a long game — often years — and the daily practice loop is grinding and lonely. Mock test apps deliver questions in silence; there is no opponent, no tension, no sense of winning. Many aspirants start strong and quietly stop.

Meanwhile, coaching centers have stumbled onto a workaround: batch battles on WhatsApp, where teachers post questions and students race to answer first. It works. Students stay engaged. But it is clunky, unstructured, and untracked. No scores persist. No weak topics surface. The teacher is the matchmaker, referee, and scorekeeper.

## The Solution

Minnal turns daily practice into short live matches. A player taps Quick Match, the server finds an opponent with a similar rating, and both see the same 10 questions one at a time — 15 seconds each. Faster correct answers score more. After the last question, both players see scores, correct answers, and an explanation for each. Ratings and leaderboards update. The whole session is under four minutes.

If no human opponent appears within about eight seconds, a bot joins — same question set, realistic answer timing, transparent bot badge. Single players never wait empty-handed; the battle format is preserved.

Battle Room extends this to groups: a room code, 2–N players, a live scoreboard everyone can see. It is the WhatsApp batch battle, but tracked, scored, and instant to set up.

The learning mechanism is competition itself: the same questions recur across matches, the pressure of a live opponent drives focus, and leaderboard movement signals real progress. No explicit study UX is needed.

## What Makes This Different

**Battle-only, zero courses.** Every competitor bundles learning content alongside practice. Minnal does not. The product surface is smaller and the core loop is tighter.

**Battle Room mode.** No PSC competitor formalises the free-for-all group format. Coaching centers already want this; Minnal is the tool they would pay for.

**Coaching center distribution.** B2C acquisition in this space requires heavy spend. Minnal's path is B2B-first: sign up a center, its entire batch follows. Teachers become champions, not targets.

**Kerala-first identity.** The name is Malayalam, the brand is culturally rooted, and the platform is designed for natural expansion to school and college quiz culture already thriving in Kerala — without rebranding as a PSC-specific product.

**Effortless spaced repetition.** Live competition with leaderboard stakes disguises the repetition. Players grind questions without feeling like they are grinding.

## Who This Serves

**Primary — PSC aspirants.** Kerala has hundreds of thousands of active PSC candidates across exam levels. The 10th-level cohort (LGS, LDC, and similar posts) is the largest and most price-sensitive; they are on cheap Android phones and mobile data. Degree-level candidates are a secondary segment within the same launch. Both want progress signals that feel real, not just question volume.

**Secondary — Coaching center teachers and owners.** They already run informal batch battles. They need a tool that is instant to set up, keeps score automatically, and lets them see which students are struggling and on which topics. They are not early users of Minnal — they are the later B2B customer and the primary acquisition channel for student users.

## Success Criteria

- **Retention:** 40%+ of users who complete a first match return within 7 days [ASSUMPTION: baseline; validate after launch]
- **Session depth:** average session includes at least 2 completed matches
- **Bot rate:** less than 60% of Quick Match sessions end with a bot opponent at 90 days post-launch
- **Coaching center adoption:** at least 5 coaching centers actively use Battle Room within 60 days of launch
- **Technical:** server receives and confirms answers in under 200 ms for Kerala players; app is usable on 3G and 2 GB RAM Android devices

## Scope

**In for MVP (web app, Phase 1)**

- Sign-in: phone OTP or Google; guest play
- Profile: name, district, exam target level
- Question bank in Malayalam and English, tagged by subject, topic, exam level, difficulty
- Admin panel: add, edit, bulk-upload (CSV), review and publish questions
- Quick Match: 1v1, real-time, bot joins if no opponent within ~8 seconds
- Topic Duel: 1v1, player selects subject
- Battle Room: 2–N players, room code, free-for-all live scoreboard
- Match result: score, correct answers, explanation per question
- Leaderboards: daily, weekly, all-Kerala
- Solo practice by topic (no timer pressure)

**Explicitly out of MVP**

- Weak-topic report and spaced-repetition revision (Phase 2)
- District and college leaderboards (Phase 2)
- Private coaching center dashboard and analytics (Phase 2)
- Daily challenge and streaks (Phase 2)
- Android and iOS native apps (Phase 3)
- Tournaments with scheduled start times (Phase 3)
- Premium plan (Phase 3)

Initial question bank: Kerala PSC PYQs (previous year questions), admin-reviewed before publishing; "report question" button for corrections. PYQ sourcing carries legal risk — see Open Risks.

## Open Risks

| Risk | Current posture |
|---|---|
| PYQ sourcing legal exposure | Accepted bootstrapping risk common in this ecosystem; questions admin-reviewed before publish; report button for corrections; monitor legal precedent in the space; original content is the long-term path |
| Thin player base early — most matches go to bots | Bot fallback from day one; Battle Room via coaching centers concentrates players; scheduled events later |
| Wrong answers erode trust quickly | Admin review before publish; report button; show question sources where possible |
| Cheating (scripted answers, timing exploits) | Server-side timer and scoring; answers never sent to client before time expires; rate limiting |
| Scope too large for a solo developer | Web app MVP first; mobile native in Phase 3 only; each phase gated on the previous one shipping |

## Vision

If Minnal works for PSC aspirants, it becomes the default practice arena for competitive quiz culture in Kerala — school interschool competitions, college quiz circuits, general knowledge battles among friends. The platform does not need to rebrand for any of this; it is already Kerala-first and content-agnostic by design.

Coaching centers that start using Battle Room for free become paying customers once the analytics dashboard ships. That B2B layer — batch management, student progress tracking, question-set curation — is the durable revenue model.

In three years, Minnal is the app Kerala quizzers use the way chess players use Lichess: a platform that belongs to the community, not a course product that happens to have a practice mode.

---
id: SPEC-quiz-arena
companions:
  - game-modes.md
  - question-content.md
  - metrics.md
  - glossary.md
  - ../planning-artifacts/architecture/architecture-quiz-arena-2026-11-10/ARCHITECTURE-SPINE.md
  - ../planning-artifacts/prds/prd-quiz-arena-2026-11-10/addendum.md
  - ../planning-artifacts/ux-designs/ux-quiz-arena-2026-11-11/DESIGN.md
  - ../planning-artifacts/ux-designs/ux-quiz-arena-2026-11-11/EXPERIENCE.md
sources:
  - ../planning-artifacts/prds/prd-quiz-arena-2026-11-10/prd.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Minnal (മിന്നൽ) — Phase 1 MVP

## Why

**Pain + opportunity.** Kerala PSC preparation runs for years, and mock-test apps are silent and lonely, so many aspirants quit. Coaching centers already keep students engaged with informal WhatsApp "batch battles", but those battles are unscored, untracked, and the teacher has to referee by hand. Minnal makes competition the core loop: live quiz battles against players or bots, where learning is a side effect of trying to win. The primary launch segment is 10th-level aspirants (LGS, LDC) on cheap Android phones and mobile data; degree-level aspirants are secondary. Coaching centers are the distribution channel at launch and the future paying customer. The longer-term vision is the default competitive-quiz arena for Kerala, a community platform rather than a course product.

## Capabilities

- **CAP-1** — Sign-in and guest access
  - **intent:** A player can sign in with Google, or play Quick Match as a guest without an account and be invited to register afterwards.
  - **success:** A Google sign-in creates or resumes an account. A guest can play only Quick Match; the guest's rating and history are discarded when the session ends; after a guest's match, the results screen shows a registration prompt that uses the result as the hook.

- **CAP-2** — Player profile
  - **intent:** A registered player has a profile with display name, district, exam target level, and question language, and can see their standing in each mode.
  - **success:** The profile shows three separate ratings (Quick Match, Topic Duel, Battle Room) and the last 20 completed matches, each with result, mode, and rating delta.

- **CAP-3** — Trusted question bank
  - **intent:** Players get bilingual Kerala PSC questions that carry an explanation and source attribution, and can flag a question they think is wrong.
  - **success:** Every served question has text in Malayalam and/or English, exactly 4 options, one correct answer, an explanation, tags per `question-content.md`, and attribution where available. A registered player's report reaches the admin report queue with their note. No client receives a question before its answer window opens.

- **CAP-4** — Quick Match
  - **intent:** Any player can start a 1v1 live match against a similarly rated opponent, with a bot filling in when nobody is available.
  - **success:** Matchmaking runs as specified in `game-modes.md`. A bot joins after about 8 s without a human opponent and is visibly badged. The match is 10 questions × 15 s with speed-weighted scoring and finishes in ≤ 4 minutes.

- **CAP-5** — Topic Duel
  - **intent:** A registered player can pick a subject/topic and fight a 1v1 match drawn only from that topic.
  - **success:** Both players get questions from the selected topic only. Bot fallback and the match format are the same as Quick Match. The result updates only the Topic Duel rating.

- **CAP-6** — Battle Room
  - **intent:** A registered host can open a room, share a code, and run a live match for a group, the way a coaching center runs a WhatsApp batch battle.
  - **success:** The host gets a hard-to-guess code plus a join link that opens the room directly. 2–50 humans join, with no bots; the host plays too and counts toward the 2. The host picks the question source (PSC bank by topic, or one of the host's custom topics) and a count of 5–30 (default 10), then starts. Everyone sees the same question at the same moment, and a live scoreboard updates within 500 ms. Codes expire at match end or after 24 h. Only bank-question rooms change Battle Room ratings.

- **CAP-7** — Solo Practice
  - **intent:** A registered player can practise a chosen topic at their own pace.
  - **success:** Questions come one at a time from a bank topic or one of the player's own custom topics, with no timer. The correct answer and explanation appear immediately after each answer. Ratings never change.

- **CAP-8** — Custom Topics
  - **intent:** A registered player can create private topics by importing questions as JSON, for example generated with an LLM.
  - **success:** Imports that break the schema in `question-content.md` are rejected with field-level errors. Valid topics are visible only to their owner and can be viewed, re-imported, and deleted. They can be used in Solo Practice and as a Battle Room source, and never in Quick Match or Topic Duel. The fair-use caps warn at ≥ 80% and block any import that would exceed them. The creation screen shows the schema reference and a sample GPT prompt.

- **CAP-9** — Match results
  - **intent:** Every participant sees the result immediately after the last question and can play again.
  - **success:** The results screen shows final scores for everyone; a per-question breakdown with the player's answer, the correct answer, the explanation, and attribution; and the rating delta for registered players. 1v1 modes offer Rematch (same opponent). Battle Room offers Play again (a new room with the same source). Every mode offers Return home. On a bank question's breakdown row, registered players get "Practise this topic", which opens Solo Practice on that topic.

- **CAP-10** — Ratings and leaderboards
  - **intent:** Registered players climb separate ratings for each live mode and compare themselves with all of Kerala.
  - **success:** There are three independent ELO tracks (K = 32, start 1200). Each mode has a daily, weekly, and all-time all-Kerala leaderboard. Guest play and unrated matches never change a rating or a leaderboard.

- **CAP-11** — Admin console
  - **intent:** An admin can curate the question bank and act on player reports.
  - **success:** An admin can add, edit, and delete single questions, and bulk-upload a CSV. Every added question starts as a draft, and only an explicit publish makes it playable; discard removes it. The admin can tag category, subject, topic, exam level, difficulty, and source. Reported questions appear in their own queue with the reporter's note.

- **CAP-12** — Resilient mobile play
  - **intent:** A player on a cheap Android phone and a patchy 3G connection can install the app and finish matches.
  - **success:** The PWA meets Android Chrome installability. It loads in < 5 s on 3G and is usable on a 2 GB RAM device. A player who drops mid-match and returns within 10 s resumes at the current state. After 10 s they forfeit the remaining questions while the match continues for everyone else. Peak-moment effects flash at most once per second, and an in-app "Reduce effects" setting replaces them with fades.

- **CAP-13** — Result share card
  - **intent:** After a match, a player can share their result to WhatsApp and other apps to invite friends.
  - **success:** From any results screen, Share produces an image card with the result, the score, the mode and a link, with text in the sharer's UI language. Opening the link takes a new or returning player straight into Quick Match. MVP has no direct-challenge flow.

## Constraints

- **Server is the referee.** The correct answer never reaches a client before that question's window closes. The server alone does timing and scoring, and answer submissions are rate-limited.
- Answer submission is confirmed in < 200 ms for players in Kerala.
- Built and run by one developer with no funding. Running cost stays near ₹450/month, and there are no paid per-use services at MVP (this is why SMS OTP is deferred).
- The MVP is entirely free, with no paywalls.
- Questions and UI work in both Malayalam and English. The player chooses their question language in their profile.
- Content trust: PSC previous-year questions are published only after admin review, attribution is shown where available, and players can report errors. The legal exposure from using previous-year questions is accepted as a bootstrapping risk; original content is the long-term path.
- The question schema supports non-PSC content categories (for example school quiz, general Kerala) from day one.
- Room codes must be hard to guess and unique among live rooms.
- Uptime ≥ 99.5%.
- The architecture spine (`ARCHITECTURE-SPINE.md`, AD-1–AD-19) is binding on every build unit.

## Non-goals

- **Never part of the product:** video courses or lectures, any non-battle learning mode, browsing a content library (notes, syllabi, PDFs), instructor/student course management.
- Phone number + OTP sign-in at MVP. It is required, but deferred until the SMS budget allows. Adding it later must not need rework (AD-9).
- Bots in Battle Room. Custom topics in Quick Match or Topic Duel. Custom topics visible to anyone but their owner.
- District and college leaderboards (Phase 2).
- Phase 2: weak-topic report, spaced-repetition queue, coaching-center dashboard and analytics, daily challenge and streaks, custom-topic monetization tiers.
- Phase 3: native Android/iOS apps, scheduled tournaments, premium subscription.

## Success signal

Within 90 days of launch, against the definitions in `metrics.md`:
- ≥ 40% of players return within 7 days of their first match.
- Sessions average ≥ 2 fully completed matches.
- < 60% of Quick Matches end with a bot opponent, while median queue wait stays flat.
- At least 5 coaching centers actively run Battle Rooms within 60 days of launch.

## Assumptions

- Uptime target is 99.5% (the PRD's own assumption for a solo-operated launch).
- Matchmaking band is ±200 rating, widening to ±400 at 4 s.
- Quick Match draws mixed subjects from the whole PSC bank.
- Match history shows the last 20 matches.
- Custom-topic fair-use caps are 50 topics / 500 questions per user.
- Live scoreboard propagates in < 500 ms; initial load on 3G takes < 5 s.
- Battle Room holds at most 50 players.
- For ELO, a bot opponent counts at the human player's current rating and a guest opponent at 1200.
- The daily/weekly leaderboard ranks rating gained in the period; the all-time board ranks current rating.
- Battle Room ELO is pairwise against every other human, with K = 32/(N−1).

## Open Questions

- What does India's DPDP Act require for deleting accounts and data, beyond removing the player from leaderboards and play? Needed before public launch.
- MVP has no coaching-center entity, so how is "coaching centers actively using Battle Room" counted? Options: hosts tag a room with a center name, or repeat hosts with large rooms are treated as centers.
- What is the domain name? Secure sign-in (the first-party refresh cookie) needs it before Story 2.1 goes to production, and share and join links need it before launch.
- Is the OVHcloud Mumbai VPS available, and is its 10 Mbps cap after the monthly quota acceptable? Needed before provisioning.

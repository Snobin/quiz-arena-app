---
status: final
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/specs/spec-quiz-arena/SPEC.md
  - _bmad-output/specs/spec-quiz-arena/game-modes.md
  - _bmad-output/specs/spec-quiz-arena/question-content.md
  - _bmad-output/specs/spec-quiz-arena/metrics.md
  - _bmad-output/specs/spec-quiz-arena/glossary.md
  - _bmad-output/planning-artifacts/prds/prd-quiz-arena-2026-11-10/prd.md
  - _bmad-output/planning-artifacts/prds/prd-quiz-arena-2026-11-10/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-quiz-arena-2026-11-10/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-quiz-arena-2026-11-11/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-quiz-arena-2026-11-11/EXPERIENCE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-quiz-arena-2026-11-11/mockups/ (reference only)
---

# Minnal (quiz-arena) - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Minnal (quiz-arena), decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

Source precedence: the SPEC (`SPEC.md` + companions) is the primary contract; PRD FR IDs are the traceability backbone; the Architecture Spine (AD-1–AD-19) is binding; DESIGN.md + EXPERIENCE.md win over mockups. Tags read `(PRD FR-x.y · CAP-n)`; `[SPEC delta]` marks a requirement added or tightened by the SPEC/UX beyond the PRD text.

## Requirements Inventory

### Functional Requirements

**Authentication & access (PRD FR-1 · CAP-1)**

- FR1: **[DEFERRED — not in MVP scope]** Phone number + OTP sign-in. Required by the product but budget-gated; MVP ships without it. The login design must allow adding it later as a second login method issuing the same Minnal JWT, with no rework (AD-9). (PRD FR-1.1 · CAP-1, SPEC Non-goals)
- FR2: A player can sign in with Google (redirect flow, no popup, no One Tap). A first sign-in creates an account; a later sign-in resumes the same account. After sign-in the player returns to the surface they came from. (PRD FR-1.2 · CAP-1)
- FR3: A player can play Quick Match as a guest without an account. Guests cannot enter Topic Duel, Battle Room, Solo Practice or Custom Topics; the server rejects such attempts, and the UI shows those modes as locked with a sign-in path. (PRD FR-1.3, FR-4.7, FR-5.1, FR-6.1, FR-7.1, FR-8.1 · CAP-1)
- FR4: After a guest finishes a Quick Match, the results screen shows a registration prompt that uses that match's result as the hook. (PRD FR-1.4 · CAP-1)
- FR5: A guest's rating and match history are never persisted and are discarded when the guest session ends; guest results are not migrated into a new account on registration. (PRD FR-1.5 · CAP-1)

**Profile & settings (PRD FR-2 · CAP-2)**

- FR6: On first sign-in, a registered player completes a one-screen profile setup with display name, district, exam target level (10th / degree / other) and question language (Malayalam / English); these fields can be edited later. [SPEC delta: question language is a profile field] (PRD FR-2.1 · CAP-2)
- FR7: The profile shows three separate ratings: Quick Match, Topic Duel, Battle Room. (PRD FR-2.2 · CAP-2)
- FR8: The profile shows the player's last 20 completed matches, each with result, mode and rating delta (unrated matches show no delta). (PRD FR-2.3 · CAP-2)
- FR9: Settings lets a registered player change language, set Reduce effects (on / off / follow phone, default follow phone), sign out, and delete their account after a confirm step. Deleting removes the player from every leaderboard and tombstones their name, and the game server rejects that identity afterwards. [SPEC delta / UX; full DPDP data-deletion scope is an open question] (CAP-2, CAP-12, AD-16)

**Question bank & content trust (PRD FR-3 · CAP-3)**

- FR10: Every bank question is tagged with content category (Kerala PSC at launch; the schema also accepts other categories such as school quiz and general Kerala), subject, topic, exam level (10th / degree / other) and difficulty. (PRD FR-3.1 · CAP-3)
- FR11: A bank question has Malayalam and/or English text and is shown in the player's chosen language, falling back to the other language when the preferred one is missing. (PRD FR-3.2 · CAP-3)
- FR12: Every question has question text, exactly 4 options, one correct answer index (0–3) and an explanation. (PRD FR-3.3 · CAP-3)
- FR13: No client receives a question before its answer window opens. No client receives another participant's pick or correctness, or the explanation, before the question closes. In Battle Room no client receives the correct answer or any hint of correctness before the question closes; in 1v1 modes a player receives her own correctness, points and the correct answer once her own answer is accepted. (PRD FR-3.4, FR-4.6 · CAP-3, AD-5; amended 2026-11-12)
- FR14: A registered player can report a bank question (from a reveal or a results breakdown row) with a free-text note; the report is recorded against the exact question version and appears in the admin report queue. Custom-topic questions cannot be reported, and guests see no report link. [UX resolution, product-approved at Step 4: a report from the live reveal is two-step — the tap marks the question during the reveal, and the note is added on the results breakdown (Story 3.5)] (PRD FR-3.5 · CAP-3)
- FR15: Only admin-published question versions are served to players; the initial bank is Kerala PSC previous-year questions, each reviewed by an admin before publish. (PRD FR-3.6 · CAP-3, CAP-11)
- FR16: Source attribution (e.g. "Kerala PSC LDC 2019") is shown wherever a question's answer is revealed (live reveal, Solo Practice, results breakdown); when no attribution exists, a "source not available" line is shown. (PRD FR-3.7 · CAP-3)

**Quick Match (PRD FR-4 · CAP-4)**

- FR17: A player can start a 1v1 Quick Match; the server pairs players within ±200 rating, widening to ±400 after 4 s, using server-held ratings only (never client-supplied). [SPEC delta: widening] (PRD FR-4.1 · CAP-4, AD-13)
- FR18: If no human opponent is paired within ~8 s, a bot opponent joins automatically and the player is told ("Minnal Bot joined"). (PRD FR-4.2 · CAP-4)
- FR19: A bot is always shown with a visible BOT badge in the opponent slot and on results. (PRD FR-4.3 · CAP-4)
- FR20: A bot's answer delay is randomized per question, not fixed and not tied to difficulty; bots answer through the same path and scoring as humans. (PRD FR-4.4 · CAP-4, AD-7)
- FR21: A Quick Match is 10 questions × 15 s; a correct answer scores `500 + round(500 × remainingMs / 15000)`, a wrong or missing answer scores 0; the whole match completes in ≤ 4 minutes end to end. (PRD FR-4.5 · CAP-4)
- FR22: The server alone times and scores answers: response time is measured from the server's question start, client timestamps are ignored, only a participant's first answer per question counts, and answers after the 15 s window are rejected. (PRD FR-4.6 · CAP-4, AD-6)
- FR23: Quick Match is open to registered players and guests, and a guest may be paired with a registered player. (PRD FR-4.7 · CAP-4)
- FR24: After a rated Quick Match, each registered participant's Quick Match rating is updated; guest ratings are never persisted. (PRD FR-4.8 · CAP-4)
- FR25: Quick Match questions are drawn from the published PSC bank across all subjects (mixed draw). (PRD FR-4.9 · CAP-4)
- FR26: While searching, a player can cancel matchmaking until they are paired; if the question set cannot be fetched after pairing, both players get a matchmaking-failed state with a retry; a player can be in at most one queue, room or match at a time (a second attempt is refused with an option to return to the active match). [SPEC delta via AD-11, AD-13] (PRD FR-4.1 · CAP-4)

**Topic Duel (PRD FR-5 · CAP-5)**

- FR27: A registered player picks a subject/topic in a topic picker and then enters a matchmaking queue that is separate per topic. (PRD FR-5.1, FR-5.2 · CAP-5)
- FR28: Both players in a Topic Duel receive questions only from the selected topic. (PRD FR-5.3 · CAP-5)
- FR29: Topic Duel uses the same ~8 s bot fallback, rating band, 10 × 15 s format and speed-weighted scoring as Quick Match. (PRD FR-5.4, FR-5.6 · CAP-5)
- FR30: A Topic Duel result updates only the Topic Duel rating, tracked separately from Quick Match. (PRD FR-5.5 · CAP-5)

**Battle Room (PRD FR-6 · CAP-6)**

- FR31: A registered player can create a Battle Room and becomes its host; the room gets a hard-to-guess 6-character code, unique among live rooms, that expires at match end or after 24 h, whichever comes first; the lobby shows the expiry as an absolute time. (PRD FR-6.1, FR-6.2 · CAP-6, AD-14)
- FR32: The host can share the code plus a join link (`/r/<code>`) via the OS share sheet (e.g. WhatsApp) and copy the code; opening the link takes a registered player straight into the lobby with no confirmation step. [SPEC delta: join link] (CAP-6)
- FR33: A registered player can also join by typing the code; entry accepts lower case, with or without the hyphen, and strips spaces; a bad, expired or full (50) code shows an inline error saying what happened and what to do. (PRD FR-6.3 · CAP-6)
- FR34: A room holds 2–50 humans; the host plays the match and counts toward the 2-human minimum; Start is enabled only at ≥ 2 humans and only the host can start. [SPEC delta: host plays] (PRD FR-6.3, FR-6.6 · CAP-6)
- FR35: Before starting, the host picks the question source: PSC bank filtered by topic, or one of the host's own custom topics. (PRD FR-6.4 · CAP-6)
- FR36: Before starting, the host sets the question count: 5–30, default 10. (PRD FR-6.5 · CAP-6)
- FR37: When the host starts, every player sees a 3-2-1 countdown and then the same question at the same moment; each question has a 15 s window with speed-weighted scoring. (PRD FR-6.6, FR-6.8 · CAP-6)
- FR38: A live scoreboard is visible to all players throughout the match, updating within 500 ms of each reveal, showing who has answered (never what) during a window. (PRD FR-6.7 · CAP-6)
- FR39: Battle Room has its own rating track; only rooms with a PSC bank source change ratings (pairwise ELO against every other human, K = 32/(N−1)); rooms with a custom-topic source are unrated, are labelled "unrated" in the lobby up front, and still appear in each registered player's match history. [SPEC delta: custom-topic rooms unrated] (PRD FR-6.9 · CAP-6)
- FR40: Bots never join a Battle Room. (PRD FR-6.10 · CAP-6)
- FR41: If the host leaves the lobby before starting, the room closes and the other players return to the Rooms tab with a notice. (CAP-6, game-modes Battle Room lifecycle)
- FR42: The Rooms tab offers Create room, Join with code, and the host's recently hosted rooms; tapping a recent room opens Create with its source preselected. [UX] (CAP-6)

**Solo Practice (PRD FR-7 · CAP-7)**

- FR43: A registered player can start Solo Practice on a PSC bank topic or on one of their own custom topics. (PRD FR-7.1, FR-7.2 · CAP-7)
- FR44: Solo Practice presents questions one at a time with no timer and no fixed count; immediately after each answer the server returns correctness, the correct answer, the explanation and attribution for that question only. (PRD FR-7.3, FR-7.4 · CAP-7, AD-5)
- FR45: Solo Practice never changes any rating or leaderboard. (PRD FR-7.5 · CAP-7)

**Custom Topics (PRD FR-8 · CAP-8)**

- FR46: A registered player can create a named custom topic by pasting a JSON payload `{ "topic": string, "questions": [{ "question", "options"[4], "answer" 0–3, "explanation" }] }`; the topic name is prefilled from `"topic"` and stays editable. (PRD FR-8.1, FR-8.2, FR-8.3 · CAP-8)
- FR47: Import validates schema conformance, at least 1 question, all required fields, exactly 4 options and `answer` 0–3; any failure saves nothing and reports field-level errors (item/row number · field · problem · fix; JSON syntax errors give line and column). (PRD FR-8.4 · CAP-8)
- FR48: Custom topics are visible only to their owner — never to other players, never on leaderboards — and the server serves a custom topic only to its owner. (PRD FR-8.5 · CAP-8, AD-12)
- FR49: The owner can view a topic's questions, re-import JSON to replace its questions, and delete it. (PRD FR-8.6 · CAP-8)
- FR50: Custom topics can be used as a Solo Practice source and as a Battle Room source, never in Quick Match or Topic Duel. (PRD FR-8.7 · CAP-8)
- FR51: Fair-use caps of 50 topics and 500 questions per user are enforced server-side; the UI warns at ≥ 80% of either cap, and an import that would exceed a cap is blocked with a message naming the cap and the overshoot. (PRD FR-8.8 · CAP-8)
- FR52: The creation screen shows the JSON schema reference and a sample GPT prompt inline, each with one-tap copy. (PRD FR-8.9 · CAP-8)

**Match results & post-match (PRD FR-9 · CAP-9)**

- FR53: Every participant sees the results screen immediately after the last question; results survive a page reload. (PRD FR-9.1 · CAP-9, AD-18)
- FR54: Results show final scores (and placements) for everyone, a per-question breakdown (player's answer, correct answer, explanation, attribution), and the rating delta for registered players in rated matches; if the delta is not yet available it retries for up to 10 s and then shows "updating". (PRD FR-9.2 · CAP-9, AD-8)
- FR55: In 1v1 modes, Rematch starts a new match (same mode/topic, same opponent) once both humans request it within 60 s; a bot accepts instantly; the requester sees a waiting state with Cancel, and on timeout or cancel can re-send. [SPEC delta: rematch] (PRD FR-9.3 · CAP-9, AD-14)
- FR56: In Battle Room, the host's Play again creates a new room with the same question source preselected and sends the new code to all players of the finished room. [SPEC delta: play again] (PRD FR-9.3 · CAP-9, AD-14)
- FR57: Every mode's results offer Return home. (PRD FR-9.3 · CAP-9)
- FR58: Battle Room results show a podium of the top 3 and the full standings, with the player's own place visible. [UX] (CAP-9)

**Ratings & leaderboards (PRD FR-10 · CAP-10)**

- FR59: There are three independent ELO tracks (Quick Match, Topic Duel, Battle Room), standard ELO with K = 32, every new user starting at 1200 in each; win/loss/draw derives only from placement (score, then correct count, else tie); a bot opponent counts at the human's current rating; a guest opponent counts as 1200 and the registered player is still rated [Step-1 resolution]; in a 1v1 match the forfeiter always places last (a loss); in a Battle Room forfeiters are rated on their earned placement. (PRD FR-10.1, FR-10.2 · CAP-10, AD-8; amended 2026-11-13, sprint-change-proposal-2026-11-13)
- FR60: Each mode has daily, weekly and all-time all-Kerala leaderboards; days and weeks follow IST with weeks starting Monday; daily/weekly rank by rating gained in the period and all-time by current rating; each row shows rank, display name and district. (PRD FR-10.3, FR-10.4 · CAP-10, AD-17)
- FR61: A registered player sees their own leaderboard row pinned when it is outside the visible list, and in place when scrolled to; no pinned row when they have no position. [UX] (CAP-10)
- FR62: Guest play and unrated (custom-topic) matches never change any rating or leaderboard. (PRD FR-10.5, FR-6.9 · CAP-10)

**Resilient play — disconnect, leave, abort (PRD NFR-Reliability · CAP-12)**

- FR63: A player who drops mid-match has 10 s to reconnect; returning in time resumes at the current question, deadline and scores. [SPEC delta: 10 s reconnect] (CAP-12, AD-11)
- FR64: After 10 s disconnected — or on confirmed Leave — the player forfeits. In a 1v1 match (Quick Match, Topic Duel) this ends the match at once: the remaining player wins and the leaver loses whatever her score. In a Battle Room she forfeits the remaining questions (scoring 0), the match continues for everyone else, and she still receives the result her score earned. (CAP-12, game-modes Disconnects; amended 2026-11-13, sprint-change-proposal-2026-11-13)
- FR65: A match counts as completed once its first question has been revealed, or, in a human-vs-human 1v1, as soon as one player forfeits while the other remains. A match is aborted when every human leaves before the first reveal; in practice that means a human-vs-bot match, or a Battle Room. An aborted match counts nowhere (no ratings, no history, no product metric such as sessions, return or Battle Room usage), and players return Home with a notice; its only trace is the completed-vs-aborted counter-metric (NFR18). [Clarified at Step 4] (game-modes Disconnects, AD-8; amended 2026-11-13, sprint-change-proposal-2026-11-13)

**Share card (CAP-13) [SPEC delta]**

- FR66: From any results screen, Share produces a 1:1 image card with the result, score, mode (and topic) and a short link, with text in the sharer's UI language, and opens the OS share sheet with the image, a prefilled text line and the link; where file share is unsupported, it falls back to save-image + copy-link. (CAP-13)
- FR67: Opening a share-card link takes a new or returning player (guest or registered) straight into Quick Match matchmaking. MVP has no direct-challenge flow. (CAP-13)

**Admin console (PRD FR-11 · CAP-11)**

- FR68: Only users with the ADMIN role (bootstrapped from configured admin emails) can open the admin console at `/admin` or call admin APIs. (CAP-11, AD-9)
- FR69: An admin can add, edit and delete single questions; editing a published question creates a new draft version (the published one is never edited in place); deletion is soft. (PRD FR-11.1 · CAP-11, AD-12)
- FR70: An admin can bulk-upload questions via CSV using the same field rules as the form; valid rows import as drafts, bad rows are listed with row number and reason, and a summary line reports "N imported as drafts · M rows need fixes". (PRD FR-11.2 · CAP-11)
- FR71: Every admin-added question or new version starts as draft; the admin explicitly publishes or discards it from a draft queue; there is no external question submission path. (PRD FR-11.3 · CAP-11)
- FR72: The admin can tag content category, subject, topic, exam level, difficulty and source attribution on a question. (PRD FR-11.4 · CAP-11)
- FR73: Reported questions appear in a separate admin report queue showing the reporter's note and the exact question version, with a path to open that question in the editor. (PRD FR-11.5 · CAP-11)

**PWA & effects (CAP-12)**

- FR74: The app is an installable PWA meeting Android Chrome installability, launching standalone from the home screen; a registered player sees an inline install prompt after their first completed match (never for guests, never a modal, not shown again once dismissed). (PRD NFR-Localisation/PWA · CAP-12)
- FR75: Peak-moment effects flash at most once per second app-wide, and the in-app Reduce effects setting (or the OS reduced-motion preference) replaces every peak effect with a plain fade. (CAP-12)
- FR76: Topic pickers hide any bank topic with fewer than 10 published questions. A Battle Room using a custom topic caps the question-count choice at the topic's size (a topic needs at least 5 questions to be selectable). No player ever reaches a 422 short-set error through normal UI. [Step-1 resolution] (CAP-5, CAP-6, AD-12)
- FR77: A Battle Room tie for first place (with a score above 0) shares #1 on the podium, and each tied player sees a "joint win" takeover; an all-zero tie gets no takeover. [Step-1 resolution; all-zero case amended at Step 4] (CAP-6, CAP-9)
- FR78: An admin closes a report either by fixing the question (publishing a new version) or by dismissing it with a note. Both remove it from the queue and keep the record. [Step-1 resolution] (CAP-11)
- FR79: Rematch is available to guests in Quick Match (guest vs guest, guest vs registered, guest vs bot). [Step-1 resolution] (CAP-9)

### NonFunctional Requirements

- NFR1 (Performance): Answer submission to server confirmation < 200 ms for players in Kerala on mobile data; no DB or network I/O on the answer path during play (AD-4).
- NFR2 (Performance): Live scoreboard update propagates < 500 ms after an answer/reveal is processed.
- NFR3 (Performance): Initial app load on 3G < 5 s; initial JS ≤ 150 KB gzipped; admin UI lazy-loaded and never in the player bundle; Malayalam font subset ≈ 45–70 KB outside the JS budget (AD-18).
- NFR4 (Device): Usable on a 2 GB RAM Android phone on 3G at 360 CSS px; animations use transform and opacity only (no layout, width, blur or shadow animation, no particles).
- NFR5 (Performance): Quick Match and Topic Duel complete in ≤ 4 minutes end to end.
- NFR6 (Reliability): Uptime ≥ 99.5%, watched by an external uptime ping on `/health`; every container has a healthcheck and auto-restart.
- NFR7 (Reliability): A player disconnect never stops a match for others; 10 s reconnect grace; graceful shutdown drains live matches/rooms for up to 5 min; in-flight match state loss on crash is accepted (AD-4, AD-11, AD-19).
- NFR8 (Reliability): Cross-service events are delivered at least once and applied exactly once in effect (idempotent by `eventId`/`matchId`); no rating change is lost or double-applied (AD-15).
- NFR9 (Reliability/Data): Nightly Postgres backup off-site with a monthly restore drill; leaderboards rebuildable from Postgres (AD-17, AD-19).
- NFR10 (Security): Server is the referee — server-side question sequencing, timing and scoring; correct answer never on a client before window close (AD-5, AD-6).
- NFR11 (Security): Rate limiting on answer submissions (per connection) and on REST writes (reports, custom-topic import, admin upload).
- NFR12 (Security): Room codes are high-entropy (SecureRandom), hard to guess and unique among live rooms.
- NFR13 (Security): JWT-based auth for every API and WebSocket connect; internal endpoints reachable only on the private network with a service token; CORS only from the PWA origin; secrets only in server-side env, never in git (AD-9, AD-12, AD-19).
- NFR14 (Localisation): All UI strings and questions available in Malayalam and English; the player's language setting drives UI and question text with fallback; correct `lang` attributes on all content.
- NFR15 (Accessibility): WCAG 2.2 AA target per the UX Accessibility Floor — flash budget ≤ 1 per 1000 ms, Reduce effects path, commit-on-lift pointer input, 48 × 48 hit areas, visible focus, screen-reader announcements, reflow at 320 px / 200% text, zoom never disabled.
- NFR16 (Cost): Running cost stays near ₹450/month on one VPS + Cloudflare free tiers; no paid per-use services at MVP; MVP is entirely free with no paywalls.
- NFR17 (Resource envelope): All containers have memory limits; each JVM heap ≈ 384 MB; total stays under 3.2 GB on the 4 GB VPS (AD-19).
- NFR18 (Observability): A "session" runs from app open until 30 min idle. Product metrics and counter-metrics are emitted from launch day (7-day return, completed matches per session, bot rate with median queue wait, completed vs aborted matches, Battle Room usage); JSON logs with request/match/user ids.
- NFR19 (Content trust & extensibility): Only admin-reviewed published questions are served; attribution shown where available; schema supports non-PSC content categories from day one.
- NFR20 (Privacy): Guest data never persisted; account deletion removes the user from boards and play; DPDP Act deletion obligations must be resolved before public launch.
- NFR21 (Offline): The app shell loads offline from the service worker; `/api/**` and `/ws` are never cached; play actions are disabled offline with an inline banner (no offline play).
- NFR22 (Maintainability): Built and operated by one developer — monorepo, single shared `contracts/` module, consistent conventions (package-by-feature, RFC 9457 errors, UUID ids, UTC on the wire).

### Additional Requirements

**Starter template — NONE.** The Architecture names **no off-the-shelf starter template**. **Epic 1 Story 1 must be a hand-built project scaffold:**
- Monorepo layout `contracts/`, `services/{core,game,ratings}`, `web/`, `deploy/` (Conventions, Structural Seed).
- Maven 3.9 multi-module build: parent POM + `contracts` module + three Spring Boot 4.1.x services on Java 25, each package-by-feature `in.minnal.<service>.<feature>.(api|application|domain|infrastructure)`; Spring profiles `local` and `prod` (Stack, Conventions).
- `contracts/` module is the only shared code: event records, `/internal` DTOs, STOMP envelope + message types, `Scoring`, `Ranking`; no shared domain or persistence code (Conventions, AD-6, AD-8).
- React 19.3 + TypeScript 6.0 + Vite 8.1 PWA (vite-plugin-pwa 1.x, Tailwind 4.3, TanStack Query 5, Zustand 5, react-i18next 17, @stomp/stompjs 7.3) (Stack).
- `deploy/compose.yaml` running Caddy 2.11, the three services, PostgreSQL 18 and Valkey 9.0 — the same file for local and prod (AD-19).

**Service boundaries & data**
- Three services with single-owner entities: core (users, profiles, roles, refresh tokens, questions + versions, reports, custom topics, solo practice), game (queues, matches, rooms, bots, room codes, rating cache), ratings (ratings, rating events, match history, leaderboards, player directory); a 4th service needs a new AD (AD-1).
- Only the diagrammed dependency edges exist; the single sync service call is `game → core POST /internal/question-sets` at match/room-match start only; core calls no other service (AD-2).
- One Postgres instance, one schema + DB login per service (`core`, `ratings`; game has none), grants only on own schema, no cross-schema FKs/reads, Flyway migrations per service; Valkey keys prefixed `core:` / `game:` / `ratings:`, streams `minnal.*` (AD-3).
- Bank question lifecycle `DRAFT → PUBLISHED | DISCARDED`, immutable published versions, soft delete; one shared validator in core for admin form, CSV and custom-topic JSON (AD-12).
- Internal API `POST /internal/question-sets {source: BANK|CUSTOM, filters{category, subjectId?, topicId?, examLevel?}, customTopicId?, count, requesterId}` returns exactly `count` questions with `{questionId, version, textMl?, textEn?, options, answerIndex, explanation, attribution?}` or `422` (never a short set); CUSTOM only for the owner (AD-12).

**Game engine**
- Actor model: one single-threaded actor per live match, room and matchmaking queue; all state changes are queued events; no DB/network I/O between Q1 and final reveal (AD-4).
- Answer secrecy: `QuestionView` has no answer/explanation; `ANSWER_ACCEPTED` is receipt-only in Battle Room and carries the player's own `correct`, `points`, `answerIndex` in 1v1 modes; `SCOREBOARD` shows who answered; one `QUESTION_REVEALED` per question (when all have answered, or at 15 s) carries answer, explanation, attribution, every pick and scores (AD-5, AD-6; amended 2026-11-12).
- Server clock: one `startedAt` per question; 15 s window; first answer wins; single `Scoring` function used by all modes and bots (AD-6).
- Bots are `Participant{kind: BOT}` using the same events; never in rooms; auto-accept rematch (AD-7).
- Matchmaking actor per `(mode, topicId?)` handling `JOIN|CANCEL|DISCONNECT|TICK`; ratings from in-memory cache fed by `minnal.rating.updated` (replayed on boot, missing → 1200); fetch question set (2 s timeout) before `MATCH_FOUND`; `MATCHMAKING_FAILED` on failure; record `queueWaitMs` (AD-13).
- Rooms: actor `LOBBY → IN_MATCH → ENDED`; 6-char code from SecureRandom over an alphabet excluding 0, O, 1, I, L (displayed `K7M-Q2X`) [Step-1 resolution]; cap 50; fresh `matchId` on start (`ROOM_MATCH_STARTED`); `POST_MATCH` 60 s for `REMATCH_REQUEST` / host `PLAY_AGAIN` (`ROOM_SUCCEEDED {code}`); rooms lost on restart (AD-14).
- Sessions keyed by JWT `sub`, multiple sessions allowed; one queue/room/match per `sub` (`ERROR ALREADY_IN_MATCH`); 10 s disconnect grace; private `SNAPSHOT`; client drops `seq ≤ refSeq`, sends `resync` on gap; forfeit after 10 s (AD-11).

**Real-time protocol (contracts)**
- STOMP over WebSocket at `/ws`, Spring simple broker; broadcasts `/topic/match/{matchId}`, `/topic/room/{roomId}`; private `/user/queue/game`; client sends `/app/matchmaking/{mode}/join|cancel`, `/app/match/{matchId}/answer|rematch|resync|leave` (`leave` forfeits immediately, with no 10 s grace), `/app/room/create`, `/app/room/join`, `/app/room/{roomId}/configure|start|leave|playAgain` (AD-10).
- Envelope `{type, matchId|roomId, seq?, refSeq?, serverTime, payload}`; `seq` on broadcasts only; participants as `{participantId, displayName, kind}`; `QuestionView` carries `textMl` + `textEn`; types `MATCH_FOUND, MATCHMAKING_FAILED, QUESTION_STARTED, ANSWER_ACCEPTED, SCOREBOARD, QUESTION_REVEALED, MATCH_ENDED, SNAPSHOT, REMATCH_*, ROOM_*` (incl. `ROOM_JOINED, ROOM_LOBBY_UPDATED, ROOM_CLOSED, ROOM_START_FAILED, ROOM_MATCH_STARTED, ROOM_SUCCEEDED`), `ERROR` (codes incl. `SERVER_DRAINING`); answers may carry an optional `prevAckRttMs`, telemetry only, never used for timing or scoring (AD-10).

**Event streams & contracts (Valkey Streams)**
- `minnal.match.completed {eventId, matchId, mode, roomId?, questionSource: BANK|CUSTOM, rated, startedAt, endedAt, queueWaitMs?, participants[{participantId, userId?, kind: USER|GUEST|BOT, displayName, score, correctCount, forfeited, placement}]}`; `rated = (questionSource == BANK)`; published once on completion, never on abort (AD-8).
- `minnal.user.profileUpdated {eventId, userId, displayName, district, examLevel, language, updatedAt}` and `minnal.user.deleted {eventId, userId}` from core; `minnal.rating.updated {eventId, userId, mode, rating, ratedAt}` from ratings (AD-16).
- Delivery: AOF `appendfsync everysec`; one named consumer group per service; `XACK` after DB commit; reclaim pending on boot; idempotent handlers; 5 failures → `minnal.deadletter`; `MAXLEN ~100000`; every payload has `eventId` + occurred-at `Instant`; publishers with a schema write a transactional `event_outbox` table in the same DB transaction as the state change, then relay it to the stream (AD-15).
- ratings-service is the sole ELO computer; keeps `player_directory` (LWW by `updatedAt`) and embeds `displayName` in every board/history response; on `user.deleted` removes from boards and tombstones; game rejects deleted `sub` (AD-8, AD-16).
- Leaderboards: Postgres authoritative; Valkey sorted sets `ratings:lb:{mode}:{daily|weekly|alltime}:{periodKey}` written only by ratings and rebuildable; periods by `endedAt` in `Asia/Kolkata`, weeks Monday (AD-17).
- Results delta API `GET /api/ratings/v1/matches/{matchId}` (404 → client retries up to 10 s, then "updating") (AD-8).

**Identity / JWT / JWKS (integration: Google Identity)**
- core verifies the Google ID token and issues an RS256 access JWT (1 h; claims `sub`, `roles` ⊂ {USER, ADMIN}, `name`, `lang`) plus a 30-day rotating refresh token in an httpOnly cookie; guests get a 24 h `GUEST` JWT with random `sub`, never persisted (AD-9).
- core exposes JWKS; game and ratings validate JWTs as resource servers; WebSocket clients send the JWT in STOMP `CONNECT`; participant identity only from the token; open sessions not cut on expiry, reconnect needs a valid token (AD-9).
- Mode access (guest = Quick Match only) enforced in game-service; admins bootstrapped from `ADMIN_EMAILS`; login behind an interface for future phone OTP (AD-9).
- Web keeps the last guest result in `sessionStorage` for the registration prompt (AD-9).

**Frontend architecture**
- Live-game store (Zustand) updated only by the single WebSocket connection module; components never compute scores/correctness; countdown = server deadline + `serverTime` clock offset; REST via TanStack Query; last `MATCH_ENDED` kept in `sessionStorage` (AD-18).
- Service worker caches app shell (and Malayalam font) only, never `/api/**` or `/ws`; manifest meets Android Chrome installability; admin lazy-loaded at `/admin`; Malayalam font self-hosted subset woff2 (AD-18).
- i18n via react-i18next (`ml`, `en`) (Conventions).

**Deployment & operations**
- Prod = one OVHcloud VPS (Mumbai, 2 vCPU / 4 GB) running Docker Compose: `caddy`, `core-service`, `game-service` (exactly 1 replica), `ratings-service`, `postgres`, `valkey` (AD-19).
- Memory limit on every container; JVM heap ≈ 384 MB each; total < 3.2 GB; healthcheck + `restart: unless-stopped` on every container; external uptime ping on `/health` (AD-19).
- game-service graceful shutdown: stop accepting new matches/rooms, wait up to 5 min for live ones (AD-19).
- PWA static on Cloudflare Pages; nightly `pg_dump` to Cloudflare R2 with backup + restore scripts in `deploy/` and a monthly restore drill (AD-19).
- Caddy terminates TLS and routes `/api/core/**`, `/api/ratings/**`, `/ws`; never routes `/internal/**`; sets `X-Request-Id` (AD-12, Conventions).
- CI/CD via GitHub Actions: build, test, and deploy the service images and the Cloudflare Pages site (AD-19, added at Step-1 resolution).
- Environments: `local` (same Compose file) and `prod`; secrets (including the internal service token, rotated by redeploy) in a server-side `.env`, never in git (AD-19).

**Security implementation**
- CORS allowed only from the Cloudflare Pages origin (AD-19).
- Per-user token buckets in Valkey for REST writes (reports, custom-topic import, admin upload); per-connection inbound message limit in game-service (Conventions).
- `/internal/**` only on the private Docker network and requires the internal service token (AD-12).
- Custom-topic caps (50 / 500, warn ≥ 80%) enforced in core-service (Conventions).

**Observability**
- Micrometer metrics from day 1, including counter-metrics: matchmaking wait time (median), bot-fill rate, completed vs aborted matches; plus inputs for 7-day return, completed matches per session, Battle Room host activity (Conventions, metrics.md).
- JSON logs with `requestId` and `matchId`/`userId` when known; metrics go to the Grafana Cloud free tier (Conventions, AD-19).

**API conventions**
- REST paths `/api/<service>/v1/...`, JSON camelCase; errors as RFC 9457 Problem Details; UUID ids generated by the owning service; `Instant`/ISO-8601 UTC on the wire and in DB, IST only for display and leaderboard periods; stream names `minnal.<aggregate>.<pastTenseVerb>` (Conventions).

### UX Design Requirements

**A. Design tokens (DESIGN.md frontmatter)**

- UX-DR1: Implement the light calm color tokens in the Tailwind 4 theme: paper `#F4F5F7`, card `#FFFFFF`, ink `#101216`, muted `#666C78`, hairline `#E1E3E8`, control-edge `#8D939C`, dim `#9AA0AA`, tile `#F4F5F7`, ink-soft `#2B3040`, unanswered `#80868F`, brick `#B8463A`.
- UX-DR2: Implement the dark theme as a full OS-following theme (`prefers-color-scheme`): paper-dark `#141518`, card-dark `#1D1F23`, ink-dark `#E8E9EB`, muted-dark `#9CA1AA`, hairline-dark `#2F3238`, control-edge-dark `#6E737C`, dim-dark `#6E737C`, tile-dark `#26292E`, ink-soft-dark `#E8E9EB`, unanswered-dark `#6E737C`, brick-dark `#E2705F`; band-dark `#2F3238` / band-raised-dark `#3D414A`; banded peak components (reveal band, overtake row, correct option, results band) carry a 1px volt edge in dark; the dark Quick Match card carries a 1px dim-dark edge; the full-screen win takeover keeps `band` in both themes; no white anywhere in dark mode except text.
- UX-DR3: Implement peak-surface tokens band `#101216`, band-raised `#2B3040`, on-band `#FFFFFF`, on-band-muted `#9AA0AA`, on-band-soft `#C9CDD3`, volt `#D4FF2A`, on-volt `#101216`, with usage guards: volt only on band/band-dark and only in reveal band, overtake row, win takeover, settled results band, dark peak edge and share card; never on white/paper, buttons, links, badges, focus, warnings, Home, Ranks, Custom Topics or lobby; text on band-raised-dark uses on-band or on-band-soft only.
- UX-DR4: Implement color usage rules: dim never used for text; brick only for others' wrong picks, your wrong breakdown rows, error text and Leave (never warnings — warnings are ink); answering states fully monochrome; text never faded with opacity.
- UX-DR5: Implement the typography token set in rem: question (1.4375rem/500/1.65), option (1.09375rem/400/1.5), explanation (0.875rem/400/1.75), title (1.3125rem/600/1.5), card-title (1.5rem/600/1.4), peak-word (1.5rem/600/1.4), peak-points (2.75rem/700/1, −0.02em), takeover-title (2.375rem/700/1.35), takeover-score (2.125rem/700/1, −0.02em), score (1.1875rem/600/1.2), room-code (2.5rem mono/700/1.1, 0.06em), room-code-compact (2rem, under 360 CSS px), code (0.75rem mono with Malayalam fallback/1.6), body (0.9375rem/1.5), label (0.75rem/1.5), caption (0.75rem/500/1.5), countdown (4.5rem/700/1), tab-label (0.75rem/1.5), with the specified Malayalam and system font stacks.
- UX-DR6: Typography rules: tabular numerals on every score, timer, rank and count; Malayalam never below 0.75rem nor line-height 1.5; tags ≥ 2px vertical padding with no fixed height; points snap in (no count-up animations); Latin uses the platform system stack (no Latin web font).
- UX-DR7: Ship the Malayalam font: Noto Sans Malayalam self-hosted woff2 subset by script range (`U+0D00-0D7F, U+200C-200D, U+25CC, U+0964-0965`) keeping all GSUB/GPOS features, atomic chillu and ZWJ forms; one variable woff2 (or ≤ 400 + 600 statics), ≈ 45–70 KB; `font-synthesis: none`; a metric-matched fallback `@font-face` (size-adjust, ascent/descent overrides).
- UX-DR8: Implement radius tokens sm 6 / md 10 / lg 12 / xl 14 / 2xl 16 / full, mapped per DESIGN Shapes (sm: tiles, tags, code; md: options, buttons, fields, switcher, strips, rows; lg: content cards, meters, dialogs, banners; xl: peak band, room code block; 2xl: Quick Match card, joined chips; full: avatars, dots, round marks only); the bolt is a hard-edged polygon, never rounded.
- UX-DR9: Implement spacing tokens 4/8/12/16/20/24/32, gutter-card 16, gutter-text 20, option-gap 10, target-min 48, sticky-max 48; single-column 360px baseline; fixed bottom bars on card with hairline top border; flat elevation (tone not shadow); dim-behind 42% for reconnect and leave dialog.
- UX-DR10: Implement motion tokens as CSS variables/constants: flash-window 1000ms, band-drop 160ms, strike-volt-hold 80ms, strike-total 400ms, overtake-jump 180ms, overtake-crack-fade-after 1200ms, win-flood 200ms, win-hold 1600ms, win-collapse 240ms, chip-pop 160ms, chip-new-label 3000ms, reduced-fade 200ms, reduced-chip-fade 120ms, easing-default ease-out, easing-overtake `cubic-bezier(.34,1.4,.64,1)`; animate transform/opacity only.
- UX-DR11: Brand mark: lightning-bolt SVG polygon + wordmark മിന്നൽ (Malayalam UI) or Minnal (English UI); bolt white area ≤ 10% of viewport at a strike; no full-white frame.

**B. Shared components**

- UX-DR12: Focus ring component: `:focus-visible` always shows 2px solid ink (ink-dark in dark, on-band on band surfaces), 2px offset, never volt; `scroll-padding-bottom` equals the fixed-bar height so focused items are never hidden.
- UX-DR13: Button primary (ink fill, white label, md radius, min-height 48) and button secondary (card fill, 1.5px ink outline, min-height 48).
- UX-DR14: Button disabled: card, 1px dim border, muted label; uses `aria-disabled="true"` (stays focusable) with an adjacent caption saying why and what unlocks it (Host start, Import, offline play actions).
- UX-DR15: Tab bar: four items Play / Rooms / Ranks / Me (കളി / റൂമുകൾ / റാങ്ക് / ഞാൻ), 20px icon over tab-label, active ink bold, inactive muted, 48px hit areas; hidden on live match, win takeover and lobby; each tab keeps its scroll position (and Ranks its mode + period) on return.
- UX-DR16: Text field: card fill, 1px control-edge border (control-edge-dark in dark), md radius, min-height 48, visible `<label>` above in label/muted; district and exam level are native `<select>`s; errors carry ⚠ + text (brick never the only cue).
- UX-DR17: Bot badge: sm-radius outline tag "BOT" (wrapped `lang="en"`) beside the bot's name; always visible on a bot in score strip and results.
- UX-DR18: Sign-in nudge card: 1.5px ink outline, benefit text, ink "Continue with Google" button; inline, never a modal, at most one per screen.
- UX-DR19: Install prompt card: styled as the sign-in nudge, shown on Results after a registered player's first completed match only, never for guests, never a modal, not re-shown once dismissed.
- UX-DR20: Settings rows (Me › Settings): Language, Reduce effects (on / off / follow phone, default follow phone), Sign out, Delete account with a confirm step then sign-out.

**C. Home**

- UX-DR21: Primary action card (Quick Match): ink card (band-dark + 1px dim-dark edge in dark), static band-raised bolt watermark (never volt), white button; the only filled ink element on Home; one tap starts matchmaking.
- UX-DR22: Mode entry row: 32px tile icon, title + subline, dim chevron; locked guest variant with muted title, half-opacity icon, "Sign in" label with lock; tapping locked opens the Sign-in prompt.
- UX-DR23: Rank snippet (registered only): card with 26px bold rank number and today's board label with day's gain (e.g. "ഇന്ന് +24", IST day); tap → Ranks on Quick Match · Today.
- UX-DR24: Rating trio (registered only): three small read-only cards in a grid, label + value.
- UX-DR25: Guest Home variant: locked mode rows + exactly one Sign-in nudge; rank snippet and rating trio hidden.

**D. Live match**

- UX-DR26: Answer option: card fill, 1px control-edge border, A–D letter tile on tile color, Malayalam option text, min-height 56. States: pressed (ink border on down), "…" after lift until server ack, locked (1.5px ink border, ink tile, "ലോക്ക്" status), correct at reveal (band fill, white text, volt tile with ✓, volt status), other's pick (brick status with their unchanged name), non-chosen after reveal (muted text).
- UX-DR27: Commit-on-lift input: answers commit on `click` (up-event) only; sliding off before lift cancels; movement > 10 px is a scroll; `touch-action: manipulation`; first committed tap is final with no confirm; later taps ignored; no correctness shown until reveal.
- UX-DR28: Hairline timer: 2px ink line on hairline track animated via `transform: scaleX()` on a composited layer (never `width`), driven by server deadline + clock offset, never paused on the client (including during reconnect); ink-bold seconds label ticking once per second; single `navigator.vibrate(30)` at 5 s where supported.
- UX-DR29: Score strip: card with You (ink bold) left, opponent right, opponent status (muted) "thinking" → "answered" in the middle (never what they picked); bot carries the Bot badge.
- UX-DR30: Language toggle (EN tag): outlined ink tag beside the mode label with 48px hit area, ≥ 8px from the question's first line; shows the other-language text of the current question when it exists, for that question only; accessible name "Show in English" / "മലയാളത്തിൽ കാണിക്കുക" with `aria-pressed`.
- UX-DR31: Peak band (reveal): band surface, xl radius, drops in (band-drop) when the player's own result is known — at her accepted answer in 1v1 modes, at the reveal in Battle Room or when she did not answer (amended 2026-11-12); label in on-band-muted, answer in peak-word, points in peak-points volt, total beside, volt bolt top-right with a single strike (strike-volt-hold, strike-total). Wrong variant: same band with no bolt and no volt, always naming the correct answer.
- UX-DR32: Explanation + attribution block: explanation in explanation typography/ink-soft, caption row with source ("Kerala PSC LDC 2019" or "ഉറവിടം ലഭ്യമല്ല") left and report link "തെറ്റുണ്ടോ?" right in ink; used in reveal, Solo Practice and breakdown.
- UX-DR33: Report link + note: 48px hit area; registered players and bank questions only (hidden for custom topics and guests); opens a note field and submits against the exact question version; inline confirmation.
- UX-DR34: Live-match layout: full screen, no tab bar; only timer line, seconds label and "Q n/10" sticky (≤ 48px); score strip, question, options and footer hint in normal flow; footer shows first-tap hint while open and "Locked in · result when time runs out" when locked.
- UX-DR35: Reconnect banner: card, 1.5px ink border, lg radius, 40px ring holding the countdown digit 10 → 0, replaces the timer area; everything below dimmed 42%, `inert` and `aria-hidden`; monochrome, never flashes; shows Forfeited copy after 10 s, then goes to Results.
- UX-DR36: Leave confirm dialog: centred card, lg radius, 42% dim behind, title + one muted line, button-primary "Stay" and brick text button "Leave"; `role="alertdialog"`, focus on Stay, background `inert`; Android back / Esc = Stay; on Stay focus returns to the question heading; Leave → Results with earned score (forfeit); server timer keeps running.
- UX-DR37: Start countdown: 3-2-1 digits in countdown typography, ink on paper, monochrome, for all Battle Room players after host Start (host has no control); waits for `document.fonts.ready` (cap 3 s); under reduced effects digits swap with no scale.

**E. Results**

- UX-DR38: Win takeover: full-screen band (both themes), large volt bolt, takeover-title, your score in volt takeover-score, opponent muted, rating delta on band-raised panel, real "Continue" button (≥ 48px, on-band-muted); `role="dialog"` labelled by title, Continue focused; holds win-hold or until Continue / tap anywhere, then collapses (win-collapse) into the compact band; auto-advance off under screen reader or reduced effects; dismissing pointer event consumed and results ignore taps for 400 ms after collapse; starts ≥ flash-window after the last reveal's strike; scrolls when content exceeds viewport; Battle Room #1 only.
- UX-DR39: Results band (compact): smaller peak band with result line, your score in volt, opponent muted, delta in a volt chip with on-volt text; loss variant has ink band, grey delta, no volt; delta omitted for guests and unrated matches; loss opens straight to settled view.
- UX-DR40: Draw band: compact band "സമനില / Draw", both scores white, grey delta, no volt, no bolt, no takeover.
- UX-DR41: Dot strip: one 7px dot per question in order (ink fill = correct, brick ring = wrong), read-only, exposed as a list ("Q1 correct … Q10 wrong"), glyphs `aria-hidden`.
- UX-DR42: Breakdown row: card with Q number, correct/wrong, time, points (brick when 0); question, "നിങ്ങൾ:" your answer (brick if wrong), "ശരി:" correct answer bold; explanation; attribution + report link. Correct rows collapsed on load as `<button aria-expanded="false">` showing one line "Q3 ✓ 9 s +800" (no truncated question); wrong rows always expanded; no height animation under reduced effects.
- UX-DR43: Results action bar: fixed bottom, primary (ink) + secondary (1.5px ink outline) at 2fr/1fr/1fr; 1v1 = Rematch / Home / Share; Battle Room = Play again / Home / Share; wraps to stacked full-width buttons when labels don't fit.
- UX-DR44: Rematch waiting: Rematch button becomes a 1.5px ink-outline card "Waiting for <name>…" (muted) with seconds count and Cancel text link (48px hit area) for up to 60 s; opponent's button reads "Accept rematch"; bot accepts instantly; on timeout/cancel the button reverts with a one-line note, announced, re-sendable.
- UX-DR45: Podium (Battle Room results): three card columns ordered 2-1-3, #1 tallest, rank numeral, name, score; your column band fill (band-dark in dark); your score volt only when you are #1; everyone else follows as scoreboard rows; #1 sees win takeover first, others land straight on podium + standings; no GG reactions at MVP.
- UX-DR46: Share card: 1:1 image rendered at 1080 × 1080, 18px radius, ink field, bolt, wordmark, result line, score in volt, mode · topic in on-band-muted, CTA ("Beat me on Minnal") and short link (volt) above a band-raised rule; text in sharer's UI language with the no-inflection name rule; legible at ~250px WhatsApp thumbnail.
- UX-DR47: Guest results variant: registration prompt built on the result (CAP-1); results rehydrate from last `MATCH_ENDED` in `sessionStorage` on reload.

**F. Battle Room**

- UX-DR48: Rooms list (Rooms tab): Create room, Join with code, recently hosted rooms (tap → Create with source preselected).
- UX-DR49: Join code field: visible label; `inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false"`; accepts lower case, optional hyphen, strips spaces; inline errors under the field via `aria-describedby` + `aria-invalid` for bad / expired ("K7M-Q2X has expired. Ask the host to share a new code.") / full ("Room is full (50). Ask the host for a new room.").
- UX-DR50: Room code block: card, xl radius, label, code in room-code (room-code-compact under 360px) as the largest element on screen, accessible name spelling it ("K 7 M, Q 2 X"), expiry caption as absolute time, Share-to-WhatsApp button-primary opening the OS share sheet with code + `/r/<code>` link, secondary copy-code text link with inline "Copied".
- UX-DR51: Source row + unrated tag: host-editable config row; custom sources show a "സ്വന്തം" outline tag and a plain-language "unrated" note in muted up front; count selector 5–30 default 10.
- UX-DR52: Joined chip: card chip, 2xl radius; new joiners enter at the front with 1.5px ink outline + "ഇപ്പോൾ" label for chip-new-label (3 s), pop with chip-pop; ≥ 5 joins/s fade in as one batch; "You" chip ink fill shown as "നിങ്ങൾ"; overflow dashed "+N പേർ"; count swaps without counting up.
- UX-DR53: Host start bar: fixed bottom full-width button-primary "തുടങ്ങാം · N പേർ" with caption warning that leaving closes the room; disabled (button-disabled) below 2 humans with caption "Waiting for 1 more player"; hidden for non-hosts.
- UX-DR54: Answered meter: 4px bar (ink on hairline) + "N / M ഉത്തരം നൽകി", updates on every answer with no animation; focusable `role="meter"` with `aria-valuetext`; never a live region.
- UX-DR55: Scoreboard row: card row min-height 47px with rank, name, score, answered dot (● ink / ○ 1.5px unanswered ring); updates within 500 ms of each reveal; your row after overtaking: band fill, volt rank/score/subline ("▲ Arjun K · മറികടന്നു"), min-height 56px, jumps with overtake-jump/easing-overtake, stays ink until next question starts; dropped rows keep full-opacity text with "▼ 1"; each row's accessible name includes "answered" / "not answered yet".
- UX-DR56: Overtake crack: one-shot zig-zag SVG polyline between your row and the passed row (ink when you pass, muted when you are passed), fades after overtake-crack-fade-after; only your own row gets a crack even when several ranks change.

**G. Leaderboards**

- UX-DR57: Mode switcher: segmented control (Quick Match / Topic Duel / Battle Room) on card track, hairline border, 3px padding, active ink fill white label, inactive muted, all 600, min-height 48; exactly one selected; switching swaps the list with no animation.
- UX-DR58: Period tabs: text tabs ഇന്ന് / ഈ ആഴ്ച / എക്കാലവും over a hairline rule, active ink bold with 2px ink underline, inactive muted, min-height 48; list header names the measure (rating gained vs rating); no animation on switch.
- UX-DR59: Leaderboard row: card row min-height 47px, rank (muted; ranks 1–3 bold ink numerals only, no medals, no volt), unchanged name with district below in muted caption, value right in score typography with grouped Latin digits.
- UX-DR60: Pinned own row: ink fill (band-dark in dark), min-height 56px, white rank/name/value, district on-band-muted, "നിങ്ങൾ" outline tag (on-band-muted border, on-band-soft text) beside the unchanged name; sits on a paper strip above the tab bar preceded by a dim "···" gap mark; unpins when scrolled into place; absent when no position.
- UX-DR61: Empty leaderboard card: card with static ink-outline bolt, one-line title in voice, muted line, button-primary to play the viewed mode, text link to a board with rows; three dashed hairline ghost rows below (decorative); no pinned row.

**H. Custom Topics**

- UX-DR62: Usage meter: card with one-line tally of both caps ("12 / 50 ടോപ്പിക് · 410 / 500 ചോദ്യം") and one 4px bar per cap (ink on hairline); warning variant at ≥ 80% of either cap: 1.5px ink outline + "!" line (18px ink circle) giving headroom and a way out ("delete an old topic"); monochrome (never brick or volt); dropped on success view; updates immediately after import.
- UX-DR63: Topic row: list row min-height 56px (mode-entry-row pattern) with title, muted "N ചോദ്യം · date" subline, dim chevron; opens topic view (questions, Practice, Use in Battle Room, Re-import, Delete); list header states "private to you, never rated".
- UX-DR64: Import form + JSON paste area: topic-name text field prefilled from JSON `"topic"`, editable; paste area card with control-edge border, code typography, no soft-wrap, line numbers, horizontal scroll inside itself only; error variant 1.5px brick border, 3px brick gutter rule + bold brick line number on each bad line, other line numbers muted.
- UX-DR65: Pre-import tally line: muted caption under the paste area updating on paste with found count and post-import usage in bold ink ("15 ചോദ്യം കണ്ടെത്തി · ശേഷം 425 / 500"); over a cap, Import blocked naming the cap and overshoot.
- UX-DR66: Disclosure rows: card list of collapsible rows (▸/▾ ink chevron, title, "കോപ്പി" copy link with inline "Copied") for schema reference and sample GPT prompt; expanded content is a tile-background sm-radius ink-soft monospace code block; default schema expanded / prompt collapsed; both expanded when topic list empty; both collapsed in error state.
- UX-DR67: Import error list (shared with admin CSV upload): card with count header as a goal ("2 തെറ്റുകൾ തിരുത്തിയാൽ ഇംപോർട്ട് ചെയ്യാം") + muted hint, one row per problem (⚠ + brick text + monospace hairline field-name tag), row min-height 48; `role="alert"` summary above the input linked via `aria-describedby`, takes focus; tapping a row scrolls the paste area to and marks that line; JSON syntax errors give line, column, likely cause; > 20 errors shows first 20 grouped by field with full CSV download; Import stays disabled until local validation passes, server re-validates on tap; CSV mode adds summary "N imported as drafts · M rows need fixes".
- UX-DR68: Success card: card with 28px ink circle white ✓, title "<topic> · N questions imported", muted line, actions 2fr/1fr: button-primary "Use in Battle Room" (opens Rooms › Create with topic preselected, സ്വന്തം + unrated) and button-secondary "Practice" (starts Solo Practice); lands on the topic view with Re-import and Delete below; no volt.

**I. Admin console**

- UX-DR69: Admin layout: desktop-first (≥ 1024px), same tokens, denser tables and forms; surfaces CSV upload, Draft queue, Question editor (separate page, not modal), Report queue; button-primary Publish, button-secondary Discard; tables use `<table>` with `<th scope>`; tab order filters → table → pagination; usable but not optimised below 1024px.
- UX-DR70: Admin keyboard shortcuts: `P` publish, `D` discard, `E` edit, `J`/`K` next/previous, listed in a `?` help dialog; active only while focus is on a draft-queue row or editor toolbar, never inside input/textarea/select/contenteditable (checked via `event.target`); an admin Settings toggle disables single-key shortcuts; every shortcut has a visible button equivalent.
- UX-DR71: Admin row action Undo: Publish and Discard (button or `P`/`D`) show an inline 5 s Undo instead of committing silently; after a row leaves, focus moves to the next row (previous if last, else the empty-state heading), and a polite status announces it ("Published Q 1234 v3").

**J. State patterns**

- UX-DR72: Cold load: app shell from service worker; skeleton rows shaped like the surface; no spinner without text past 1 s; skeletons never shimmer under reduced effects.
- UX-DR73: Font loading: Malayalam woff2 precached with the app shell and `<link rel=preload>` on Home; matchmaking and 3-2-1 wait for `document.fonts.ready` (cap 3 s); live match uses `font-display: optional` (no mid-match swap); elsewhere `swap` over the metric-matched fallback.
- UX-DR74: Offline state: shell loads, inline offline banner (announced once), play actions disabled with caption; no offline play.
- UX-DR75: Matchmaking screen: "Finding an opponent…" with Cancel; at ~8 s "Minnal Bot joined" + Bot badge (announced); reduced effects = static text + elapsed-seconds count, no spinner; `MATCHMAKING_FAILED` → inline retry; `ALREADY_IN_MATCH` → offer to return to the active match.
- UX-DR76: Sign-in return: redirect flow; on return restore the originating surface, move focus to its heading and announce "Signed in as <name>".
- UX-DR77: Profile setup screen: one screen with name, district, exam level, language; choosing a language switches the UI at once, announces the change politely in the new language and keeps focus on the field.
- UX-DR78: Topic picker: shared subject/topic chooser used by Topic Duel, Solo Practice and Battle Room source (with own custom topics where allowed).
- UX-DR79: Solo Practice screen: untimed question with answer options (same commit-on-lift), immediate correctness + explanation + attribution + report link, next question; registered only.
- UX-DR80: Match aborted, host left, opponent left and forfeited states each show a one-line notice (and polite announcement) and route to Home / Rooms / Results respectively.
- UX-DR81: Empty states for match history, Custom Topics, draft queue and report queue: one plain line in voice + next action; Custom Topics empty opens with schema + GPT prompt expanded.
- UX-DR82: Share link landing: a share-card link opens straight into matchmaking (guest or registered); join link `/r/<code>` opens the lobby directly with no confirmation.

**K. Accessibility floor**

- UX-DR83: Flash budget (WCAG 2.3.1): app-wide flash scheduler allowing at most one flash-producing transition per flash-window (1000 ms); peaks queued, never overlapped; win takeover starts ≥ 1000 ms after the last strike ends; strike is volt on band only; overtake uses a drawn crack, not a flash; QA fixture records peaks at 60 fps on a throttled device and counts flashes per 1000 ms.
- UX-DR84: Reduce-effects path: active when `prefers-reduced-motion` or Settings › Reduce effects is on; every peak becomes a plain reduced-fade (200 ms) with no band drop, strike, flood or crack; rows swap with a fade; chips fade in reduced-chip-fade (120 ms); timer line steps once per second; win takeover advances on Continue only; matchmaking, skeletons and breakdown rows don't animate.
- UX-DR85: Automatic reduced fallback: if the session's first band drop misses > 3 frames (rAF deltas > 50 ms) or `navigator.deviceMemory ≤ 1`, the reduced path runs for the rest of the session.
- UX-DR86: Hit areas: every interactive element ≥ 48 × 48 via padding or `::before` hit box (EN tag, report link, copy-code / "കോപ്പി" links, rematch Cancel, Leave, breakdown expand, switcher segments, period tabs, tab-bar items); adjacent hit areas never overlap.
- UX-DR87: Question focus & announcements: on question start focus moves to the question heading (`tabindex="-1"`) whose accessible name is the question text then "ചോദ്യം 4 / 10, 15 സെക്കൻഡ്"; remaining time announced once at 5 s, never per tick; lock announces "Locked in" (polite); reveal keeps focus and politely announces "<Correct|Wrong>. Answer: <option>. +800, total 3,140"; match end moves focus to the results heading carrying the result ("You won, 3,140 to 2,980, rating +24").
- UX-DR88: Live regions: one shared polite `role="status"` and one assertive region (reconnect start only) per screen; exactly one polite announcement each for forfeited, aborted, bot joined, opponent left, own rank change (once per reveal), 1v1 opponent answered (once per question), lobby joins (debounced 5 s: "3 joined, 23 in room"), copy, share fallback, rematch timeout/cancel, offline banner, admin row actions; reconnect assertive at start, polite at end, never per second; never live regions on answered meter, scoreboard list, joined-chip list, seconds label.
- UX-DR89: Route titles: every surface sets `document.title` in the UI language ("ചോദ്യം 4 / 10 · മിന്നൽ"), updated per question.
- UX-DR90: Glyph and text equivalents: ▲ ▼ ✓ ● ○ and dot strip are `aria-hidden` with text equivalents ("up 1 place", "correct", "not answered yet"); seconds read in full (`aria-label="9 സെക്കൻഡ്"` / "9 seconds").
- UX-DR91: Reflow & zoom: no fixed heights on text containers (min-height only); layouts reflow at 320 CSS px at 100% and at 360 px with 200% text with no horizontal page scroll; viewport meta never sets `maximum-scale` or `user-scalable=no`; above ~480px the player column centres at a max width.
- UX-DR92: Accessibility QA fixtures: Chrome Android text scaling 200% + OS font Largest; Malayalam shaping fixture with old-orthography conjuncts (ക്ഷ, ന്റ, ത്ത്ര) and chillu in tags, options and custom topics; TalkBack with Google TTS Malayalam voice installed and not installed.

**L. Bilingual behavior**

- UX-DR93: One language setting drives both UI strings (react-i18next `ml`/`en`) and question text; guests default to device language; question text falls back to the other language; custom-topic questions render in their written language even in English UI; Malayalam questions wrap, never truncate.
- UX-DR94: `lang` attributes: `<html lang>` follows UI language; question/option/explanation containers take `lang` from the content's language field (bank) or script detection (custom topics); Latin runs in Malayalam strings (names, "BOT", "EN") wrapped in `<span lang="en">`, Malayalam runs in English UI in `lang="ml"`.
- UX-DR95: Display names never inflected into Malayalam grammar — name unchanged followed by a separator (`▲ Arjun K · മറികടന്നു`); leaderboards mark your row with "നിങ്ങൾ" tag; numerals are Latin digits with grouping (`7,840`, `#3,406`).
- UX-DR96: Voice & tone string catalogue: implement the EXPERIENCE Voice and Tone table strings in both languages (matchmaking, bot joined, first-tap hint, locked, wrong, overtake, win, "പൊളി!", loss band, draw, reconnect, forfeited, leave confirm, report link, rematch waiting, share CTA, lobby < 2, leaderboard empty, import error, join expired, join full), with TBD strings flagged for sign-off; light slang only at peaks; wrong answer always names the correct one.

**M. PWA & platform**

- UX-DR97: PWA manifest + service worker: meets Android Chrome installability, standalone display, `orientation: "any"` (no portrait lock), caches app shell and Malayalam font only (never `/api/**` or `/ws`), launches from home-screen icon.

### FR Coverage Map

FR1: Deferred
FR2: Epic 2
FR3: Epic 1
FR4: Epic 2
FR5: Epic 2
FR6: Epic 2
FR7: Epic 2
FR8: Epic 2
FR9: Epic 2
FR10: Epic 1
FR11: Epic 1
FR12: Epic 1
FR13: Epic 1
FR14: Epic 3
FR15: Epic 1
FR16: Epic 1
FR17: Epic 1
FR18: Epic 1
FR19: Epic 1
FR20: Epic 1
FR21: Epic 1
FR22: Epic 1
FR23: Epic 1
FR24: Epic 2
FR25: Epic 1
FR26: Epic 1
FR27: Epic 4
FR28: Epic 4
FR29: Epic 4
FR30: Epic 4
FR31: Epic 5
FR32: Epic 5
FR33: Epic 5
FR34: Epic 5
FR35: Epic 5 + Epic 6 (custom source)
FR36: Epic 5
FR37: Epic 5
FR38: Epic 5
FR39: Epic 5 + Epic 6 (unrated custom rooms)
FR40: Epic 5
FR41: Epic 5
FR42: Epic 5
FR43: Epic 4
FR44: Epic 4
FR45: Epic 4
FR46: Epic 6
FR47: Epic 6
FR48: Epic 6
FR49: Epic 6
FR50: Epic 6
FR51: Epic 6
FR52: Epic 6
FR53: Epic 1
FR54: Epic 1
FR55: Epic 1
FR56: Epic 5
FR57: Epic 1
FR58: Epic 5
FR59: Epic 2
FR60: Epic 2
FR61: Epic 2
FR62: Epic 2
FR63: Epic 1
FR64: Epic 1
FR65: Epic 1
FR66: Epic 7
FR67: Epic 7
FR68: Epic 3
FR69: Epic 3
FR70: Epic 3
FR71: Epic 3
FR72: Epic 3
FR73: Epic 3
FR74: Epic 7
FR75: Epic 1
FR76: Epic 4 + Epic 5 + Epic 6 (custom-topic room cap)
FR77: Epic 5
FR78: Epic 3
FR79: Epic 1

NFRs and Additional Requirements are built into the epic where they first apply: scaffold, CI/CD, deploy, ops and design foundation in Epic 1; identity and ratings infrastructure in Epic 2; launch metrics and the restore drill in Epic 7. UX-DRs are mapped to stories.

## Epic List

### Epic 1: Anju plays her first Quick Match
A guest opens Minnal on her phone, is matched with a human or a bot, plays 10 live server-refereed questions with reveals and results, and survives a dropped connection. Includes the project scaffold, CI/CD, the first production deploy, the design foundation, and a seeded question bank.
**FRs covered:** FR3, FR10–FR13, FR15–FR23, FR25–FR26, FR53–FR55, FR57, FR63–FR65, FR75, FR79

### Epic 2: Anju gets an account and a rating
Google sign-in from the guest results prompt, one-screen profile setup, Settings, the ratings service with ELO, rating deltas, match history, and daily/weekly/all-time leaderboards.
**FRs covered:** FR2, FR4–FR9, FR24, FR59–FR62

### Epic 3: Snobin curates the question bank
A desktop admin console for CSV upload (partial import), the draft review queue (shortcuts + Undo), the versioned question editor and tagging, plus the player report link and the report queue.
**FRs covered:** FR14, FR68–FR73, FR78

### Epic 4: Anju trains on her weak topics
A topic picker (hiding undersized topics), Topic Duel with its own rating, and untimed Solo Practice on bank topics.
**FRs covered:** FR27–FR30, FR43–FR45, FR76

### Epic 5: Rajeev sir runs a Battle Room
Room creation, the code and join link, a live lobby where the host plays too, a 3-2-1 start, the live scoreboard, the podium with joint wins, Play again, the Rooms tab, and the Battle Room rating.
**FRs covered:** FR31–FR42, FR56, FR58, FR76, FR77

### Epic 6: Rajeev sir brings his own questions
Custom Topics: JSON import with field-level errors, fair-use caps, the schema and a sample GPT prompt, and topics usable in Solo Practice and Battle Room.
**FRs covered:** FR46–FR52

### Epic 7: Minnal spreads and is launch-ready
The result share card and its Quick Match link, the PWA install prompt, product and counter-metrics, and the backup restore drill.
**FRs covered:** FR66, FR67, FR74

### Deferred
Phone OTP sign-in waits for SMS budget.
**FRs covered:** FR1

## Epic 1: Anju plays her first Quick Match

Anju, an LDC aspirant, opens Minnal on her phone as a guest and taps Quick Match. The server pairs her with a human, or with a clearly badged Minnal Bot after about 8 s. She then plays 10 server-refereed questions × 15 s from the published Kerala PSC bank, with speed-weighted scoring, peak-moment reveals inside the flash budget, explanations and source attribution. If her connection drops she gets 10 s to come back. She ends on a results screen with a breakdown and Rematch. To make this possible, the epic also lays down the monorepo scaffold, CI/CD and the first production deploy on the OVH Mumbai VPS + Cloudflare Pages, the DESIGN.md token and accessibility foundation, a seeded PSC question bank behind the internal question-set contract, guest identity, and publication of `minnal.match.completed`. The epic leaves out sign-in, ratings and deltas (Epic 2), reporting (Epic 3) and sharing (Epic 7).

### Story 1.1: Project scaffold runs locally

As Snobin, the developer,
I want a hand-built monorepo with the three Spring Boot services, the shared `contracts` module, the React PWA shell and one Docker Compose file that starts everything,
So that every later story has a consistent, runnable base and the same stack runs locally and in production.

**Requirements:** NFR22, NFR17 (Compose envelope groundwork), NFR18 (JSON logs with requestId), AD-1, AD-2, AD-3, AD-15 (Valkey AOF), AD-19 (same Compose file for local and prod), Additional Requirements: Starter template — NONE (hand-built scaffold), Service boundaries & data, Deployment & operations (Caddy routing), API conventions

**Acceptance Criteria:**

**Given** a fresh clone with JDK 25, Maven 3.9 and Node installed
**When** I run `mvn verify` at the repo root
**Then** the parent POM builds the `contracts` module and the `core`, `game` and `ratings` Spring Boot 4.1.x services on Java 25, and each service passes a context-load test
**And** a build rule (Maven Enforcer or an ArchUnit test) fails the build if any service depends on another service module; `contracts` is the only shared module

**Given** the source tree
**When** I inspect it
**Then** the layout is `contracts/`, `services/{core,game,ratings}`, `web/`, `deploy/`, each service's code sits under `in.minnal.<service>`, and new features follow `<feature>.(api|application|domain|infrastructure)`
**And** each service has Spring profiles `local` and `prod`, and every secret is read from an environment variable, with no secret value committed

**Given** Docker is running
**When** I run `docker compose -f deploy/compose.yaml up` with the local profile
**Then** `caddy` (2.11), `core-service`, `game-service`, `ratings-service`, `postgres` (18) and `valkey` (9.0) all start and report healthy
**And** each service exposes `/actuator/health` on the private Docker network, and Caddy routes `GET /health` to core-service health, returning 200 `UP`

**Given** the Postgres container has initialised
**When** I connect as each service login
**Then** schemas `core` and `ratings` exist with logins `core` and `ratings`, each granted rights on its own schema only, and there is no `game` schema or login
**And** a query from the `core` login against the `ratings` schema fails with a permission error (and vice versa)
**And** Flyway is wired into core and ratings with no application tables yet (tables arrive with the stories that need them)

**Given** the Valkey container
**When** I read its configuration
**Then** `appendonly yes` and `appendfsync everysec` are set, data sits on a named volume, and each service's Valkey key prefix is set to `core:`, `game:` or `ratings:`

**Given** the stack is up
**When** I call `/api/core/**`, `/api/ratings/**` and `/ws` through Caddy
**Then** they reach core-service, ratings-service and game-service respectively, `/ws` supports the WebSocket upgrade, and any `/internal/**` path returns 404 from Caddy and never reaches a service
**And** Caddy sets an `X-Request-Id` when the request has none, forwards it, and every service writes JSON logs that include `requestId`

**Given** an unknown path under `/api/core/v1/` or `/api/ratings/v1/`
**When** it is requested
**Then** the response is an RFC 9457 Problem Details JSON body (Spring `ProblemDetail`) with status 404

**Given** `web/` with dependencies installed
**When** I run `npm run dev`, `npm run typecheck` and `npm run build`
**Then** a React 19 + TypeScript 6 + Vite 8 app with vite-plugin-pwa, Tailwind 4, TanStack Query 5, Zustand 5, react-i18next 17 and @stomp/stompjs 7 renders a placeholder shell, the typecheck passes, and the production build succeeds
**And** the Vite dev server proxies `/api/core`, `/api/ratings` and `/ws` to the local Caddy

### Story 1.2: Minnal is live on the production server

As Snobin, the developer,
I want every merge to main tested, built and deployed automatically to the OVH Mumbai VPS and Cloudflare Pages, inside a safe resource and security envelope,
So that players can reach a real, monitored, backed-up Minnal and each later story ships with one merge.

**Requirements:** NFR6, NFR7 (graceful drain config), NFR9 (nightly off-site backup), NFR13 (secrets, CORS), NFR16, NFR17, AD-19, AD-12 (`/internal` never public), Additional Requirements: Deployment & operations, Security implementation (CORS)

**Acceptance Criteria:**

**Given** a pull request or a push to any branch
**When** the GitHub Actions workflow runs
**Then** it runs `mvn verify` and the web typecheck, tests and build, and any failure fails the workflow and blocks deployment

**Given** a merge to `main` with a green build
**When** the deploy job runs
**Then** images for core, game and ratings are built, tagged with the commit SHA and pushed to the container registry, the VPS pulls them and runs `docker compose up -d` with the same `deploy/compose.yaml` and the `prod` profile, and the web build is published to Cloudflare Pages
**And** game-service runs as exactly one replica

**Given** the production stack
**When** a browser requests the API domain over HTTP or HTTPS
**Then** Caddy serves a valid, auto-renewed TLS certificate, redirects HTTP to HTTPS, and `GET /health` returns 200
**And** only ports 80 and 443 are reachable from the internet; Postgres, Valkey and the service ports are not exposed publicly

**Given** `deploy/compose.yaml`
**When** a CI check script reads it
**Then** every container has a memory limit, every JVM has its heap capped at about 384 MB (`-Xmx384m` or equivalent), and the memory limits add up to less than 3.2 GB; otherwise the check fails
**And** every container has a healthcheck and `restart: unless-stopped`

**Given** a running service container
**When** its process is killed
**Then** Docker restarts it and it returns to healthy without manual action

**Given** production is live
**When** the external uptime monitor (a free tier, with no paid per-use service) pings `/health` at least every 5 minutes
**Then** a failed ping alerts the developer

**Given** the nightly schedule
**When** the backup job runs
**Then** a `pg_dump` of the database is uploaded to Cloudflare R2 with a dated name and a retention policy, `deploy/` holds both the backup script and a restore script, and one restore into a scratch database has been run successfully to prove the scripts

**Given** the repository and the server
**When** secrets are configured
**Then** all secrets (DB passwords, JWT signing key, `INTERNAL_SERVICE_TOKEN`, R2 and deploy credentials) live only in the server-side `.env` and GitHub Actions secrets, `.env` is git-ignored, and `.env.example` lists the keys without values
**And** rotating `INTERNAL_SERVICE_TOKEN` needs only a `.env` change and a redeploy

**Given** the prod profile
**When** a browser sends a cross-origin API request
**Then** CORS allows only the Cloudflare Pages origin (the local profile also allows the Vite dev origin), and a request from any other origin gets no `Access-Control-Allow-Origin` header

**Given** game-service receives SIGTERM during a deploy
**When** it shuts down
**Then** Spring graceful shutdown is enabled with a 5-minute timeout phase, the Compose `stop_grace_period` is at least 5 minutes for game-service, readiness reports `OUT_OF_SERVICE`, and a `draining` flag is exposed in the application for matchmaking and match actors to read (they use it in Stories 1.6–1.7)

### Story 1.3: Design foundation

As Anju, a player on a 2 GB Android phone,
I want the app shell to look calm and legible in Malayalam, follow my phone's light/dark and motion settings, and stay fast on 3G,
So that every screen I meet feels like Minnal and is comfortable and safe to use.

**Requirements:** FR75 (flash budget + Reduce-effects plumbing), NFR3, NFR4, NFR14, NFR15, NFR21, AD-18 (bundle budget, service worker shell-only), UX-DR1, UX-DR2, UX-DR3, UX-DR4, UX-DR5, UX-DR6, UX-DR7, UX-DR8, UX-DR9, UX-DR10, UX-DR11, UX-DR12, UX-DR13, UX-DR14, UX-DR15, UX-DR72, UX-DR73 (precache + preload, swap/optional faces), UX-DR74, UX-DR83 (scheduler), UX-DR84 (plumbing), UX-DR85, UX-DR86, UX-DR88 (shared live regions), UX-DR89 (title mechanism), UX-DR90 (helpers), UX-DR91, UX-DR93 (i18n wiring), UX-DR94, UX-DR95 (numerals), UX-DR96 (catalogue skeleton), UX-DR97 (service worker shell caching + manifest)

**Acceptance Criteria:**

**Given** the Tailwind 4 theme
**When** I inspect the generated CSS variables
**Then** every DESIGN.md colour, typography, radius, spacing and motion token (UX-DR1, UX-DR3, UX-DR5, UX-DR8, UX-DR9, UX-DR10) exists under its DESIGN name, typography is in rem, and motion tokens are also exported as TS constants
**And** a lint or unit check fails if `volt` is used on any surface other than `band`/`band-dark`, or if `dim` is used as a text colour

**Given** the phone is in dark mode (`prefers-color-scheme: dark`)
**When** any shell surface renders
**Then** every token swaps to its dark value (UX-DR2), no white appears except text, and switching the OS theme updates the app live without a reload

**Given** the Malayalam font
**When** the app is built
**Then** Noto Sans Malayalam is self-hosted as a woff2 subset covering `U+0D00-0D7F, U+200C-200D, U+25CC, U+0964-0965` with GSUB/GPOS features kept, it is about 45–70 KB and sits outside the JS budget, `font-synthesis: none` is set, and a metric-matched fallback `@font-face` (size-adjust, ascent/descent overrides) is defined
**And** the font is precached by the service worker with the app shell and `<link rel=preload>`-ed on the Home route; the live-match face uses `font-display: optional` and every other face uses `swap`
**And** a shaping fixture page renders ക്ഷ, ന്റ, ത്ത്ര and atomic chillu forms correctly (checked manually on Chrome Android)

**Given** react-i18next with `ml` and `en` catalogues
**When** the shell loads
**Then** every EXPERIENCE Voice and Tone string exists as a key in both languages, entries marked [ASSUMPTION]/TBD are flagged in the catalogue for sign-off, and no UI string is hard-coded in components (enforced by an i18n lint rule)
**And** `<html lang>` follows the UI language, a `<Lang>` helper wraps Latin runs in Malayalam UI in `lang="en"` (and Malayalam runs in English UI in `lang="ml"`), and number formatting uses Latin digits with grouping (`7,840`, `#3,406`)

**Given** keyboard or switch navigation
**When** any interactive element gets focus
**Then** `:focus-visible` shows a 2px solid ink ring with a 2px offset (ink-dark in dark mode, on-band on band surfaces), never volt, and `scroll-padding-bottom` equals the fixed-bar height so a focused element is never hidden behind the tab bar

**Given** the shared primitives (button primary, secondary and disabled, tab bar items, text links)
**When** they render
**Then** every hit area is at least 48 × 48 CSS px (through padding or a `::before` hit box) and adjacent hit areas never overlap, and a disabled button uses `aria-disabled="true"`, stays focusable and is paired with a caption saying why it is disabled

**Given** the Reduce-effects preference store
**When** the app boots
**Then** the setting has values `on | off | follow-phone` with default `follow-phone`, the reduced path is active when the setting is `on` or when it is `follow-phone` and `prefers-reduced-motion: reduce` is set, and the value persists on the device (the Settings UI that changes it arrives with Settings in Epic 2; a dev toggle exists for testing)
**And** an auto-fallback hook switches the reduced path on for the rest of the session when `navigator.deviceMemory ≤ 1`, or when the first instrumented band drop misses more than 3 frames (rAF deltas > 50 ms)

**Given** the app-wide flash scheduler utility
**When** two flash-producing transitions are requested less than 1000 ms apart
**Then** the second is queued until the 1000 ms flash-window has passed, flashes never overlap, and a unit test with fake timers proves no two flashes start within 1000 ms
**And** a QA fixture records peaks at 60 fps on a throttled device and counts flashes per 1000 ms

**Given** the app shell
**When** a player is on any non-live surface
**Then** a bottom tab bar shows Play / Rooms / Ranks / Me (കളി / റൂമുകൾ / റാങ്ക് / ഞാൻ) with a 20px icon over the tab label, the active tab in bold ink and inactive tabs muted; Rooms, Ranks and Me open placeholder surfaces with a heading and one line in voice; each tab keeps its scroll position on return
**And** the shell lets a route hide the tab bar (used later by the live match and takeover), and every route sets `document.title` in the UI language (e.g. "… · മിന്നൽ")

**Given** a cold load
**When** content is still loading
**Then** skeleton rows shaped like the surface show, with no shimmer under reduced effects, and no spinner without text past 1 s

**Given** the service worker and manifest
**When** the app has loaded once and the phone goes offline
**Then** the app shell (and the Malayalam font) loads from the service worker, `/api/**` and `/ws` are never cached, an inline offline banner shows and is announced once through the shared polite `role="status"` region, and play actions are `aria-disabled` with a caption
**And** the manifest uses standalone display and `orientation: "any"`, and the viewport meta never sets `maximum-scale` or `user-scalable=no`

**Given** the shell at 320 CSS px at 100% zoom, and at 360 px with 200% text
**When** I view it
**Then** there is no horizontal page scroll, text containers use min-height only (no fixed heights), and above about 480px the player column centres at a max width

**Given** the CI pipeline
**When** the web build runs
**Then** a bundle-size check fails the build if the initial JS is over 150 KB gzipped (the font is excluded from the budget)
**And** the brand mark component renders the hard-edged bolt polygon with the wordmark മിന്നൽ (ml UI) or Minnal (en UI)

### Story 1.4: A seeded PSC question bank

As Snobin, the developer and content admin,
I want reviewed Kerala PSC previous-year questions loaded into core-service as published versions and served through the internal question-set contract,
So that matches always draw a full, trusted, attributed set of questions and game-service never reads question tables.

**Requirements:** FR10, FR11 (bilingual storage), FR12, FR15, FR16 (attribution stored and served), FR25 (mixed draw), NFR13 (internal endpoint + service token), NFR19, AD-1, AD-2, AD-3, AD-12, Additional Requirements: Service boundaries & data (question lifecycle, shared validator, `/internal/question-sets`)

**Acceptance Criteria:**

**Given** core-service starts against an empty `core` schema
**When** Flyway migrates
**Then** it creates only the `subject`, `topic`, `question` and `question_version` tables (UUID ids, `Instant`/UTC timestamps)
**And** `question_version` holds `content_category` (accepting `KERALA_PSC`, `SCHOOL_QUIZ`, `GENERAL_KERALA`), subject, topic, `exam_level` (`TENTH | DEGREE | OTHER`), difficulty (`EASY | MEDIUM | HARD`), `text_ml?`, `text_en?`, exactly 4 options, `answer_index` 0–3, explanation, optional `attribution`, `version`, `status` (`DRAFT | PUBLISHED | DISCARDED`), `reviewed_by?`, `reviewed_at?` and `created_at`
**And** `question` holds exactly `id` (UUID), `source_ref?` with a partial unique index (unique where not null), `created_at` and `deleted_at?` (the soft-delete marker; null = live)

**Given** a `PUBLISHED` question version
**When** code tries to update it in place
**Then** the update is rejected (domain guard plus a test); a change can only be stored as a new version

**Given** the shared `QuestionValidator` in core-service
**When** it validates a candidate question
**Then** it requires at least one of `textMl`/`textEn`, exactly 4 non-blank options, `answerIndex` in 0–3, a non-blank explanation, and category, subject, topic, exam level and difficulty, and returns field-level errors (`field · problem`) instead of throwing on the first one
**And** table-driven unit tests cover each rule, and the validator is a single component that the admin form, CSV upload and custom-topic import will reuse later

**Given** a reviewed starter CSV of Kerala PSC PYQs in the repo (columns: category, subject, topic, examLevel, difficulty, textMl, textEn, optionA–D, answerIndex, explanation, attribution, sourceRef, reviewedBy, reviewedAt)
**When** the starter loader runs (a one-shot command or `seed` profile)
**Then** each valid row upserts its subject and topic by name and creates a question (with `source_ref` from `sourceRef`) and version 1 in `PUBLISHED` status, attribution stored verbatim (an empty value is stored as null), and the admin review recorded on that version: `reviewed_by` from `reviewedBy` and `reviewed_at` from `reviewedAt` (ISO-8601; the load instant when blank) (FR15)
**And** each invalid row is skipped and reported as `row N · field · problem`; a row with a blank `reviewedBy` is always rejected (`row N · reviewedBy · required: every seeded question must name the admin who reviewed it`), and the run ends with a summary line "N loaded · M rows skipped"

**Given** the loader has already run
**When** it runs again on the same file
**Then** no duplicates are created (rows are matched by `sourceRef` against `question.source_ref`), and the summary reports them as unchanged

**Given** at least 10 published Kerala PSC questions across several subjects
**When** game-service calls `POST /internal/question-sets {source: BANK, filters: {category: KERALA_PSC}, count: 10, requesterId}` with the valid internal service token
**Then** the response holds exactly 10 distinct questions, each the latest `PUBLISHED` version of a non-deleted question, as `{questionId, version, textMl?, textEn?, options, answerIndex, explanation, attribution?}`
**And** the draw is random across all subjects, so repeated calls return different mixes; `DRAFT`, `DISCARDED` and soft-deleted questions are never returned

**Given** filters (`subjectId`, `topicId`, `examLevel`) or a `count` larger than the matching published questions
**When** the set is requested
**Then** the filters narrow the pool, and if fewer than `count` questions match the response is `422` Problem Details; a short set is never returned

**Given** a request with a missing or wrong service token, or `count` outside 1–30
**When** it reaches `/internal/question-sets`
**Then** a bad token gets `401` and an invalid count gets `400` (both Problem Details), and the same path requested through Caddy gets `404`
**And** `source: CUSTOM` is rejected with `422` "custom source not available" until custom topics exist

**Given** the seeded database on hardware comparable to the VPS
**When** a 30-question set is requested
**Then** the response arrives within 500 ms, which leaves headroom inside game-service's 2 s fetch timeout

### Story 1.5: A guest can open Minnal and see Quick Match

As Anju, a first-time visitor,
I want to open Minnal and land on a Home screen in my phone's language with Quick Match ready, with no account needed,
So that I can try a match straight away and see what signing in would unlock.

**Requirements:** FR3, FR23 (guest access to Quick Match), NFR13, NFR14, AD-9, Additional Requirements: Identity / JWT / JWKS (guest JWT, JWKS, resource servers), UX-DR14, UX-DR18 (nudge layout; Google action wired in Epic 2), UX-DR21, UX-DR22, UX-DR25, UX-DR93 (guest device-language default)

**Acceptance Criteria:**

**Given** core-service
**When** a client calls `POST /api/core/v1/auth/guest {lang: "ml" | "en"}`
**Then** it returns `{accessToken, expiresAt}` where the token is an RS256 JWT expiring in 24 h with a random UUID `sub`, `roles: [GUEST]`, a generated `name` (e.g. "Guest 4821") and the requested `lang`
**And** nothing about the guest is written to the database (no guest table exists)

**Given** core-service's signing key from the environment
**When** a client fetches core's JWKS endpoint
**Then** it returns the public key(s) with a `kid`, and the JWKS can list more than one key, so keys can be rotated

**Given** game-service and ratings-service configured as OAuth2 resource servers against core's JWKS (fetched over the private network)
**When** a protected endpoint (exercised by test-scoped controllers) gets a request with a valid token, a tampered signature, an expired token or no token
**Then** the valid token passes with `sub`, `roles`, `name` and `lang` available, every other case gets `401` Problem Details, and `/actuator/health` stays public

**Given** a first open with no stored token
**When** the web app boots
**Then** it requests a guest token, keeps it on the device, sends it as a Bearer token on REST calls, reuses it until 5 minutes before expiry and then fetches a new one
**And** if the guest-token request fails, Home shows an inline retry with the reason instead of a blank screen

**Given** a phone whose preferred languages include Malayalam (`ml*`)
**When** a guest opens the app
**Then** the UI renders in Malayalam with `<html lang="ml">`; on any other device language it renders in English, and the chosen language is sent as `lang` in the guest-token request

**Given** a guest on Home
**When** Home renders
**Then** it shows the Quick Match primary card (an ink card, band-dark with a 1px dim-dark edge in dark mode, a static band-raised bolt watermark and a white button), and this card is the only filled ink element
**And** the Topic Duel, Battle Room and Solo Practice rows show as locked (muted title, half-opacity icon, lock + "Sign in" label), exactly one Sign-in nudge card is shown, and the rank snippet and rating trio are not rendered

**Given** a guest on Home
**When** she taps the Quick Match card once
**Then** she goes to the matchmaking route (a stub in this story)

**Given** a guest
**When** she taps a locked mode row or the nudge's button
**Then** an inline Sign-in prompt surface opens (not a modal) explaining what an account unlocks, with a "Continue with Google" button shown `aria-disabled` and a caption saying sign-in is coming soon
**And** Back returns to Home with focus on the element she tapped

**Given** a screen reader user on guest Home
**When** focus reaches a locked row
**Then** its accessible name says the mode is locked and needs sign-in, and every row and card has a 48px hit area with a visible focus ring

### Story 1.6: Matchmaking with bot fallback

As Anju, a guest or registered player,
I want to tap Quick Match and be paired with a similar opponent, or with a clearly labelled Minnal Bot within about 8 s,
So that I always get a match quickly and can trust who I am playing.

**Requirements:** FR3 (server-side mode gate), FR17, FR18, FR19 (badge in matchmaking), FR23, FR25, FR26, NFR7 (drain), NFR13 (JWT on CONNECT), NFR18 (queue wait, bot-fill), AD-2, AD-4, AD-7, AD-9, AD-10, AD-11 (one queue/match per `sub`), AD-12, AD-13, AD-18, Additional Requirements: Real-time protocol (contracts), Game engine (matchmaking), UX-DR17, UX-DR73 (fonts.ready gate), UX-DR75, UX-DR88 (bot-joined announcement)

**Acceptance Criteria:**

**Given** the `contracts` module
**When** I inspect it
**Then** it defines the STOMP envelope `{type, matchId|roomId, seq?, refSeq?, serverTime, payload}`, the SCREAMING_SNAKE message-type enum and client destinations as listed in AD-10, the `questionSource` enum `BANK | CUSTOM`, `Participant {participantId, displayName, kind: USER|GUEST|BOT}` and the `/internal/question-sets` DTOs, all with JSON round-trip tests
**And** the web app keeps matching TypeScript types, checked by a contract test against sample JSON produced from `contracts`

**Given** game-service's STOMP endpoint at `/ws`
**When** a client sends `CONNECT` with a valid JWT
**Then** the session is accepted and identity (`sub`, `name`, `lang`, roles) comes only from the token; a missing, invalid or expired token gets a STOMP `ERROR` and the connection is closed

**Given** a connected player
**When** she sends `/app/matchmaking/QUICK/join`
**Then** she joins the single matchmaking actor for `(QUICK)`, her rating comes only from game-service's in-memory rating cache (a missing entry, including any guest, counts as 1200), and any rating field the client sends is ignored
**And** only the actor thread mutates queue state; JOIN, CANCEL, DISCONNECT and TICK are queued events

**Given** two queued humans
**When** their ratings differ by at most 200
**Then** they are paired immediately
**And** two humans 300 apart are not paired before 4 s in queue and are paired once the band widens to ±400 at 4 s; a guest can pair with a registered player (tested with a controllable clock)

**Given** a player still unpaired at 8 s
**When** the actor ticks
**Then** she is paired with a `Participant{kind: BOT, displayName: "Minnal Bot"}` rated at her own rating, and her client shows "മിന്നൽ ബോട്ട് ചേർന്നു / Minnal Bot joined" with the BOT badge (outline tag wrapped in `lang="en"`), announced once through the polite region

**Given** a pairing has formed
**When** the actor asks core for the set (`BANK`, `KERALA_PSC`, all subjects, count 10)
**Then** the HTTP call runs off the actor thread with a 2 s timeout and its result returns to the actor as an event; only on success does each player get a private `MATCH_FOUND {matchId, mode, participants, questionCount, questionSource}` (`questionSource` is always `BANK` until Epic 6), and a minimal match-actor shell is created holding the set and participants in memory (the shell has no behaviour yet; Story 1.7 replaces it with the full match actor)

**Given** the question-set call times out, returns 422 or returns 5xx
**When** the result reaches the actor
**Then** both players get `MATCHMAKING_FAILED` and go back to idle (not re-queued), and the client shows an inline retry that re-joins on tap

**Given** a queued player
**When** she sends `/app/matchmaking/QUICK/cancel` before pairing
**Then** she is removed and her client returns to Home
**And** a cancel after pairing is rejected and the match goes ahead; a player whose last session disconnects while queued is removed from the queue

**Given** a `sub` that is already queued or in a match, from any of its sessions
**When** it sends another join
**Then** it gets a private `ERROR ALREADY_IN_MATCH` with the active matchId (if any), and the client offers to return to the active match

**Given** a guest token
**When** it joins any mode other than `QUICK`
**Then** game-service rejects the join with a private `ERROR` (forbidden mode) whatever the UI shows

**Given** game-service is draining (Story 1.2)
**When** a player sends a join
**Then** she gets `ERROR SERVER_DRAINING`, and the client shows a one-line "try again in a moment" notice

**Given** any pairing (human or bot)
**When** it forms
**Then** each human's `queueWaitMs` is recorded and kept with the match, a Micrometer timer records queue wait (median available), a counter records bot fills versus human pairings, and a JSON log line carries `matchId` and `userId`

**Given** the matchmaking screen (replacing the Story 1.5 matchmaking route stub)
**When** it renders
**Then** it shows "എതിരാളിയെ തിരയുന്നു… / Finding an opponent…" with a Cancel button that has a 48px hit area; under reduced effects it shows static text plus an elapsed-seconds count with no spinner
**And** after `MATCH_FOUND` the client waits for `document.fonts.ready` (capped at 3 s) and then opens a live-match stub screen reading "Match found · vs <name>" (BOT badge for a bot) with a Home link; Story 1.8 replaces this stub with the live match screen
**And** the web app has a single WebSocket connection module that alone updates the Zustand live-game store

### Story 1.7: Live match engine

As Anju, playing a Quick Match,
I want the server to run the 10 questions on its own clock, score speed fairly and keep the answer secret until time is up,
So that nobody can cheat and my score reflects how fast and how right I was.

**Requirements:** FR12, FR13, FR16 (attribution in reveal), FR19 (bot participant kind), FR20, FR21, FR22, NFR1, NFR2, NFR5, NFR7 (drain), NFR10, NFR11 (per-connection limit), AD-4, AD-5, AD-6, AD-7, AD-10, AD-12, Additional Requirements: Game engine (actor, secrecy, server clock, bots), Security implementation (per-connection inbound limit)

**Acceptance Criteria:**

**Given** the match actor created on `MATCH_FOUND` (replacing the Story 1.6 match-actor shell)
**When** the match runs
**Then** every state change (answer, timer tick, bot answer, disconnect) is a queued event processed one at a time on the actor's own thread, and a concurrency test with simultaneous answers and timer expiry always gives the same result
**And** an architecture test fails if match-actor code can reach a JDBC, repository or HTTP client, so no DB or network I/O happens between Q1 and the final reveal; outbound effects are WebSocket sends only

**Given** the match actor's participant model
**When** I inspect it
**Then** the actor holds `participants: List<Participant>` with per-participant state (score, answers, connection, forfeited) and has no `playerA` / `playerB` fields or 1v1-only branches; scoreboard, reveal, scoring, ranking and end-of-match logic iterate the list
**And** the actor's tests drive it through the list with N = 2 and with N = 5 participants, so a Battle Room match (Story 5.4) is configuration of this actor, not a refactor

**Given** a participant (or anyone else)
**When** they subscribe to `/topic/match/{matchId}`
**Then** only participants of that match are allowed; any other subscription is rejected

**Given** a question's window opens
**When** the actor broadcasts `QUESTION_STARTED`
**Then** the payload holds `{questionIndex, total: 10, startedAt, deadline = startedAt + 15 s, question: QuestionView{questionId, version, textMl?, textEn?, options[4]}}` and a serialization test proves `QuestionView` has no answer, explanation or correctness field
**And** no question is sent to any client before its own window opens

**Given** the `Scoring` function in `contracts`
**When** it scores an answer
**Then** a correct answer scores `500 + round(500 × remainingMs / 15000)` (1000 at 15000 ms left, 500 at 0 ms left) and a wrong or missing answer scores 0, and this one function is used for humans and bots alike (unit- and property-tested)

**Given** a participant sends `/app/match/{matchId}/answer {questionIndex, optionIndex}` inside the window
**When** the actor processes it
**Then** response time = the server receive instant − `startedAt`, any client timestamp is ignored, and she gets a private `ANSWER_ACCEPTED {questionIndex}` with `refSeq` and no hint of correctness
**And** (amended by Story 1.11) in 1v1 modes `ANSWER_ACCEPTED` also carries `{correct, points, answerIndex}`
**And** only her first answer for that question counts; later answers are dropped without changing anything, and answers after the deadline or for another question index are rejected with a private `ERROR`

**Given** an answer has been accepted
**When** the actor broadcasts `SCOREBOARD`
**Then** it shows only which participants have answered the current question; no option, correctness or score

**Given** the question closes (every participant still in the match has answered, or the 15 s window ends; amended by Story 1.11)
**When** the actor broadcasts `QUESTION_REVEALED`
**Then** it carries `questionIndex`, `questionId`, `version`, `answerIndex`, `explanation`, `attribution` (null when absent), each participant's picked option, correctness and points, and running totals
**And** after a configurable reveal hold (default 2 s, just long enough for the reveal animation and the correct option to show) the next question starts, so 10 questions finish in about 2.8 minutes from `MATCH_FOUND` to the final reveal, well within the 4-minute limit. The explanation is read in the results breakdown, not during the hold

**Given** a bot participant
**When** a question starts
**Then** the bot answers through the same answer event as humans after a delay drawn at random per question (not fixed, not tied to difficulty) inside the window, sometimes answers wrong or not at all, and is scored by `Scoring`; a test shows delays vary across questions and the scoring path has no bot-specific code

**Given** broadcasts on a match topic
**When** they are sent
**Then** each carries `seq` starting at 1 and rising by exactly 1, while private messages carry `refSeq` (the last broadcast `seq` they reflect) and no `seq`

**Given** one connection sends inbound messages faster than the per-connection limit (configurable, default 10 inbound messages per second; these are protocol frames, not chat — Minnal has no chat)
**When** the limit is exceeded
**Then** the excess messages are dropped with a private `ERROR RATE_LIMITED`, and other participants are unaffected

**Given** a load test of concurrent matches against the production envelope
**When** answers are submitted
**Then** a Micrometer timer from answer receipt to `ANSWER_ACCEPTED` send shows p95 under 200 ms, and `SCOREBOARD`/`QUESTION_REVEALED` go out within 500 ms of the triggering event

**Given** the 10th question has been revealed
**When** the actor finishes
**Then** the match moves to `ENDED` and its participants are released, so each `sub` may join a queue again (the results payload and post-match window come in Story 1.10)
**And** if game-service starts draining mid-match, live matches keep running to completion within the 5-minute drain

### Story 1.8: Live match screen and peak moments

As Anju, playing on a small Android phone,
I want a calm, legible question screen where one tap locks my answer and the reveal lands as a sharp but safe peak moment,
So that I can play fast in Malayalam and feel the moment of getting it right.

**Requirements:** FR11 (language choice + fallback), FR13 (client renders server state only), FR16, FR19, FR75, NFR4, NFR14, NFR15, AD-5, AD-18, UX-DR11, UX-DR17, UX-DR26, UX-DR27, UX-DR28, UX-DR29, UX-DR30, UX-DR31, UX-DR32 (explanation + attribution; report link in Epic 3), UX-DR34, UX-DR73 (`font-display: optional` in match), UX-DR83, UX-DR84, UX-DR85, UX-DR87 (question/lock/reveal), UX-DR88, UX-DR89, UX-DR90, UX-DR91, UX-DR92, UX-DR94, UX-DR95, UX-DR96

**Acceptance Criteria:**

**Given** a `QUESTION_STARTED` message
**When** the live match screen (replacing the Story 1.6 live-match stub) renders the open question
**Then** it is full screen with no tab bar; only the timer line, seconds label and "Q n/10" are sticky (≤ 48px); the score strip, question, options A–D (min-height 56) and the first-tap hint footer are in normal flow, and the whole answering state is monochrome
**And** the score strip shows You (bold ink) on the left and the opponent on the right with their unchanged name, a BOT badge for a bot, and status "thinking" → "answered" from `SCOREBOARD`, never what they picked

**Given** the question text
**When** it renders
**Then** it uses the UI language's text and falls back to the other language when that is missing; the question, option and explanation containers carry `lang` from the content language, and Malayalam text wraps, never truncates

**Given** an open question
**When** the player presses an option and lifts
**Then** the option shows pressed (ink border) on pointer down and commits only on `click`; sliding off before lifting cancels, a movement over 10 px counts as a scroll, and `touch-action: manipulation` is set
**And** after lift the option shows "…" until `ANSWER_ACCEPTED`, then the locked state (1.5px ink border, ink tile, "ലോക്ക്"); the footer reads "Locked in · result when time runs out", "Locked in" is announced politely, and any later taps are ignored
**And** (amended by Story 1.11) in 1v1 modes the player's own result shows at `ANSWER_ACCEPTED`; the full reveal at question close adds the opponent's pick, explanation and attribution

**Given** the countdown
**When** it runs
**Then** it is driven by the server `deadline` plus a clock offset computed from `serverTime` (never by a local 15 s timer), animated with `transform: scaleX()` on a composited layer, and never paused on the client
**And** the seconds label ticks once per second with a full-word `aria-label` ("9 സെക്കൻഡ്"), remaining time is announced once at 5 s, and `navigator.vibrate(30)` fires once at 5 s where supported

**Given** `QUESTION_REVEALED` where the player was correct
**When** the reveal renders
**Then** the peak band drops in (band-drop 160 ms) with the answer in peak-word type, points in volt peak-points, the total beside them and a single volt bolt strike (80 ms hold, 400 ms total); the correct option takes band fill with a volt ✓ tile, and the opponent's pick shows their unchanged name
**And** the explanation and attribution block shows the source, or "ഉറവിടം ലഭ്യമല്ല / source not available" when there is none, and the reveal is announced politely: "Correct. Answer: <option>. +800, total 3,140"

**Given** `QUESTION_REVEALED` where the player was wrong or did not answer
**When** the reveal renders
**Then** the same band shows with no bolt and no volt, always naming the correct answer in voice ("ശരി: പെരിയാർ. അടുത്തതിൽ നോക്കാം!"), the player's wrong pick is marked in brick, and non-chosen options turn muted

**Given** peak effects
**When** strikes and band drops are scheduled
**Then** they go through the Story 1.3 flash scheduler, so no two flashes start within 1000 ms; there are no full-white frames, the bolt's white area stays at or below 10% of the viewport, and only transform and opacity are animated

**Given** the reduced path is active (setting, OS preference or auto-fallback after the first band drop misses more than 3 frames)
**When** a reveal happens
**Then** it is a plain 200 ms fade with no band drop or strike, and the timer line steps once per second

**Given** dark mode
**When** the live match renders
**Then** dark tokens apply, the peak band and correct option carry a 1px volt edge, and no white appears except text

**Given** a new question starts
**When** the screen updates
**Then** focus moves to the question heading (`tabindex="-1"`), whose accessible name is the question text followed by "ചോദ്യം 4 / 10, 15 സെക്കൻഡ്", `document.title` updates to "ചോദ്യം 4 / 10 · മിന്നൽ", and the opponent answering is announced at most once per question; the seconds label is never a live region

**Given** the question has text in the other language
**When** the player taps the EN tag (48px hit area, ≥ 8px from the first line of the question)
**Then** the current question's other-language text shows, with `aria-pressed` and the accessible name "Show in English" / "മലയാളത്തിൽ കാണിക്കുക"; the toggle resets on the next question and does not change any setting
**And** the EN tag is hidden when no other-language text exists

**Given** the live match at 320 CSS px at 100%, and at 360 px with 200% text
**When** it renders long Malayalam questions and options
**Then** there is no horizontal page scroll and no clipped text, and the shaping fixture (ക്ഷ, ന്റ, ത്ത്ര, chillu) renders correctly in options
**And** the live-match font face uses `font-display: optional`, so there is no font swap mid-match

**Given** the web codebase
**When** I inspect the live-match components
**Then** they read only from the live-game store and never compute correctness or scores; every correctness and point value comes from `ANSWER_ACCEPTED` (1v1, own answer; Story 1.11) or `QUESTION_REVEALED`

### Story 1.9: Reconnect, forfeit and leave

As Anju, on patchy mobile data,
I want a dropped connection to give me 10 s to come back to the same question, and leaving on purpose to ask me first,
So that a network blip doesn't cost me the match and my opponent's game is never stopped by mine.

**Requirements:** FR63, FR64, FR65, NFR7, NFR18 (completed vs aborted counter), AD-4, AD-8 (completed/aborted rule), AD-9 (reconnect needs a valid token), AD-10, AD-11, UX-DR35, UX-DR36, UX-DR80 (aborted, opponent-left, forfeited notices), UX-DR88 (assertive reconnect start)

**Acceptance Criteria:**

**Given** a participant connected from two tabs with the same `sub`
**When** one tab closes
**Then** she stays connected and keeps receiving broadcasts; she becomes `DISCONNECTED` only when her last session closes, and that is queued to the match actor as an event

**Given** a participant whose last session dropped
**When** she reconnects with a valid token within 10 s
**Then** she gets a private `SNAPSHOT {refSeq, phase, questionIndex, question?, deadline?, lastReveal?, scores, participants}`, resumes at the current question with the server deadline and current scores, and can still answer the current question if the window is open and she has not answered; in 1v1 modes it also carries her own accepted answer's result for the current question (`myAnswer {pickedIndex, correct, points}`), so a reconnect restores the instant feedback (amended by Story 1.11)
**And** a reconnect with an expired or invalid token is refused

**Given** the client is reconnecting
**When** broadcasts arrive before the `SNAPSHOT`
**Then** the client buffers them, applies the `SNAPSHOT`, drops buffered messages with `seq ≤ refSeq`, applies the rest in order, and sends `/app/match/{matchId}/resync` on any `seq` gap to get a fresh `SNAPSHOT` (unit-tested with out-of-order and gapped sequences)

**Given** the connection drops during play
**When** the client notices
**Then** the reconnect banner replaces the timer area with a 40px ring counting 10 → 0, everything below is dimmed 42%, `inert` and `aria-hidden`, the banner is monochrome and never flashes, the client retries automatically, and the server timer keeps running
**And** the start of reconnecting is announced through the assertive region once, the end politely once, and nothing is announced per second

**Given** a participant has been disconnected for 10 s
**When** the grace period ends
**Then** she is marked `forfeited`, scores 0 on every remaining question, the match continues for everyone else (in a 1v1, the match ends at once instead; Story 1.12), and a later reconnect gets a `SNAPSHOT` showing she forfeited, with answers rejected
**And** her client shows the Forfeited copy ("ബാക്കി ചോദ്യങ്ങൾ നഷ്ടമായി, മാച്ച് തുടരുന്നു") and goes to the results route with the score she earned (a minimal view in this story; the full results screen is Story 1.10)

**Given** a 1v1 match where the opponent forfeits
**When** the forfeit is broadcast
**Then** (amended by Story 1.12) the match ends at once: the remaining player sees "<name> left · you win", announced politely once, and goes to her results; in a Battle Room (Epic 5) the others keep playing

**Given** a player taps Leave or presses Android back during play
**When** the confirm dialog opens
**Then** it is a centred `role="alertdialog"` over a 42% dim with the title "പുറത്തുപോകണോ? ബാക്കി ചോദ്യങ്ങൾ നഷ്ടമാകും / Leave? You'll forfeit the remaining questions", a primary "Stay" button that has focus, and a brick "Leave" text button; the background is `inert` and the server timer keeps running
**And** Esc or Android back means Stay, which returns focus to the question heading

**Given** the player confirms Leave
**When** the client sends `/app/match/{matchId}/leave` (per AD-10)
**Then** she is forfeited at once (no 10 s grace), the match continues for the others (in a 1v1, the match ends at once instead; Story 1.12), and she goes to the results route with her earned score

**Given** every human has forfeited or left before Q1 is revealed and no human remains (a human vs bot match, or a room; amended by Story 1.12: in a human-vs-human 1v1 the first forfeit ends the match as completed, so it never aborts)
**When** the actor sees this
**Then** the match is aborted: it stops, nothing is published, no results are produced, and the completed-vs-aborted counter-metric records it as aborted, which is the only place an aborted match is counted (FR65: no rating, history or product metric); any still-connected human client returns Home with a one-line notice that the match did not count, announced politely

**Given** Q1 has been revealed
**When** every human later forfeits or leaves
**Then** the match still counts as completed, and the actor scores all remaining questions 0 and finishes immediately instead of waiting out the timers
**And** a completed-match counter increments

### Story 1.10: Results and rematch

As Anju, finishing a Quick Match,
I want a results screen that celebrates a win, takes a loss gently, explains every question and lets me rematch in one tap,
So that I learn from my mistakes and want to play again straight away.

**Requirements:** FR16, FR19 (bot badge on results), FR53, FR54 (scores, placements, breakdown; the rating delta comes in Epic 2), FR55, FR57, FR79, NFR8 (event carries `eventId` for idempotent consumers), NFR18, AD-8, AD-10, AD-14, AD-15, AD-18, Additional Requirements: Event streams & contracts (`minnal.match.completed` payload), UX-DR17, UX-DR38, UX-DR39, UX-DR40, UX-DR41, UX-DR42, UX-DR43 (Rematch / Home; Share in Epic 7), UX-DR44, UX-DR47 (`sessionStorage` rehydrate; registration prompt in Epic 2), UX-DR80, UX-DR83, UX-DR84, UX-DR87 (results focus), UX-DR88, UX-DR89

**Acceptance Criteria:**

**Given** the `Ranking` function in `contracts`
**When** it ranks participants
**Then** it orders by score descending, then correct count descending, else a tie with a shared placement; in a 1v1, a forfeiter always places last; in a Battle Room a forfeiter is ranked on earned score; unit tests cover a clear win, a correct-count tiebreak, a full tie, a 1v1 forfeiter who led on score placing last, and a room forfeiter ranked on earned score (amended by Story 1.12)

**Given** the final question has been revealed in a completed match
**When** the actor ends play
**Then** it sends `MATCH_ENDED` immediately to every participant with a live session (forfeited ones included) with `{matchId, mode, questionSource, participants[{participantId, displayName, kind, score, correctCount, forfeited, placement}], questions[{questionId, version, textMl?, textEn?, options, answerIndex, explanation, attribution?}], breakdown per participant [{pickedIndex?, correct, responseMs?, points}]}`, and the actor enters `POST_MATCH` for 60 s; `questionSource` is the Story 1.6 field (always `BANK` until Epic 6)

**Given** a completed match
**When** game-service publishes to Valkey
**Then** exactly one `minnal.match.completed` is added with `XADD … MAXLEN ~100000` and the AD-8 payload `{eventId, matchId, mode, questionSource: BANK, rated: true, startedAt, endedAt, queueWaitMs, participants[{participantId, userId (USER only), kind: USER|GUEST|BOT, displayName, score, correctCount, forfeited, placement}]}`
**And** an aborted match publishes nothing, publishing happens after the final reveal (never during play), a failed publish is retried with backoff and logged without blocking results, and no consumer exists yet

**Given** the player won (placement 1, not tied)
**When** results open
**Then** a full-screen win takeover (band in both themes, a large volt bolt, "ജയിച്ചു! / You won!", the player's score in volt and the opponent's muted) starts at least 1000 ms after the last reveal's strike (through the flash scheduler), as `role="dialog"` labelled by its title with the "Continue" button focused
**And** it holds for 1600 ms or until Continue or a tap anywhere, then collapses (240 ms) into the compact results band; the dismissing tap is consumed and results ignore taps for 400 ms; under reduced effects or a screen reader there is no auto-advance (Continue only)

**Given** the player lost
**When** results open
**Then** they open straight on the settled view with an ink band, no volt, and the loss line using the opponent's unchanged name ("Vishnu ജയിച്ചു · അടുത്ത തവണ നിങ്ങൾക്ക്")

**Given** both players share placement 1
**When** results open
**Then** a draw band "സമനില / Draw" shows both scores in white, with no volt, no bolt and no takeover

**Given** any Epic 1 results screen (replacing the Story 1.9 minimal results view)
**When** it renders
**Then** no rating-delta area or "updating" placeholder is shown (deltas arrive in Epic 2), and a bot opponent always shows the BOT badge

**Given** the per-question breakdown
**When** it renders
**Then** a dot strip shows one 7px dot per question (ink = correct, brick ring = wrong), exposed as a list ("Q1 correct … Q10 wrong") with the glyphs `aria-hidden`
**And** correct rows load collapsed as `<button aria-expanded="false">` showing "Q3 ✓ 9 s +800"; wrong and missed rows are always expanded with "നിങ്ങൾ:" (the player's answer in brick), "ശരി:" (the correct answer in bold), the explanation and the attribution or "source not available"; there is no report link (Epic 3) and no height animation under reduced effects

**Given** results have opened
**When** focus lands
**Then** focus moves to the results heading, whose accessible name carries the result ("You won, 3,140 to 2,980"), and `document.title` names the result surface

**Given** results are showing
**When** the player reloads the page
**Then** the screen rehydrates identically from the last `MATCH_ENDED` stored in `sessionStorage` (keyed by matchId, replaced by the next match), and opening the results route with nothing stored redirects Home

**Given** a 1v1 results screen with a human opponent
**When** one player taps Rematch (`/app/match/{matchId}/rematch`)
**Then** the button becomes a 1.5px ink-outline card "Waiting for <name>…" with a seconds count and a Cancel link (48px hit area); the opponent's button reads "Accept rematch"; when both have requested within the 60 s `POST_MATCH` window, a new match starts with the same mode and participants, a fresh `matchId` and a newly fetched question set (with the `MATCHMAKING_FAILED` path if that fetch fails)
**And** on timeout or cancel the button reverts with a one-line note, announced politely, and Rematch can be sent again (a re-send restarts the 60 s window); if the opponent has left or joined something else, the request returns a one-line "rematch unavailable" note

**Given** a bot opponent
**When** the player taps Rematch
**Then** the bot accepts instantly and a new match starts

**Given** guest players
**When** they rematch in Quick Match (guest vs guest, guest vs registered, guest vs bot)
**Then** rematch works the same as for registered players, and the one-queue/match-per-`sub` rule still applies

**Given** the results action bar
**When** it renders
**Then** it is fixed at the bottom with Rematch (primary) and Home (secondary), wrapping to stacked full-width buttons when the labels don't fit, and Share is not present (Epic 7)
**And** Home returns to Home with the tab bar visible again and cancels any pending rematch request

### Story 1.11: Instant 1v1 feedback and early close

As Anju, playing a Quick Match or Topic Duel,
I want to know straight away whether my answer was right, and to move on as soon as we have both answered,
So that the match feels fast and responsive instead of making me wait out every 15 s.

**Requirements:** FR-4.5, FR-4.6 (amended 2026-11-12), FR13 (amended), AD-5 (amended), AD-6 (amended), UX-DR31 (amended). Source: `sprint-change-proposal-2026-11-12.md`. Build it next, before Story 1.9.

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

### Story 1.12: A 1v1 forfeit ends the match

As Anju, whose Quick Match opponent has left,
I want to win at once instead of answering the remaining questions against nobody,
So that a walk-out never wastes my time and the leaver can't escape the loss.

**Requirements:** FR59, FR64, FR65 (as amended 2026-11-13), AD-8, AD-11 (amended). Source: `sprint-change-proposal-2026-11-13.md`.

**Acceptance Criteria:**

**Given** a human-vs-human 1v1 (Quick Match or Topic Duel) in any phase (lead-in, question open, reveal)
**When** one player forfeits (confirmed Leave, or the 10 s grace expires)
**Then** the actor ends the match at once: the open question, if any, is closed and revealed as in an early close; no further questions start; the match is completed (even before the Q1 reveal); `MATCH_ENDED` goes to both humans with live sessions, and one `minnal.match.completed` is published
**And** `Ranking`, in a 1v1, places the forfeiter last regardless of score or correct count, with a unit test where the forfeiter led

**Given** a human vs bot match
**When** the human forfeits before the Q1 reveal
**Then** the match is aborted as today

**Given** a human vs bot match
**When** the human forfeits after the Q1 reveal
**Then** the match ends at once as completed and she places last; the bot wins

**Given** the remaining player
**When** the opponent's forfeit arrives
**Then** she sees "<name> left · you win" (announced politely once), then `/results` with the win takeover once `MATCH_ENDED` is in, after the usual reveal hold if a question was just revealed

**Given** the leaver (still connected)
**When** her forfeit is confirmed
**Then** her notice reads "You left · <name> wins" (replacing "the match goes on" in 1v1), and her results show the loss

**Given** a Battle Room (Epic 5)
**When** anyone forfeits
**Then** nothing changes: the others play on, and forfeiters are ranked on their earned score

## Epic 2: Anju gets an account and a rating

Anju has just finished her first guest Quick Match. Her results screen turns that result into a reason to sign in, and one tap on "Continue with Google" takes her through a redirect sign-in and a one-screen profile (name, district, exam level, language) and back to where she was. From her next match on, ratings-service rates every rated match she plays with standard ELO, her results show the rating change, her Me tab shows her three ratings and her last 20 matches, and the Ranks tab places her on the all-Kerala daily, weekly and all-time boards, with her own row pinned and a "#212 in Kerala today" snippet on Home. Settings lets her change language and Reduce effects, sign out, and delete her account, which removes her from every board and from play. To make this possible, the epic adds core-service's user accounts, Google login behind a login interface (so phone OTP can come later), access and rotating refresh tokens, the `minnal.user.*` events, the whole ratings-service (ELO, match history, player directory, leaderboard projection) and game-service's rating cache, so matchmaking bands use real ratings. Guests are never rated or persisted, and a guest result is never moved into a new account. The epic leaves out Topic Duel and Solo Practice (Epic 4), Battle Room play (Epic 5; its N-player rating maths is built here), reporting (Epic 3), the install prompt and share card (Epic 7), and phone OTP (deferred).

### Story 2.1: Sign in with Google

As Anju, a guest who wants to keep a rating,
I want to tap "Continue with Google", sign in without a popup and land back where I was,
So that I get an account in a few seconds and come back to the same one every time.

**Requirements:** FR2, FR1 (login interface only; phone OTP stays deferred), FR3 (registered players get the non-guest gate), FR68 (ADMIN role bootstrap), NFR13, AD-1, AD-3, AD-9, Additional Requirements: Identity / JWT / JWKS, Security implementation (CORS), UX-DR18 (Google action wired), UX-DR22 (rows unlock for registered players), UX-DR76, UX-DR88 ("Signed in as" announcement)

**Acceptance Criteria:**

**Given** core-service starts against its schema
**When** Flyway migrates
**Then** it creates only `app_user` (`id` UUID, `status` `ACTIVE | DELETED`, `email`, `created_at`, `last_sign_in_at`), `user_identity` (`provider` such as `GOOGLE`, `provider_subject`, `user_id`, unique on `(provider, provider_subject)`) and `refresh_token` (`id`, `user_id`, `token_hash`, `expires_at`, `created_at`) tables
**And** refresh tokens are stored only as a hash, never in plain text

**Given** the login code in core-service
**When** I inspect it
**Then** sign-in goes through a `LoginMethod` interface whose only implementation is `GoogleLoginMethod`, which resolves a verified external identity to a `user_identity` row; the token issuer, account creation and refresh logic do not reference Google, so a phone-OTP `LoginMethod` can be added later with no change to them (FR1)

**Given** a guest taps "Continue with Google" on the Sign-in prompt, the nudge card or a locked mode row
**When** the web app starts sign-in
**Then** the whole page navigates (no popup, no One Tap, no iframe) to `GET /api/core/v1/auth/google/start?returnTo=<path>`, and core redirects to Google's OpenID Connect authorization endpoint with `state`, `nonce` and a PKCE challenge, holding them in a short-lived (10 min) httpOnly `SameSite=Lax` cookie [ASSUMPTION: OIDC authorization-code + PKCE redirect flow; core exchanges the code server-side and verifies the resulting ID token]
**And** `returnTo` must be a relative in-app path (starting with a single `/`); anything else (absolute URL, `//host`, unknown scheme) is replaced with `/`, so the flow can never be used as an open redirect

**Given** Google redirects back to `GET /api/core/v1/auth/google/callback` with a code
**When** core handles it
**Then** core checks `state` against the cookie, exchanges the code, and verifies the ID token signature against Google's JWKS plus `iss`, `aud` (Minnal's client id), `exp` and `nonce`; any failure (bad state, bad signature, wrong audience, expired, nonce mismatch) creates no account and redirects to the PWA with `?signin=failed` and a one-line inline error on the originating surface
**And** if the player cancelled at Google (`error=access_denied`), she returns to the originating surface with the one-line note "Sign-in cancelled", still as a guest

**Given** a verified Google identity with no matching `user_identity` row
**When** sign-in completes
**Then** a new `app_user` (status `ACTIVE`) and its `user_identity` row are created in one transaction, and the account is flagged as needing profile setup
**And** given the same Google account signs in again later (any device), the existing account is resumed: no second `app_user` is created and `last_sign_in_at` updates

**Given** a successful sign-in
**When** core finishes the callback
**Then** it sets a 30-day refresh token in an httpOnly `Secure` `SameSite=Strict` cookie scoped to `Path=/api/core/v1/auth`, puts no token in the URL, and redirects the browser to the PWA's `/auth/return?to=<returnTo>` route [ASSUMPTION: the PWA and API share one registrable domain, e.g. `minnal.in` and `api.minnal.in`, so this cookie is first-party; the Cloudflare Pages site needs a custom domain]
**And** the PWA immediately calls `POST /api/core/v1/auth/refresh` to get its access token

**Given** a valid refresh cookie
**When** the web app calls `POST /api/core/v1/auth/refresh`
**Then** core returns `{accessToken, expiresAt}` with an RS256 access JWT signed by the Story 1.5 key (with `kid`), valid for 1 h, carrying `sub` (the user id), `roles` ⊂ {`USER`, `ADMIN`}, `name` and `lang`; an expired or unknown refresh token gets `401` and the client falls back to a guest session
**And** CORS for this endpoint allows credentials only for the PWA origin; in this story the refresh token is not rotated and is reused until it expires (Story 2.2 adds rotation, reuse detection and the CSRF guard)
**And** until a profile exists, `name` is the Google `given_name` (else "Player") and `lang` is the language the guest was using [ASSUMPTION]

**Given** the `ADMIN_EMAILS` environment variable (comma-separated)
**When** core issues an access token (at sign-in and on every refresh)
**Then** roles are recomputed: `USER` always, plus `ADMIN` when the account's Google email is verified (`email_verified = true`) and matches an entry case-insensitively; removing an email from the variable drops `ADMIN` at the next refresh [ASSUMPTION: roles recomputed per issue]

**Given** the web app holds a registered session
**When** it stores tokens
**Then** the access token lives only in memory (never in `localStorage` or `sessionStorage`), on app boot the client calls refresh to obtain one, and when refresh fails it falls back to the Story 1.5 guest token flow
**And** the client refreshes the access token about 5 minutes before `expiresAt`

**Given** sign-in has completed
**When** the PWA lands on `/auth/return`
**Then** it restores the originating surface from `to`, moves focus to that surface's heading and announces "Signed in as <name>" (with the name unchanged) once through the shared polite region

**Given** a registered player on Home
**When** Home renders
**Then** the Sign-in nudge is gone and the Topic Duel, Battle Room and Solo Practice rows are no longer locked; until their epics ship they show `aria-disabled` with the caption "Coming soon" instead of opening a mode [ASSUMPTION]
**And** the Story 1.5 "Continue with Google" button is now enabled everywhere it appears, and the "coming soon" caption under it is removed

**Given** a registered player with a valid `USER` access token
**When** she connects to `/ws` and joins `QUICK` matchmaking
**Then** game-service accepts the token, takes `sub`, `name` and `lang` from it, and her completed match is published in `minnal.match.completed` with `kind: USER` and `userId = sub`
**And** ratings-service's resource-server config accepts `USER` and `ADMIN` tokens as well as `GUEST` tokens (exercised by a test-scoped endpoint)

### Story 2.2: Refresh token rotation and session continuity

As Anju, a registered player,
I want to stay signed in across days, tabs and a live match without signing in again, and have a stolen refresh token stop working,
So that my account is both convenient and safe.

**Requirements:** FR2 (the resumed account stays signed in), NFR13, AD-9 (30-day rotating refresh token), AD-11 (open session survives expiry; reconnect needs a valid token), Additional Requirements: Identity / JWT / JWKS, Security implementation (CORS)

**Acceptance Criteria:**

**Given** core-service starts after Story 2.1
**When** Flyway migrates
**Then** it alters only `refresh_token`, adding `family_id` (each existing row gets its own new family), `rotated_at?` and `revoked_at?`; no table is created

**Given** a valid refresh cookie (replacing the Story 2.1 non-rotating refresh)
**When** the web app calls `POST /api/core/v1/auth/refresh` with the `Origin` header of the PWA and the header `X-Minnal-Auth: 1` [ASSUMPTION: CSRF guard]
**Then** core returns the Story 2.1 access token, marks the old refresh token rotated, and sets a new one (same family, fresh 30-day expiry) in a cookie with the same httpOnly `Secure` `SameSite=Strict` `Path=/api/core/v1/auth` attributes; the callback's first refresh token starts a new family
**And** a request without the matching `Origin` or the custom header gets `403` Problem Details and nothing is rotated

**Given** a refresh token that has already been rotated
**When** it is presented again
**Then** core treats it as reuse: it revokes every token in that family, clears the cookie and returns `401`, and the client falls back to a guest session with a one-line "Please sign in again" note
**And** an expired, revoked or unknown refresh token also gets `401` and the same fallback, and a JSON log line records the reuse event with `userId`

**Given** two tabs of the PWA hold the same refresh cookie
**When** both need a new access token at the same time
**Then** the web app serialises refresh through the Web Locks API, so only one refresh call is in flight and the other tab uses the rotated cookie; reuse detection is never triggered by the app's own tabs (tested with two contexts) [ASSUMPTION]

**Given** a registered player whose access token expires during an open WebSocket session
**When** the session continues
**Then** game-service does not close it and her live match plays to the end
**And** when the connection later drops, the client first refreshes the access token and then reconnects with the new token; a reconnect attempted with the expired token is refused (Story 1.9 behaviour kept)

### Story 2.3: Profile setup and editing

As Anju, a newly registered player,
I want to set my display name, district, exam level and language on one screen, and change them later from Me,
So that other players and the boards show me the way I want, and Minnal speaks my language.

**Requirements:** FR6, NFR13, NFR14, AD-9 (`name` and `lang` claims), AD-15 (event delivery), AD-16 (`minnal.user.profileUpdated`), Additional Requirements: Event streams & contracts, UX-DR16, UX-DR77, UX-DR93, UX-DR94, UX-DR95, UX-DR96

**Acceptance Criteria:**

**Given** core-service starts after Story 2.1
**When** Flyway migrates
**Then** it creates only `user_profile` (`user_id` PK, `display_name`, `district`, `exam_level` `TENTH | DEGREE | OTHER`, `language` `ml | en`, `updated_at`) and `event_outbox` (`id`, `stream`, `payload` JSON, `created_at`, `published_at?`, `attempts`) [ASSUMPTION: transactional outbox so profile and deletion events are never lost]

**Given** the display-name rule [ASSUMPTION: rule chosen for MVP, needs product sign-off]
**When** a name is validated (the same rule in a shared web validator and in core, with core authoritative)
**Then** the value is NFC-normalised, trimmed and has internal whitespace collapsed to one space, and is accepted only if:
- it is 2–24 characters long counted as user-perceived characters (grapheme clusters), so Malayalam conjuncts count once
- it uses only Latin letters, Malayalam letters and vowel signs (U+0D00–U+0D7F), ZWJ/ZWNJ (U+200C–U+200D), digits 0–9, spaces, `.`, `'` and `-`
- it starts with a letter and contains no run of more than one punctuation character
- it is not a reserved name, compared case-insensitively: "Minnal", "മിന്നൽ", "Minnal Bot", "BOT", "Admin", or the guest pattern "Guest <digits>"
**And** names need not be unique, and there is no profanity filter at MVP [ASSUMPTION]
**And** each failure returns a field-level error naming the problem and the fix (e.g. "Use 2–24 letters" / "Only letters, numbers, spaces and . ' - are allowed"), and table-driven tests cover Malayalam names with chillu and ZWJ, mixed-script names and every reserved name

**Given** the district field
**When** it renders
**Then** it is a native `<select>` listing Kerala's 14 districts (stored as stable codes, shown in the UI language) plus "Outside Kerala" [ASSUMPTION: "Outside Kerala" option], and core rejects any other value
**And** exam level is a native `<select>` of 10th / Degree / Other

**Given** a newly created account signs in (Story 2.1)
**When** `/auth/return` runs
**Then** the profile setup screen opens first, as one screen with visible `<label>`s for display name (prefilled from the Google given name when it passes the rule, else empty), district (no default), exam level (no default) and language (prefilled with the current UI language), and one primary "Save" button
**And** after a successful save the player goes on to the originating surface, as in Story 2.1 (this story adds the setup redirect to `/auth/return`)

**Given** an account that has never completed setup (the app was closed mid-setup)
**When** the player opens the app again signed in
**Then** the setup screen opens again before any other surface, and the Quick Match card cannot start matchmaking until setup is saved [ASSUMPTION: setup is required before registered play]

**Given** the setup or edit form
**When** the player chooses a language
**Then** the UI switches to that language at once (strings, `<html lang>` and `document.title`), focus stays on the language field, and the change is announced politely in the new language ("ഭാഷ മലയാളം" / "Language: English")
**And** nothing is saved until the player taps Save

**Given** a valid form
**When** the player taps Save
**Then** `PUT /api/core/v1/me/profile {displayName, district, examLevel, language}` stores the profile, sets `updated_at`, and in the same transaction writes a `minnal.user.profileUpdated {eventId, userId, displayName, district, examLevel, language, updatedAt}` row to the outbox
**And** a relay publishes outbox rows to Valkey (`XADD … MAXLEN ~100000`) in order, marks them published, and retries with backoff on failure, so a crash after commit still delivers the event (tested by failing the first publish)
**And** the client then calls refresh, so the next access token carries the new `name` and `lang`

**Given** an invalid form
**When** the player taps Save
**Then** nothing is stored or published, each field error shows under its field with ⚠ and text (brick never the only cue), linked by `aria-describedby` with `aria-invalid`, and focus moves to the first invalid field
**And** a `PUT` that skips the client validator gets `400` Problem Details with the same field-level errors

**Given** a registered player on the Me tab (replacing the Story 1.3 Me placeholder)
**When** it renders
**Then** a Profile section shows her display name, district, exam level and language with an "Edit" action that opens the same form prefilled, and Back without saving discards changes (and reverts any language preview)
**And** given the Me tab for a guest, it shows exactly one Sign-in nudge and no profile

**Given** `GET /api/core/v1/me/profile`
**When** it is called with a `USER` token
**Then** it returns `{displayName, district, examLevel, language, profileComplete}`; a `GUEST` token gets `403` Problem Details

**Given** a display name anywhere it is shown in a Malayalam string (the "Signed in as" announcement, the profile header, later board rows and loss lines)
**When** the string is built
**Then** the name is inserted unchanged, followed by a separator or placed as its own run, never inflected with a Malayalam case ending, and a Latin-script name inside Malayalam UI is wrapped in `lang="en"`; an i18n unit test checks the catalogue's name-bearing strings use the separator form

### Story 2.4: Guest results sign-in prompt

As Anju, a guest who has just finished a Quick Match,
I want my results screen to show me what an account would give me, using the match I just played,
So that I sign in while I care about my score.

**Requirements:** FR4, FR5, AD-9 (last guest result kept in `sessionStorage`), AD-18, UX-DR18, UX-DR47 (registration prompt), UX-DR76, UX-DR95, UX-DR96 (prompt copy flagged TBD)

**Acceptance Criteria:**

**Given** a guest's Quick Match has ended
**When** the results screen renders (after the takeover if she won)
**Then** a registration prompt card in the Sign-in nudge style (1.5px ink outline, benefit text, ink "Continue with Google" button) shows below the results band and above the breakdown; it is inline, never a modal, and it is the only nudge on the screen
**And** the prompt text uses that match's result as the hook, with variants for win, loss, draw and a bot opponent, e.g. "You scored 7,840. Sign in and your next win moves your Quick Match rating." [ASSUMPTION: copy; all variants flagged TBD in the catalogue for sign-off in both languages]

**Given** the prompt copy
**When** it is reviewed
**Then** no variant promises that this match will be saved, rated or added to history, and any opponent name in it appears unchanged with a separator (never inflected)

**Given** a registered player's results
**When** they render
**Then** no registration prompt is shown

**Given** a guest reloads the results page
**When** it rehydrates from the last `MATCH_ENDED` in `sessionStorage` (Story 1.10)
**Then** the prompt rebuilds from the same stored result and shows identical text

**Given** a guest taps "Continue with Google" on the prompt
**When** sign-in starts
**Then** `returnTo` is the current results route, and after sign-in (and profile setup for a new account) she lands back on the same results, rehydrated from `sessionStorage` in the same tab, with focus on the results heading and "Signed in as <name>" announced

**Given** she has signed in from the prompt and is back on those results
**When** they render
**Then** the prompt is gone, a muted one-line note says the match was played as a guest and is not on her record [ASSUMPTION: copy TBD], no rating-delta area is shown for that match, and the Rematch button is replaced by "Play again" which starts a new Quick Match as her registered self [ASSUMPTION: the guest's post-match window ended with the guest session]

**Given** the sign-in and profile requests
**When** they are sent
**Then** they carry nothing about the guest match or the guest `sub` (no matchId, score or guest id), so no guest result can be migrated into the new account; a test asserts core has no endpoint or field that accepts a guest result
**And** the stored guest result stays only in that tab's `sessionStorage` and is replaced by the next match

### Story 2.5: Ratings service computes ELO

As Anju, a registered player,
I want every rated match I finish to update my rating in that mode fairly, whoever I played,
So that my rating reflects my real level and matchmaking pairs me with players like me.

**Requirements:** FR5 (guests never rated or stored), FR17 (matchmaking uses real server-held ratings), FR24, FR39 (generic N-player pairwise formula only; Battle Room rating ships in Epic 5), FR59, FR62, NFR8, NFR13, AD-1, AD-2, AD-3, AD-8, AD-13, AD-15, AD-16, Additional Requirements: Event streams & contracts, Service boundaries & data

**Acceptance Criteria:**

**Given** ratings-service starts against its schema
**When** Flyway migrates
**Then** it creates only `rating` (`user_id`, `mode`, `rating` integer, `matches_rated`, `updated_at`; PK `(user_id, mode)`), `rating_event` (`id`, `event_id`, `match_id`, `user_id`, `mode`, `rating_before`, `rating_after`, `delta`, `ended_at`; unique `(match_id, user_id)`), `match_record` (`match_id`, `user_id`, `mode`, `placement`, `result` `WIN | LOSS | DRAW`, `score`, `correct_count`, `forfeited`, `rated`, `rating_delta?`, `ended_at`; PK `(match_id, user_id)`), `player_directory` (`user_id` PK, `display_name`, `district`, `exam_level`, `language`, `updated_at`, `tombstoned_at?`) and `event_outbox` (same shape as core's)
**And** modes are stored as `QUICK | TOPIC_DUEL | BATTLE_ROOM` [ASSUMPTION: the last two names, matching Epic 1's `QUICK`], and there are no foreign keys to other schemas

**Given** the ELO function in ratings-service
**When** it rates one `USER` participant in a match of N participants
**Then** it compares her with each other participant pairwise, using standard expected score `E = 1 / (1 + 10^((R_opp − R_self) / 400))` and actual score 1 / 0.5 / 0 from placement only (better placement wins, equal placement draws), with `K = 32 / (N − 1)`, so a 1v1 uses K = 32
**And** all pairwise terms are summed and rounded once to an integer (half away from zero), every participant's delta is computed from pre-match ratings, ratings are integers, there is no rating floor [ASSUMPTION: rounding and no floor], and unit tests cover 1v1 win, loss and draw, a 4-player ranking with a tie, and symmetric deltas in an equal-rated 1v1

**Given** opponent ratings
**When** an opponent is not a rated `USER`
**Then** a `GUEST` opponent counts as 1200 and the registered player is still rated, a `BOT` counts as the human's own pre-match rating, and a `USER` with no `rating` row in that mode counts as 1200 (the start rating)

**Given** a `minnal.match.completed` event with `rated: true`
**When** ratings-service handles it through its `ratings-service` consumer group
**Then** in one transaction it writes, for each `USER` participant, a `rating_event`, an updated `rating` (created at 1200 first if missing), a `match_record` with result from placement and `rating_delta`, and one `minnal.rating.updated {eventId, userId, mode, rating, ratedAt}` outbox row per rated user; the stream entry is `XACK`ed only after that commit
**And** a forfeiter is rated on the placement in the event, exactly like any other participant (in a 1v1 that is always last, a loss; amended 2026-11-13, sprint-change-proposal-2026-11-13)

**Given** an event with `rated: false` (custom-topic source)
**When** it is handled
**Then** no `rating` or `rating_event` changes and no `rating.updated` is published, but each `USER` participant still gets a `match_record` with `rated = false` and `rating_delta = null`

**Given** any event with `GUEST` or `BOT` participants
**When** it is handled
**Then** nothing is stored for them (no rating, history or directory row), so guest data is never persisted; a test asserts the ratings tables hold no row for a guest `participantId`

**Given** the same `minnal.match.completed` delivered twice (same `eventId`, or a different `eventId` for the same `matchId`)
**When** the second copy is handled
**Then** the unique `(match_id, user_id)` keys make it a no-op: no rating is changed twice, no extra history or outbox row appears, and the entry is acknowledged (integration test with a duplicated entry)

**Given** ratings-service restarts with unacknowledged entries
**When** it boots
**Then** it reclaims its pending entries (`XAUTOCLAIM`) and processes them before new ones
**And** an entry whose delivery count reaches 5 is copied to `minnal.deadletter` with the source stream, entry id, `eventId` and last error, then acknowledged, and an error log plus a Micrometer counter record it

**Given** a `minnal.user.profileUpdated` event
**When** ratings-service handles it
**Then** it upserts `player_directory` only if the event's `updatedAt` is newer than the stored one (last-write-wins), so an older event delivered late never overwrites a newer name (tested with out-of-order delivery)

**Given** committed `event_outbox` rows
**When** the ratings outbox relay runs
**Then** it publishes them to `minnal.rating.updated` (`MAXLEN ~100000`) in commit order and marks them published, retrying with backoff on failure

**Given** game-service boots
**When** its rating cache starts
**Then** it replays `minnal.rating.updated` from the start of the stream with plain `XREAD` (no consumer group, since the cache lives only in memory) [ASSUMPTION], then follows new entries; each `(userId, mode)` keeps the value with the latest `ratedAt`, so a replayed older value never overwrites a newer one, and a missing entry is 1200
**And** the Story 1.6 matchmaking actor reads this cache, so two players rated 1500 and 1250 are no longer paired before the 4 s widening (tested end to end)
**And** because the stream is capped at ~100,000 entries, a long-inactive player whose last update was trimmed reads as 1200 after a game-service restart; this is logged as a known limitation [ASSUMPTION: flagged for review]

**Given** ratings-service is the sole ELO computer
**When** I inspect game-service and core-service
**Then** neither contains ELO logic or writes ratings (architecture test)

### Story 2.6: Rating change and match history

As Anju, a registered player,
I want to see how much my rating moved after each match, and my three ratings and last 20 matches on Me,
So that I can see whether I am improving.

**Requirements:** FR7, FR8, FR54 (rating delta and "updating"), FR62 (unrated shows no delta), AD-8, AD-16, AD-18, UX-DR24, UX-DR38 (delta panel), UX-DR39, UX-DR40 (grey delta), UX-DR81 (match-history empty state), UX-DR87 (results heading with rating), UX-DR95

**Acceptance Criteria:**

**Given** a `USER` token
**When** the client calls `GET /api/ratings/v1/matches/{matchId}`
**Then** if the caller's `match_record` exists it returns `{matchId, mode, rated, ratingBefore?, ratingAfter?, delta?}` for the caller only; for an unrated match `rated` is false and the rating fields are null
**And** it returns `404` Problem Details while the match has not been processed yet, or when the caller has no record for it; a `GUEST` token gets `403`

**Given** a registered player's results screen for a rated match
**When** results open
**Then** the client fetches the delta, retrying on 404 with backoff for up to 10 s; while it waits the delta slot shows a muted placeholder with no layout shift, and after 10 s it shows "updating" (ML string flagged TBD)
**And** when the delta arrives it shows in the compact band as a volt chip with on-volt text for a win ("+24"), a grey delta for a loss or draw, and on the win takeover's band-raised panel; the results heading's accessible name gains the rating ("You won, 3,140 to 2,980, rating +24")

**Given** a guest's results, or a registered player's unrated match
**When** results render
**Then** no delta chip, placeholder or "updating" text is shown (the unrated case is known from the API's `rated: false`)

**Given** a `USER` token
**When** the client calls `GET /api/ratings/v1/me/ratings`
**Then** it returns all three modes `{QUICK, TOPIC_DUEL, BATTLE_ROOM}` with each current rating, 1200 for any mode never rated

**Given** a registered player on Home or the Me tab
**When** it renders
**Then** a rating trio of three small read-only cards in a grid shows each mode's label and rating (Latin digits, grouped, tabular), and guests never see it

**Given** a `USER` token
**When** the client calls `GET /api/ratings/v1/me/matches?limit=20`
**Then** it returns the caller's most recent completed matches (newest first by `endedAt`, max 20) as `{matchId, mode, result, score, placement, rated, ratingDelta?, endedAt}`; aborted matches never appear because they are never published

**Given** the Me tab's match history
**When** it renders
**Then** each row shows result (Won / Lost / Draw), mode, date (IST, display only) and the rating delta, and a row with a null delta shows "unrated" in muted text instead of a number
**And** with no matches it shows one plain line in voice plus a primary action that starts a Quick Match (copy flagged TBD)

**Given** the ratings or history request fails
**When** the Me tab renders
**Then** that section shows an inline retry with the reason, and the rest of the page still works

### Story 2.7: Leaderboards

As Anju, a registered player,
I want to see where I stand in Kerala today, this week and of all time in each mode, with my own row always visible,
So that I have a reason to come back and climb.

**Requirements:** FR60, FR61, FR62, NFR9 (leaderboards rebuildable from Postgres), AD-3 (`ratings:` keys), AD-16 (names embedded from `player_directory`), AD-17, UX-DR15 (Ranks keeps mode, period and scroll), UX-DR18 (one nudge on guest Ranks), UX-DR23, UX-DR57, UX-DR58, UX-DR59, UX-DR60, UX-DR61, UX-DR86, UX-DR95, UX-DR96 (leaderboard empty string)

**Acceptance Criteria:**

**Given** the leaderboard key scheme
**When** ratings-service writes boards
**Then** it uses Valkey sorted sets `ratings:lb:{mode}:{daily|weekly|alltime}:{periodKey}` with `periodKey` = IST date for daily (`2026-11-11`), ISO week for weekly (`2026-W46`, Monday start) and `all` for all-time [ASSUMPTION: key formats], and no other service writes them
**And** daily keys expire after 8 days and weekly keys after 5 weeks [ASSUMPTION: retention; only current periods are shown]

**Given** a rated match has been committed (Story 2.5)
**When** the board projector runs from the same outbox entry as `rating.updated`
**Then** for each rated user it writes absolute values recomputed from Postgres (`ZADD`, never `ZINCRBY`): the all-time score is her current rating; the daily and weekly scores are the sum of her `rating_event` deltas whose `ended_at` falls in that IST day and Monday-start IST week
**And** because writes are absolute, a retried or duplicated projection gives the same result, and a match ending at 23:59:59 IST counts in that day while one at 00:00:00 counts in the next (tests with a controllable clock)

**Given** unrated matches, guest participants and Solo Practice
**When** boards are written
**Then** none of them adds or changes any board entry

**Given** a player who played rated matches today
**When** her daily total is zero or negative
**Then** she still appears on today's board with that value (shown as "0" or "−18") [ASSUMPTION: anyone with a rated match in the period has a position]

**Given** Valkey has lost the board keys, or an operator runs the rebuild command (`ratings-service --rebuild-leaderboards`, runnable via `docker compose run`)
**When** the rebuild runs
**Then** it rebuilds every current daily, weekly and all-time board for all three modes from Postgres alone, skipping tombstoned users, and an integration test proves a flushed Valkey rebuilt this way gives identical boards
**And** on boot, if the marker key `ratings:lb:meta:builtAt` is missing, ratings-service runs the rebuild automatically [ASSUMPTION]

**Given** any valid token (guest or registered)
**When** the client calls `GET /api/ratings/v1/leaderboards/{mode}/{daily|weekly|alltime}?offset=0&limit=50`
**Then** it returns `{mode, period, periodKey, measure: RATING_GAINED | RATING, entries[{rank, userId, displayName, district, value}], me}` with `displayName` and `district` embedded from `player_directory`; `limit` is at most 50 and only the top 100 positions are listed [ASSUMPTION: top 100]
**And** rank uses standard competition ranking (equal values share a rank: 1, 2, 2, 4), computed as one plus the count of strictly higher values [ASSUMPTION: tie handling]
**And** `me` is `{rank, value}` for a registered caller with a position, `null` for a registered caller without one, and absent for a guest; an unknown mode or period gets `400` Problem Details

**Given** the Ranks tab (replacing the Story 1.3 Ranks placeholder)
**When** it opens
**Then** it shows a mode segmented switcher (Quick Match / Topic Duel / Battle Room; card track, hairline border, active ink fill with white label, exactly one selected, min-height 48) above period tabs (ഇന്ന് / ഈ ആഴ്ച / എക്കാലവും; active ink bold with a 2px ink underline, min-height 48) and a list header naming the measure ("rating gained today" vs "rating")
**And** switching mode or period swaps the list with no animation, and the tab keeps its last mode, period and scroll position when the player returns to it

**Given** a board with rows
**When** it renders
**Then** each row is a card (min-height 47px) with the rank (muted; ranks 1–3 in bold ink numerals, no medals, no volt), the unchanged display name with the district below in a muted caption, and the value on the right in score type with Latin grouped digits ("+142" for gains, "1,912" for ratings)
**And** Ranks uses no volt and no bolt anywhere

**Given** a registered player whose position is outside the visible rows (or beyond the top 100)
**When** the board renders
**Then** her row is pinned above the tab bar on a paper strip after a dim "···" gap mark, in ink fill (band-dark in dark mode), min-height 56, with white rank, name and value, district in on-band-muted and a "നിങ്ങൾ" outline tag beside her unchanged name
**And** when she scrolls to her own position the pinned row unpins and her row shows in place; when `me` is null no pinned row shows

**Given** a board with no rows (for example a new IST day)
**When** it renders
**Then** an empty card shows a static ink-outline bolt, the line "No one's on today's board yet. The first win today takes the top spot." (ML string flagged TBD), a primary button that starts the viewed mode, a text link to a board that has rows, and three decorative dashed ghost rows; no pinned row
**And** for Topic Duel and Battle Room, whose modes are not yet playable, the primary button is `aria-disabled` with the caption "Coming soon"

**Given** a guest opens Ranks
**When** it renders
**Then** the boards are readable, there is no pinned row and no "നിങ്ങൾ" tag, and exactly one Sign-in nudge appears below the list [ASSUMPTION: nudge on guest Ranks]

**Given** a registered player on Home
**When** Home renders
**Then** a rank snippet card shows her Quick Match daily rank as a 26px bold number with "ഇന്ന് കേരളത്തിൽ / in Kerala today" and her day's gain ("ഇന്ന് +24"), and tapping it opens Ranks on Quick Match · Today
**And** with no position today it reads "Not on today's board yet" with "Play a Quick Match" [ASSUMPTION: copy TBD], and guests never see the snippet

**Given** the switcher segments, period tabs and rows
**When** they are used by keyboard or screen reader
**Then** each has a 48px hit area and a visible focus ring, the switcher exposes the selected mode, and each row's accessible name reads rank, name, district and value in order

### Story 2.8: Settings and account deletion

As Anju, a registered player,
I want to change my language and effects, sign out, and delete my account if I choose,
So that Minnal fits how I use my phone and I stay in control of my account.

**Requirements:** FR9, NFR20, AD-9, AD-15, AD-16, AD-17, Additional Requirements: Event streams & contracts (`minnal.user.deleted`), UX-DR20, UX-DR84 (Settings control for Reduce effects), UX-DR88, UX-DR93

**Acceptance Criteria:**

**Given** a registered player opens Me › Settings
**When** it renders
**Then** it shows rows for Language, Reduce effects (On / Off / Follow phone, default Follow phone), Sign out and Delete account, each with a 48px hit area
**And** a guest's Settings shows only Language and Reduce effects, both kept on the device [ASSUMPTION: guests can change these]

**Given** the Language row
**When** a registered player picks a language
**Then** the UI switches at once with a polite announcement in the new language, the profile's `language` is saved through the Story 2.3 endpoint (publishing `profileUpdated`), the access token is refreshed so `lang` is current, and question text follows the new language from the next question shown

**Given** the Reduce effects row
**When** the player changes it
**Then** it writes the Story 1.3 preference store (on this device only, not the profile) [ASSUMPTION: per-device], the reduced path follows it at once on the next peak, and the Story 1.3 dev toggle is removed

**Given** a registered player taps Sign out
**When** the client calls `POST /api/core/v1/auth/logout`
**Then** core revokes the current refresh token family, clears the cookie and returns `204`; the client drops its access token, closes its WebSocket, gets a guest token and shows guest Home
**And** a later refresh with the old cookie value gets `401`

**Given** a registered player taps Delete account
**When** the confirm step opens
**Then** it is a centred `role="alertdialog"` stating that her ratings, board positions and history will be removed and this cannot be undone, with focus on "Cancel" (button-primary) and a brick "Delete account" text button; Esc or Android back means Cancel

**Given** she confirms
**When** the client calls `DELETE /api/core/v1/me`
**Then** in one transaction core marks the user `DELETED`, revokes every refresh token, removes the `user_identity` link and writes `minnal.user.deleted {eventId, userId, occurredAt}` to the outbox; the client then signs out to guest Home with a one-line notice, announced politely
**And** signing in again later with the same Google account creates a new, empty account [ASSUMPTION: identity unlinked on deletion]
**And** any core request with an access token whose `sub` is `DELETED` gets `401`

**Given** ratings-service receives `minnal.user.deleted`
**When** it handles it (consumer group, idempotent, `XACK` after commit)
**Then** it sets `tombstoned_at` on the `player_directory` row (creating one if missing), removes the user from every current daily, weekly and all-time board key in all modes, and returns `401` for that `sub` on its `/me` endpoints
**And** a later `profileUpdated` for that user never clears the tombstone, a later `match.completed` that names the user creates no rating or history for her, and the leaderboard rebuild skips her

**Given** game-service
**When** it consumes `minnal.user.deleted` (replayed from the stream start on boot into an in-memory set, like the rating cache)
**Then** a STOMP `CONNECT` or matchmaking join with that `sub` is refused with a STOMP `ERROR`, even with an unexpired access token
**And** a match she is already playing continues to its end for the other players [ASSUMPTION: no mid-match ejection]

**Given** the deletion feature
**When** it ships
**Then** the story notes as an open question, not a requirement, which personal data India's DPDP Act requires to be erased or kept and for how long (for example the deleted `app_user` row's email, `match_record` rows, and backups); this must be resolved before public launch and is not decided here

## Epic 3: Snobin curates the question bank

Snobin, the developer who is also Minnal's only content admin, opens `/admin` on his laptop. He searches and filters the whole bank, uploads a CSV of Kerala PSC previous-year questions, and sees at once which rows imported as drafts and which rows need fixing, with row numbers and reasons he can download, fix and re-upload. Every new question or new version waits in a draft queue, where he reviews bilingual previews and publishes or discards them with buttons or single-key shortcuts, with a 5 s Undo on each action. He adds or fixes single questions in a full-page editor with tags, inline subject and topic creation and a two-language preview; a published question is never changed in place, so a fix becomes a new draft version and the old version keeps serving until the new one is published. Players close the loop: a registered player who spots a wrong answer taps "തെറ്റുണ്ടോ?" on the reveal or on a results breakdown row, adds a note, and the report lands in Snobin's report queue against the exact question version. He resolves it by publishing a fixed version, which closes every open report on the older versions, or by dismissing it with a note; either way the record is kept. To make this possible, the epic adds core-service's admin API under `/api/core/v1/admin/**` guarded by the ADMIN role from Story 2.1, a lazily loaded `/admin` web chunk kept out of the player bundle, version audit fields, the shared Valkey token-bucket limiter for REST writes, and the `question_report` table. It builds on Story 1.4's `question` / `question_version` tables, shared `QuestionValidator`, starter CSV columns and `/internal/question-sets`, which keeps serving only the latest `PUBLISHED` version. The epic leaves out Solo Practice (Epic 4; it reuses the report link built here), custom-topic import (Epic 6; it reuses the validator and error list), and any external question submission path, which MVP does not have.

### Story 3.1: Admin console access and layout

As Snobin, the content admin,
I want an admin console at `/admin` that only admins can open, with a desktop layout and a searchable, filterable list of the whole bank,
So that I can find any question quickly and players never download or reach admin code.

**Requirements:** FR68, FR10 (tags as filters), FR11 (ML/EN text search), NFR3 (admin lazy-loaded, never in the player bundle), NFR13, NFR14, NFR15, NFR22, AD-1, AD-3, AD-9, AD-12, AD-18, Additional Requirements: API conventions (RFC 9457 Problem Details, `/api/core/v1/...`), Frontend architecture (admin lazy-loaded at `/admin`), UX-DR12, UX-DR13, UX-DR16, UX-DR69, UX-DR72, UX-DR81 (bank empty state pattern), UX-DR89, UX-DR94

**Acceptance Criteria:**

**Given** core-service's security configuration
**When** any request reaches a path under `/api/core/v1/admin/**`
**Then** it requires a valid access JWT whose `roles` include `ADMIN`; a missing or invalid token gets `401` and a `GUEST` or `USER`-only token gets `403`, both as RFC 9457 Problem Details (`type`, `title`, `status`, `detail`), and no admin handler runs
**And** an architecture test fails the build if any controller in core's `admin` feature package is mapped outside `/api/core/v1/admin/**`, or if any `/api/core/v1/admin/**` mapping exists outside that package
**And** the role is taken only from the token (Story 2.1 recomputes it from `ADMIN_EMAILS` on every issue); each admin request is logged as JSON with `requestId` and `userId`

**Given** the `question` table from Story 1.4 exists
**When** Flyway applies this story's migration (it depends only on `question`)
**Then** it alters only `question`, adding a `display_no` bigint identity (unique, backfilled for the seeded questions, never reused) so admins can name a question as "Q 1234"; no new table is created [ASSUMPTION: short human-readable number alongside the UUID]

**Given** an admin token
**When** the client calls `GET /api/core/v1/admin/questions?status=&category=&subjectId=&topicId=&examLevel=&difficulty=&q=&page=0&size=50`
**Then** it returns a page `{items[{questionId, displayNo, currentVersion, state, hasPendingDraft, textMl?, textEn?, category, subject, topic, examLevel, difficulty, updatedAt}], page, size, totalItems}` sorted by `updatedAt` descending, where `state` is `PUBLISHED` (has a published version), `DRAFT` (never published, has an open draft), `DISCARDED` (never published, no open draft) or `DELETED` (soft-deleted)
**And** the row reflects the latest published version when one exists, otherwise the latest version; `size` is at most 100, and an unknown enum value or `page < 0` gets `400` Problem Details
**And** `GET /api/core/v1/admin/subjects` returns every subject with its topics, for the filter controls

**Given** the text filter `q`
**When** it is at least 2 characters
**Then** it matches, case-insensitively and after NFC normalisation, a substring of the shown version's `textMl` or `textEn` (Malayalam conjuncts and chillu match as typed), combined with the other filters by AND; a `q` of 1 character is ignored [ASSUMPTION: `ILIKE` substring search, no full-text ranking at MVP]
**And** with about 2,000 questions the list responds within 300 ms on VPS-comparable hardware

**Given** the web app
**When** a signed-in player whose token lacks `ADMIN` opens `/admin` or any `/admin/*` route
**Then** the route guard in the player bundle shows a "Not authorised" page with a link Home, and the admin chunk is never requested (network assertion in an e2e test)
**And** a guest opening `/admin` is sent through sign-in with `returnTo=/admin`, then sees the console or "Not authorised" according to the role

**Given** the production web build
**When** the CI bundle check runs
**Then** it fails if any module under `web/src/admin/**` is part of the entry chunk or of any chunk statically imported from it, and the initial player JS stays within the Story 1.3 budget of 150 KB gzipped; the admin code loads only through a dynamic `import()` on the `/admin` route
**And** the admin chunk may import shared player components (tokens, buttons, option cards), but no player module imports from `web/src/admin/**` (lint rule)

**Given** an admin opens `/admin` on a screen at least 1024 px wide
**When** the console renders
**Then** a desktop layout uses the same DESIGN tokens with a top bar (wordmark, signed-in admin name, Sign out) and a nav of Questions · Upload · Drafts · Reports, with the current item marked `aria-current="page"`, and Questions is the default page
**And** nav items whose surface is not built yet open a placeholder page with a heading and one line saying it is not available yet; later stories replace each placeholder [ASSUMPTION]
**And** below 1024 px the console still works with horizontal scrolling inside the table only; it is not optimised for phones
**And** the admin UI is in English only at MVP, with strings in a lazily loaded `admin` i18n namespace (so the i18n lint rule still applies), while question content keeps its own `lang` attributes [ASSUMPTION: English-only admin UI]

**Given** the Questions page
**When** it renders
**Then** filter controls (status, category, subject, topic dependent on the chosen subject, exam level, difficulty as native `<select>`s with visible labels, and a labelled search field) sit above a `<table>` with a `<caption>`, `<th scope="col">` headers (No., Question, Subject · Topic, Level, Difficulty, State, Updated) and `<th scope="row">` on the "Q 1234" cell, and pagination ("51–100 of 1,234" with Previous / Next) sits below
**And** tab order is filters → table → pagination, every control shows the Story 1.3 focus ring, and Previous / Next are `aria-disabled` at the ends
**And** Malayalam text cells carry `lang="ml"` and English cells `lang="en"`; long text wraps to at most 2 lines, never cut mid-grapheme, and expanding a row (its disclosure button, or Enter on the focused row) shows the full question text in both languages, the options with the correct one marked, and the tags inline
**And** a row with `hasPendingDraft` shows a "Draft v3 pending" tag next to its state

**Given** the filter controls
**When** the admin changes a filter or types in the search (debounced 300 ms)
**Then** the list reloads from page 1, the filters and page are reflected in the URL query so reload and browser Back restore them, and the result count is announced once through the polite status region ("124 questions")

**Given** the list is loading or fails
**When** it renders
**Then** loading shows table-shaped skeleton rows (no shimmer under reduced effects), and a failed request shows an inline error with the Problem Details `detail` and a Retry button, keeping the filters intact

**Given** the bank has no questions, or no question matches the filters
**When** the Questions page renders
**Then** an empty bank shows one plain line ("No questions yet.") with the next action, a link to Upload, and a filtered empty result shows "No questions match these filters." with a Clear filters button; the heading receives focus after Clear [ASSUMPTION: copy]

**Given** the admin routes
**When** each page opens
**Then** `document.title` names the page ("Questions · Admin · Minnal")

### Story 3.2: Add and edit single questions

As Snobin, the content admin,
I want a full-page editor to add a question, fix one, or delete one, with every tag, inline subject and topic creation and a preview in both languages,
So that I can correct a bad question safely while players keep getting the published version until my fix is reviewed.

**Requirements:** FR69, FR71 (every new question or version starts as draft), FR72, FR10, FR11, FR12, FR15 (only published versions served), FR16 (attribution captured and previewed), NFR14, NFR19, AD-12, Additional Requirements: Service boundaries & data (question lifecycle, shared validator), API conventions, UX-DR13, UX-DR14, UX-DR16, UX-DR26 (option card reused in preview), UX-DR32 (explanation + attribution block reused in preview), UX-DR67 (error summary pattern), UX-DR69 (editor is a separate page), UX-DR88, UX-DR92, UX-DR94

**Acceptance Criteria:**

**Given** core-service starts after Story 3.1
**When** Flyway migrates
**Then** it alters only `question` (adding `deleted_by?` and `created_by?`) and `question_version` (adding `created_by?`, `updated_at`, `updated_by?` and an optimistic-lock `row_version`), and adds a partial unique index allowing at most one `DRAFT` version per question; seeded rows keep null actor columns and are shown as "seed"
**And** soft delete uses Story 1.4's `question.deleted_at`, and `sourceRef` uniqueness uses Story 1.4's partial unique index on `question.source_ref`; neither is re-created here

**Given** the shared `QuestionValidator` from Story 1.4
**When** this story extends it
**Then** it also enforces length caps (question text ≤ 1,000, each option ≤ 300, explanation ≤ 2,000, attribution ≤ 120 characters, after NFC normalisation and trimming) and distinct options (no two equal after trim and case-folding), returning these as field-level errors like the existing rules [ASSUMPTION: caps and distinct-option rule]
**And** the same single validator is used by the editor endpoints, the starter loader and (later) CSV upload and custom topics, and the table-driven tests are extended for the new rules, including Malayalam text with chillu and ZWJ

**Given** an admin token
**When** the client calls `POST /api/core/v1/admin/questions {category, subjectId, topicId, examLevel, difficulty, textMl?, textEn?, options[4], answerIndex, explanation, attribution?, sourceRef?}`
**Then** a valid payload creates a `question` and version 1 in `DRAFT` with `created_by`/`created_at`, returns `201` with `{questionId, displayNo, version: 1, status: DRAFT}`, and nothing is served to players
**And** an invalid payload gets `400` Problem Details with `errors[{field, problem, fix?}]` listing every problem (not only the first), and nothing is stored; a `sourceRef` already used by another question gets a field error on `sourceRef`

**Given** a question whose latest version is `PUBLISHED` and which has no open draft
**When** the admin saves an edit with `PUT /api/core/v1/admin/questions/{questionId}/draft`
**Then** a new version `n + 1` (n = the highest existing version, discarded ones included) is created in `DRAFT` with the edited fields, and the published version is not changed in any column
**And** `/internal/question-sets` keeps returning the previous published version until the new one is published (integration test), so the edit does not reach players yet

**Given** a question that already has an open `DRAFT` version
**When** the admin opens Edit and saves
**Then** that draft is updated in place (drafts are mutable; no extra version is created), with `updated_by`/`updated_at` set
**And** the request carries the draft's `row_version`; if another save changed it first, the response is `409` Problem Details and the editor shows "This draft changed since you opened it" with a Reload action, losing nothing typed until the admin chooses [ASSUMPTION: optimistic locking]

**Given** an admin token
**When** the admin deletes a question with `DELETE /api/core/v1/admin/questions/{questionId}` after a confirm step
**Then** the question is soft-deleted (`deleted_at`, `deleted_by`), any open draft becomes `DISCARDED`, no row is physically removed, and `/internal/question-sets` stops returning it from the next request
**And** `POST /api/core/v1/admin/questions/{questionId}/restore` clears the delete marker so its latest published version serves again (the discarded draft stays discarded) [ASSUMPTION: restore offered]
**And** the confirm is a `role="alertdialog"` naming "Q 1234", with focus on Cancel and Esc meaning Cancel; deleting an already deleted question returns `409`

**Given** the subject and topic controls in the editor
**When** the needed subject or topic does not exist
**Then** a "New subject…" / "New topic…" option opens an inline labelled text field; saving it calls `POST /api/core/v1/admin/subjects {name}` or `POST /api/core/v1/admin/subjects/{subjectId}/topics {name}`, which creates it (`201`) or, when the name already exists case-insensitively after NFC normalisation, returns `409` with the existing id so the editor selects that one instead of creating a duplicate
**And** the new subject or topic is selected in the editor and appears in the Story 3.1 filters; a topic with fewer than 10 published questions is still listed in admin (the player-side hiding rule belongs to Epic 4)

**Given** an admin opens `/admin/questions/new` or `/admin/questions/{questionId}/edit` from the Questions list
**When** the editor renders
**Then** it is a full page (not a modal) with labelled fields: category, subject, topic, exam level (10th / Degree / Other), difficulty (EASY / MEDIUM / HARD) as native `<select>`s; Malayalam text and English text as textareas with `lang="ml"` / `lang="en"`; options A–D as text fields; the correct answer as a radio group labelled A–D; explanation; source attribution (placeholder "e.g. Kerala PSC LDC 2019"); and source ref
**And** a header shows "Q 1234 · editing v3 (draft)" or "Q 1234 · new draft from published v2", plus a version history list (version, status, created by/at)
**And** for a deleted question the editor is read-only with a Restore button

**Given** the preview panel beside the form
**When** the admin types
**Then** it renders the question as players see it, using the player option cards and explanation + attribution block, in two panes, Malayalam and English, with the correct option marked and "ഉറവിടം ലഭ്യമല്ല / source not available" when attribution is blank
**And** when one language is missing, that pane shows the other language's text with a note "Players who chose English will see the Malayalam text" (fallback per FR11), and Malayalam renders with the shipped font so shaping problems are visible before publish

**Given** the admin clicks Save with problems
**When** client-side checks (the same rules as the shared validator, mirrored in TypeScript) or the server `400` report errors
**Then** an error summary (`role="alert"`, "2 problems to fix before saving") appears at the top and takes focus, listing each problem as a link that moves focus to its field; each field shows ⚠ + text under it linked by `aria-describedby` with `aria-invalid`, brick never the only cue
**And** the server stays authoritative: a payload that skips the client checks gets the same field errors

**Given** a successful save
**When** the response returns
**Then** the editor shows "Saved as draft v3 · not live until published" inline, announced politely, and stays on the page with the version history updated
**And** leaving the editor with unsaved changes asks for confirmation (in-app confirm for route changes, `beforeunload` for tab close)

### Story 3.3: CSV bulk upload

As Snobin, the content admin,
I want to upload a CSV of questions and get the good rows in as drafts straight away, with a clear list of the rows I need to fix,
So that I can load a whole previous-year paper in one go without one bad row blocking the rest.

**Requirements:** FR70, FR71, FR72, FR10, FR11, FR12, NFR11 (rate-limited admin upload), NFR14, AD-3 (`core:` Valkey keys), AD-12 (shared validator), Additional Requirements: Security implementation (per-user token buckets in Valkey for REST writes), API conventions, UX-DR16, UX-DR67, UX-DR69, UX-DR88

**Acceptance Criteria:**

**Given** core-service
**When** this story adds the REST write rate limiter
**Then** a reusable per-user token-bucket component backed by Valkey (keys `core:rl:{action}:{userId}`, atomic via a Lua script) is available to any core endpoint, configured per action with a capacity and a refill rate, and returns `429` Problem Details with a `Retry-After` header when the bucket is empty
**And** admin CSV upload uses capacity 10 with a refill of 10 per hour per admin [ASSUMPTION: limit], and unit plus integration tests cover refill, exhaustion and per-user isolation

**Given** an admin uploads a file with `POST /api/core/v1/admin/uploads` (multipart, field `file`)
**When** the file is over 2 MB, has more than 1,000 data rows, is empty, or has only a header
**Then** nothing is imported and the response is `400` Problem Details with one file-level error naming the cap or problem ("File has 1,412 rows; the limit is 1,000. Split it into smaller files.") [ASSUMPTION: 2 MB and 1,000-row caps]
**And** the web app checks the size and `.csv` extension before sending and shows the same message without uploading

**Given** a CSV file
**When** it is decoded
**Then** it must be valid UTF-8 (a leading BOM is stripped); any invalid UTF-8 byte sequence rejects the whole file with "Save the file as CSV UTF-8 and upload again", and nothing is imported
**And** parsing follows RFC 4180 (comma delimiter, double-quoted fields may hold commas, quotes and line breaks), all text is NFC-normalised, and Malayalam text, chillu and ZWJ/ZWNJ survive byte-for-byte after normalisation (round-trip test with a Malayalam fixture file)

**Given** the header row
**When** it is read
**Then** it must contain the Story 1.4 question columns (category, subject, topic, examLevel, difficulty, textMl, textEn, optionA–D, answerIndex, explanation, attribution, sourceRef) in any order, matched case-insensitively; a missing required column or an unknown extra column rejects the file with a file-level error naming the column, except that a column named `errors` and the seed-only `reviewedBy` / `reviewedAt` columns are ignored (uploaded rows are reviewed in the draft queue instead) so a downloaded error file can be fixed and re-uploaded [ASSUMPTION]

**Given** a file whose header is valid
**When** each data row is checked
**Then** every row goes through the shared `QuestionValidator` (the same rules as the editor), plus checks that `category`, `examLevel` and `difficulty` are known enum values and `answerIndex` is an integer 0–3
**And** row numbers follow the spreadsheet view, with the header as row 1 and the first data row as row 2, so "Row 7" is the row Snobin sees as 7 in Sheets or Excel

**Given** a row whose `sourceRef` matches an existing question (including a soft-deleted one) or an earlier row in the same file
**When** the row is checked
**Then** it is not imported and is listed as `Row N · sourceRef · duplicate of Q 1234` (or `duplicate of row 5`); a row with a blank `sourceRef` gets no duplicate check [ASSUMPTION: `sourceRef` optional; duplicates are not overwritten]

**Given** a file with some valid and some invalid rows
**When** the upload is processed
**Then** all valid rows are imported in one transaction, each as a new question with version 1 in `DRAFT`, `created_by` set to the admin; subjects and topics are matched by name (case-insensitive, NFC) and created when missing, as the starter loader does; nothing is published
**And** the response is `200 {importedCount, errorCount, imported[{row, questionId, displayNo}], createdSubjects[], createdTopics[], errors[{row, field, problem, fix?}]}`, and a database failure during the import imports nothing and returns `500` Problem Details

**Given** the upload result
**When** the Upload page renders it
**Then** a summary line reads "N imported as drafts · M rows need fixes", followed by any subjects or topics the file created ("Created 2 new topics: …", so a typo is visible), and a link "Review N drafts" to the Questions list filtered to state `DRAFT`
**And** the error list follows the shared import error list pattern: a `role="alert"` summary that takes focus, then one row per problem "Row 7 · answerIndex · must be 0–3 · Use 0 for A … 3 for D" with ⚠, brick text and a monospace field-name tag; over 20 problems shows the first 20 grouped by field

**Given** rows need fixing
**When** the admin uses the export actions
**Then** "Download rows to fix (CSV)" saves a UTF-8 CSV (with BOM, for Excel) holding the original values of every failed row plus an `errors` column, which can be fixed and uploaded again, and "Copy errors" copies the full list as tab-separated `row · field · problem` lines with an inline "Copied" announced politely
**And** a file where every row is valid shows only the summary ("40 imported as drafts · 0 rows need fixes"), and a file where every row fails imports nothing and says so

**Given** the admin has used up the upload limit
**When** another upload is sent
**Then** the response is `429` with `Retry-After`, nothing is processed, and the page shows "Upload limit reached. Try again in 12 minutes." without clearing the chosen file

**Given** the Upload page before any upload (replacing the Story 3.1 Upload nav placeholder)
**When** it renders
**Then** it shows a labelled file input (accepting `.csv`), the expected column list with a "Download template" link (header row plus one example row in Malayalam and English), the size and row caps, and an Upload button that is `aria-disabled` with a caption until a file is chosen
**And** while uploading, the button shows "Uploading…" and a second submit is ignored

### Story 3.4: Draft review queue

As Snobin, the content admin,
I want a draft queue where I can preview each draft in both languages and publish or discard it with one key and a short Undo,
So that I can review a whole uploaded paper quickly and only questions I have checked ever reach players.

**Requirements:** FR71, FR69 (a published new version supersedes the old for future draws), FR15, NFR15, AD-4 (in-flight matches keep their fetched set), AD-12, Additional Requirements: Service boundaries & data (`DRAFT → PUBLISHED | DISCARDED`), UX-DR13, UX-DR14, UX-DR69, UX-DR70, UX-DR71, UX-DR81 (draft queue empty state), UX-DR88 (admin row action announcements), UX-DR94

**Acceptance Criteria:**

**Given** core-service starts after Story 3.3
**When** Flyway migrates
**Then** it alters only `question_version`, adding `published_by?`, `published_at?`, `discarded_by?` and `discarded_at?`; seeded published versions keep null actors and show as "seed"

**Given** an admin token
**When** the client calls `GET /api/core/v1/admin/drafts?page=0&size=50` (optional filters category, subject, topic)
**Then** it returns every `DRAFT` version of a non-deleted question, oldest first by `created_at`, with the full content, tags, `displayNo`, `version`, `createdBy`/`createdAt`, and for a new version of a published question the `replacesVersion` number and the list of changed fields
**And** `size` is at most 100

**Given** a draft
**When** the admin calls `POST /api/core/v1/admin/questions/{questionId}/versions/{version}/publish`
**Then** core re-runs the shared validator and, in one transaction, sets the version to `PUBLISHED` with `published_by`/`published_at`; earlier published versions keep their status and content and simply stop being the latest, so from the next call `/internal/question-sets` returns the new version
**And** a version that is not a `DRAFT`, belongs to a deleted question, or fails validation gets `409` (or `400` with field errors) Problem Details, and nothing changes

**Given** a draft
**When** the admin calls `POST /api/core/v1/admin/questions/{questionId}/versions/{version}/discard`
**Then** it becomes `DISCARDED` with `discarded_by`/`discarded_at`, any published version of that question keeps serving, and a question whose only version is discarded is never served
**And** the bulk endpoints `POST /api/core/v1/admin/drafts/publish` and `/discard` take up to 100 `{questionId, version}` items, apply each one independently, and return per-item results, so one failing item does not block the rest

**Given** a match whose question set was fetched before a new version was published
**When** the match plays on
**Then** every reveal and `MATCH_ENDED` in that match still carries the old version's `{questionId, version}` and content (game-service holds the set in memory), and only matches whose set is fetched after the publish get the new version (integration test across core and game-service)

**Given** the Drafts page (replacing the Story 3.1 Drafts nav placeholder)
**When** it renders
**Then** each draft is a row in a `<table>` with `<th scope>` headers: a select checkbox, "Q 1234 v3", a bilingual preview (Malayalam and English text with their `lang` attributes, options A–D with the correct one marked, explanation, attribution or "source not available"), tags, "new" or "replaces v2 · changed: answer, explanation", created by/at, and visible Publish (button-primary), Discard (button-secondary) and Edit buttons
**And** the bank's Questions list and the editor's version history now show `published_by`/`published_at` and `discarded_by`/`discarded_at` for each version

**Given** a draft row has focus (rows use a roving `tabindex`)
**When** the admin presses `P`, `D`, `E`, `J` or `K`
**Then** `P` publishes, `D` discards, `E` opens the Story 3.2 editor for that draft, and `J` / `K` move focus to the next / previous row (staying put at the ends); the editor toolbar for a draft also gets Publish and Discard buttons with the same `P` / `D` keys while focus is on the toolbar
**And** the keys do nothing when `event.target` is an input, textarea, select or contenteditable, or when a modifier key (Ctrl, Alt, Meta) is held, and a `?` key opens a help dialog listing every shortcut
**And** a "Single-key shortcuts" switch in the admin top bar menu turns them off; it is stored in this browser (`localStorage`, read and written in try/catch, default on) [ASSUMPTION: per-browser setting], and every shortcut has a visible button equivalent

**Given** the admin publishes or discards a row (button or key)
**When** the action is taken
**Then** the row collapses to an inline line "Published Q 1234 v3 · Undo" for 5 s, focus moves to the next row (the previous row if it was last, else the empty-state heading), and the polite status region announces "Published Q 1234 v3"
**And** the request is sent only when the 5 s pass without Undo [ASSUMPTION: client-side delayed commit, so a published version never needs reverting]; Undo restores the row with focus on it and announces "Publish undone"
**And** if the admin navigates elsewhere in the console during the 5 s, pending actions commit at once; if the tab closes, they are sent with `fetch(…, {keepalive: true})`; a commit that fails puts the row back with the Problem Details `detail` inline

**Given** the admin selects several rows (checkboxes, or a header checkbox for the page)
**When** they click "Publish selected (12)" or "Discard selected (12)"
**Then** the rows collapse together with one 5 s Undo for the batch and one announcement ("Published 12 drafts"), the batch then goes through the bulk endpoint, and any item that failed returns to the list with its reason

**Given** the Drafts page with no drafts
**When** it renders
**Then** it shows one plain line in voice ("No drafts waiting. New questions and fixes show up here.") with links to Upload and to add a question, and the heading receives focus when the last row leaves [ASSUMPTION: copy]

**Given** the admin edits a draft from the queue (`E`)
**When** they come back from the editor
**Then** the Drafts page shows the updated draft and focus returns to that row

### Story 3.5: Players report a wrong question

As Anju, a registered player,
I want to tap "തെറ്റുണ്ടോ?" on a question I think is wrong and add a short note,
So that the mistake gets fixed and I can trust the questions I practise with.

**Requirements:** FR14, FR16 (report link sits in the attribution row), NFR11 (rate-limited reports), NFR14, NFR15, AD-3, AD-5 (link appears only after the reveal), AD-9 (registered only), AD-12 (reports reference `{questionId, version}`; custom-topic questions not reportable), UX-DR16, UX-DR32 (completes the report link left out in Story 1.8), UX-DR33, UX-DR42 (completes the breakdown row report link left out in Story 1.10), UX-DR86, UX-DR88, UX-DR94, UX-DR96 (report link string)

**Acceptance Criteria:**

**Given** core-service starts after Story 3.4
**When** Flyway migrates
**Then** it creates only `question_report` (`id` UUID, `question_id`, `version`, `reporter_id`, `note?`, `surface` `LIVE_REVEAL | RESULTS | SOLO`, `match_id?`, `status` `OPEN | RESOLVED_FIXED | DISMISSED`, `created_at`, `resolved_at?`, `resolved_by?`, `resolution_note?`, `fixed_by_version?`), with a foreign key to `question_version` within the `core` schema and a partial unique index on `(reporter_id, question_id, version)` where `status = OPEN`

**Given** a `USER` token
**When** the client calls `POST /api/core/v1/questions/{questionId}/versions/{version}/reports {note?, surface, matchId?}`
**Then** if that version exists as a bank question version with status `PUBLISHED` (the latest or an older one), a report is stored as `OPEN` and the response is `201 {reportId}`
**And** the note is optional, NFC-normalised, trimmed and at most 500 characters; a longer note gets `400` Problem Details with a field error [ASSUMPTION: note optional, 500-character cap]

**Given** a report request that is not allowed
**When** it reaches core
**Then** a `GUEST` token gets `403`; a `{questionId, version}` that is not a published bank version (unknown, draft, discarded, or a custom-topic question id) gets `404`; all as Problem Details, and nothing is stored
**And** core does not check that the reporter played the question (core holds no match data); the rate limit bounds abuse [ASSUMPTION]

**Given** the player already has an `OPEN` report on that question version
**When** she reports it again
**Then** the response is `409` Problem Details and the UI shows "You've already reported this question" in place of the note field; once her report is closed she can report the same version again

**Given** the Story 3.3 rate limiter
**When** a player sends reports
**Then** reports use capacity 5 with a refill of 1 every 2 minutes per user [ASSUMPTION: limit]; an empty bucket gets `429` with `Retry-After`, and the UI shows "Too many reports. Try again in a few minutes." inline, keeping the typed note

**Given** the explanation + attribution block on a live-match reveal or a results breakdown row
**When** it renders for a registered player on a question from the bank
**Then** the caption row shows the source (or "ഉറവിടം ലഭ്യമല്ല") on the left and the "തെറ്റുണ്ടോ? / Something wrong?" link on the right in ink, with a hit area of at least 48 × 48 px that does not overlap neighbouring targets
**And** the link never appears before the reveal, for a guest, or when the match's `questionSource` (carried by `MATCH_FOUND` and `MATCH_ENDED` since Stories 1.6 and 1.10) is `CUSTOM`
**And** the link and note field are one shared component, so Solo Practice (Epic 4) can reuse it

**Given** a results breakdown row (Story 1.10)
**When** the player taps "തെറ്റുണ്ടോ?"
**Then** a labelled note field (optional, with a live character count up to 500) opens inline under the caption row with "Send report" (button-primary) and "Cancel", focus moves to the note field, and a collapsed correct row expands first so the field is visible
**And** "Send report" submits against that row's exact `{questionId, version}` from `MATCH_ENDED` with `surface: RESULTS` and the `matchId`

**Given** the live-match reveal, which holds for only about 2 s (Story 1.7)
**When** the player taps "തെറ്റുണ്ടോ?" there
**Then** the match is not paused or blocked: the question is marked for reporting, the link changes to "Marked · add a note on results" and this is announced politely, and on the results screen that question's breakdown row opens expanded with the note field ready and `surface: LIVE_REVEAL` (the two-step reveal report recorded next to FR14, product-approved; no typing during live play)
**And** the mark lives with the stored `MATCH_ENDED` in `sessionStorage`, so it survives a reload, and nothing is sent if the player never submits

**Given** a report is sent successfully
**When** the response returns
**Then** the note field is replaced by an inline confirmation "നന്ദി! റിപ്പോർട്ട് ലഭിച്ചു / Thanks, we got your report" (strings flagged TBD in the catalogue) announced through the polite status region, focus moves to the confirmation, and the link for that question no longer shows on this screen
**And** a failed request (network, `5xx`) keeps the note and shows an inline error with Retry; offline, "Send report" is `aria-disabled` with the offline caption

**Given** the note field and confirmation
**When** they render
**Then** the field has a visible `<label>`, errors use ⚠ + text linked by `aria-describedby`, Malayalam typed in the note shapes correctly with the shipped font, and the note container takes `lang` from the UI language
**And** the player bundle stays within the Story 1.3 budget after adding the component

### Story 3.6: Report queue and resolution

As Snobin, the content admin,
I want a queue of player reports grouped by question version, a quick path into the editor, and a way to close each report by fixing or dismissing it,
So that I fix real mistakes fast, explain the ones I reject, and keep a record of every decision.

**Requirements:** FR73, FR78, FR14 (reports appear in the admin queue), FR69 (fixing creates and publishes a new version), AD-12, Additional Requirements: API conventions, UX-DR13, UX-DR16, UX-DR69, UX-DR71 (row action pattern applied to Dismiss), UX-DR81 (report queue empty state), UX-DR88, UX-DR94

**Acceptance Criteria:**

**Given** an admin token
**When** the client calls `GET /api/core/v1/admin/reports?status=OPEN|CLOSED&page=0&size=50`
**Then** it returns one group per `{questionId, version}` with `{questionId, displayNo, version, textMl?, textEn?, currentPublishedVersion, pendingDraftVersion?, reportCount, firstReportedAt, lastReportedAt, reports[{reportId, note?, reporterName, surface, createdAt, status, resolvedBy?, resolvedAt?, resolutionNote?, fixedByVersion?}]}`
**And** `OPEN` groups are sorted by `reportCount` descending, then oldest `firstReportedAt` [ASSUMPTION: most-reported first]; `CLOSED` groups by `resolvedAt` descending; `reporterName` is the reporter's current display name, or "Deleted player" for a deleted account, and no email or user id is shown
**And** `GET /api/core/v1/admin/reports/summary` returns `{openCount}` for the nav badge

**Given** the Reports page (replacing the Story 3.1 Reports nav placeholder)
**When** it renders with open reports
**Then** a `<table>` with `<th scope>` headers lists each group: "Q 1234 v2", the question text (with `lang` attributes), the report count for that version, first and last reported times, a "superseded by v3" tag when a newer version is already published, and a "draft v3 pending" tag when a fix is waiting in Drafts
**And** expanding a group lists every report's note ("(no note)" when empty), reporter name, surface (live reveal / results / solo) and time, with notes shown as plain text (never HTML)
**And** the nav item reads "Reports (3)" using the open count, and Open / Closed filter tabs sit above the table, reflected in the URL

**Given** an open report group
**When** the admin clicks "Open in editor"
**Then** the Story 3.2 editor opens for that question: on its open draft if one exists, otherwise prefilled from the latest published version, with a banner "Reported: v2 · 3 reports" and the notes listed above the form; if the reported version is older than the current published version, the banner says so

**Given** a question with open reports on one or more versions
**When** a new version of that question is published (from the Drafts page, the editor toolbar or bulk publish, Story 3.4)
**Then** in the same transaction as the publish, every `OPEN` report on that question with `version` lower than the new version becomes `RESOLVED_FIXED` with `fixed_by_version` set to the new version, `resolved_by` the publishing admin and `resolved_at` the publish time
**And** if the publish is undone within its 5 s window, nothing was committed, so the reports stay open; discarding a fix draft leaves the reports open (tests cover both)

**Given** an open report group
**When** the admin clicks Dismiss
**Then** a labelled note field (required, 1–500 characters) and a "Dismiss reports" button open inline; confirming calls `POST /api/core/v1/admin/reports/dismiss {questionId, version, note}`, which sets every `OPEN` report on that version to `DISMISSED` with the note, `resolved_by` and `resolved_at`
**And** like Publish and Discard, the row collapses to "Dismissed reports on Q 1234 v2 · Undo" for 5 s before the request is sent, focus moves to the next row (previous if last, else the empty-state heading), and the action is announced politely
**And** a dismiss without a note gets `400` Problem Details with a field error, and a group that has no open reports left (for example, closed by a publish meanwhile) gets `409`

**Given** a question with open reports is soft-deleted (Story 3.2)
**When** the delete commits
**Then** its open reports become `DISMISSED` with the system note "Question deleted" and the deleting admin as `resolved_by`, and restoring the question does not reopen them [ASSUMPTION]

**Given** a player reports a version that has already been superseded by a newer published version
**When** the report is stored (Story 3.5)
**Then** it stays `OPEN` with the "superseded by v3" tag, so the admin decides whether v3 fixed it, and it is closed by the next publish or by a dismiss as usual [ASSUMPTION: not auto-closed]

**Given** the Closed tab
**When** it renders
**Then** each closed report shows its status (`RESOLVED_FIXED` "Fixed in v3" or `DISMISSED` with the admin's note), who closed it and when; records are never deleted, and a closed group never shows Dismiss or Open-report actions

**Given** the Reports page has no open reports
**When** the Open tab renders
**Then** it shows one plain line in voice ("No open reports. When a player taps തെറ്റുണ്ടോ?, it shows up here.") and a link to the Closed tab, and the Closed tab with no records says "No closed reports yet." [ASSUMPTION: copy]

**Given** report records from a player who later deletes her account (Story 2.8)
**When** the queue renders
**Then** her reports remain with "Deleted player" as the reporter, so the history of each question version stays complete

## Epic 4: Anju trains on her weak topics

Anju has a rating now, and she knows Kerala History is where she loses points. From Home she taps Topic Duel, finds Kerala History in a topic picker that lists only topics with enough published questions, and is matched within the same ±200 → ±400 band as Quick Match, or with a badged Minnal Bot after about 8 s. Both players get ten questions from that topic only, the topic is named in the match header and on results, and the result moves only her Topic Duel rating, which now fills the Topic Duel boards on Ranks. Rematch keeps the topic. The next day she opens Solo Practice on the same topic: one question at a time with no timer, the correct answer, explanation and source shown the moment she answers, no repeats until she has seen the whole topic, and a "12 answered · 9 correct" summary when she stops; nothing she does there touches a rating or a board. From any results breakdown row she can jump straight into Solo Practice on that question's topic. To make this possible, the epic adds core-service's player-facing topic catalogue with published-question counts (hiding topics under 10, FR76 bank part), a small per-user recent-topics table, the shared topic picker component that Battle Room will reuse, game-service matchmaking actors per `(TOPIC_DUEL, topicId)` reusing the Story 1.6 actor and the `topicId` filter of `/internal/question-sets`, and a REST Solo Practice API in core-service that keeps the AD-5 secrecy rule (correctness only in the answer response). It builds on the match engine, results and rematch (Stories 1.6–1.10), the mode-generic ratings, history and leaderboards (Stories 2.5–2.7), the "Coming soon" mode rows (Story 2.1), the subject and topic tables (Stories 1.4 and 3.2) and the shared report link (Story 3.5). The epic leaves out custom topics as a Solo Practice source (Epic 6; the Solo Practice API is shaped so a `CUSTOM` source can be added without breaking changes), the Battle Room source picker (Epic 5; it reuses this picker), per-topic leaderboards (not in MVP; Topic Duel has one board per period like every mode), and the share card (Epic 7).

### Story 4.1: Topic picker

As Anju, a registered player,
I want to find a subject or topic quickly, see how many questions it has, and get back to the topics I played recently,
So that I can start a Topic Duel or a practice session on the exact topic I want to work on, without ever picking one that is too small to play.

**Requirements:** FR27 (topic picker), FR43 (choose a bank topic), FR76 (bank part: hide topics with fewer than 10 published questions), FR3 (registered-only), FR10, FR15 (only published versions counted), NFR3, NFR11, NFR13, NFR14, NFR20 (recent topics removed on deletion), NFR21, AD-1, AD-3, AD-12, Additional Requirements: API conventions, UX-DR16 (search field), UX-DR22, UX-DR72, UX-DR74, UX-DR78, UX-DR81 (empty state pattern), UX-DR86, UX-DR88, UX-DR89, UX-DR91, UX-DR93, UX-DR94, UX-DR95

**Acceptance Criteria:**

**Given** core-service's own Flyway sequence (this migration takes the next free `V<n>` when it merges and depends only on the `topic` table from Story 1.4, not on any other epic's migrations)
**When** Flyway migrates
**Then** it creates only `recent_topic` (`user_id`, `topic_id`, `last_used_at`; PK `(user_id, topic_id)`, foreign key to `topic` within the `core` schema) [ASSUMPTION: recent topics stored per user in core, so they follow the player across devices]
**And** no other table is created or altered; published-question counts are computed from `question` / `question_version`, never stored

**Given** a `USER` token
**When** the client calls `GET /api/core/v1/topics?category=KERALA_PSC` (category defaults to `KERALA_PSC`)
**Then** it returns `{category, minQuestions: 10, subjects[{subjectId, name, topics[{topicId, name, publishedCount}]}]}`, where `publishedCount` counts non-deleted questions whose latest `PUBLISHED` version is tagged with that topic and category (drafts, discarded versions and soft-deleted questions never count)
**And** only topics with `publishedCount ≥ 10` are listed, a subject with no listed topic is left out, and subjects and topics are sorted by name; names are returned as stored, since subject and topic names are single-language at MVP [ASSUMPTION: no bilingual subject/topic names]
**And** the threshold of 10 is a configuration value read in one place, which `/internal/question-sets` and Solo Practice (Story 4.3) also use

**Given** a topic sits at 10 published questions
**When** an admin deletes one of them or publishes a new version that moves one to another topic
**Then** that topic disappears from the next uncached response, and a topic that reaches 10 appears; the server keeps the computed catalogue in memory for at most 60 s [ASSUMPTION: 60 s staleness accepted], and a test covers the 9 / 10 boundary

**Given** the topics response
**When** it is sent
**Then** it carries a strong `ETag` and `Cache-Control: private, no-cache`, and a request with a matching `If-None-Match` gets `304` with no body, so a repeat open on 3G costs one small round trip; the service worker still never caches `/api/**` (NFR21) [ASSUMPTION: HTTP revalidation plus TanStack Query in-memory cache with a 5 min `staleTime`]
**And** the gzipped body for 300 topics stays under 20 KB, and the endpoint responds within 300 ms on VPS-comparable hardware with about 2,000 questions

**Given** a `GUEST` token or no token
**When** it calls `GET /api/core/v1/topics` or any `/api/core/v1/me/recent-topics` endpoint
**Then** it gets `401` (no token) or `403` (guest) Problem Details

**Given** a `USER` token
**When** the client calls `PUT /api/core/v1/me/recent-topics/{topicId}`
**Then** core upserts `(user_id, topic_id)` with `last_used_at = now`, keeps only the 5 most recent rows for that user (older ones are deleted in the same transaction) and returns `204`; an unknown `topicId` gets `404`
**And** `GET /api/core/v1/me/recent-topics` returns up to 3 `{topicId, subjectId, name, publishedCount}` newest first, leaving out any topic that is no longer eligible (fewer than 10 published), so a recent row can never lead to an unplayable topic
**And** the Story 2.8 account-deletion transaction also deletes the user's `recent_topic` rows (test extended)

**Given** the web app
**When** I inspect the picker
**Then** there is one shared `TopicPicker` component taking `{purpose: TOPIC_DUEL | SOLO_PRACTICE, notice?, onSelect(topic)}` and a `sources` option that only supports `BANK` in this story, so Battle Room (Epic 5) and custom topics (Epic 6) can add a purpose and a source without changing existing callers
**And** it lives at `/play/topics?for=duel|solo`, keeps the tab bar, and sets `document.title` ("ടോപ്പിക് തിരഞ്ഞെടുക്കുക · മിന്നൽ" / "Choose a topic · Minnal")

**Given** a registered player on Home
**When** Home renders
**Then** the Topic Duel and Solo Practice rows are no longer `aria-disabled` and the "Coming soon" caption is gone; tapping either opens the picker for that purpose (the Battle Room row keeps "Coming soon")
**And** for a guest these rows stay locked with "Sign in" (Story 1.5), and a guest who opens `/play/topics` directly gets the Sign-in prompt with `returnTo` set to that route

**Given** the picker has loaded
**When** it renders
**Then** it shows a heading naming the purpose ("Topic Duel · choose a topic"), a labelled search field, a "അടുത്തിടെ / Recent" section with up to 3 recent topics (hidden when there are none), then one section per subject with an `<h2>` subject name and topic rows in the mode-entry-row pattern: topic name, a muted subline "124 ചോദ്യം / 124 questions" (Latin grouped digits), a dim chevron, min-height 56 and a 48px hit area
**And** each row's accessible name reads topic, subject and question count ("Kerala History, History, 124 questions"), and name and subline containers carry `lang` by script detection

**Given** the search field
**When** the player types (debounced 200 ms)
**Then** the loaded list is filtered on the client, case-insensitively and after NFC normalisation, by substring of topic or subject name (Malayalam matches as typed); a subject matching the query shows all its topics, the Recent section hides while a query is active, and the number of matching topics is announced once through the polite region ("6 topics") [ASSUMPTION: client-side search over the full catalogue]
**And** no match shows "'<query>' എന്ന ടോപ്പിക് ഇല്ല / No topics match '<query>'" with a Clear search button, and focus returns to the search field after Clear

**Given** the player taps a topic row (commit-on-lift, one tap, no confirm step)
**When** the selection is made
**Then** the client sends `PUT /me/recent-topics/{topicId}` without waiting for it (a failure is ignored) and calls `onSelect`; in this story `onSelect` routes to `/play/duel/{topicId}` or `/practice/{topicId}`, which show a stub screen with the topic name and "Not available yet" and a Back link, replaced by Stories 4.2 and 4.3 [ASSUMPTION: stubs, like Story 1.5's matchmaking stub]

**Given** the picker is loading, empty or failed
**When** it renders
**Then** loading shows skeleton rows shaped like topic rows (no shimmer under reduced effects, no bare spinner past 1 s); a catalogue with no eligible topics shows one plain line in voice ("No topics are ready yet. Try a Quick Match.") with a Quick Match primary button; a failed request shows an inline error with the Problem Details `detail` and Retry, keeping any typed query [ASSUMPTION: copy TBD in the catalogue]
**And** offline, a cached list still shows but rows are `aria-disabled` with the offline caption under the Story 1.3 banner, and with no cached list the offline banner and the error state show

**Given** a `notice` is passed to the picker (used later when a requested topic is not available)
**When** the picker opens
**Then** the notice shows as one ink line above the search field and is announced politely once; it is not a modal and does not block the list

**Given** the picker at 320 CSS px at 100%, and at 360 px with 200% text
**When** long Malayalam topic and subject names render
**Then** they wrap without truncation, there is no horizontal page scroll, every row keeps its 48px hit area with a visible focus ring, and the player bundle stays within the Story 1.3 budget

### Story 4.2: Topic Duel

As Anju, a registered player,
I want to duel someone on one topic I choose, with the same matchmaking, timer and scoring as Quick Match and a separate Topic Duel rating,
So that I can train and prove myself on a weak topic without my Quick Match rating paying for it.

**Requirements:** FR27, FR28, FR29, FR30, FR3 (server rejects guests), FR7 (Topic Duel rating on the trio), FR18, FR19, FR21, FR22, FR26, FR53, FR54, FR55 (rematch keeps the topic), FR59, FR60 (Topic Duel boards), FR76 (no 422 reachable through normal UI), NFR5, NFR8, NFR18, AD-2, AD-4, AD-7, AD-8, AD-10, AD-12, AD-13, AD-14, AD-17, Additional Requirements: Game engine (matchmaking per `(mode, topicId?)`), Event streams & contracts, UX-DR17, UX-DR29, UX-DR30 (mode label beside the EN tag), UX-DR34, UX-DR39, UX-DR43, UX-DR44, UX-DR57, UX-DR61, UX-DR75, UX-DR80, UX-DR88, UX-DR89, UX-DR95, UX-DR96

**Acceptance Criteria:**

**Given** a registered player picks a topic in the Story 4.1 picker for Topic Duel
**When** `/play/duel/{topicId}` opens (replacing the Story 4.1 stub)
**Then** the client sends `/app/matchmaking/TOPIC_DUEL/join {topicId}` over the existing WebSocket connection and shows the Story 1.6 matchmaking screen with the topic name under "Finding an opponent…"; Cancel returns to the picker [ASSUMPTION: Cancel goes back to the picker, not Home]

**Given** game-service receives a `TOPIC_DUEL` join
**When** it routes the join
**Then** it sends it to the matchmaking actor for `(TOPIC_DUEL, topicId)`, creating that actor on first join and stopping it after it has been empty for 60 s [ASSUMPTION: idle actor stop]; the actor is the Story 1.6 actor parameterised by mode and topic (no copy of the pairing code), and players queued on different topics, or in Quick Match, are never paired with each other (test)
**And** a join with no `topicId` or a non-UUID `topicId` gets a private `ERROR INVALID_TOPIC` at once and is not queued; game-service does not call core to validate the topic before pairing (AD-2)

**Given** two players queued for the same topic
**When** the actor pairs them
**Then** it uses each player's `TOPIC_DUEL` rating from the in-memory rating cache (missing → 1200, client values ignored), the same ±200 band widening to ±400 at 4 s, and a `Participant{kind: BOT}` at 8 s rated at the human's own Topic Duel rating, with the same BOT badge and "Minnal Bot joined" announcement (tests with a controllable clock)

**Given** a pairing has formed
**When** the actor fetches the set
**Then** it calls `POST /internal/question-sets {source: BANK, filters: {category: KERALA_PSC, topicId}, count: 10, requesterId}` with the 2 s timeout, and core returns 10 distinct questions all tagged with that topic (integration test asserting every question's topic)
**And** the response gains an additive `topic? {topicId, name, subjectId, subjectName}` block when a `topicId` filter is used (in `contracts`, with a JSON round-trip test; Quick Match responses leave it null)

**Given** the topic has dropped below 10 published questions since the picker loaded, or does not exist
**When** core answers `422`
**Then** both players get `MATCHMAKING_FAILED` with an additive `reason: TOPIC_UNAVAILABLE` (other failures keep `reason: UNAVAILABLE`) [ASSUMPTION: reason field], and the client opens the picker again with the notice "ആ ടോപ്പിക്കിൽ ഇപ്പോൾ ചോദ്യങ്ങൾ കുറവാണ് / That topic has too few questions right now. Pick another." and a fresh catalogue, so the player never sees a raw 422

**Given** the set was fetched
**When** each player gets `MATCH_FOUND`
**Then** it carries `{matchId, mode: TOPIC_DUEL, participants, questionCount: 10, topic {topicId, name, subjectName}}`, and the match runs exactly as in Stories 1.7–1.9, 1.11 and 1.12 (early close, instant own feedback, a forfeit ends the match; 10 × 15 s, the shared `Scoring`, server clock, first answer counts, bot answers through the same path, reconnect and forfeit), finishing within 4 minutes
**And** `MATCH_ENDED` and `SNAPSHOT` also carry `topic`, so a reloaded results screen and a reconnecting client show it

**Given** the live match screen in a Topic Duel
**When** a question renders
**Then** the mode label beside the EN tag reads "ടോപ്പിക് ഡ്യുവൽ · <topic>" / "Topic Duel · <topic>", wrapping rather than truncating and staying at least 8px from the question's first line, and `document.title` keeps the "ചോദ്യം 4 / 10 · മിന്നൽ" form

**Given** a Topic Duel has completed
**When** game-service publishes `minnal.match.completed`
**Then** the event has `mode: TOPIC_DUEL`, `questionSource: BANK` and `rated: true`, with no other payload change [ASSUMPTION: topicId not added to the event; ratings do not need it]
**And** ratings-service (Story 2.5, unchanged) updates only each `USER` participant's `TOPIC_DUEL` rating, writes `match_record` with mode `TOPIC_DUEL`, publishes `rating.updated` with mode `TOPIC_DUEL`, and leaves her `QUICK` rating untouched (end-to-end test); the matchmaking cache then uses the new Topic Duel rating

**Given** the Topic Duel results screen
**When** it renders
**Then** it is the Story 1.10 / 2.6 results screen (takeover, bands, delta with the 10 s "updating" retry, breakdown, report links) with the topic named under the result line ("Topic Duel · Kerala History"), and the results heading's accessible name includes the topic
**And** the Me tab's match history shows these matches with mode "Topic Duel" and their delta, and the rating trio's Topic Duel card shows the updated rating

**Given** a Topic Duel results screen
**When** both humans request Rematch within the 60 s window (or a bot accepts instantly)
**Then** the new match has mode `TOPIC_DUEL`, the same topic and the same participants, and a freshly fetched topic set; if that fetch fails with `422` both players get `MATCHMAKING_FAILED reason: TOPIC_UNAVAILABLE` and the rematch button shows a one-line "rematch unavailable · topic too small now" note with a link to the picker

**Given** a `GUEST` token
**When** it sends `/app/matchmaking/TOPIC_DUEL/join` or `/app/match/{matchId}/rematch` into a Topic Duel
**Then** game-service rejects it with a private `ERROR` (forbidden mode) whatever the UI shows (test), and a guest never reaches the Topic Duel screens through the UI (locked row, Story 4.1)

**Given** a player already queued, in a match or in a post-match window in any mode
**When** she joins Topic Duel
**Then** the Story 1.6 rule applies: `ERROR ALREADY_IN_MATCH` with the option to return to the active match; and a draining game-service answers `SERVER_DRAINING`

**Given** the Ranks tab on Topic Duel
**When** it renders
**Then** daily, weekly and all-time boards show Topic Duel rating gains and ratings from Story 2.7 with no code change in ratings-service, and the empty-board primary button is enabled and opens the topic picker for Topic Duel (the "Coming soon" caption is removed)

**Given** queue metrics
**When** a Topic Duel pairing forms
**Then** the Story 1.6 queue-wait timer and bot-fill counter record it with a `mode` tag (`QUICK` or `TOPIC_DUEL`) and no `topicId` tag [ASSUMPTION: avoid unbounded metric cardinality]; the JSON log line carries `matchId`, `userId` and `topicId`

### Story 4.3: Solo Practice

As Anju, a registered player,
I want to practise one topic at my own pace and see the answer and explanation as soon as I answer,
So that I can learn my weak topic without a timer, an opponent or any risk to my rating.

**Requirements:** FR43 (bank topic; custom source in Epic 6), FR44, FR45, FR3 (registered-only), FR11, FR13 / AD-5 (correctness only in the answer response), FR14 (report from Solo Practice, `surface: SOLO`), FR16, FR62, FR76 (bank topics under 10 not startable), NFR10, NFR13, NFR14, NFR15, NFR21, AD-1, AD-3, AD-5, AD-12, Additional Requirements: API conventions, UX-DR3 (no volt in Solo Practice), UX-DR13, UX-DR26, UX-DR27, UX-DR30, UX-DR32, UX-DR33, UX-DR72, UX-DR74, UX-DR79, UX-DR86, UX-DR87 (adapted: no countdown), UX-DR88, UX-DR89, UX-DR91, UX-DR93, UX-DR94, UX-DR96

**Acceptance Criteria:**

**Given** core-service's Solo Practice storage
**When** a session is created
**Then** it lives only in Valkey under `core:solo:{sessionId}` as `{userId, source, cycle, order[questionId…], cursor, current?{questionId, version, answered}, answeredCount, correctCount}` with a 2 h sliding TTL, plus `core:solo:user:{userId}` pointing at the player's one active session [ASSUMPTION: no Postgres table; a lost session is acceptable because nothing about it is rated or kept]
**And** no Flyway migration is added in this story

**Given** a `USER` token
**When** the client calls `POST /api/core/v1/solo/sessions {source: {type: "BANK", topicId}}`
**Then** if the topic has at least 10 published questions (the Story 4.1 threshold), core shuffles the ids of every non-deleted question whose latest `PUBLISHED` version is in that topic, stores a new session (ending any earlier active session of that player) and returns `201 {sessionId, source: {type: "BANK", topicId, topicName, subjectName}, poolSize}`
**And** a topic with fewer than 10 gets `422` Problem Details with `type` `…/topic-unavailable`, an unknown `topicId` gets `404`, and `source.type: "CUSTOM"` gets `422` "custom source not available" until Epic 6
**And** `source` is a tagged object (`type` + type-specific id) in the request, the stored session and every response, so Epic 6 can add `{type: "CUSTOM", customTopicId}` without changing any existing field [ASSUMPTION: discriminated source shape]

**Given** an active session
**When** the client calls `GET /api/core/v1/solo/sessions/{sessionId}/next`
**Then** it returns `{position, source, reshuffled, question: QuestionView{questionId, version, textMl?, textEn?, options[4]}}` for the next question, serving its latest `PUBLISHED` version at that moment, and records it as `current`
**And** if `current` is still unanswered it returns that same question again instead of advancing (so a reload never skips a question), and a serialization test proves the response has no answer index, explanation, attribution or correctness field (AD-5)

**Given** the player answers
**When** the client calls `POST /api/core/v1/solo/sessions/{sessionId}/answers {questionId, version, optionIndex}`
**Then** core checks it against the stored `current` question and that exact version (an older version stays answerable after a publish, since versions are immutable) and returns `{correct, answerIndex, explanation, attribution?, answeredCount, correctCount}`; only this response ever carries that question's answer
**And** an answer for a question other than `current` gets `409`, a second answer to `current` gets `409` with the first result unchanged, and `optionIndex` outside 0–3 gets `400`

**Given** the player has been served every question in the pool
**When** she asks for the next one
**Then** core rebuilds the pool from the topic's current published questions (new ones join, deleted ones drop), shuffles it so the question just answered is not first, increments `cycle`, and returns the next question with `reshuffled: true`
**And** within one cycle no question is served twice (property test over a 12-question topic), and a question soft-deleted mid-cycle is skipped when its turn comes

**Given** a session that belongs to another user, has expired or never existed
**When** any session endpoint is called
**Then** it gets `404` Problem Details, so no one can read another player's session; a `GUEST` token gets `403` on every `/api/core/v1/solo/**` endpoint

**Given** the player stops
**When** the client calls `POST /api/core/v1/solo/sessions/{sessionId}/end`
**Then** core returns `{answeredCount, correctCount}` and deletes the session keys; a later call on that session gets `404`

**Given** any Solo Practice activity
**When** it happens
**Then** core publishes no stream event and calls no other service, so no rating, rating event, match record or leaderboard entry changes (integration test asserting the ratings tables and board keys are unchanged after a 20-question session), and Solo Practice never appears in match history

**Given** a registered player picks a topic for Solo Practice in the picker
**When** `/practice/{topicId}` opens (replacing the Story 4.1 stub)
**Then** the client creates a session and shows the Solo Practice screen: a header with the topic name and a "നിർത്തുക / Stop" button, a running tally "12 answered · 9 correct" (tabular Latin digits), the question in question typography with the EN tag when the other language exists, and options A–D using the shared answer option with commit-on-lift; there is no timer line, no seconds label, no score and no opponent
**And** `document.title` reads "പരിശീലനം · <topic> · മിന്നൽ" / "Practice · <topic> · Minnal", the session id is kept in `sessionStorage` so a reload resumes the same session, and a `422 topic-unavailable` on start opens the picker with its notice

**Given** the player lifts on an option
**When** the answer request is sent
**Then** the option shows "…" until the response, then the result in place: the correct option marked with an ink ✓ tile and bold text, her wrong pick (if any) in brick with ⚠ text, other options muted, and a one-line result in voice that always names the correct answer ("ശരി! / Correct!" or "ശരി: <answer>")
**And** below it the shared explanation + attribution block (Story 3.5) shows the explanation, the source or "ഉറവിടം ലഭ്യമല്ല", and the "തെറ്റുണ്ടോ?" link, which sends reports with `surface: SOLO` and no `matchId`, and is hidden when `source.type` is not `BANK`
**And** there is no peak band, strike, flood or volt anywhere on the Solo Practice screen (volt is not allowed here by UX-DR3) [ASSUMPTION: Solo Practice is calm, not a peak surface]

**Given** the result is showing
**When** the player taps "അടുത്തത് / Next" (button-primary, fixed bottom bar)
**Then** the next question loads and focus moves to the question heading, whose accessible name is the question text then "ചോദ്യം 13 · പരിശീലനം"; the result is announced politely once ("Correct. Answer: <option>" / "Wrong. Answer: <option>"), and focus moves to Next after the result
**And** when `reshuffled` is true, a one-line notice above the question reads "ഈ ടോപ്പിക്കിലെ എല്ലാ ചോദ്യവും കഴിഞ്ഞു · പുതിയ ക്രമത്തിൽ വീണ്ടും / You've seen every question in this topic. Starting again in a new order.", announced politely once

**Given** the player taps Stop or presses Android back
**When** at least one question was answered
**Then** the client calls `end` and shows a summary card "12 answered · 9 correct" with "വീണ്ടും പരിശീലിക്കാം / Practise again" (a new session on the same topic), "Choose another topic" (picker) and Home; focus moves to the summary heading
**And** with no answered question, Stop returns straight to the picker with no summary and no confirm step [ASSUMPTION]

**Given** the session has expired or the network fails
**When** a request returns `404` for the session or fails
**Then** an expired session shows "This practice session timed out" with the last known tally and a "Start again" button on the same topic; a network or `5xx` failure keeps the screen and shows an inline error with Retry; offline, Next and the options are `aria-disabled` with the offline caption

**Given** a guest
**When** she opens `/practice/{topicId}` directly
**Then** she sees the Sign-in prompt with `returnTo` set to that route, and no session request is sent

**Given** the Solo Practice screen at 320 CSS px at 100%, and at 360 px with 200% text, in both languages
**When** long Malayalam questions, options and explanations render
**Then** they wrap without truncation, containers carry `lang` from the content, there is no horizontal page scroll, every control has a 48px hit area and visible focus ring, and the player bundle stays within the Story 1.3 budget

### Story 4.4: Practise this topic

As Anju, a registered player looking at a question she got wrong,
I want a "Practise this topic" action on that results breakdown row,
So that I can go straight from a mistake to practising its topic without searching for it.

**Requirements:** FR43, FR54 (results breakdown), FR14 / UX-DR33 (same visibility rules as the report link), FR76 (ineligible topic never reached), FR3, AD-5 (link only on results, after every reveal), AD-10, AD-12, [new capability, user-approved: "Practise this topic", extends CAP-7 and CAP-9], UX-DR42, UX-DR86, UX-DR88, UX-DR94, UX-DR96

**Acceptance Criteria:**

**Given** the `contracts` module
**When** this story extends the question DTOs
**Then** each item returned by `/internal/question-sets` for a `BANK` source gains an additive `topicId` (the topic of the served version), and each `MATCH_ENDED` `questions[]` entry gains `topicId?`, null for any non-bank question (Story 1.10's `MATCH_ENDED` did not carry it) [ASSUMPTION: topic id only; the name comes from the Solo Practice start response]
**And** JSON round-trip and web contract tests are updated, Quick Match and Topic Duel `MATCH_ENDED` both carry it, `QuestionView` and `QUESTION_REVEALED` are unchanged, and older stored `MATCH_ENDED` values without `topicId` still rehydrate (the action is hidden for them)

**Given** a registered player's results breakdown in any mode with `questionSource: BANK`
**When** a row is expanded (wrong and missed rows always, correct rows when opened)
**Then** it shows a "ഈ ടോപ്പിക് പരിശീലിക്കാം / Practise this topic" text link in ink below the explanation + attribution row, with a 48px hit area that does not overlap the report link's hit area, and an accessible name that includes the question number ("Practise this topic, question 3")
**And** a collapsed correct row shows no link until expanded

**Given** a guest's results, a match whose `questionSource` is `CUSTOM`, or a question whose `topicId` is null
**When** the breakdown renders
**Then** no "Practise this topic" link is shown for those rows (tests for each case)

**Given** the player taps "Practise this topic"
**When** the client starts the session
**Then** it calls the Story 4.3 `POST /api/core/v1/solo/sessions {source: {type: "BANK", topicId}}` and the Story 4.1 `PUT /me/recent-topics/{topicId}`, and on `201` opens the Solo Practice screen on that session with focus on the first question heading; the link shows "…" while the request is pending and ignores further taps
**And** any pending rematch request is cancelled first, exactly as Home does (Story 1.10), and browser Back from Solo Practice returns to the same results, rehydrated from `sessionStorage`

**Given** the topic now has fewer than 10 published questions
**When** the start returns `422 topic-unavailable`
**Then** the client opens the Story 4.1 picker for Solo Practice with the notice "ആ ടോപ്പിക്കിൽ ഇപ്പോൾ ചോദ്യങ്ങൾ കുറവാണ് / That topic has too few questions right now. Pick another.", so the player never sees a raw error

**Given** the start fails for another reason
**When** it returns `404` (topic deleted), a `5xx` or a network error
**Then** a `404` opens the picker with the same notice, and a `5xx` or network error shows a one-line inline error under the link with Retry, keeping the results screen intact; offline, the link is `aria-disabled` with the offline caption

**Given** the live-match reveal
**When** it renders
**Then** no "Practise this topic" link is shown there (results only), so nothing pulls the player out of a live match [ASSUMPTION]

## Epic 5: Rajeev sir runs a Battle Room

Rajeev sir runs a PSC coaching batch in Kollam, and his students already race each other on WhatsApp quiz threads. He opens the Rooms tab, taps Create room, picks Kerala Renaissance from the same topic picker Anju uses, keeps 10 questions, and gets a big `K7M-Q2X` code with "expires 7:30 pm" under it. One tap on Share to WhatsApp posts the code and a `/r/K7M-Q2X` link to the batch group. Students tap the link and land straight in the lobby with no confirmation step, and their names pop in as chips while the count climbs to 23. Start stays disabled with "Waiting for 1 more player" until a second human joins. When he taps Start, everyone gets the same 3-2-1 and then the same question at the same moment. Rajeev plays too. A live scoreboard with an answered meter moves after every reveal, and when his row overtakes Arjun K it turns ink with volt and a crack is drawn past him. At the end the #1 student gets the win takeover, or a joint-win takeover when two tie, and everyone lands on a 2-1-3 podium with full standings and their own place. Battle Room ratings and boards move for bank-topic rooms. One tap on Play again opens a new room with the same topic and sends its code to every player on the results screen. To make this possible, the epic adds game-service's room actor (`LOBBY → IN_MATCH → ENDED`), a room-code registry with `SecureRandom` codes and short-lived tombstones, `ROOM_*` messages and room client destinations in `contracts`, a room scoreboard on the Story 1.7 match actor (its list-based participant model is configured for N participants, with no refactor), the `BATTLE_ROOM` mode end to end, and the Rooms tab, Create, lobby, live scoreboard and podium screens. It builds on the match engine, reconnect, results and `POST_MATCH` window (Stories 1.6–1.10), sign-in and profile (Stories 2.1–2.3), the generic N-player pairwise ELO with K = 32/(N−1), history and per-mode boards (Stories 2.5–2.7), the report link (Story 3.5), the topic picker and its `?for=` routing (Story 4.1), the `topicId` filter and `topic` block of `/internal/question-sets` (Story 4.2), and "Practise this topic" (Story 4.4). The epic leaves out custom topics as a room source, unrated custom rooms and the custom-topic count cap (Epic 6; the room source is a tagged object so a `CUSTOM` source can be added without breaking changes), the share card and the Share action on results (Epic 7), GG reactions (deferred by UX, not in MVP), and the optional "Relaxed timer" host setting (open product question).

### Story 5.1: Room server: create, configure and expire

As Rajeev sir, a registered player who runs a coaching batch,
I want game-service to open a room for me with a hard-to-guess code that only I can configure,
So that my batch gets a fair, private room that cleans itself up.

**Requirements:** FR31 (code, uniqueness, 24 h expiry), FR34 (host role; join and start rules in Stories 5.3–5.4), FR35 (bank source only; custom source in Epic 6), FR36, FR40 (rooms have no bot path), FR3 (registered-only), FR26 (one queue/room/match per `sub`), NFR7 (drain), NFR12, NFR13, NFR18 (rooms-created counter), AD-2, AD-4, AD-7, AD-9, AD-10, AD-11, AD-14, Additional Requirements: Game engine (rooms), Real-time protocol (contracts)

**Acceptance Criteria:**

**Given** the `contracts` module
**When** this story extends it
**Then** it implements the room client destinations `/app/room/create`, `/app/room/join` and `/app/room/{roomId}/configure|start|leave|playAgain` and the room message types `ROOM_JOINED` (private), `ROOM_LOBBY_UPDATED` (broadcast on `/topic/room/{roomId}`) and `ROOM_CLOSED` (broadcast), all per AD-10, each with JSON round-trip tests and matching web TypeScript types [ASSUMPTION: create and join travel over STOMP like every other game action, since game-service has no REST API]
**And** a room's `source` is a tagged object `{type: "BANK", topicId}` (the Story 4.3 shape), so Epic 6 can add `{type: "CUSTOM", customTopicId}` without changing any existing field, and room state carries `rated`, derived on the server as `source.type == BANK`

**Given** a registered player with a completed profile
**When** she sends `/app/room/create {source: {type: "BANK", topicId, topicName}, questionCount}`
**Then** game-service creates one room actor in state `LOBBY` with a fresh UUID `roomId` (never equal to any `matchId`), a code, `hostParticipantId` = her `sub`, the source and count, `createdAt` and `expiresAt = createdAt + 24 h`, adds her as the first participant (`kind: USER`, name from her token), and sends her a private `ROOM_JOINED {roomId, code, role: HOST, room: {hostParticipantId, source, questionCount, rated, expiresAt, participants[], humanCount}}`
**And** every lobby change is a queued event on that room's actor thread, and the room has no way to add a `BOT` participant (architecture test: the room actor cannot reach the bot factory)
**And** this story is verified through STOMP integration tests; the Rooms screens are Story 5.2

**Given** the code generator
**When** a room is created
**Then** the code is 6 characters drawn with `SecureRandom` from the 31-character alphabet `A–Z` and `2–9` without `0 O 1 I L`, giving about 8.9 × 10⁸ codes; it is checked against the in-memory registry of live rooms (Story 5.3 adds recent tombstones to the same check) and redrawn on a collision, so no two live rooms share a code (test with a seeded random that forces collisions)
**And** the canonical code has no hyphen and is displayed as `XXX-XXX` (`K7M-Q2X`)

**Given** a create request
**When** the server validates it
**Then** `questionCount` outside 5–30 or a missing count is rejected with a private `ERROR INVALID_ROOM_CONFIG`, a `source.type` other than `BANK` gets `ERROR SOURCE_NOT_AVAILABLE` until Epic 6, and a missing or non-UUID `topicId` gets `ERROR INVALID_TOPIC`; no room is created in any of these cases
**And** game-service does not call core to check the topic while the room is in the lobby (AD-2 allows the call only at match start); `topicName` is display text from the host's picker, trimmed to 80 characters, and is replaced by core's name when the set is fetched at start (Story 5.4) [ASSUMPTION: host-supplied display name in the lobby]

**Given** a `GUEST` token, a registered player who has not finished profile setup, or a `sub` already queued, in a lobby or in a match (including a post-match window)
**When** it sends `/app/room/create`
**Then** the guest gets `ERROR` (forbidden mode) whatever the UI shows, the incomplete profile gets `ERROR PROFILE_REQUIRED`, and the busy `sub` gets `ERROR ALREADY_IN_MATCH` with the active `matchId` or `roomId` and the client offers to return to it
**And** a draining game-service answers `ERROR SERVER_DRAINING` and the client shows the one-line "try again in a moment" notice

**Given** a room in `LOBBY`
**When** the host sends `/app/room/{roomId}/configure {source, questionCount}`
**Then** the room validates it as on create, stores it and broadcasts `ROOM_LOBBY_UPDATED` with the new config and the next `seq`
**And** a `configure` from any `sub` other than the host gets a private `ERROR NOT_HOST` and changes nothing

**Given** the host is alone in the lobby
**When** she sends `/app/room/{roomId}/leave`
**Then** the room closes, its code is released, and her `sub` is free for any queue, room or match at once
**And** if the host's last session drops, the room waits the AD-11 10 s grace for her and then closes; a reconnect within it gets a private `ROOM_JOINED` with the current state

**Given** a lobby that is still open at `expiresAt`
**When** the actor's timer fires
**Then** the room closes, its code is released, and it broadcasts `ROOM_CLOSED {reason: EXPIRED}` to every member

**Given** the room destinations this story does not build yet
**When** a client sends `/app/room/join` or `/app/room/{roomId}/start`
**Then** game-service answers a private `ERROR NOT_AVAILABLE_YET` and changes nothing [ASSUMPTION: stub; Story 5.3 replaces the join stub, and Story 5.4 replaces the start stub after Story 5.3 adds the host and player-count checks]

**Given** room creation
**When** a room is created or closed
**Then** a Micrometer counter records rooms created, a gauge reports live rooms, and a JSON log line carries `roomId` and the host's `userId`; the code is never logged [ASSUMPTION: codes kept out of logs]

### Story 5.2: Create a room and share it

As Rajeev sir, a registered player who runs a coaching batch,
I want to create a Battle Room on a PSC topic from the Rooms tab and share its code and link to WhatsApp in one tap,
So that my students can find the room in seconds without me reading out instructions.

**Requirements:** FR31 (expiry shown as an absolute time), FR32 (share and copy; joining by link in Story 5.3), FR34 (host lobby view), FR36 (count stepper), FR42, FR76 (bank part: picker hides topics under 10; count capped at the topic's published count), FR3 (registered-only), NFR14, AD-18, UX-DR3 (no volt in the lobby), UX-DR5 (room-code type), UX-DR13, UX-DR14, UX-DR15 (Rooms tab; no tab bar in the lobby), UX-DR22, UX-DR48, UX-DR50, UX-DR51 (bank source row and count selector; സ്വന്തം tag and unrated note in Epic 6), UX-DR53 (host start bar, disabled state), UX-DR72, UX-DR74, UX-DR78, UX-DR86, UX-DR88 (copy announcement), UX-DR89, UX-DR91, UX-DR94, UX-DR95, UX-DR96

**Acceptance Criteria:**

**Given** a registered player
**When** she opens the Rooms tab (replacing the Story 1.3 placeholder)
**Then** it shows a heading, a "Create room" button-primary, a "Join with code" section with a labelled code field and a Join button, and a "Recently hosted" list of up to 3 rows in the mode-entry-row pattern (topic name, muted "10 questions · 11 Nov" subline, dim chevron, min-height 56); the list is hidden when empty, and `document.title` reads "റൂമുകൾ · മിന്നൽ" / "Rooms · Minnal"
**And** the Join field and button are present but inert in this story, with the caption "Joining arrives soon" [ASSUMPTION: stub, replaced by Story 5.3]
**And** the Home Battle Room row loses its "Coming soon" caption and opens the Rooms tab

**Given** a guest
**When** she opens the Rooms tab, the Battle Room row on Home or the `/rooms/create` route directly
**Then** the Rooms tab shows one line about what Battle Room is and exactly one Sign-in nudge, and the locked Home row and the direct route open the Sign-in prompt with `returnTo` set to that route

**Given** recently hosted rooms
**When** a host creates a room
**Then** the client stores `{source, topicName, subjectName, questionCount, hostedAt}` in `localStorage` under a key scoped to her user id, newest first, keeping at most 3 and replacing an entry with the same source [ASSUMPTION: per-device storage, because rooms live only in game-service memory and no service owns a room history; a list that does not follow the player across devices is accepted]
**And** a row whose topic is no longer in the Story 4.1 catalogue (fewer than 10 published questions) is hidden; sign-out keeps the list but another account on the device never sees it, and account deletion (Story 2.8) clears it
**And** a broken or unreadable stored value is discarded without an error

**Given** the player taps Create room, or a recently hosted row
**When** the Create screen opens at `/rooms/create`
**Then** it shows a source row and a count row; Create room leaves the source empty with a "Choose a topic" action, a recent row preselects its source and count, and the Create button is `aria-disabled` with the caption "Choose a topic first" until a source is set
**And** "Choose a topic" opens the Story 4.1 picker at `/play/topics?for=room` (the picker gains purpose `BATTLE_ROOM` and heading "Battle Room · choose a topic", with no change to existing callers), and picking a topic returns to Create with that source set and recorded in recent topics

**Given** the count row
**When** it renders
**Then** it is a stepper with − and + buttons (48px hit areas) around the value in tabular digits, default 10, step 1, minimum 5 and maximum `min(30, publishedCount)` of the chosen topic from the catalogue, with each limit shown as `aria-disabled` and a caption at the limit ("This topic has 18 questions") [ASSUMPTION: stepper control]
**And** changing to a topic with fewer published questions than the current count lowers the count to that topic's size, with the change announced politely once

**Given** a valid source and count
**When** the host taps Create
**Then** the client sends `/app/room/create`, writes the recent entry, and opens the lobby at `/r/<code>` (with the hyphen) with no tab bar; a failed create shows its error inline on the Create screen and keeps the chosen values

**Given** the host's lobby
**When** it renders
**Then** it shows a top bar with a Leave control and a "Host" outline tag, then the room code block: card, xl radius, label, the code in room-code type (room-code-compact under 360 CSS px) as the largest element on screen with the accessible name spelling it ("K 7 M, Q 2 X"), and an expiry caption as an absolute time in IST ("expires 7:30 pm", or "expires tomorrow 7:30 pm" when it falls on the next IST day)
**And** below it a config card shows the source row (topic name, muted subject line, an "Edit" link for the host) and the count row (an "Edit" link opening the same stepper), then a joined section with "1 joined" and her own ink chip "നിങ്ങൾ", then the fixed host start bar "തുടങ്ങാം · 1 പേർ" shown as button-disabled with the caption "ഒരാൾ കൂടി വേണം / Waiting for 1 more player" and a second caption that leaving closes the room
**And** the lobby uses no volt and no flash, and `document.title` reads "ബാറ്റിൽ റൂം · K7M-Q2X · മിന്നൽ" / "Battle Room · K7M-Q2X · Minnal"

**Given** the host's lobby
**When** she taps Edit on the source or count
**Then** the source Edit opens the picker at `/play/topics?for=room&roomId=<roomId>` and returns to the lobby, the count Edit opens the same stepper, and the chosen values are sent with the Story 5.1 `/app/room/{roomId}/configure`; the lobby re-renders from the resulting `ROOM_LOBBY_UPDATED`, and an `ERROR` shows inline on the config card

**Given** the room code block
**When** the host taps "Share to WhatsApp" (button-primary)
**Then** the client calls `navigator.share({title, text, url})` with the text "Join my Minnal Battle Room · K7M-Q2X" (both languages, ML flagged TBD) and the url `<PUBLIC_APP_ORIGIN>/r/K7M-Q2X`, where the origin comes from build-time configuration and is never hard-coded [ASSUMPTION: `VITE_PUBLIC_APP_ORIGIN`, since the domain is still TBD]
**And** where `navigator.share` is missing it copies the text and link to the clipboard with an inline "Copied", announced politely, and a cancelled share sheet does nothing

**Given** the copy-code text link (48px hit area)
**When** the host taps it
**Then** `K7M-Q2X` is written to the clipboard, the link shows "Copied" inline for 2 s, and "Copied" is announced once through the polite region; if the clipboard is refused, the code text is selected so it can be copied by hand [ASSUMPTION]

**Given** the host is alone in the lobby
**When** she taps Leave or presses Android back
**Then** the client sends the Story 5.1 `/app/room/{roomId}/leave` with no confirm step and returns her to the Rooms tab

**Given** a lobby receives `ROOM_CLOSED {reason: EXPIRED}`
**When** the client handles it
**Then** every member returns to the Rooms tab with a one-line notice that the room expired, announced politely

**Given** the Rooms tab, Create screen and lobby at 320 CSS px at 100%, and at 360 px with 200% text
**When** long Malayalam topic names render
**Then** they wrap without truncation, the code stays on one line in room-code-compact, there is no horizontal page scroll, every control has a 48px hit area with a visible focus ring, and offline the Create and Share actions are `aria-disabled` with the offline caption

### Story 5.3: Join a room and the live lobby

As a student in Rajeev sir's batch,
I want to tap the WhatsApp link, or type the code, and be in the lobby at once, watching my classmates' names pop in,
So that joining feels like joining a WhatsApp group, not checking in to an exam hall.

**Requirements:** FR32 (join link straight into the lobby), FR33, FR34 (2–50 humans, host counts, Start enabled at ≥ 2 humans), FR40, FR41, FR3, FR26 (`ALREADY_IN_MATCH`), NFR11 (join-attempt limit), NFR12, NFR13, AD-9, AD-10, AD-11, AD-14, AD-18, UX-DR14, UX-DR49, UX-DR52, UX-DR53, UX-DR76, UX-DR80 (host left), UX-DR82 (join link), UX-DR84 (chips fade under reduced effects), UX-DR86, UX-DR88 (lobby joins debounced), UX-DR89, UX-DR91, UX-DR94, UX-DR95, UX-DR96 (join expired / full strings; bad-code copy flagged TBD)

**Acceptance Criteria:**

**Given** the code normaliser (one function in the web app and one in game-service, sharing a table-driven test fixture)
**When** a player types or a link carries a code
**Then** it is NFC-normalised, spaces and hyphens are stripped and letters upper-cased, so `k7m-q2x`, `K7MQ2X`, ` k7m q2x ` and `K7M-Q2X` all become `K7MQ2X`
**And** a result that is not exactly 6 characters, or that contains `0`, `O`, `1`, `I`, `L` or any character outside the alphabet, is rejected as a bad code without asking the server, with the inline error "Check the code. Codes have 6 letters and numbers and never use 0, O, 1, I or L." (ML flagged TBD) [ASSUMPTION: confusable characters are rejected, not silently mapped, because they never occur in a real code]

**Given** a registered player with a completed profile
**When** she sends `/app/room/join {code}` (replacing the Story 5.1 `NOT_AVAILABLE_YET` join stub)
**Then** the registry finds the live room, the room actor adds her as a `USER` participant (name from her token), sends her a private `ROOM_JOINED {roomId, code, role: PLAYER, room}` and broadcasts the change on `/topic/room/{roomId}`
**And** only room members may subscribe to `/topic/room/{roomId}`; any other subscription is rejected
**And** a join from a `sub` that is already a member of that room (another tab, or a second tap on the link) returns `ROOM_JOINED` again and adds no second participant

**Given** a join that cannot succeed
**When** the server answers
**Then** it sends a private `ERROR` with a code the client maps to an inline message under the code field (`aria-describedby` + `aria-invalid`), keeping the typed code:
- `ROOM_NOT_FOUND` (no live room and no tombstone): "No room has this code. Check it with the host." (ML flagged TBD)
- `ROOM_EXPIRED` (the code's room ended, expired or was closed): "K7M-Q2X has expired. Ask the host to share a new code."
- `ROOM_FULL` (50 participants already, host included): "Room is full (50). Ask the host for a new room."
- `ROOM_STARTED` (the room is starting or in a match): "This room has already started. Ask the host for the next room." (ML flagged TBD)
- `ALREADY_IN_MATCH` (queued, in another room or in a match, including a post-match window): a one-line notice with a button to return to the active match or room
**And** a guest token gets `ERROR` (forbidden mode), an incomplete profile gets `PROFILE_REQUIRED`, and a draining game-service answers `SERVER_DRAINING`

**Given** a room that has closed, expired or ended
**When** the registry removes it
**Then** it keeps a tombstone `{code, reason, until: now + 24 h}` in memory, so a late join gets `ROOM_EXPIRED` instead of `ROOM_NOT_FOUND`, and the code is not issued again while the tombstone lives; after a game-service restart every old code reads `ROOM_NOT_FOUND` (rooms are lost on restart, AD-14) [ASSUMPTION: in-memory tombstones]

**Given** one `sub` sending joins for codes that do not exist
**When** it passes 10 failed lookups in a rolling minute
**Then** further joins are refused with `ERROR RATE_LIMITED` for the rest of that minute and the client shows "Too many tries. Wait a minute and try again." (ML flagged TBD), so codes cannot be guessed by brute force; successful joins never count [ASSUMPTION: limit values]

**Given** the Rooms tab's Join with code field (replacing the Story 5.2 stub)
**When** it renders
**Then** it has a visible label, `inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false"`, a Join button and Enter-to-submit; while the join is in flight Join shows "…" and ignores taps, and on success the lobby opens at `/r/<code>`

**Given** a registered player opens a `/r/<code>` link (with or without the hyphen, any case)
**When** the route loads
**Then** the client normalises the code, sends the join and opens the lobby directly with no confirmation step; on an error it opens the Rooms tab with the code prefilled in the Join field and the inline error shown and announced politely

**Given** a guest, or a registered player whose profile is not set up, opens a `/r/<code>` link
**When** the route loads
**Then** the guest sees the Sign-in prompt with `returnTo=/r/<code>`, and after Google sign-in (and the Story 2.3 setup screen for a new account) she lands on the same route, which joins and opens the lobby with no further tap; focus moves to the lobby heading and "Signed in as <name>" is announced
**And** no join is sent before sign-in completes, so a guest is never added to a room

**Given** a player in the lobby
**When** it renders for a non-host
**Then** it shows the same code block, expiry, Share and copy-code actions as the host (any player can re-share the link) [ASSUMPTION], the source and count rows read-only with no Edit links, the joined section and no host start bar; a "Waiting for <host name> to start" line in muted text shows instead, with the host's name unchanged

**Given** lobby membership changes
**When** players join or leave
**Then** the room actor sends at most one `ROOM_LOBBY_UPDATED {joined[], left[], humanCount, participants[]}` broadcast per 250 ms, coalescing the changes in between, each with the next `seq` [ASSUMPTION: coalescing window], and clients apply them in `seq` order with the Story 1.9 buffering and `resync` rules (a lobby `resync` returns a fresh `ROOM_JOINED`)

**Given** a new joiner arrives in the joined list
**When** the client renders the update
**Then** her chip enters at the front with chip-pop (fade + scale .92 → 1, 160 ms), a 1.5px ink outline and the "ഇപ്പോൾ" label for 3 s, then settles into the plain chip; the count ("23 joined") swaps without counting up; the player's own chip is the ink "നിങ്ങൾ" chip
**And** when 5 or more joins arrive within one second, their chips fade in together as one batch with no individual pops, and under reduced effects every chip only fades in (120 ms) with no scale
**And** the list shows at most 24 chips, then a dashed "+N പേർ" chip that expands the full list when tapped [ASSUMPTION: 24 visible chips]

**Given** joins and leaves
**When** they are announced
**Then** one polite announcement is made at most every 5 s summarising them ("3 joined, 23 in room"), and the joined-chip list itself is never a live region

**Given** a non-host player in the lobby
**When** she taps Leave or presses Android back
**Then** the client sends `/app/room/{roomId}/leave` with no confirm step, she is removed (her `sub` is free for any other queue, room or match at once), the others see her chip disappear without animation, and she returns to the Rooms tab
**And** if her last session drops, she stays in the list for the 10 s grace and is then removed; a reconnect within it gets a private `ROOM_JOINED` with the current state

**Given** the host leaves the lobby before starting (Leave, Android back, or 10 s after her last session drops)
**When** other players are present
**Then** a host tapping Leave first sees a `role="alertdialog"` "Close the room? Everyone will be sent back." with "Stay" focused and a brick "Close room" text button (Esc or Android back = Stay) [ASSUMPTION: confirm only when others are in the lobby]
**And** on close the room broadcasts `ROOM_CLOSED {reason: HOST_LEFT}`, a tombstone is kept, and every other player returns to the Rooms tab with the one-line notice "<host name> closed the room" (name unchanged, ML flagged TBD), announced politely

**Given** the host start bar
**When** the human count changes
**Then** with fewer than 2 humans (the host counts) it is button-disabled (`aria-disabled`, still focusable) with the caption "ഒരാൾ കൂടി വേണം / Waiting for 1 more player"; at 2 or more it is enabled and reads "തുടങ്ങാം · N പേർ" with tabular digits, and the caption that leaving closes the room stays
**And** a `/app/room/{roomId}/start` from any `sub` other than the host gets `ERROR NOT_HOST`, and from the host with fewer than 2 humans gets `ERROR NOT_ENOUGH_PLAYERS`; both change nothing
**And** in this story a valid start is still answered with the Story 5.1 `ERROR NOT_AVAILABLE_YET` and the host sees "Starting a match arrives soon"; Story 5.4 replaces this stub [ASSUMPTION: stub]

**Given** a room with 50 participants
**When** a 51st player joins
**Then** she gets `ROOM_FULL`, and a load test with 60 near-simultaneous joins leaves exactly 50 participants, with every broadcast `seq` contiguous

**Given** the lobby at 320 CSS px at 100%, and at 360 px with 200% text
**When** 50 chips with long Malayalam and Latin names render
**Then** chips wrap without truncation, each name container carries `lang` by script, names are never inflected, there is no horizontal page scroll, and the tab bar stays hidden

### Story 5.4: Play a room match

As Rajeev sir and his students,
I want the host's Start to give everyone the same 3-2-1 and the same question at the same moment, with a live scoreboard that moves after every reveal,
So that the class plays one fair race and watches it unfold together.

**Requirements:** FR37, FR38, FR34 (host plays and only the host starts), FR40, FR31 (expiry at match end), FR76 (no 422 reached through normal UI), FR13, FR21 (scoring formula), FR22, FR63, FR64, FR65, FR75, NFR1, NFR2, NFR4, NFR7, NFR10, NFR15, NFR18 (rooms started, room size), AD-2, AD-4, AD-5, AD-6, AD-8 (completed vs aborted), AD-10, AD-11, AD-12, AD-14, AD-18, Additional Requirements: Game engine (actor, secrecy, server clock, rooms), UX-DR3, UX-DR10, UX-DR26, UX-DR27, UX-DR28, UX-DR30, UX-DR31, UX-DR34, UX-DR35, UX-DR36, UX-DR37, UX-DR54, UX-DR55, UX-DR56, UX-DR73, UX-DR80 (aborted notice), UX-DR83, UX-DR84, UX-DR85, UX-DR87, UX-DR88, UX-DR89, UX-DR90, UX-DR91, UX-DR95

**Acceptance Criteria:**

**Given** the host taps an enabled Start (replacing the Story 5.1 / 5.3 start stub)
**When** the room actor receives `/app/room/{roomId}/start`
**Then** it re-checks host and ≥ 2 humans, moves to a `STARTING` step of the lobby, broadcasts `ROOM_LOBBY_UPDATED {phase: STARTING}` (the host's button shows "…" and every lobby shows "Starting…"), and fetches the set off the actor thread with `POST /internal/question-sets {source: BANK, filters: {category: KERALA_PSC, topicId}, count: questionCount, requesterId: hostUserId}` and the 2 s timeout
**And** repeated starts while `STARTING` are ignored, and joins during `STARTING` get `ROOM_STARTED`

**Given** the fetch returns `422`, times out or fails
**When** the result reaches the room actor
**Then** the room goes back to `LOBBY` with everyone still in it and broadcasts `ROOM_START_FAILED {reason: TOPIC_UNAVAILABLE | UNAVAILABLE}`; joins are accepted again
**And** for `TOPIC_UNAVAILABLE` the host sees "That topic has too few questions right now. Pick another." with a "Change topic" action opening the picker for the room, for `UNAVAILABLE` the host sees "Couldn't start. Try again." with Start enabled, and other players see the muted line "Waiting for <host name> to start"; nobody sees a raw `422`

**Given** players leave during `STARTING`
**When** the fetch succeeds
**Then** the start goes ahead only if the host is still there and at least 2 humans remain; otherwise the room returns to `LOBBY` (the "Waiting for 1 more player" state) or closes if the host left

**Given** the fetch succeeds with ≥ 2 humans present
**When** the room starts the match
**Then** it mints a fresh `matchId`, creates a match actor with every room participant (all `kind: USER`, no bots), moves to `IN_MATCH`, takes the topic name from the response's `topic` block, and broadcasts `ROOM_MATCH_STARTED {roomId, matchId, mode: BATTLE_ROOM, participants, questionCount, topic, firstQuestionAt}` on `/topic/room/{roomId}` with `firstQuestionAt` = now + 3.5 s (a 3 s countdown plus a 0.5 s subscription buffer) [ASSUMPTION: buffer]
**And** each client subscribes to `/topic/match/{matchId}` (participants only, Story 1.7) and the match uses the standard match destinations from then on
**And** a Micrometer counter records rooms started, a distribution records humans per started room, and a JSON log line carries `roomId`, `matchId` and the host's `userId`

**Given** `ROOM_MATCH_STARTED`
**When** each client shows the start countdown
**Then** every player, host included, sees 3-2-1 digits in countdown type, ink on paper and monochrome, timed from `firstQuestionAt` with the server clock offset (never from local timers), with no control for the host; under reduced effects the digits swap with no scale
**And** the client waits for `document.fonts.ready` (capped at 3 s) during the countdown, and Q1's `QUESTION_STARTED` has `startedAt = firstQuestionAt`, so every player sees the same question at the same server moment

**Given** the match actor running a room match
**When** questions run
**Then** it is the Story 1.7 actor reused as configuration: its list-based participant model takes the N room participants with no refactor (one code path for 1v1 and rooms, no copy): `total = questionCount`, a 15 s window per question, the shared `Scoring`, server receive time only, first answer counts, late answers rejected, `QuestionView` without any answer field, and one `QUESTION_REVEALED` per question carrying every participant's pick, correctness, points and running total
**And** the question closes early once every room participant still in the match has answered (Story 1.11), but `ANSWER_ACCEPTED` stays receipt-only in rooms: no player learns correctness or the answer before the question closes
**And** the Battle Room reveal hold is 3 s (configurable per mode), long enough for the scoreboard movement and the overtake peak [ASSUMPTION: 3 s for rooms, 2 s kept for 1v1]

**Given** answers arrive during a window
**When** the actor broadcasts `SCOREBOARD`
**Then** it lists only which participants have answered the current question (never what or whether correct), coalesced to at most one broadcast per 250 ms in rooms, so a load test with a 50-player room shows `SCOREBOARD` and `QUESTION_REVEALED` reaching clients within 500 ms of the triggering event and answer acceptance p95 under 200 ms [ASSUMPTION: coalescing window]

**Given** the Battle Room live screen
**When** a question is open
**Then** it is full screen with no tab bar; the timer line, seconds label and "ചോദ്യം 6 / 15" are sticky (≤ 48px); a header line reads "ബാറ്റിൽ റൂം · <topic>" / "Battle Room · <topic>" beside the EN tag; the answered meter, question, options A–D with commit-on-lift (Story 1.8) and the scoreboard follow in normal flow; the whole answering state is monochrome
**And** the answered meter is a 4px ink bar on hairline with "17 / 23 ഉത്തരം നൽകി" (M = participants not forfeited), updating on every `SCOREBOARD` with no animation, exposed as a focusable `role="meter"` with `aria-valuetext` and never a live region

**Given** the scoreboard
**When** it renders
**Then** it shows the top 8 rows, then the player's own row after a "···" gap mark when she is outside them, then "+N പേർ കൂടി · മുഴുവൻ കാണാം / +N more · See all" which expands the full list [ASSUMPTION: top 8 plus own row]
**And** each row (card, min-height 47px) shows rank, unchanged name (the player's own as "നിങ്ങൾ"), running score in tabular grouped digits and an answered dot (● ink when answered, ○ 1.5px unanswered ring when not), flipping with no animation; ranks come from the `contracts` `Ranking` over running totals, so equal totals and correct counts share a rank
**And** each row's accessible name includes rank, name, score and "answered" / "not answered yet", the glyphs are `aria-hidden`, and the list is never a live region

**Given** a `QUESTION_REVEALED`
**When** the scoreboard updates
**Then** scores and order change within 500 ms of the reveal; rows whose rank fell show "▼ n" with full-opacity text and rows whose rank rose show "▲ n", each with a text equivalent ("down 1 place")
**And** the player's own reveal band (correct with strike, or wrong naming the answer) is the Story 1.8 band, shown above the scoreboard

**Given** the player's own rank improved in this reveal
**When** her row moves
**Then** it jumps to its new slot (overtake-jump 180 ms, easing-overtake), takes band fill with volt rank, score and the subline "▲ <passed name> · മറികടന്നു" (min-height 56px), where the passed name is the player now directly below her who was above her before, and a one-shot zig-zag ink crack is drawn between her row and that row, fading after 1200 ms; her row stays ink until the next question starts
**And** when she is passed instead, a muted crack is drawn and her row stays white with "▼ n"; only her own row ever gets a crack, however many ranks change in that reveal
**And** the overtake peak goes through the flash scheduler after her reveal strike, so no two flashes start within 1000 ms; under reduced effects there is no jump, crack or volt flood and rows swap with a 200 ms fade
**And** her rank change is announced politely once per reveal ("Up to 2nd, passed Arjun K" / "Down to 4th"), with names unchanged

**Given** a room participant drops, returns or taps Leave mid-match
**When** the match actor handles it
**Then** the Story 1.9 rules apply unchanged: 10 s grace with the reconnect banner and a `SNAPSHOT` (now also carrying `roomId`, `questionCount` and the scoreboard), forfeit after 10 s or at once on confirmed Leave, the match continuing for everyone else, and the forfeiter keeping the score she earned
**And** this applies to the host too: the host leaving mid-match forfeits like anyone else and never ends the match for the others

**Given** every human has forfeited or left before Q1 is revealed
**When** the actor sees this
**Then** the match is aborted: nothing is published, the completed-vs-aborted counter-metric records it as aborted (its only trace, FR65), the room goes to `ENDED` with a tombstone, and any still-connected client returns Home with the one-line notice that the match did not count, announced politely

**Given** the final question has been revealed (or every human has gone after Q1's reveal)
**When** the match ends
**Then** the room goes to `ENDED`, its code expires at once with a tombstone, and the Story 1.10 `MATCH_ENDED` is sent; in this story the client shows an interim final standings list (rank, name, score) with Home, and `minnal.match.completed` is not yet published for `BATTLE_ROOM` matches (a mode switch that Story 5.5 turns on; Story 5.5 also replaces the interim standings) [ASSUMPTION: results and rating ship in Story 5.5]
**And** a room whose 24 h `expiresAt` passes during a match is not cut short; it expires when the match ends

**Given** a late join
**When** any player sends `/app/room/join` for a room in `IN_MATCH`
**Then** she gets `ROOM_STARTED` and is never added to the match

**Given** game-service is draining
**When** a host taps Start
**Then** the start is refused with `SERVER_DRAINING` and the room stays in `LOBBY`; room matches already running play to completion within the 5-minute drain

**Given** the live screen at 320 CSS px at 100%, and at 360 px with 200% text, on a 2 GB Android phone
**When** a 50-player room plays
**Then** there is no horizontal page scroll or clipped text, only transform and opacity are animated, the live-match font face uses `font-display: optional`, focus moves to the question heading on each question ("ചോദ്യം 6 / 15, 15 സെക്കൻഡ്"), and `document.title` updates per question

### Story 5.5: Battle Room results and podium

As a student who has just finished Rajeev sir's room,
I want to see the podium, where I placed among everyone and how my Battle Room rating moved,
So that the end of the race feels like a moment the whole batch shares.

**Requirements:** FR58, FR77, FR39 (bank rooms rated; unrated custom rooms in Epic 6), FR53, FR54, FR57, FR7 (Battle Room rating on the trio), FR8 (history), FR59, FR60 (Battle Room boards), FR14 (report link on breakdown rows), FR43 ("Practise this topic"), NFR8, AD-8, AD-10, AD-14 (`POST_MATCH`), AD-15, AD-17, AD-18, Additional Requirements: Event streams & contracts (`minnal.match.completed` with `roomId`), UX-DR38, UX-DR39, UX-DR41, UX-DR42, UX-DR43 (Home; Play again in Story 5.6; Share in Epic 7), UX-DR45, UX-DR47 (rehydrate), UX-DR57, UX-DR59, UX-DR61, UX-DR83, UX-DR84, UX-DR86, UX-DR87, UX-DR88, UX-DR89, UX-DR95, UX-DR96

**Acceptance Criteria:**

**Given** a completed room match
**When** the actor sends `MATCH_ENDED` (Story 1.10 shape)
**Then** it carries every participant with `placement` from the `contracts` `Ranking` (score desc, then correct count desc, else a shared placement with standard competition ranking 1, 1, 3), plus an additive `room {roomId, hostParticipantId}` and the `topic` block, and the actor enters `POST_MATCH` for 60 s
**And** `Ranking` tests cover a 3-way tie for first, a tie for third and a forfeiter ranked on earned score in a 23-player field

**Given** the same completed match
**When** game-service publishes (turning on the Story 5.4 switch)
**Then** exactly one `minnal.match.completed` is added with `mode: BATTLE_ROOM`, `roomId`, `questionSource: BANK`, `rated: true`, `queueWaitMs` null and every participant as `kind: USER`; an aborted room match publishes nothing
**And** ratings-service (Story 2.5, formula unchanged) rates each participant pairwise against every other with K = 32/(N−1), updates only the `BATTLE_ROOM` rating, writes `match_record` rows and publishes `rating.updated` with mode `BATTLE_ROOM` (end-to-end test with a 4-player room including a tie and a forfeiter), and her Quick Match and Topic Duel ratings are untouched
**And** for N > 2 the `match_record.result` is `WIN` for a sole placement 1, `DRAW` for a shared placement 1 and `LOSS` otherwise [ASSUMPTION: N-player result mapping]

**Given** a player is the sole #1
**When** results open
**Then** the Story 1.10 win takeover plays ("ജയിച്ചു! / You won!", her score in volt, the #2 score muted, the delta on the band-raised panel), starting at least 1000 ms after the last reveal's strike, then collapses into the compact band and the podium

**Given** two or more players share placement 1 with a score above 0
**When** results open for each of them
**Then** each tied player sees a joint-win takeover with the title "ഒപ്പത്തിനൊപ്പം ജയം! / Joint win!" (ML flagged TBD), her score in volt and the co-winners' names (unchanged, up to 2 then "+N"), with the same timing, focus, Continue and reduced-effects rules as the win takeover
**And** when every participant ties at 0 there is no takeover, and each player opens on the settled view with a draw band (FR77)

**Given** a player who is not #1
**When** results open
**Then** she lands straight on the settled view: a compact ink band with no volt reading "#7 of 23" (tabular digits), her score and a grey delta, followed by the podium and the standings

**Given** the podium
**When** it renders
**Then** it shows three card columns ordered 2-1-3 for the first three entries of the standings, #1 tallest, each with its placement numeral, unchanged name and score; tied entries show the same numeral and equal height, and players tied at one placement are ordered by display name for display only [ASSUMPTION]
**And** the player's own column takes band fill (band-dark in dark mode), and her score is volt only when her placement is 1; with exactly 2 players only columns 2 and 1 show
**And** the podium has no GG reactions or any other reaction control

**Given** the full standings below the podium (replacing the Story 5.4 interim final standings list)
**When** they render
**Then** every participant appears as a scoreboard row (placement, unchanged name, score, correct count), forfeited players carry a muted "left" tag, and her own row is marked "നിങ്ങൾ" in an outline tag with no volt
**And** her own place is always visible: the compact band names it, and her row is reachable by a "Show my place" link that scrolls to it and moves focus there

**Given** results have opened
**When** focus lands
**Then** focus moves to the results heading, whose accessible name carries the result ("You came 3rd of 23, 3,960 points, rating +12" or "Joint win with Fathima S, 4,610 points"), and `document.title` names the Battle Room results

**Given** the rating delta
**When** results open for a registered participant
**Then** the client fetches `GET /api/ratings/v1/matches/{matchId}` with the Story 2.6 retry for up to 10 s, then "updating"; it shows as a volt chip only for placement 1 (sole or joint) and as a grey delta otherwise, with no layout shift while it waits

**Given** the breakdown
**When** it renders
**Then** the dot strip and breakdown rows are the Story 1.10 ones with the room's `questionCount` dots, and each expanded row keeps the Story 3.5 report link and the Story 4.4 "Practise this topic" link (bank source), with no overlap between their 48px hit areas

**Given** results are showing
**When** the player reloads
**Then** podium, standings and breakdown rehydrate from the last `MATCH_ENDED` in `sessionStorage`

**Given** the results action bar
**When** it renders
**Then** it shows Home (secondary) for every player, with no Rematch and no Share (Epic 7); the host's Play again is added by Story 5.6

**Given** Home on any Battle Room results screen
**When** a player taps it
**Then** she returns to Home with the tab bar visible and leaves the post-match window

**Given** a registered player who has finished a Battle Room
**When** she opens Me and Ranks
**Then** the rating trio's Battle Room card shows her updated rating, her match history row shows mode "Battle Room" with her placement ("#3") instead of Won / Lost and her delta, and the Ranks Battle Room daily, weekly and all-time boards list her with no ratings-service code change
**And** the Battle Room empty-board primary button loses its "Coming soon" caption and opens the Rooms tab

**Given** the results screen at 320 CSS px at 100%, and at 360 px with 200% text
**When** a 50-player standings list and long names render
**Then** the podium columns wrap names without truncation, there is no horizontal page scroll, and every control keeps its 48px hit area and visible focus ring

### Story 5.6: Play again

As Rajeev sir, the host of a finished room,
I want one tap on Play again to open a new room with the same topic and bring every player along,
So that the next round starts at once without sharing a new code.

**Requirements:** FR56, FR57, FR33 (join errors reused), FR34 (host only), AD-10, AD-14 (`POST_MATCH` `PLAY_AGAIN`, `ROOM_SUCCEEDED`), AD-18, UX-DR43 (Play again / Home; Share in Epic 7), UX-DR47 (rehydrate), UX-DR88, UX-DR96

**Acceptance Criteria:**

**Given** the Story 5.5 results action bar
**When** it renders for the host
**Then** it shows "വീണ്ടും കളിക്കാം / Play again" (primary) and Home (secondary), with no Rematch and no Share (Epic 7)
**And** for every other player it shows Home alone until a successor room arrives

**Given** the host taps Play again within the 60 s `POST_MATCH` window
**When** the client sends `/app/room/{roomId}/playAgain`
**Then** game-service creates a new room in `LOBBY` with the same source and count, the host as its host and a new code, releases the host from the old match's post-match hold, broadcasts `ROOM_SUCCEEDED {code, hostDisplayName, source, questionCount}` on `/topic/match/{matchId}` to every participant still subscribed, and opens the new lobby for the host; the recent-rooms entry is refreshed
**And** a `playAgain` from anyone but the host gets `ERROR NOT_HOST`, a second `playAgain` returns the same successor code, and a host who forfeited but is still on results can still use it [ASSUMPTION]

**Given** a player receives `ROOM_SUCCEEDED`
**When** her results screen updates
**Then** a primary "Join <host name>'s new room" button (name unchanged) appears beside Home, announced politely once; one tap sends the Story 5.3 join with that code, releases her post-match hold and opens the new lobby, and join errors (full, already in a match) show the Story 5.3 inline messages in the action bar

**Given** the 60 s window has passed, or the host left results
**When** the host's results show
**Then** Play again is replaced by "New room", which opens the Story 5.2 Create screen with the same source and count preselected and notifies no one [ASSUMPTION]

**Given** a results screen that has received `ROOM_SUCCEEDED`
**When** the player reloads within the 60 s window
**Then** the `ROOM_SUCCEEDED` stored with that match's `MATCH_ENDED` in `sessionStorage` restores the Join button, and after the window it is dropped

## Epic 6: Rajeev sir brings his own questions

Rajeev sir wants his batch to drill this week's class notes, not only past papers. In Me › Custom Topics he opens Import, copies the sample GPT prompt, generates 15 Kerala Renaissance questions with an LLM and pastes the JSON into a monospace paste area with line numbers. The tally line reads "15 found · 425 / 500" before he imports. Import is rejected with two field-level errors, "Question 7 · options · needs 4 options, has 3" and a bad answer index on Q12; he taps each error to jump to its line, fixes both, and Import enables. The topic saves, nothing half-saved on the way, and a success card offers "Use in Battle Room" and "Practice". His topics live in a private list with a usage meter that warns him at 80% of the 50-topic / 500-question caps; he can read a topic's questions, re-import it to replace them, or delete it, and no other player can ever see it. He practises a topic alone in Solo Practice, then runs it in a Battle Room for his batch: the lobby says up front that the room is "സ്വന്തം · unrated", the question count stops at the topic's size, and the results and every student's match history mark it unrated, while ratings and leaderboards stay untouched. To make this possible, the epic adds core-service's `custom_topic` and `custom_question` tables, a custom-topic import that runs the payload through the shared `QuestionValidator` (Stories 1.4 and 3.2, including the length caps and distinct-option rule) with a custom-topic profile, server-side fair-use caps, the `CUSTOM` branch of `/internal/question-sets` with the AD-12 owner check (`requesterId` must own the topic), the `CUSTOM` source in Solo Practice and in the room source, and the Custom Topics screens under the Me tab. It builds on the Solo Practice tagged source (Story 4.3), the room source and its `SOURCE_NOT_AVAILABLE` placeholder (Story 5.1), the room start fetch and its `ROOM_START_FAILED` path (Story 5.4), the `rated` flag on `minnal.match.completed` (AD-8, Story 1.10) and its unrated handling in ratings-service (Story 2.5) and history (Story 2.6), the report link and "Practise this topic" rules that already hide for custom questions (Stories 3.5 and 4.4), the Valkey token buckets (Story 3.3), the shared import error list (Story 3.3) and the topic picker (Story 4.1). The epic leaves out sharing custom topics with other players (not in MVP: topics are private), editing single questions in place (edits are by re-import), bilingual custom questions (each question is in the language it was written in), and the share card (Epic 7).

### Story 6.1: Custom-topic import API

As Rajeev sir, a registered player who teaches a PSC batch,
I want core-service to check my pasted JSON completely and save the topic only when all of it is right,
So that I never end up with a half-imported topic or one that breaks my fair-use allowance.

**Requirements:** FR46, FR47, FR51 (server-side caps), FR3 (registered-only), FR48 (owner-scoped storage), FR11 / question-content.md (custom questions single-language as written), NFR11 (rate-limited custom-topic import), NFR13, AD-1, AD-3, AD-12 (shared validator), Additional Requirements: Service boundaries & data, Security implementation (per-user token buckets; custom-topic caps enforced in core-service), API conventions

**Acceptance Criteria:**

**Given** core-service's own Flyway sequence (this migration takes the next free `V<n>` when it merges and depends only on the `app_user` table from Story 2.1, not on any other epic's migrations)
**When** Flyway migrates
**Then** it creates only `custom_topic` (`id` UUID, `owner_user_id` with a foreign key to `app_user` in the `core` schema, `name`, `name_key` (NFC, trimmed, case-folded), `question_count`, `revision` starting at 1, `created_at`, `updated_at`; unique `(owner_user_id, name_key)`; index on `owner_user_id`) and `custom_question` (`id` UUID, `custom_topic_id` with a foreign key and `ON DELETE CASCADE`, `position` 1…n, `text`, `lang` (`ml | en`), `options` as 4 text columns, `answer_index` 0–3, `explanation`; unique `(custom_topic_id, position)`)
**And** no other table is created or altered, and neither table is ever read by the bank catalogue (Story 4.1), the admin console (Epic 3) or the bank branch of `/internal/question-sets`

**Given** the shared `QuestionValidator` (Stories 1.4 and 3.2)
**When** this story adds a `CUSTOM_TOPIC` profile to it
**Then** that profile checks question text (non-blank, ≤ 1,000 characters), exactly 4 non-blank options (each ≤ 300), distinct options after trim and case-folding, `answer` an integer 0–3, and a non-blank explanation (≤ 2,000), all after NFC normalisation, and skips the bank-only fields (category, subject, topic, exam level, difficulty, attribution); every problem is returned as a field-level error, never only the first one
**And** there is still exactly one validator component; the table-driven tests gain cases for the custom profile, including Malayalam text with chillu and ZWJ, and the admin profile's behaviour is unchanged (existing tests pass untouched)

**Given** a `USER` token with a completed profile
**When** the client calls `POST /api/core/v1/me/custom-topics {name, json}`, where `json` is the raw pasted text
**Then** core parses it with a strict JSON parser that records line and column, maps it to the FR46 schema `{ "topic": string, "questions": [{ "question", "options"[4], "answer", "explanation" }] }`, runs every question through the validator, checks the caps, and on success stores the topic and all its questions in one transaction and returns `201 {customTopicId, name, questionCount, revision, usage}`
**And** `name` comes from the request (the screen prefills it from `"topic"`), must be 1–80 characters after trim, and a name already used by one of her topics (same `name_key`) gets a field error "You already have a topic called '<name>'" [ASSUMPTION: names unique per owner]; a missing `"topic"` key is accepted when `name` is filled, and a `"topic"` that is not a string is a schema error [ASSUMPTION]
**And** unknown extra keys on the root or on a question are ignored, because LLM output often adds `id` or `difficulty` [ASSUMPTION]

**Given** an import that fails in any way (JSON syntax, schema, a field rule, zero questions, a cap, the name, or a database error)
**When** core answers
**Then** nothing is stored: no `custom_topic` row, no `custom_question` row and no change to her usage (integration test for each failure class, including a failure on the last of 500 questions)
**And** validation failures return `400` Problem Details with `errors[{item?, field, problem, fix, line?, column?}]`, where `item` is the 1-based question number and `line` is where that question (or the failing field's value) starts in the pasted text; a JSON syntax error returns one error with `line`, `column` and a likely cause ("Missing comma or closing bracket before line 41, column 3")

**Given** each question as it is stored
**When** core saves its text
**Then** it sets `lang = ml` when the question text has more Malayalam-script letters (U+0D00–U+0D7F) than Latin letters and `lang = en` otherwise, and stores the text exactly as written (NFC only); a custom question is never translated and has no second language [ASSUMPTION: majority-script detection]

**Given** the fair-use caps (50 topics, 500 questions per user, configuration values read in one place)
**When** an import would make her topic count exceed 50 or her total question count exceed 500
**Then** core rejects it with `422` Problem Details `type …/custom-topic-cap`, naming the cap and the overshoot ("This import has 40 questions. You have 25 of 500 left, so remove 15 questions or delete an old topic."; "You have 50 of 50 topics. Delete one to import a new topic."), and stores nothing
**And** the cap check and the insert run in one transaction that locks her `app_user` row, so two imports sent at once can never pass the caps together (concurrency test) [ASSUMPTION: row lock]
**And** `usage` in every response is `{topics, topicCap: 50, questions, questionCap: 500, warn}`, where `warn` is true at 80% or more of either cap, and `GET /api/core/v1/me/custom-topics/usage` returns the same block

**Given** the import endpoint
**When** a player sends imports quickly
**Then** the Story 3.3 token bucket guards it under `core:rl:custom-import:{userId}` with capacity 20 and a refill of 20 per hour [ASSUMPTION: limit], an empty bucket gets `429` with `Retry-After`, and a request body over 1 MB gets `413` Problem Details "Paste is too large (over 1 MB). Split it into smaller topics." [ASSUMPTION: size cap]
**And** a `GUEST` token gets `403`, no token gets `401`, and a profile that is not set up gets `403 PROFILE_REQUIRED`

### Story 6.2: Import screen

As Rajeev sir, a registered player who teaches a PSC batch,
I want to paste a JSON set of questions, see exactly what is wrong with it before anything is saved, and get a private topic when it is right,
So that I can turn questions I generated with an LLM into a topic my students can play, without learning a tool or fixing a half-imported mess.

**Requirements:** FR46 (paste area and name prefill), FR47 (field-level errors shown), FR51 (80% warning in the tally), FR52, FR3 (guests see the row locked with a sign-in path), NFR14, NFR15, UX-DR14 (Import disabled with caption), UX-DR16, UX-DR22 (locked row for guests), UX-DR64, UX-DR65, UX-DR66, UX-DR67, UX-DR68, UX-DR86, UX-DR88 (copy and error announcements), UX-DR89, UX-DR91, UX-DR92 (Malayalam shaping fixture in custom topics), UX-DR94 (script detection), UX-DR96 (import error strings; GPT prompt ML flagged TBD)

**Acceptance Criteria:**

**Given** a registered player on the Me tab
**When** it renders
**Then** it shows a "സ്വന്തം ടോപ്പിക്കുകൾ / Custom Topics" row between Profile and Settings, which in this story opens the Import screen at `/me/custom-topics/import` directly [ASSUMPTION: Story 6.3 puts the topic list in front of it]
**And** a guest's Me tab shows the same row locked in the Story 1.5 locked-row pattern (muted title, half-opacity icon, lock + "Sign in" label, an accessible name saying it needs sign-in); tapping it, or opening the route directly, opens the Sign-in prompt with `returnTo` set to the Import route (FR3)

**Given** the Import screen
**When** it renders
**Then** it shows a labelled "Topic name" text field, a JSON paste area (card, control-edge border, code typography, no soft-wrap, a line-number gutter kept in step with the text, horizontal scroll inside the area only, `lang` left unset so Malayalam shapes in the fallback face), a muted tally line under it, the disclosure rows, and a fixed bottom bar with the Import button; the whole screen is calm: no volt, ink as the only emphasis, brick only on error text
**And** `document.title` reads "ഇംപോർട്ട് · മിന്നൽ" / "Import · Minnal", and the paste area's accessible name is "Questions JSON"

**Given** the player pastes or types in the paste area
**When** the text changes (debounced 300 ms)
**Then** the client parses it with the same strict rules (in a lazily loaded chunk outside the initial bundle), prefills the topic name from `"topic"` only while the name field has not been edited, mirrors the validator rules in TypeScript, and updates the tally line: "15 ചോദ്യം കണ്ടെത്തി · ശേഷം 425 / 500" / "15 found · 425 / 500 after import", with the counts in bold ink and tabular digits [ASSUMPTION: client mirror of the validator, server authoritative]
**And** a single wrapping Markdown code fence (```` ```json … ``` ````) around the JSON is stripped before parsing and line numbers still refer to the pasted text [ASSUMPTION: LLM chat output often arrives fenced]
**And** at 80% or more of either cap after this import, a "!" line (18px ink circle) under the tally gives the headroom ("After this you'll have 25 questions left"); over a cap, the tally names the cap and the overshoot and Import stays disabled

**Given** local validation finds problems
**When** the error state shows
**Then** the import error list (Story 3.3 pattern) renders above the paste area: a `role="alert"` card linked to the paste area by `aria-describedby`, whose heading counts the problems as a goal ("2 തെറ്റുകൾ തിരുത്തിയാൽ ഇംപോർട്ട് ചെയ്യാം / Fix 2 problems to import"), then one row per problem "ചോദ്യം 7: 4 ഓപ്ഷനുകൾ വേണം, 3 എണ്ണമേ ഉള്ളൂ / Question 7 needs 4 options; it has 3" with ⚠, brick text, the fix, and a monospace field-name tag (`options`); rows are at least 48px tall
**And** the paste area takes the error variant (1.5px brick border) and each bad line gets a 3px brick gutter rule and a bold brick line number, other line numbers muted; more than 20 problems shows the first 20 grouped by field with "Download all problems (CSV)"
**And** the error list takes focus only when Import is tapped or when the server returns errors, never on every keystroke; while typing, the count updates silently and the polite region announces the count once after typing pauses

**Given** an error row
**When** the player taps it
**Then** the paste area scrolls to that line, places the caret at its start (at the reported column for a syntax error), marks the line, and moves focus into the paste area; the row's accessible name includes the line number ("Question 7, options, line 41")

**Given** the Import button
**When** local validation has not passed, the name is empty, or a cap would be exceeded
**Then** it is button-disabled (`aria-disabled`, still focusable) with a caption saying why ("Fix 2 problems to import" / "Add a topic name" / "Over the 500-question limit"); when everything passes it is enabled and reads "ഇംപോർട്ട് · 15 ചോദ്യം / Import · 15 questions"
**And** tapping it shows "…" and ignores further taps until the server answers; the server re-validates, and any `400` or `422` it returns renders through the same error list with focus on it, keeping the pasted text

**Given** the disclosure rows below the paste area
**When** the screen opens
**Then** "JSON ഘടന / JSON format" is expanded and "മാതൃകാ GPT പ്രോംപ്റ്റ് / Sample GPT prompt" is collapsed; both collapse while the error list is showing, so the errors stay on screen; each row has a ▸/▾ ink chevron, a 48px header with `aria-expanded`, and a "കോപ്പി / Copy" text link that copies the block, shows "Copied" inline for 2 s and announces it once
**And** the schema block shows the FR46 JSON shape from question-content.md with one line per rule (at least 1 question; exactly 4 options; `answer` 0 = first option … 3 = fourth; explanation required; the length limits; questions stay in the language you write them in) in a tile-background, sm-radius, ink-soft monospace code block

**Given** the sample GPT prompt block
**When** it is shown or copied
**Then** its English text is exactly the following, with `[TOPIC]` replaced by the topic name field's value when it is filled [ASSUMPTION: prompt wording, pending content sign-off]; the Malayalam UI shows the same English prompt with a Malayalam heading until a Malayalam version is signed off (ML translation TBD):

```text
Write [NUMBER, e.g. 15] multiple-choice questions for Kerala PSC exam practice on the topic "[TOPIC]".
Write every question, option and explanation in [Malayalam / English].

Rules:
- Each question has exactly 4 options, and exactly one of them is correct.
- "answer" is the position of the correct option: 0 = first, 1 = second, 2 = third, 3 = fourth.
- No two options in a question may be the same. Do not use "All of the above" or "None of the above".
- Each question has a short explanation (1-2 sentences) of why the answer is correct.
- Use only facts you are sure of. Keep each question under 1000 characters and each option under 300.

Reply with only the JSON below and nothing else - no notes and no code block:
{"topic": "[TOPIC]", "questions": [{"question": "...", "options": ["...", "...", "...", "..."], "answer": 0, "explanation": "..."}]}
```

**And** a muted line under the prompt reads "Check every answer before you use it. AI makes mistakes." (ML flagged TBD)

**Given** a successful import
**When** the `201` returns
**Then** the screen is replaced by the success card: a 28px ink circle with a white ✓, the title "<topic> · 15 ചോദ്യം ഇംപോർട്ട് ചെയ്തു / <topic> · 15 questions imported", a muted line "Private to you · never rated", and actions at 2fr / 1fr: button-primary "Use in Battle Room" and button-secondary "Practice"; no volt, and no usage meter on this view
**And** in this story both actions are button-disabled with the caption "Practice and Battle Room arrive soon" [ASSUMPTION: stub, enabled by Stories 6.4 and 6.5], and an "Import another" text link opens a fresh Import screen; focus moves to the success heading and the result is announced politely once

**Given** the Import screen with a draft in the paste area
**When** the player leaves it (Back, a tab, or closing the page) without importing
**Then** the client asks for confirmation (in-app confirm for route changes, `beforeunload` for closing), and the draft is kept in `sessionStorage` so an accidental reload restores it [ASSUMPTION]

**Given** the Import screen at 320 CSS px at 100%, and at 360 px with 200% text, in both languages, with the Malayalam shaping fixture (ക്ഷ, ന്റ, ത്ത്ര and chillu) pasted
**When** it renders
**Then** the page has no horizontal scroll (only the paste area scrolls sideways), Malayalam in the paste area, tally and error rows shapes correctly, every control has a 48px hit area and visible focus ring, offline the Import button is `aria-disabled` with the offline caption, and the player bundle stays within the Story 1.3 budget

### Story 6.3: Manage my custom topics

As Rajeev sir,
I want a private list of my topics with how much of my allowance I have used, and to read, replace or delete any of them,
So that I can keep my topics in step with my lessons without anyone else ever seeing them.

**Requirements:** FR48, FR49, FR51 (warning and caps on re-import), FR47 (re-import validation, nothing saved on failure), FR52 (schema and prompt on the empty state), FR3, FR9 / NFR20 (account deletion removes custom topics), NFR11, NFR13, NFR14, AD-3, AD-12 (owner-only), AD-16, UX-DR13, UX-DR16, UX-DR62, UX-DR63, UX-DR64, UX-DR66 (both expanded on the empty state), UX-DR67, UX-DR72, UX-DR81 (Custom Topics empty state), UX-DR86, UX-DR88, UX-DR89, UX-DR91, UX-DR93, UX-DR94, UX-DR96

**Acceptance Criteria:**

**Given** a `USER` token
**When** the client calls `GET /api/core/v1/me/custom-topics`
**Then** it returns `{usage, topics[{customTopicId, name, questionCount, updatedAt}]}` for her topics only, newest `updatedAt` first, with `usage` as in Story 6.1
**And** no other endpoint in any service lists, searches, counts or ranks another player's custom topics; ratings-service and leaderboards hold no custom-topic data (architecture test: no ratings or game code reads `custom_topic`)

**Given** a topic id that does not exist or belongs to another user
**When** any `/api/core/v1/me/custom-topics/{customTopicId}` endpoint is called
**Then** it gets `404` Problem Details, identical in body and timing class for "not yours" and "does not exist", so the endpoint never confirms that someone else's topic exists (test with two users) [ASSUMPTION: 404, not 403]
**And** a `GUEST` token gets `403` and no token gets `401` on every Custom Topics endpoint

**Given** the Me tab's Custom Topics row
**When** a registered player taps it
**Then** it opens the list at `/me/custom-topics` (replacing Story 6.2's direct route to Import), with a heading, the usage meter, a list header "നിങ്ങൾക്ക് മാത്രം · ഒരിക്കലും റേറ്റഡ് അല്ല / Private to you · never rated", topic rows and an "Import topic" button-primary; `document.title` reads "സ്വന്തം ടോപ്പിക്കുകൾ · മിന്നൽ" / "Custom Topics · Minnal"

**Given** the usage meter
**When** it renders
**Then** it is a card with a one-line tally of both caps ("12 / 50 ടോപ്പിക് · 410 / 500 ചോദ്യം") in tabular digits and one 4px bar per cap (ink on hairline) with label and value, each exposed as `role="meter"` with `aria-valuetext` ("410 of 500 questions")
**And** at 80% or more of either cap it switches to the warning variant: 1.5px ink outline plus a "!" line (18px ink circle) giving the headroom and a way out ("90 questions left · delete an old topic to make room"); it is monochrome, never brick or volt, and it updates at once after an import, re-import or delete

**Given** a topic row
**When** it renders
**Then** it follows the mode-entry-row pattern: min-height 56px, the topic name (wrapping, never truncated, `lang` by script), a muted subline "15 ചോദ്യം · 11 Nov" (IST date), and a dim chevron; its accessible name reads name, question count and date

**Given** a player with no custom topics
**When** the list opens
**Then** it shows one plain line in voice ("No topics yet. Paste your questions as JSON to make one.", ML flagged TBD), the usage meter at 0, the "Import topic" button, and the schema reference and sample GPT prompt disclosure rows from Story 6.2, both expanded, each with its copy link

**Given** the player taps a topic row
**When** the topic view opens at `/me/custom-topics/{customTopicId}`
**Then** `GET /api/core/v1/me/custom-topics/{customTopicId}` returns `{customTopicId, name, questionCount, revision, updatedAt, questions[{position, text, lang, options[4], answerIndex, explanation}]}` and the view shows the name, "15 questions · updated 11 Nov", the usage meter, the actions Practice and Use in Battle Room (button-disabled with the caption "Practice and Battle Room arrive soon" until Stories 6.4 and 6.5), then Re-import and Delete
**And** below them every question shows as a card with its number, the question text, options A–D with the correct one marked by an ink ✓ tile and bold text (plus its text equivalent "correct answer"), and the explanation; each text container carries the stored `lang`; the first 50 render at once and "Show 50 more" loads the next ones [ASSUMPTION: 50 per page on a 2 GB phone]
**And** the Story 6.2 success card now lands on this view, with the success card above the actions and the meter dropped from the view while the success card shows

**Given** the topic view
**When** the player taps "Re-import"
**Then** the Import screen opens in re-import mode at `/me/custom-topics/{customTopicId}/reimport`, titled "Replace questions · <topic>", with the name field prefilled with the current name and the paste area prefilled with the topic's current questions as FR46 JSON (so he can edit and re-import), plus a muted line "Importing replaces all 15 questions in this topic" [ASSUMPTION: prefilled JSON as the edit path]
**And** the tally line counts usage as if the old questions were removed ("18 found · 413 / 500 after import"), and a "Copy JSON" link copies the current JSON with an inline "Copied"

**Given** a re-import
**When** the client calls `PUT /api/core/v1/me/custom-topics/{customTopicId} {name, json}`
**Then** core runs the Story 6.1 parse, validation, name and cap checks, counting the topic's current questions as freed, and on success, in one transaction holding the same user-row lock, deletes the old `custom_question` rows, inserts the new ones, sets `question_count`, increments `revision` and sets `updated_at`, returning `200` with the topic and `usage`
**And** any failure (syntax, field, cap, name, database) leaves the old name and questions exactly as they were and returns the same error format, rendered in the same error list (integration test); the shared `custom-import` token bucket applies

**Given** the topic view
**When** the player taps "Delete"
**Then** a centred `role="alertdialog"` asks "Delete '<topic>'? Its 15 questions will be removed. This can't be undone.", with focus on "Cancel" (button-primary), a brick "Delete" text button, and Esc or Android back meaning Cancel
**And** on Delete the client calls `DELETE /api/core/v1/me/custom-topics/{customTopicId}`, core removes the topic and its questions (cascade) and returns `204` with nothing kept, the list opens with the meter updated and the one-line notice "'<topic>' deleted", announced politely; deleting a topic that is already gone returns `404` and the list just refreshes

**Given** the account-deletion transaction from Story 2.8
**When** a player deletes her account
**Then** the same transaction also deletes all her `custom_topic` rows and, by cascade, their `custom_question` rows (test extended), so no custom topic outlives its owner

**Given** a topic or list request that fails
**When** the network or a `5xx` fails
**Then** the list or view shows skeleton rows while loading (no shimmer under reduced effects, no bare spinner past 1 s), an inline error with the Problem Details `detail` and Retry on failure, and offline a cached view stays readable while Import, Re-import and Delete are `aria-disabled` with the offline caption

**Given** the list and topic view at 320 CSS px at 100%, and at 360 px with 200% text, in both languages
**When** a 500-question topic and long Malayalam names render
**Then** text wraps without truncation, there is no horizontal page scroll, every control has a 48px hit area and visible focus ring, and the custom-topic screens stay out of the initial player bundle (lazy route)

### Story 6.4: Practise a custom topic

As Rajeev sir, or any registered player with her own topics,
I want to run Solo Practice on one of my custom topics,
So that I can check my own questions and drill them at my own pace before I use them with my batch.

**Requirements:** FR43 (custom part), FR50 (Solo Practice source), FR44, FR45, FR48 (owner-only), FR62, FR14 (no report link on custom questions), FR11 / UX-DR93 (written language kept), FR3, NFR10, NFR13, NFR14, AD-5, AD-12, UX-DR26, UX-DR27, UX-DR32 (no source line or report link for custom), UX-DR33, UX-DR68 (Practice action), UX-DR78 (My topics in the picker), UX-DR79, UX-DR88, UX-DR89, UX-DR93, UX-DR94

**Acceptance Criteria:**

**Given** a `USER` token
**When** the client calls `POST /api/core/v1/solo/sessions {source: {type: "CUSTOM", customTopicId}}`
**Then** if she owns the topic and it has at least 1 question, core shuffles the topic's question ids, stores a Story 4.3 session whose `source` is `{type: "CUSTOM", customTopicId, revision}`, and returns `201 {sessionId, source: {type: "CUSTOM", customTopicId, topicName}, poolSize}`; the `422 "custom source not available"` placeholder from Story 4.3 is removed
**And** a topic she does not own or that does not exist gets `404` (no difference between the two), and there is no 10-question threshold for a custom topic: a 1-question topic can be practised [ASSUMPTION: minimum 1, since nothing is rated or matched]
**And** the `BANK` source behaves exactly as before (Story 4.3 tests pass untouched)

**Given** a custom session
**When** the client calls `next`
**Then** it returns the Story 4.3 shape with `question: QuestionView{questionId, version, textMl?, textEn?, options[4]}`, where `questionId` is the `custom_question` id, `version` is the topic's `revision`, and the text goes in `textMl` when the stored `lang` is `ml` and in `textEn` otherwise, the other field null; no answer, explanation or correctness field is in it (serialization test, AD-5)
**And** within one cycle no question repeats, after the last one the pool reshuffles with `reshuffled: true`, and a 1-question topic serves that same question again each cycle

**Given** a custom session
**When** the player answers
**Then** the answer response is the Story 4.3 one with `attribution` always null, and nothing about the session publishes an event, calls another service or touches a rating, match record or leaderboard (integration test asserting the ratings tables and board keys are unchanged)

**Given** the owner re-imports the topic while a session is open
**When** the client next calls `next` or `answers`
**Then** core sees the stored `revision` no longer matches: an answer to the old `current` gets `409 …/topic-changed`, and `next` rebuilds the pool from the current questions, stores the new revision and returns the first question with `reshuffled: true`; the client shows the one-line notice "This topic was updated. Starting again with its new questions.", announced politely once, and keeps the tally [ASSUMPTION]
**And** when the topic has been deleted, every session call gets `404` and the client shows "This topic was deleted" with the last tally and a "Choose another topic" button

**Given** the topic picker opened with `?for=solo` (Story 4.1)
**When** a registered player who owns custom topics opens it
**Then** a "എന്റെ ടോപ്പിക്കുകൾ / My topics" section shows above the bank subjects with one row per custom topic (name, muted "15 questions · private", dim chevron, mode-entry-row pattern), loaded from `GET /api/core/v1/me/custom-topics`; the picker gains `sources: [BANK, CUSTOM]` for this purpose only, and Topic Duel callers still get `BANK` only (test)
**And** search filters My topics rows too; with no custom topics the section is hidden; tapping a custom row does not write a recent topic and routes to `/practice/custom/{customTopicId}`

**Given** the topic view and the Story 6.2 success card
**When** they render for the owner
**Then** their "Practice" action is enabled (replacing the stub caption) and starts a custom session, opening the Solo Practice screen; "Use in Battle Room" keeps its stub until Story 6.5

**Given** the Solo Practice screen on a custom topic
**When** a question renders
**Then** it is the Story 4.3 screen with the topic name and a "സ്വന്തം" outline tag in the header, the question shown in the language it was written in whatever the UI language, the question, option and explanation containers carrying `lang` from the stored script, and no EN tag (there is no other language to show)
**And** after an answer the explanation shows with no source line (neither an attribution nor "ഉറവിടം ലഭ്യമല്ല") and no "തെറ്റുണ്ടോ?" report link, because the questions are the player's own [ASSUMPTION: no source line for custom questions]; there is no "Practise this topic" link anywhere on it
**And** `document.title` reads "പരിശീലനം · <topic> · മിന്നൽ" / "Practice · <topic> · Minnal", and Stop, the summary card, reload resume and the offline and error states behave as in Story 4.3, with "Practise again" starting a new custom session

**Given** a `GUEST` token, or a guest opening `/practice/custom/{customTopicId}`
**When** it reaches the server or the route
**Then** the server answers `403` and the route shows the Sign-in prompt with `returnTo` set to it; no session is created

### Story 6.5: Battle Room with a custom topic

As Rajeev sir,
I want to run a Battle Room on one of my own topics, clearly marked as unrated,
So that my whole batch can race on this week's lesson without anyone's rating being decided by questions I wrote.

**Requirements:** FR35 (custom source), FR39 (unrated custom rooms, still in match history), FR50 (Battle Room source), FR76 (custom room cap: at least 5 questions, count capped at the topic's size), FR48 (owner-only via AD-12), FR56 (Play again keeps the custom source), FR62, FR8 (history shows unrated), FR14 (no report link on custom questions), FR3, NFR8, NFR13, AD-2, AD-8, AD-10, AD-12, AD-14, AD-15, Additional Requirements: Service boundaries & data (`/internal/question-sets` `CUSTOM`), Event streams & contracts (`questionSource: CUSTOM`, `rated: false`), UX-DR39 (no delta for unrated), UX-DR42 (breakdown without report link), UX-DR48 (recently hosted with a custom source), UX-DR51 (സ്വന്തം tag and unrated note), UX-DR68 ("Use in Battle Room"), UX-DR78, UX-DR88, UX-DR94, UX-DR96

**Acceptance Criteria:**

**Given** game-service calls `POST /internal/question-sets {source: CUSTOM, customTopicId, count, requesterId}` with the internal service token
**When** core handles it
**Then** if `requesterId` owns the topic and it has at least `count` questions, it returns exactly `count` distinct questions drawn at random from that topic as `{questionId, version: revision, textMl?, textEn?, options, answerIndex, explanation, attribution: null, topicId: null}` plus an additive `customTopic {customTopicId, name}` block, and the `422 "custom source not available"` placeholder from Story 1.4 is removed
**And** a topic not owned by `requesterId` or not existing gets `404`, fewer than `count` questions gets `422` (never a short set), and a `CUSTOM` request with a `filters` block or without `customTopicId` gets `400` (contract tests in `contracts`, JSON round-trip for the new block)

**Given** the room source in `contracts` (Story 5.1)
**When** this story adds the custom variant
**Then** a room `source` may be `{type: "CUSTOM", customTopicId, topicName}`, the room's `rated` is derived as false for it, and `ROOM_JOINED`, `ROOM_LOBBY_UPDATED`, `ROOM_SUCCEEDED`, `ROOM_MATCH_STARTED`, `MATCH_ENDED` and `SNAPSHOT` carry the source and `questionSource: CUSTOM` without changing any existing field
**And** `/app/room/create` and `/configure` accept `CUSTOM` (the `SOURCE_NOT_AVAILABLE` placeholder is removed), with a missing or non-UUID `customTopicId` getting `ERROR INVALID_TOPIC` and a count outside 5–30 getting `INVALID_ROOM_CONFIG`; game-service still makes no call to core in the lobby (AD-2), so ownership and size are checked only at start
**And** Quick Match and Topic Duel have no custom path: a matchmaking join carrying a custom source gets `ERROR INVALID_TOPIC` and the matchmaking actor can only request `BANK` sets (architecture test)

**Given** the host starts a room with a custom source
**When** the room actor fetches the set (Story 5.4)
**Then** it sends `source: CUSTOM`, the `customTopicId`, `count: questionCount` and `requesterId` = the host's user id, takes the topic name from the `customTopic` block, and on success starts the match exactly as in Story 5.4
**And** when core answers `404` (the host deleted the topic, or the source names a topic she does not own) the room returns to `LOBBY` with `ROOM_START_FAILED {reason: SOURCE_UNAVAILABLE}` and the host sees "That topic no longer exists. Choose another one." with "Change topic"; when core answers `422` (a re-import left fewer questions than the count) it sends `reason: TOPIC_UNAVAILABLE` and the host sees "That topic now has fewer than 15 questions. Lower the count or choose another topic."; other players see "Waiting for <host name> to start", and nobody sees a raw error
**And** a re-import that still has at least `questionCount` questions starts normally with the new questions and the name from the response [ASSUMPTION: no revision pin on the lobby]

**Given** the topic picker opened with `?for=room`
**When** a host who owns custom topics opens it
**Then** a "My topics" section above the bank subjects lists her custom topics with 5 or more questions (name, muted "15 questions · unrated", dim chevron); when any of her topics are hidden for being smaller, one muted line says "Topics with fewer than 5 questions can't be used in a room" [ASSUMPTION]
**And** picking one returns to Create (or the lobby's configure flow) with the custom source set; the count stepper's range becomes 5 to `min(30, questionCount)`, and a count above the new topic's size is lowered to it with a polite announcement (the Story 5.2 rule)

**Given** the topic view and the Story 6.2 success card
**When** the owner taps "Use in Battle Room" (replacing the stub)
**Then** Rooms › Create opens with that topic preselected as a custom source and the count set to `min(30, questionCount)` [ASSUMPTION: whole topic by default, as in the J2 flow]; for a topic with fewer than 5 questions the action stays button-disabled with the caption "A room needs at least 5 questions"

**Given** a lobby or Create screen with a custom source
**When** it renders for the host or any player
**Then** the source row shows the topic name, a "സ്വന്തം" outline tag (sm radius, ink outline, no volt) and the muted note "റേറ്റിംഗ് ഇല്ല · സ്വന്തം ചോദ്യങ്ങൾ / Unrated · the host's own questions don't change ratings" (ML flagged TBD) up front, before Start, and the source row's accessible name includes "unrated"
**And** the live-match header reads "ബാറ്റിൽ റൂം · <topic>" / "Battle Room · <topic>" with the same tag, and custom questions render in the language they were written in, with no EN tag and `lang` from the stored script

**Given** a completed custom-source room match
**When** game-service publishes `minnal.match.completed`
**Then** the event has `mode: BATTLE_ROOM`, `questionSource: CUSTOM` and `rated: false`; ratings-service (Story 2.5, unchanged) writes a `match_record` with `rated = false` and `rating_delta = null` for each `USER` participant, changes no `rating`, writes no `rating_event`, publishes no `rating.updated`, and adds nothing to any leaderboard key (end-to-end test with a 4-player custom room comparing every board before and after)

**Given** the results screen of a custom-source room
**When** it renders (Story 5.5)
**Then** the takeover, podium and standings work as for a bank room, the result line carries "സ്വന്തം · unrated", no rating delta, delta chip, placeholder or "updating" text is shown and the ratings delta API is not called, and the breakdown rows show the explanation with no source line, no report link and no "Practise this topic" link
**And** each registered player's Me › match history shows the match as "Battle Room · #3 · unrated" with no delta, and the rating trio and Ranks are unchanged

**Given** the host taps Play again on a custom-source room
**When** the successor room is created (Story 5.6)
**Then** it keeps the custom source and count, the `ROOM_SUCCEEDED` it sends carries that source, and the next start re-checks ownership and size through `/internal/question-sets`
**And** the recently hosted list (Story 5.2) stores custom sources too, shows them with the "സ്വന്തം" tag, and hides a row whose topic is no longer in her Custom Topics list or now has fewer than 5 questions

**Given** a player who is not the host
**When** she plays a custom room
**Then** she sees the questions only inside that match (through the room's `MATCH_ENDED` and reveals, as every room player does), never the topic in any list, picker or API of her own, and an attempt to start Solo Practice or a room with that `customTopicId` gets `404`

## Epic 7: Minnal spreads and is launch-ready

Anju has just beaten Vishnu on Kerala History. She taps Share, and a square ink card with a volt score, "Anju beat Vishnu", "Topic Duel · Kerala History" and a short link opens in WhatsApp's share sheet in her UI language; a friend who taps the link lands straight in Quick Match matchmaking, guest or not. Because that was her first completed match as a registered player, Results also shows an inline card offering to add Minnal to her home screen, which never comes back once she dismisses it or installs. Behind the scenes the developer can see, on free Grafana Cloud dashboards, whether players come back within 7 days, how many matches they finish per session, how often Quick Match ends against a bot next to how long the queue takes, how many matches abort, how fast answers are confirmed, and how many Battle Room hosts run rooms each week, and he gets an alert when the site or latency goes bad. Before launch he restores last night's backup into a scratch database by following a written runbook, and works through a launch checklist that separates what he must decide from what he must build. To make this possible, the epic adds a client-side canvas share-card renderer and the `/q` share-link route, the Share action on every results screen, the install prompt and installability checks, an OTLP push from Micrometer in each service to the Grafana Cloud free tier with a tag allowlist, a few product-metric computations, dashboards and alert rules kept in the repo, a restore runbook with a monthly drill reminder, and a launch checklist. It builds on the results screens and the empty Share slot in their action bars (Stories 1.10, 2.6, 4.2, 5.5 and 5.6), the guest identity and Quick Match matchmaking (Stories 1.5–1.6), the `PUBLIC_APP_ORIGIN` configuration (Story 5.2), the PWA manifest and service worker (Story 1.3), the uptime ping, nightly `pg_dump` to R2 and restore script (Story 1.2), the counters already emitted (Stories 1.6, 1.9, 5.1, 5.4), and `match_record` in ratings-service (Story 2.5). The epic leaves out direct-challenge links (not in MVP), a coaching-centre entity or dashboard (Phase 2), paid observability, and phone OTP (deferred).

### Story 7.1: Result share card

As Anju, a player who has just finished a match,
I want to share a good-looking image of my result to WhatsApp in one tap, with a link that drops my friends straight into a match,
So that I can show off and pull my batch into Minnal at the moment I am proudest.

**Requirements:** FR66, FR67, FR48 (custom topic names stay private), FR3 / FR23 (guests share and land in Quick Match), NFR3 (renderer outside the initial bundle), NFR4, NFR14, NFR16 (no server rendering), AD-18, UX-DR3 (volt on the share card), UX-DR11, UX-DR43 (Share in the action bar), UX-DR46, UX-DR73 (font ready before render), UX-DR82 (share link landing), UX-DR86, UX-DR88 (share fallback announcement), UX-DR94, UX-DR95, UX-DR96 (share CTA and result lines; ML flagged TBD)

**Acceptance Criteria:**

**Given** every results screen (Quick Match and Topic Duel from Stories 1.10, 2.6 and 4.2; Battle Room from Stories 5.5 and 5.6), for guests and registered players, including a results screen rehydrated from `sessionStorage`
**When** the action bar renders
**Then** it gains "പങ്കിടാം / Share" as a secondary button in the slot left empty: 1v1 = Rematch / Home / Share at 2fr / 1fr / 1fr, Battle Room host = Play again / Home / Share, other room players = Home / Share (plus "Join <host name>'s new room" when it arrives), wrapping to stacked full-width buttons when the labels don't fit
**And** Share is never shown on an aborted match (there are no results) and is `aria-disabled` with the offline caption while offline

**Given** the player taps Share
**When** the card is rendered
**Then** the client draws it on a 1080 × 1080 `<canvas>` in the browser, with no server call and no third-party service, using a renderer in a lazily loaded chunk (not in the initial player bundle), after `document.fonts.load` for the Malayalam face resolves or 3 s pass, whichever comes first, and produces a PNG blob within 1 s on a 2 GB Android phone [ASSUMPTION: PNG, flat colours keep it small]
**And** the layout follows the DESIGN share-card spec: band `#101216` field with 18px corner radius, the bolt polygon in volt top-right, the wordmark (മിന്നൽ in Malayalam UI, Minnal in English UI), the result line in white, the player's score in volt, the opponent's score (1v1) in on-band-muted, the mode line in on-band-muted, then a band-raised rule with the CTA and the short link in volt below it; no text is smaller than 40px on the 1080 canvas so it reads at a ~250px WhatsApp thumbnail [ASSUMPTION: 40px minimum]
**And** volt appears only on the band field, and the card has no photo, avatar, district or rating number

**Given** the result
**When** the result line and mode line are chosen
**Then** they come from the stored `MATCH_ENDED`, in the sharer's UI language, with names never inflected (the name unchanged, then a separator), for example: 1v1 win "Anju beat Vishnu", loss "Vishnu won · Anju 7,420", draw "Anju drew with Vishnu", Battle Room sole #1 "Anju won · 23 players", joint win "Anju · joint win · 23 players", other places "Anju came #3 of 23"; a bot opponent is named "Minnal Bot"; Malayalam forms follow the "<name> · ജയിച്ചു" pattern and are flagged TBD for sign-off
**And** the mode line reads "Quick Match", "Topic Duel · <topic>" or "Battle Room · <topic>" for bank sources, and only "Battle Room" for a custom-topic room, so a private topic name never leaves the app [ASSUMPTION: custom topic names omitted for privacy]; the CTA is "Beat me on Minnal" (ML flagged TBD)
**And** scores use Latin digits with grouping and Malayalam text carries correct shaping (golden-image tests for win, loss, draw, Battle Room #1, joint win, #7 of 23, a custom room, and each in both languages)

**Given** the short link
**When** it is built
**Then** it is `<PUBLIC_APP_ORIGIN>/q` from build-time configuration (Story 5.2), never hard-coded, shown on the card without the scheme ("minnal.app/q" with today's placeholder domain), and it carries no user id, match id, name or tracking parameter [ASSUMPTION: one plain link; share opens are not tracked]

**Given** the PNG is ready
**When** `navigator.canShare({files: [png]})` is true
**Then** the client calls `navigator.share({files: [png], text, url})` with the text "I beat Vishnu 7,840 – 7,420 on Minnal. Beat me:" (in the UI language, matching the result line; ML flagged TBD) and the `/q` url, so WhatsApp gets the image, the line and the link; a cancelled share sheet (`AbortError`) does nothing and shows nothing

**Given** file sharing is not supported (desktop browsers, some in-app browsers)
**When** the player taps Share
**Then** the client saves the image as `minnal-result.png` through a download link and copies the text plus link to the clipboard, then shows the inline note "ചിത്രം സേവ് ചെയ്തു · ലിങ്ക് കോപ്പി ചെയ്തു / Image saved · link copied", announced politely once; if the clipboard is refused, the note shows the link as selectable text instead
**And** while the card renders the Share button shows "…" and ignores further taps

**Given** someone opens a `/q` link (from WhatsApp or anywhere)
**When** the route loads, whether she is new, a returning guest or signed in
**Then** the app shell loads, a guest token is obtained when she has no token, and the client joins `QUICK` matchmaking at once and shows the Story 1.6 matchmaking screen with no landing page, prompt or confirmation; Cancel returns to Home [ASSUMPTION: auto-join on open]
**And** a registered player whose profile is not set up goes through the Story 2.3 setup screen first and then into matchmaking; a player already in a queue, room or match gets the `ALREADY_IN_MATCH` offer to return to it; offline she lands on Home with the offline banner; a draining server shows the "try again in a moment" notice
**And** there is no direct-challenge flow: the link never pairs her with the sharer on purpose

**Given** the share flow at 320 CSS px at 100%, and at 360 px with 200% text
**When** the action bar shows Share
**Then** every button keeps a 48px hit area and visible focus ring, labels wrap without truncation, and the initial player bundle stays within the Story 1.3 budget

### Story 7.2: Install prompt

As Anju, a registered player who has just finished her first match,
I want a quiet offer to add Minnal to my home screen,
So that next time it opens in one tap like an app, without a pop-up getting in my way.

**Requirements:** FR74, NFR3, NFR21, AD-18 (manifest meets installability), UX-DR18 (nudge card styling, one per screen), UX-DR19, UX-DR86, UX-DR88, UX-DR96 (install prompt copy; ML flagged TBD), UX-DR97

**Acceptance Criteria:**

**Given** the production build
**When** CI runs
**Then** an installability check fails the build unless the web manifest has `name`, `short_name`, `start_url` within scope, `scope`, `display: "standalone"`, `orientation: "any"`, `theme_color`, `background_color`, and 192 px and 512 px PNG icons including a maskable one, and the service worker registers with a fetch handler that caches only the app shell and Malayalam font (Story 1.3 rule, never `/api/**` or `/ws`) [ASSUMPTION: a scripted manifest check plus a Lighthouse PWA run against the preview build]
**And** on a real Android Chrome phone the app installs from the browser menu and launches standalone from the home-screen icon, recorded once in the story's test notes

**Given** a registered player on Android Chrome (or another browser that fires `beforeinstallprompt`)
**When** the browser fires `beforeinstallprompt`
**Then** the app calls `preventDefault()`, keeps the event for later, and never shows the browser's own mini-infobar in its place

**Given** a registered player finishing her first completed match on this device (any mode, rated or unrated; aborted matches do not count)
**When** her results settle (after any win takeover has collapsed)
**Then** an install card shows inline on Results, below the results band (or podium) and above the breakdown: styled as the Sign-in nudge (card, 1.5px ink outline, lg radius), the benefit text "Add Minnal to your home screen · it opens in one tap, even on slow data" (ML flagged TBD), an ink "ഇൻസ്റ്റാൾ / Install" button-primary and a "ഇപ്പോൾ വേണ്ട / Not now" text link with a 48px hit area; it is never a modal, never covers the action bar, and has no volt
**And** "first completed match" is tracked per user per device in `localStorage` as `install:{userId} = {firstMatchSeen, state: PENDING | DISMISSED | INSTALLED}`, because installation is per device [ASSUMPTION]; when no install prompt is available on that results screen, the card is not shown and she stays eligible, so it can appear on her next results screen instead [ASSUMPTION]
**And** a storage read that fails is treated as already dismissed, so a broken store never makes the card nag

**Given** the install card
**When** she taps Install
**Then** the client calls the kept event's `prompt()`; on `accepted`, or when the `appinstalled` event fires, the card is removed, `state = INSTALLED` and "Minnal installed" is announced politely; on `dismissed` in the browser dialog the card is removed and `state = DISMISSED`
**And** when she taps "Not now", the card is removed with no animation, `state = DISMISSED`, focus moves to the next control in reading order, and the card never shows again for her on this device

**Given** a guest, a player running Minnal standalone (`matchMedia('(display-mode: standalone)')`), or a player whose state is `DISMISSED` or `INSTALLED`
**When** any results screen renders
**Then** no install card is shown (tests for each case); a guest's results keep only the Story 2.4 registration prompt, so there is at most one nudge on the screen

**Given** iOS Safari, which never fires `beforeinstallprompt`
**When** a registered player meets the same first-match rule and is not running standalone
**Then** the card shows the instruction "Tap Share, then Add to Home Screen" with a single "Got it" dismiss link and the same remembered state [ASSUMPTION: instructions on iOS Safari]
**And** every other browser that offers no install prompt (Firefox, WhatsApp and other in-app browsers) shows nothing [ASSUMPTION]

**Given** the install card at 320 CSS px at 100%, and at 360 px with 200% text, in both languages
**When** it renders
**Then** the text wraps without truncation, there is no horizontal page scroll, both controls keep 48px hit areas and visible focus rings, and the install code adds no more than 2 KB gzipped to the initial bundle

### Story 7.3: Launch metrics

As Snobin, the developer who runs Minnal alone,
I want the launch success signals and their counter-metrics on free dashboards, with alerts when the site or answer latency goes bad,
So that from launch day I can tell whether players form a habit, and hear about an outage before players complain.

**Requirements:** NFR18 (launch part: product metrics and counter-metrics), NFR1 (answer-confirmation latency measured), NFR6 (uptime alerting), NFR16 (Grafana Cloud free tier, no extra paid service), NFR17 (no extra container), NFR20 (no PII in metrics), AD-3, AD-8, AD-13, AD-19 (metrics to Grafana Cloud free tier), Additional Requirements: Observability, Deployment & operations

**Acceptance Criteria:**

**Given** core-, game- and ratings-service in the prod profile
**When** they start
**Then** each pushes its Micrometer registry over OTLP to the Grafana Cloud free-tier endpoint every 60 s, with the endpoint and token only in the server-side `.env` (keys added to `.env.example`), and no new container is added, so the Story 1.2 memory-envelope check still passes [ASSUMPTION: direct OTLP push instead of a collector container]
**And** the local profile keeps metrics on the actuator endpoint only and pushes nothing; a push failure is logged at most once per 10 minutes and never affects a request or a match

**Given** every meter in every service
**When** it is registered
**Then** a shared `MeterFilter` allows only the tag keys `service`, `mode`, `outcome`, `reason`, `kind`, `source` and `status` on Minnal's own `minnal.*` meters, framework meters (JVM, HTTP server) keep their standard tags with templated `uri` values only, and a test fails the build if any meter carries a tag value that looks like a UUID, email or room code; user ids, display names, emails, districts, topic or custom-topic ids and names, and room codes never appear in metrics
**And** the total active series stay under the free-tier limit with headroom (measured and noted in the story's test notes) [ASSUMPTION: about 2,000 series target]

**Given** the minimal approach for product metrics [ASSUMPTION: each metric computed in the service that already owns the data, with no new service and no analytics pipeline]
**When** the metrics are computed
**Then** they come from these sources:
- **7-day return:** ratings-service runs a nightly job at 03:00 IST over `match_record` and publishes gauges for the cohort whose first completed match fell on the IST day 8 days earlier: cohort size and the share who completed another match on a later IST day within 7 × 24 h of the first; registered players only, because guest play is never stored [ASSUMPTION: return = another completed match]
- **Completed matches per session:** game-service tracks, per `sub` in memory, a session that starts at the first STOMP `CONNECT` after 30 min with no inbound message and ends 30 min after the last one, and records the number of completed matches in it to a distribution when it ends (sessions with zero matches included); the web app opens its STOMP connection when the app starts so app open starts the session; sessions in progress are lost on a restart [ASSUMPTION]
- **Quick Match bot-ended rate and median queue wait:** game-service counts completed `QUICK` matches with `kind` = `BOT` or `HUMAN` opponent, and the Story 1.6 queue-wait timer publishes a percentile histogram, so the dashboard shows the bot-ended share and the median wait on the same panel
- **Completed vs aborted matches:** the Story 1.9 and 5.4 counters, tagged by `mode`; this counter-metric is the only metric in which an aborted match appears (FR65), and no session, return or Battle Room metric counts one
- **Answer-confirmation latency:** game-service records the server time from receiving an answer frame to sending `ANSWER_ACCEPTED`, and each answer message carries an optional `prevAckRttMs` (the client-measured round trip of that player's previous answer, clamped to 0–10,000) that goes into a second histogram and is never used for timing or scoring (AD-6 unchanged; contract test) [ASSUMPTION: piggy-backed client RTT]
- **Battle Room hosts and rooms per week:** when a room match completes with at least 2 humans, game-service adds the host's user id to a Valkey HyperLogLog `game:metrics:br-hosts:{isoWeekIST}` (and to `game:metrics:br-hosts-5plus:{isoWeekIST}` when 5 or more humans played) and increments `game:metrics:br-rooms:{isoWeekIST}`, with an 8-week TTL; gauges report the current and previous week's counts, so no readable id is kept and restarts lose nothing [ASSUMPTION: distinct hosts, plus hosts of rooms with 5 or more players, as the coaching-centre proxy until the owner defines a centre]

**Given** the dashboards
**When** they are built in Grafana Cloud
**Then** their JSON is kept in `deploy/grafana/` and imported from there, and one "Launch" dashboard shows: 7-day return against the 40% target, completed matches per session (median and mean) against the 2 target, the Quick Match bot-ended share against the 60% target next to the median queue wait, completed vs aborted matches by mode, answer-confirmation p50 and p95 (server and client RTT) against the 200 ms line, Battle Room hosts, 5-plus hosts and rooms per IST week against the 5-centre goal, and the scoreboard broadcast latency against 500 ms
**And** a second "Health" dashboard shows request rates and 5xx rates per service, JVM heap per service against its 384 MB cap, Valkey stream pending and dead-letter counts, and container restarts

**Given** the alert rules (kept in `deploy/grafana/`, sent by email to the developer)
**When** a condition holds
**Then** an alert fires for: answer-confirmation server p95 over 200 ms for 10 minutes; any service reporting no metrics for 10 minutes; a 5xx rate over 2% for 10 minutes; any entry in `minnal.deadletter`; and JVM heap over 90% for 10 minutes [ASSUMPTION: thresholds]
**And** the external `/health` uptime ping from Story 1.2 stays the primary uptime alert, and each alert is tested once by forcing its condition (for example stopping ratings-service on the VPS) with the result noted

**Given** the open product question on coaching centres
**When** this story ships
**Then** the dashboard panel is labelled "proxy" and the story notes, as an open question for the owner rather than a requirement, how a coaching centre should be counted

### Story 7.4: Launch readiness

As Snobin, the developer and owner,
I want to prove I can restore the database from last night's backup, and to work through one launch checklist that says what I must decide and what I must build,
So that I open Minnal to the public knowing that a lost server is a bad hour, not the end of the product.

**Requirements:** NFR9 (launch part: tested restore and monthly drill), NFR6 (uptime and error budget), NFR13 (production secrets and origins), NFR20 (DPDP deletion question answered before launch), NFR18, FR68 (`ADMIN_EMAILS` set), FR15 / FR76 (published bank large enough), AD-9, AD-19, Additional Requirements: Deployment & operations, Security implementation (CORS)

**Acceptance Criteria:**

**Given** the nightly backup from Story 1.2
**When** it runs
**Then** it also writes a manifest beside each dump (UTC time, dump size, SHA-256, and row counts for every table in the `core` and `ratings` schemas), and on success calls a heartbeat URL of the free uptime monitor from `.env`, so a backup missing for more than 26 h alerts the developer [ASSUMPTION: heartbeat check]

**Given** the restore script in `deploy/`
**When** the developer runs `deploy/restore-drill.sh [dump-name]` on the VPS (latest dump when no name is given)
**Then** it downloads the dump from R2, checks its SHA-256, starts a throwaway `postgres-restore` container with a 512 MB memory limit on a network the services cannot reach, restores into it, compares every table's row count with the manifest, runs a smoke query per schema (published question count, user count, rating rows), prints the elapsed restore time, and removes the container and the downloaded file, leaving production untouched [ASSUMPTION: drill on the VPS so production data never leaves it]
**And** a mismatch, checksum failure or restore error exits non-zero with a message naming what failed

**Given** the runbook
**When** it is written
**Then** `deploy/RUNBOOK-restore.md` explains, step by step, both the monthly drill and a real recovery onto a new VPS (provision, Compose up with an empty database, restore, point DNS, verify), states the targets of at most 24 h of lost data and about 2 h to recover [ASSUMPTION: RPO 24 h, RTO 2 h], and keeps a drill log table (date, dump, duration, result)
**And** a first drill has been run end to end from the runbook and logged

**Given** the monthly drill reminder
**When** the first day of each month comes
**Then** a scheduled GitHub Actions workflow opens an issue "Monthly restore drill" linking the runbook and its log [ASSUMPTION: an issue as the reminder; the drill itself stays on the VPS]

**Given** the launch checklist
**When** it is written as `deploy/LAUNCH-CHECKLIST.md`
**Then** every item is tagged **[OWNER]** (a decision only the owner can make) or **[ENG]** (an engineering task with a check), and it holds at least these items:
- **[OWNER]** Choose and buy the domain. **[ENG]** Serve the PWA from Cloudflare Pages on the app host and the API from the VPS on an `api.` subdomain of the same registrable domain, so the refresh cookie from Story 2.1 is first-party; set `VITE_PUBLIC_APP_ORIGIN`, the prod CORS origin and the Google OAuth redirect URIs to the real origins; verify sign-in, a `/r/<code>` link and a `/q` link on a real Android phone.
- **[OWNER]** Confirm the OVHcloud Mumbai plan's availability and its bandwidth cap (10 Mbps after the monthly quota) on the order page, and accept or change the plan. **[ENG]** Record the measured bandwidth of one 50-player room so the cap can be judged.
- **[OWNER]** Answer the India DPDP Act question from Story 2.8 (what must be erased or kept on account deletion, including backups and `match_record`). **[ENG]** Implement whatever the answer requires before launch, or record that nothing changes; launch is blocked while this item is open.
- **[OWNER]** Publish the Google OAuth consent screen out of testing mode.
- **[ENG]** Set `ADMIN_EMAILS` in the prod `.env` and check that the admin can open `/admin` and a non-admin cannot.
- **[OWNER]** Confirm the published-bank threshold, proposed as at least 500 published Kerala PSC questions across at least 10 topics with 10 or more each [ASSUMPTION: threshold]. **[ENG]** Show the current counts from one admin query in the checklist.
- **[ENG]** External uptime ping on `/health` live, with an alert tested by stopping a container; backup heartbeat live; a restore drill logged within the last 30 days; Story 7.3 dashboards and alerts live.
- **[OWNER]** Accept the error budget: 99.5% monthly uptime allows about 3 h 36 min of downtime a month; when a month's budget is spent, feature work pauses for reliability work [ASSUMPTION: freeze policy]. **[ENG]** The runbook records where the month's remaining budget is read (the uptime monitor's monthly report).
- **[OWNER]** Sign off every string flagged TBD (Malayalam share-card lines, the sample GPT prompt in Malayalam, join and install copy).
**And** the story is done when every [ENG] item is checked with its evidence linked, and every [OWNER] item has either its answer recorded or is marked "open · blocks launch"; the checklist does not decide owner items itself

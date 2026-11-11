# Epic 1 Context: Anju plays her first Quick Match

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A guest opens Minnal (a Malayalam-first Kerala PSC quiz PWA) on a low-end Android phone, taps Quick Match, gets paired with a human or a clearly badged Minnal Bot within about 8 s, and plays 10 server-refereed questions × 15 s with speed-weighted scoring, safe peak-moment reveals, explanations and source attribution. She survives a dropped connection and ends on a results screen with a breakdown and Rematch. The epic also lays down everything later epics build on: the hand-built monorepo, CI/CD and first production deploy, the design-token and accessibility foundation, a seeded and reviewed question bank behind the internal question-set contract, guest identity, and publication of `minnal.match.completed`. Out of scope: sign-in, ratings and deltas (Epic 2), reporting questions (Epic 3), sharing and the install prompt (Epic 7).

## Stories

- Story 1.1: Project scaffold runs locally
- Story 1.2: Minnal is live on the production server
- Story 1.3: Design foundation
- Story 1.4: A seeded PSC question bank
- Story 1.5: A guest can open Minnal and see Quick Match
- Story 1.6: Matchmaking with bot fallback
- Story 1.7: Live match engine
- Story 1.8: Live match screen and peak moments
- Story 1.9: Reconnect, forfeit and leave
- Story 1.10: Results and rematch

## Requirements & Constraints

- **Guest access:** guests may play only Quick Match (with or against registered players, bots, and with Rematch); the server rejects other modes. Guest data is never persisted.
- **Questions:** each has Malayalam and/or English text (shown in the UI language, falling back to the other), exactly 4 options, answer index 0–3, explanation, optional attribution, plus category/subject/topic/exam level/difficulty tags. Only admin-reviewed `PUBLISHED` versions are served. Quick Match draws a random mix across all subjects. Wherever an answer is revealed, show the attribution, or "source not available" when there is none.
- **Match rules:** 10 questions × 15 s; correct = `500 + round(500 × remainingMs / 15000)`, wrong or missing = 0. The server alone times and scores, only the first answer counts, late answers are rejected. The full match takes ≤ 4 min (about 2.8 min with the 2 s reveal hold).
- **Matchmaking:** pair within ±200 rating, widening to ±400 at 4 s; ratings come only from the server (missing → 1200); bot at ~8 s rated at the human's rating. Cancel works until paired. One queue/match per user identity. A failed question-set fetch gives both players `MATCHMAKING_FAILED` with a retry.
- **Secrecy:** no client gets a question before its window opens, or the answer, explanation or any hint of correctness before the window closes.
- **Resilience:** 10 s reconnect grace, then forfeit (0 on the remaining questions); Leave forfeits immediately; the match always continues for the others. A match counts as completed once Q1 is revealed; if every human leaves before that, it is aborted and counted only in the completed-vs-aborted metric.
- **Results:** shown immediately, survive a reload, include placements and a per-question breakdown, plus Rematch (60 s window; a bot accepts instantly) and Home.
- **Performance/device:** answer → ack < 200 ms p95; scoreboard/reveal < 500 ms; first load on 3G < 5 s; initial JS ≤ 150 KB gzip (the Malayalam font is excluded, ≈ 45–70 KB); usable at 360 CSS px on a 2 GB RAM phone; animate transform/opacity only.
- **Accessibility (WCAG 2.2 AA):** at most 1 flash per 1000 ms app-wide; a Reduce-effects path (setting `on|off|follow-phone`, OS preference, auto-fallback); commit-on-lift input; 48 × 48 hit areas; visible focus; screen-reader announcements; reflow at 320 px and at 200% text; zoom never disabled.
- **Ops/cost:** about ₹450/month on one VPS plus Cloudflare free tiers; ≥ 99.5% uptime with an external `/health` ping; nightly off-site backup; total memory < 3.2 GB; secrets only in env, never in git.
- **Metrics from day 1:** queue wait (median), bot-fill rate, completed vs aborted matches; JSON logs with `requestId`/`matchId`/`userId`.

## Technical Decisions

- **Monorepo:** `contracts/`, `services/{core,game,ratings}`, `web/`, `deploy/`. Maven 3.9 multi-module, Java 25, Spring Boot 4.1.x; packages `in.minnal.<service>.<feature>.(api|application|domain|infrastructure)`; profiles `local`/`prod`. `contracts` is the only shared module (event records, `/internal` DTOs, STOMP envelope and types, `Scoring`, `Ranking`), and a build rule blocks service-to-service module dependencies.
- **Web:** React 19.3, TS 6.0, Vite 8.1, vite-plugin-pwa 1.x, Tailwind 4.3, TanStack Query 5, Zustand 5, react-i18next 17, @stomp/stompjs 7.3.
- **Runtime:** one `deploy/compose.yaml` for local and prod: Caddy 2.11, three services (game-service exactly 1 replica), Postgres 18, Valkey 9.0 (AOF `everysec`). Prod runs on an OVH Mumbai VPS (2 vCPU/4 GB); the PWA is on Cloudflare Pages; backups go to R2; CI/CD is GitHub Actions with images tagged by commit SHA.
- **Routing:** Caddy routes `/api/core/**`, `/api/ratings/**` and `/ws`, never `/internal/**` (404), and sets `X-Request-Id`. CORS allows only the Pages origin (plus the Vite dev origin locally).
- **Data ownership:** one Postgres, with schema + login `core` and `ratings` only (game has no schema), grants on the service's own schema only, no cross-schema access, Flyway per service, tables added only by the stories that need them. Valkey key prefixes are `core:`/`game:`/`ratings:`.
- **Conventions:** UUID ids generated by the owning service; `Instant`/UTC on the wire and in the DB; REST under `/api/<service>/v1`, JSON camelCase; errors as RFC 9457 `ProblemDetail`.
- **Question bank (core):** `question` (id, `source_ref?` partial-unique, `deleted_at?`) and immutable versioned `question_version` with status `DRAFT|PUBLISHED|DISCARDED`. One shared `QuestionValidator` returns field-level errors (to be reused later by admin, CSV and custom import). The idempotent CSV seed loader requires `reviewedBy`.
- **Internal contract:** `POST /internal/question-sets {source, filters, count 1–30, requesterId}` with a service token. It returns exactly `count` questions, otherwise `422` (never a short set); `CUSTOM` gets 422 until Epic 6. It is the only sync cross-service call, made only at match start, with a 2 s timeout off the actor thread.
- **Identity:** core issues an RS256 guest JWT (24 h, random `sub`, `roles:[GUEST]`, generated `name`, `lang`) and nothing is persisted. Core exposes JWKS (multi-key, with `kid`); game and ratings are resource servers. The JWT travels in STOMP `CONNECT`, and identity comes only from the token.
- **Game engine:** one single-threaded actor per match and per matchmaking queue; all changes are queued events; no DB/network I/O between Q1 and the final reveal (enforced by an architecture test). The actor holds `participants: List<Participant>` (no 1v1 fields) and is tested with N = 2 and N = 5. Bots are `Participant{kind: BOT}` using the same answer path and `Scoring`, with a random delay per question.
- **Protocol:** STOMP at `/ws`; envelope `{type, matchId|roomId, seq?, refSeq?, serverTime, payload}`. `seq` (starting at 1, +1 each) appears on broadcasts only; private messages carry `refSeq`. `QuestionView` has no answer fields; `ANSWER_ACCEPTED` is receipt-only; `SCOREBOARD` shows who answered; `QUESTION_REVEALED` carries answer, explanation, attribution, picks and points. Reconnect uses a private `SNAPSHOT`; the client drops `seq ≤ refSeq` and sends `resync` on a gap. Errors include `ALREADY_IN_MATCH`, `SERVER_DRAINING` and `RATE_LIMITED` (default 10 inbound msgs/s per connection).
- **Ranking:** score desc, then correct count desc, else a shared placement.
- **Event:** `minnal.match.completed` (AD-8 payload with `eventId`, `rated = questionSource == BANK`) is published once after the final reveal with `MAXLEN ~100000` and retried with backoff; nothing is published for an aborted match. It has no consumer yet.
- **Drain:** graceful shutdown with a 5 min timeout; a `draining` flag makes new joins fail with `SERVER_DRAINING` while live matches finish.
- **Frontend state:** a single WebSocket module alone updates the Zustand live-game store. Components never compute correctness or scores. The countdown is the server `deadline` + a `serverTime` clock offset. The last `MATCH_ENDED` is kept in `sessionStorage`. The service worker caches only the app shell and font, never `/api/**` or `/ws`.

## UX & Interaction Patterns

- **Look:** a calm, monochrome light/dark theme that follows the OS live. The peak tokens `band` and `volt` (`#D4FF2A`) appear only on band surfaces (reveal band, win takeover, results band); `dim` is never text; brick only marks wrong picks, errors and Leave. Tokens (color, rem typography, radius, spacing, motion) use their DESIGN.md names; motion tokens are also exported as TS constants.
- **Fonts and strings:** Noto Sans Malayalam is a self-hosted subset with a metric-matched fallback; the live match uses `font-display: optional` and other screens `swap`. Matchmaking waits for `document.fonts.ready` (cap 3 s). All strings come from the bilingual Voice & Tone catalogue (no hard-coded strings; TBD entries are flagged). Latin runs are wrapped in `lang="en"`. Numbers use Latin digits with grouping. Names are never inflected (name + separator).
- **Shell:** tab bar Play/Rooms/Ranks/Me, hidden during the live match and the takeover. Each route sets `document.title`. Screens use one shared polite live region (plus an assertive one used only when reconnecting starts). Loading shows skeletons, and no spinner without text past 1 s. Offline, an inline banner shows and play actions are `aria-disabled` with a caption.
- **Guest Home:** the ink Quick Match card (the only filled ink element; one tap starts matchmaking), locked mode rows, and exactly one Sign-in nudge. The Google button is `aria-disabled` with a "coming soon" caption until Epic 2.
- **Matchmaking:** "Finding an opponent…" with Cancel; "Minnal Bot joined" plus the BOT badge (announced once); a static elapsed count under reduced effects.
- **Live match:** sticky hairline timer driven by `scaleX`, with the seconds label and "Q n/10". The score strip shows the opponent as "thinking" → "answered". Options commit on lift (`click`), show "…" until the ack, then lock. The EN tag shows the other-language text for the current question only. Focus moves to the question heading. The correct reveal is a band drop plus one volt bolt strike; the wrong reveal has no volt and always names the correct answer. All peaks go through the flash scheduler; reduced effects turn each peak into a 200 ms fade.
- **Reconnect/leave:** the reconnect banner (a 40px ring counting 10 → 0) replaces the timer and dims the content below by 42% with `inert`. The Leave `alertdialog` has focus on Stay, and Esc/Back mean Stay. Forfeited, opponent-left and aborted each show a one-line notice.
- **Results:** win takeover (≥ 1000 ms after the last strike, 1600 ms hold, Continue focused, taps ignored for 400 ms after the collapse; no auto-advance under reduced effects or a screen reader). A loss opens settled with no volt; a draw band has no volt. Dot strip; correct rows collapsed and wrong rows expanded. Fixed Rematch/Home bar; rematch shows a waiting card with Cancel. No delta area, report link or Share in this epic.

## Cross-Story Dependencies

- Stories 1.1 → 1.2 build the base for everything. 1.3's tokens, flash scheduler, Reduce-effects store, live regions and i18n are used by 1.5, 1.6, 1.8, 1.9 and 1.10.
- 1.4's `/internal/question-sets` is called by 1.6 (match start) and by 1.10 (rematch). 1.5's guest JWT and JWKS are needed for the `/ws` CONNECT in 1.6.
- Stub handoffs: 1.5's matchmaking route stub is replaced by 1.6. 1.6's match-actor shell and live-match stub are replaced by 1.7 and 1.8. 1.9's minimal results view is replaced by 1.10. 1.2's `draining` flag is read by 1.6 and 1.7.
- Later epics: Epic 2 consumes `minnal.match.completed`, adds rating deltas, sign-in and the Settings UI for Reduce effects. Epic 3 adds report links. Epic 5 reuses the N-participant match actor. Epic 6 enables `CUSTOM` sources. Epic 7 adds Share and the install prompt.

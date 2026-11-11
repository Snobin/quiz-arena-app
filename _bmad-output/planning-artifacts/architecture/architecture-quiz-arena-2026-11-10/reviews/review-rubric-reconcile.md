# Review — Rubric + Reconcile: Architecture Spine, Minnal MVP

Reviewed: `ARCHITECTURE-SPINE.md` (draft, 2026-11-10), `.memlog.md`, PRD `prd.md` + `addendum.md`.
Known, accepted departures (not counted as findings): Google-only login (phone OTP deferred), 10 s reconnect grace instead of immediate forfeit.

## Verdict

Strong spine. The hard real-time divergence points are covered (actor model, answer secrecy, server clock, one scoring function, bots as participants, one match→ratings event, one envelope). It is **not ready to bind yet**. One dependency rule makes a PRD requirement impossible to build (rating-band matchmaking). Two cross-unit flows have no contract (rematch/play-again, guest→registered hook). Ops durability is missing for the one path where losing data is not acceptable (MatchCompleted in Valkey).

---

## Part 1 — Rubric

### 1.1 Divergence points fixed for the level below

Covered well: entity ownership (AD-1), edges (AD-2), schemas (AD-3), actor concurrency (AD-4), answer secrecy (AD-5), timing/scoring (AD-6), bots (AD-7), rating path (AD-8), identity (AD-9), wire protocol (AD-10), disconnect (AD-11), question-set contract (AD-12), room lifecycle (AD-13), leaderboards (AD-14), frontend state (AD-15), deployment (AD-16).

Missed divergence points (two or more units must agree, and nothing decides how):

| # | Gap | Units that will diverge |
|---|---|---|
| R1 | **Matchmaking needs the player's per-mode rating (FR-4.1 ±200 band), but AD-2 gives game-service no edge to ratings-service.** game-service cannot get a rating, so a developer will either add an ad-hoc call (breaking AD-2), put ratings in the JWT (stale), or skip banding. | game, ratings, core (JWT) |
| R2 | **Rematch / Play again (FR-9.3) has no contract.** The match actor ends at MATCH_ENDED. Nothing decides who owns the "rematch offer" state, how long it lasts, what both clients send, how a bot answers a rematch, or how "Play again" pre-seeds a new room's source. | game, web |
| R3 | **Participant display identity.** game-service broadcasts names/avatars on scoreboards, but nothing says where they come from (JWT claim? /internal call? client-supplied?). Client-supplied names are a spoofing vector. | game, core, web |
| R4 | **Question lifecycle states (FR-11.3).** AD-12 says "only PUBLISHED", but there is no state set (DRAFT/PUBLISHED/DISCARDED?) and nothing on editing or deleting a question that past matches, reports, or in-flight actors refer to (soft delete vs hard delete). | core, web/admin, game (snapshot semantics) |
| R5 | **Token lifetime and refresh.** No access-token TTL or refresh mechanism. Nothing covers a JWT that expires mid-match on an open STOMP session, or a guest token that expires. game and web will each improvise. | core, game, ratings, web |
| R6 | **Matchmaking queue location is inconsistent.** The Structural Seed puts the "mm queue" in Valkey. Deferred says "Valkey-backed matchmaking" is a future scaling step. A dev can't tell which to build. | game |
| R7 | **Service worker caching scope.** vite-plugin-pwa is in the stack, but no rule bans caching `/api/**` and `/ws`. A stale cached leaderboard or profile can diverge from server state (this also clashes with AD-15). | web |
| R8 | **Topic identity for Topic Duel / Solo / Battle Room filters.** `filters` in AD-12 is untyped. web, game, and core will each guess the subject/topic key shape (name vs id vs slug). | web, game, core |

### 1.2 AD rules — enforceable and preventing their divergence?

| AD | Enforceable? | Note |
|---|---|---|
| AD-1/2/3 | Yes | DB grants + ArchUnit/compose-network checks make these testable. AD-2 is too strict for R1. |
| AD-4 | Yes | Worth adding: "actor must not block; timer via scheduler posting events to the queue". Otherwise a dev may `sleep` on a virtual thread. |
| AD-5 | Yes | Type-level (`QuestionView` has no field). Good. |
| AD-6 | Mostly | "First answer wins" + "later dropped" is clear. Does not say whether the server returns `ANSWER_ACCEPTED` for a late or duplicate answer, or a rejection type. Minor. |
| AD-7 | Yes | The bot accuracy model is unstated. That is internal to game, so acceptable. |
| AD-8 | Partly | Idempotency is good. **Durability is not addressed**: Valkey Streams with no AOF, no consumer group/ack/pending-reclaim rule, and no dead-letter queue. A Valkey restart, or a ratings crash before ack, can lose rating changes silently. That is the divergence AD-8 claims to prevent. |
| AD-9 | Partly | See R3, R5. Admin bootstrap (how the first ADMIN role is granted) is not decided. |
| AD-10 | Yes | `/app/room/{roomId}/{action}`: the action set is open-ended. List the actions (join, leave, configure, start, kick?, react?). |
| AD-11 | Yes | Does not say what counts as "all humans gone" for a 1v1 vs a bot (one human disconnects past grace means aborted, so nothing is published?). This interacts with the counter-metric "count only fully completed". State it. |
| AD-12 | Yes | Needs a "no repeats within a set" rule, plus the not-enough-questions behaviour (topic has < count): who errors, and what the user sees. |
| AD-13 | Yes | The max-size assumption (50) sits under Deferred but must be enforced by game and shown by web. See 1.3. |
| AD-14 | Yes | Good. |
| AD-15 | Yes | Good. Add the service-worker rule (R7). |
| AD-16 | Partly | No container memory/heap caps. Three JVMs + PG + Valkey + Caddy on 4 GB will OOM without them. No health checks, alerting, or restore drill against the 99.5% uptime target. |

### 1.3 Deferred items that could let two units diverge

| Item | Risk |
|---|---|
| Battle Room max size (50) | **Diverges**: game enforces it and web shows "room full" and lobby layout. Promote it to AD-13 as a constant in `contracts/`. |
| Bot rating = human's rating | Internal to ratings. Safe. |
| N-player ELO internals | Internal to ratings. Safe. AD-8 should say how ratings treats a `forfeited` participant (rated as loss?), because game sets the flag expecting some meaning. |
| Metrics backend | Safe as a sink choice. **But which metrics get emitted is not deferred or decided** (see P-metrics). |
| Phone OTP | Known departure. Safe behind the AD-9 interface. |
| Horizontal scaling, crash recovery, staging, Phase 2 | Safe. |

### 1.4 Dimensions this altitude owns

| Dimension | Status |
|---|---|
| Deployment | Decided (AD-16). Gap: memory limits, zero-downtime story for core/ratings, and the deploy mechanism (CI? manual `compose pull`?). |
| Ops / observability | Partly. Actuator/Micrometer plus JSON logs. **Missing:** health checks, uptime monitoring/alerting, backup restore test, Valkey persistence mode, log retention on a small disk. |
| Security | Mostly. **Missing:** CORS (Pages origin → VPS API), CSP, how the `/internal` service token is issued and rotated, admin role bootstrap, answer-rate-limit numbers, CSV upload size limits, JWT key rotation. |
| Data | Decided. Missing: backup retention, plus PII handling (district, Google email). DPDP Act 2023 consent and deletion is not even listed as an open question. |
| Analytics / product metrics | **Absent**. Neither decided, deferred, nor an open question. |
| Open Questions section | **Absent from the spine.** Items above should land there if not decided. |

---

## Part 2 — Reconcile (PRD → spine)

Legend: OK = landed · PARTIAL = partly landed · MISSING = not landed · DEPARTURE = known.

### Functional

| Req | Status | Note |
|---|---|---|
| FR-1.1 Phone OTP | DEPARTURE | Known. The Deferred table still says "PRD conflict to resolve". Get the PRD amended so it stops being flagged. |
| FR-1.2 Google | OK | AD-9 |
| FR-1.3 Guest Quick Match only | OK | AD-9 server-side enforcement |
| **FR-1.4 Guest registration prompt with match result as hook** | MISSING | Nothing covers whether the guest's just-finished result or rating carries over on sign-up (`MatchCompleted` drops GUEST). Nothing covers how web keeps the result across the Google redirect, or whether the guest `sub` maps to the new userId. Decide: "not carried over; the prompt shows the score only" **or** a claim flow. |
| FR-1.5 Guest not persisted | OK | AD-8, AD-9 |
| FR-2.1 Profile fields | OK | core |
| FR-2.2 Per-mode ratings | OK | ratings |
| FR-2.3 Last 20 matches + delta | PARTIAL | MATCH_RECORD exists. Not stated whether history stores opponent display names (ratings has no names, and AD-2 bars calling core). Same root issue as R3. |
| FR-3.1 Tags incl. content category | PARTIAL | No tag/taxonomy model (R8). |
| FR-3.2 ML/EN | OK | AD-12 |
| FR-3.3 4 options, index, explanation | OK | Implicit. Make it explicit as a validation rule shared by admin/CSV/custom import. |
| FR-3.4 Not sent before window | OK | AD-5 |
| **FR-3.5 Report button** | PARTIAL | QUESTION_REPORT entity plus rate limit exist. **Missing:** reporting from inside a live match or the results screen needs the questionId in `QuestionView`/breakdown. Guests must be blocked (registered only). Duplicate-report rule. Endpoint lives in core while the context is a game match. |
| FR-3.6 Admin-reviewed PYQs | PARTIAL | See FR-11.3. |
| **FR-3.7 Source attribution** | PARTIAL | AD-12 returns attribution. Not stated *when* the client gets it (QuestionView or QUESTION_REVEALED) or that it appears in the MATCH_ENDED breakdown (FR-9.2). |
| FR-4.1 Rating band ±200 | **MISSING / BLOCKED** | R1. Also no band-widening rule as wait time grows. |
| FR-4.2 8 s bot | OK | AD-7 |
| FR-4.3 Bot badge | OK | `kind` |
| FR-4.4 Randomised bot timing | OK | AD-7 |
| FR-4.5/4.6 | OK | AD-5, AD-6 |
| FR-4.7–4.9 | OK | |
| FR-5.x Topic Duel | PARTIAL | Matchmaking is per mode **and topic**. Not stated that the queue key includes topic. Topic plus rating band will starve quickly; no fallback rule (bot after 8 s presumably). |
| FR-6.x Battle Room | OK | AD-13. Room action list unspecified (AD-10). |
| FR-6.4 Host custom topic source | OK | AD-12 owner check |
| FR-6.7 Live scoreboard | OK | SCOREBOARD |
| FR-7.x Solo Practice | OK | AD-5 |
| FR-8.x Custom topics | OK | Conventions. FR-8.9 (schema reference + GPT prompt in UI) is web-only, fine. |
| FR-9.1/9.2 | PARTIAL | Breakdown in MATCH_ENDED is fine. Not stated whether a player who reconnects after the end, or opens the results later, can still get the breakdown (it isn't persisted). |
| **FR-9.3 Rematch / Play again / Return home** | MISSING | R2. |
| FR-10.1–10.5 | OK | AD-8, AD-14 |
| FR-11.1/11.2 CRUD + CSV | PARTIAL | No CSV column contract. CSV must share the same validator as custom-topic import and the admin form. |
| **FR-11.3 Draft queue, publish/discard** | PARTIAL | Only "PUBLISHED" is mentioned. State machine missing (R4). |
| FR-11.4 Tagging UI incl. attribution | PARTIAL | R8 |
| FR-11.5 Report queue with note | OK | Entity exists. |

### Non-functional and quiet requirements

| Req | Status | Note |
|---|---|---|
| <200 ms answer confirm | OK | AD-4, Mumbai VPS. Add a target-measurement point (server-side p95 metric). |
| <500 ms scoreboard | OK | |
| **App initial load <5 s on 3G** | MISSING | No bundle budget (e.g. initial JS ≤ 150 KB gz), no code-split rule beyond `/admin`, no font strategy (Malayalam web fonts are heavy; use a system font or subset). |
| **2 GB RAM Android** | MISSING | No client memory/perf rule (e.g. no heavy animation libs, a cap on the reconnect/backoff loop). |
| ≤ 4 min session | OK | Implied by 10 × 15 s. |
| Server timing/scoring | OK | AD-5, AD-6 |
| Rate limit answers | PARTIAL | "Per-connection inbound limit" has no number. First-answer-wins already caps the scoring impact. Set a number. |
| Room code entropy | OK | AD-13 (32^6 ≈ 1.07e9) |
| Uptime 99.5% | PARTIAL | Single VPS is accepted. Monitoring, alerting, restart policy, and health checks are missing. |
| Match continues on disconnect | DEPARTURE | AD-11 (10 s grace), known |
| ML/EN | OK | |
| **PWA installable** | PARTIAL | Plugin is in the stack. No manifest/icon/offline-shell rule. No SW cache scope rule (R7). |
| **Counter-metrics: median queue wait + bot rate; completed matches only** | MISSING | `MatchCompleted` has no `queueWaitMs` and there is no matchmaking metric. Session-depth and 7-day-return metrics have no source (no session or event tracking). Decide: Micrometer metrics `matchmaking.wait` and `match.bot_filled`, plus `queueWaitMs` on the event or a separate `MatchmakingCompleted` event. |
| Goal: ≥5 coaching centers using Battle Room | MISSING | No way to identify a "coaching center" room. Accept as unmeasured at MVP or add an optional host tag. Put it in Open Questions. |
| Tone (addendum: lobby alive, host countdown, "GG", exciting scoreboard) | PARTIAL | UX-level. The architecture implication is protocol: a lobby presence list (ROOM_UPDATED), a host-controlled countdown, and post-match reactions need named room actions/message types in AD-10. |
| Never-list (no courses, no library) | OK | Nothing violates it. |

---

## Top suggested fixes (prioritised)

1. **Critical — R1:** Amend AD-2 and AD-8. ratings-service publishes `RatingChanged` and game-service keeps a read-model in Valkey (`rating:{mode}:{userId}`, default 1200), **or** allow one sync edge game→ratings `GET /internal/ratings/{userId}` at queue join only. Also decide band widening (e.g. ±200 → ±400 at 4 s, then bot at 8 s) and include topic in the Topic Duel queue key.
2. **High — AD-8 durability:** Valkey AOF `appendfsync everysec`; consumer group `ratings`; ack after DB commit; reclaim pending entries on startup (XAUTOCLAIM); poison entries go to `minnal.match.completed.dlq`.
3. **High — R2 rematch:** New AD. After MATCH_ENDED, the actor stays in a `POST_MATCH` state for 30 s accepting `REMATCH_OFFER`/`REMATCH_ACCEPT`. Mutual accept spawns a new match actor with the same participants (a bot auto-accepts). "Play again" = `CREATE_ROOM` with `sourceFrom: previousRoomId`.
4. **High — R3/R5 identity:** Put `displayName` (and district) as JWT claims, re-issued on profile change. Set access TTL (e.g. 1 h) plus a refresh endpoint. An open STOMP session stays valid until disconnect; re-auth happens on reconnect. Add `displayName` to `MatchCompleted.participants` so ratings history needs no call to core.
5. **Medium — FR-1.4:** Decide "guest results are not carried over; the prompt shows the score only" (simplest), and web stashes the result in sessionStorage across the Google redirect.
6. **Medium — FR-11.3 / R4:** Question `status ∈ {DRAFT, PUBLISHED, DISCARDED}`, soft delete only, and `/internal/question-sets` snapshot semantics. One shared validator for the admin form, CSV, and custom JSON.
7. **Medium — counter-metrics + 3G/2 GB:** Add the matchmaking wait / bot-fill metrics and `queueWaitMs`. Add a web budget: initial JS ≤ 150 KB gz, system/subset Malayalam font, SW never caches `/api/**` or `/ws`, plus manifest requirements.
8. **Medium — AD-16 ops/security:** Per-container `mem_limit` and `-XX:MaxRAMPercentage`, compose healthchecks plus `restart: unless-stopped`, an external uptime ping (free tier), a quarterly restore drill, CORS allow-list for the Pages origin, admin bootstrap via env var, and an `/internal` service-token rotation note. Add an **Open Questions** section (DPDP data deletion, coaching-center measurement, Battle Room max into AD-13).

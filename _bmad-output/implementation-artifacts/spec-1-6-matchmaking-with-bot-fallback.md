---
title: 'Story 1.6: Matchmaking with bot fallback'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: '5ffd2ab40a64e18d6ef4753f632835f40a7647e2'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-quiz-arena-2026-11-10/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Quick Match leads to a stub. game-service has only a raw `/ws` upgrade, with no STOMP, no identity on the socket and no queue, and `contracts` has no real-time protocol. A guest can't be paired with anyone.

**Approach:**
- `contracts` gains the STOMP protocol types.
- game-service gets a STOMP endpoint authenticated by the JWT on CONNECT, a single-threaded matchmaking actor for `QUICK` (±200 → ±400 at 4 s → bot at 8 s), the question-set fetch before `MATCH_FOUND`, and a match-actor shell.
- The web app gets one WebSocket module, a live-game store, the real matchmaking screen and a live-match stub.
- The epics.md Story 1.6 acceptance criteria are the contract. This spec adds the decisions below.

## Boundaries & Constraints

**Always:**
- **Contracts (`in.minnal.contracts.realtime`, plain Java records/enums, no Jackson annotations):**
  - `ServerMessage(type, matchId?, roomId?, seq?, refSeq?, serverTime, payload)`.
  - `MessageType`: every AD-10 type, plus `MATCHMAKING_CANCELLED` (the cancel ack). `REMATCH_*` = `REMATCH_REQUESTED`, `REMATCH_ACCEPTED`, `REMATCH_DECLINED`, `REMATCH_EXPIRED` (Story 1.10 may rename them).
  - `ErrorCode`: `UNAUTHENTICATED`, `ALREADY_IN_MATCH`, `SERVER_DRAINING`, `RATE_LIMITED`, `FORBIDDEN_MODE`, `MODE_UNAVAILABLE`, `CANCEL_REJECTED`, `NOT_IN_QUEUE`, `BAD_REQUEST`.
  - `MatchMode {QUICK, TOPIC_DUEL, BATTLE_ROOM}` and `ParticipantKind {USER, GUEST, BOT}`.
  - `Participant(participantId, displayName, kind)`. `participantId` is a random UUID per match, never the `sub`.
  - Payloads:
    - `MatchFoundPayload(matchId, mode, participants, questionCount, questionSource, selfParticipantId)`. `selfParticipantId` is an addition so the client knows which participant it is.
    - `MatchmakingFailedPayload(reason)`.
    - `ErrorPayload(code, matchId?)`.
  - `Destinations` constants for the AD-10 topics, queues and client sends.
  - The existing `QuestionSource` and the internal DTOs are reused.
- **Golden samples:** a contracts test serialises one sample of each message and DTO to `contracts/samples/*.json` and fails on drift (regenerate with `-Dcontracts.updateSamples=true`). It also round-trips each one, and writes `enums.json` with every enum's values. The web contract test validates those files with the same runtime parsers the WS module uses, and checks the TS enum unions against `enums.json`.
- **STOMP (game):** native WebSocket at `/ws`, with the existing origin check and prod fail-fast. App prefix `/app`, simple broker `/topic` and `/queue`, user prefix `/user`. Private messages go to `/user/queue/game`. JSON omits nulls, and `serverTime` is an ISO-8601 `Instant`.
- **CONNECT auth:** an inbound channel interceptor decodes `Authorization: Bearer <jwt>` from the CONNECT native headers with the existing `JwtDecoder`. The principal name is `sub`.
  - A missing, invalid or expired token, or an unreachable JWKS, gets a STOMP `ERROR` frame and the connection closes.
  - Any non-CONNECT frame from an unauthenticated session is rejected.
  - An open session isn't cut when its token expires.
- **Participation registry:** a `sub` holds at most one activity, `QUEUED(mode)` or `IN_MATCH(matchId)`, from any of its sessions. The claim is atomic.
  - A second join gets a private `ERROR ALREADY_IN_MATCH`, with `matchId` when in a match.
  - Sessions are tracked per `sub`. When the last session closes, a `DISCONNECT` goes to the queue actor.
- **Join gate (in this order):**
  1. Draining → `SERVER_DRAINING`.
  2. Unknown mode → `BAD_REQUEST`.
  3. A GUEST on a mode other than QUICK → `FORBIDDEN_MODE`.
  4. A non-guest on TOPIC_DUEL or BATTLE_ROOM → `MODE_UNAVAILABLE` (until Epics 4/5).
  5. Already active → `ALREADY_IN_MATCH`.
  6. Otherwise a `JOIN` event goes to the actor. Client body fields such as `rating` are ignored.
- **Matchmaking actor:**
  - One actor per mode (only QUICK is created). It processes `JOIN | CANCEL | DISCONNECT | TICK | SET_FETCHED` on one thread.
  - Queue state is a pure, clock-driven domain class, unit-tested without threads. TICK fires every 250 ms.
  - **Pairing rule:** a waiting player's band is ±200, or ±400 once they have waited ≥ 4 s. Two humans pair when their rating difference ≤ the band of the longer-waiting one. Candidates are considered oldest first, and the closest rating wins (ties go to the earliest join).
  - At ≥ 8 s the player gets a `BOT` participant ("Minnal Bot") at their own rating.
  - Ratings come from `RatingCache` (in memory; empty until Epic 2): a missing entry and any guest count as 1200.
- **Question set:** after pairing, an async `POST {MINNAL_CORE_URL}/internal/question-sets` `{BANK, {category: KERALA_PSC}, count 10, requesterId: sub of the first human}` with `X-Internal-Token`.
  - It runs on its own executor with a 2 s total timeout, and its result returns as `SET_FETCHED`.
  - On success: create the match shell, move the humans to `IN_MATCH`, and send each human `MATCH_FOUND`.
  - On a timeout, 4xx or 5xx: `MATCHMAKING_FAILED` to each human, then release them (they are not re-queued).
- **Cancel:**
  - While queued: removed from the queue and released, with a private `MATCHMAKING_CANCELLED`.
  - While pairing or in a match: `CANCEL_REJECTED`, and the pairing goes ahead.
  - Not queued: `NOT_IN_QUEUE`.
- **Match-actor shell:** holds `matchId`, `mode`, participants, the set and `queueWaitMs` per human, in memory, with no behaviour. **Decision:** so nobody stays stuck `IN_MATCH` before Story 1.7, the shell releases its humans and is discarded once every human's last session has closed, or 5 min after creation (`minnal.match.shell-ttl`).
- **Drain:** a `DrainState` flag, set when game-service begins shutdown (a `SmartLifecycle` stop), makes joins fail. The graceful wait for live matches stays with Stories 1.2/1.7.
- **Metrics/logs:**
  - A timer `minnal.matchmaking.queue.wait` (0.5 percentile).
  - A counter `minnal.matchmaking.pairings{opponent=human|bot}`.
  - One INFO JSON line per pairing, with `matchId`, `userId` (each human `sub`) and `queueWaitMs`.
- **Web:**
  - `web/src/realtime/` owns the only `@stomp/stompjs` client, at same-origin `ws(s)://<host>/ws`, with the bearer token from `guestSession.getAccessToken()`.
    - It connects lazily on the first join and stays open. There is no auto-reconnect (that is Story 1.9).
    - A CONNECT auth error invalidates the token and retries once.
    - It alone writes the Zustand live-game store. Components only read the store and call its actions (`joinQuickMatch`, `cancelMatchmaking`).
  - **Matchmaking screen** (replaces the stub; no tab bar). It joins on mount.
    - It shows `matchmaking.searching` and a Cancel `Button`. An animated indicator appears, or under reduced effects static text plus an elapsed-seconds count.
    - Cancel sends cancel and goes Home on `MATCHMAKING_CANCELLED`. If the socket isn't open yet, it closes the attempt and goes Home. Leaving the route while searching sends cancel.
    - After `MATCH_FOUND` it shows the found state: for a bot, "Minnal Bot joined" plus the BOT badge, announced once on the polite region. Then it waits `max(fontsReady(), 1 s hold)` and opens `/match`. **Decision:** the 1 s hold keeps the badge readable.
    - Errors show an inline alert:
      - `MATCHMAKING_FAILED` / connection failure: the reason plus Retry (re-join).
      - `SERVER_DRAINING`: the one-line "try again in a moment" plus Retry.
      - `ALREADY_IN_MATCH` with a `matchId`: "Back to your match" → `/match`; without one: an "already searching on another tab/device" line.
  - **BOT badge:** `design/BotBadge.tsx`, a sm-radius outline tag with catalogue text "BOT" in `<span lang="en">`.
  - **Live-match stub `/match`:** "Match found · vs" + name (never inflected), the BOT badge for a bot, and a Home link. With no match in the store it shows a "no match on this screen" line plus Home.
  - Every new string goes in the catalogue in both languages with `signoff: ['ml','en']`. `matchmaking.stub` is removed. Each route sets `document.title`.

**Never:**
- Match play, timers, answers or bot answering (1.7).
- Reconnect or SNAPSHOT (1.9).
- Rematch (1.10).
- Inbound rate limiting (`RATE_LIMITED` is defined but not enforced; that is 1.7).
- The `minnal.rating.updated` consumer (Epic 2).
- Topic Duel queues.
- SockJS.
- Spring Security messaging.
- Any DB or Valkey writes from game.
- Sending answers or questions to clients.
- Client-supplied ratings.
- Volt on these screens.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| CONNECT ok | valid guest JWT | CONNECTED; principal = `sub` | N/A |
| CONNECT bad | none / tampered / expired | STOMP ERROR, socket closed | N/A |
| Close pair | A 1200, B 1350 join at t0 | paired at once; both get MATCH_FOUND | N/A |
| Wide pair | A 1200, B 1500 at t0 | unpaired at 3.9 s, paired at 4.0 s | N/A |
| Bot fill | lone player at 8.0 s | BOT participant at her rating; `opponent=bot` counted | N/A |
| Guest vs user | guest (1200) + user rated 1300 | paired | N/A |
| Set fails | core times out (> 2 s) / 422 / 503 | both get MATCHMAKING_FAILED; released; re-join works | client Retry |
| Cancel queued | cancel before pairing | MATCHMAKING_CANCELLED; released | N/A |
| Cancel late | cancel while the set fetch is in flight | CANCEL_REJECTED; MATCH_FOUND follows | N/A |
| Disconnect queued | last session closes | removed from the queue; a second session keeps her queued | N/A |
| Double join | same `sub`, second session, queued or in match | ERROR ALREADY_IN_MATCH (+ matchId) | client offer |
| Guest forbidden | guest joins TOPIC_DUEL | ERROR FORBIDDEN_MODE | N/A |
| Draining | flag set, join | ERROR SERVER_DRAINING | client notice + Retry |
| Client rating | join body `{rating: 3000}` | ignored; 1200 used | N/A |
| Shell release | all humans disconnect, or 5 min | `sub`s free to join again | N/A |

</frozen-after-approval>

## Code Map

**Contracts:**
- `contracts/pom.xml`: add the Jackson 3 `tools.jackson.core:jackson-databind` dependency, test scope only (the Boot parent manages its version). The enforcer bans only Spring.
- `contracts/src/main/java/in/minnal/contracts/internal/*`: already has `QuestionSetRequest`/`Response`/`Filters`, `InternalQuestion` and `QuestionSource`. Reuse them and don't change their shape. They have no tests yet; add round-trip tests.
- New: `contracts/src/main/java/in/minnal/contracts/realtime/*` with `package-info.java`, and `contracts/src/test/java/.../realtime/*`, plus the golden files in `contracts/samples/`.

**game-service** (`services/game`):
- `platform/infrastructure/ws/WebSocketConfig.java`: replace the raw `TextWebSocketHandler` with `@EnableWebSocketMessageBroker` (`registerStompEndpoints("/ws").setAllowedOrigins(...)`). Keep the constructor and prod fail-fast, and keep `WebSocketConfigTest` passing.
  - Configure `configureClientInboundChannel` (the auth interceptor) and `configureMessageConverters`, using the app `JsonMapper` with non-null inclusion.
  - The simple broker needs a `TaskScheduler` for heartbeats (10 s/10 s).
- `platform/infrastructure/security/SecurityConfig.java`: `/ws` is already in `PUBLIC_PATHS`. Reuse the `JwtDecoder` bean and `MinnalJwtAuthenticationConverter` (package-private; add a public factory or move the interceptor into the security package). `MinnalPrincipal` has `sub`, `roles` and `name`; `hasRole(Role.GUEST)`.
- New feature packages:
  - `in.minnal.game.matchmaking.(api|application|domain|infrastructure)`:
    - the STOMP `@MessageMapping("/matchmaking/{mode}/join|cancel")` controller;
    - the queue domain and actor;
    - `QuestionSetClient` (`RestClient`, `JdkClientHttpRequestFactory` with a 1 s connect and 2 s read timeout, plus `CompletableFuture.orTimeout(2 s)`);
    - `RatingCache`.
  - `in.minnal.game.match.(application|domain)`: `MatchShell` and `MatchRegistry`.
  - `in.minnal.game.platform.(actor|session|drain)`: the generic single-thread `Actor<E>` (named daemon thread, `tell(E)`, uncaught-handler logging), `PlayerSessions` (`SessionConnectEvent`/`SessionDisconnectEvent`), `ParticipationRegistry` and `DrainState`.
- `application.yaml`: add `minnal.internal.token: ${MINNAL_INTERNAL_TOKEN:}`, `minnal.core.base-url: ${MINNAL_CORE_URL:http://localhost:8081}` and `minnal.match.shell-ttl: 5m`. Note that the `deploy/.env` import gives the raw `MINNAL_INTERNAL_TOKEN` key, so the placeholder resolves in the IDE.
- Clock: inject a `Clock` bean (game has none yet); tests use a mutable test clock.
- Tests:
  - Reuse `TestJwks` (security test package) and the JDK `HttpServer` pattern for a fake core.
  - Integration tests use `@SpringBootTest(RANDOM_PORT)` and `WebSocketStompClient` (spring-messaging, already on the classpath via starter-websocket), with short configurable thresholds or a test clock so they never sleep 8 s.
  - `application-test.yaml` excludes Redis. Keep it that way.

**Deploy:**
- `deploy/compose.yaml` game-service: add `MINNAL_CORE_URL: http://core-service:8081`. `MINNAL_INTERNAL_TOKEN` is already passed.
- `deploy/verify-local.sh` §11 (L181–191): the 101/403 upgrade checks must still pass with STOMP. Add a check that a STOMP CONNECT without a token gets an `ERROR` frame. Use a small `node` or `python3` one-shot (the script already relies on `curl`); pick whichever is available, and skip with a clear message if neither is.

**Web** (`web/src/`):
- `auth/guestSession.ts` L315: `guestSession.getAccessToken()` / `invalidate(token)`. Reuse them, and don't touch the refresh logic.
- `App.tsx` `ROUTES`: replace `MatchmakingStub` with `screens/matchmaking/MatchmakingScreen.tsx`, and add `/match` → `screens/match/LiveMatchStub.tsx`. Delete `screens/MatchmakingStub.tsx`.
- `shell/useHideTabBar.ts`: call it on both screens.
- `shell/announce.ts`: `announce(text)` (polite).
- `design/fonts.ts`: `fontsReady()`, already capped at 3 s.
- `motion/reduceEffects.ts`: `useReducedEffects()`.
- `design/Button.tsx`: `variant="secondary"` for Cancel, and `PageColumn`.
- `shell/router.ts`: `navigate`, with `{replace:true}` when leaving matchmaking for `/match`.
- `i18n/catalogue.ts` L147–148: `matchmaking.searching` and `matchmaking.botJoined` already exist. Remove `matchmaking.stub` (L115).
  - New keys: `matchmaking.elapsed` (`{{seconds}}`), `matchmaking.failed`, `matchmaking.connectionFailed`, `matchmaking.draining`, `matchmaking.alreadyInMatch`, `matchmaking.alreadySearching`, `matchmaking.returnToMatch`, `match.foundVs`, `match.stubNote`, `match.none`, `badge.bot`, `common.home`, `title.match`.
- New: `realtime/protocol.ts` (types + runtime parsers), `realtime/liveGameStore.ts`, `realtime/connection.ts` (an injectable client factory for tests), and `realtime/contract.test.ts` (reads `../../../contracts/samples/*.json` via `node:fs`).
- Tests follow `shell/shell.test.tsx` (`renderApp`) and `test-utils/guest.ts` (`stubFetch`, `fakeJwt`). Mock the STOMP client through the factory, never with a real socket.

## Tasks & Acceptance

**Execution:**
- [x] `contracts/**` + `contracts/samples/*`: the realtime types, samples, round-trip and drift tests, including the internal DTOs.
- [x] `services/game/.../platform/(actor|session|drain)/*` + tests: the actor base (proves events run on one thread in order), the session tracking, the registry's atomic claim/release, and the drain lifecycle.
- [x] `services/game/.../platform/infrastructure/ws/*` + security: STOMP config, the CONNECT interceptor and JSON converter. Integration tests for CONNECT ok, bad, expired and none.
- [x] `services/game/.../matchmaking/domain/*` + unit tests: queue state and pairing per the matrix (±200, 4 s widen, 8 s bot, oldest-first and closest, guest vs user, cancel, disconnect), on a controllable clock.
- [x] `services/game/.../matchmaking/(application|infrastructure|api)/*`, `match/*`: the actor wiring, join gate, set client, shell + TTL/disconnect release, metrics and log line. Integration tests: two STOMP clients pair and both get MATCH_FOUND; fake core 422/503/slow → MATCHMAKING_FAILED; double join; guest forbidden mode; draining; cancel early and late.
- [x] `services/game/src/main/resources/application.yaml`, `deploy/compose.yaml`, `deploy/verify-local.sh`: config and the CONNECT check.
- [x] `web/src/realtime/*` + tests: the parsers, the contract test against the samples, the store, and the connection (auth retry once, a single client, messages → store).
- [x] `web/src/design/BotBadge.tsx`, `screens/matchmaking/*`, `screens/match/*`, `App.tsx`, `catalogue.ts` + tests: the screen states (searching, reduced-effects elapsed count, bot joined + a single announcement, failed + Retry, draining, already-in-match offer, cancel → Home, back-navigation cancel, fonts/hold → `/match`), the stub with and without a match, and the 48px Cancel.

**Acceptance Criteria:**
- Given `./mvnw verify` with Docker running, when it runs, then every module passes and the enforcer rules hold.
- Given `cd web && npm run typecheck && npm test && npm run check:i18n && npm run build:check`, when it runs, then everything passes within the 150 KB initial-JS budget.
- Given the stack running, when `deploy/verify-local.sh` runs, then every check passes, including the STOMP CONNECT check.
- Given two browser tabs with different guest tokens (one in a private window), when both tap Quick Match, then both reach the `/match` stub showing each other's guest name; and given one tab alone, then after about 8 s it shows "Minnal Bot joined" with the BOT badge.

## Implementation Notes

- **Choices the spec left open:**
  - Client frames run inline on the socket thread (`SyncTaskExecutor`) instead of `setPreserveReceiveOrder`, whose decorator swallowed the ERROR frame for a bad CONNECT and logged the token. The interceptor also strips `Authorization` from CONNECT.
  - Clients may send only to `/app/**` and subscribe only to `/user/**` or `/topic/**`.
  - `MATCH_FOUND`/`MATCHMAKING_FAILED` go to every session of the `sub`; errors and the cancel ack go to the requesting session only.
  - `DrainState.start()` clears the flag, because Spring's test-context cache restarts contexts.
  - A guest is anyone without the `USER` role.
  - The metrics carry a `mode` tag as well as `opponent`.
  - The pairing log line lists `userId` and `queueWaitMs` per pairing.
- **After review:**
  - `HttpQuestionSetClient` uses Boot's `RestClient.Builder` (new dependency `spring-boot-starter-restclient`, BOM-managed).
  - `MatchShell` carries `ratings` (participantId → rating, the bot at the human's).
  - "Back to your match" opens `/match?matchId=…`.
  - The shell expiry is cancelled on discard.
  - `StompReceiveOrderTest` pins SUBSCRIBE-before-SEND ordering (30 repeats).
- **Verified:**
  - `./mvnw verify`: BUILD SUCCESS. contracts 15, core 114, game 109, ratings 23 tests.
  - Web: typecheck, 413 tests, `check:i18n`, `build:check` (113.4 KB initial JS) all pass. One run reported 386 tests in 24 files; three reruns gave 413/25 and it didn't reproduce.
  - `deploy/verify-local.sh`: all PASS, including the two new STOMP checks. This ran before the review patches, on a throwaway `minnal-verify16` stack (since removed).
  - Against real core: a lone guest got Minnal Bot at about 8.2 s. With the empty bank, the 422 became `MATCHMAKING_FAILED`.
- **Not done:**
  - The two-tab manual check is blocked: the starter CSV has no `reviewedBy` (Story 1.4), so the seed loads nothing and every match fails with `MATCHMAKING_FAILED` until the bank is reviewed and seeded.
  - The reduce-effects and screen-reader checks are also still to do.

## Spec Change Log

## Review Triage Log

Layers: BH = Blind Hunter, ECH = Edge Case Hunter, VG = Verification Gap.

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | BH | Going Home from the `/match` stub keeps the player `IN_MATCH` up to 5 min (the socket stays open) | medium | Real, but it is the approved frozen decision (release on all-disconnect or the 5 min TTL until Story 1.7) | reject (intent decision) |
| 2 | BH, ECH | "Back to your match" opens an empty (other tab) or stale (earlier match) stub | medium | `LiveMatchStub` renders `liveGameStore.match` with no `matchId` check | patch |
| 3 | BH, VG | The bot's rating (the human's own) is computed but never stored in the shell | low | `Pairing.botRating()` has no production caller; the spec says the BOT is at her rating | patch |
| 4 | BH | `HttpQuestionSetClient` uses the static `RestClient.builder()`, skipping Boot's observation and JSON setup | low | Direct correction: inject `RestClient.Builder` | patch |
| 5 | BH | `orTimeout` doesn't cancel the in-flight HTTP call | low | The call ends within about 1 s anyway (read timeout); no observable harm | reject |
| 6 | BH | A missing `MINNAL_INTERNAL_TOKEN` only warns instead of failing prod | low | Matches core's fail-closed + WARN convention for the same token | reject |
| 7 | BH | Any authenticated client may SUBSCRIBE to any `/topic/match/{id}` | medium | Nothing broadcasts on topics in 1.6; it matters when 1.7 adds match broadcasts | defer |
| 8 | BH | The JWKS fetch on CONNECT runs on the socket thread (SyncTaskExecutor) | low | Only on a cold key cache or a new kid; bounded by the JWKS client timeout | defer |
| 9 | BH, ECH | `MATCH_FOUND`/`MATCHMAKING_FAILED` reach every tab and are applied in any phase | low | An idle tab's store changes but nothing renders; its next Quick Match gets ALREADY_IN_MATCH + the offer (fixed by #2) | reject |
| 10 | BH | The expiry task keeps every shell (answers included) reachable for the full TTL | low | The lambda captures `shell`; the future is never cancelled. Direct correction | patch |
| 11 | BH | `RealtimeSamplesTest` resolves `samples/` from the working directory | low | Breaks an IDE run from the repo root; direct correction | patch |
| 12 | BH | `MatchmakingFailedPayload.reason` is a free string, absent from `enums.json` | low | The golden sample pins today's value; an enum adds contract surface | reject |
| 13 | BH | The verify-local STOMP check ignores https and the Node fallback may drop Origin | low | The script targets the local http Caddy only; the check passed on a real stack | reject |
| 14 | BH | `aSlowCoreTimesOutAfter2s` asserts a tight wall-clock window | low | 2.6 s upper bound can flake under CI load; direct correction | patch |
| 15 | ECH | A RuntimeException after `queue.complete` leaves the Queued claim held | low | Needs `matches.create` or a template send to throw; no reachable trigger shown; the fix adds guards | reject |
| 16 | ECH | `toPlayer` throwing mid-loop skips the second human's release | low | Same as #15 | reject |
| 17 | ECH | A disconnect while pairing never releases the claim | false | A pairing always ends in `SET_FETCHED`: failure releases the claim, success creates the shell and `releaseIfAbandoned` frees it | reject |
| 18 | ECH | Closing the joining tab while another tab of the same `sub` stays open leaves that idle tab queued and matched | low | Real but rare; queue membership is per `sub`, not per session. Belongs with 1.9's session work | defer |
| 19 | ECH | A token with no `name` claim yields a null displayName that the web rejects | false | core always issues `name` (guest and Epic 2 tokens); the issuer is ours | reject |
| 20 | ECH | Back, then an instant re-tap races the actor's Cancel → false ALREADY_IN_MATCH | low | Needs the re-join to reach the server before the actor handles a queued Cancel (microseconds); not met in practice | reject |
| 21 | ECH | A late `MATCHMAKING_CANCELLED` flips a new search to `cancelled` | low | `onIncoming` sets `cancelled` in any phase; direct correction | patch |
| 22 | ECH | Retry is offered for non-retryable codes (FORBIDDEN_MODE, …) | low | The UI only joins QUICK, so those codes can't reach this screen | reject |
| 23 | ECH | MATCH_FOUND with only self renders "vs" with no name | false | The server always adds a second human or a bot | reject |
| 24 | ECH | A null sessionId in `toSession` misroutes | false | STOMP messages always carry the simp session id | reject |
| 25 | ECH | A tick below 1 ms makes `scheduleAtFixedRate` throw | low | Config-only, fails loudly at startup | reject |
| 26 | VG | No deterministic test for SUBSCRIBE-before-SEND ordering on one session | medium | Pre-verified: no test sends both back to back; removing the SyncTaskExecutor would pass the suite | patch |
| 27 | VG | A wrong-size question set is never tested on either rejection path | medium | Pre-verified; core already guarantees the exact count | defer |

## Design Notes

- **Why a pure queue class inside the actor:** the pairing timing rules (3.9 s vs 4.0 s, 8 s bot) are testable deterministically without threads or sleeps. The actor only serialises events and performs effects (sends, the async fetch). This is the same shape Story 1.7's match actor will use.
- **Why a registry outside the actors:** "one activity per `sub`" spans the queue actor and match shells. One atomic `ConcurrentHashMap.compute` is the narrowest shared state. Actor-owned state stays thread-confined (AD-4).
- **Shell TTL:** without Story 1.7's match lifecycle, an `IN_MATCH` claim would never release, and every guest token could play only once per day.
- **`participantId` ≠ `sub`:** the opponent must not learn a registered user's id. `selfParticipantId` tells each client which participant is itself.

## Verification

**Commands:**
- `./mvnw verify`: expected BUILD SUCCESS (Docker running).
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run build:check`: expected all green.
- `deploy/verify-local.sh`: expected all PASS on a fresh stack.

**Manual checks:**
- Two-tab pairing and the 8 s bot fill (above), in Malayalam and in English.
- Reduce effects on: static text plus the elapsed count, no animation.
- A screen-reader pass: "Minnal Bot joined" is announced once, and Cancel is reachable.

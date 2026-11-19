# Deferred Work

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-project-scaffold-runs-locally.md`
  summary: Configure REST CORS in core and ratings from `minnal.cors.allowed-origins`, allowing the Pages origin only.
  evidence: Today the property gates only the `/ws` handshake. Story 1.2's acceptance criteria own the CORS allow-list.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-project-scaffold-runs-locally.md`
  summary: Add a negative test proving the Enforcer rule fails when one service module depends on another (e.g. a maven-invoker fixture in CI).
  evidence: `./mvnw verify` only ever runs against compliant POMs, so the failing case has never been exercised.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-project-scaffold-runs-locally.md`
  summary: Run `deploy/verify-local.sh` (or an equivalent) in CI on every change.
  evidence: The stack-level checks run only when someone remembers to run them by hand. There is no CI until Story 1.2.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-project-scaffold-runs-locally.md`
  summary: Give each service its own Valkey ACL user, limited to its own key prefix plus the `minnal.*` streams.
  evidence: Every service shares one full-access password, so the `core:`/`game:`/`ratings:` prefixes are only a convention, unlike the Postgres schema isolation.
- source_spec: none
  summary: Story 1.3 part 2, Malayalam font and bilingual text. Covers: self-hosted Noto Sans Malayalam subset (U+0D00-0D7F, U+200C-200D, U+25CC, U+0964-0965, shaping features kept) with a metric-matched fallback; preload and precache; swap vs optional faces; a shaping fixture page; ml/en catalogue holding every Voice & Tone string, with TBD entries flagged; an i18n lint rule against hard-coded strings; <html lang> and the <Lang> helper; Latin-digit number formatting; document.title per route.
  evidence: Split from Story 1.3 at the build scope check (user chose Split). It can ship as its own PR and depends only on part 1's tokens.
- source_spec: none
  summary: Story 1.3 part 3, shell, motion safety and offline. Covers: bottom tab bar Play/Rooms/Ranks/Me with placeholder surfaces, scroll memory and a route-level hide; skeleton loaders; Reduce-effects store (on/off/follow-phone) with auto-fallback and a dev toggle; app-wide flash scheduler with a fake-timer test and a QA fixture; shared live regions; offline banner; shell-only service worker; manifest (standalone, orientation any); 150 KB gzipped initial-JS budget check as an npm script that Story 1.2's CI will call.
  evidence: Split from Story 1.3 at the build scope check (user chose Split). It can ship as its own PR and depends on parts 1 and 2.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-design-foundation-theme-and-primitives.md`
  summary: Add a post-build check over `web/dist`: every token is a custom property in the built CSS, the initial JS is ≤ 150 KB gzipped, no DesignFixture code ships, and the classes used by primitives were actually generated.
  evidence: The token parity test reads the source `theme.css` only, so the built-output criteria regress silently. This belongs with the bundle check in Story 1.3 part 3.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-design-foundation-theme-and-primitives.md`
  summary: Automate the dark-swap and reflow checks (320px; 360px at 200% text) in a real browser, e.g. Playwright, when the shell lands.
  evidence: jsdom can't lay out, so these matrix rows were verified only in a one-off headless Chrome run.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-malayalam-font-and-bilingual-text.md`
  summary: Extend the post-build `web/dist` check to assert the Malayalam woff2 is listed in `dist/sw.js`, the font preload is in `dist/index.html`, and the `/fonts/...` URLs still resolve under a non-root `BASE_URL`.
  evidence: These Story 1.3 part 2 acceptance criteria were verified by hand only (grep on dist); nothing fails if a Vite or workbox change drops them. Fold into the part 3 bundle/dist check.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-shell-motion-safety-and-offline.md`
  summary: Story 1.2's CI must run `cd web && npm ci && npm run typecheck && npm test && npm run build:check` on every change.
  evidence: The 150 KB budget and the dist checks (`check:dist`) run only by hand; the repo has no `.github/workflows` yet.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-shell-motion-safety-and-offline.md`
  summary: Decide how the flash scheduler treats requests queued while the tab is hidden (expire them, or have peak callers cancel on `visibilitychange`) when Story 1.8 adds the first peaks.
  evidence: rAF pauses in a hidden tab but the queue does not, so on return a backlog plays one flash per second after its trigger has passed (medium, needs peak semantics).
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-seeded-psc-question-bank.md`
  summary: Add a Spring context test that starts core-service with the `seed` profile (behind an overridable exit hook) and proves `minnal.seed.file`, `application-seed.yaml` and the `SeedRunner` bean wire up without a web server.
  evidence: Only the package-private `SeedRunner` constructor is tested; renaming `minnal.seed.file` or deleting `application-seed.yaml` breaks the documented seed command with every test still green.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-a-guest-can-open-minnal-and-see-quick-match.md`
  summary: Rate-limit `POST /api/core/v1/auth/guest` (per IP at Caddy or a Valkey token bucket in core) before guest `sub`s can queue for matches.
  evidence: The endpoint is public and unauthenticated, so anyone can mint unlimited signed guest identities. Story 1.5's approved intent excluded rate limiting.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-a-guest-can-open-minnal-and-see-quick-match.md`
  summary: Sync the guest token across tabs (a `storage` event on `minnal.guestToken`), so one device keeps one `sub` when Story 1.6 enforces one queue/match per `sub`.
  evidence: Each tab refreshes on its own timer and overwrites the stored token, so two open tabs end up with different `sub`s after a refresh.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-matchmaking-with-bot-fallback.md`
  summary: Authorize STOMP subscriptions to `/topic/match/{matchId}` and `/topic/room/{roomId}` (only participants), deny-by-default for other `/topic/**`.
  evidence: `StompConnectAuthInterceptor` lets any authenticated client subscribe to any `/topic/**`; harmless in 1.6 (no broadcasts) but Story 1.7 broadcasts match state there.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-matchmaking-with-bot-fallback.md`
  summary: Move the CONNECT JWT decode (lazy JWKS HTTP fetch) off the WebSocket I/O thread, or bound it tightly.
  evidence: The clientInbound channel runs inline (SyncTaskExecutor) for frame ordering, so a cold JWKS cache with core slow blocks a container thread per CONNECT until the JWKS timeout.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-matchmaking-with-bot-fallback.md`
  summary: Track the matchmaking queue per session as well as per `sub`, so closing the joining tab while another tab stays open doesn't leave the idle tab queued and matched.
  evidence: `MatchmakingActor` drops a seeker only on `LastSessionClosed`; the other tab keeps the `sub` connected and gets `MATCH_FOUND` it never asked for. Fits Story 1.9's session/reconnect work.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-matchmaking-with-bot-fallback.md`
  summary: Add a FakeCore mode returning fewer questions than requested and a flow test asserting both players get `MATCHMAKING_FAILED` and are released.
  evidence: Both wrong-size checks (`HttpQuestionSetClient.call`, `MatchmakingActor.onSetFetched`) are untested; core enforces the exact count today, so this is a second line of defence to add when Story 1.7 consumes the set.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-7-live-match-engine.md`
  summary: Tell clients when a match ends abnormally (a handler exception): a terminal broadcast or private notice, instead of the match silently vanishing.
  evidence: `MatchActor.handle` ends the match and frees players on a RuntimeException but sends nothing; clients sit on an open question. It fits Story 1.9's abort/notice work.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-7-live-match-engine.md`
  summary: Mark a match participant CONNECTED again when a new session of her `sub` opens during the match.
  evidence: Only `Disconnect` is handled, so `MatchParticipant.connection` goes stale after a blip; Story 1.9's grace and forfeit will read it.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-7-live-match-engine.md`
  summary: Add an integration test that the inbound rate-limit bucket is removed after a clean DISCONNECT and after an abrupt socket close.
  evidence: Only `InboundRateLimiter.remove` is unit-tested; deleting both removal call sites leaks one map entry per session with every test green.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-7-live-match-engine.md`
  summary: Warm up game-service at startup, before it reports healthy (decode a sample question-set response and build one in-memory match state, or make one real question-set call when core is up), so the first pairing after a game restart doesn't come close to the 2 s question-set timeout.
  evidence: On 2026-11-12 a Quick Match failed after the full ~2 s right after a restart. Measured with throwaway copies (IntelliJ JIT flag): a fresh core answers its first `/internal/question-sets` in 0.05–0.07 s, but a game that has not yet completed a successful pairing takes about 1.2–1.5 s from pairing to `MATCH_FOUND`, against 0.1–0.5 s once warm. It didn't reproduce after warm-up. To confirm, look for a `TimeoutException` in game's `question set unavailable, pairing failed:` log line. Risk: the first player after a game deploy on the 2 vCPU VPS may get `MATCHMAKING_FAILED`.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-live-match-screen-and-peak-moments.md`
  summary: Show feedback on the live match screen when an answer can't be sent (socket closed), instead of a silent no-op tap.
  evidence: `submitAnswer` returns false and `OptionList` ignores it; it belongs with Story 1.9's reconnect banner and state.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-live-match-screen-and-peak-moments.md`
  summary: Show a reveal whose `QUESTION_STARTED` was missed, as part of Story 1.9's gap/resync handling.
  evidence: The screen filters reveals by the current question index, so a lost `QUESTION_STARTED` hides the next reveal while the phase advances.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-live-match-screen-and-peak-moments.md`
  summary: Add a test that runs `RevealBand` against the real flash scheduler (fake timers and rAF) and asserts the strike starts inside the 2 s reveal hold.
  evidence: Both reveal tests mock `requestFlash` and drain it at once; a wider flash window or a longer reveal hold would silently cancel every strike.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-11-instant-1v1-feedback-and-early-close.md`
  summary: In Story 1.9, re-check `allAnswered()` → early close whenever a participant forfeits mid-question, reject answers from forfeited participants, and keep `allAnswered()` false when every participant is forfeited.
  evidence: `MatchActor` checks early close only after an accepted answer, and `MatchState.answer` does not reject forfeited senders; unreachable today because nothing calls `MatchParticipant.forfeit()` outside tests (unverified, would be medium once 1.9 lands).
- source_spec: `_bmad-output/implementation-artifacts/spec-1-9-reconnect-forfeit-and-leave.md`
  summary: Bound the time to detect a silent network drop (tune STOMP heartbeats or the server's inactivity timeout) so the 10 s reconnect grace starts close to the real drop.
  evidence: The server publishes `LastSessionClosed` only when the socket closes; a silent drop is seen at the heartbeat timeout (10 s heartbeats plus Spring's inactivity margin), so the forfeit lands at about heartbeat timeout + 10 s and the opponent waits full windows meanwhile. Every `MatchReconnectFlowTest` case uses a clean close.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-10-results-and-rematch.md`
  summary: Story 1.10 part 2 — rematch: `/app/match/{matchId}/rematch` within the 60 s `POST_MATCH` window (human accept, instant bot accept, cancel/timeout/unavailable notes, fresh question set with the `MATCHMAKING_FAILED` path) and the waiting card on the results action bar.
  evidence: Split from Story 1.10 at build time (owner chose "A+B now, C next"); rematch is independently shippable on top of `MATCH_ENDED`/`POST_MATCH` and the results screen.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-ci-workflow.md`
  summary: Story 1.2 part 2: production deploy. Build images tagged by SHA and push them to the registry, then `docker compose up -d` on the OVH VPS with the prod profile, and publish the web build to Cloudflare Pages. Also covers Caddy TLS with HTTP→HTTPS and only 80/443 public, the external uptime monitor, the nightly `pg_dump` to R2 with backup and restore scripts, secrets in the server `.env` and GitHub secrets, the prod CORS origin, and the game-service `stop_grace_period`.
  evidence: Split from Story 1.2 at build time (owner's order 2026-11-13: CI first, deploy once the VPS and the server secrets are ready). Everything here needs the VPS, the credentials, or both.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-ci-workflow.md`
  summary: Make the timing-sensitive `MatchFlowTest` cases deterministic: `aFloodIsCutToTheRateAndOtherSessionsAreUnaffected` (once processed 0 of the expected 8–12 messages locally) and `outsidersCannotAnswerOrSubscribe:233` (a participant subscribing to another `/topic/match/*` got no ERROR frame within 5 s on CI run 43384699841, then passed on re-run). For the second, the refusal's ERROR may race the socket close, so accept ERROR or close 
  evidence: The test failed once locally during the CI build and passed when re-run alone and in both CI runs. It looks timing-sensitive, and now that every push runs CI it could turn the build red at random.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-10-rematch.md`
  summary: Amend AD-10 in the architecture spine for the rematch wire: `/app/match/{id}/rematch/cancel`, the private `REMATCH_REQUESTED`/`REMATCH_DECLINED {CANCELLED|UNAVAILABLE}`/`REMATCH_EXPIRED`, and `REMATCH_ACCEPTED` left unused (the new match arrives as `MATCH_FOUND`). Do the same for the Story 1.9 types (`PARTICIPANT_FORFEITED`, `MATCH_ABORTED`) if they are not already listed.
  evidence: The spec says the wire amends AD-10, but the diff touches no architecture doc (blind review of the rematch build).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-12-a-1v1-forfeit-ends-the-match.md`
  summary: Guard Epic 2 ratings against rated wins from a 1v1 left before any question was asked.
  evidence: A human-vs-human 1v1 forfeited in the lead-in completes with zero questions and `rated` true (owner decision 3); colluding accounts could farm wins.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-12-a-1v1-forfeit-ends-the-match.md`
  summary: Derive 1v1 from `mode` on the web (not participant count) before Epic 5, and test a TOPIC_DUEL forfeit in Epic 4.
  evidence: Rooms allow 2 humans (FR34), so a 2-player Battle Room would show 1v1 forfeit copy; TOPIC_DUEL forfeit has no test.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-12-a-1v1-forfeit-ends-the-match.md`
  summary: Add a test for a player who reconnects after her grace forfeit ended a 1v1 (unverified connection.ts edge).
  evidence: connection.ts finishes 'completed' on MATCH_ENDED when forfeited.length > 0; whether a reconnecting leaver can hit this with no outcome set is unconfirmed.

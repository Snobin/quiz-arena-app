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

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-sign-in-with-google.md`
  summary: Refresh tokens have no revocation, logout or expired-row cleanup, and refresh has no Origin/CSRF guard.
  evidence: Story 2.1 reuses one non-rotating token per sign-in; 2.2 adds rotation and the CSRF guard, 2.8 adds logout and deletion.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-sign-in-with-google.md`
  summary: Validate WEB_URL at startup and restrict credentialed CORS on refresh to the PWA origin only.
  evidence: Extra CORS_ALLOWED_ORIGINS entries also receive credentials; a bad WEB_URL fails only at the first sign-in.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-sign-in-with-google.md`
  summary: Show the sign-in outcome note on any returnTo surface and strip a stale `?signin=` on registered Home.
  evidence: Only guest Home and the Sign-in prompt mount SignInOutcomeNote.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-refresh-token-rotation-and-session-continuity.md`
  summary: Consider a short grace window for a just-rotated token, so a lost refresh response or a benign double use does not sign the player out.
  evidence: The spec forbids a grace window; a lost 200 or a concurrent loser is treated as reuse and revokes the family, including the winner's new token.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-refresh-token-rotation-and-session-continuity.md`
  summary: Purge rotated, revoked and expired refresh_token rows and add an expires_at index; add a V2-to-V3 migration backfill test.
  evidence: Each refresh inserts a row and none is deleted; the backfill is only exercised against an empty table.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-refresh-token-rotation-and-session-continuity.md`
  summary: Add a timeout around the lock-held refresh fetch, and treat a 403 from the guard as a configuration error rather than a transient one.
  evidence: A hung request holds the Web Lock for every tab; a 403 is retried every 30 s with no visible signal.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-profile-setup-and-editing.md`
  summary: Make the outbox relay safe for several core instances (FOR UPDATE SKIP LOCKED or an advisory lock), keep commit order, park poison rows, and purge published rows.
  evidence: `oldestUnpublished` is a plain SELECT; ids follow insert order; one failing row blocks all later events; published rows are never deleted.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-profile-setup-and-editing.md`
  summary: Add a Valkey Testcontainer test for `RedisStreamPublisher` and the scheduled relay wiring; skip the relay when Valkey is not configured.
  evidence: Tests use a fake publisher and `relay-enabled=false`.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-profile-setup-and-editing.md`
  summary: Product decisions on display names: uniqueness, homoglyph and mixed-script policy, and a grapheme-count parity test across JDK and browser segmenters.
  evidence: The name rule is an [ASSUMPTION] pending sign-off; Java BreakIterator and Intl.Segmenter may differ at the 24/25 boundary for some conjuncts.

- source_spec: none
  summary: Story 2.5 part B: game-service rating cache replayed from `minnal.rating.updated` with plain XREAD (latest `ratedAt` wins, missing entry is 1200), feeding the matchmaking actor, with an end-to-end test that 1500 and 1250 are not paired before the 4 s widening.
  evidence: Split from Story 2.5 by the user's choice (2026-11-19) because the story spans two large pieces; ratings-service (part A) must publish the stream first.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-ratings-service-computes-elo.md`
  summary: Make the ratings outbox relay safe for several instances (FOR UPDATE SKIP LOCKED), park poison outbox rows, purge published rows, and treat non-retryable errors (parse, validation) as dead letters on the first delivery.
  evidence: One replica is assumed; a poison head row blocks later events; malformed events wait the reclaim idle time for each of five deliveries.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-ratings-service-computes-elo.md`
  summary: Add stream and relay observability (consumer lag, pending count, applied and duplicate counters, outbox backlog age) and a ratings-service tombstone handler when account deletion (Story 2.8) defines the event.
  evidence: Only the dead-letter counter exists; nothing sets `player_directory.tombstoned_at`.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-5b-game-service-rating-cache.md`
  summary: Add a "caught up" signal (readiness or metric) for the game-service rating cache, a sanity bound on `ratedAt`, and replay progress and lag metrics.
  evidence: Players queueing during the initial replay match as 1200 and nothing shows when replay finished; a future `ratedAt` from a bad producer would pin a rating.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-6-rating-change-and-match-history.md`
  summary: Offer a later retry or refresh when the rating delta stays on "updating", and avoid the 10 s placeholder for a rated-source match with no human opponent rated.
  evidence: After the window the client stops asking; a BANK match against only a bot or guest still rates the human, so this is rare, but a slow ratings consumer leaves "updating" until she reopens the results.

- source_spec: none
  summary: Story 2.7 part B: the Ranks tab (mode switcher, period tabs, rows with rank, name, district and value, the pinned own row, empty state, one nudge for guests, scroll and selection memory) and the Home rank snippet, on top of the leaderboard API built in part A.
  evidence: Split from Story 2.7 by the user's choice (2026-11-19) because the story spans the backend and a large web surface; part A must serve the API first.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-7-leaderboards.md`
  summary: Make the leaderboard rebuild safe against concurrent live projections (pause the relay or re-project pending rows), make set and expire atomic, stream large rebuilds in batches, and add metrics for projection failures, board sizes and rebuild duration.
  evidence: A projection between the rebuild's read and its rename is overwritten until that player's next match; set and expire are separate commands; a rebuild loads all rows in memory.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-7-leaderboards.md`
  summary: Remove a deleted player from every live leaderboard (ZREM) when account deletion (Story 2.8) tombstones her.
  evidence: The projector skips tombstoned players and the API hides them, but entries written before the tombstone stay in Valkey (holding positions) until a rebuild.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-7b-ranks-tab.md`
  summary: Tie the pinned-row spacer to its measured height, take the pinned row's name and district from the board's own entry, point the empty card at a board known to have rows, and validate the leaderboard response shape.
  evidence: The spacer (96 px) and pinned min height (56 px) are fixed numbers that can mismatch large text or a wrapped name; the all-time link can lead to another empty board.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-8-settings-and-account-deletion.md`
  summary: DPDP erasure scope is still OPEN, to be answered in Story 7.4; launch stays blocked until then. Owner decision (2026-11-19, option A): Story 2.8 follows the epic wording only, so deletion marks `app_user` DELETED, revokes every refresh token, removes `user_identity`, tombstones `player_directory` and removes her from every live board. `rating`, `rating_event`, `match_record`, the `app_user` row (email, given name), the `user_profile` row, the `player_directory` name and district, and backups are all kept.
  evidence: The epic asks which personal data the DPDP Act requires to be erased or kept, and for how long; nobody has answered it.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-8-settings-and-account-deletion.md`
  summary: Story 2.8 follow-ups: a tombstoned player counts as 1200 for her opponents in a later rated match (her stored rating is not read); boards are cleared only for the current IST day and week keys (an earlier period's key expires on its own); rematch with a deleted player is not blocked in game-service; no metric for deletion handling or the deleted-user replay; the DELETED `app_user` keeps its email.
  evidence: Chosen to keep Story 2.8 to the epic wording; each is small and can be tightened once the DPDP answer is known.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-8-settings-and-account-deletion.md`
  summary: The delete-account confirm says ratings, board positions and history "will be removed" while option A keeps `rating`, `rating_event`, `match_record`, profile and email.
  evidence: Copy is the epic's wording; reconcile it with the Story 7.4 DPDP answer before launch.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-8-settings-and-account-deletion.md`
  summary: A failed logout call is swallowed, so the refresh cookie survives and a reload can restore the session after "Signed out".
  evidence: `revokeCookie` is best effort; needs a retry-on-boot or a surfaced failure (owner decision on the UX).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-8-settings-and-account-deletion.md`
  summary: Game-service deleted-user set has a boot replay window, relies on a stream capped near 100000 entries, has no metrics, and rematch and rooms are not guarded; ratings enforces 401 only on `/me/*` and `matches/{id}`.
  evidence: Same limits as the rating cache; a durable source or an entry-point-wide guard would close them.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-8-settings-and-account-deletion.md`
  summary: Small cleanups: `StreamConsumer` bare `else` for unknown streams, duplicated guard in `LogoutController`, duplicate `settings.link` and `settings.title`, tombstone lookup outside the rating transaction in `MatchCompletedHandler`, no deletion metrics.
  evidence: Raised by review; low impact.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-admin-console-access-and-layout.md`
  summary: `updatedAt` on the admin list ignores soft delete and discard, so deleted or discarded questions sort by their last edit.
  evidence: `updated_at` is `max(created_at)` over `question_version`; no delete or discard exists in 3.1. Settle in 3.2 (delete) and 3.4 (discard) by including `deleted_at` and the discard time.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-admin-console-access-and-layout.md`
  summary: `AdminMappingArchitectureTest` does not assert that every admin controller method calls `requireAdmin`.
  evidence: a new unguarded admin endpoint under the admin package would pass the source scan; add the check when 3.2 adds write endpoints.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-admin-console-access-and-layout.md`
  summary: `session.isAdmin()` is not reactive, so the console shell stays open after a token refresh that drops ADMIN.
  evidence: `AdminRoute` re-renders only on `status` changes; the API still returns 403, so only the shell lingers.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-admin-console-access-and-layout.md`
  summary: Admin list `list()` runs the page and count queries as separate statements, with the count SQL built by string slicing.
  evidence: `JdbcAdminQuestionRepository.list`; harmless until concurrent writers exist (Story 3.2); also the 300 ms target at about 2,000 questions was never measured.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-admin-console-access-and-layout.md`
  summary: `/admin` has no noindex or robots rule and is served by the player shell.
  evidence: reported by review; unverified whether crawlers reach it; the page requires sign-in so content is not exposed.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-add-and-edit-single-questions.md`
  summary: The router's guarded popstate handling re-pushes an entry on a blocked move and Leave always calls `history.back()`, so Forward and repeated blocked Backs misbehave.
  evidence: `web/src/shell/router.ts` `onPopState`; only the Back path is tested after review; settle by recording the popstate direction.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-add-and-edit-single-questions.md`
  summary: The editor distinguishes a deleted-question 409 from a stale-draft 409 by matching "deleted" in the message text.
  evidence: `QuestionEditor.tsx` 409 branch; add a stable `reason` property to the 409 Problem Details and branch on it.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-add-and-edit-single-questions.md`
  summary: A draft save that succeeds but whose follow-up refresh fails shows "Could not save" and leaves the editor on stale state.
  evidence: `QuestionEditor.tsx` submit wraps the save and the refresh in one try block.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-add-and-edit-single-questions.md`
  summary: Restoring a draft-only question leaves it with only a DISCARDED version, so the editor opens on discarded content.
  evidence: the epic says the discarded draft stays discarded; Story 3.4 should decide how the draft queue treats it.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-csv-bulk-upload.md`
  summary: A Valkey outage turns every upload into an unshaped 500, and the limiter's fail-open or fail-closed policy is undefined.
  evidence: `ValkeyRateLimiter` throws a Redis connection exception that no admin handler maps; decide the policy and add a Problem Details 503 or 500.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-csv-bulk-upload.md`
  summary: The upload limit token is spent before the file is checked, so malformed or oversize uploads count against the 10 per hour.
  evidence: `AdminUploadController` calls `tryAcquire` before reading the file; the epic counts uploads, so the owner should confirm or ask for a refund on file-level 400s.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-csv-bulk-upload.md`
  summary: The concurrent-duplicate 409 path and the production selection of `ValkeyRateLimiter` by `minnal.ratelimit.store` have no test.
  evidence: needs a seam to inject the clash, and an `ApplicationContextRunner` test for the property switch.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-draft-review-queue.md`
  summary: Publish and discard do not take the reviewed `rowVersion`, so a reviewer can publish content another admin edited after the queue loaded.
  evidence: the epic defines the endpoints without a body; add an optional `rowVersion` and a `409` on mismatch when there is more than one admin.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-draft-review-queue.md`
  summary: The tab-close `keepalive` commit drops an action when the token is not captured yet or has expired, and leaves the batch with no timer.
  evidence: `web/src/admin/draftActions.ts` `sendOnUnload` skips the send when `token === null`; keep the timer or warn.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-draft-review-queue.md`
  summary: A commit that fails after the admin has left the Drafts page keeps its detail in the store and shows it only on return.
  evidence: noted by the implementer; the row reappears on the next fetch.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-players-report-a-wrong-question.md`
  summary: The report limiter token is spent before validation, the published-version check and the duplicate check, so invalid, 404 and 409 requests drain the 5-report budget.
  evidence: `QuestionReportController` calls `tryAcquire` first, the same ordering as the 3.3 upload limiter; decide once for both.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-players-report-a-wrong-question.md`
  summary: After a mid-match reload the snapshot lacks `questionSource`, so the live-reveal link is hidden for the rest of that match; a published version of a soft-deleted question can still be reported.
  evidence: `liveGameStore` builds `questionSource` null from a SNAPSHOT; the report service checks only `PUBLISHED` status.

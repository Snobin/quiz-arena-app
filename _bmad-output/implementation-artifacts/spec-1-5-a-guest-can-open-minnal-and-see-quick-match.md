---
title: 'Story 1.5: A guest can open Minnal and see Quick Match'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: 'a8b1d54c6da8eab87e83c68ebf602273e531fce7'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-quiz-arena-2026-11-10/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Minnal has no identity, and its Play tab is a scaffold placeholder. A first-time guest can't get a token for the coming `/ws` CONNECT (Story 1.6), and can't see Quick Match or what signing in unlocks.

**Approach:**
- core issues RS256 guest JWTs and publishes a JWKS.
- game and ratings become stateless OAuth2 resource servers against that JWKS.
- The web app boots a guest session in the device language and renders guest Home: the Quick Match card, locked mode rows, one nudge, an inline Sign-in prompt route and a matchmaking stub.
- The epics.md Story 1.5 acceptance criteria are the contract. This spec adds the decisions below.

## Boundaries & Constraints

**Always:**
- **Shared claims (contracts):** `in.minnal.contracts.identity`:
  - `Role {GUEST, USER, ADMIN}`;
  - `MinnalClaims` constants (`roles`, `name`, `lang`);
  - the issuer constant `minnal-core`.
  - No Spring.
- **Signing key (core):**
  - `minnal.jwt.signing-key` comes from env `MINNAL_JWT_SIGNING_KEY`, a base64 of a PKCS#8 PEM RSA ≥ 2048 key. `minnal.jwt.key-id` comes from `MINNAL_JWT_KEY_ID`.
  - Optional `MINNAL_JWT_EXTRA_PUBLIC_KEYS` takes `kid=base64(SPKI PEM)` pairs, comma-separated. They are published in the JWKS but never used to sign (rotation).
  - When the key is unset under `local`/`test`/`it`, core generates an ephemeral key and logs a WARN. Under `prod` it fails at startup.
  - Add the names to `.env.example` and compose. Never write `deploy/.env`.
- **Guest endpoint:** `POST /api/core/v1/auth/guest {lang}` returns `200 {accessToken, expiresAt}`.
  - `lang` must be `ml` or `en`; anything else gets a 400 ProblemDetail.
  - The token is RS256 with header `kid` and claims `iss`, `sub` = random UUID, `iat`, `exp` = iat + 24 h, `roles: ["GUEST"]`, `name: "Guest NNNN"` (NNNN random 1000–9999, the same in both languages), `lang`.
  - It is signed with `NimbusJwtEncoder`.
  - There is no persistence, no migration and no table.
- **JWKS:** `GET /api/core/v1/auth/jwks` returns the public JWK Set (`kty`, `kid`, `use: sig`, `alg: RS256`, `n`, `e`). It never contains private members.
- **Core security:**
  - core takes only the JOSE library (`spring-security-oauth2-jose`), never a security starter, so its existing endpoints, `/internal` interceptor and health stay untouched.
  - core doesn't validate tokens in this story.
- **Resource servers (game, ratings):** each gets the same small, duplicated `platform/infrastructure/security` package.
  - The `JwtDecoder` uses `jwk-set-uri` = `MINNAL_JWKS_URI`.
    - Local default: `http://localhost:8081/api/core/v1/auth/jwks`.
    - Compose: `http://core-service:8081/…`.
  - It accepts RS256 only, and validates `iss` plus timestamps.
  - A converter maps `roles` to `ROLE_*` authorities. A `MinnalPrincipal(sub, roles, name, lang)` comes from the token.
  - The filter chain is stateless, with CSRF off and no sessions.
    - It permits `/actuator/health`, `/error` and, in game, `/ws` (STOMP CONNECT auth is Story 1.6).
    - Everything else needs authentication.
  - A missing, tampered or expired token gets a `401` `application/problem+json` with `instance`, and `X-Request-Id` is preserved.
  - Startup must not need core to be up: keys are fetched lazily.
- **Web language:**
  - `deviceLanguage(navigator.languages)` returns `ml` when any entry matches `^ml([-_]|$)`, otherwise `en`.
  - It drives the i18n `lng`, `<html lang>` and the guest-token `lang`.
  - Nothing is persisted (the Settings control is Epic 2).
- **Web guest session (`web/src/auth/`):**
  - A Zustand store holds `loading | ready | error`.
  - The token `{accessToken, expiresAt}` is kept in `localStorage` (try/catch; memory-only if storage fails).
  - It is reused until `expiresAt − 5 min`, and also when its `lang` claim differs from the device language. Fetching is single-flight.
  - The refresh is scheduled by timer and also checked on `visibilitychange`/focus.
  - `apiFetch` adds `Authorization: Bearer`. On a `401` it drops the token, fetches a new one and retries once.
  - The error state keeps a reason: offline/network or server.
- **Guest Home** (follows `mockups/key-home.html`, guest column):
  - "Playing as guest" header.
  - The Quick Match card (UX-DR21): the whole card is one 48px+ button that navigates to `/matchmaking`. It carries the subtitle "10 questions · 15 s each · about 4 min", a decorative inline-SVG bolt watermark in `band-raised` and a white "Play now" pill.
    - It is `aria-disabled` with a caption when offline (existing `usePlayAvailability`) or while there is no token.
  - The nudge comes before the rows. **Decision (Snobin, 2026-11-12):** its "Continue with Google" button uses the secondary `Button` (card fill, 1.5px ink outline), not ink fill, so the Quick Match card stays the only filled ink element (overrides the mockup and UX-DR18 styling). The button opens the Sign-in prompt.
  - The locked rows, in mockup order: Topic Duel, Solo Practice, Battle Room. Each has a muted title, a half-opacity icon, a lock and "Sign in", plus an accessible name like "Topic Duel, locked, sign in to play".
  - There is no rank snippet or rating trio.
  - On token failure, an inline alert shows the reason and a Retry button.
- **Sign-in prompt:** a route `/sign-in?returnTo=<path>` inside the shell, not a modal.
  - It has a heading, the benefit text and a "Continue with Google" `Button` with `disabledReason` set to the coming-soon caption.
  - Its Back link calls `history.back()` when the app pushed the entry, else it navigates to `returnTo`. Browser Back also works.
  - On return, focus goes to the tapped row or nudge button. AppShell's default `main h1` focus must yield to a pending return-focus target.
- **Matchmaking stub:** `/matchmaking` shows the heading `matchmaking.searching`, a "not available yet" line and a Cancel button back to Home. The tab bar is hidden. Story 1.6 replaces it.
- Every new string goes in the catalogue in both languages. Agent-drafted copy carries `signoff: ['ml','en']`. `check:i18n` passes. Each route sets `document.title`.
- The scaffold `/api/core/v1/ping` probe UI leaves Play (the core endpoint stays).

**Never:**
- Google sign-in, refresh tokens or the user table (Epic 2).
- Mode gating in game, or STOMP CONNECT auth (1.6).
- REST CORS (1.2, deferred).
- Rate-limiting the guest endpoint.
- Persisting any guest data server-side.
- A security starter in core.
- A shared Spring module between services.
- Decoding the JWT for anything other than its `lang` claim on the client.
- Volt on Home.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Guest token | `POST /auth/guest {lang:"ml"}` | 200; JWT verifies against JWKS; claims as above; `exp − iat = 24 h` | N/A |
| Bad lang | `{lang:"fr"}` or `{}` | 400 ProblemDetail | N/A |
| Rotation | an extra public key configured | JWKS lists 2 keys with distinct `kid`; token header uses the active `kid` | N/A |
| Prod without key | `prod` profile, key unset | core fails to start with a clear message | N/A |
| Resource server | valid / tampered / expired / none, on a test-scoped `/api/<svc>/v1/test/whoami` | 200 with sub, roles, name, lang / 401 / 401 / 401 | 401 is problem+json |
| Health | no token, `/actuator/health` | 200 | N/A |
| First boot | no stored token, device `ml-IN` | one guest request with `lang:"ml"`; `<html lang="ml">`; Malayalam UI | N/A |
| Other device language | `['ta-IN','en-GB']` | English UI, `lang:"en"` | N/A |
| Reuse | stored token expiring in 2 h | no request | N/A |
| Near expiry | stored token expiring in 4 min | new token fetched | N/A |
| Token fails | guest request 500 or network error | Home renders with the alert + reason + Retry; Quick Match aria-disabled | Retry refetches |
| 401 on REST | `apiFetch` gets 401 | new token, one retry | second 401 → surfaced |
| Locked row | tap Topic Duel | `/sign-in?returnTo=/`; Google button aria-disabled + caption; Back → Home, focus on Topic Duel row | N/A |

</frozen-after-approval>

## Code Map

**Backend:**
- `pom.xml` (root): Boot parent 4.1.2. Enforcer bans `in.minnal:*` except contracts. `contracts/pom.xml` bans `org.springframework*`, so the identity constants there must be plain Java.
- `services/core/pom.xml`: add `org.springframework.security:spring-security-oauth2-jose` (BOM-managed), with no starter. Verify that it doesn't trigger security auto-config; if it does, exclude it rather than adding a filter chain.
- `services/core/src/main/java/in/minnal/core/`: new feature package `identity/(api|application|infrastructure)`. Put `GuestTokenController` and `JwksController` under `/api/core/v1/auth`, where Caddy forwards `/api/core/*` without stripping the prefix. Reuse the global ProblemDetail and `RequestIdFilter` (`platform/infrastructure/web/`). Don't touch `InternalTokenInterceptor`.
- `services/core/src/main/resources/application*.yaml`: add `minnal.jwt.*`. `application-test.yaml` and `application-it.yaml` must boot with no key (ephemeral).
- `services/{game,ratings}/pom.xml`: add the Boot 4.1 OAuth2 resource-server starter. Check the exact artifact name in the 4.1.2 BOM.
- `services/game/.../platform/infrastructure/ws/WebSocketConfig.java`: a raw handler at `/ws`. It must stay reachable (permitAll), and its origin check is unchanged.
- `services/{game,ratings}/src/test/resources/application-test.yaml`: these exclude Redis (ratings also excludes DataSource/Flyway). The context tests must still pass with the lazy JWKS.
- Tests: serve a test JWKS from a JDK `com.sun.net.httpserver.HttpServer` on a random port, and set `MINNAL_JWKS_URI` via `@DynamicPropertySource`. This exercises the real decoder. Test-scoped `@RestController` under `src/test/java`.
- `deploy/compose.yaml`:
  - core: `MINNAL_JWT_SIGNING_KEY`, `MINNAL_JWT_KEY_ID` and `MINNAL_JWT_EXTRA_PUBLIC_KEYS`, defaulted empty (`:-`) so local generates.
  - game/ratings: `MINNAL_JWKS_URI` plus `depends_on` core `service_started`, not healthy, so a core restart doesn't cascade.
- `deploy/compose.ide.yaml`: the services run on the host, so the default localhost JWKS URI works.
- `deploy/.env.example`: add the key names, documenting the generation commands `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 | base64 | tr -d '\n'`. Values stay blank.
- `deploy/verify-local.sh`: new section (`check "name" $? "detail"` style). Through Caddy, `POST /api/core/v1/auth/guest` returns 200 with `accessToken`. JWKS returns 200 with a `kid` and no `"d"`. `{lang:"fr"}` returns 400 problem+json.
- `README.md`: a JWT key section next to "Internal service token" (L64).

**Web** (all under `web/src/`):
- `shell/router.ts`: `navigate(to)` keeps the query on the URL but the store holds only the pathname. Read `returnTo` from `location.search`.
- `App.tsx` `ROUTES`: add `/sign-in` and `/matchmaking`. `shell/TabBar.tsx` maps unknown paths to Play. `shell/useHideTabBar.ts`: call `useHideTabBar()` in the matchmaking stub.
- `shell/AppShell.tsx` L24-30 focuses `main h1` after a navigation. Add a return-focus store (`shell/returnFocus.ts`, `setReturnFocus(id)` / consume) that takes precedence.
- `screens/PlayScreen.tsx`: the current placeholder (probe + inert Quick Match). Replace it with `screens/home/GuestHome.tsx` (or rewrite in place) and drop the probe. Update `shell/shell.test.tsx` expectations that reference the probe.
- `i18n/index.ts`: `lng: 'ml'` is hard-coded. Init from `deviceLanguage()`, a new function in `i18n/language.ts`. Keep `brandLanguage` as is: it normalizes resolved i18n languages and isn't for device detection. `syncHtmlLang` already sets `<html lang>`.
- `i18n/catalogue.ts`: flat `{ml, en, signoff?}`. Existing keys: `play.quickMatch` and `matchmaking.searching`.
  - New: `home.guestHeader`, `home.quickMatch.subtitle`, `home.quickMatch.play`, `mode.topicDuel.title/sub`, `mode.solo.title/sub`, `mode.battleRoom.title/sub`, `mode.locked.label`, `mode.locked.a11y` (param `{{mode}}`), `nudge.title`, `nudge.body`, `signIn.google`, `signIn.title`, `signIn.comingSoon`, `common.back`, `common.retry`, `common.cancel`, `guest.error.network`, `guest.error.server`, `home.quickMatch.needsSession`, `matchmaking.stub`, `title.home`, `title.signIn`, `title.matchmaking`.
  - English copy comes from the mockup.
- `design/Button.tsx`: use `disabledReason` for the Google button and the aria-disabled pattern. Copy the lock icon from the mockup's inline SVG. The bolt comes from `shell/tabIcons.tsx` `PlayIcon`. Tokens: `band`, `band-dark`, `dim-dark`, `band-raised`, `on-band`, `.surface-band` (focus ring on the ink card), `hit-target`.
- `main.tsx`: the `QueryClient` and boot. Start the guest session at boot, not inside Home.
- `motion/reduceEffects.ts`: the injectable-storage pattern to copy for the token storage.
- Tests follow `shell/shell.test.tsx` (`renderApp`, `vi.stubGlobal('fetch')`, fake timers for the refresh).

## Tasks & Acceptance

**Execution:**
- [x] `contracts/src/main/java/in/minnal/contracts/identity/*`: `Role`, `MinnalClaims`. These are the shared claim names for issuer and validators.
- [x] `services/core/pom.xml`, `identity/**`, `application*.yaml`: key loading (env / ephemeral / prod fail), the `GuestTokenService`, both controllers, and the 400 on a bad lang.
- [x] `services/core/src/test/**`: one test per backend matrix row. Verify the issued JWT against the served JWKS with Nimbus. Assert no new table (the Flyway history is unchanged).
- [x] `services/{game,ratings}/pom.xml` + `platform/infrastructure/security/*` + yaml: the resource server, principal, 401 ProblemDetail entry point and permit list.
- [x] `services/{game,ratings}/src/test/**`: the test JWKS server and test controller, covering valid, tampered, expired, missing, wrong-issuer and health.
- [x] `deploy/compose.yaml`, `deploy/.env.example`, `deploy/verify-local.sh`, `README.md`: env wiring, checks and the key how-to.
- [x] `web/src/i18n/language.ts`, `i18n/index.ts` + tests: device language detection.
- [x] `web/src/auth/{guestSession.ts,apiFetch.ts}` + tests: storage, reuse, the 5-min refresh, lang mismatch, single-flight, 401 retry and error reasons.
- [x] `web/src/shell/returnFocus.ts`, `AppShell.tsx`: return focus.
- [x] `web/src/screens/home/*`, `screens/SignInPrompt.tsx`, `screens/MatchmakingStub.tsx`, `App.tsx`, `main.tsx`, `catalogue.ts`: the UI per Boundaries.
- [x] `web/src/**/*.test.tsx`: the web matrix rows, plus a guest-Home structure test (one ink card, 3 locked rows with the accessible names, exactly one nudge, no rank or rating), the locked → prompt → Back focus flow, and the offline/no-token aria-disabled state.

**Acceptance Criteria:**
- Given `./mvnw verify` with Docker running, when it runs, then every module passes and the enforcer rules still hold.
- Given `cd web && npm run typecheck && npm test && npm run check:i18n && npm run build:check`, when it runs, then everything passes, within the 150 KB initial-JS budget.
- Given the stack running with no JWT key in `deploy/.env`, when `deploy/verify-local.sh` runs, then every check passes, including the new auth section.
- Given guest Home at 320 px and at 200% text, when it renders, then nothing overflows horizontally, and every row and card has a 48px hit area and a visible focus ring (light and dark).

## Implementation Notes

- **core:** takes only `spring-security-oauth2-jose` (a test confirms there is no filter chain). `JwtSigningKeys` loads the key:
  - A blank key gives an ephemeral key with a fresh `ephemeral-<uuid>` kid under `local`/`test`/`it`; any other profile fails at startup.
  - A blank `MINNAL_JWT_KEY_ID` falls back to the RFC 7638 thumbprint.
- **game/ratings:** `spring-boot-starter-security-oauth2-resource-server`, with a duplicated `platform/infrastructure/security` package.
  - 401 Problem Details on a bad, expired or missing token; 503 (`Retry-After: 5`) when the JWKS can't be fetched.
  - A new kid triggers one JWKS refetch (tested).
  - Compose: game and ratings `depends_on` core with `service_started`.
- **verify-local.sh:** ratings now answers 401 without a token, so the old ratings `/nope` 404 check sends the guest token, and a new check asserts the 401.
- **Web:**
  - `PlayScreen` and the scaffold probe are gone; `/` renders `GuestHome`.
  - Element ids are camelCase, because `check:dist` reads kebab-case strings as utility classes.
  - The mockup's "G" avatar is left out (a hard-coded letter fails `check:i18n`).
  - `apiFetch` has no production caller until Story 1.6.
- **Review loop 0:** 14 patched, 2 deferred (guest endpoint rate limit, cross-tab token sync), 7 rejected.
- **Verified after the patches:**
  - `./mvnw verify` BUILD SUCCESS. Its 5 h 24 min wall time was the Mac sleeping during `GuestTokenPersistenceIntegrationTest`: a log gap from 08:15 to 13:39, and pmset shows a wake at 13:39.
  - Web: typecheck, 350 tests, `check:i18n` and `build:check` (102.8 KB initial JS) all pass.
  - `deploy/verify-local.sh`: 28/28 PASS on a throwaway `minnal-verify` stack on port 18080, since removed.
- **Not done:** the browser checks at 320 px, 200% text and dark mode; the phone-language check; the screen-reader pass.

## Spec Change Log

## Review Triage Log

Layers: BH = Blind Hunter, ECH = Edge Case Hunter, VG = Verification Gap.

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | BH, ECH | Ephemeral key reuses a configured `MINNAL_JWT_KEY_ID`, so after a core restart the resource servers keep the old key cached under the same kid | medium | `JwtSigningKeys.load` calls `ephemeral(keyId.strip())`; Nimbus refetches only for an unknown kid, so new tokens fail the signature check | patch |
| 2 | BH, ECH | A device clock more than ~23 h 55 m ahead makes every new token look stale, so refresh loops with no delay | medium | `scheduleRefresh` computes a delay ≤ 0, then `schedule(0)` → `check` → `refresh`; unbounded POSTs | patch |
| 3 | BH, ECH | The wake comment says the error state waits for Retry, but focus and visibility also refetch | low | The behaviour (auto-recover) is acceptable; the comment is wrong | patch |
| 4 | BH | `/auth/guest` has no rate limit | medium | Real abuse vector once guest `sub`s queue (1.6+); the approved intent excludes rate limiting from this story | defer |
| 5 | BH | README promises 401 recovery that no production code uses yet | low | `apiFetch` has no production caller | patch |
| 6 | BH, ECH | `apiFetch` retry can't replay a `Request` or stream body | low | No caller passes either; a guard adds complexity | reject |
| 7 | BH, VG | `LazyJwksTest` asserts nothing; no test proves a new kid triggers a JWKS refetch | medium | `fetches()` is never read; `TestJwks` serves one fixed kid | patch |
| 8 | BH | verify-local leaves out game, tampered and expired checks through Caddy | low | Covered by `ResourceServerTest`; the compose healthcheck already proves game health is public | reject |
| 9 | BH, ECH | Token `lang` follows the device, not the i18n language | low | Diverges only on a mid-session `languagechange`; reading i18n from the session module risks init-order bugs | reject |
| 10 | BH | `@ConditionalOnMissingBean` on `Clock` in user config | low | It is core's only `Clock` bean; tests pass | reject |
| 11 | BH | No cross-tab token sync | low | Tabs read the same stored token at start; they diverge only at refresh; it matters for 1.6's one-queue-per-`sub` | defer |
| 12 | BH | Tokens carry no `aud` and resource servers don't check roles | low | Not required by the intent; mode gating is 1.6 | reject |
| 13 | BH | `refresh()` error-reason logic is muddled | low | Two overlapping expressions; a direct simplification | patch |
| 14 | BH | `SignInNudge` hard-codes its heading id | low | A direct `useId()` correction | patch |
| 15 | VG | Wake signals (`online`, `focus`, `visibilitychange`) are never fired against the real session | medium | Pre-verified: only an injected `onWake` is tested | patch |
| 16 | ECH | A JWKS fetch failure (core down) returns 500 instead of a Problem Details | medium | `AuthenticationServiceException` is rethrown by the default failure handler | patch |
| 17 | ECH | `getAccessToken` rejects during a failed background refresh although the stored token is still valid | low | `&& !inflight` forces an await on the failing refresh; a direct correction | patch |
| 18 | ECH | `reset()` races an in-flight request | low | Test helper only | reject |
| 19 | ECH | `returnTo=/%09/evil.example` passes `safeReturnPath` (open redirect) | medium | Browsers strip tab/newline from URLs, so the href becomes `//evil.example` | patch |
| 20 | ECH | Ctrl/middle-click on a locked row still sets the return-focus target | low | `Link` calls `onClick` before its plain-click check; a direct guard | patch |
| 21 | ECH | `WhoAmITestController` `Map.of` NPE on a missing claim | low | Test-only; every test token carries the claims | reject |
| 22 | ECH | A non-Bearer `Authorization` header is reported as `invalid_token` | low | `presented` checks only that the header exists; a direct correction | patch |
| 23 | VG | Home tests mix an English UI with an `ml` token | low | Production gets both from `deviceLanguage()` at boot; test-only | reject |

## Design Notes

- **Why the JOSE library only in core:** a security starter would put a default filter chain in front of `/internal/**`, `/actuator/health` and the seed profile. core only signs in this story; Epic 2 adds core's own resource-server chain when `/me` endpoints arrive.
- **Ephemeral local key:** IDE and compose runs need no secret, and restarting core invalidates old guest tokens. The web's 401 → refetch handles that. Prod must be explicit.
- **Whole-card button:** a nested "Play now" `<button>` inside a clickable card would be two tab stops and an invalid nested control. The pill is presentational.

## Verification

**Commands:**
- `./mvnw verify`: expected BUILD SUCCESS (Docker running).
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run build:check`: expected all green.
- `deploy/verify-local.sh`: expected all PASS on a fresh stack.

**Manual checks:**
- On a phone or in Chrome with the language set to Malayalam, then English: Home language, `<html lang>`, the token `lang` claim (jwt.io), and that the token is reused on reload.
- With a TalkBack/VoiceOver pass on guest Home: the locked-row names, and the focus return after the Sign-in prompt's Back.

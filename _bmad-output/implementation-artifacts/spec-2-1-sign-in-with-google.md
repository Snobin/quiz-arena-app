---
title: 'Story 2.1: Sign in with Google'
type: 'feature'
created: '2026-11-19'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-5-a-guest-can-open-minnal-and-see-quick-match.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Everyone is a guest, so nothing persists: no account, no rating, no way back to the same identity on another device.

**Approach:** A guest taps "Continue with Google" and signs in by full-page redirect (OIDC authorization code + PKCE). core-service verifies the Google identity, creates or resumes an account, sets a 30-day refresh cookie and redirects to the PWA, which exchanges the cookie for a 1 h access JWT held in memory. The Story 2.1 acceptance criteria in `epics.md` are the contract; this spec adds the decisions below.

## Boundaries & Constraints

**Always:**
- Sign-in goes through a `LoginMethod` interface whose only implementation is `GoogleLoginMethod`; token issuing, account creation and refresh never reference Google.
- Only `app_user`, `user_identity`, `refresh_token` tables (Flyway `V2`). Refresh tokens are stored as a hash only; no token ever appears in a URL or in `localStorage` / `sessionStorage` (access token in memory only).
- State, nonce and PKCE verifier live in a 10 min httpOnly `SameSite=Lax` cookie; `returnTo` must start with a single `/`, else `/`. Failures create no account and redirect with `?signin=failed`; `error=access_denied` returns "Sign-in cancelled" as a guest.
- Access JWT: RS256 with the Story 1.5 key and `kid`, 1 h, `sub` = user id, `roles` ⊂ {USER, ADMIN} recomputed on every issue from `ADMIN_EMAILS` (verified email, case-insensitive), `name` (Google `given_name`, else "Player"), `lang`.
- Refresh in this story: no rotation (Story 2.2). Cookie `Path=/api/core/v1/auth`, httpOnly, `Secure`, `SameSite=Strict`. The refresh endpoint allows credentials only for the PWA origin; the web client sends cookies on that call (`credentials: 'include'`), refreshes about 5 min before expiry, and falls back to the guest flow when refresh fails.
- Secrets (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, redirect URI, `ADMIN_EMAILS`) come from environment only, are added to `deploy/compose.yaml` and `deploy/.env.example`, and none is committed.
- Home for a registered player: no Sign-in nudge; Topic Duel, Battle Room and Solo Practice rows unlocked but `aria-disabled` with "Coming soon". `/auth/return` restores the surface, focuses its heading and announces "Signed in as <name>" once. New copy has ml and en with sign-off flags.

**Never:**
- No popup, One Tap or iframe. No Spring Security starter or oauth2-client (core has only the JOSE library). No token rotation or CSRF guard (Story 2.2), no profile setup (2.3), no account deletion (2.8), no ratings.
- Real Google is never called in tests: use a fake OIDC provider (JWKS + token endpoint).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First sign-in | Valid Google identity, no row | `app_user` + `user_identity` created in one transaction; refresh cookie; redirect `/auth/return?to=` | N/A |
| Returning user | Same `(provider, subject)` | Same `app_user`, `last_sign_in_at` updated, no duplicate | N/A |
| Bad ID token | Bad state, signature, `aud`, `exp` or `nonce` | No account; redirect with `?signin=failed` | Inline one-line error on the surface |
| Cancelled | `error=access_denied` | Back to originating surface, still a guest, "Sign-in cancelled" | N/A |
| Open redirect | `returnTo=//evil.com` or absolute URL | Replaced with `/` | N/A |
| Refresh | Valid cookie | `{accessToken, expiresAt}`, 1 h | Expired or unknown: 401, client becomes a guest |
| Admin | Email in `ADMIN_EMAILS`, verified | `roles` includes ADMIN; dropped at next refresh once removed | N/A |

</frozen-after-approval>

## Code Map

core = `services/core/src/main/java/in/minnal/core`.
- `core/identity/api/GuestTokenController.java` (`/api/core/v1/auth`, POST `/guest`), `JwksController`, `AuthExceptionHandler` -- add `google/start`, `google/callback`, `refresh` beside them.
- `core/identity/application/GuestTokenService.java:29-58` -- claim building (`MinnalClaims`, `Role` in `contracts/.../identity`); generalise for USER/ADMIN, 1 h TTL.
- `core/identity/infrastructure/JwtConfiguration.java` -- `JwtSigningKeys`, `NimbusJwtEncoder`; verify Google ID tokens with `NimbusJwtDecoder.withJwkSetUri` (spring-security-oauth2-jose is present); outbound calls via `RestClient` (no new HTTP dependency, no existing fake pattern).
- `core/src/main/resources/db/migration/` -- only `V1__question_bank.sql`; add `V2`. Profiles are `application*.yaml`; `minnal.cors.allowed-origins` exists in prod yaml but core has no CORS code yet.
- `core/src/test/.../support/PostgresIntegrationTest.java` -- base class; its `@BeforeEach` cleanup must clear the new tables.
- `web/src/auth/guestSession.ts` (token in `localStorage`, 5-min-early refresh, single-flight) and `apiFetch.ts` (Bearer, 401 retry) -- add the registered session beside or generalising them; `web/src/config/apiBase.ts` gives `apiUrl()`.
- `web/src/App.tsx:15-22` route map (no `/auth/return` yet); `shell/router.ts`; `screens/SignInPrompt.tsx:42-47` (Google button `disabled`); `screens/home/{GuestHome,SignInNudge,LockedModeRows,signInPath}.tsx`; `shell/announce.ts`; `shell/AppShell.tsx:32` focuses `main h1`; `i18n/catalogue.ts` (`signIn.*`, `nudge.*`).
- `deploy/compose.yaml:54-74` core env block, `deploy/.env.example`, `deploy/check-compose.*` -- add the new variables.

## Tasks & Acceptance

**Execution:**
- [ ] `core` Flyway `V2` + domain/repository -- the three tables, unique `(provider, provider_subject)`, hashed refresh tokens
- [ ] `core/identity` -- `LoginMethod`, `GoogleLoginMethod`, start/callback with state, nonce, PKCE and `returnTo` guard, account create/resume, refresh endpoint, role recompute, CORS with credentials for the PWA origin
- [ ] `core` tests -- fake OIDC provider; cover every I/O matrix row; clear new tables in the base class
- [ ] `web` -- registered session (in-memory token, boot refresh, 5-min-early refresh, guest fallback), `/auth/return` route with focus and announcement, real Google button on SignInPrompt/nudge/locked rows, registered Home, i18n keys, tests
- [ ] `deploy` -- compose env, `.env.example`, check script and tests; README note on creating Google credentials and the shared-domain assumption

**Acceptance Criteria:**
- Given the epics.md Story 2.1 criteria, when core and web run against the fake provider, then each passes, with no token in a URL or web storage.
- Given a stale or unknown refresh cookie, when the app boots, then it becomes a guest as in Story 1.5.

## Implementation Notes

## Verification

**Commands:**
- `./mvnw -B -pl contracts,services/core -am test` -- expected: green (JDK 25; this machine needs `JAVA_HOME` set to the 25 JDK and `MAVEN_SKIP_RC=1`)
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` -- expected: green

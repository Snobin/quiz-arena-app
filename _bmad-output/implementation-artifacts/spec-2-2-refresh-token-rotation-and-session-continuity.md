---
title: 'Story 2.2: Refresh token rotation and session continuity'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: 'c2b6b3a5769ebf2a19a1031779b6dbfeea6d9cd2'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-sign-in-with-google.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 2.1's refresh token is reused until it expires, so a stolen cookie works for 30 days, any site can try to trigger a refresh, and two open tabs have no safe way to refresh together.

**Approach:** Each refresh rotates the token inside a family; presenting an already-rotated token revokes the whole family. The refresh call needs the PWA `Origin` and an `X-Minnal-Auth: 1` header. The web app serialises refresh across tabs with the Web Locks API. The Story 2.2 criteria in `epics.md` are the contract; this spec adds the decisions below.

## Boundaries & Constraints

**Always:**
- Flyway `V3` only alters `refresh_token`: `family_id` (each existing row gets its own new family), `rotated_at?`, `revoked_at?`. No table is created.
- Rotation (mark old `rotated_at`, insert new token, same `family_id`, fresh 30 days) happens in one transaction that locks the presented row, so two concurrent uses cannot both succeed. The sign-in callback's token starts a new family. Cookie attributes stay as in 2.1 (`httpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/core/v1/auth`).
- Refresh with a wrong or missing `Origin` (must equal the PWA origin or an allowed CORS origin) or a missing `X-Minnal-Auth: 1` is a 403 Problem Details; nothing is rotated. CORS allows the `X-Minnal-Auth` header.
- A rotated token presented again is reuse: revoke every unrevoked token of its family, clear the cookie, answer 401, and log one JSON line (`event=refresh_reuse`, `userId`). Expired, revoked, unknown or DELETED-user tokens are a plain 401. Every 401 for a presented cookie carries `reason: "session_ended"` and clears the cookie; a request with no cookie gets a plain 401.
- Web: the refresh call sends `X-Minnal-Auth: 1` and runs inside `navigator.locks` (`minnal-refresh`), falling back to a direct call when Web Locks is missing. When a refresh answers `session_ended` (reuse, expiry, revocation) the client becomes a guest and Home shows the one-line "Please sign in again" note (ml and en, sign-off flags). A boot with no cookie shows no note.
- A live WebSocket is never closed because its access token expired. Reconnect gets its token through `session.getAccessToken`, which refreshes first when the token is expired; a reconnect with an expired token stays refused at CONNECT (Story 1.9 behaviour).

**Never:**
- No change to token TTLs, claims, `LoginMethod`, sign-in, sign-out or account deletion (2.8), and no token in a URL or web storage. No grace window for a rotated token.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rotation | Valid cookie, right Origin and header | `{accessToken, expiresAt}`, new cookie, old token `rotated_at` set, same family | N/A |
| Reuse | Already-rotated token | 401 `session_ended`, family revoked (new token dead too), cookie cleared, reuse logged with `userId` | Client becomes guest, shows note |
| Bad guard | Wrong or missing `Origin`, or no `X-Minnal-Auth` | 403 Problem Details, no rotation | N/A |
| Dead token | Expired, revoked or unknown cookie | 401 `session_ended`, cookie cleared | Client becomes guest, shows note |
| No cookie | Fresh guest boot | Plain 401, no note | Client becomes guest |
| Two tabs | Both need a token at once | One refresh in flight under the lock; the other uses the rotated cookie; reuse never triggers | N/A |
| Expired during match | Open WS, access token expires | Socket stays open; match plays on | Reconnect refreshes first |

</frozen-after-approval>

## Code Map

core = `services/core/src/main/java/in/minnal/core/identity`.
- `core/api/RefreshController.java`, `core/api/SignInController.java` (`refreshCookie`) -- rotation, guard, reuse; the callback keeps issuing a new family.
- `core/application/RefreshTokenService.java`, `RefreshTokenRepository.java`, `infrastructure/JdbcRefreshTokenRepository.java` -- add `issue(userId, familyId)`, a locking lookup, `rotate`, `revokeFamily`; `AuthSettings.corsOrigins()` is the Origin allowlist; `infrastructure/AuthConfiguration.java` CORS gains the header.
- `services/core/src/main/resources/db/migration/` -- add `V3__refresh_token_families.sql` after `V2`.
- Tests: `core/.../api/GoogleSignInIntegrationTest.java` (refresh calls there need the Origin and header; extend it for the matrix rows) and `MigrationIntegrationTest` / `GuestTokenPersistenceIntegrationTest` (version list, columns).
- `web/src/auth/session.ts` (`request`, `refresh`, `becomeGuest`) and `session.test.ts` -- header, Web Locks, `session_ended`, a `signedOut` flag in the store; `screens/home/GuestHome.tsx` plus a small note component beside `SignInOutcomeNote.tsx`; `i18n/catalogue.ts`.
- `web/src/realtime/connection.ts:799` (`open` already awaits `getAccessToken`) -- unchanged; cover it by a session test.
- `services/game/src/test/.../MatchReconnectFlowTest.java:276` -- the expired-reconnect refusal already exists; add a test that a connected session survives its token's expiry.

## Tasks & Acceptance

**Execution:**
- [x] `core` Flyway `V3` + repository/service -- family, rotation in one locking transaction, family revoke
- [x] `core/identity/api` -- Origin and `X-Minnal-Auth` guard (403), rotation, reuse handling with `userId` log, `session_ended` 401, CORS header
- [x] `core` tests -- every I/O row; concurrent double use yields one success; update 2.1 refresh tests and schema assertions
- [x] `web` session -- header, Web Locks (with fallback), `session_ended` to guest plus note, i18n, tests including two simulated tabs and expired-token reconnect
- [x] `game` test -- live session survives token expiry

**Acceptance Criteria:**
- Given the epics.md Story 2.2 criteria, when core and web run against the fake provider, then each passes.
- Given a stolen, already-rotated cookie, when it is replayed, then the legitimate player's next refresh also fails and she is asked to sign in again.

## Implementation Notes

- `RefreshTokenService.rotate` returns `Rotated | Reuse | Rejected`; the reuse revoke commits because the 401 is a normal return, not an exception.
- The 401 for a presented cookie carries `reason: "session_ended"` (also for expired, revoked, unknown and DELETED), so the client can tell it from a no-cookie boot.
- The Origin check uses `AuthSettings.corsOrigins()` (the PWA origin plus `CORS_ALLOWED_ORIGINS`).
- Web: `signedOut` lives in the session store; Web Locks falls back to a direct call. The two-tab test includes a no-lock control that shows the replay.
- The expired-token reconnect needed no change: `open` awaits `session.getAccessToken`, which refreshes first.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Unsupported `lang` returned 400 after the token was rotated, so the next refresh looked like reuse | high | patch (fixed) | `lang` validated before `rotate`; test shows a 400 leaves the token unrotated |
| DELETED-account test passed through the reuse path | medium | patch (fixed) | follows from the fix above; test now asserts `session_ended`, cookie cleared and nothing revoked |
| Present-but-blank cookie got a plain 401 with no clearing | low | patch (fixed) | only a missing cookie is plain now; blank is a dead session |
| Browser Web Lock wiring untested | medium | patch (fixed) | tests stub `navigator.locks` (lock name asserted) and its absence |
| Lost refresh response or concurrent loser revokes the family (no grace window) | medium | defer | the spec forbids a grace window; trade-off recorded in `deferred-work.md` |
| Purge/index for refresh_token rows; migration backfill not tested on rows | low | defer | housekeeping and deploy-time risk |
| No timeout on the lock-held fetch; 403 treated as transient | low | defer | recorded in `deferred-work.md` |
| Concurrent test is probabilistic; reuse log not asserted; `Rotation.Reuse.userId` unused; thin note; game test sleeps 3 s | low | defer/false | smoke-level coverage is adequate; no user-visible harm |

## Verification

**Commands:**
- `./mvnw -B -pl contracts,services/core,services/game -am test` -- expected: green (JDK 25 as `JAVA_HOME`, `MAVEN_SKIP_RC=1`; Testcontainers needs `DOCKER_HOST` set to the podman socket here)
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` -- expected: green

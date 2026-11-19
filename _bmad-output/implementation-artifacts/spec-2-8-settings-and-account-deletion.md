---
title: 'Story 2.8: Settings and account deletion'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: '53198129757bc617647d4bdec7bdd8af58e10423'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Players cannot change language or effects in one place, sign out (no logout endpoint), or delete their account. Ratings-service already skips tombstoned players but nothing sets a tombstone.

**Approach:** Build Story 2.8 exactly as its criteria in `epics.md` (lines 1578 to 1640) describe, across four modules: a Settings screen (Language, Reduce effects, Sign out, Delete account); core `POST /api/core/v1/auth/logout` and `DELETE /api/core/v1/me` with the `minnal.user.deleted` outbox event; ratings-service tombstone and board removal; game-service deleted-user set.

## Boundaries & Constraints

**Always:** Deletion is one core transaction (status `DELETED`, every refresh token revoked, `user_identity` removed, outbox row). Consumers are idempotent, `XACK` after commit. A tombstone is never cleared. Matches in progress continue. No attribution lines in commits, PRs or code.

**Decision (DPDP, owner chose A):** build to the epic wording: tombstone and board removal only; `rating`, `rating_event` and `match_record` are kept. Record the erasure question as still open for Story 7.4; launch stays blocked.

**Never:** No ELO logic outside ratings-service. No erasure of `rating`/`match_record` beyond the epic wording until the DPDP question is answered. No Malayalam copy invented: flag it `signoff`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error Handling |
|---|---|---|---|
| Logout | valid cookie | family revoked, cookie cleared, `204`; old cookie then `401` | missing or unknown cookie still `204` |
| Delete | registered bearer | tx as above, `204`; later bearer with that `sub` gets `401` | guest token `403` |
| Replayed event | `user.deleted` twice | one tombstone, no error | n/a |
| Rated match names her | tombstoned | no rating or history written | n/a |

</frozen-after-approval>

## Code Map

- core `identity/api/RefreshController.java`, `RefreshTokenService.java`, `JdbcRefreshTokenRepository.java` (`revokeFamily`; add `revokeAllForUser`) -- logout and delete revocation.
- core `identity/api/` new `LogoutController` (copy RefreshController cookie and CSRF guard), `profile/api/` new `MeController` for `DELETE /me` using `BearerAuthenticator.requireRegistered`.
- core `AccountRepository`/`JdbcAccountRepository` (add `markDeleted`, delete `user_identity`), `OutboxRepository.add`, `ProfileService` (transaction pattern); new Flyway `V5` only if schema needs it (likely none).
- `contracts/.../events/` add `UserDeletedEvent` with `STREAM = "minnal.user.deleted"`.
- ratings `ingest/StreamConsumer.java` (add stream and explicit branch; the existing `else` feeds `directory.apply`), new `UserDeletedHandler` (pattern `MatchCompletedHandler`), `PlayerDirectory` (tombstone upsert; NOT NULL columns need placeholders), `LeaderboardStore` plus `ValkeyLeaderboardStore` (add `remove`; ZREM on all keys via `Boards`/`PeriodKeys`), `MatchCompletedHandler` (skip tombstoned), `RatingsController.registered()` (401 for tombstoned, not 403).
- game `RatingFeeder`/`RatingFeederRunner` pattern for new `DeletedUserFeeder` plus in-memory set; `StompConnectAuthInterceptor`, `MatchmakingService.join` refuse deleted.
- web `screens/MeScreen.tsx` (Settings entry), new `/settings` route in `App.tsx`, new `screens/SettingsScreen.tsx`, `screens/match/LeaveDialog.tsx` (alertdialog pattern), `auth/session.ts` (add `signOut`, `deleteAccount`), `realtime/connection.ts` (export close), `profile/profileStore.ts` `saveProfile`, `motion/reduceEffects.ts` store, `i18n/catalogue.ts`; remove dev toggle in `design/DesignFixture.tsx` lines 54-78 and 136-138.

## Tasks & Acceptance

**Execution:**
- [x] contracts + core: event, logout, `DELETE /me`, repository methods, integration tests (logout, 401 after, tx atomicity, outbox row)
- [x] ratings: consumer branch, handler, `remove`, tombstone checks, 401 on `/me`, integration tests
- [x] game: deleted-user feeder, set, STOMP and join refusal, replay test
- [x] web: Settings screen, dialog, signOut/deleteAccount, realtime close, dev toggle removal, catalogue ml and en (`signoff`), tests; check bundle against the 150 KB budget (143.8 KB now)
- [x] record the DPDP answer in `deferred-work.md` and the spec

**Acceptance Criteria:**
- Given the epic's Story 2.8 criteria, when all four modules ship, then each Given/When/Then there holds, with the web guest Settings showing only Language and Reduce effects.

## Implementation Notes

- DPDP (owner chose A, 2026-11-19): built to the epic wording. Tombstone and board removal only; `rating`, `rating_event`, `match_record`, the `app_user` row and `user_profile` are kept. The erasure question stays OPEN for Story 7.4 and launch stays blocked; recorded in `deferred-work.md`.
- core: `POST /auth/logout` (same Origin plus `X-Minnal-Auth` guard as refresh; always `204` and clears the cookie), `DELETE /me` via `AccountDeletionService` (one transaction, no event for an already-deleted account). No Flyway migration was needed. `UserDeletedEvent` is in `contracts`.
- ratings: `UserDeletedHandler` tombstones (placeholders for a missing directory row; the earliest tombstone is kept) then `ZREM`s the current day, week and all-time keys in all modes; a failed removal leaves the entry pending. `MatchCompletedHandler` skips tombstoned players. `/me` endpoints answer `401` for a tombstoned `sub`.
- game: `DeletedUsers` set filled by `DeletedUserFeeder` (plain `XREAD` replay from the start). CONNECT with a deleted `sub` is a STOMP `ERROR` (`UNAUTHENTICATED`); a join gets `ERROR UNAUTHENTICATED`. Matches in progress continue.
- web: `/settings` (Me has a Settings button for guests and registered players), `session.signOut` and `session.deleteAccount`, `closeRealtime`, a device-stored language for guests (`minnal.language`), the one-line "Your account was deleted" note on guest Home, dev toggle removed. Initial JS is 145.3 KB of 150 KB gzipped. All new Malayalam copy is flagged `signoff`.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Delete dialog: `disabled={false}`, Cancel and Esc close it mid-request, no visible busy state | medium | patch | `DeleteAccountDialog.tsx` only sets `aria-busy`; `SettingsScreen` passes `setConfirming(false)` unguarded |
| `deleteAccount` treats any 401 as "already deleted", so an expired token signs her out with a false "account deleted" notice | medium | patch | `session.ts` accepts 401 as success; core returns 401 for an expired token too |
| Deleted-user feeder never tested against the real stream name; `closeRealtime`, the 401 branch and language-save rollback untested; CONNECT refusal assertion guarded by `if (frame != null)` | medium | patch | symbol search of the tests found no coverage; deleting the calls leaves all tests green |
| Delete confirm copy says ratings and history "will be removed" while option A keeps `rating`, `rating_event`, `match_record`, profile and email | medium | defer | the copy is the epic's wording and the owner chose A; must be settled with the Story 7.4 answer; recorded |
| Sign-out swallows a failed logout call, so the refresh cookie survives and a reload signs her back in | medium | defer | `revokeCookie` is best effort by design; a fix changes `signOut`'s return type; recorded for the owner |
| Game deleted-user set: replay window on boot, capped stream, no metric, rematch and rooms not guarded; ratings enforces 401 only on `/me/*` | medium | defer | known limits already listed in `deferred-work.md` for the rating cache; recorded |
| `StreamConsumer` bare `else` routes unknown streams to `directory.apply`; `LogoutController` copies the refresh guard; `minnal.language` and effects stay on the device after sign-out; duplicate `settings.link` and `settings.title` | low | defer | cosmetic or design choices, recorded |
| Concurrent refresh rotation outliving deletion | high | false | refresh and bearer auth already treat a non-ACTIVE account as signed out (`findActive`), so a rotated token is refused |
| A later `profileUpdated` fills the placeholder directory row | medium | false | `PlayerDirectory.apply` updates only `WHERE tombstoned_at IS NULL` |
| Re-sign-in after deletion attaches to the DELETED row | medium | false | the sign-in lookup is by identity, which is deleted; no unique index on `app_user.email` exists |
| Language save never refreshes the token (docstring) | low | false | `saveProfile` calls `session.refreshNow()` after the PUT |
| Deleted player cannot reconnect to her own match | low | false | the epic says matches continue, and her client closes its socket and signs out on deletion |
| `ZREM` only on the current day and week keys | low | false | the spec asks for current keys; the API and rebuild already hide tombstoned players |
| ml strings added despite the Never clause | low | false | all flagged `signoff`; catalogued, not final |
| Tombstone lookup in `MatchCompletedHandler` outside the rating transaction | low | defer | narrow race; recorded |

## Verification

**Commands:**
- `JAVA_HOME=$HOME/.jdks/openjdk-25.0.2 MAVEN_SKIP_RC=1 mvn -q verify` (per service, with the podman env from the handoff) -- expected: green
- `npm run typecheck && npm test && npm run check:i18n && npm run build:check` in `web/` -- expected: green, bundle at most 150 KB gzipped

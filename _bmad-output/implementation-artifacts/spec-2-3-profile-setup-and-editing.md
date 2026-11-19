---
title: 'Story 2.3: Profile setup and editing'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: '60a580f3033dad17b1a2d7659d490bf4fb59d74b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-refresh-token-rotation-and-session-continuity.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A registered player has only a Google first name: no chosen display name, district, exam level or language, nothing to show on boards, and no place to change them.

**Approach:** A one-screen profile form (setup after first sign-in, edit from Me) backed by `GET/PUT /api/core/v1/me/profile`, one shared name rule (web validator mirrored in core, core authoritative), and a transactional outbox with a relay that publishes `minnal.user.profileUpdated` to Valkey. The Story 2.3 criteria in `epics.md` are the contract; this spec adds the decisions below.

## Boundaries & Constraints

**Always:**
- Flyway `V4` creates only `user_profile` and `event_outbox` (`payload` jsonb). Profile upsert and its outbox row share one transaction.
- Core verifies bearer tokens for `/api/core/v1/me/**` itself with its own signing key (JOSE only, no security starter): none or invalid is 401, a `GUEST` token 403, `USER` or `ADMIN` allowed. Errors are Problem Details.
- Name rule exactly as in the epic (NFC, trim, collapse spaces, 2–24 grapheme clusters via `BreakIterator`, allowed set, starts with a letter, no double punctuation, reserved names case-insensitive). Invalid `PUT` is 400 with `errors: [{field, code, message}]`; the web maps each `code` to ml and en copy. District is one of 14 stable lowercase codes plus `outside-kerala`; anything else is rejected.
- After a profile exists, access tokens carry `name` = display name and `lang` = profile language (the refresh body's `lang` is only the fallback before that); the client refreshes right after a successful save.
- Relay: oldest-first, `XADD minnal.user.profileUpdated … MAXLEN ~100000` (stream name unprefixed), marks `published_at`, on failure bumps `attempts` and backs off (2^attempts s, max 30 s) while the row stays first in line. It runs only when Valkey is configured; tests inject a fake publisher.
- Web: setup opens first (`/profile/setup?to=`) for a registered player without a complete profile, before any surface, and Quick Match cannot start until it is saved; `/auth/return` goes through it. Language change previews at once (strings, `<html lang>`, title), focus stays on the field, a polite "Language: English" or "ഭാഷ മലയാളം" is announced, and nothing is saved until Save. Edit's Back discards and reverts the preview. Field errors: ⚠ plus text, `aria-describedby`, `aria-invalid`, focus to the first invalid field. Name prefill from the Google given name only if it passes the rule. Display names go into Malayalam strings unchanged, after a separator, with a Latin name wrapped by `Lang`. Me shows the profile section with Edit for a registered player and exactly one Sign-in nudge for a guest. District names have ml and en copy; new copy carries sign-off flags.

**Never:**
- No uniqueness, profanity filter, avatar, rating or account deletion (2.8). No consumer of the stream. No change to the sign-in or refresh protocol.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First save | USER token, valid form | 204 or the profile; row stored; one outbox row; client refreshes; token carries new `name`, `lang` | N/A |
| Invalid name | Too short or long, bad char, ZWJ run, reserved, `Guest 123` | 400 with per-field errors; nothing stored or published | Web shows ⚠ text under the field |
| Malayalam name | Chillu, ZWJ, conjunct | Counted by grapheme clusters; accepted | N/A |
| Bad district or level | Unknown code | 400 on that field | N/A |
| Guest or no token | GUEST token / none | 403 / 401 | N/A |
| Publish fails | First `XADD` throws | Row stays unpublished, `attempts` rises, retried in order, then delivered | N/A |
| Never set up | Registered, no profile | `profileComplete` false; setup opens first; Quick Match disabled | N/A |

</frozen-after-approval>

## Code Map

- `core/identity/application/{Account,AccountRepository,UserTokenService}.java`, `infrastructure/JdbcAccountRepository.java` -- add display name and language from `user_profile` to the account and the token claims.
- `core/identity/infrastructure/{JwtConfiguration,JwtSigningKeys}.java` -- add a `JwtDecoder` over the active public key; new `core/profile/{api,application,domain,infrastructure}` package (`NameRule`, `ProfileService`, `ProfileController`, outbox repository, relay, `StreamPublisher` with a Redis impl).
- `core/src/main/resources/db/migration/V4__profile_and_outbox.sql`; tests extend `PostgresIntegrationTest` (clear the new tables) and update the schema assertions in `MigrationIntegrationTest` and `GuestTokenPersistenceIntegrationTest`.
- `web/src/auth/session.ts` -- expose a manual refresh; new `web/src/profile/{nameRule,districts,profileApi,profileStore}.ts`, `ProfileForm`, setup screen; `App.tsx` gate and `/profile/setup` route; `screens/AuthReturn.tsx`, `screens/home/RegisteredHome.tsx` (Quick Match gate), `screens/MeScreen.tsx`, `screens/home/SignInNudge.tsx` (reuse), `i18n/{catalogue,Lang}.ts*` and the catalogue name-separator test.

## Tasks & Acceptance

**Execution:**
- [x] `core` V4, `NameRule` with table-driven tests (chillu, ZWJ, mixed script, every reserved name), profile service, `GET/PUT /me/profile`, bearer verification, token claims from the profile
- [x] `core` outbox: same-transaction write, ordered relay with backoff, Redis publisher, test that fails the first publish then delivers once, in order
- [x] `web` validator mirroring `NameRule` (same cases), profile store and API, form, setup screen and gate, Quick Match gate, `/auth/return` redirect, Me profile section and guest nudge, language preview, i18n and tests

**Acceptance Criteria:**
- Given the epics.md Story 2.3 criteria, when core and web run, then each passes.
- Given the same name vectors, when run through the web validator and `NameRule`, then both accept and reject identically.

## Implementation Notes

- Core verifies bearer tokens in `BearerAuthenticator` (JOSE, the public JWK set); `/api/core/v1/me/**` gets credential-less CORS for the PWA origins with `Authorization`.
- `Account` carries `displayName` and `language` from `user_profile`; `UserTokenService` prefers them over the Google given name and the refresh body's `lang`.
- The relay is a plain class (`OutboxRelay`) scheduled by `OutboxConfiguration` unless `minnal.outbox.relay-enabled=false` (the Docker-free test and it profiles); the Redis publisher trims with `MAXLEN ~100000` after each add.
- Web: the setup screen is one element for every way of reaching it, so the form never remounts when the profile finishes loading. Saved language is applied to the UI when the profile loads.
- The name-separator test accepts the name as its own run after a space or non-Malayalam separator and rejects any attached Malayalam ending.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Reserved names bypassed with ZWJ/ZWNJ or fullwidth letters; runs of joiners accepted; Java `strip` vs JS `trim` whitespace differ | high | patch (fixed) | NFKC fold and joiner removal before the reserved check, joiner runs rejected, one whitespace class in both rules; shared vectors added |
| Bearer auth: missing or odd claim or a deleted account returned 500 (FK) | high | patch (fixed) | all claim errors map to 401; account must be ACTIVE; tests added (deleted, unknown) |
| Relay spun when recording a failure threw; XADD then XTRIM was not one command | medium | patch (fixed) | backoff set first; single `XADD ... MAXLEN ~` |
| After sign-in a failed profile load sent a complete profile to setup (overwrite risk) | high | patch (fixed) | setup only when the server says incomplete; test added |
| Requested screen flashed before setup; guest or complete profile could open `/profile/setup` | medium | patch (fixed) | gate holds while loading; setup redirects when not needed; tests added |
| In-flight profile GET after sign-out wrote the old profile | medium | patch (fixed) | generation counter; test added |
| Untested: profile-aware refresh token, ADMIN allowed, same-transaction rollback, CORS on `/me/**` | medium | patch (fixed) | tests added |
| Relay unsafe with several instances (no SKIP LOCKED), commit-order vs id order, poison row blocks the queue, no purge | medium | defer | single-instance deployment for now; recorded in `deferred-work.md` |
| `RedisStreamPublisher` and relay scheduling have no container test; relay on without Valkey | low | defer | needs a Valkey Testcontainer |
| Names not unique, no homoglyph or mixed-script policy, grapheme parity across JDK and ICU versions, malformed-body error shape, district CHECK and parity test | low | defer | product decisions or parity hardening; recorded |
| Dead code in `NameRule`, JWK rotation capture, other small items | low | false/patch | dead code removed; keys are loaded once at startup by design |

## Verification

**Commands:**
- `./mvnw -B -pl contracts,services/core -am test` -- expected: green (JDK 25 `JAVA_HOME`, `MAVEN_SKIP_RC=1`; podman `DOCKER_HOST` here)
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` -- expected: green

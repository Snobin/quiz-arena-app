---
title: 'Story 5.2: Create a room and share it'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: 'a1e2ccb9dd58511adb02f7cd910018b8ed4c6012'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 5.1 built the room server, but the Rooms tab is a placeholder and Home's Battle Room row is "Coming soon", so no host can create, configure or share a room.

**Approach:** Build the Rooms tab, Create screen and host lobby as lazy web chunks that drive the 5.1 STOMP destinations, plus code/link sharing. The epic's Story 5.2 criteria (`epics.md`, "Story 5.2") are the source of truth for all UI behaviour, copy and a11y; this spec only adds the code map and decisions.

## Boundaries & Constraints

**Always:** Every new web module is lazy-loaded (entry is 135.1 of 150 KB gzipped); no room runtime code in the entry beyond route stubs. Guests never load room code (sign-in `returnTo`). Origin comes only from `VITE_PUBLIC_APP_ORIGIN`. ML and EN strings via i18n catalogue with sign-off flags; no volt or flash in the lobby.

**Never:** Join-by-code logic, `/r/<code>` joining, start, play, podium (5.3 to 5.6); change existing TopicPicker callers; hard-code a domain; add runtime room parsers to the entry chunk.

**Decisions (human, 2026-11-21):** (1) Topic name: the room carries only `topicId` (drop `topicName` from the room source payload and from the create and configure request); each client resolves the name from the topic catalogue it already loads (`['topics']` query), and shows a generic label when the topic is no longer listed. This amends the Story 5.1 contract (a small contracts, game and web-protocol change). (2) `hostParticipantId` stays a random per-room participant id, not the host's `sub` (AD-10); the epic wording is corrected, not the code.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create | topic set, count valid | `/app/room/create`, recent saved, lobby `/r/<code>` | `ERROR` inline, values kept |
| Profile incomplete | `PROFILE_REQUIRED` | Inline message with link to `/profile/setup`; retry after save works | Token already refreshed on save |
| Count vs topic | topic has fewer than count | count lowered, announced once | at limit caption, `aria-disabled` |
| Share | `navigator.share` missing / cancelled | clipboard copy "Copied" / nothing | clipboard refused: select text |
| Expiry | `ROOM_CLOSED EXPIRED` | Rooms tab, polite notice | N/A |
| Offline | no connection | Create and Share `aria-disabled` | offline caption |

</frozen-after-approval>

## Code Map

- Decision 1 contract amendment: `contracts/.../realtime/RoomSource` and the room create/configure request lose `topicName`; `services/game/.../room` (`RoomController.configOf`, `RoomConfigRules.trimName`, `RoomState.view`), `web/src/realtime/protocol.ts` and the golden samples and their tests follow. Keep `topicId` and validate it as a UUID only; core is not called.

- `web/src/screens/RoomsScreen.tsx` -- placeholder in entry (App.tsx l.23, route `/rooms`); keep as thin guest/registered split, lazy-import the real tab.
- New `web/src/screens/rooms/` (lazy chunk like `screens/topics/`): `RoomsRoutes.tsx` (`/rooms`, `/rooms/create`, `/r/`), `RoomsTab`, `CreateRoom` (count stepper), `HostLobby`, `roomCode.ts` (format, spell), `share.ts` (Web Share/clipboard), `recentRooms.ts` (localStorage per user id, bad value discarded).
- `web/src/App.tsx` -- add `/rooms/create` and `/r/*` route entries (static `ROUTES` map; prefix match as `/play/` does) hiding the tab bar in the lobby.
- `web/src/screens/topics/{TopicPicker,TopicsRoutes}.tsx` -- add purpose `BATTLE_ROOM` (heading `topics.heading.room`) and `for=room[&roomId=]` handling; `sources` prop already exists; recent topics via `markTopicUsed`.
- `web/src/screens/home/ComingSoonModeRows.tsx` -- add `homeModeBattleRoom: '/rooms'` to `LIVE_MODE_PATHS`; guest locked row in `LockedModeRows.tsx` returns `/rooms`.
- `web/src/realtime/connection.ts`, `liveGameStore.ts` -- socket and `USER_PRIVATE_QUEUE` handler exist for matches only (1119 lines). Add room send/subscribe (`/app/room/create`, `/app/room/{id}/configure|leave`, `/topic/room/{id}`, `ROOM_JOINED`, `ROOM_LOBBY_UPDATED`, `ROOM_CLOSED`) via a lazily imported `roomClient` that reuses `createRealtime`'s factory and token; do not grow the entry. Types are already in `realtime/protocol.ts` (l.125-150).
- `web/src/profile/profileStore.ts` l.85 -- saving a profile already calls `session.refreshNow()`, so the `profileComplete` claim updates; `App.tsx` l.132 already forces setup for incomplete profiles; the room screens only handle a stale `PROFILE_REQUIRED`.
- `web/src/config/apiBase.ts` -- pattern for `import.meta.env` reads; add `config/publicOrigin.ts`, `web/.env.example`, `vite-env.d.ts`.
- `web/src/i18n/` -- room catalogue as a lazy chunk like practice (`practiceCatalogue.ts` plus parity test); `shell/announce.ts`, `useDocumentTitle`.
- `services/game/.../room/api/RoomController.java`, `domain/RoomConfigRules.java` -- topic name handling per the Open Question; expiry time already in `RoomView`.

## Tasks & Acceptance

**Execution:**
- [x] Rooms chunk and routes, Rooms tab, recent list, Create screen and stepper -- epic criteria
- [x] Picker `BATTLE_ROOM` purpose and return flow (create and edit) -- no change to existing callers
- [x] Room socket client (lazy), host lobby, Edit via configure, Leave, `ROOM_CLOSED` notice -- epic criteria
- [x] Share and copy helpers, `VITE_PUBLIC_APP_ORIGIN` config, Home row live -- epic criteria
- [x] Topic name decision applied in game-service (after the Open Question is answered)
- [x] Tests: unit for stepper limits, recents, share fallbacks, lobby from fixtures; `check:i18n` and catalogue parity

**Acceptance Criteria:**
- Given the epic's Story 5.2 criteria, when built, then each passes at 320 px, 360 px with 200% text, and offline.
- Given the build, when `build:check` runs, then entry gzip stays at or below 150 KB with room code in separate chunks.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| A recipient opening a shared `/r/<code>` link waits about 5 s and is bounced with no message | medium | patch | Fixed: shows "Joining a room from a link arrives soon" with a link back; test added. |
| Resume effect can re-run after a failed resume and open a second socket | medium | patch | Fixed: tried once per mount; test added. |
| `keepRoom` set on a modified or new-tab click leaves the leave guard disabled | medium | patch | Fixed: plain left click only; test added. |
| Rejected `pickerReturn` import leaves the host stuck on the picker | low | patch | Fixed: catch navigates to `/rooms`; test added. |
| "Start · 1 players" and similar count wording | low | patch | Fixed: plural keys in both languages. |
| Account-deletion clear of recent rooms, the `closeRealtime` room hook and `publicOrigin` untested | medium | patch | Fixed: three tests added. |
| Only the `EXPIRED` close reason and the reconnect timeout paths tested; `/r/<code>` mismatch and picker-return guards untested | low | defer | Small declarative branches; add a reason table and one no-reply reconnect case later. |
| Guests at `/rooms/create` or `/r/<code>` still download the rooms chunk before the sign-in redirect | low | defer | Reconcile the "guests never load room code" wording, or gate the lazy import by role. |
| Create settles on any `ROOM_JOINED` with the same config; unknown error code frames dropped; double-tap create; leave while reconnecting; create unmounted mid-flight; picker reload loses the room | low | rejected | Narrow races the server already answers with an error or the lobby row recovers; fixes add guards for unlikely cases. |
| Share label wording, expiry time locale, inert Join field, dead "coming soon" code, stepper ergonomics, unused env var, `topicName` negative test, trailing slash route | low | rejected | Cosmetic, spec-defined, or the router already normalises trailing slashes. |

## Design Notes

- The epic text has no rated flag on create (rated or unrated comes from the source in Epic 6), so none is built here.
- 5.1 created `/topic/room/{id}` access only for members and sends `ROOM_JOINED` on subscribing to `/user/queue/game`, so the client must subscribe to the private queue before it publishes `create`.
- Recents scoped by user id; clear on account deletion in Story 2.8's flow.

## Verification

**Commands:**
- `JAVA_HOME=$HOME/.jdks/openjdk-25.0.2 MAVEN_SKIP_RC=1 DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ./mvnw -q verify` (repo root) -- expected: success
- `npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` (web/) -- expected: success, entry within 150 KB

**Manual checks (if no CLI):**
- Rooms tab, Create and lobby at 320 px and 200% text with a long Malayalam topic; share on a real phone.

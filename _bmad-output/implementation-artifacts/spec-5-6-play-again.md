---
title: 'Story 5.6: Play again'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: 'e9b9408bf5eab27412b286c89d32012d5bf376e4'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After a room match the host can only go Home; `playAgain` is a stub (`NOT_AVAILABLE_YET`), so a coach must share a new code every round.

**Approach:** Replace the stub end to end. Within 60 s of the match end the host's Play again opens a successor lobby with the same source and count and tells every player, who joins it in one tap; after the window the host gets "New room" instead. The epic's "Story 5.6" criteria are the source of truth for strings and behaviour; this spec adds the code map and decisions.

## Boundaries & Constraints

**Always:** Every state change stays a queued actor event or a synchronized registry call. A successor is created through `RoomRegistry.open` (one code path with Create). The old room's actor is already gone when Play again arrives, so the link from the old room to its successor lives in the registry for 60 s. `ROOM_SUCCEEDED` goes on the private queue to each participant with a session (reliable) and best effort on the match topic. Codes never appear in logs. ML and EN strings through the catalogue with sign-off flags. The entry stays at or below 150 KB gzipped.

**Never:** Rematch, Share (Epic 7), custom sources, changing the config on Play again, notifying anyone on "New room", a second successor for one match.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Play again | host, within 60 s of the match end | new LOBBY room, same source and count, new code, host's results open its lobby; `ROOM_SUCCEEDED {code, hostDisplayName, source, questionCount}` to every participant; recent-rooms entry refreshed | N/A |
| Repeat | host taps again | the same successor code, no second room | N/A |
| Not host | any other player | `ERROR NOT_HOST`, nothing changes | N/A |
| Host forfeited | host left mid-match, still on results | can still Play again | N/A |
| Join | player gets `ROOM_SUCCEEDED` | "Join <host>'s new room" beside Home, announced politely once; one tap sends the Story 5.3 join | full / already-in-a-match show the 5.3 inline messages in the action bar |
| Late | window passed, or unknown match | `ROOM_NOT_FOUND`-style refusal; host sees "New room" | "New room" opens Create with source and count preselected, tells no one |
| Reload | within 60 s | stored `ROOM_SUCCEEDED` restores the Join button | dropped after the window |
| Busy host | host already in another room or match | refused with the 5.1 busy error | nothing created |

</frozen-after-approval>

## Code Map

- `services/game/.../room/application/RoomService.java` (`playAgain` L~175, takes only the room id) and `room/api/RoomController.java` (`/room/{roomId}/playAgain`) -- real handler.
- `.../room/application/RoomRegistry.java` (`open`, `closed()`) -- add a 60 s `roomId -> {hostSub, matchId, source, count, successorCode}` link written when a room match ends; `playAgain` reads it. Needs the match id on `RoomEvent.MatchEnded` (RoomState does not keep it) and the participants to notify.
- `.../room/application/RoomActor.java` (`startMatch`, `MatchEnded` -> `finish`) -- record the link and the participant subs before the actor closes.
- `.../match/application/MatchRegistry.java` -- 60 s tombstone already exists; match topic subscribe is live-only, so the private queue is the reliable path.
- `contracts/.../realtime/` -- new `RoomSucceededPayload`; `MessageType.ROOM_SUCCEEDED` and `Destinations.ROOM_PLAY_AGAIN` exist; retire the `NOT_AVAILABLE_YET` javadoc note; sample plus mirror in `web/src/realtime/protocol.ts` and `screens/rooms/roomProtocol.ts`.
- `web/src/screens/results/ResultsScreen.tsx` (action bar ~L233-265, `HomeActions`) -- host: Play again primary + Home; players: Home plus the Join button on `ROOM_SUCCEEDED`; after 60 s host: "New room".
- `web/src/realtime/lastResult.ts` -- store `ROOM_SUCCEEDED` with the match's `MATCH_ENDED`, drop after the window.
- `web/src/screens/rooms/roomClient.ts` -- `playAgain`, join-from-results entry; `recentRooms.ts` refresh; `pickerReturn.ts` `createPath` for "New room".
- Tests: `RoomMatchFlowTest`, `RoomRegistryTest`, contract samples, `RoomResults`-style results tests, `roomClient.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `contracts` + web protocol -- `RoomSucceededPayload`, sample, parsers -- one contract
- [x] `services/game room` -- successor link, `playAgain` handler (host-only, idempotent, busy and window checks), private and topic delivery, no actor change for the old room -- epic criteria
- [x] `web results + rooms` -- Play again, Join button, New room, rehydrate, recent rooms -- epic criteria
- [x] Tests -- every matrix row

**Acceptance Criteria:**
- Given a finished room match, when the host plays again twice, then exactly one successor room exists.
- Given `build:check`, when it runs, then the entry stays at or below 150 KB.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Matrix row "host forfeited, can still Play again" has no test | medium | patch | `playToEnd` has nobody leave; the row is unpinned. Test sent to the implementer. |
| `Full`, `Draining`, `Expired` branches of `playAgain` and the registry's 60 s boundary and pruning untested; web host error path untested | medium | patch | Only Opened, `NOT_HOST`, `ROOM_NOT_FOUND` and `ALREADY_IN_MATCH` are asserted. Tests sent. |
| A host can Play again after an aborted or failed match; players are told | low | defer | The link is written on any `MatchEnded`; no results screen offers it, so only a crafted client reaches it. |
| Join button never goes stale after the window on the live-store path | low | defer | A tap returns `ROOM_NOT_FOUND`/`ROOM_EXPIRED`/`ROOM_STARTED`; the spec only requires the Story 5.3 inline errors, which are shown. |
| Server's 60 s starts when the room actor closes, the client's when it stores `MATCH_ENDED` | maybe-false | defer | Would be low; the late-refusal fallback turns Play again into "New room". Settle by measuring the real skew. |
| Per-player sends and the topic broadcast run while the registry lock is held | maybe-false | defer | Would be medium if the broker send can block; settle by checking `channel.toPlayer` is non-blocking and whether `closed()` already sends under the lock. |
| Host name taken from `participants().get(0)` | false | rejected | `RoomState.participants()` is host-first by contract and a forfeit does not change room state. |
| Repeat tap when the host is no longer in the successor | false | rejected | The host leaving the successor lobby closes it, so a repeat gets `ROOM_EXPIRED`. |
| NPE if the successor closes between `open` and the read; host taps before participation is released | low | rejected | Both are millisecond windows inside one synchronized call or before a human can react. |
| Host with no `payload.topic` sees no Play again; client sends `questions.length` and a hard-coded BANK source for the recent-rooms entry | low | rejected | A room match always carries its topic and the served count equals the configured one. |
| Announcement repeats on reload; `ROOM_SUCCEEDED` before `MATCH_ENDED` is stored; unvalidated stored `succeeded`; drain-time link; match-topic copy visibility; imports and spec/sprint housekeeping | low | rejected | Cosmetic, theoretical or developer-only with no named failure; sprint status moves to `review` in step 5. |

## Verification

**Commands:**
- `JAVA_HOME=$HOME/.jdks/openjdk-25.0.2 MAVEN_SKIP_RC=1 DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ./mvnw -q verify` (repo root) -- expected: success
- `npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` (web/) -- expected: success; if the full suite times out under load, re-run the failing files alone

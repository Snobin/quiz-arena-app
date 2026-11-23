---
title: 'Story 6.5b: Battle Room with a custom topic, web'
type: 'feature'
created: '2026-11-23'
status: 'done'
baseline_commit: '686367382fcaca2707085ad1bc0937c0c9789465'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The server side of a custom-topic Battle Room is live (Story 6.5a, merged), but no client can use it: the room picker lists only bank topics, "Use in Battle Room" is a disabled stub, and the web parsers and screens drop or reject a custom source and a nameless `TopicInfo`.

**Approach:** Add the web half of Story 6.5: parse the custom source and topic, a "My topics" section in the room picker, Create and lobby source rows with the "സ്വന്തം" tag and the unrated note, the host messages for a gone or shrunk topic, the live-match header, results and history labels, recently hosted with custom sources, and the enabled "Use in Battle Room" action. The web acceptance criteria in `_bmad-output/planning-artifacts/epics.md` "Story 6.5" are the source of truth, including every exact string; this spec adds the code decisions below.

## Boundaries & Constraints

**Always:** Bank rooms, Quick Match, Topic Duel and Solo Practice behave exactly as before (their tests pass untouched). All new strings are in both languages, Malayalam flagged `signoff`. A custom source never shows a source line, report link or "Practise this topic" link; custom text keeps the `lang` of its script and shows no EN tag. Custom topic names come from the owner's list (React text only). The lobby shows the `topicName` the server sends; the live header uses core's name from `ROOM_MATCH_STARTED`. Nothing new enters the entry chunk (budget).

**Never:** No server change. No custom path in Quick Match or Topic Duel pickers. No non-host UI that lists or fetches topics. No delta, delta chip, placeholder or "updating" text, and no ratings delta request, for a custom match.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Room picker | `for=room`, host owns topics | "My topics" above subjects: only topics with 5 or more questions ("15 questions · unrated"); hidden ones give one muted line "Topics with fewer than 5 questions can't be used in a room"; search filters them | list fails: section omitted |
| Pick custom | From Create, or from the lobby (`roomId`) | Back to Create (`customTopicId`) or `configure` with `{type CUSTOM, customTopicId, topicName}`; count clamped to `min(30, size)`, polite announcement when lowered | N/A |
| Topic view | Owner taps "Use in Battle Room" | Create opens preselected, count `min(30, size)` | under 5 questions: button-disabled with "A room needs at least 5 questions"; offline disabled |
| Create and lobby | Custom source | Source row: name, "സ്വന്തം" tag, note "Unrated · the host's own questions don't change ratings", accessible name includes "unrated"; lobby row identical for every player | N/A |
| Start fails | `SOURCE_UNAVAILABLE` | Host: "That topic no longer exists. Choose another one." with "Change topic"; others: "Waiting for <host> to start" | no raw error |
| Start fails | `TOPIC_UNAVAILABLE`, custom | Host: "That topic now has fewer than <count> questions. Lower the count or choose another topic." with "Change topic" | no raw error |
| Live match | `questionSource: CUSTOM` | Header "Battle Room · <topic>" with the tag; question in its written language, no EN tag; reveal without source line or report link | N/A |
| Results | Custom room | Takeover, podium, standings as a bank room; result line "സ്വന്തം · unrated"; no delta UI and no delta request; breakdown rows without source line, report or practise link | N/A |
| Host actions | Custom room results | Play again as before (server keeps the source); after the window "New room" opens Create without a topic (the payload carries no topic id) | N/A |
| History | Custom room match | "Battle Room · #3" with the muted "unrated" and no delta | N/A |
| Recently hosted | Custom source stored | Shown with the tag; hidden when the topic is not in her list or has under 5 questions | N/A |
| Reload | Mid lobby or mid match | Custom source and name survive (`SNAPSHOT.questionSource`) | N/A |

</frozen-after-approval>

## Code Map

- `web/src/realtime/protocol.ts` -- `RoomSource` gains `customTopicId?` and `topicName?`; `TopicInfo` has an optional `topicId` and `subjectName`; `RoomMatchStartedPayload` and the snapshot types gain `questionSource?`; `parseTopic` accepts a name-only topic (Topic Duel callers read `topicId`, so fix their types); `parseSnapshot` reads `questionSource`
- `web/src/screens/rooms/roomProtocol.ts` -- `parseRoomView` keeps `customTopicId` and `topicName` (it currently drops them); `parseRoomMatchStarted` reads `questionSource`; `roomClient.ts` (`ROOM_MATCH_STARTED` hard-codes `questionSource: 'BANK'`; `configChanged` compares `topicId` only; `startFailure` state; `RoomSource` creation)
- `web/src/screens/rooms/CreateRoom.tsx`, `pickerReturn.ts`, `HostLobby.tsx` (`ConfigCard`, `StartBar`), `roomConfig.ts`, `useCatalogue.ts`, `recentRooms.ts`, `RoomsTab.tsx`, `roomCatalogue.ts`, `RoomError.tsx` -- custom source in Create (reads the owner's list through `TOPIC_LIST_KEY`), lobby row, failure copy, recent rooms
- `web/src/screens/topics/TopicPicker.tsx` (the 6.4 My topics section and `sources`), `TopicsRoutes.tsx` -- add the room variant: 5 or more questions, "unrated" row text, hidden-count line, `onSelectCustom` for rooms
- `web/src/screens/customTopics/TopicViewScreen.tsx`, `importCatalogue.ts` -- enable "Use in Battle Room" (`import.success.battle`), drop the `import.success.soonBattle` caption, new under-5 caption
- `web/src/realtime/liveGameStore.ts`, `connection.ts`, `screens/match/RoomMatchParts.tsx` (`RoomHeader`), `LiveMatchScreen.tsx`, `match/RevealDetails.tsx` (`hideSource` exists from 6.4) -- header tag, `questionSource` kept through a reload
- `web/src/screens/results/ResultsScreen.tsx`, `ResultsBand.tsx`, `BreakdownRow.tsx` -- "സ്വന്തം · unrated", `HostActions` needs a topic id for bank only, `hideSource` for CUSTOM rows; `ratedForHer` already keys off `BANK`
- `web/src/ratings/MatchHistory.tsx` -- `#placement` for room rows; `web/src/test-utils/realtime.ts` -- fixtures take a custom source
- `web/src/realtime/contract.test.ts` and `contracts/samples/*custom*.json` -- the samples 6.5a added; parse them with the real parsers now
- `web/scripts/check-dist.mjs` -- budget

## Tasks & Acceptance

**Execution:**
- [x] `web protocol and room client` -- parse and keep the custom source, topic and `questionSource` end to end; contract test parses the custom samples
- [x] `web rooms` -- Create, lobby source row, picker return, `configure`, failure copy, recent rooms, Rooms tab
- [x] `web picker and topic view` -- room "My topics", enabled "Use in Battle Room"
- [x] `web match, results, history` -- header, reveal, results, breakdown, history labels
- [x] `web tests` -- a flow test per matrix row; update tests that assumed the stub caption or a bank-only `RoomSource`

**Acceptance Criteria:**
- Given a custom room, when any screen renders, then no rating delta, delta request, source line, report link or practise link appears.
- Given a host who owns a 3-question topic, when she opens the room picker, then it is not listed and the muted line says why.
- Given the build, when `npm run build:check` runs, then the budget holds and the custom room code is not in the entry chunk.

## Implementation Notes

Implemented directly (no subagent). `protocol.ts`: `TopicInfo` and `RoomSource` carry the custom fields, `parseTopic` accepts a name-only topic, `ROOM_MATCH_STARTED` and `SNAPSHOT` carry `questionSource` (a reload keeps it through `liveMatchBase`). Rooms: new `CustomSource.tsx` (`OwnTag`, `CustomSourceRow` with an accessible group name that includes "unrated"), `useCustomTopics` and `findCustomTopic` (the list is fetched only for a custom source and only by the host), `customCreatePath` and `returnPickedCustomTopic`, a custom variant of `RecentRoom` (keyed by `sourceId`), and `sameConfig` in the room client that matches a play-again successor by type. The room picker reuses the 6.4 My topics section with the 5-question filter, the "unrated" row text and the hidden-topics line. Results: `HostActions` plays again with a name-only custom source and saves the successor's custom id from `ROOM_JOINED`; "New room" opens a blank Create. History adds `#placement` only for unrated Battle Room rows. The `import.success.soonBattle` string is gone. Tests: `customRoom.test.tsx` (10), custom cases in `RoomResults`, `LiveMatchRoom`, `roomProtocol` and the history section; the two 6.4-era stub expectations were updated.

## Spec Change Log

## Review Triage Log

Inline review by the implementer (not independent; no reviewer subagents were launched).

| Finding | Verdict | Evidence / route |
|---|---|---|
| A bank room's question card still reads "Topic Duel · <topic>" | low | pre-existing, untouched; only a custom room gets "Battle Room · <topic>" |
| `SNAPSHOT.questionSource` on a reload has no dedicated web test | low | the parser and `liveMatchBase` path are covered by the protocol and store tests; the server sets it only for CUSTOM (6.5a test) |
| The lobby shows a client-sent `topicName` until core's name arrives at start | low | accepted; capped server-side at 80 characters and rendered as text |
| History `#placement` shows only for unrated Battle Room rows | low | matches the epic's "Battle Room · #3 · unrated"; rated rows are unchanged (the earlier test still passes) |
| One unrelated custom-topic list test failed once in the full run | false | passes alone; the handoff notes load-sensitive web tests |
| Playwright e2e not run locally | maybe-false | no e2e covers custom rooms; CI runs the suite |

## Design Notes

The `MATCH_ENDED` topic block has no custom topic id, so a host's "New room" after the play-again window starts a blank Create (she can use the recently hosted row). Adding the id would be a contract change and is left out.

## Verification

**Commands:**
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check && npm run e2e` -- expected: all pass

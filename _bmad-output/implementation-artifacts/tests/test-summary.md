# Test Automation Summary: Story 5.3 (Join a room and the live lobby)

Frameworks found: Vitest (web), JUnit/Spring (services/game). There is no Playwright/browser e2e setup, so none was added.

## Existing coverage (checked, not duplicated)
- Server API/flow: `RoomFlowTest` (join by any code form, error table, deleted account, start checks, host leave, member grace/reconnect/resync, topic access), `RoomRegistryTest` (60-join cap, tombstones, limiter, member grace), `RoomCodesTest`, `RealtimeSamplesTest`.
- Web flow: `roomsFlow.test.tsx` (Join field, `/r/<code>` link, player lobby, chips, host close confirm), `roomClient.test.ts`, `roomCode.test.ts`, `roomProtocol.test.ts`.

## Generated tests (gaps from the 5.3 review triage)
- [x] `web/src/screens/rooms/roomClient.test.ts` > "joining: timers (Story 5.3 QA)"
  - a join with no answer fails with `TIMEOUT` and leaves no room
  - an unanswered resync is re-sent every `RESYNC_RETRY_MS` and stops after the fresh `ROOM_JOINED`
  - a player whose connection never returns ends with the `LOST` notice

## Results
- `vitest run src/screens/rooms`: 9 files, 91 tests passed. `npm run typecheck`: clean.
- Java suite not re-run (no Java changes).

## Not covered (still deferred)
- Close-confirm dialog focus trap/restore; non-ASCII rows in the normaliser fixture; limiter/tombstone metrics.
- Browser e2e (two-device join, 320 px / 200% text) remains a manual check per the story's Verification section.

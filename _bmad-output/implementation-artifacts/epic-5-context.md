# Epic 5 Context: Rajeev sir runs a Battle Room

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A registered player (a coach running a batch) can open a private Battle Room on a PSC topic, share its code and join link, fill a live lobby with up to 50 students, start a synchronized multi-player match in which the host also plays, and finish on a podium with joint wins. Rooms are rated for bank-topic sources, and the host can start a new room with one tap. This turns Minnal from 1v1 practice into something a coaching batch can use together.

## Stories

- Story 5.1: Room server: create, configure and expire
- Story 5.2: Create a room and share it
- Story 5.3: Join a room and the live lobby
- Story 5.4: Play a room match
- Story 5.5: Battle Room results and podium
- Story 5.6: Play again

## Requirements & Constraints

- Registered players only (guests are rejected server-side whatever the UI shows). A player is in at most one queue, room or match at a time.
- A room holds 2-50 humans; the host counts and plays. Start needs at least 2 humans and only the host can start or configure. Bots never join a room.
- Room code: 6 characters, hard to guess, unique among live rooms, shown as `XXX-XXX`, accepted in any case with or without hyphen. A room expires at match end or 24 h, whichever is first; the lobby shows the expiry as an absolute time.
- Host picks the source (PSC bank topic now; custom topic is Epic 6) and the question count, 5-30, default 10. Each question has a 15 s window with speed-weighted scoring.
- Live scoreboard updates within 500 ms of each reveal and shows who answered, never what. Answer correctness stays hidden until the question closes.
- Ties for first with a score above 0 share #1 and see a "joint win" takeover; all-zero ties get none.
- Only bank-source rooms change the Battle Room rating (pairwise ELO, K = 32/(N-1)); custom-source rooms are unrated, labelled up front, and still appear in history.
- Host leaving the lobby closes the room for everyone. Host Play again opens a new room with the same source and sends its code to all players.
- Graceful shutdown drains live matches and rooms; a 10 s reconnect grace applies; room state is lost on a crash (accepted).

## Technical Decisions

- A room is one game-service actor (`LOBBY -> IN_MATCH -> ENDED`), in memory only, with a registry of live room codes (later with short tombstones). Room id is a fresh UUID, never a match id. Starting a room mints a new `matchId` and play uses the standard match destinations.
- Room protocol is over STOMP, not REST (game-service has no REST API): `/app/room/create|join` and `/app/room/{roomId}/configure|start|leave|playAgain`; broadcasts on `/topic/room/{roomId}`, private replies on `/user/queue/game`. Message types `ROOM_*` live in `contracts` with web TypeScript mirrors.
- The room source is a tagged object (`{type: BANK, topicId}`) so a `CUSTOM` source can be added without breaking changes.
- game-service calls core only at match start, never while a room is in the lobby. The question set comes from `/internal/question-sets` with the `topicId` filter and `topic` block.
- The match actor's participant model already supports N participants; a room scoreboard is added without refactor, and `BATTLE_ROOM` flows through match completion and ratings as a mode.
- Conventions: SCREAMING_SNAKE message types, `ERROR` codes, actor discipline (every state change is a queued event), JSON logs with ids, Micrometer metrics tagged by mode only.

## UX & Interaction Patterns

- Rooms tab offers Create room, Join with code, and recent hosted rooms. Create reuses the Story 4.1 topic picker. Share goes through the OS share sheet with code and `/r/<code>` link; the link lands a registered player straight in the lobby with no confirmation.
- Lobby shows player chips and a live count; Start stays disabled with "Waiting for 1 more player" until a second human joins. Everyone gets the same 3-2-1, then the same question together.
- Live scoreboard has an answered meter; overtaking the host row uses ink with volt and a crack. Results show a 2-1-3 podium, full standings and the player's own place.

## Cross-Story Dependencies

- 5.1 (server, contracts) is the base for 5.2 (create and share UI), 5.3 (join, lobby, tombstones; replaces the join stub), 5.4 (start and match; replaces the start stub), 5.5 (podium) and 5.6 (play again).
- Reuses the match engine, reconnect and results (Epic 1), profile and sign-in (Epic 2), ratings and boards (Epic 2), report link (Epic 3), topic picker and question-set topic filter (Epic 4). Epic 6 adds the custom source and unrated rooms.

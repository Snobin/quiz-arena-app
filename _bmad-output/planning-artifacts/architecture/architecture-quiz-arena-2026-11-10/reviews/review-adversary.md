---
review: adversarial (compliant-but-incompatible pairs)
target: ARCHITECTURE-SPINE.md (Minnal MVP, draft 2026-11-10)
inputs: [ARCHITECTURE-SPINE.md, .memlog.md, prds/prd-quiz-arena-2026-11-10/prd.md]
reviewed: 2026-11-10
verdict: NOT READY TO BIND. The service boundaries are sound, but AD-2's closed edge list leaves no legal way to get identity and rating data to the services that need it. The match lifecycle (matchmaking, forfeit, reconnect, rematch, room→match) also leaves room for incompatible builds that each follow the ADs to the letter.
---

# Adversarial Review — Architecture Spine

## Method

Each finding is a **pair of units one level down**: two developers or agents building separate features. Each follows every AD as written, and their outputs still don't fit together. Every pair names the ADs both builders follow, where the clash shows up at runtime, the severity, and a **proposed rule** (new AD or tightened text) that closes the gap.

Severity: **Critical** = a PRD requirement can't be built without breaking an AD, or two builds can't work together at all. **High** = wrong ratings or leaderboards, a cheating or fairness exploit, or lost data. **Medium** = visible UX breakage or rework. **Low** = hygiene.

## Root causes (most pairs below come from one of these)

1. **AD-2's closed edge list has no core→anyone edge.** Data owned by core-service (display name, district, language, deletion, bans) can never reach game-service or ratings-service. Only the JWT can carry it, and the JWT carries only `sub` and `roles`.
2. **game-service has no edge to ratings data.** Yet FR-4.1 matches players by rating band.
3. **The match lifecycle is specified only between the first question and the final reveal.** Nothing is specified before it (matchmaking, fetch failure, room→match), after it (rematch, play again, results reload), or around it (multiple sessions, token expiry, guest upgrade).
4. **`MatchCompleted` carries scores, not outcomes.** Ranking, ties, forfeit meaning, question source and display identity are each left for game and ratings to interpret separately.

---

## Pair 1 — Rating-band matchmaking vs. AD-2 (Critical)

- **Unit A, game/matchmaking:** implements FR-4.1 (±200 ELO band). AD-2 forbids calling ratings-service, and `MatchCompleted` only flows outward. So A reads a `rating` field the client sends in the `/app/matchmaking/{mode}/join` payload. Nothing in AD-6 or AD-15 forbids this, because AD-6 only covers timing.
- **Unit B, core/identity:** to "help", B adds a `ratings` claim to the JWT, read from… nowhere. core can't read the `ratings` schema (AD-3). B ships `1200` for everyone.
- **Clash:** the band is either forgeable (A) or meaningless (B). A third builder adds a game→ratings REST call, which breaks AD-2.
- **Proposed rule — AD-17 Rating snapshot for matchmaking:**
  > ratings-service publishes `minnal.rating.updated {eventId, userId, mode, rating, ratedAt}` on every applied rating change. game-service keeps an in-memory `userId+mode → rating` cache built from that stream, and replays it from the start on boot. Unknown users default to 1200. Client-supplied ratings are never read. Add the edge `ratings -->|rating.updated (Valkey Stream)| game` to AD-2.
  *(Alternative if that is too heavy for the MVP: amend FR-4.1 to "no rating band at MVP, FIFO pairing" and record it as a PRD conflict in Deferred.)*

## Pair 2 — Display names on leaderboards and history (Critical)

- **Unit A, ratings/leaderboards:** returns `[{userId, rating, rank}]`. The ratings dev has no source for names (AD-2 bars calling core, and `MatchCompleted` has no name).
- **Unit B, web/leaderboard screen:** needs names, so it calls core `GET /api/core/v1/users/{id}` once per row (N+1 on 3G, 100 rows) for weekly and all-time boards, and again per opponent in match history.
- **Unit C, game dev:** adds `displayName` to `MatchCompleted` participants (contracts may evolve). ratings stores it in `match_record`. When a user renames, the leaderboard (from the projection) and match history (from the snapshot) show different names, and core shows a third. FR-8.5 doesn't help either way.
- **Clash:** three name sources and no owner of "name as shown by ratings". Deleting a user (Pair 3) can't be propagated at all.
- **Proposed rule — AD-18 User lifecycle events (amends AD-2):**
  > core-service publishes `minnal.user.profileUpdated {eventId, userId, displayName, district, examLevel, language, updatedAt}` and `minnal.user.deleted {eventId, userId, deletedAt}` to Valkey Streams. Publishing to a stream is not a service call, and AD-2 gains the edges `core -->|user.* (Valkey Stream)| ratings, game`. ratings-service keeps a `ratings.player_directory(userId, displayName, updatedAt)` read model, applying an update only when its `updatedAt` is newer. Leaderboard and match-history responses always include `displayName` from that directory, never a snapshot. The web never resolves userIds to names through core for ratings-owned screens.

## Pair 3 — User deletion and bans (High)

- **Unit A, core/account:** implements account deletion (needed in practice under India's DPDP Act 2023, and implied by the PRD's privacy posture). It hard-deletes the `core.users` row, the custom topics and the reports. That is AD-1 compliant, because core owns users.
- **Unit B, ratings:** keeps `ratings.rating`, `rating_event` and the Valkey `lb:*` members for that userId forever. AD-3 has no cross-schema FKs, so nothing fails. The deleted user stays #3 on the all-time board, and the JWT keeps working against game and ratings until it expires.
- **Proposed rule:** covered by AD-18 above, plus:
  > On `user.deleted`, ratings-service removes the user from every `lb:*` set and replaces their `player_directory` name with a tombstone ("Deleted player"). It keeps the rating events, anonymised, because opponents' deltas depend on them. On `user.deleted` or a ban (`profileUpdated` with `status=BANNED`), game-service rejects new CONNECTs, queue joins and room joins for that `sub` and forfeits live participation. Access JWT TTL ≤ 15 min bounds how long the gap can stay open.

## Pair 4 — In-match identity attributes: opponent name, language (High)

- **Unit A, game/match actor:** AD-12 says "the actor sends each player their profile language". A has no access to profiles (AD-2 allows only the question-set call). So A asks core for language inside the `/internal/question-sets` call, adding a `participants` field to the request. core then returns per-user languages, which is now a profile API hidden in the question API.
- **Unit B, core/identity:** adds `lang` and `name` claims to the JWT. B doesn't know about A's change, so the claims and A's lookup disagree after a profile edit.
- **Unit C, web:** shows the opponent name from `SCOREBOARD.payload`, which A filled with `participantId` (a UUID).
- **Proposed rule — tighten AD-9 and AD-12:**
  > The Minnal JWT carries `sub`, `roles`, `name` (display name at issue time) and `lang` (`ml|en`). Guests get `name = "Guest-XXXX"` and `lang` from the client. game-service takes in-match identity only from the JWT bound at STOMP CONNECT and never asks core for profile data. Every participant-bearing message includes `{participantId, displayName, kind}`. `QuestionView` carries both `textMl` and `textEn` (with options), and the client chooses. This removes the server's per-player language branching, so AD-12's "actor sends each player their profile language" is deleted.

## Pair 5 — Battle Room on custom topics: rated or not? (High)

- **Unit A, ratings:** rates every `mode=BATTLE_ROOM` `MatchCompleted` (AD-8: "only USER participants are rated"). That is compliant.
- **Unit B, core/custom topics:** reads FR-8.5 ("never … in public leaderboards") as covering matches played on custom topics. B assumes they are unrated and tells the web dev so.
- **Clash and exploit:** `MatchCompleted` has no `source` field, so A can't tell the cases apart. A host writes their own JSON quiz (answers known in advance), runs rooms with friends or alt accounts, and farms Battle Room rating to #1 all-time.
- **Proposed rule — tighten AD-8:**
  > `MatchCompleted` carries `questionSource: BANK|CUSTOM` and `rated: boolean`. game-service sets the flag using one rule in `contracts`: `rated = questionSource == BANK && humanUsers ≥ 2 (or 1 + bot) && no GUEST participants` (see Pair 6). ratings-service applies ELO and leaderboard deltas only when `rated == true`, and still records the match in history with `ratingDelta = null`.

## Pair 6 — Outcome semantics: forfeit, abort, ties, guests (High)

- **Unit A, game:** a human losing 0–4000 to a bot disconnects at Q7. After 10 s they are forfeited. "All humans gone" → aborted → no publish (AD-8). Rage-quitting against a bot erases the loss.
- **Unit B, ratings:** for a human-vs-human forfeit, `forfeited: true` arrives with the score so far. B excludes forfeited participants as "not completed", so the quitter's loss is again erased and the opponent gets no win.
- **Unit C, game/results screen:** shows "You won" on a tie broken by fastest total response time. Unit A's ratings treats equal `score` as a draw, so the results screen and the delta disagree.
- **Unit D, ratings:** for a USER vs GUEST Quick Match, AD-8 says GUEST is "ignored". D skips the whole match, while another reading rates the user against 1200. Farming wins from your own guest tab works under the second reading.
- **Proposed rule — AD-19 Match outcome is decided by game-service:**
  > A match is **completed** if Q1 was revealed. It is **aborted**, with no publish, only if every human forfeited before Q1 was revealed. A forfeited participant is a full participant: they keep their earned score, score 0 for the rest, and are rated. game-service computes `placement` (1-based, ties allowed) with one `Ranking` function in `contracts`: score desc, then correctCount desc, then equal placement (no time tiebreak). `MatchCompleted.participants[]` carries `placement`. ratings-service derives win, loss or draw only from `placement`. Matches containing a GUEST are `rated=false` for everyone. Matchmaking never pairs a GUEST with a USER (guests get guests or bots).

## Pair 7 — Reconnect, `seq` and SNAPSHOT ordering (High)

- **Unit A, game/messaging:** gives every outbound message the next `seq`, including private `/user/queue/match` messages (`ANSWER_ACCEPTED`, `SNAPSHOT`), because AD-10 says "every server message … seq increases by 1 per match".
- **Unit B, web/connection module:** treats a gap in `seq` as a lost message and forces a resync. Each player sees gaps from the other player's private messages, so B resyncs constantly. After a reconnect B also receives `QUESTION_STARTED seq=41` on the topic before the private `SNAPSHOT seq=40`, applies the question, then overwrites it with the older snapshot.
- **Unit C, game/reconnect:** AD-11's SNAPSHOT includes "current question if its window is open". A player who reconnects during the reveal phase gets no `QUESTION_REVEALED` for the question they missed, and no breakdown for questions answered before the disconnect. Their `MATCH_ENDED` breakdown is fine, but the live UI is stuck until the next question.
- **Unit D, game/disconnect:** the same user has two tabs, so two sockets. AD-15 limits connections "per app session", not per user. Closing one tab fires a disconnect event, and the user is forfeited while still playing in the other tab.
- **Proposed rule — tighten AD-10 and AD-11:**
  > `seq` numbers only messages on `/topic/match/{id}` (or `/topic/room/{id}`). Private messages carry `refSeq` (the last broadcast seq at send time) and no `seq` of their own. `SNAPSHOT` is complete state: `{refSeq, phase: LOBBY|QUESTION_OPEN|REVEAL|ENDED, questionIndex, question?, deadline?, lastReveal?, scores, participants}`. On reconnect the client subscribes, buffers broadcasts until SNAPSHOT arrives, then drops buffered messages with `seq ≤ refSeq`. A gap after that triggers one `/app/match/{id}/resync`, answered with a new SNAPSHOT. A participant is keyed by JWT `sub`. The actor tracks a set of sessions per participant, and `DISCONNECTED` fires only when the last one closes. A `sub` can be in at most one queue, room or match at a time, and a second join is rejected with `ALREADY_IN_MATCH`.

## Pair 8 — Matchmaking: cancel, bot fill and the question fetch (High)

- **Unit A, game/matchmaking (Valkey):** the Structural Seed puts "mm queue" in Valkey, so A builds a Valkey list with a scheduled 8 s bot timer per entry (outside any actor; AD-4 covers only matches and rooms).
- **Unit B, game/matchmaking (in-memory):** follows Deferred ("Valkey-backed matchmaking" is future) and builds an in-memory queue.
- **Unit C, web:** needs "Cancel". AD-10 has only `/join`. C closes the socket to cancel, which also kills a match found in the same instant. A different builder adds `/app/matchmaking/{mode}/leave`.
- **Races, both legal under the ADs:** cancel at 7.99 s while the bot timer fires; human pair formed while the bot timer fires for one of them, so a player is in two matches. The pair is formed, then `POST /internal/question-sets` fails or is slow (core down). AD-2 allows the call but says nothing about failure, so one builder sends `MATCH_FOUND` and then hangs, and another silently drops players.
- **Topic Duel:** `filters` in AD-12 is untyped. The game dev keys the queue by topic **name**, while core expects a `topicId` UUID.
- **Proposed rule — AD-20 Matchmaker actor:**
  > Matchmaking is one in-memory actor per `(mode, topicId?)` inside game-service, following the AD-4 single-thread rules. Valkey is not used for matchmaking at MVP, so remove "mm queue" from the seed. Its only events are `JOIN`, `CANCEL` (`/app/matchmaking/{mode}/cancel`), `DISCONNECT`, `BOT_TIMEOUT` and `SET_READY`. Pairing and bot fill happen only inside that actor. Once a player is paired, `CANCEL` is rejected. The matchmaker fetches the question set (timeout 2 s) **before** it creates the match actor and sends `MATCH_FOUND`. On failure every human gets `MATCHMAKING_FAILED` and goes back to idle, never back into the queue. `filters` is a typed `contracts` record `{category, subjectId?, topicId?, examLevel?}`. If core has fewer than `count` matching published questions it returns 422 `INSUFFICIENT_QUESTIONS`; it never returns a short set.

## Pair 9 — Battle Room: room id vs match id, play again (Medium-High)

- **Unit A, game/room:** the room actor runs the match itself (AD-13: "lobby → match → ended") and uses `roomId` as the match id in `MatchCompleted`. It broadcasts questions on `/topic/room/{roomId}`.
- **Unit B, web/match screen:** built once for all modes, it subscribes to `/topic/match/{matchId}`, sends answers to `/app/match/{matchId}/answer`, and calls `GET /api/ratings/matches/{matchId}`. It never receives a matchId for room matches.
- **Play again (FR-9.3):** AD-13 expires the room at match end. Unit A creates a new room for the host only. The other players are still subscribed to the dead `/topic/room/{oldId}` and have no way to learn the new code. Unit C has the old room actor live on to broadcast `ROOM_SUCCEEDED {newCode}`, which conflicts with "expires at match end".
- **Host leaves the lobby:** not specified. One builder transfers the host role. Another keeps the room headless until 24 h. A `CUSTOM` source is ownership-checked against `requesterId`, so a transferred host can't start a custom-topic room.
- **Rematch (1v1):** no destination and no owner. One builder keeps the ended match actor alive to collect `REMATCH_REQUEST`. Another routes it through the matchmaker with a "preferred opponent". Bot rematches and guest rematches are undefined.
- **Proposed rule — tighten AD-13, plus AD-21 Post-match:**
  > When a room starts its match it mints a fresh `matchId` and broadcasts `ROOM_MATCH_STARTED {matchId}` on the room topic. All in-play traffic then uses the `/topic/match/{matchId}` and `/app/match/{matchId}/*` destinations, the same as other modes. `MatchCompleted.matchId` is that id, and `MatchCompleted` carries `roomId?`. The question set is fetched at **start**, never at create or configure time. If the host leaves the lobby the room closes (`ROOM_CLOSED`), with no transfer. After `MATCH_ENDED`, the match or room actor lingers for 60 s in an `ENDED` state that accepts only `REMATCH_REQUEST` (1v1) or `PLAY_AGAIN` (room host). A 1v1 rematch starts when both humans request it within 60 s; with a bot, the human's request is enough. A guest rematch stays guest-only. `PLAY_AGAIN` creates a new room with the same source, and the old room broadcasts `ROOM_SUCCEEDED {code}` to its subscribers before expiring.

## Pair 10 — Results reload and question edits after fetch (Medium)

- **Unit A, game:** the per-question breakdown (FR-9.2) exists only in `MATCH_ENDED`. After that the actor is gone.
- **Unit B, web:** the user refreshes the results page, or the PWA is killed on a 2 GB phone. B re-fetches from `GET /api/ratings/matches/{id}`, expecting the breakdown, but ratings has only scores. Match history (FR-2.3) can't show "correct answer" either.
- **Unit C, core/admin:** an admin fixes a wrong answer index or unpublishes a question while a match holds it. The match scores against the old answer, which is correct per AD-4. Then a player reports the question from the results screen with `questionId`, and the admin sees the fixed version and dismisses the report. A custom-topic re-import (FR-8.6) replaces question ids, so a report or breakdown reference can point at a deleted row. A report on a **custom** question lands in the admin queue, which exposes private content (breaks FR-8.5).
- **Proposed rule — tighten AD-12, plus a results rule:**
  > Bank questions are versioned and never edited in place. An edit creates `(questionId, version+1)`, and question sets carry `{questionId, version}`. Reports reference `{questionId, version}`. Reports are accepted only for `source=BANK`, and `QuestionView` carries `reportable: boolean`. The per-question breakdown is part of `MatchCompleted` (`questions[{questionId, version, correctIndex}]`, `participants[].answers[{index?, responseMs, points}]`). ratings-service stores it and serves it on `GET /api/ratings/matches/{matchId}` to that match's participants only. Custom-question text is not stored by ratings; it shows as "Custom question" once the topic changes.

## Pair 11 — Ratings consumption: 404 semantics, period key, concurrency (Medium)

- **Unit A, web/results:** "retry briefly until present" (AD-8). For guest-only, bot-plus-guest, custom-source or aborted matches nothing is ever present, so A either spins forever or picks an arbitrary cutoff and shows "Rating unavailable" for real delays.
- **Unit B, ratings/leaderboard:** stamps `rating_event.created_at = now()` at consumption. A match ending at 23:59:58 IST and consumed at 00:00:03 lands on the next day's board. The rebuild job (AD-14) uses `endedAt`, so live and rebuilt boards differ.
- **Unit C, ratings/consumer:** uses virtual-thread parallel consumption. Two events for the same user arrive in parallel (two tabs, or Battle Room plus Quick Match) and both read rating 1200, so one update is lost.
- **Unit D, game/publish:** Valkey is briefly down at match end. AD-4 allows exactly one publish, and the event is lost. During shutdown drain the event is lost too. No stream `MAXLEN` or retention is specified, so a ratings outage plus trimming means silent loss.
- **Proposed rule — tighten AD-8 and AD-14:**
  > ratings-service records every consumed `MatchCompleted` in `match_record`, rated or not. `GET /matches/{id}` returns 404 only for "not yet consumed" and 200 `{rated:false}` otherwise. The client retries for at most 10 s, then shows "rating pending". Leaderboard period keys come from `MatchCompleted.endedAt` in Asia/Kolkata, stored on `rating_event`. A single consumer in group `ratings` applies events in stream order, and each event's rating updates and leaderboard writes happen in one Postgres transaction plus a Valkey write that is safe to repeat. game-service retries `XADD` with backoff for up to 60 s (drain waits for it). The stream uses `MAXLEN ~ 100000`, and poison events go to `minnal.match.completed.dlq`.

## Pair 12 — Live scoreboard and acks leak correctness (Medium)

- **Unit A, game:** sends `ANSWER_ACCEPTED {correct: true, points: 912}`. AD-5 bans only "answer index and explanation" before the reveal, and correctness is neither.
- **Unit B, game/room:** to meet FR-6.7 and the NFR (scoreboard < 500 ms after an answer), B broadcasts `SCOREBOARD` after each answer with updated scores.
- **Clash:** in a 50-player coaching-center room, the first fast answerer's score jump tells everyone whether that player was right. Colluders sharing their choice over WhatsApp then learn the correct option within 2 s, which breaks the intent of FR-3.4 and FR-4.6.
- **Proposed rule — tighten AD-5:**
  > Before `QUESTION_REVEALED`, no message to anyone carries correctness, points or score changes. `ANSWER_ACCEPTED` = `{questionIndex, receivedAt}`. A mid-window broadcast may carry only `answeredCount` or a list of who has answered. Scores change only in the `SCOREBOARD` that follows each `QUESTION_REVEALED`. Record a PRD amendment: "scoreboard < 500 ms" is measured from the reveal.

## Pair 13 — Question start instant and deadline encoding (Medium)

- **Unit A, game:** stamps "server send instant" per participant, at the moment of each socket write. With 50 room players behind the simple broker, the last player gets roughly 300 ms more window than the first.
- **Unit B, game:** stamps it once, before the broadcast.
- **Unit C, web:** computes the deadline as `envelope.serverTime + 15000`, while A's payload `deadline` is an absolute instant. With a per-recipient instant, the two differ.
- **Proposed rule — tighten AD-6:**
  > Each question has exactly one `startedAt` instant, stamped by the actor just before the `QUESTION_STARTED` broadcast. `deadline = startedAt + 15000 ms`, sent as an absolute ISO instant in the payload. Response time is `receivedAt − startedAt` for every participant, bots included (bots' simulated `receivedAt`). Clients derive their countdown only from `deadline` and the clock offset.

## Pair 14 — Guest→registered upgrade and token lifetime (Medium)

- **Unit A, core/auth:** on sign-in after a guest match (FR-1.4), A mints a new userId. A's guest JWT has a 24 h TTL and A issues no refresh token.
- **Unit B, web:** keeps the one WebSocket (AD-15) open after sign-in, so the session still carries the guest principal bound at CONNECT. The user enters Topic Duel and is rejected as GUEST. Another web dev assumes the guest match "carries over" to history, because the prompt uses the result as its hook.
- **Unit C, game/reconnect:** the user's access JWT expires mid-match. They reconnect at 8 s, CONNECT fails on an expired token, and they are forfeited.
- **Proposed rule — tighten AD-9:**
  > The access JWT has a 15 min TTL, and a refresh token (httpOnly cookie, `/api/core/v1/auth/refresh`) issues new ones. The guest JWT has a 12 h TTL and is kept in `sessionStorage`, so a reload keeps the same `sub`. game-service validates the JWT at CONNECT only. A live session is never cut on expiry, but a reconnect needs a valid token, and the client refreshes before it reconnects. Guest→registered creates a new userId, and guest results are never claimed or migrated. On any principal change the web connection module closes and reopens the WebSocket.

## Pair 15 — Valkey key namespaces (Low)

- **Unit A, core rate limiter** writes `rl:{userId}`. **Unit B, game per-connection limiter** also writes `rl:{userId}`, with a different bucket size. Postgres has schema isolation (AD-3), but Valkey has none.
- **Proposed rule — extend AD-3:**
  > Every Valkey key is prefixed with its owning service (`core:`, `game:`, `ratings:`), and a service touches only its own prefix. Streams are the only shared keys: `minnal.*`, one producer each, with consumer groups named after the consuming service. Use Valkey ACL users per service when practical.

---

## Smaller notes (no pair needed)

- **AD-7 vs FR-4.2:** "adds a bot after 8 s without a human match" doesn't say whether a human who arrives at 7.9 s while the bot is being created gets paired. Covered by AD-20, where pairing is decided only inside the actor.
- **AD-13 vs AD-16 drain:** lobby rooms can be up to 24 h old but the drain waits 5 min. Specify that rooms still in the lobby get `ROOM_CLOSED {reason: MAINTENANCE}` when draining starts.
- **Bot rating assumption (Deferred) vs AD-17:** "bot rating = human's current rating" makes every bot match an equal-expectation game, so win, loss or draw against a bot gives ±16. That is fine, but write it into `contracts` rather than leaving it implicit.
- **Report rate limit and custom import** are covered. **Answer submissions** have only a per-connection limit, so a client could open many connections. Pair 7's one-match-per-`sub` rule closes this.
- **The Structural Seed says "mm queue" lives in Valkey, while Deferred says Valkey-backed matchmaking is future.** This is an internal contradiction; resolve it with AD-20.

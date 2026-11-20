# Epic 4 Context: Anju trains on her weak topics

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Registered players can train on a specific PSC topic in two ways: Topic Duel, a rated 1v1 on one topic with its own rating and leaderboards, and Solo Practice, an untimed, unrated drill with instant answer feedback. Both start from a shared topic picker that only lists topics with enough published questions. This gives players a way to work on weak subjects without touching their Quick Match rating, and lays groundwork (picker, Solo Practice API) that Battle Room and custom topics reuse later.

## Stories

- Story 4.1: Topic picker
- Story 4.2: Topic Duel
- Story 4.3: Solo Practice
- Story 4.4: Practise this topic

## Requirements & Constraints

- Topic Duel: registered players pick a topic, then join a matchmaking queue separate per topic. Both players get questions only from that topic.
- Topic Duel uses the same format as Quick Match: 10 questions x 15 s, speed-weighted scoring, rating band +/-200 widening to +/-400, and a badged Minnal Bot fallback after about 8 s.
- A Topic Duel result updates only the Topic Duel rating (separate from Quick Match). This fills the Topic Duel boards on Ranks, one board per period like every other mode, with no per-topic boards. Topic is named in the match header and on results; rematch keeps the topic.
- Topic pickers hide any bank topic with fewer than 10 published questions, so players never hit a short-set 422 through normal UI.
- Solo Practice (registered only): one question at a time, no timer, no fixed count. Correctness, correct answer, explanation and attribution come back only in the answer response, for that question only. No repeats until the whole topic has been seen. Stopping shows a summary such as "12 answered · 9 correct". It never changes any rating or leaderboard.
- From any results breakdown row, the player can jump into Solo Practice on that question's topic.
- Out of scope: custom topics as a Solo Practice source (Epic 6), the Battle Room source picker (Epic 5, which reuses this picker), the share card (Epic 7).

## Technical Decisions

- core-service gets a player-facing topic catalogue with published-question counts, a small per-user recent-topics table, and a REST Solo Practice API. The new Flyway migration takes the next free `V<n>` and depends only on the `topic` table.
- The Solo Practice API must keep answer secrecy: correctness appears only in the answer response. Shape it so a `CUSTOM` source can be added later without breaking changes.
- game-service runs one matchmaking actor per `(TOPIC_DUEL, topicId)`, reusing the Quick Match actor. Ratings come from the in-memory cache fed by `minnal.rating.updated` (missing means 1200). The question set is fetched before `MATCH_FOUND` (2 s timeout, `MATCHMAKING_FAILED` on failure) and queue wait is recorded.
- The question set comes from `POST /internal/question-sets` with `source: BANK` and the `topicId` filter, returning exactly `count` questions or 422.
- Ratings are mode-generic. ratings-service is the sole ELO computer, driven by `minnal.match.completed` (BANK source means rated).
- Conventions: REST under `/api/<service>/v1/...` with camelCase JSON and RFC 9457 errors. The frontend uses TanStack Query for REST and the Zustand live-game store only via the WebSocket module. Components never compute scores or correctness. Strings in `ml` and `en` via react-i18next.
- Core owns solo practice data, and there are no cross-schema reads. Per-user token buckets apply to REST writes.

## UX & Interaction Patterns

- The topic picker is a shared subject/topic chooser used by Topic Duel, Solo Practice and (later) Battle Room source selection.
- The Solo Practice screen uses the same commit-on-lift answer options as live matches. After answering it shows correctness plus the explanation and attribution block, including the "report a wrong question" link, then a next-question action.
- The "Coming soon" Topic Duel and Solo Practice rows from the Story 2.1 mode list become live entries.

## Cross-Story Dependencies

- Story 4.1 (topic picker and catalogue) is the foundation for 4.2, 4.3 and for Epic 5's source picker.
- Story 4.4 depends on Solo Practice (4.3) and on the results breakdown from Epic 1.
- Builds on the match engine, results and rematch (Stories 1.6-1.10), ratings, history and leaderboards (Stories 2.5-2.7), the subject/topic tables (Stories 1.4, 3.2), and the shared report link (Story 3.5).

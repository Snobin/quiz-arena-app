# Epic 6 Context: Rajeev sir brings his own questions

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A registered player who teaches a PSC batch can turn LLM-generated questions into a private "custom topic": paste JSON, see exactly what is wrong before anything is saved, and get a topic that only they can use in Solo Practice and in their own Battle Rooms. Nothing is ever half-imported, and fair-use caps keep storage bounded.

## Stories

- Story 6.1: Custom-topic import API
- Story 6.2: Import screen
- Story 6.3: Manage my custom topics
- Story 6.4: Practise a custom topic
- Story 6.5: Battle Room with a custom topic

## Requirements & Constraints

- Registered players only; guests are rejected server-side. A custom topic is visible only to its owner, never on leaderboards, and the server serves it only to its owner.
- Import takes pasted JSON `{topic, questions[{question, options[4], answer 0-3, explanation}]}`. The topic name comes from the request and defaults from `"topic"`. Any failure saves nothing; errors are field-level (question number, field, problem, fix; JSON syntax errors carry line and column). All problems are reported, not just the first.
- Fair-use caps: 50 topics and 500 questions per user, enforced in core-service, warning at 80% of either. An over-cap import is blocked with a message naming the cap and the overshoot.
- Owner can view a topic's questions, re-import to replace them, and delete it. Custom topics feed Solo Practice and Battle Room only, never Quick Match or Topic Duel.
- Custom questions are single-language as written (never translated); custom-topic questions are not reportable. Battle Rooms with a custom source are unrated and labelled so.
- Import is rate-limited per user (REST write); oversized paste bodies are refused.

## Technical Decisions

- core-service owns all custom-topic storage and rules; only `app_user` is referenced from its tables. Custom tables are never read by the bank catalogue, the admin console, or the bank branch of `/internal/question-sets`.
- One shared `QuestionValidator` serves the admin form, CSV upload and custom-topic JSON; custom topics add a profile to it, they do not get a second validator. The admin profile's behaviour must not change.
- Question-set contract: `POST /internal/question-sets {source: BANK|CUSTOM, customTopicId?, count, requesterId}` returns exactly `count` questions or 422 (never short); CUSTOM succeeds only when `requesterId` owns the topic.
- Per-user token buckets in Valkey guard REST writes (key `core:rl:<action>:<userId>`); the limiter refunds a token on a caller-caused 400/404/409.
- Problem Details (RFC 9457) for errors; save-and-cap checks run in one transaction that locks the owner's `app_user` row so concurrent imports cannot both pass the caps.

## UX & Interaction Patterns

- Import screen lives at `/me/custom-topics/import` under the Me tab, with a monospace paste area and line-number gutter, a live tally ("15 found · 425 / 500"), tap-to-jump field errors, a locked row for guests, and an inline schema reference with a sample GPT prompt. Calm screen: no volt colour, brick only on error text.

## Cross-Story Dependencies

- 6.1 (API) underpins 6.2 (screen), 6.3 (list, view, re-import, delete) and 6.4 (Solo Practice source). 6.5 depends on the Epic 5 room source field and on 6.4's custom-session path.
- Epic 4 retro: make the Valkey solo-session create atomic before 6.4.

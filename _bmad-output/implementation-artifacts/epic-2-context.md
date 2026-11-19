# Epic 2 Context: Anju gets an account and a rating

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A guest who has just finished a Quick Match signs in with Google (redirect flow), completes a one-screen profile, and returns to where she was. From then on every rated match updates her per-mode ELO rating, results show the rating change, Me shows her ratings and last 20 matches, and Ranks shows daily/weekly/all-time Kerala leaderboards. Settings covers language, Reduce effects, sign-out and account deletion. This adds core-service accounts and tokens, the whole ratings-service, and game-service's rating cache so matchmaking uses real ratings. Out of scope: Topic Duel/Solo Practice (Epic 4), Battle Room play (Epic 5; only its N-player rating maths is built here), reporting (Epic 3), share card/install prompt (Epic 7), phone OTP (deferred).

## Stories

- Story 2.1: Sign in with Google
- Story 2.2: Refresh token rotation and session continuity
- Story 2.3: Profile setup and editing
- Story 2.4: Guest results sign-in prompt
- Story 2.5: Ratings service computes ELO
- Story 2.6: Rating change and match history
- Story 2.7: Leaderboards
- Story 2.8: Settings and account deletion

## Requirements & Constraints

- Guests are never rated or persisted, and a guest result is never migrated into a new account (no endpoint or field may accept one).
- Sign-in is a full-page redirect (no popup, One Tap or iframe); `returnTo` must be a relative in-app path to prevent open redirects. Access token lives in memory only.
- Login goes through a `LoginMethod` interface (Google is the only implementation) so phone OTP can be added later; token issuing and refresh must not reference Google.
- ADMIN role comes from an `ADMIN_EMAILS` env var, matched against a verified Google email and recomputed on every issue/refresh.
- Registered players must complete profile setup before playing. Display-name rule is shared in a web validator and core (core authoritative): NFC, 2-24 grapheme clusters, Latin/Malayalam/digits/limited punctuation, reserved names blocked. Names are inserted unchanged in Malayalam strings, never inflected.
- Ratings: start 1200, integer, no floor; pairwise ELO with K = 32/(N-1), placement-only scores. GUEST opponent counts as 1200, BOT as the human's own rating. Forfeiters are rated on their placement. Unrated (custom-topic) matches write history with null delta only.
- Leaderboards: rank is competition ranking; top 100 listed, max 50 per page; anyone with a rated match in the period has a position; guests can read boards.
- Account deletion removes the user from every board and from play; matches in progress continue. DPDP erasure scope is an open question to resolve before launch.
- Malayalam copy flagged TBD must be catalogued, not invented. Accessibility: 48px hit areas, polite announcements, errors never colour-only.

## Technical Decisions

- Schema per service, no cross-schema FKs; services reference each other by UUID only. core owns `app_user`, `user_identity`, `refresh_token`, `user_profile`, `event_outbox`; ratings owns `rating`, `rating_event`, `match_record`, `player_directory`, outbox. Each story's Flyway migration creates only its own tables.
- Access JWT: RS256, 1 h, claims `sub`, `roles`, `name`, `lang`, signed with the key from Story 1.5. Refresh token: 30 days, hashed at rest, httpOnly Secure SameSite=Strict cookie on `Path=/api/core/v1/auth`; rotation with family reuse detection, CSRF guard (Origin plus `X-Minnal-Auth: 1`), and Web Locks to serialise refresh across tabs.
- An open WebSocket survives access-token expiry; reconnect refreshes first and an expired token is refused.
- Events on Valkey Streams: transactional outbox plus relay (`XADD ... MAXLEN ~100000`), at-least-once, one consumer group per service, `XACK` only after DB commit, `XAUTOCLAIM` on boot, dead-letter to `minnal.deadletter` after 5 deliveries. Consumers must be idempotent. Streams: `minnal.match.completed` (consumed), `minnal.user.profileUpdated`, `minnal.user.deleted`, `minnal.rating.updated`.
- `player_directory` in ratings is last-write-wins by `updatedAt` and tombstoned on deletion (a tombstone is never cleared).
- ratings-service is the sole ELO computer; game-service and core hold no ELO logic (architecture test). game-service rebuilds an in-memory rating cache (and deleted-user set) by replaying streams with plain `XREAD` on boot.
- Leaderboards are a projection: Valkey sorted sets `ratings:lb:{mode}:{daily|weekly|alltime}:{periodKey}` (IST day, ISO week, `all`), written only by ratings via absolute `ZADD` recomputed from Postgres (never `ZINCRBY`); rebuildable via `--rebuild-leaderboards` and auto-rebuilt on boot if the marker key is missing. Daily keys expire in 8 days, weekly in 5 weeks.
- Modes are `QUICK | TOPIC_DUEL | BATTLE_ROOM`. Times are UTC on the wire; IST only for display and board periods.
- Endpoints: `/api/core/v1/auth/{google/start,google/callback,refresh,logout}`, `/api/core/v1/me`, `/api/core/v1/me/profile`, `/api/ratings/v1/matches/{matchId}`, `/me/ratings`, `/me/matches`, `/leaderboards/{mode}/{period}`. Errors use Problem Details.

## UX & Interaction Patterns

- Guest results show one inline sign-in card (never a modal) between the results band and the breakdown, with copy built from that match's result; it never promises the match will be saved. After sign-in the same results rehydrate from `sessionStorage`, with a muted "played as guest" note, no delta, and "Play again" in place of Rematch.
- After `/auth/return`, focus goes to the originating surface's heading and "Signed in as <name>" is announced; new accounts see the profile setup screen first.
- Profile form: visible labels, native selects (14 Kerala districts plus Outside Kerala; 10th/Degree/Other), language switches the UI immediately but saves only on Save; field errors use icon plus text with `aria-describedby`.
- Rating delta on results: muted placeholder with no layout shift, retry on 404 for up to 10 s, then "updating". Volt chip for wins, grey for loss/draw; no delta for guests or unrated matches.
- Me tab: profile section, rating trio, last-20 history, each section with its own inline retry. Ranks tab: mode switcher plus period tabs that keep state and scroll, own row pinned when off-screen, empty-board card, one nudge for guests, no volt on Ranks. Home shows a rank snippet for registered players.
- Settings: Language, Reduce effects (per-device, Follow phone default), Sign out, Delete account via an alertdialog with focus on Cancel.

## Cross-Story Dependencies

- 2.1 is the base for everything else; 2.2 replaces its non-rotating refresh; 2.3 adds the setup redirect to `/auth/return` and the outbox that 2.8 reuses.
- 2.4 depends on 2.1 and 2.3 for the return flow and on the Story 1.10 results screen and `sessionStorage` result.
- 2.5 produces the rating data that 2.6 (delta, history) and 2.7 (boards) read; 2.7's projector runs from 2.5's outbox entry. 2.5 also needs 2.3's `profileUpdated` for the directory.
- 2.8 needs 2.1/2.2 (logout, revocation), 2.3 (language save) and 2.5/2.7 (tombstone, board removal).
- Builds on Epic 1: the match engine publishing `minnal.match.completed`, the matchmaking actor, the guest token/JWKS from Story 1.5, the Me and Ranks placeholders and the Reduce-effects store from Story 1.3.
- Later epics depend on this one: Epics 4 and 5 unlock their locked mode rows and rating modes; Epic 3 reuses the ADMIN role.

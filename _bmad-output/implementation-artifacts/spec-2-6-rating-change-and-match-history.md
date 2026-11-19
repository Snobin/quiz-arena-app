---
title: 'Story 2.6: Rating change and match history'
type: 'feature'
created: '2026-11-19'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-ratings-service-computes-elo.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-4-guest-results-sign-in-prompt.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ratings are now computed and stored, but a player cannot see them: results show no rating change, and Me shows no ratings or match history.

**Approach:** ratings-service serves three read endpoints for the signed-in player; the results screen shows the match's rating delta (waiting for it while the match is processed), and Me and Home show a three-mode rating trio and the last 20 matches. The Story 2.6 criteria in `epics.md` are the contract; this spec adds the decisions below.

## Boundaries & Constraints

**Always:**
- Endpoints under `/api/ratings/v1`, USER or ADMIN tokens only (a GUEST gets 403 Problem Details, no token 401), the caller's own data only, never a path or query that names another user: `GET /matches/{matchId}` (`{matchId, mode, rated, ratingBefore?, ratingAfter?, delta?}`, 404 Problem Details when the caller has no record yet), `GET /me/ratings` (`{ratings: [{mode, rating}]}` for QUICK, TOPIC_DUEL, BATTLE_ROOM, 1200 when never rated), `GET /me/matches?limit=20` (`{matches: [{matchId, mode, result, score, placement, rated, ratingDelta?, endedAt}]}`, newest first by `endedAt`, limit 1 to 20, default 20). Null fields are omitted. No change to what ratings-service writes.
- Results: only a registered player's own rated match (`questionSource` BANK, not a guest-played one) shows a delta slot. It fetches the delta, retrying 404 with backoff for up to 10 s; the slot reserves its height from the start (no layout shift) and shows a muted placeholder, then "updating" after 10 s (ml flagged TBD). A win shows a volt chip with on-volt text ("+24"); a loss or draw shows a grey delta. The results heading's accessible name gains the rating ("…, rating +24"). A guest's results, and an unrated match (`rated: false`, or a CUSTOM source), show no chip, placeholder or "updating". The win takeover shows the delta only if it has already arrived.
- Me and Home (registered only; guests never see them): a rating trio of three small read-only cards (mode label, rating in Latin digits, grouped, tabular). Me also shows the history: each row has result (Won, Lost, Draw), mode, date in IST (display only) and the delta, or a muted "unrated" for a null delta. With no matches: one plain line in voice and a primary action that starts a Quick Match. The ratings and the history load independently; each failure shows an inline retry with the reason and nothing else on the page breaks.
- New copy has ml and en with sign-off flags (TBD flagged where the epic says so); names are inserted unchanged.

**Never:**
- No leaderboard, no rating of other players, no change to ELO, the consumer or the outbox, no rating data in the web store beyond the screens that show it, and no delta for a guest.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rated record | USER token, match processed | 200 with before, after, delta | N/A |
| Not processed yet | USER token, no record | 404 Problem Details; results retry for up to 10 s, then "updating" | N/A |
| Unrated record | Record with `rated=false` | 200, `rated: false`, no rating fields; results show nothing | N/A |
| Another player's match | Caller has no record | 404 (same as not processed) | N/A |
| Guest or no token | GUEST token / none | 403 / 401 | N/A |
| Fresh player ratings | Never rated | All three modes 1200 | N/A |
| History | 25 matches | 20 newest, newest first | Bad `limit` is 400 |
| Trio or history fails | 5xx or offline | That section shows a retry; the rest still renders | Retry refetches that section only |

</frozen-after-approval>

## Code Map

- `services/ratings` -- new `rating/api` package (`RatingsController`, response records, a Problem Details handler) and a read repository over `rating`, `rating_event`, `match_record`; `platform/infrastructure/security/{SecurityConfig,MinnalAuthentication,MinnalPrincipal}.java` give the caller (`sub`, roles); tests extend `support/PostgresIntegrationTest` and use the `TestJwks` token helper (see `security/ResourceServerTest`, `LazyJwksTest` for the JWKS property).
- `web/src/auth/apiFetch.ts` (registered token, 401 retry), `config/apiBase.ts`; new `web/src/ratings/{ratingsApi,useMatchDelta,RatingTrio,MatchHistory}` and tests.
- `web/src/screens/results/{ResultsScreen,ResultsBand,WinTakeover}.tsx` -- delta slot, heading name; `screens/MeScreen.tsx` and `screens/home/RegisteredHome.tsx` -- trio and history; `i18n/catalogue.ts`; Vite proxy and Caddy already route `/api/ratings`.

## Tasks & Acceptance

**Execution:**
- [ ] `ratings` read repository, the three endpoints, auth rules, Problem Details; integration tests for every matrix row
- [ ] `web` ratings API client and `useMatchDelta` (backoff, 10 s limit, 404 vs other errors); delta slot in the results band, takeover pass-through, heading name; tests incl. guest, unrated, CUSTOM, retry then "updating"
- [ ] `web` rating trio (Me and Home) and match history with empty state and independent retries; i18n; tests

**Acceptance Criteria:**
- Given the epics.md Story 2.6 criteria, when ratings-service and the web app run against fixtures, then each passes.
- Given a guest or an unrated match, when results render, then no delta chip, placeholder or "updating" appears.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `./mvnw -B -pl contracts,services/ratings -am test` -- expected: green (JDK 25 `JAVA_HOME`, `MAVEN_SKIP_RC=1`; podman `DOCKER_HOST` here)
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` -- expected: green

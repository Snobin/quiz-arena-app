---
title: 'Story 2.7 part B: the Ranks tab and the Home rank snippet'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: '8b1e5f4fdaa6b48ddff9aa2bef605c4d5753e05a'
route: 'oneshot'
review_loop_iteration: 0
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The leaderboard API exists (Story 2.7 part A) but the Ranks tab is still a placeholder and Home shows no standing.

**Approach:** Replace the Ranks placeholder with the real screen and add the Home rank snippet, exactly as the Story 2.7 web criteria in `epics.md` describe: a mode switcher over period tabs and a list header naming the measure; rows with rank, unchanged name, district and value (`+142` for gains, `1,912` for ratings), ranks 1 to 3 in bold ink, no volt and no bolt on the list; the registered player's row pinned above the tab bar on a paper strip when it is out of view (with a "നിങ്ങൾ" tag on her own row), none for a guest or when she has no position; an empty card with the viewed mode's start action (aria-disabled "Coming soon" for Topic Duel and Battle Room), a link to a board that has rows and three decorative ghost rows; exactly one Sign-in nudge below the list for a guest; mode, period and scroll kept when she returns to the tab; and, for a registered player on Home, a rank card (her Quick Match daily rank, her day's gain, or "Not on today's board yet" with "Play a Quick Match") that opens Ranks on Quick Match · Today. Keyboard and screen reader: 48px hit areas, a visible focus ring, the switcher exposes the selected mode, and each row's accessible name reads rank, name, district and value in order. Boards load 50 rows with a "Show more" for the next 50 (top 100 only). Copy has ml and en with sign-off flags; this is part B of Story 2.7, split out when the backend (#42) was built.

</frozen-after-approval>

## Implementation Notes

- New `web/src/ranks/` (API client, selection store, `RankRow`, `PinnedRow`, `EmptyBoard`, `RankSnippet`) and the real `screens/RanksScreen.tsx`; `RegisteredHome` shows the snippet above the trio; `SignInNudge` takes a `returnTo` so a guest on Ranks comes back to `/ranks`.
- Her own row is found by the token's `sub` through a new non-reactive `session.userId()`; the board is the first 50 rows with "Show more" for rows 51 to 100 (a second query). Pinning uses `IntersectionObserver` when it exists; without it a row in the list counts as visible, and a position beyond the loaded rows (or the top 100) is always pinned.
- Mode and period live in a small store (kept across tab switches); the scroll offset is kept by the shell's per-path memory, which works because the board is cached (`staleTime` 30 s) and renders at once on return.
- Bug found by the tests: `App` removed the cached ratings, history and board queries whenever the session was not registered, including on a guest's first render, which cancelled the board request and left guests on "Loading…". It now clears them only on the transition from signed in to signed out.
- The initial JS is 143.6 KB gzipped (budget 150 KB).

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Guests and registered players shared one board cache entry, so a guest who signed in kept a board with no `me` (no pinned row, a wrong "Not on today's board yet") | high | patch (fixed) | the query key carries guest or member; test added |
| "Show more" could request the next page for a board it was not pressed on; no feedback while loading; a player could appear twice across pages | medium | patch (fixed) | `more` is derived per board; the button shows loading and stays until the page arrives; rows are deduped; tests added |
| The `IntersectionObserver` was recreated on every render and the visibility flag carried over between boards | medium | patch (fixed) | stable ref, reset on board or position change |
| The mode switcher and period tabs had no arrow-key roving, `aria-controls` or `aria-labelledby` | medium | patch (fixed) | roving tabindex with arrow keys and wrap, panel wired to its tab; test added |
| Requests could not be cancelled; the unused `ranks.placeholder` copy stayed; a fragile `innerHTML` assertion; no tests for weekly, the snippet's error state or a short second page | low | patch (fixed) | abort signal passed through, key removed, assertion replaced by the `data-accent` check, tests added |
| Switching straight between registered accounts leaks cached data | low | false | sign-in is a full-page redirect, so the in-memory cache is new for the next account |
| Pinned row takes its name and district from the session and profile; the spacer and pinned heights are fixed numbers; the empty card may point at another empty board; no response validation | low | defer | cosmetic or rare; recorded |


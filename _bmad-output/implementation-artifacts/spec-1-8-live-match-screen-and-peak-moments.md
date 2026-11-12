---
title: 'Story 1.8: Live match screen and peak moments'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: '32ad1f73aeeeda40b1fcc1e49311ab4d28a52b57'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-quiz-arena-2026-11-11/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-quiz-arena-2026-11-11/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-quiz-arena-2026-11-11/mockups/key-live-match.html'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-live-match-engine.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The server now plays the whole match (Story 1.7), but the web app never subscribes to the match topic and `/match` is a "Match found · vs …" stub. A player sees no question, can't answer, and scores 0.

**Approach:**
- The single WebSocket module subscribes to `/topic/match/{matchId}` as soon as `MATCH_FOUND` arrives. It turns every match message into live-game store state, and sends answers.
- `/match` becomes the real live match screen. It shows the question, a server-driven countdown, commit-on-lift options and the lock state, plus the reveal peak band, bolt strike, explanation and attribution, through the flash scheduler and the reduced path.
- The epics.md Story 1.8 acceptance criteria and `mockups/key-live-match.html` are the contract. This spec adds the decisions below. Where the mockup's caption allows "one white frame flash", the AC wins: no full-white frames.

## Boundaries & Constraints

**Always:**
- **Store** (`realtime/liveGameStore.ts`, written only by `connection.ts`): add a `live` slice, `null` until `MATCH_FOUND`. It holds:
  - `matchId`, `participants`, `selfParticipantId`, `total`;
  - `phase` (`lead-in | open | revealed | ended`);
  - `question` (the `QUESTION_STARTED` payload);
  - `answered: participantId[]` (from `SCOREBOARD`);
  - `myAnswer {questionIndex, optionIndex, status: pending | locked} | null`;
  - `reveal` (the `QUESTION_REVEALED` payload) and `totals` (participantId → `totalScore`, from the last reveal);
  - `lastSeq`.

  A new `MATCH_FOUND` replaces it.
- **Connection** (`realtime/connection.ts`):
  - On `MATCH_FOUND` it subscribes to the match topic (and unsubscribes from the previous one).
  - It applies broadcasts in `seq` order and drops any with `seq ≤ lastSeq`. Gap/resync belongs to 1.9; a gap here is applied anyway.
  - `QUESTION_STARTED` resets `answered`, `myAnswer` and `reveal`.
  - `submitAnswer(optionIndex)`: only while `phase = open` and `myAnswer = null`, it sets `pending` and publishes `/app/match/{matchId}/answer {questionIndex, optionIndex}`.
  - `ANSWER_ACCEPTED` for the current index turns `pending` into `locked`. `ERROR ANSWER_REJECTED`/`NOT_IN_MATCH` while pending clears `myAnswer`, with no message.
  - After the reveal of the last index, `phase = ended`.
  - `clockOffsetMs` is updated from every message's `serverTime` (it already exists).
- **The live screen** (`screens/match/LiveMatchScreen.tsx`, replaces `LiveMatchStub`): the tab bar is hidden and the `.font-face-live` scope applies.
  - Only the top bar is sticky (≤ 48px): the hairline timer, the seconds label and "Q n/10" (`questionIndex + 1`).
  - In normal flow: the score strip, the question card, options A–D (`min-height: 56px`, wrapping text, never truncated) and the footer.
  - The answering state is monochrome.
  - Before the first `QUESTION_STARTED` (lead-in), it shows "Get ready…" with the score strip. With no `live` slice it shows the existing `match.none` view.
- **Score strip:** You (bold ink, from `selfParticipantId`) on the left with your total. The opponent on the right, with the name unchanged, the `BotBadge` for a bot, and a status "thinking" → "answered" (only from `answered`), plus their total. It never shows a pick before the reveal.
- **Language:** the question text follows the UI language (`i18n.language`) and falls back to the other language. Containers carry `lang`: `ml` for `textMl`, `en` for `textEn`, and options and explanation through `detectLanguage`.
  - **EN tag:** shown only when the other text exists. It is a 48px hit area, ≥ 8px from the question's first line, with `aria-pressed` and the accessible name "Show in English" / "മലയാളത്തിൽ കാണിക്കുക". Its visible label is "EN" while Malayalam shows, and "മല" while English shows. It resets on each new question and never touches settings.
- **Options:** pressed (ink border) on `pointerdown`. A move over 10 px or a `pointerleave`/`pointercancel` cancels the press, and the next `click` is ignored. The commit happens on `click` only (keyboard Enter/Space included), with `touch-action: manipulation`.
  - After the commit, the tile shows "…" until the ack, then the locked state: a 1.5px ink border, an ink letter tile and "ലോക്ക്" (`match.lockTag`). "Locked in" is announced politely, and later taps are ignored.
  - Footer: `match.firstTapHint` before the lock, then `match.lockedFooter` ("Locked in · result when time runs out").
- **Countdown:** `remaining = deadline − (Date.now() + clockOffsetMs)`, clamped at ≥ 0. There is no local 15 s timer, and it never pauses.
  - The bar is `transform: scaleX(remaining / 15 000)` with `transform-origin: left` and `will-change: transform`. Normally it is one CSS transition to 0 over `remaining` ms, restarted per question. Under the reduced path the scale is set once per second with no transition.
  - The seconds label ticks once per second (`ceil(remaining / 1000)`), with `aria-label` "9 സെക്കൻഡ്" / "9 seconds", and it is not a live region.
  - At 5 s, once per question: a polite announcement (`match.fiveSeconds`) and `navigator.vibrate?.(30)`.
- **Reveal** (on `QUESTION_REVEALED`; every number and the correctness come from the payload):
  - The band (`design/peak/RevealBand.tsx`; volt only inside `design/peak/`) drops in from the top (`motion.bandDrop`, transform only).
  - **Correct:** the answer in `peak-word` type, `+points` in volt `peak-points`, the total beside it, and one bolt strike (`design/peak/BoltStrike.tsx`: an inline-SVG bolt ≤ 10% of the viewport area; volt for `motion.strikeVoltHold`, done within `motion.strikeTotal`, opacity/transform only, no white frame). The correct option gets the band fill with a volt ✓ tile.
  - **Wrong or no answer:** the same band with no bolt or volt, and `match.wrong` naming the correct answer. A wrong pick is marked in brick, and the other non-chosen options turn muted.
  - The opponent's pick shows the opponent's unchanged name on that option.
  - Both drop and strike go through `requestFlash`, cancelled on unmount or a new question. The first band drop of the session is wrapped in `monitorBandDrop()`.
  - Under the reduced path, the reveal is a plain `motion.reducedFade` (200 ms) opacity fade with no drop or strike.
  - Dark mode: the band and the correct option carry a 1px volt edge, and no white except text.
  - Below the band: the explanation (with `lang`), then the attribution, or `match.sourceNotAvailable` ("ഉറവിടം ലഭ്യമല്ല" / "source not available").
  - The polite announcement is `match.revealCorrect` ("Correct. Answer: {{answer}}. +{{points}}, total {{total}}"), or `match.revealWrong` (names the answer and the total). Numbers go through `formatNumber`/`formatSigned`.
- **Focus & announcements:**
  - On each new question, focus moves to the question heading (`tabindex="-1"`). Its accessible name is the question text + `match.questionPosition` ("ചോദ്യം {{n}} / {{total}}, 15 സെക്കൻഡ്").
  - `document.title` = `title.question` ("ചോദ്യം {{n}} / {{total}} · മിന്നൽ").
  - The opponent answering is announced once per question (`match.opponentAnswered`, with the name).
  - On a reveal, focus stays where it is.
- **After the 10th reveal** (`phase = ended`): the last reveal stays up, with a final line (`match.over`, "Match over · {{total}}") and a Home link. Results arrive in 1.9/1.10.
- **Strings:** every new key goes in both languages with `signoff: ['ml','en']`. Agent-drafted Malayalam is flagged. `check:i18n` passes.
- **Matchmaking screen:** unchanged, except that `/match` now renders the live screen.
- Components read only the store. They never compute correctness or points.

**Never:**
- Reconnect, SNAPSHOT, resync, the Leave dialog or forfeit (1.9).
- Results, the win takeover or rematch (1.10).
- Report links (Epic 3), the Battle Room scoreboard or overtake (Epic 5).
- Any server change.
- Client-side scoring, correctness or timing beyond the display.
- Volt outside `design/peak/`.
- Animating anything but transform or opacity.
- A full-white frame.
- A Settings UI for Reduce effects (Epic 2).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Subscribe | `MATCH_FOUND` | topic subscribed before `/match` opens; Q1 not missed | N/A |
| Open | `QUESTION_STARTED` i = 3 | "Q 4/10"; heading focused with the full name; title "ചോദ്യം 4 / 10 · മിന്നൽ"; options A–D; first-tap hint | N/A |
| Language | UI ml, `textMl` missing | English text shown, container `lang="en"`; EN tag hidden | N/A |
| EN tag | UI ml, both texts | tap → English text, `aria-pressed=true`; next question → reset | N/A |
| Tap | pointerdown + click on B | pressed → "…" → `ANSWER_ACCEPTED` → locked "ലോക്ക്"; "Locked in" announced once; more taps ignored | N/A |
| Slide off | pointerdown, move 12 px, click | no answer sent | N/A |
| Rejected | `ERROR ANSWER_REJECTED` while pending | option unlocked, nothing shown | N/A |
| Countdown | offset +2 s, deadline 15 s ahead | label from server time; bar transition; 5 s announcement and vibrate once | N/A |
| Reduced | reduced path on | bar steps per second; reveal = 200 ms fade, no drop or strike | N/A |
| Scoreboard | opponent in `answered` | "answered"; announced once per question; no pick shown | N/A |
| Correct | reveal, self correct, +800 | band + volt points + total + one strike via `requestFlash`; correct option volt ✓; "Correct. Answer: X. +800, total 3,140" announced | N/A |
| Wrong | reveal, self wrong | no bolt or volt; `match.wrong` names the answer; own pick brick; others muted; opponent's pick named | N/A |
| No answer | reveal, self no pick | wrong path, no brick | N/A |
| Attribution | null / present | "source not available" / the source | N/A |
| Duplicate | broadcast `seq ≤ lastSeq` | ignored | N/A |
| End | reveal of index 9 | `match.over` line + Home link | N/A |
| No match | `/match`, no `live` slice | the `match.none` view + Home | N/A |

</frozen-after-approval>

## Code Map

**Web (`web/src/`):**
- `realtime/protocol.ts`: Story 1.7 added the parsers and `Incoming` variants for `QUESTION_STARTED`, `ANSWER_ACCEPTED`, `SCOREBOARD`, `QUESTION_REVEALED` and the error codes. Reuse them. Add `matchTopic(id)` and `matchAnswer(id)` helpers next to the existing `matchmakingJoin`/`matchmakingCancel`.
- `realtime/connection.ts`:
  - `onIncoming` switch (Story 1.6): add the cases.
  - `onConnect` subscribes only to `USER_PRIVATE_QUEUE`; the topic subscription is added on `MATCH_FOUND` through the same `RealtimeClient.subscribe`. Keep the `generation` guard on callbacks.
  - Export `submitAnswer`. Keep the injectable `ClientFactory` pattern; `test-utils/realtime.ts` (`useFakeRealtime`) is the test double. Extend it to deliver topic frames.
- `realtime/liveGameStore.ts`: `LiveGameState` and `INITIAL_LIVE_GAME`; the `useLiveGame(selector)` hook.
- `screens/match/LiveMatchStub.tsx` and `screens/match/opponents.tsx`: replace the stub with `LiveMatchScreen.tsx`; reuse `opponentsOf`/`OpponentNames`. `App.tsx` routes `/match`. Keep the `?matchId=` filter behaviour (show the store match only if the ids match).
- `design/peak/`: the only folder where volt may appear (`check:tokens`). Put `RevealBand.tsx`, `BoltStrike.tsx` and the correct-option volt tile there. `design/BotBadge.tsx` already exists.
- `motion/flashScheduler.ts`: `requestFlash(run) → cancel`. `motion/reduceEffects.ts`: `useReducedEffects()`, `monitorBandDrop()`.
- `design/tokens.ts`: `motion.bandDrop`, `strikeVoltHold`, `strikeTotal`, `reducedFade`; typography `peak-word` and `peak-points` (check the theme.css utility names).
- `design/fonts.css`: the `.font-face-live` scope (`font-display: optional` face).
- `i18n/Lang.tsx` (`Lang`, `detectLanguage`), `i18n/format.ts` (`formatNumber`, `formatSigned`), `i18n/useDocumentTitle.ts`, `shell/announce.ts` (`announce`), `shell/useHideTabBar.ts`.
- `i18n/catalogue.ts` already has `match.firstTapHint`, `match.locked` and `match.wrong` (with an `answer` param), so reuse them. Add: `match.lockTag`, `match.lockedFooter`, `match.getReady`, `match.you`, `match.thinking`, `match.answered`, `match.opponentAnswered`, `match.questionPosition`, `match.seconds`, `match.fiveSeconds`, `match.showEnglish`, `match.showMalayalam`, `match.revealCorrect`, `match.revealWrong`, `match.correctAnswer`, `match.sourceNotAvailable`, `match.explanation`, `match.over`, `title.question`.
- Tests follow `screens/matchmaking/MatchmakingScreen.test.tsx` (`renderApp`, `useFakeRealtime`, fake timers). The flash scheduler and reduce effects have test resets (`resetFlashScheduler`). `design/FlashFixture.tsx` is a dev QA fixture to extend with a reveal-band demo (dev only, dropped from dist; `check:dist` verifies).

## Tasks & Acceptance

**Execution:**
- [x] `web/src/realtime/{liveGameStore,connection,protocol}.ts` + tests: the topic subscription on `MATCH_FOUND`, seq de-dupe, every message → store, `submitAnswer` gating, pending → locked or cleared, ended after the last reveal, a replaced match.
- [x] `web/src/design/peak/{RevealBand,BoltStrike}.tsx` + tests: correct, wrong and reduced variants; `requestFlash` used; bolt area ≤ 10% of the viewport (computed from its size); transform/opacity only.
- [x] `web/src/screens/match/*` (`LiveMatchScreen`, `TimerBar`, `ScoreStrip`, `QuestionCard`, `OptionList`, `RevealDetails`) + `App.tsx`: the layout and states per Boundaries.
- [x] `web/src/screens/match/*.test.tsx`: every matrix row, plus focus and title per question, the opponent-answered single announcement, the 5 s announcement and vibrate once (fake timers), the seconds-label `aria-label` and no live region, and no correctness or score computation (the components render only payload values).
- [x] `web/src/i18n/catalogue.ts`: the new keys in both languages, flagged.
- [x] `web/src/design/FlashFixture.tsx`: a dev demo of a correct and a wrong reveal.

**Acceptance Criteria:**
- Given `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check`, when it runs, then everything passes within the 150 KB initial-JS budget.
- Given `./mvnw verify`, when it runs, then it still passes (no server change).
- Given the stack running with a seeded bank, when a guest plays Quick Match against the bot in the browser, then all 10 questions appear, answers lock, each reveal shows the band (a strike when correct), and the match ends with the final line and a Home link.

## Implementation Notes

- **Choices the spec left open:**
  - Extra catalogue keys beyond the listed ones: `match.progress` (the "Q n/10" label), `match.secondsShort` (the visible "9 s"), `match.seconds_one/_other` (the full-word aria-label, plural in English), `match.tagEn`/`match.tagMl` (the EN tag's visible label), `match.sending` (screen-reader text for "…"), `match.bandCorrect` (band label "Question 4 · Correct") and `match.totalShort` ("total 3,140"). `match.stubNote` was removed with the stub. All new keys are drafted in both languages with `signoff: ['ml','en']`.
  - EN tag: the accessible name is fixed per question by the base language (`match.showEnglish` when the base text is Malayalam, `match.showMalayalam` when it is English); `aria-pressed` carries the toggle.
  - "…" sits in the option's status slot (where "ലോക്ക്" goes), per the mockup's (b) caption.
  - Peak order: the drop and the strike are two `requestFlash` requests, so the strike starts one flash window (1000 ms) after the drop, inside the 2 s reveal hold. The reduced-path fade also goes through `requestFlash`. Under the reduced path a correct band shows the bolt statically (no strike).
  - Reveal layout: the band sits between the score strip and the question; the question stays mounted so focus stays where it was.
  - `ERROR ANSWER_REJECTED`/`NOT_IN_MATCH` never touch the matchmaking `phase`/`problem`.
  - Volt elements carry `data-accent` so screen tests outside `design/peak/` can check where volt shows without naming volt classes (`check:tokens` scans tests too).
  - The answer window drawn by the bar is the constant 15 000 ms (`TimerBar.WINDOW_MS`); the heading's "15 seconds" comes from `deadline − startedAt`.
- **Verified:** `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check`: all green, 481 tests, initial JS 119.9 KB of 150 KB.
- **`./mvnw verify`:** core-service fails 2 seed tests (`SeedCsvReaderTest.starterFileHasThirtyUnsignedRowsThatFailOnlyOnReviewedBy`, `SeedRunnerIntegrationTest.unsignedStarterFileLoadsNothingAndEverySkipNamesReviewedBy`). They fail on the baseline: commit d2726de signed the starter CSV without updating these tests. No server file changed here. `./mvnw verify -pl contracts,services/game,services/ratings` passes.
- **Not done:** the manual browser checks (full Quick Match against the bot on the running stack, 320 px / 200% text, dark mode, OS reduced motion, screen reader).

## Spec Change Log

## Review Triage Log

Layers: BH = Blind Hunter, ECH = Edge Case Hunter, VG = Verification Gap.

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | BH, ECH, VG | ANSWER_REJECTED/NOT_IN_MATCH are claimed with no pending or matchId check | medium | A stale error clears a newer pending answer, allowing a second send; an unrelated NOT_IN_MATCH skips the old `rejected` path | patch |
| 2 | ECH | A `publish` that throws leaves the option stuck on "…" | low | `myAnswer` is set before the publish; direct correction | patch |
| 3 | ECH | A tap after the client-side deadline still sends, gets rejected, unlocks, and can repeat until the reveal | low | No deadline gate in `submitAnswer`; one-line guard | patch |
| 4 | BH, ECH | A failed send (socket closed) gives no feedback | medium | Real, but the closed-socket mid-match state is 1.9's reconnect scope | defer |
| 5 | ECH | A repeated `MATCH_FOUND` for the live match wipes the slice | false | The server sends `MATCH_FOUND` once per pairing (to every session of the `sub`); no path repeats it mid-match | reject |
| 6 | BH, ECH | Topic never dropped at the end; a new search keeps the old slice, so `/match` shows a stale ended match | medium | No unsubscribe on `ended`; `joinQuickMatch` doesn't clear `live` | patch |
| 7 | ECH | The countdown runs on over an early reveal | false | The server reveals only at deadline + close grace (Story 1.7); there is no early reveal | reject |
| 8 | ECH, BH | A reveal after a missed `QUESTION_STARTED` stays hidden | low | Needs a lost broadcast; gap/resync is 1.9's scope | defer |
| 9 | BH, ECH | Pick labels keyed by display name | low | Duplicate keys only with same-name opponents; direct correction | patch |
| 10 | BH, ECH | Volt edge on a wrong band in dark mode breaks the "no volt" rule | false | DESIGN.md L46 and UX-DR2: every reveal band carries a 1px volt edge in dark so it separates from paper-dark; "no volt" covers the bolt and points | reject |
| 11 | ECH | Band and correct option lack `data-accent` | low | Test-convention only; no user effect | reject |
| 12 | BH | The bar scales against a constant 15 000 ms, not `deadline − startedAt` | low | Diverges only if the server window changes; direct correction | patch |
| 13 | BH | Re-sampled offset moves the label but not the bar | low | Per-message latency jitter can shift the label by a second near a boundary; capture the offset per question | patch |
| 14 | BH | The end of the match isn't announced | medium | Screen-reader users get no cue that the match ended or that Home appeared | patch |
| 15 | BH | The opponent status shows "thinking…" over the reveal and at the end | low | `ScoreStrip` reads `answered` regardless of the reveal; direct correction | patch |
| 16 | BH | Hook dependency arrays omit `reduced`, `t` and other values | low | Works through `key` resets; a mid-reveal reduced toggle or a mid-match language change is rare, and the fix touches many effects | reject |
| 17 | BH | `opponentsIn` duplicates `opponentsOf` | low | Direct correction (reuse) | patch |
| 18 | BH | Spec says `protocol.ts` changes; frontmatter vs sprint status | false | Documentation only; a spec edit, not code | reject |
| 19 | BH | ACs unmet: core `./mvnw verify` fails; manual checks not done | low | The core failure predates this branch (PR #11) and is fixed in PR #13; manual checks are listed for the PR test plan | reject |
| 20 | BH | Tests miss `?matchId` equality, vibrate absent or throwing, EN-tag spacing, bar height | low | Layout items need a real browser (manual checks); `vibrate?.()` guards absence | reject |
| 21 | BH | `pressed` cleared only by `click` | low | A suppressed click leaves the border on; direct correction | patch |
| 22 | BH | The Story 1.8 string test excludes earlier keys with a brittle regex | low | Test maintenance only | reject |
| 23 | VG | The per-question re-arm of the 5 s cue and bar is tested only on Q1 | medium | Pre-verified: no test starts a second question | patch |
| 24 | VG | Drop-then-strike timing against the real flash scheduler is untested | medium | Pre-verified; holds with today's 1000 ms window and 2 s hold | defer |
| 25 | VG | Test helpers mix a fixed `SERVER_TIME` with `Date.now()` | low | Test-only hazard | reject |

## Design Notes

- **Subscribe in the connection module, not the screen:** the server's 3 s lead-in runs while the matchmaking screen waits for fonts plus a 1 s hold. A screen-level subscription could miss Q1. The store holds everything, so the screen just renders.
- **Why a CSS transition for the bar:** one transition per question runs on the compositor with no per-frame JS, which suits a 2 GB phone. The start value comes from server time, so a late render starts the bar already shorter, never at full width.
- **Ignoring the click after a cancelled press:** browsers still fire `click` after a small drag inside the element. The cancel flag is the only way to honour "a movement over 10 px counts as a scroll".

## Verification

**Commands:**
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check`: expected all green.
- `./mvnw verify`: expected BUILD SUCCESS.

**Manual checks:**
- In the browser (Malayalam and English UI), play a full Quick Match against the bot: question flow, lock, reveal band and strike, explanation and attribution, the end line.
- At 320 px and at 360 px with 200% text, in light and dark: no horizontal scroll and no clipped Malayalam, and the shaping fixture conjuncts render in the options.
- With OS reduced motion on: the stepped bar and fade reveals.
- A screen-reader pass: the heading name on each question, "Locked in", the reveal announcement, and the opponent answered once.

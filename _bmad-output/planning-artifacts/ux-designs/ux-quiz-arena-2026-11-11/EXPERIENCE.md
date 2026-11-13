---
name: Minnal
status: final
created: 2026-11-11
updated: 2026-11-11
sources:
  - _bmad-output/specs/spec-quiz-arena/SPEC.md
  - _bmad-output/specs/spec-quiz-arena/game-modes.md
  - _bmad-output/specs/spec-quiz-arena/question-content.md
  - _bmad-output/planning-artifacts/prds/prd-quiz-arena-2026-11-10/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-quiz-arena-2026-11-10/ARCHITECTURE-SPINE.md
---

# Minnal — Experience Spine

> **Visual references** (in `mockups/`): [`key-home.html`](mockups/key-home.html), [`key-live-match.html`](mockups/key-live-match.html), [`key-results.html`](mockups/key-results.html), [`key-battle-lobby.html`](mockups/key-battle-lobby.html), [`key-leaderboards.html`](mockups/key-leaderboards.html), [`key-custom-topics.html`](mockups/key-custom-topics.html), [`directions-2.html`](mockups/directions-2.html) (variant B). **DESIGN.md and EXPERIENCE.md win on any conflict with a mock.** Product rules (modes, scoring, ratings, schema, caps) live in the sources and are not restated here.

## Foundation

- **Player app:** mobile-first web PWA (React 19 + Tailwind 4, AD-18). Baseline: a 360px cheap Android phone on 3G.
- **Admin console:** desktop-first (laptop), lazy-loaded at `/admin`, never in the player bundle.
- **UI system:** Tailwind utilities with no component library. `DESIGN.md` is the visual identity; this spine is the behaviour.
- **The server is the referee.** The UI renders server state only: no client timing, scoring or correctness (AD-5, AD-6, AD-18).
- Light and dark themes are both first-class and follow the OS.

## Information Architecture

**Player app** (bottom tab bar **Play / Rooms / Ranks / Me** — കളി / റൂമുകൾ / റാങ്ക് / ഞാൻ):

| Surface | Reached from | Purpose | Mock |
|---|---|---|---|
| Home | Play tab, app open | Quick Match card, rank snippet, mode list, rating trio; guest-locked variant | [key-home](mockups/key-home.html) |
| Sign-in prompt | Locked mode row, Sign-in nudge, guest results | Google sign-in (redirect flow) | spine-only |
| Profile setup | First sign-in | One screen: name, district, exam level, question language | spine-only |
| Matchmaking | Quick Match / Topic Duel start, share-card link | Searching, bot fallback, cancel | spine-only |
| Topic picker | Topic Duel, Solo Practice, Battle Room source | Choose subject/topic | spine-only |
| Live match | Match found / host start (3-2-1) | Question → locked/waiting → reveal; full screen, no nav | [key-live-match](mockups/key-live-match.html) |
| Results (+ share card) | Last reveal | Win takeover, loss or draw band, breakdown, actions, share | [key-results](mockups/key-results.html) |
| Solo Practice | Home mode row, custom topic view | Untimed question → immediate answer + explanation; registered only | spine-only |
| Rooms tab | Tab bar | Create room, Join with code, recently hosted rooms | spine-only |
| Battle Room create / join | Rooms tab, join link `/r/<code>`, custom topic view | Host creates; player enters code, or the link opens the room directly | spine-only |
| Battle Room lobby | Create / join | Code, share, source, count, joined list, host start | [key-battle-lobby](mockups/key-battle-lobby.html) |
| Battle Room live scoreboard | Host start | Question + answered meter + scoreboard | [key-battle-lobby](mockups/key-battle-lobby.html) |
| Battle Room results | Last reveal | Podium (top 3), #1 win takeover, full standings, Play again | spine-only |
| Leaderboards | Ranks tab, rank snippet | Mode × today / this week / all-time, pinned own row | [key-leaderboards](mockups/key-leaderboards.html) |
| Profile | Me tab | Three ratings, last 20 matches | spine-only |
| Custom Topics | Me tab; Battle Room / Solo source picker | List + usage meter, JSON import, topic view, re-import, delete | [key-custom-topics](mockups/key-custom-topics.html) |
| Settings | Me tab | Language, Reduce effects, sign out, delete account | spine-only |

**Me tab** holds Profile, Custom Topics and Settings.

**Admin console** (desktop):

| Surface | Purpose | Mock |
|---|---|---|
| CSV upload | Upload; valid rows import as drafts, bad rows listed | spine-only |
| Draft queue | Review, tag, publish / discard | spine-only |
| Question editor | Edit; saving creates a new draft version (separate page, not a modal) | spine-only |
| Report queue | Player reports against question versions | spine-only |

Rules: the live match, the win takeover and the Battle Room lobby have no tab bar. Modals go one level deep at most.

## Voice and Tone

A sharp, friendly tuition-batch classmate: short, warm, lightly competitive, never shaming. A wrong answer always shows the correct one. Errors say exactly what to fix. Light slang (e.g. പൊളി) only at peak moments. Brand posture lives in `DESIGN.md` › Brand & Style.

**Display names are never inflected into Malayalam grammar.** Use the name unchanged, followed by a separator: `▲ Arjun K · മറികടന്നു`, not `അർജുനെ മറികടന്നു`. This supersedes the inflected form in the earlier microcopy log and in the lobby mock. Leaderboards mark your row with a "നിങ്ങൾ" tag, never by changing the name.

| Moment | Malayalam | English |
|---|---|---|
| Matchmaking | എതിരാളിയെ തിരയുന്നു… | Finding an opponent… |
| Bot joins | മിന്നൽ ബോട്ട് ചേർന്നു | Minnal Bot joined |
| First-tap hint | ഒന്നു തൊട്ടാൽ ഉത്തരം ലോക്ക് ആകും | [ASSUMPTION] One tap locks your answer |
| Locked | ഉത്തരം ലോക്ക് ചെയ്തു | Locked in |
| Wrong | ശരി: പെരിയാർ. അടുത്തതിൽ നോക്കാം! | It's Periyar. Get the next one! |
| Overtake | ▲ Arjun K · മറികടന്നു | ▲ You passed Arjun |
| Win | ജയിച്ചു! +24 | You won! +24 |
| Win (peak slang) | പൊളി! | — |
| Loss band | Vishnu ജയിച്ചു · അടുത്ത തവണ നിങ്ങൾക്ക് | [ASSUMPTION] Vishnu won · Next time's yours |
| Draw | സമനില | Draw |
| Reconnect | കണക്ഷൻ പോയി, തിരിച്ചു വരുന്നു… 8 | Reconnecting… 8 |
| Forfeited (Battle Room) | ബാക്കി ചോദ്യങ്ങൾ നഷ്ടമായി, മാച്ച് തുടരുന്നു | [ASSUMPTION] You missed the remaining questions; the match goes on |
| Forfeited (1v1) | [ASSUMPTION] നിങ്ങൾ പോയി · {name} ജയിച്ചു | You left · {name} wins |
| Opponent left (1v1) | [ASSUMPTION] {name} പോയി · നിങ്ങൾ ജയിച്ചു | {name} left · you win |
| Leave confirm | [ASSUMPTION] പുറത്തുപോകണോ? ബാക്കി ചോദ്യങ്ങൾ നഷ്ടമാകും | Leave? You'll forfeit the remaining questions |
| Report link | തെറ്റുണ്ടോ? | [ASSUMPTION] Something wrong? |
| Rematch waiting | [ASSUMPTION] Vishnu R · കാത്തിരിക്കുന്നു… | Waiting for Vishnu R… |
| Share CTA | [ASSUMPTION] ML string TBD | Beat me on Minnal |
| Lobby < 2 humans | — | Waiting for 1 more player |
| Leaderboard empty | [ASSUMPTION] ML string TBD | [ASSUMPTION] No one's on today's board yet. The first win today takes the top spot. |
| Import error | ചോദ്യം 7: 4 ഓപ്ഷനുകൾ വേണം, 3 എണ്ണമേ ഉള്ളൂ | Question 7 needs 4 options; it has 3 |
| Join: expired | — | K7M-Q2X has expired. Ask the host to share a new code. |
| Join: full | — | Room is full (50). Ask the host for a new room. |

## Bilingual Behavior

- **One language setting:** the player's question language drives both UI strings and question text. Guests default to the device language.
- Question text falls back to the other language when the preferred one is missing. Custom-topic questions show in whatever language they were written in, even inside an English UI.
- **Language toggle (EN tag)** on the live question shows the other-language text of the current question when it exists. [ASSUMPTION] It applies to that question only and doesn't change the setting.
- Latin-script names appear unchanged inside Malayalam UI (see the name rule above). Numerals are Latin digits with grouping (`7,840`, `#3,406`).
- **Share card** text follows the sharer's UI language.
- Never truncate a Malayalam question; wrap it.
- **`lang` attributes:** `<html lang>` follows the UI language. Question, option and explanation containers take `lang` from the content's language field (bank) or script detection (custom topics), not from the UI. Latin runs inside Malayalam strings (names, "BOT", "EN") are wrapped in `<span lang="en">`, and Malayalam runs in English UI in `lang="ml"`.

## Component Patterns

Behavioural. Visual specs live in `DESIGN.md` › Components.

### Shared

| Component | Use | Behavioral rules |
|---|---|---|
| Tab bar | All player surfaces except live match, takeover, lobby | Four tabs; the active tab keeps its scroll position (and, on Ranks, its mode and period) on return. |
| Buttons (disabled) | Host start, Import, offline play actions | `aria-disabled="true"` (stays focusable); an adjacent caption says why and what unlocks it. |
| Bot badge | Score strip, results | Always visible on a bot; never hidden. |
| Sign-in nudge | Home (guest) | Inline card, never a modal; one per screen; explains what an account unlocks. |
| Install prompt | Results | Inline card (styled as the Sign-in nudge) after a registered player's first completed match. Never for guests, never a modal. |
| Settings rows | Me › Settings | Language (see Bilingual Behavior), Reduce effects (on / off / follow phone; default follow phone; see Accessibility Floor), Sign out, Delete account (confirm first). |

### Home ([key-home](mockups/key-home.html))

| Component | Use | Behavioral rules |
|---|---|---|
| Primary action card | Home | Quick Match only; the one filled ink element on Home. One tap starts matchmaking. |
| Mode entry row | Home | Tap opens the mode. *Locked (guest):* stays visible; tap opens the Sign-in prompt. |
| Rank snippet | Home (registered) | Shows today's board rank and rating gained (IST day); tap → Ranks on Quick Match · Today. Hidden for guests. |
| Rating trio | Home (registered) | Read-only. Hidden for guests. |

### Live match ([key-live-match](mockups/key-live-match.html))

| Component | Use | Behavioral rules |
|---|---|---|
| Hairline timer | Live match | Shrinks linearly from the server deadline plus clock offset; the seconds label ticks once per second. |
| Score strip | Live match | Opponent status reads "thinking" → "answered", never what they picked. |
| Answer option | Live match, Solo Practice | Commits on `click` (the up-event) only. Sliding off before lifting cancels; a touch that moves > 10 px is a scroll, not a tap; `touch-action: manipulation`. Pressed shows on down; "…" after lift until the server acks (< 200 ms), then "ലോക്ക്". The first committed tap is final, with no confirm; later taps are ignored. No correctness until reveal. |
| Language toggle (EN tag) | Live match, Solo Practice | See Bilingual Behavior. Accessible name "Show in English" / "മലയാളത്തിൽ കാണിക്കുക", with `aria-pressed`. |
| Peak band | Reveal | Drops in when the player's own result is known: at her accepted answer in 1v1 modes, at the question's close in Battle Room (or when she did not answer). Correct: bolt + volt + points. Wrong: no bolt or volt; the correct answer is always named. The question-close reveal adds the opponent's pick, explanation and attribution without a second drop or strike. |
| Explanation + attribution | Reveal, Solo Practice, breakdown | Always shown with the answer; attribution when available, else "ഉറവിടം ലഭ്യമല്ല". |
| Report link | Explanation, breakdown row | Registered players, bank questions only. Opens a note field and submits against the exact question version. Hidden for custom topics. No revise or save list. |
| Reconnect banner | Live match | Replaces the timer area; counts 10 → 0; everything below is dimmed, `inert` and `aria-hidden`. |
| Leave confirm dialog | Live match | Back or leave opens it; the timer keeps running on the server. `role="alertdialog"`, focus on Stay, background `inert`; Android back / Esc = Stay; on Stay focus returns to the question heading. Leave forfeits the remaining questions. |
| Start countdown | Battle Room (all players) | Host taps Start → 3-2-1 for everyone, then Q1. The host has no countdown control. |

### Results ([key-results](mockups/key-results.html))

| Component | Use | Behavioral rules |
|---|---|---|
| Win takeover | Results (win) | `role="dialog"` labelled by its title, with a focused "Continue" button. Holds `{motion.win-hold}`, or until Continue / a tap anywhere, then collapses into the compact results band. Auto-advance is off under a screen reader or reduced effects (Continue only). The dismissing pointer event is consumed, and the results surface ignores taps for 400 ms after the collapse. |
| Results band (compact) | Results (settled) | Persistent summary: result, scores, rating delta (registered only; omitted for guests and unrated matches). |
| Draw band | Results | Shown on a tie in place of the win/loss band; no takeover, no volt. |
| Dot strip | Results | One dot per question in order; read-only. Exposed as a list ("Q1 correct … Q10 wrong"). |
| Breakdown row | Results | Correct rows render collapsed **on load** (no scroll trigger) as a `<button aria-expanded="false">`; expanding shows the full question. Wrong rows are always expanded. No height animation under reduced effects. |
| Action bar | Results | 1v1: Rematch (primary) / Home / Share. Battle Room: Play again / Home / Share. |
| Rematch waiting | Results (1v1) | Tap Rematch → "Waiting for <name>…" for up to 60 s, with Cancel. A bot accepts instantly. On timeout the note is announced and Rematch can be re-sent. [ASSUMPTION] The opponent's Rematch button reads "Accept rematch"; on timeout or cancel the button reverts with a one-line note. |
| Podium | Battle Room results | Top 3; #1 sees the win takeover first. Everyone else lands on the podium with their own place in the standings below. No GG reactions at MVP. |
| Share card | Results | Share opens the OS share sheet with the 1:1 image, a prefilled text line and a short link. The link opens Minnal straight into Quick Match (works for guests). No direct-challenge flow at MVP. |

### Battle Room ([key-battle-lobby](mockups/key-battle-lobby.html))

| Component | Use | Behavioral rules |
|---|---|---|
| Rooms list | Rooms tab | Create room, Join with code, then recently hosted rooms; tapping one opens Create with its source preselected. |
| Join code field | Battle Room join | Visible label; `inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false"`. Accepts lower case, with or without the hyphen, and strips spaces. The code alphabet excludes 0/O/1/I/L. Errors sit inline under the field (`aria-describedby` + `aria-invalid`). |
| Room code block | Lobby | Code is the largest element on screen; accessible name spells it ("K 7 M, Q 2 X"). Share-to-WhatsApp opens the OS share sheet with the code + join link (`/r/<code>`, e.g. `/r/K7M-Q2X`), which opens the room directly; copy code is secondary. Expiry is shown as an absolute time. |
| Source row + unrated tag | Lobby | Host-editable; a custom source shows "സ്വന്തം" and a plain-language unrated note up front. |
| Joined chip | Lobby | New joiners enter at the front with "ഇപ്പോൾ" for `{motion.chip-new-label}`. ≥ 5 joins/s fade in as one batch. The host shows as "നിങ്ങൾ". |
| Host start bar | Lobby (host) | Enabled at ≥ 2 humans (the host counts). The caption warns that leaving closes the room. Non-hosts don't see it. |
| Answered meter | Battle Room live | Count and bar update on every answer with no animation. Focusable `role="meter"` with `aria-valuetext`; never a live region. |
| Scoreboard row | Battle Room live | Updates within 500 ms of each reveal. Your row stays ink after an overtake until the next question starts. Each row's accessible name includes "answered" / "not answered yet". |
| Overtake crack | Battle Room live | Only your own row gets a crack, even when several ranks change in one reveal. |

### Leaderboards ([key-leaderboards](mockups/key-leaderboards.html))

| Component | Use | Behavioral rules |
|---|---|---|
| Mode switcher | Ranks | Quick Match / Topic Duel / Battle Room; exactly one selected. Switching swaps the list with no animation. |
| Period tabs | Ranks | Today / This week / All-time. Today and This week rank by rating gained in the period; All-time ranks by rating. The list header names the measure. Switching swaps the list with no animation. |
| Leaderboard row | Ranks | Rank, unchanged name, district, value. Read-only. Top 3 marked by bold numerals only. |
| Pinned own row | Ranks (registered, ranked) | When your position is outside the visible list, your row is pinned above the tab bar with a "നിങ്ങൾ" tag. When you scroll to your position, it unpins and shows in place. No pinned row when you have no position on that board. |
| Empty leaderboard card | Ranks (no rows yet) | One line in voice plus the next action: primary starts the mode being viewed; a text link moves to a board that has rows. No pinned row. |

### Custom Topics ([key-custom-topics](mockups/key-custom-topics.html))

| Component | Use | Behavioral rules |
|---|---|---|
| Usage meter | Custom Topics list, topic view | Shows both caps. At ≥ 80% of either cap it switches to the warning card with a "!" line giving the headroom and a way out ("delete an old topic"); dropped on the success view to keep focus on the success. Warning is never brick or volt. |
| Topic row | Custom Topics list | Opens the topic view (questions, Practice, Use in Battle Room, re-import, delete). The list header states the rules: private to you, never rated. |
| Import form | Custom Topics import | Topic name is prefilled from the JSON `"topic"` and stays editable. The paste area is monospace with no soft-wrap. |
| Pre-import tally line | Custom Topics import | Updates on paste: questions found and usage after import, so a cap overshoot is visible before Import. Over a cap, Import is blocked, naming the cap and the overshoot. |
| Disclosure rows | Custom Topics import | Schema reference and sample GPT prompt, each collapsible with a one-tap copy. Default: schema expanded, prompt collapsed; both expanded when the topic list is empty; both collapsed in the error state so the errors stay on screen. |
| Import error list | Custom Topics import, admin CSV upload | On a failed import nothing is saved. An error summary (`role="alert"`, heading counting the problems as a goal) renders above the input, linked by `aria-describedby`, and takes focus. One line per problem: item or row number · field · what's wrong · what to do. Tapping a line scrolls the paste area to that line, which is marked. JSON syntax errors give line, column and a likely cause. Over 20 errors: the first 20 grouped by field, full list downloadable as CSV. Import stays disabled until local validation passes; the server validates again on tap. CSV: a summary line ("N imported as drafts · M rows need fixes") above the list. |
| Success card | Custom Topics (after import) | Lands on the new topic's view. "Use in Battle Room" (primary) opens Rooms › Create with the topic preselected as source (സ്വന്തം + unrated). "Practice" starts untimed Solo Practice on it. The usage meter updates at once. Re-import (replaces the topic's questions) and Delete sit below. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Cold load on 3G | Any | App shell from the service worker; target < 5 s. [ASSUMPTION] Skeleton rows shaped like the surface; no spinner without text past 1 s. Skeletons never shimmer under reduced effects. |
| Font loading | Any | The Malayalam woff2 is precached by the service worker with the app shell and `<link rel=preload>`-ed on Home. Matchmaking and the 3-2-1 countdown wait for `document.fonts.ready` (capped at 3 s). In the live match the face uses `font-display: optional` (no mid-match swap). Elsewhere `swap`, over a metric-matched fallback `@font-face` (`size-adjust`, `ascent-override`, `descent-override` tuned to Noto Sans Malayalam UI). |
| Offline | Any | The shell loads; `/api` and `/ws` are never cached. [ASSUMPTION] Inline banner, play actions disabled, no offline play. Copy TBD. |
| Guest home | Home | Locked mode rows + one Sign-in nudge; rank and ratings hidden. |
| Sign-in return | Originating surface | Redirect flow (no popup, no One Tap). On return the originating surface is restored, focus moves to its heading and "Signed in as <name>" is announced. |
| Share link open | Quick Match | A share-card link lands straight in matchmaking, guest or registered. |
| Matchmaking | Matchmaking | "Finding an opponent…" with cancel. At ~8 s "Minnal Bot joined" and the Bot badge. Under reduced effects: static text + an elapsed-seconds count, no spinner. `MATCHMAKING_FAILED` → [ASSUMPTION] inline retry. |
| Already in match | Any start | `ALREADY_IN_MATCH` → [ASSUMPTION] offer to return to the active match. |
| Question open | Live match | Monochrome; timer line; first-tap hint in the footer. |
| Locked / waiting | Live match | 1v1: own result band at once; footer "Waiting for <opponent>…" until the question closes. Battle Room: locked option styled; footer "Locked in · result when time runs out"; no correctness hint. |
| Reveal (correct / wrong) | Live match | Peak band per Component Patterns; explanation + attribution + report link. |
| Leave confirm | Live match | Dialog over a 42% dim; Leave → Results (in 1v1 a loss; in a Battle Room the score earned so far). Stay → back to the live question. |
| Reconnecting | Live match | 10 s grace. Back in time → resume from `SNAPSHOT` at the current question and scores. |
| Forfeited | Live match → Results | After 10 s the banner shows the Forfeited copy, then Results with the score earned so far. |
| Opponent left (1v1) | Live match → Results | The match ends at once; a one-line notice, then Results with the win takeover. |
| Match aborted | Live match | All humans gone before the first reveal and none remains (vs the bot, or a room) → not counted. [ASSUMPTION] Return Home with a one-line notice. |
| Result: win | Results | Takeover → settled band (volt). |
| Result: loss | Results | Opens straight to the settled view; ink band, no volt, grey delta. |
| Result: draw | Results | "സമനില / Draw" band, no volt, no bolt. |
| Rematch waiting | Results (1v1) | Waiting state up to 60 s; bot accepts instantly and a new match starts. |
| Battle Room results | Results (room) | #1: win takeover → podium. Others: straight to podium + standings. |
| Install prompt | Results | Registered player's first completed match only. [ASSUMPTION] Dismissed once, not shown again. |
| Result: guest | Results | Registration prompt using the result as the hook (CAP-1). Copy TBD. |
| Results reload | Results | Rehydrated from the last `MATCH_ENDED` in `sessionStorage`. |
| Start countdown | Battle Room | 3-2-1 for all players after Start; under reduced effects the digits swap with no scale. |
| Lobby filling | Lobby | Chips pop in; the count swaps without counting up. |
| Lobby < 2 humans | Lobby (host) | Start disabled, with the caption "Waiting for 1 more player". |
| Host left | Lobby (players) | Room closes. [ASSUMPTION] Players return to Rooms with a notice. |
| Join link | Battle Room join | `/r/<code>` opens the lobby directly, no confirmation. |
| Join: bad / expired code, room full (50) | Battle Room join | Inline error under the code field saying what happened and what to do (see Voice and Tone). Bad-code copy TBD. |
| Leaderboard: has rows | Ranks | Board list; your row pinned or in place. |
| Leaderboard: empty | Ranks (new IST day, no rated matches yet) | Empty leaderboard card; no pinned row. |
| Empty (other) | Match history, Custom Topics, draft queue, report queue | One plain line in voice plus the next action. Custom Topics empty opens with the schema reference and sample GPT prompt expanded. Copy TBD. |
| Import: ready | Custom Topics import | Tally line shows count + usage after import; Import enabled. |
| Import: rejected | Custom Topics import | Nothing saved; error list + marked lines; Import disabled until fixed. |
| Import: success | Custom Topics topic view | Success card + updated usage meter. |
| Fair-use cap | Custom Topics | Warn at ≥ 80% of 50 topics / 500 questions; block an import that would exceed a cap, saying which cap and by how much. |
| CSV partial import | Admin CSV upload | Valid rows import as drafts; bad rows are listed with row number and reason; fix and re-upload those rows. |
| Delete account | Me › Settings | Confirm step, then sign out. Data-deletion obligations (DPDP) are open. |
| Admin draft | Draft queue | Every new question or version waits as a draft until Publish or Discard. |
| Admin row action | Draft / report queue | Publish and Discard show an inline 5 s Undo instead of committing silently. After a row leaves, focus moves to the next row (previous if it was last, else the empty-state heading), and a polite status announces it ("Published Q 1234 v3"). |

## Real-time Feedback

- Countdown = server deadline + `serverTime` clock offset. It never pauses on the client, including during reconnect ("the timer is still running on the server").
- Answer ack < 200 ms; the "…" status covers the gap.
- Opponent and room answered states show *that* someone answered, never *what*.
- In Battle Room, correctness and explanation arrive only with `QUESTION_REVEALED`. In 1v1 modes, the player's own correctness, points and the correct answer arrive with `ANSWER_ACCEPTED`; the opponent's pick, explanation and attribution arrive with `QUESTION_REVEALED`. A question closes as soon as everyone has answered.
- Scoreboards update within 500 ms of a reveal.
- At 5 s remaining, a single `navigator.vibrate(30)` where supported.

## Interaction Primitives

- **Tap** to act. An option commits on lift; the first committed tap is the final answer.
- **Tap anywhere** (or Continue) to skip the win takeover.
- **Share** through the OS share sheet (image + text + Quick Match link; `/r/<code>` join link in the lobby). [ASSUMPTION] Fallback when file share is unsupported: save image + copy link.
- **Copy** a room code, schema or GPT prompt with a single tap; each copy shows an inline "Copied" confirmation.
- **Join** by opening a link or entering a code; no confirmation steps.
- **Back / leave during a live match:** Leave confirm dialog; leaving forfeits the remaining questions.
- **Admin keyboard:** `P` publish, `D` discard, `E` edit, `J` / `K` next / previous, listed in a `?` help dialog. Active only while focus is on a draft-queue row or the editor toolbar, **never** inside a text input, textarea, select or contenteditable (checked via `event.target`). A Settings toggle turns single-key shortcuts off. Every shortcut has a visible button equivalent; `P` and `D` offer Undo. Admin tables use `<table>` with `<th scope>`; tab order is filters → table → pagination.
- **Banned:** count-up numbers, particles, confetti, strobe, full-white frames, sign-in modals and One Tap, join confirmations, volt on white, colour while answering, gesture-only actions.

## Accessibility Floor

Behavioural. Contrast, focus-ring, hit-area, type and reflow specs live in `DESIGN.md` (Colors, Typography, Layout & Spacing). Target: WCAG 2.2 AA.

**Flashing and motion**

- **Flash budget (2.3.1):** app-wide, at most **one** flash-producing transition (a ≥ 10% relative-luminance change and its reversal over more than 25% of the viewport) in any `{motion.flash-window}`. Peaks are queued, never overlapped: a win takeover starts ≥ `{motion.flash-window}` after the last reveal's strike ends. The strike is volt on band only (`{motion.strike-volt-hold}`); no full-white frame, and no white at all in dark mode. The overtake uses a drawn crack, not a flash.
- **Reduce effects:** the reduced path runs when `prefers-reduced-motion` is set **or** Settings › Reduce effects is on (on / off / follow phone). Every peak becomes a plain fade (`{motion.reduced-fade}`), with no band drop, strike, flood or crack; rows swap with a fade; chips fade in `{motion.reduced-chip-fade}`; the timer line steps once per second; the win takeover advances on Continue only; matchmaking, skeletons and breakdown rows don't animate.
- **Automatic fallback:** if the first band drop of a session misses more than 3 frames (`requestAnimationFrame` deltas > 50 ms), or `navigator.deviceMemory ≤ 1`, the reduced path runs for the rest of the session.

**Timing**

- **Real-time exception (2.2.1):** the 15 s answer window, the 10 s reconnect grace and the 3-2-1 start are essential to a live real-time contest and aren't adjustable. The untimed alternative is Solo Practice, which covers every bank topic and stays **registered-only**; guests have no untimed path at MVP. No other surface has a timeout that loses user data or input.
- Rematch (60 s) and room-code expiry are timeouts on another person's action: no data loss, the rematch timeout is announced and re-sendable, and expiry shows an absolute time.

**Input**

- **Pointer (2.5.2):** answers commit on the up-event; slide-off cancels; movement > 10 px is a scroll (see Answer option).
- **Hit areas:** every control meets the 48 × 48 rule in `DESIGN.md` › Layout & Spacing, explicitly the EN tag, report link, copy links, rematch Cancel, Leave and tab-bar items.
- **Forms:** every field has a visible `<label>`; district and exam level are native `<select>`s. Errors carry ⚠ + text; brick is never the only cue.
- **Profile setup language:** choosing a language switches the UI at once, announces the change politely in the new language and keeps focus on the field.

**Focus and announcements**

- `:focus-visible` always shows the focus ring; fixed bars never hide the focused item.
- **Question start:** focus moves to the question heading (`tabindex="-1"`). Its accessible name is the question text first, then "ചോദ്യം 4 / 10, 15 സെക്കൻഡ്". Remaining time is announced once at 5 s, never per tick.
- **Lock:** "Locked in", polite.
- **Reveal:** focus stays put; the polite region announces "<Correct|Wrong>. Answer: <option>. +800, total 3,140". In 1v1 the result is announced at the accepted answer ("Correct. +800, total 3,140" / "Wrong. Answer: <option>"); the close adds nothing spoken unless the player did not answer.
- **Match end:** focus moves to the results heading, which carries the result ("You won, 3,140 to 2,980, rating +24").
- **One polite announcement each** for: forfeited, aborted, bot joined, opponent left, your rank change (once per reveal: "Up to 2nd, passed Arjun K"), 1v1 opponent "answered" (once per question), lobby joins (debounced to one per 5 s: "3 joined, 23 in room"), copy, share fallback, rematch timeout/cancel, offline banner, admin row actions.
- **Reconnect:** assertive at start, polite at end, never per second.
- **Regions:** one shared polite region (`role="status"`) and one assertive region (reconnect start only) per screen. Never live regions: answered meter, scoreboard list, joined-chip list, seconds label.
- **Route titles:** every surface sets `document.title` in the UI language ("ചോദ്യം 4 / 10 · മിന്നൽ"), updated per question.

**Content**

- **Dim never carries text**; opacity never fades text (dropped scoreboard rows keep full colour).
- **Glyphs** (▲ ▼ ✓ ● ○, dot strip) are `aria-hidden` with text equivalents ("up 1 place", "correct", "not answered yet").
- **Seconds** read in full: `aria-label="9 സെക്കൻഡ്"` / "9 seconds", never "സെ".
- **Malayalam** text wraps and is never truncated mid-question; the font covers the full script range (`DESIGN.md` › Typography).
- **Zoom and reflow:** the viewport meta never sets `maximum-scale` or `user-scalable=no`; layouts follow `DESIGN.md` › Layout & Spacing at 200% text and 320 CSS px.

**QA fixtures**

- Record peaks at 60 fps on a throttled device and count flash transitions per 1,000 ms.
- Chrome Android › Accessibility › Text scaling 200%, plus OS font size Largest.
- Malayalam shaping fixture with old-orthography conjuncts (ക്ഷ, ന്റ, ത്ത്ര) and chillu in tags, options and custom topics.
- TalkBack with the Google TTS Malayalam voice installed **and** not installed.

## Key Flows

### J1 — Anju, LDC aspirant, first match to a habit (guest → registered)

Mocks: [key-home](mockups/key-home.html), [key-live-match](mockups/key-live-match.html), [key-results](mockups/key-results.html), [key-leaderboards](mockups/key-leaderboards.html).

1. Anju opens a link on her Android phone. Home loads as a guest in her device language. Only Quick Match is open; the other modes show as locked, with one Sign-in nudge.
2. She taps Quick Match: "Finding an opponent…". At ~8 s "Minnal Bot joined" with a Bot badge.
3. Ten questions: tap → her result band at once (a strike when right) → as soon as both have answered, the opponent's pick and the explanation show and the next question follows. One wrong answer names the correct one.
4. Guest results show her score and a registration prompt built on it. She continues with Google and returns to the same surface.
5. Profile setup on one screen; she picks Malayalam, and the UI switches with it.
6. She picks Kerala History in the Topic picker for a Topic Duel against Vishnu R. Behind 7,020 to 7,420 before Q10, she answers fast.
7. **Climax:** the screen floods ink, the volt bolt strikes once, "ജയിച്ചു! +24 / പൊളി!". It settles into the breakdown; she taps Share and sends the share card ("Anju beat Vishnu… Beat me on Minnal", in her UI language) to her batch WhatsApp group. Friends who tap its link land in Quick Match. Vishnu taps Rematch.
8. This was her first completed match as a registered player, so Results shows the install prompt; she adds Minnal to her home screen.
9. She taps the rank snippet: Ranks opens on Quick Match · Today, with her row (#212, +24) pinned above the tab bar.
10. Next day she opens it from the home-screen icon and starts an untimed Solo Practice round on her weak topic.

Failure: her signal drops on Q6 → reconnect banner counting down; she's back at 7 s and resumes on the current question. Past 10 s she would forfeit the rest and still get her earned result.

### J2 — Rajeev sir, Kollam coaching center, hosts and plays

Mocks: [key-custom-topics](mockups/key-custom-topics.html), [key-battle-lobby](mockups/key-battle-lobby.html), [key-results](mockups/key-results.html).

1. Rajeev copies the sample GPT prompt from Me › Custom Topics › Import, generates questions with an LLM and pastes the JSON. The tally line shows 15 questions found and 425 / 500 after import.
2. Import is rejected: "ചോദ്യം 7: 4 ഓപ്ഷനുകൾ വേണം, 3 എണ്ണമേ ഉള്ളൂ" and a bad answer index on Q12. He taps each error to jump to its line, fixes both, and Import re-enables; the topic saves.
3. From the success card he taps Use in Battle Room: Create opens with his topic as source ("സ്വന്തം" + unrated); count 15.
4. He taps Share-to-WhatsApp and posts the code + join link (`/r/K7M-Q2X`) to the batch group.
5. Students tap the link; it opens the room directly with no confirmation step. Chips pop into the lobby; the count climbs to 23.
6. He taps Start; everyone gets 3-2-1. He plays along and counts toward the 2-human minimum.
7. **Climax:** after Q5 his row jumps up a slot, turns ink with volt, and a crack is drawn past Arjun K: "▲ Arjun K · മറികടന്നു". The class watches the scoreboard move after every reveal.
8. The #1 student gets the win takeover; everyone lands on the podium and standings. The batch banters in WhatsApp. He taps Play again: a new room with the same source preselected.

Failure: if Rajeev leaves the lobby, the room closes for everyone. Start stays disabled, with "Waiting for 1 more player", until a second human joins.

### J3 — Snobin, admin, on a laptop

1. Snobin opens `/admin` on desktop and uploads a CSV of previous-year questions.
2. Valid rows import as drafts; bad rows are listed with row number and reason. He fixes those rows and re-uploads them.
3. Every imported question lands in the Draft queue. He reviews and tags each one, publishing with `P` or discarding with `D`, with Undo available for 5 s.
4. Report queue: a player reported "തെറ്റുണ്ടോ?" on a question with a note that the answer is wrong.
5. He opens it in the Question editor and fixes the answer. This creates a new version, which goes back to draft.
6. **Climax:** he publishes the new version. Players get the corrected question from then on, and the report is cleared from the queue. [ASSUMPTION] Report resolution behaviour (resolve / dismiss) isn't specified.

## Responsive & Platform

| Surface | Behaviour |
|---|---|
| Player, 360px+ | Single column, baseline; reflows down to 320 CSS px. [ASSUMPTION] Above ~480px the column centres at a max width; no tablet layout. |
| Player, PWA | Meets Android Chrome installability; launches standalone from the home screen; the service worker caches the app shell and the Malayalam font only. Manifest `orientation: "any"` (no portrait lock). |
| Admin, ≥ 1024px | Desktop-first tables and forms. [ASSUMPTION] Usable but not optimised below 1024px. |

## Open Questions

- Domain is TBD; `minnal.app` in mocks and share links is a placeholder. Non-blocking.
- Delete account: DPDP data-deletion obligations (what is deleted, when, what is retained) are open from the SPEC.
- Malayalam share card strings, with the name rule applied ("Anju beat Vishnu").
- Leaderboard empty copy (English draft from the mock, Malayalam version) needs voice sign-off.
- Sample GPT prompt text isn't written yet; it needs content sign-off (language, PSC style, exactly 4 options, answer index 0–3).
- Optional, product call from the accessibility review: a Battle Room host setting "Relaxed timer (30 s, unrated)" for classroom inclusion.

## Spec Feedback

New needs for `bmad-spec` (not in SPEC):

- **Result share card:** post-match 1:1 image (score, result, mode, link) shared via the OS sheet; the link opens Quick Match.
- **Battle Room join link:** code carried in the link (`/r/<code>`), opening the room directly.

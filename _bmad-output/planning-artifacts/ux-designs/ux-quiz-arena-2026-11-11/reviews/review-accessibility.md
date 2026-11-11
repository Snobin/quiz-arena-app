---
title: Minnal UX spines: accessibility review
lens: accessibility (WCAG 2.2 AA + low-end mobile realities)
reviewed: DESIGN.md, EXPERIENCE.md (2026-11-11 drafts); mocks key-home, key-live-match, key-results, key-battle-lobby; .memlog.md
date: 2026-11-11
verdict: Revise before stories. Solid base, but several gaps would fail AA or harm real players.
counts: { critical: 1, high: 8, medium: 17, low: 13 }
---

# Accessibility review: Minnal UX spines

## Verdict

**Revise before stories.** The spines already get several things right: they compute contrast instead of eyeballing it, ban volt on white, keep correctness from relying on colour alone (✓ glyph, status text, filled vs ring dots, ▲/▼ glyphs), set 48px targets with 56px options, cap flashes per peak, give every peak a reduced-motion path, and limit timer announcements. What is missing is mostly the **implementation contract** that developers will build from: no focus indicator, no rule for how flashes from different peaks sequence, no rule for which pointer event commits an answer, no layout rules for large text, and the font-subset rule as written will break Malayalam shaping in user content. Several sanctioned uses of `dim` and opacity also fail 4.5:1.

All ratios below are WCAG 2.x relative-luminance ratios computed from the DESIGN.md token hex values.

## Contrast audit (computed)

### Passing pairs (spine claims verified)

| Pair | Light | Dark |
|---|---|---|
| ink on paper / card | 17.19 / 18.75 | ink-dark on paper-dark / card-dark 15.03 / 13.58 |
| muted on paper / card / tile | 4.84 / 5.27 / 4.84 | 7.04 / 6.36 / 5.62 |
| ink-soft on paper / card | 12.04 / 13.13 | (= ink-dark) |
| brick on card / paper | 5.28 / 4.84 | brick-dark 5.28 card-dark, 5.84 paper-dark, 4.67 tile-dark |
| on-band on band | 18.75 | on-band on band-dark 12.85 |
| on-band-muted on band | 7.13 | on band-dark 4.88 (just passes) |
| on-band-soft on band | 11.75 | on band-dark 8.05 |
| volt on band / band-raised | 16.19 / 11.34 | volt on band-dark 11.10, band-raised-dark 8.83 |
| on-band-muted on band-raised (takeover delta panel) | 4.99 | n/a (takeover keeps band) |
| on-volt on volt (delta chip) | 16.19 | 16.19 |
| volt edge vs paper-dark / card-dark (non-text) | n/a | 15.77 / 14.25 |
| timer fill vs track (non-text) | ink on hairline 14.60 | ink-dark on hairline-dark 10.58 |
| tab inactive (muted, fixed from dim) | 5.27 on card | 6.36 |

### Failing or at-risk pairs

| Pair | Ratio | Where | Need |
|---|---|---|---|
| dim on card / paper | **2.63 / 2.41** | Opponent status "ആലോചിക്കുന്നു…" in score strip (mock `.scores .vs`), locked-mode titles, muted options after reveal | 4.5 |
| muted at 85% opacity on card / paper | **3.86 / 3.59** | Dropped scoreboard row (`opacity:.85`) sublines and names | 4.5 |
| unanswered ring `#C3C7CF` on card / paper | **1.69 / 1.55** | Answered dot ○ (state indicator, non-text) | 3.0 |
| hairline on paper / card (control edge) | 1.18 / 1.28 | Answer option, score strip, joined chip borders | 3.0 if the edge is the only cue (see L1) |
| card on paper | 1.09 | Option surface vs page | same as above |
| band-dark on paper-dark (calm, no edge) | 1.42 | Quick Match card, draw band in dark | 3.0 for a control boundary (see L2) |
| on-band-muted on band-raised-dark | **3.89** | Not used today; becomes a failure if any text lands on the dark watermark or panel | 4.5 |
| dim-dark on card-dark | 3.46 | Decorative only: OK; never text | n/a |

---

## Findings

Format: **ID · severity · title**: location, then the problem and a concrete fix.

### Critical

**C1 · critical · No flash budget across peaks; the white frame can stack with other luminance flips (2.3.1)**
*Location:* EXPERIENCE › Accessibility Floor (flash rule); DESIGN › motion; key-live-match (a→reveal caption "one white frame flash"); key-results (takeover).
The rule is written per peak ("at most one flash per peak"). But peaks run back to back: the **last-question reveal** (band drop paper→ink, volt hold, white frame, settle) is followed straight away by the **win takeover** (full-screen paper→ink flood, volt, white frame, settle). In Battle Room the same reveal can also carry the overtake jump. Within one 1-second window that is 5 or 6 opposing luminance transitions over most of the screen. A 360px phone held at 30 cm fills roughly the whole 10° central field, so the area exemption doesn't apply. On a janky 2 GB phone the "one frame" white flash can last 3 to 6 frames (50–100 ms) and bunch with the next transition. Dark mode turns the white frame into the largest possible luminance jump. 2.3.1 is a non-interference criterion, so failing it fails conformance for the whole app, and the risk is physical harm.
*Fix (rule text, EXPERIENCE › Accessibility Floor):*
> **Flash budget:** app-wide, at most **one** flash-producing transition (a ≥10% relative-luminance change and its reversal over more than 25% of the viewport) in any 1,000 ms window. Peaks are queued, not overlapped: if a win takeover follows the last reveal, the last reveal plays without a strike (band fade only) **or** the takeover starts ≥ 1,000 ms after the reveal strike ends. **Remove the full-white frame**: the strike is volt-on-band only (`{motion.strike-volt-hold}` 80 ms), and any white is confined to the bolt polygon (≤ 10% of the viewport). In dark mode there is no white frame at all.
Also add `motion.flash-window: 1000ms` to DESIGN tokens and a QA test that records peaks at 60 fps on a throttled device and counts transitions.

### High

**H1 · high · "First tap is final" has no pointer-cancellation or scroll guard (2.5.2)**
*Location:* EXPERIENCE › Component Patterns › Answer option; Interaction Primitives.
An irreversible answer that commits on `pointerdown`/`touchstart` fails 2.5.2. With text scaling, options sit below the fold, so a scroll gesture that starts on an option would also lock it. Tremor and motor-impaired players lose questions they never meant to answer.
*Fix (rule text):* "An option commits on `click` (the up-event) only. Sliding the finger off the option before lifting cancels. A touch that moves more than 10 px is a scroll, not a tap. Options use `touch-action: manipulation`. The pressed visual (ink border) shows on down and only becomes 'locked' after the up-event and server ack."

**H2 · high · `font-display: swap` reflows the options mid-question under a final tap**
*Location:* EXPERIENCE › State Patterns › Font loading; DESIGN › Typography.
On 3G the subset woff2 can arrive several seconds after Q1 renders. Swapping from the system Malayalam fallback (different metrics) moves every option while the player is aiming. That causes a wrong irreversible answer (3.2.x predictability, plus a real fairness bug).
*Fix:* "The Malayalam woff2 is precached by the service worker with the app shell, and `<link rel=preload>`-ed on Home. Matchmaking and the 3-2-1 countdown wait for `document.fonts.ready` (capped at 3 s). Inside the live match the face uses `font-display: optional` (no mid-match swap). Elsewhere `swap` is fine with a metric-matched fallback `@font-face` (`size-adjust`, `ascent-override`, `descent-override` tuned to Noto Sans Malayalam UI)."

**H3 · high · Focus and announcement are lost when each question replaces the last; result and takeover aren't announced**
*Location:* EXPERIENCE › Accessibility Floor › Screen reader; State Patterns (question open, reveal, results).
When Q(n+1) replaces Q(n), the focused option is removed from the DOM and TalkBack focus falls to `<body>`, or to the top of the page. The announcement list covers question start, lock, reveal, rank and reconnect, but not match result, takeover, forfeited, aborted or the bot joining.
*Fix (rule text):* "At question start, focus moves programmatically to the question heading (`tabindex="-1"`). The heading's accessible name is the **question text first**, then 'ചോദ്യം 4 / 10, 15 സെക്കൻഡ്', so text-to-speech time goes on content. At reveal, focus stays put; one polite region (`role="status"`) announces '<Correct|Wrong>. Answer: <option>. +800, total 3,140'. At match end, focus moves to the results heading, which carries 'You won, 3,140 to 2,980, rating +24'. Forfeited, aborted, bot joined and opponent left each have one polite announcement. One shared polite region and one assertive region (reconnect start only) per screen; no other `aria-live`."

**H4 · high · Several live and frequent controls are far below 24×24 (2.5.8) and the project's 48px target**
*Location:* DESIGN › Components: Language toggle (EN tag: 11px, 1px×7px padding ≈ 18px tall), report link "തെറ്റുണ്ടോ?" (11.5px caption text), copy-code text link, rematch Cancel text link, Leave brick text button, breakdown collapse/expand, tab bar items.
The EN tag is used **during** the 15 s window, the worst place for a missed tap.
*Fix:* add to DESIGN › Layout: "Every interactive element has a hit area ≥ `{spacing.target-min}` (48 × 48), made with padding or a `::before` hit box even when the visual stays small. Adjacent hit areas don't overlap; ≥ 8px between the EN tag and the question's first line." List the EN tag, report link, copy-code, Cancel, Leave and tab items explicitly.

**H5 · high · `dim` is sanctioned for text the player needs (1.4.3)**
*Location:* DESIGN › Colors › Dim ("locked-mode titles, muted options after reveal"); DESIGN › Components › Answer option *Muted*, Mode entry row *Locked*; mock `.scores .vs` (opponent status in dim).
dim is 2.63 on card and 2.41 on paper. A locked mode row is still an active control (it opens Sign-in), so the inactive-component exemption doesn't apply. Opponent status is live information. Post-reveal option text is what the player compares against the correct answer.
*Fix:* in DESIGN › Colors › Dim, replace the use list with "chevrons, decorative icons, disabled-only borders. **Never text.**" Score-strip status → `{colors.muted}` (5.27). Locked-mode title → `{colors.muted}` with the lock icon + "Sign in" label as the state cue. Post-reveal non-chosen options → `{colors.muted}` text; the correct option's band fill already carries the emphasis.

**H6 · high · No focus indicator is defined anywhere; fixed bars can hide focus (2.4.7, 2.4.11)**
*Location:* DESIGN (no focus token); EXPERIENCE › Foundation ("no component library"); admin console; fixed tab bar, action bar, host start bar.
Tailwind's preflight resets outlines. Without a token, admin keyboard users and Android players with switch access or a Bluetooth keyboard see nothing.
*Fix (tokens):*
```yaml
focus-ring: '2px solid {colors.ink}'           # 17.2:1 on paper, 18.8:1 on card
focus-ring-dark: '2px solid {colors.ink-dark}' # 15.0:1 on paper-dark
focus-ring-on-band: '2px solid {colors.on-band}' # 18.8:1 band, 12.9:1 band-dark
focus-offset: 2px
```
Rule: "`:focus-visible` always shows the ring (never `outline: none` without a replacement). `scroll-padding-bottom` equals the fixed bar height, so a focused item is never under the tab bar, action bar or host start bar." Volt is not used for focus, which keeps the peak rule intact.

**H7 · high · Layouts break at 200% text and at 320 CSS px; zoom isn't protected (1.4.4, 1.4.10, 1.4.12)**
*Location:* DESIGN › Layout (360px baseline), components with fixed `height` (scoreboard-row 47px, scoreboard-row-you 56px), room code 40px mono with 0.06em tracking (≈ 7 chars × 2 at 200% overflows 320px), action bar 2fr/1fr/1fr, live match "full screen" with an absolutely positioned footer (mock `.foot{position:absolute}`), win takeover full screen.
At 200% the question (46px) plus four options can't fit one screen. The absolute footer overlaps options, and fixed-height rows clip Malayalam vowel signs.
*Fix (rule text, DESIGN › Layout):* "All type tokens are authored in `rem` (px values ÷ 16). No fixed `height` on text containers (use `min-height`). Reflow target: 320 CSS px at 100%, and 360 px at 200% text, with no horizontal scroll. Live match: only the timer line + seconds label + Q n/10 stay sticky (≤ 48px); the score strip, question, options and footer hint scroll in normal flow. The action bar wraps to stacked full-width buttons when labels don't fit. Room code steps down to 32px and drops tracking under 360px. Win takeover scrolls when content exceeds the viewport. The viewport meta **must not** set `maximum-scale` or `user-scalable=no`." Test with Chrome Android › Accessibility › Text scaling 200% and OS font size Largest.

**H8 · high · A glyph-observed Malayalam subset will break shaping in custom topics, names and fallback text**
*Location:* DESIGN › Typography ("self-hosted subset woff2 (AD-18)"); EXPERIENCE › Bilingual (custom topics "in whatever language they were written").
If the subset is cut from strings seen in the question bank, any missing glyph or conjunct in an LLM-generated custom topic, display name or report note falls back mid-word to Nirmala UI or the system font. Shaping (GSUB conjuncts, reph, vowel-sign positioning) can't cross fonts, so the player sees dotted circles (◌) and detached signs. That's a readability failure in the question itself.
*Fix:* "Subset by **script range**, not by observed text: `unicode-range: U+0D00-0D7F, U+200C-200D, U+25CC, U+0964-0965`, keeping all GSUB/GPOS features (`--layout-features='*'`) and both atomic chillu (ൺ ൻ ർ ൽ ൾ ൿ) and ZWJ-sequence forms. Ship one variable woff2 (or at most 400 + 600 static), and never synthesize bold on Malayalam (`font-synthesis: none`). Budget about 45–70 KB for the font, outside the 150 KB JS budget." Add a QA fixture with old-orthography conjuncts (ക്ഷ, ന്റ, ത്ത്ര) and chillu in tags and options.

### Medium

**M1 · medium · The 2.2.1 real-time exception isn't stated, and guests have no untimed path**
*Location:* EXPERIENCE › Accessibility Floor; IA (Solo Practice locked for guests on Home).
The 15 s window is a legitimate real-time competitive exception, but the spine never says so, and the untimed equivalent (Solo Practice) is locked for guests.
*Fix (rule text):* "**Timing (2.2.1):** the 15 s answer window, the 10 s reconnect grace and the 3-2-1 start are essential to a live real-time contest and aren't adjustable. Every bank topic is also available untimed in Solo Practice, **including for guests** (unrated, no account). No other surface has a timeout that loses user data or input." Optional (product call): a Battle Room host setting "Relaxed timer (30 s, unrated)" for classroom inclusion.

**M2 · medium · Admin keyboard shortcuts (P/D/E) are unspecified; single-key Publish is risky (2.1.4)**
*Location:* EXPERIENCE › Admin console / J3. No shortcut appears in either spine.
*Fix (rule text):* "Admin shortcuts are active only while focus is on a draft-queue row or the editor toolbar, **never** inside a text input, textarea, select or contenteditable (check `event.target`). Use `P` publish, `D` discard, `E` edit, `J/K` next/previous, listed in a `?` help dialog, with a Settings toggle to turn single-key shortcuts off. `P` and `D` show an inline 5 s Undo rather than committing silently. Every shortcut has a visible button equivalent."

**M3 · medium · Admin focus order after row actions is undefined (2.4.3)**
*Location:* EXPERIENCE › Admin draft queue, report queue.
After Publish/Discard removes a row, focus falls to `<body>`.
*Fix:* "After a row leaves the queue, focus moves to the next row (or the previous one if it was last, or the empty-state heading). Tables use `<table>` with `<th scope>`, and a polite status announces 'Published Q 1234 v3'. Tab order is filters → table → pagination; the editor is a separate page, not a modal."

**M4 · medium · Import errors aren't tied to the input and have no syntax-error case (3.3.1, 3.3.3, 4.1.3)**
*Location:* EXPERIENCE › Import error list, JSON import error, CSV partial import.
*Fix:* "On a failed import, render an error summary (`role="alert"`, heading 'N problems in topic.json') above the file input, linked to it by `aria-describedby`, and move focus to the summary. Each item: item or row number · field · what is wrong · what to do ('Question 7 · options · needs 4, has 3 · add one option'). JSON syntax errors give line and column plus a likely cause ('line 42, col 3: missing comma after `}`'). Over 20 errors: show the first 20 grouped by field, with the full list downloadable as CSV. Errors carry a ⚠ prefix + text; brick colour is never the only cue."

**M5 · medium · Join-code input: format tolerance and error suggestion unspecified (3.3.3, 1.3.5)**
*Location:* EXPERIENCE › Battle Room join; State "bad/expired code, room full".
*Fix:* "Code field: visible label, `inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false"`; accepts lower case, with or without the hyphen, and strips spaces. The code alphabet excludes 0/O/1/I/L. Errors sit inline under the field via `aria-describedby` + `aria-invalid`: 'K7M-Q2X has expired. Ask the host to share a new code.' / 'Room is full (50). Ask the host for a new room.'"

**M6 · medium · `lang` per string doesn't cover mixed runs or content language**
*Location:* EXPERIENCE › Accessibility Floor (last bullet); Bilingual Behavior; Voice (`▲ Arjun K · മറികടന്നു`).
*Fix:* "`<html lang>` follows the UI language. Question, option and explanation containers take `lang` from the **content's** language field (bank) or script detection (custom topics), not from the UI. Latin-script runs (display names, 'BOT', 'EN') inside Malayalam strings are wrapped in `<span lang="en">`, and Malayalam runs in English UI in `lang="ml"`. The EN toggle has the name 'Show in English' / 'മലയാളത്തിൽ കാണിക്കുക' and `aria-pressed`." QA: TalkBack with Google TTS Malayalam voice installed **and** not installed (cheap phones often lack it).

**M7 · medium · Battle Room live updates will flood screen readers**
*Location:* EXPERIENCE › Answered meter ("updates on every answer"), Scoreboard row, Joined chip (23+ joins), Score strip status.
*Fix (rule text):* "Never live regions: the answered meter, scoreboard list, joined-chip list and seconds label. Announce instead: lobby joins debounced to one message per 5 s ('3 joined, 23 in room'); the answered count only on request (the meter is a focusable `role="meter"` with `aria-valuetext`); own rank change once per reveal ('Up to 2nd, passed Arjun K'); 1v1 opponent 'answered' once per question, polite."

**M8 · medium · Win takeover's "tap anywhere" has no focusable control; auto-advance is unannounced**
*Location:* EXPERIENCE › Win takeover; Accessibility Floor (reduced motion "advances on tap only").
*Fix:* "The takeover is a `role="dialog"` with `aria-labelledby` on the title, and holds a real `<button>` 'Continue' (≥ 48px, focused on open) styled as the caption. Auto-advance at `{motion.win-hold}` is skipped when a screen reader or reduced motion is detected; there it advances only via Continue."

**M9 · medium · Reduced-motion coverage has gaps; no in-app control**
*Location:* EXPERIENCE › Accessibility Floor; State Patterns (matchmaking, skeleton rows, breakdown collapse); Settings ("Language, the one setting").
Matchmaking indicator, skeleton shimmer, breakdown auto-collapse and the Home → match transition have no reduced path. Many cheap Android users never set "Remove animations".
*Fix:* "Under reduced motion: matchmaking shows static text + an elapsed-seconds count (no spinner); skeletons don't shimmer; breakdown rows don't animate height. Add Settings › 'Reduce effects' (on / off / follow phone), which forces the reduced path including peaks and stops the white/volt strike." This edits the "one setting" rule.

**M10 · medium · Breakdown rows auto-collapse on scroll and truncate Malayalam**
*Location:* EXPERIENCE › Breakdown row; mock `.qr.cmp .qq{white-space:nowrap;text-overflow:ellipsis}`; conflicts with "Never truncate a Malayalam question".
A collapse above the viewport shifts content while reading; TalkBack focus jumps.
*Fix:* "Correct rows render collapsed **on load** (no scroll trigger) as a `<button aria-expanded="false">` showing 'Q3 ✓ 9 s +800'. Expanding shows the full question; the collapsed line shows no truncated question text (or two-line clamp with the full text in the accessible name)."

**M11 · medium · The dismissing tap can land on Rematch after the takeover collapses**
*Location:* EXPERIENCE › Win takeover → results action bar.
*Fix:* "Taps are ignored on the results surface for 400 ms after the takeover collapses, and the dismissing pointer event is consumed (`preventDefault` on its `click`)."

**M12 · medium · Disabled state has no visual or semantic spec**
*Location:* EXPERIENCE › Lobby < 2 humans (Start disabled), Offline (play actions disabled).
*Fix (tokens + rule):* `button-disabled: { background: '{colors.card}', border: '1px {colors.dim}', foreground: '{colors.muted}' }` (muted 5.27:1, so the label stays readable). Rule: "Disabled buttons use `aria-disabled="true"` (stay focusable), and an adjacent caption says why and what unlocks it ('Waiting for 1 more player')."

**M13 · medium · Dropped-row 85% opacity drops muted text to 3.86:1**
*Location:* DESIGN › Scoreboard row *Dropped*; mock `.row.dn{opacity:.85}`.
*Fix:* remove the opacity. The "▼ 1" glyph + text is the cue; keep text at full `{colors.muted}` / `{colors.ink}`.

**M14 · medium · Unanswered dot ring is 1.69:1 (1.4.11)**
*Location:* DESIGN colors `unanswered: '#C3C7CF'`; Scoreboard row answered dot.
*Fix:* `unanswered: '#80868F'` (3.67:1 on card, 3.36:1 on paper), 1.5px ring. Dark `unanswered-dark: '#6E737C'` already passes (3.46:1 on card-dark). Each row's accessible name includes 'answered' / 'not answered yet'.

**M15 · medium · Malayalam set at 10.5–11.5px in tags, tab labels and captions**
*Location:* DESIGN typography `tab-label` 11px, `caption` 11.5px; mocks tags 10.5px ("സ്വന്തം", "ഇപ്പോൾ").
Not an AA failure, but Malayalam vowel signs and conjuncts become illegible on 5" low-DPI screens at these sizes, especially at 1.3 line-height.
*Fix:* "Malayalam text minimum 12px (`0.75rem`), line-height ≥ 1.5 including tags and tab labels (set `tab-label` to line-height 1.5 for ML). Tags use vertical padding ≥ 2px and no fixed height."

**M16 · medium · Google sign-in flow: popup, focus return and One Tap not specified**
*Location:* EXPERIENCE › Sign-in prompt; Sign-in nudge; J1 step 4.
*Fix:* "Use the redirect flow (popups get killed on 2 GB phones and lose state). On return, restore the originating surface and move focus to its heading, with a polite 'Signed in as <name>'. Don't use the One Tap overlay (it acts as a modal). The Google button keeps Google's own accessible name, plus a visible Malayalam label beside it in ML UI. Profile setup: every field has a visible `<label>`; district and exam level are native `<select>`s."

**M17 · medium · No automatic low-end fallback for jank**
*Location:* DESIGN › Brand & Style ("transforms and opacity only"); motion tokens.
Jank stretches flashes (see C1) and makes the timer line stutter, which misleads players about remaining time.
*Fix:* "If the first band drop of a session misses more than 3 frames (measured via `requestAnimationFrame` deltas > 50 ms), or `navigator.deviceMemory ≤ 1`, switch to the reduced-motion path for the rest of the session. Animate the timer with `transform: scaleX()` on a composited layer, never `width` (the mock uses `width`)."

### Low

**L1 · low · Option and card edges are 1.18–1.28:1.** Text and tile identify the options, so this passes 1.4.11, but low-vision users lose the tap area. *Fix:* option border `#8D939C` light (3.09:1 on card) / `#6E737C` dark (3.83:1 on paper-dark) as `control-edge`, or accept and record the decision.
**L2 · low · Dark calm band (Quick Match card) is 1.42:1 against paper-dark.** Its inner white button carries the control, so this is acceptable. *Fix:* optional 1px `#6E737C` (dim-dark) edge, 3.83:1 on paper-dark, or record as accepted.
**L3 · low · Guard band-raised-dark.** on-band-muted on it is 3.89:1. *Fix:* add to DESIGN › Colors "text on band-raised-dark uses on-band-soft (≥ 6:1) or on-band only".
**L4 · low · "സെ" seconds abbreviation is read as a syllable.** *Fix:* `aria-label="9 സെക്കൻഡ്"` / `<abbr>`-style full expansion; English '9 s' → '9 seconds'.
**L5 · low · Glyph meanings need text alternatives.** ▲/▼, ✓, ● / ○ and the 7px dot strip. *Fix:* glyphs `aria-hidden`, with text equivalents ('up 1 place', 'correct'); the dot strip is a list with 'Q1 correct … Q10 wrong'. Breakdown shows visible labels 'നിങ്ങൾ:' / 'ശരി:', not brick vs bold alone.
**L6 · low · Status messages not specified for copy code, share fallback, rematch timeout/cancel, offline banner (4.1.3).** *Fix:* each produces one polite announcement plus a visible inline confirmation ('Code copied').
**L7 · low · Orientation.** *Fix:* manifest `orientation: "any"` (or omit). Don't lock portrait unless the live match is proven unusable in landscape; if locked, document the essential reason.
**L8 · low · 2px timer line is the only continuous cue.** *Fix:* keep the seconds label ink-bold (as mocked) and add a single `navigator.vibrate(30)` at 5 s where supported (helps blind and deaf players without audio).
**L9 · low · Profile setup switches UI language on select (3.2.2).** *Fix:* apply the language on Save, or keep the switch with a polite announcement in the new language and focus kept on the field.
**L10 · low · Room code read-aloud.** *Fix:* accessible name with spaced characters ('K 7 M, Q 2 X'); exclude ambiguous characters (see M5).
**L11 · low · Rematch 60 s and room-code expiry are timeouts on another person's action.** They are acceptable (no data loss) but should be stated. *Fix:* on timeout, the note is announced and Rematch can be re-sent; the expiry caption gives absolute time ('expires 7:30 pm').
**L12 · low · Route titles.** *Fix:* each surface sets `document.title` in the UI language ('ചോദ്യം 4 / 10 · മിന്നൽ'), updated per question, for 2.4.2 and the task switcher.
**L13 · low · Leave confirm dialog semantics.** *Fix:* `role="alertdialog"`, focus on Stay, background `inert`, Android back / Esc = Stay, focus returns to the question heading on Stay. Reconnect banner: everything dimmed is `inert` + `aria-hidden`.

---

## Checks that passed

- Correct/wrong never relies on colour alone: band + ✓ + status text, and the wrong band names the correct answer.
- Locked state is a 1.5px ink border + ink tile + "ലോക്ക്" text.
- Volt is confined to band/band-dark, with all pairs ≥ 8.8:1.
- Brick-dark was correctly lightened; win-takeover caption was correctly raised to 7.13:1.
- Timer announcements are limited to start + 5 s, never per tick. Reconnect is announced at start and end only.
- Overtake uses a drawn crack rather than a flash, and only on your own row.
- No count-up numbers, particles or confetti. Animation is transform/opacity only.
- No gesture-only interactions: no swipes or drags, and share and copy are taps.
- Install prompt and sign-in nudge are inline, never modal, with no timeout.
- Answer options are 56px tall, and the target token is 48px.

---
name: Minnal
description: 'Live Kerala PSC quiz battles (മിന്നൽ, "lightning"). Direction "Quiet + Spark": ink on cool paper while answering, an ink band with volt and a lightning bolt at the three peaks. Tailwind 4 on React 19; this file is the token contract.'
status: final
created: 2026-11-11
updated: 2026-11-11
sources:
  - _bmad-output/specs/spec-quiz-arena/SPEC.md
  - _bmad-output/specs/spec-quiz-arena/game-modes.md
  - _bmad-output/specs/spec-quiz-arena/question-content.md
  - _bmad-output/planning-artifacts/prds/prd-quiz-arena-2026-11-10/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-quiz-arena-2026-11-10/ARCHITECTURE-SPINE.md
colors:
  # Calm surface, light (directions-2 variant B)
  paper: '#F4F5F7'
  card: '#FFFFFF'
  ink: '#101216'
  muted: '#666C78'
  hairline: '#E1E3E8'
  control-edge: '#8D939C'       # answer option + text field border, 3.1:1 on card
  dim: '#9AA0AA'
  tile: '#F4F5F7'
  ink-soft: '#2B3040'
  unanswered: '#80868F'         # answered-dot ring, 3.7:1 on card
  brick: '#B8463A'
  # Calm surface, dark (derived from directions-2 dark page tokens)
  paper-dark: '#141518'
  card-dark: '#1D1F23'
  ink-dark: '#E8E9EB'
  muted-dark: '#9CA1AA'
  hairline-dark: '#2F3238'
  control-edge-dark: '#6E737C'  # 3.8:1 on paper-dark
  dim-dark: '#6E737C'
  tile-dark: '#26292E'
  ink-soft-dark: '#E8E9EB'      # [ASSUMPTION] explanation text uses ink-dark; no dark value was mocked
  unanswered-dark: '#6E737C'    # 3.5:1 on card-dark
  brick-dark: '#E2705F'         # 5.8:1 on paper-dark, 5.3:1 on card-dark, 4.7:1 on tile-dark
  # Peak surface
  band: '#101216'
  band-raised: '#2B3040'
  on-band: '#FFFFFF'
  on-band-muted: '#9AA0AA'
  on-band-soft: '#C9CDD3'
  volt: '#D4FF2A'
  on-volt: '#101216'
  # Peak surface, dark: raised band (+ 1px volt edge at peaks) so it separates from paper-dark
  band-dark: '#2F3238'
  band-raised-dark: '#3D414A'
typography:
  # Authored in rem (px / 16). Malayalam: self-hosted script-range woff2 (AD-18). Latin: platform system stack.
  question:
    fontFamily: 'Noto Sans Malayalam, Nirmala UI, Kartika, sans-serif'
    fontSize: 1.4375rem
    fontWeight: '500'
    lineHeight: '1.65'
  option:
    fontFamily: 'Noto Sans Malayalam, Nirmala UI, Kartika, sans-serif'
    fontSize: 1.09375rem
    fontWeight: '400'
    lineHeight: '1.5'
  explanation:
    fontFamily: 'Noto Sans Malayalam, Nirmala UI, Kartika, sans-serif'
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: '1.75'
  title:
    fontFamily: 'Noto Sans Malayalam, system-ui, sans-serif'
    fontSize: 1.3125rem
    fontWeight: '600'
    lineHeight: '1.5'
  card-title:
    fontFamily: 'Noto Sans Malayalam, system-ui, sans-serif'
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: '1.4'
  peak-word:
    fontFamily: 'Noto Sans Malayalam, system-ui, sans-serif'
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: '1.4'
  peak-points:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: 2.75rem
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: -0.02em
  takeover-title:
    fontFamily: 'Noto Sans Malayalam, system-ui, sans-serif'
    fontSize: 2.375rem
    fontWeight: '700'
    lineHeight: '1.35'
  takeover-score:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: 2.125rem
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: -0.02em
  score:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: 1.1875rem
    fontWeight: '600'
    lineHeight: '1.2'
  room-code:
    fontFamily: 'ui-monospace, SF Mono, Menlo, Consolas, monospace'
    fontSize: 2.5rem
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: 0.06em
  room-code-compact:
    # Under 360 CSS px
    fontFamily: 'ui-monospace, SF Mono, Menlo, Consolas, monospace'
    fontSize: 2rem
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: 0em
  code:
    # JSON paste area and schema block; Malayalam strings fall back to the Malayalam face
    fontFamily: 'ui-monospace, SF Mono, Menlo, Consolas, Noto Sans Malayalam, monospace'
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: '1.6'
  body:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Noto Sans Malayalam, sans-serif'
    fontSize: 0.9375rem
    fontWeight: '400'
    lineHeight: '1.5'
  label:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Noto Sans Malayalam, sans-serif'
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: '1.5'
  caption:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Noto Sans Malayalam, sans-serif'
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: '1.5'
  countdown:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: 4.5rem
    fontWeight: '700'
    lineHeight: '1'
  tab-label:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Noto Sans Malayalam, sans-serif'
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: '1.5'
rounded:
  sm: 6px
  md: 10px
  lg: 12px
  xl: 14px
  2xl: 16px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '8': 32px
  gutter-card: 16px
  gutter-text: 20px
  option-gap: 10px
  target-min: 48px
  sticky-max: 48px
motion:
  # Extension key (not in the Google Labs spec): durations lifted from the accepted mocks.
  flash-window: 1000ms
  band-drop: 160ms
  strike-volt-hold: 80ms
  strike-total: 400ms
  overtake-jump: 180ms
  overtake-crack-fade-after: 1200ms
  win-flood: 200ms
  win-hold: 1600ms
  win-collapse: 240ms
  chip-pop: 160ms
  chip-new-label: 3000ms
  reduced-fade: 200ms
  reduced-chip-fade: 120ms
  easing-default: ease-out
  easing-overtake: 'cubic-bezier(.34,1.4,.64,1)'   # [ASSUMPTION] "slight overshoot"; curve not specified
components:
  focus-ring:
    width: 2px
    style: solid
    color: '{colors.ink}'             # 17.2:1 paper, 18.8:1 card
    color-dark: '{colors.ink-dark}'   # 15.0:1 paper-dark
    color-on-band: '{colors.on-band}' # 18.8:1 band, 12.9:1 band-dark
    offset: 2px
  answer-option:
    background: '{colors.card}'
    border: '1px {colors.control-edge}'
    border-dark: '1px {colors.control-edge-dark}'
    radius: '{rounded.md}'
    typography: '{typography.option}'
    minHeight: 56px
  answer-option-locked:
    border: '1.5px {colors.ink}'
    tile: '{colors.ink}'
  answer-option-correct:
    background: '{colors.band}'
    foreground: '{colors.on-band}'
    tile: '{colors.volt}'
    status: '{colors.volt}'
    background-dark: '{colors.band-dark}'
    edge-dark: '1px {colors.volt}'
  answer-option-muted:
    foreground: '{colors.muted}'
  hairline-timer:
    height: 2px
    track: '{colors.hairline}'
    fill: '{colors.ink}'
  score-strip:
    background: '{colors.card}'
    border: '1px {colors.hairline}'
    radius: '{rounded.md}'
    typography: '{typography.score}'
    status: '{colors.muted}'
  peak-band:
    background: '{colors.band}'
    foreground: '{colors.on-band}'
    accent: '{colors.volt}'
    radius: '{rounded.xl}'
    background-dark: '{colors.band-dark}'
    edge-dark: '1px {colors.volt}'
  results-band-draw:
    background: '{colors.band}'
    background-dark: '{colors.band-dark}'
    foreground: '{colors.on-band}'
    delta: '{colors.on-band-muted}'
    radius: '{rounded.xl}'
  win-takeover:
    # Full screen, so it keeps band in both themes
    background: '{colors.band}'
    accent: '{colors.volt}'
    panel: '{colors.band-raised}'
    caption: '{colors.on-band-muted}'   # Continue button label, 7.1:1
  podium:
    background: '{colors.card}'
    border: '1px {colors.hairline}'
    radius: '{rounded.md}'
    you: '{colors.band}'
    you-dark: '{colors.band-dark}'
    accent: '{colors.volt}'
  rematch-waiting:
    background: '{colors.card}'
    border: '1.5px {colors.ink}'
    foreground: '{colors.muted}'
    radius: '{rounded.md}'
  leave-confirm-dialog:
    background: '{colors.card}'
    radius: '{rounded.lg}'
    dimBehind: '0.42'
    confirm: '{colors.brick}'
    confirm-dark: '{colors.brick-dark}'
  start-countdown:
    background: '{colors.paper}'
    foreground: '{colors.ink}'
    typography: '{typography.countdown}'
  primary-action-card:
    background: '{colors.band}'
    foreground: '{colors.on-band}'
    watermark: '{colors.band-raised}'
    background-dark: '{colors.band-dark}'
    watermark-dark: '{colors.band-raised-dark}'
    edge-dark: '1px {colors.dim-dark}'
    radius: '{rounded.2xl}'
  button-primary:
    background: '{colors.band}'      # ink in light; band-dark in dark (ink-dark would be 1.2:1 under the white label)
    foreground: '{colors.on-band}'
    radius: '{rounded.md}'
    minHeight: '{spacing.target-min}'
  button-secondary:
    background: '{colors.card}'
    border: '1.5px {colors.ink}'
    radius: '{rounded.md}'
    minHeight: '{spacing.target-min}'
  button-disabled:
    background: '{colors.card}'
    border: '1px {colors.dim}'
    foreground: '{colors.muted}'
    radius: '{rounded.md}'
  scoreboard-row:
    background: '{colors.card}'
    radius: '{rounded.md}'
    minHeight: 47px
  scoreboard-row-you:
    background: '{colors.band}'
    accent: '{colors.volt}'
    minHeight: 56px
    background-dark: '{colors.band-dark}'
    edge-dark: '1px {colors.volt}'
  answered-dot:
    size: 7px
    answered: '{colors.ink}'
    ring: '1.5px {colors.unanswered}'
    ring-dark: '1.5px {colors.unanswered-dark}'
  room-code-block:
    background: '{colors.card}'
    radius: '{rounded.xl}'
    typography: '{typography.room-code}'
    typography-compact: '{typography.room-code-compact}'
  joined-chip:
    background: '{colors.card}'
    border: '1px {colors.hairline}'
    radius: '{rounded.2xl}'
  reconnect-banner:
    background: '{colors.card}'
    border: '1.5px {colors.ink}'
    radius: '{rounded.lg}'
    dimBehind: '0.42'
  share-card:
    background: '{colors.band}'
    accent: '{colors.volt}'
    size: 1080px
    radius: 18px
  tab-bar:
    background: '{colors.card}'
    border: '1px {colors.hairline}'
    active: '{colors.ink}'
    inactive: '{colors.muted}'
    typography: '{typography.tab-label}'
  mode-switcher:
    track: '{colors.card}'
    border: '1px {colors.hairline}'
    radius: '{rounded.md}'
    padding: 3px
    active-background: '{colors.ink}'
    active-foreground: '{colors.on-band}'
    inactive: '{colors.muted}'
    typography: '{typography.label}'
    minHeight: '{spacing.target-min}'
  period-tabs:
    rule: '1px {colors.hairline}'
    active: '{colors.ink}'
    active-underline: '2px {colors.ink}'
    inactive: '{colors.muted}'
    typography: '{typography.body}'
    minHeight: '{spacing.target-min}'
  leaderboard-row:
    background: '{colors.card}'
    radius: '{rounded.md}'
    minHeight: 47px
    rank: '{colors.muted}'
    rank-top3: '{colors.ink}'
    meta: '{colors.muted}'
    value: '{typography.score}'
  leaderboard-row-you:
    background: '{colors.band}'
    background-dark: '{colors.band-dark}'
    foreground: '{colors.on-band}'
    meta: '{colors.on-band-muted}'
    tag-border: '1px {colors.on-band-muted}'
    tag-text: '{colors.on-band-soft}'
    minHeight: 56px
  empty-state-card:
    background: '{colors.card}'
    border: '1px {colors.hairline}'
    radius: '{rounded.lg}'
    mark: '{colors.ink}'
    body: '{colors.muted}'
    ghost-row: '1px dashed {colors.hairline}'
  usage-meter:
    background: '{colors.card}'
    border: '1px {colors.hairline}'
    radius: '{rounded.lg}'
    bar-height: 4px
    bar-track: '{colors.hairline}'
    bar-fill: '{colors.ink}'
    warn-border: '1.5px {colors.ink}'
  text-field:
    background: '{colors.card}'
    border: '1px {colors.control-edge}'
    border-dark: '1px {colors.control-edge-dark}'
    radius: '{rounded.md}'
    minHeight: '{spacing.target-min}'
    label: '{typography.label}'
  json-paste-area:
    background: '{colors.card}'
    border: '1px {colors.control-edge}'
    border-error: '1.5px {colors.brick}'
    radius: '{rounded.md}'
    typography: '{typography.code}'
    line-number: '{colors.muted}'
    bad-line-rule: '3px {colors.brick}'
  disclosure-row:
    background: '{colors.card}'
    border: '1px {colors.hairline}'
    radius: '{rounded.lg}'
    minHeight: '{spacing.target-min}'
    code-background: '{colors.tile}'
    code-radius: '{rounded.sm}'
    code-foreground: '{colors.ink-soft}'
  import-error-list:
    background: '{colors.card}'
    border: '1px {colors.hairline}'
    radius: '{rounded.lg}'
    error: '{colors.brick}'
    error-dark: '{colors.brick-dark}'
    field-tag: '1px {colors.hairline}'
    rowMinHeight: '{spacing.target-min}'
  success-card:
    background: '{colors.card}'
    border: '1px {colors.hairline}'
    radius: '{rounded.lg}'
    icon: '{colors.ink}'
    body: '{colors.muted}'
---

# Minnal — Design Spine

> **Visual references** (in `mockups/`): [`directions-2.html`](mockups/directions-2.html) (variant B "Quiet + Spark", the chosen direction and palette source), [`key-home.html`](mockups/key-home.html), [`key-live-match.html`](mockups/key-live-match.html), [`key-results.html`](mockups/key-results.html), [`key-battle-lobby.html`](mockups/key-battle-lobby.html), [`key-leaderboards.html`](mockups/key-leaderboards.html), [`key-custom-topics.html`](mockups/key-custom-topics.html). **DESIGN.md and EXPERIENCE.md win on any conflict with a mock.** Behaviour lives in `EXPERIENCE.md`.

## Brand & Style

Minnal means lightning. The product's job is to make years of lonely PSC prep feel like a live contest, without turning a study tool into an arcade.

**Quiet + Spark** ([directions-2, variant B](mockups/directions-2.html)). While a player reads and answers, the screen is ink on cool paper with no colour at all, so the Malayalam question is the only thing to look at. Three moments break the calm: the **correct reveal**, **your overtake** and the **match win**. At those, an ink band (or full-screen ink) appears with electric volt and the lightning bolt. The contrast makes the peaks feel big while the app stays cheap to render on a 2 GB Android phone: transforms and opacity only, one SVG polygon, no particles.

The strike is volt on band only. There is **no full-white frame**: white is confined to the bolt polygon (≤ 10% of the viewport), and in dark mode there is no white at all. Mocks that show a white frame flash are superseded.

The bolt is the brand mark. The wordmark is മിന്നൽ (Malayalam UI) or Minnal (English UI), preceded by the small bolt.

## Colors

- **Paper `#F4F5F7` / `#141518` dark** — the calm canvas.
- **Card `#FFFFFF` / `#1D1F23`** — options, score strip, lists, rows.
- **Ink `#101216` / `#E8E9EB`** — text, and the *calm accent*: locked-option border, primary buttons, the Quick Match card, active switcher segment, your pinned leaderboard row, the focus ring. In calm states ink is the only emphasis.
- **Muted `#666C78` / `#9CA1AA`** — meta, labels, secondary text, inactive tabs, opponent status, locked-mode titles, post-reveal non-chosen options (4.8:1 on paper, 5.3:1 on card; 7.0:1 dark).
- **Hairline `#E1E3E8` / `#2F3238`** — dividers, card borders, timer track.
- **Control edge `#8D939C` / `#6E737C`** — the border of answer options and text fields (3.1:1 on card; 3.8:1 on paper-dark), so the tap area stays visible to low-vision players.
- **Dim `#9AA0AA` / `#6E737C`** — chevrons, decorative icons, disabled-only borders. **Never text.**
- **Unanswered `#80868F` / `#6E737C`** — the answered-dot ring (3.7:1 on card; 3.5:1 on card-dark).
- **Brick `#B8463A` / `#E2705F`** — someone else's wrong pick, your wrong rows in the breakdown, error text, the Leave action. Quiet, not alarm red. 5.3:1 on white; dark 5.8:1 on paper-dark, 5.3:1 on card-dark, 4.7:1 on tile-dark. Never a warning colour (warnings are ink).
- **Band `#101216` + band-raised `#2B3040`** — the peak surface in light mode, and the win takeover and share card in both themes. Text on it is white (18.8:1) or on-band-muted `#9AA0AA` (7.1:1).
- **Band-dark `#2F3238` + band-raised-dark `#3D414A`** — the band in dark mode: a raised surface, because `#101216` on `#141518` is 1.03:1. Band-dark is 1.4:1 on paper-dark, so at peaks (reveal band, overtake row, correct option, results band) it carries a 1px volt edge (15.8:1). The dark Quick Match card carries a 1px dim-dark edge (3.8:1); other calm ink surfaces in dark use band-dark with no edge. White on band-dark 12.9:1, on-band-soft 8.1:1, on-band-muted 4.9:1, volt 11.1:1. **Text on band-raised-dark uses on-band or on-band-soft only** (on-band-muted is 3.9:1 there).
- **Volt `#D4FF2A`** — the peak accent. **Always on band (16.2:1) or band-dark (11.1:1), never on white (1.2:1).** Used only in the reveal band, the overtake row, the win takeover, the settled results band, the dark-mode peak edge and the share card. Never for focus, warnings or calm screens (Ranks, Custom Topics, Home, lobby).

Dark mode is a full theme that follows the OS setting. The full-screen win takeover keeps `{colors.band}`; banded components switch to `{colors.band-dark}`.

## Typography

Two stacks. **Malayalam:** Noto Sans Malayalam, self-hosted `woff2` (AD-18), falling back to Nirmala UI / Kartika. **Latin and numerals:** the platform system stack (Roboto on Android). No web Latin font ships, which protects the 150 KB JS budget.

**Malayalam font file.** Subset by **script range**, not by observed text: `unicode-range: U+0D00-0D7F, U+200C-200D, U+25CC, U+0964-0965`, keeping all GSUB/GPOS features (`--layout-features='*'`), atomic chillu (ൺ ൻ ർ ൽ ൾ ൿ) and ZWJ-sequence forms, so custom topics, names and report notes shape correctly. Ship one variable woff2 (or at most 400 + 600 statics), budgeted at about 45–70 KB outside the JS budget. Set `font-synthesis: none`; never synthesize bold on Malayalam. Loading behaviour is in `EXPERIENCE.md` › State Patterns.

- All type tokens are authored in `rem`, so OS and browser text scaling apply.
- Malayalam text is never below 0.75rem (12px), including tags, tab labels and captions, and never below line-height 1.5. Question and explanation text use 1.65 and 1.75, because stacked conjuncts and vowel signs clip at tighter leading. Tags use ≥ 2px vertical padding and no fixed height.
- `{typography.question}` is the largest reading text in the app. Options use `{typography.option}`.
- Every score, timer, rank and count uses tabular numerals (`font-variant-numeric: tabular-nums`).
- Points snap in. There are no count-up animations.
- Room codes use `{typography.room-code}` (monospace) because they are read aloud in class; under 360 CSS px they step down to `{typography.room-code-compact}`.
- JSON and schema text use `{typography.code}`.

## Layout & Spacing

Baseline width 360px, single column. Cards sit `{spacing.gutter-card}` from the screen edge; free text and headings sit at `{spacing.gutter-text}`. Options stack with `{spacing.option-gap}`; scoreboard and leaderboard rows with `{spacing.1}`. Fixed bottom bars (tab bar, results action bar, host start bar) sit on `{colors.card}` with a hairline top border. The live match is full-screen with no tab bar.

**Hit areas.** Every interactive element has a hit area of at least `{spacing.target-min}` × `{spacing.target-min}`, made with padding or a `::before` hit box even when the visual stays small: the EN tag, the "തെറ്റുണ്ടോ?" report link, copy-code and "കോപ്പി" links, rematch Cancel, the Leave text button, breakdown expand/collapse, switcher segments, period tabs and tab-bar items. Adjacent hit areas don't overlap; the EN tag sits ≥ `{spacing.2}` from the question's first line.

**Reflow.** No fixed `height` on text containers (use `min-height`). Layouts reflow at 320 CSS px at 100% and at 360 px with 200% text, with no horizontal page scroll. In the live match only the timer line, seconds label and "Q n/10" stay sticky (≤ `{spacing.sticky-max}`); the score strip, question, options and footer hint scroll in normal flow (no absolutely positioned footer). The results action bar wraps to stacked full-width buttons when labels don't fit. The win takeover scrolls when content exceeds the viewport. The JSON paste area may scroll horizontally inside itself; the page never does.

**Focus.** `:focus-visible` always shows `{components.focus-ring}` (`color-on-band` on band surfaces), offset 2px. `scroll-padding-bottom` equals the fixed bar height, so a focused item is never hidden under the tab bar, action bar or host start bar.

The admin console is desktop-first (≥ 1024px), uses the same tokens, and is denser: tables and forms instead of cards. [ASSUMPTION] No admin layout was mocked.

## Elevation & Depth

Flat. Depth comes from tone (paper → card → ink band), not shadow. The only layering is the peak: ink band over paper, and the win takeover flooding the whole screen. The reconnect state and the leave dialog dim everything behind to 42% opacity rather than adding a scrim. A pinned leaderboard row sits on a paper strip above the tab bar, with no shadow.

## Shapes

Soft rectangles, no pills on surfaces. `{rounded.sm}` letter tiles, tags (EN, സ്വന്തം, BOT, നിങ്ങൾ, field-name tags, +24 chip) and code blocks; `{rounded.md}` options, buttons, text fields, switcher track, score strip, scoreboard and leaderboard rows; `{rounded.lg}` content cards, mode list, usage meter, error list, success and empty cards, reconnect banner; `{rounded.xl}` peak band and room code block; `{rounded.2xl}` the Quick Match card and joined chips. `{rounded.full}` only for avatars, status dots and the round "!" and ✓ marks. The bolt is a hard-edged polygon; it never gets rounded.

## Components

### Shared

- **Focus ring** — `{components.focus-ring}`: 2px solid ink (ink-dark in dark, on-band on band), 2px offset. Never volt.
- **Buttons** — *Primary:* band fill (ink in light, band-dark in dark), white label. *Secondary:* card fill, 1.5px ink outline. *Disabled:* `{components.button-disabled}` (card, 1px dim border, muted label, 5.3:1), with a caption beside it saying why.
- **Tab bar** — four items, 20px icon over `{typography.tab-label}`; active ink bold, inactive muted.
- **Text field** — card fill, 1px control-edge border, `{rounded.md}`, visible label above in `{typography.label}` muted.
- **Bot badge** — `{rounded.sm}` outline tag "BOT" next to the bot's name.

### Home ([key-home](mockups/key-home.html))

- **Primary action card (Quick Match)** — ink card, static band-raised bolt watermark (never volt), white button inside. Dark: band-dark with a 1px dim-dark edge.
- **Mode entry row** — 32px tile icon, title + subline, dim chevron. *Locked (guest):* muted title, half-opacity icon, "Sign in" label with lock.
- **Rank snippet** — card with a large rank number (26px bold) and today's board label with the day's gain (e.g. "ഇന്ന് +24").
- **Rating trio** — three small cards in a grid, label + value.
- **Sign-in nudge** — card with 1.5px ink outline (not a modal), benefit text, ink "Continue with Google" button. The install prompt uses the same card.

### Live match ([key-live-match](mockups/key-live-match.html))

- **Answer option** — card fill, 1px control-edge border, letter tile (A–D) on `{colors.tile}`, Malayalam text. *Pressed:* ink border. *Locked:* 1.5px ink border, ink tile, "ലോക്ക്" status at right. *Correct (reveal):* band fill, white text, volt tile with ✓, volt status. *Other's pick:* brick status label with their name. *Non-chosen after reveal:* muted text.
- **Hairline timer** — 2px ink line on hairline track, animated with `transform: scaleX()` on a composited layer (never `width`), plus an ink-bold seconds label in the meta row.
- **Score strip** — card with You (ink, bold) left, opponent right, opponent status (muted) in the middle; bot carries the Bot badge.
- **Language toggle (EN tag)** — outlined ink tag beside the mode label, 48px hit area.
- **Peak band** — band surface, `{rounded.xl}`. Label in on-band-muted, the answer in `{typography.peak-word}`, points in `{typography.peak-points}` volt, total beside it. A volt bolt sits top-right. *Wrong answer:* same band, no bolt, no volt.
- **Explanation + attribution** — `{typography.explanation}` in ink-soft, then a caption row: source (e.g. "Kerala PSC LDC 2019" or "ഉറവിടം ലഭ്യമല്ല") left, report link "തെറ്റുണ്ടോ?" right in ink.
- **Reconnect banner** — card, 1.5px ink border, a 40px ring holding the countdown digit. Monochrome; never flashes.
- **Leave confirm dialog** — centred card, `{rounded.lg}`, everything behind dimmed to 42%. Title, one muted line, button-primary "Stay" and a brick text button "Leave".
- **Start countdown** — 3-2-1 digits in `{typography.countdown}` ink, centred on paper; monochrome.

### Results ([key-results](mockups/key-results.html))

- **Win takeover** — full-screen band, large volt bolt, `{typography.takeover-title}`, your score in volt `{typography.takeover-score}`, opponent score muted, rating delta on a band-raised panel. A real "Continue" button (≥ 48px) styled as the caption in on-band-muted (7.1:1). Battle Room: #1 only.
- **Results band (compact)** — smaller peak band: result line, your score in volt, opponent in muted, delta in a volt chip with on-volt text. Loss: grey delta, no volt.
- **Draw band** — compact band with "സമനില / Draw", both scores in white, grey delta. No volt, no bolt.
- **Dot strip** — one 7px dot per question: ink fill = correct, brick ring = wrong.
- **Breakdown row** — card: Q number, correct/wrong, time, points (brick when 0); question, "നിങ്ങൾ:" your answer (brick if wrong) and "ശരി:" correct answer (bold); explanation; attribution + report link. *Collapsed (correct rows):* one line "Q3 ✓ 9 s +800" with no truncated question text.
- **Action bar** — fixed bottom: primary (ink fill) plus secondary buttons (1.5px ink outline), 2fr / 1fr / 1fr; stacks full-width when labels don't fit.
- **Rematch waiting** — the Rematch button becomes a 1.5px ink-outline card: "Waiting for <name>…" in muted, a seconds count and a Cancel text link.
- **Podium** — Battle Room results top: three card columns ordered 2-1-3, #1 tallest, rank numeral, name, score. Your column takes band fill; your score is volt only when you are #1. Everyone else follows as scoreboard rows.
- **Share card** — 1:1 image exported at 1080 × 1080. Ink field, bolt, wordmark, result line, score in volt, mode · topic in on-band-muted, CTA and short link (link in volt) above a band-raised rule. Must read at WhatsApp thumbnail size (~250px).

### Battle Room ([key-battle-lobby](mockups/key-battle-lobby.html))

- **Room code block** — card, label, code in `{typography.room-code}`, expiry caption (absolute time, e.g. "expires 7:30 pm"), Share-to-WhatsApp button-primary and a copy-code text link.
- **Source row + unrated tag** — config row; custom sources carry a "സ്വന്തം" outline tag and an "unrated" note in muted.
- **Joined chip** — card chip. *New:* 1.5px ink outline + "ഇപ്പോൾ" label. *You:* ink fill. *Overflow:* dashed "+N പേർ".
- **Host start bar** — fixed bottom, full-width button-primary "തുടങ്ങാം · N പേർ", caption below; disabled uses button-disabled.
- **Answered meter** — 4px bar (ink fill on hairline) with "N / M ഉത്തരം നൽകി".
- **Scoreboard row** — card row (min-height 47px): rank, name, score, answered dot (● ink / ○ 1.5px unanswered ring). *You after overtaking:* band fill, volt rank/score/subline, min-height 56px. *Dropped:* full-opacity text with "▼ 1".
- **Overtake crack** — one-shot zig-zag polyline between your row and the passed row; ink when you pass, muted grey when you are passed.

### Leaderboards ([key-leaderboards](mockups/key-leaderboards.html))

All calm surface: Ranks is not a peak, so no volt and no bolt strike.

- **Mode switcher** — segmented control of three modes on a card track with hairline border and 3px padding; active segment ink fill with white label, inactive muted, all 600 weight.
- **Period tabs** — text tabs (ഇന്ന് / ഈ ആഴ്ച / എക്കാലവും) over a hairline rule; active ink bold with a 2px ink underline, inactive muted.
- **Leaderboard row** — card row (min-height 47px): rank, name with district below in muted caption, value right in `{typography.score}`. Ranks 1–3 get bold ink numerals only: no medals, no volt.
- **Pinned own row** — ink fill (band-dark in dark), min-height 56px, white rank/name/value, district in on-band-muted, a "നിങ്ങൾ" outline tag (on-band-muted border, on-band-soft text) beside the unchanged name. Sits on a paper strip above the tab bar, preceded by a dim "···" gap mark.
- **Empty leaderboard card** — card with a static ink-outline bolt, a one-line title, a muted line, button-primary to play the viewed mode and a text link to another board. Below it, three dashed hairline ghost rows (decorative).

### Custom Topics ([key-custom-topics](mockups/key-custom-topics.html))

All calm surface: importing is not a peak. Ink is the only emphasis; brick appears only on error text.

- **Usage meter** — card with a one-line tally of both caps ("12 / 50 ടോപ്പിക് · 410 / 500 ചോദ്യം"), then one 4px bar per cap (ink on hairline) with label and value. *Warning (≥ 80% of either cap):* 1.5px ink outline plus a "!" line (18px ink circle) giving headroom and a way out. Monochrome.
- **Topic row** — list row (min-height 56px) built from the mode entry row: title, muted "N ചോദ്യം · date" subline, dim chevron.
- **Import form** — a text field for the topic name and a **JSON paste area**: card, control-edge border, `{typography.code}`, no soft-wrap. *Error:* 1.5px brick border; each bad line gets a 3px brick gutter rule and a bold brick line number; other line numbers muted.
- **Pre-import tally line** — muted caption under the paste area with the found count and post-import usage in bold ink ("15 ചോദ്യം കണ്ടെത്തി · ശേഷം 425 / 500").
- **Disclosure rows** — card list of collapsible rows (▸ / ▾ ink chevron, title, "കോപ്പി" text link right). Expanded content is a code block on `{colors.tile}`, `{rounded.sm}`, ink-soft monospace.
- **Import error list** — card with a count header ("2 തെറ്റുകൾ തിരുത്തിയാൽ ഇംപോർട്ട് ചെയ്യാം") and a muted hint line, then one row per problem: ⚠ + brick text ("ചോദ്യം 7: 4 ഓപ്ഷനുകൾ വേണം, 3 എണ്ണമേ ഉള്ളൂ") and a monospace field-name tag (hairline outline, muted). Import below uses button-disabled until fixed. The same list serves the admin CSV upload.
- **Success card** — card with a 28px ink circle holding a white ✓, title "<topic> · N questions imported", a muted line, then actions 2fr / 1fr: button-primary "Use in Battle Room", button-secondary "Practice". No volt.

### Admin

- **Admin table / form** — [ASSUMPTION] card + hairline rows, button-primary for Publish, button-secondary for Discard. Not mocked. Errors use the import error list.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Keep answering states monochrome: ink, paper, card | Put any colour on screen while a question is open |
| Use volt only at reveal, overtake, win (and their settled band and share card) | Use volt for buttons, links, badges, focus, warnings, Home, Ranks, Custom Topics or the lobby |
| Put volt on band or band-dark every time | Put volt on white or paper (1.2:1) |
| One strike per peak, at most one flash per `{motion.flash-window}` app-wide | Strobe, repeat flashes, a full-white frame, particles, confetti |
| Snap numbers in | Count-up or rolling numbers |
| Malayalam ≥ 0.75rem and line-height ≥ 1.5 | Tight leading or tiny tags that clip conjuncts |
| Use dim only for chevrons, decorative marks and disabled borders | Set any text in dim, or fade text with opacity |
| Author type in rem; use min-height on text containers | Fixed heights, or disabling zoom |
| Show the focus ring on every `:focus-visible` | `outline: none` without a replacement |
| Animate with transform and opacity only | Animate layout, width, blur or shadows (2 GB phones) |
| Keep the bolt watermark on Home band-raised; keep top-3 ranks as bold numerals | Turn calm surfaces electric, or add medals, to "add energy" |

## Open Questions

- **Admin visual layout** is spine-only; confirm whether it needs a mock.

# Epic 3 Context: Snobin curates the question bank

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give Snobin, Minnal's only content admin, a desktop-only admin console at `/admin` to manage the question bank safely. He searches and filters the bank, bulk-uploads Kerala PSC questions by CSV (valid rows become drafts, bad rows are listed with fixes), reviews every draft in both languages before publishing, and edits questions in a full editor. Published questions are never edited in place, so players keep getting the live version until a fix is published. Players can report a wrong question from the reveal or results screen, and those reports land in an admin queue that Snobin closes by publishing a fix or dismissing with a note.

## Stories

- Story 3.1: Admin console access and layout
- Story 3.2: Add and edit single questions
- Story 3.3: CSV bulk upload
- Story 3.4: Draft review queue
- Story 3.5: Players report a wrong question
- Story 3.6: Report queue and resolution

## Requirements & Constraints

- Admin access is gated by an ADMIN role carried in the access token; non-admins get 403 on admin APIs and a "Not authorised" page in the web app. The admin code must never load for players (separate lazily loaded chunk, bundle-checked in CI).
- Admin console: desktop only (usable at 1024 px and up; below that, only the table scrolls). English-only UI strings in their own i18n namespace. Question content keeps its own `lang` attributes.
- Question lifecycle: every new question or new version starts as DRAFT; DRAFT moves to PUBLISHED or DISCARDED. Published versions are immutable. Soft delete only. Only published versions are ever served to players.
- Bulk CSV: 2 MB and 1,000-row caps; valid UTF-8 required; RFC 4180 parsing; NFC normalisation with Malayalam (chillu, ZWJ/ZWNJ) preserved byte-for-byte. Row numbers match the spreadsheet view (header is row 1). Valid rows import in one transaction; nothing is published. Duplicates are matched by sourceRef and are never overwritten.
- Uploads and player reports are rate-limited per user (Valkey token bucket, 429 with Retry-After). Admin upload and player reports each have their own limit.
- Validation: one shared validator is used by the editor, CSV upload, and the starter loader. It enforces length caps and distinct options, and returns every problem as a field-level error. The server is authoritative; client checks mirror it.
- Player reports reference an exact `{questionId, version}`. Guests cannot report. Custom-topic questions cannot be reported. The report link only appears after the reveal, and never on custom-topic questions.
- Reports close only by publishing a newer version (which auto-resolves every open report on older versions) or by dismissing with a required note. Records are never deleted. Reports from deleted accounts show "Deleted player".
- Every admin action that changes data has a 5-second Undo. The commit is sent only after the window passes, so a published version never needs reverting.
- Keyboard shortcuts on draft rows (P, D, E, J, K, ?) are ignored inside form fields and when a modifier key is held. A per-browser switch turns them off, and every shortcut has a visible button equivalent.
- Accessibility: visible focus rings, `aria-disabled` rather than disabled controls, polite status announcements, 48 × 48 px hit areas for the player report link, and an error summary that takes focus and links to fields.
- Malayalam text must render with the shipped font in previews so shaping problems show before publish.

## Technical Decisions

- Core-service owns the admin API under `/api/core/v1/admin/**`. An architecture test enforces that admin controllers live only under that path and package. Errors use RFC 9457 Problem Details with an `errors[{field, problem, fix?}]` list for validation.
- Database changes are Flyway migrations per story, in the `core` schema only. Each story alters only the tables it names, with no cross-schema reads. Changes include: a `display_no` identity on questions, actor and timestamp audit columns, an optimistic-lock `row_version` on versions, a partial unique index allowing at most one DRAFT per question, publish/discard actor columns, and a new `question_report` table with a foreign key to `question_version`.
- Editing a published question creates version n+1 as a draft. Editing an existing draft updates it in place, with a 409 on a stale `row_version`.
- Deleting a question sets `deleted_at`, discards its open draft, and makes `/internal/question-sets` stop returning it. Restore clears the marker only.
- `/internal/question-sets` keeps serving the previous published version until a new one is published. Game-service holds each match's question set in memory, so in-flight matches keep the version they fetched. Only later matches see a publish.
- Publishing a fix runs in one transaction and also resolves open reports on older versions.
- Bulk publish and discard accept up to 100 items and report results per item.
- Rate-limiter keys use the `core:` prefix. The limiter is a reusable Valkey Lua token bucket.
- The player-side report note and link are one shared component, to be reused by Solo Practice in Epic 4.

## UX & Interaction Patterns

- Questions list: filters (status, category, subject, topic, level, difficulty, search) live in the URL so reload and Back restore them. The search is debounced at 300 ms and matches case-insensitively with a minimum of 2 characters.
- Editor is a full page, not a modal. A two-language preview reuses the player option cards and explanation block. Leaving with unsaved changes asks for confirmation.
- Drafts page: a table with per-row Publish, Discard, Edit actions, multi-select bulk actions, and a 5-second Undo on each. Focus moves to the next row after an action.
- Reports page: grouped by question version, with Open and Closed tabs. Each report's note is shown as plain text. The "Open in editor" action prefills the editor from the open draft or the latest published version.
- Player report flow: "തെറ്റുണ്ടോ?" on the reveal or results row opens an inline note field (max 500 characters, live count). On the live reveal, the tap only marks the question, and the note is added on the results screen.

## Cross-Story Dependencies

- 3.1 must come first. It creates the console shell, the nav placeholders, and the `display_no` column that every later story relies on.
- 3.2 (editor and validator) is needed by 3.3, 3.4, and 3.6, since they all create or publish drafts.
- 3.3 (CSV upload) introduces the rate limiter. 3.5 reuses it for player reports.
- 3.4 (publish and discard) is needed by 3.6, because publishing is what closes reports.
- 3.5 (player report) depends on 3.4's publish flow, and its report link replaces the placeholders left in the Epic 1 reveal and results screens.
- Epic 2 provides the ADMIN role bootstrap and the player's registered status, which the admin console and the report feature both depend on.
- Epic 4 (Solo Practice) reuses the report component built in 3.5.

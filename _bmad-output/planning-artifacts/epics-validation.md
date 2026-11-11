---
artifact: epics-validation
target: _bmad-output/planning-artifacts/epics.md
step: 4 (final validation, re-run after fixes)
date: 2026-11-11
result: pass — all checks pass; epics.md stays status draft until the user selects [C]
---

# Epics Step 4 Final Validation (re-run): Minnal (quiz-arena)

What was checked: the whole of `epics.md` after the 20 fixes from the first validation (7 epics, now 43 stories), compared with `ARCHITECTURE-SPINE.md` (updated 2026-11-11 for item 12). Checks were scripted where possible (Requirements-line parsing, AC block counts, Given/When/Then order, forward-reference scan, placeholder scan) and then read by hand.

## Summary

| # | Check | Result |
|---|---|---|
| 1 | FR coverage (FR1–FR79), including ACs | **PASS** |
| 2 | Architecture (starter template, tables created when first needed) | **PASS** |
| 3 | Story quality (sizing ≤ 18 AC blocks, ACs, FR refs) | **PASS** |
| 4 | Epic structure (user value, no big upfront work, file churn) | **PASS** |
| 5 | Dependencies (no forward deps, every stub replaced explicitly) | **PASS** |
| + | Placeholders / formatting / frontmatter | **PASS** |

Frontmatter: `stepsCompleted: [1, 2, 3, 4]`, `status: draft` (unchanged until the user selects [C]).

---

## 1. FR coverage: PASS

- Every FR1–FR79 appears in at least one story's Requirements line; every UX-DR1–97 and NFR1–22 is also referenced. None missing.
- The earlier partial-coverage items are closed in the ACs:
  - **FR15:** Story 1.4's starter CSV requires `reviewedBy` (optional `reviewedAt`); the loader rejects rows without it and stores `reviewed_by` / `reviewed_at` on the published `question_version`.
  - **FR77:** amended in the FR list (tie above 0 → shared #1 and joint-win takeover for each tied player; all-zero tie → no takeover). Story 5.5's joint-win AC matches it and cites FR77 (no `[ASSUMPTION]`).
  - **FR14:** the two-step live-reveal report (mark on reveal, note on the results breakdown) is recorded next to FR14 as product-approved; Story 3.5 cites it.
  - **FR3:** Story 6.2 shows guests a locked Custom Topics row on Me (Story 1.5 locked-row pattern) with the sign-in path.
  - **FR65:** clarified in the FR list (an aborted match appears only in the completed-vs-aborted counter-metric); Stories 1.9, 5.4 and 7.3 use the same wording.

### Requirement → stories (from Requirements lines)

| FR | Stories | FR | Stories |
|---|---|---|---|
| 1 | 2.1 | 41 | 5.3 |
| 2 | 2.1, 2.2 | 42 | 5.2 |
| 3 | 1.5, 1.6, 2.1, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1 | 43 | 4.1, 4.3, 4.4, 5.5, 6.4 |
| 4 | 2.4 | 44 | 4.3, 6.4 |
| 5 | 2.4, 2.5 | 45 | 4.3, 6.4 |
| 6 | 2.3 | 46 | 6.1, 6.2 |
| 7 | 2.6, 4.2, 5.5 | 47 | 6.1, 6.2, 6.3 |
| 8 | 2.6, 5.5, 6.5 | 48 | 6.1, 6.3, 6.4, 6.5, 7.1 |
| 9 | 2.8, 6.3 | 49 | 6.3 |
| 10 | 1.4, 3.1, 3.2, 3.3, 4.1 | 50 | 6.4, 6.5 |
| 11 | 1.4, 1.8, 3.1, 3.2, 3.3, 4.3, 6.1, 6.4 | 51 | 6.1, 6.2, 6.3 |
| 12 | 1.4, 1.7, 3.2, 3.3 | 52 | 6.2, 6.3 |
| 13 | 1.7, 1.8, 4.3, 5.4 | 53 | 1.10, 4.2, 5.5 |
| 14 | 3.5, 3.6, 4.3, 4.4, 5.5, 6.4, 6.5 | 54 | 1.10, 2.6, 4.2, 4.4, 5.5 |
| 15 | 1.4, 3.2, 3.4, 4.1, 7.4 | 55 | 1.10, 4.2 |
| 16 | 1.4, 1.7, 1.8, 1.10, 3.2, 3.5, 4.3 | 56 | 5.6, 6.5 |
| 17 | 1.6, 2.5 | 57 | 1.10, 5.5, 5.6 |
| 18 | 1.6, 4.2 | 58 | 5.5 |
| 19 | 1.6, 1.7, 1.8, 1.10, 4.2 | 59 | 2.5, 4.2, 5.5 |
| 20 | 1.7 | 60 | 2.7, 4.2, 5.5 |
| 21 | 1.7, 4.2, 5.4 | 61 | 2.7 |
| 22 | 1.7, 4.2, 5.4 | 62 | 2.5, 2.6, 2.7, 4.3, 6.4, 6.5 |
| 23 | 1.5, 1.6, 7.1 | 63 | 1.9, 5.4 |
| 24 | 2.5 | 64 | 1.9, 5.4 |
| 25 | 1.4, 1.6 | 65 | 1.9, 5.4 |
| 26 | 1.6, 4.2, 5.1, 5.3 | 66 | 7.1 |
| 27 | 4.1, 4.2 | 67 | 7.1 |
| 28 | 4.2 | 68 | 2.1, 3.1, 7.4 |
| 29 | 4.2 | 69 | 3.2, 3.4, 3.6 |
| 30 | 4.2 | 70 | 3.3 |
| 31 | 5.1, 5.2, 5.4 | 71 | 3.2, 3.3, 3.4 |
| 32 | 5.2, 5.3 | 72 | 3.2, 3.3 |
| 33 | 5.3, 5.6 | 73 | 3.6 |
| 34 | 5.1, 5.2, 5.3, 5.4, 5.6 | 74 | 7.2 |
| 35 | 5.1, 6.5 | 75 | 1.3, 1.8, 5.4 |
| 36 | 5.1, 5.2 | 76 | 4.1, 4.2, 4.3, 4.4, 5.2, 5.4, 6.5, 7.4 |
| 37 | 5.4 | 77 | 5.5 |
| 38 | 5.4 | 78 | 3.6 |
| 39 | 2.5, 5.5, 6.5 | 79 | 1.10 |
| 40 | 5.1, 5.3, 5.4 | | |

---

## 2. Architecture: PASS

- **Starter template:** none named in the Spine; Story 1.1 is the hand-built scaffold.
- **Tables / stores created when first needed** (no table early, none used before it exists):

| Table / store | Created in | First needed by |
|---|---|---|
| `subject`, `topic`, `question` (`id`, `source_ref?` partial unique, `created_at`, `deleted_at?`), `question_version` (incl. `reviewed_by?`, `reviewed_at?`) | 1.4 | 1.4 |
| `app_user`, `user_identity`, `refresh_token` (`id`, `user_id`, `token_hash`, `expires_at`, `created_at`) | 2.1 | 2.1 |
| ALTER `refresh_token` + `family_id`, `rotated_at?`, `revoked_at?` | 2.2 | 2.2 |
| `user_profile`, core `event_outbox` | 2.3 | 2.3 |
| `rating`, `rating_event`, `match_record`, `player_directory`, ratings `event_outbox` | 2.5 | 2.5 |
| Valkey `ratings:lb:*` | 2.7 | 2.7 |
| ALTER `question` + `display_no` | 3.1 | 3.1 |
| ALTER `question` + `deleted_by?`, `created_by?`; `question_version` audit + `row_version`; one-draft index (no conditional clauses) | 3.2 | 3.2 |
| Valkey `core:rl:*` | 3.3 | 3.3 |
| ALTER `question_version` publish/discard audit | 3.4 | 3.4 |
| `question_report` | 3.5 | 3.5 |
| `recent_topic` (depends only on `topic`) | 4.1 | 4.1 |
| Valkey `core:solo:*` | 4.3 | 4.3 |
| `custom_topic`, `custom_question` (depend only on `app_user`) | 6.1 | 6.1 |
| Valkey `game:metrics:*` | 7.3 | 7.3 |
| game-service in-memory only (rating cache 2.5, deleted-sub set 2.8, room registry 5.1, tombstones 5.3) | — | — |

- **Earlier concerns closed:** A1 (1.4 names `deleted_at` and the `source_ref` unique index; 3.2 conditionals removed), A2 (Additional Requirements AD-10 line lists `leave`, `room/create`, `room/join`; Stories 1.9 and 5.1 cite AD-10 instead of re-declaring), A3 (metrics line says Grafana Cloud free tier, AD-19), A4 (Spine AD-10 now lists `ROOM_JOINED`, `ROOM_LOBBY_UPDATED`, `ROOM_CLOSED`, `ROOM_START_FAILED`, `ROOM_MATCH_STARTED`, `ROOM_SUCCEEDED`, `SERVER_DRAINING` and telemetry-only `prevAckRttMs`; AD-15 now names the per-service transactional `event_outbox`).
- **Migration coupling (item 19):** Stories 4.1 and 6.1 no longer say "after Story 3.6 / 5.4"; each takes the next free Flyway `V<n>` in its own service's sequence and depends only on the tables it references.

---

## 3. Story quality: PASS

All 43 stories have As / I want / So that, a Requirements line and an Acceptance Criteria header; every AC block is Given → When → Then (→ And), 0 violations by script. The largest story now has 17 AC blocks (limit 18).

| Epic | Stories (AC blocks) |
|---|---|
| 1 | 1.1 (8), 1.2 (10), 1.3 (13), 1.4 (9), 1.5 (9), 1.6 (13), 1.7 (13), 1.8 (13), 1.9 (10), 1.10 (14) |
| 2 | 2.1 (12), 2.2 (5), 2.3 (11), 2.4 (7), 2.5 (12), 2.6 (8), 2.7 (13), 2.8 (9) |
| 3 | 3.1 (12), 3.2 (11), 3.3 (11), 3.4 (11), 3.5 (10), 3.6 (10) |
| 4 | 4.1 (14), 4.2 (14), 4.3 (15), 4.4 (7) |
| 5 | 5.1 (10), 5.2 (13), 5.3 (17), 5.4 (17), 5.5 (15), 5.6 (5) |
| 6 | 6.1 (7), 6.2 (11), 6.3 (13), 6.4 (8), 6.5 (10) |
| 7 | 7.1 (8), 7.2 (7), 7.3 (6), 7.4 (5) |

Splits applied: old 2.1 → 2.1 sign-in / 2.2 token lifecycle; old 5.1 → 5.1 room server / 5.2 Rooms UI; old 5.4 → 5.5 results and podium / 5.6 Play again; old 6.1 → 6.1 import API / 6.2 Import screen. Stories 1.3 and 5.3 (now 5.4) left unsplit by decision; both are ≤ 17 blocks.

---

## 4. Epic structure: PASS

- Epics 1–6 are persona outcomes; Epic 7 mixes user value and solo-operator ops (accepted).
- Upfront work: Stories 1.1–1.2 are the required scaffold and deploy; the Story 1.2 backup stays where it is (decision, item 18).
- File churn reduced: Story 1.7 now requires `participants: List<Participant>` (tested at N = 2 and N = 5), so Story 5.4 reuses the actor as configuration; `questionSource` is in `MATCH_FOUND` (1.6) and `MATCH_ENDED` (1.10) from the start, and Story 3.5's conditional is gone.

---

## 5. Dependencies: PASS

- **Epic independence:** each epic uses only earlier epics.
- **Forward references:** scripted scan finds only scope-outs and "replaced by / added by Story X.Y" stub notes; no story needs a later story to work. The Story 3.1 forward reference to the editor is gone (the full text is shown on row expand); the Story 2.1 "when Story 2.2 is present" clause is gone (Story 2.3 adds the setup redirect).
- **Stubs → replacement (all explicit now):**

| Stub (introduced in) | Replaced by |
|---|---|
| Rooms / Ranks / Me placeholders (1.3) | 5.2 / 2.7 / 2.3 |
| Reduce-effects dev toggle (1.3) | 2.8 |
| Matchmaking route stub (1.5) | 1.6 |
| "Continue with Google" disabled (1.5) | 2.1 |
| Match-actor shell (1.6) | 1.7 |
| Live-match stub "Match found · vs <name>" (1.6) | 1.8 |
| Minimal results view (1.9) | 1.10 |
| Non-rotating refresh (2.1) | 2.2 |
| Admin nav placeholders Upload / Drafts / Reports (3.1) | 3.3 / 3.4 / 3.6 |
| `/play/duel`, `/practice` stubs (4.1) | 4.2, 4.3 |
| Room join / start `NOT_AVAILABLE_YET` (5.1) | 5.3 (join), 5.4 (start, after 5.3's checks) |
| Join field "Joining arrives soon" (5.2) | 5.3 |
| Interim final standings, publish switch off (5.4) | 5.5 |
| Results action bar Home-only (5.5) | 5.6 |
| Custom Topics row → Import directly (6.2) | 6.3 |
| Success-card / topic-view Practice and Use in BR disabled (6.2, 6.3) | 6.4, 6.5 |
| `CUSTOM` → 422 in `/internal/question-sets` (1.4), Solo (4.3); room `SOURCE_NOT_AVAILABLE` (5.1) | 6.5, 6.4, 6.5 |
| No delta (1.10), no report link (1.8 / 1.10), empty Share slot (1.10, 5.5) | 2.6, 3.5, 7.1 |

---

## Placeholders, formatting, cross-references

- `{{…}}` placeholders: 0; HTML comments: 0. Intentional `[ASSUMPTION]` / `TBD` markers remain (gathered in Story 7.4's checklist).
- Every cross-reference to a renumbered story (Epic 2, 5 and 6) was updated, including the Epic 3–7 overviews; the Epic List and FR Coverage Map name epics only, so they needed no change.

## Open items

None from the 20-item list. `status` stays `draft` until the user selects [C].

---
title: 'Story 7.4b: Restore runbook, monthly reminder and launch checklist'
type: 'feature'
created: '2026-11-23'
status: 'done'
baseline_commit: 'de3d358'
route: 'oneshot'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The backup and drill scripts (7.4a) have no written procedure, nothing reminds the owner to drill each month, and there is no single list of what must be decided and built before the public launch.

**Approach:** From Story 7.4, last three Givens: `deploy/RUNBOOK-restore.md` (the monthly drill and a real recovery onto a new VPS, RPO 24 h and RTO about 2 h, the error-budget source, a drill log), a scheduled GitHub Actions workflow that opens a "Monthly restore drill" issue, and `deploy/LAUNCH-CHECKLIST.md` with every item tagged [OWNER] or [ENG]. The checklist records owner answers or "open · blocks launch" and never decides an owner item.

</frozen-after-approval>

## Implementation Notes

Implemented directly. New: `deploy/RUNBOOK-restore.md`, `deploy/LAUNCH-CHECKLIST.md`, `deploy/bank-counts.sql` (the one admin query for the published Kerala PSC bank: total, topics with 10 or more, per-topic breakdown), `.github/workflows/monthly-restore-drill.yml` (cron `0 3 1 * *`, `issues: write`, skips if one is already open) and `deploy/launch-docs.test.mjs` (runs in CI's existing `node --test deploy/*.test.mjs` step: every checklist item is tagged and has an answer or evidence, no owner item is ever checked by the checklist, the story's topics are all present, the runbook has the targets, both procedures and the drill log, the workflow has the cron and the issue title). The runbook's real-recovery step (`pg_restore --clean --if-exists` into a fresh init-scripted database so each object keeps its `core` or `ratings` owner) is exercised by a new section of `deploy/backup-drill-e2e.sh`, which now seeds tables under the service roles and checks the owner and that the `core` login can read the data. Honest state of the checklist: every owner item is open · blocks launch; the only [ENG] item checked is the error-budget source in the runbook; everything else needs the VPS, the domain or an account. Not done here: the first drill on the VPS (the drill log is empty), and the e2e addition has not run locally (Docker denied), so CI is its first run.

## Review Triage Log

Inline review by the implementer (not independent; no reviewer subagents were launched).

| Finding | Verdict | Evidence / route |
|---|---|---|
| The recovery steps in the runbook were never run against the real compose stack, only against a Postgres container with the same init scripts | medium | the owner's first real drill and a rehearsal on a spare VPS cover it; the e2e step proves the restore and ownership logic |
| `bank-counts.sql` assumes `content_category = 'KERALA_PSC'` is the launch bank and the latest published version counts | low | matches the schema and the story's wording; adjust if the owner counts differently |
| The checklist's "Last reviewed" date goes stale | low | update it when items change |
| The monthly issue link uses a relative `../blob/main/...` path | low | GitHub resolves it from an issue; correct it if it does not |

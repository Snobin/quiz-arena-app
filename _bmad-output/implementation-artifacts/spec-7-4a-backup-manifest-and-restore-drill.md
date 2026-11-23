---
title: 'Story 7.4a: Backup manifest and restore drill'
type: 'feature'
created: '2026-11-23'
status: 'done'
baseline_commit: 'cc1ad55'
route: 'oneshot'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** There is no nightly backup (Story 1.2 part 2 is still open) and no way to prove a dump can be restored, so a lost server could be the end of the product.

**Approach:** From Story 7.4, first two Givens, with the backup itself included (owner decision A, 2026-11-23): `deploy/backup.sh` dumps the database at one snapshot, writes a manifest (UTC time, size, SHA-256, row counts of every table in `core` and `ratings`), uploads both to Cloudflare R2 and, only on success, calls the uptime monitor's heartbeat URL; `deploy/restore-drill.sh [dump-name]` downloads the latest or a named dump, checks the checksum, restores into a throwaway 512 MB `postgres-restore` container with no network, compares every table's count with the manifest, runs a smoke query per schema, prints the elapsed time and removes everything, exiting non-zero and naming the failure otherwise. The runbook, monthly reminder workflow and launch checklist are 7.4b in `deferred-work.md`. The real deploy (Story 1.2 part 2) stays open.

</frozen-after-approval>

## Implementation Notes

Implemented directly. `deploy/postgres/snapshot-dump.sh` runs inside the container: a coprocess `psql` exports a snapshot, counts every `core` and `ratings` table in it, and `pg_dump --snapshot` dumps the same snapshot, so counts and dump agree even under live writes. `deploy/backup.sh` (cron on the VPS) copies the dump out, writes `<name>.manifest.json` (one table per line), uploads dump then manifest with the AWS CLI against the R2 endpoint, removes the local copies, then calls the heartbeat (`curl`); any step failing exits non-zero without the heartbeat. `deploy/restore-drill.sh` supports `DRILL_SOURCE_DIR` for a local source, uses `--network none` for the throwaway container, restores with `pg_restore --no-owner --no-acl`, and cleans up in a trap. R2 and heartbeat keys are in `deploy/.env.example`. Tests: `deploy/backup.test.mjs` (stub commands, no Docker; runs in CI's existing node check-script step) and `deploy/backup-drill-e2e.sh` (real Postgres 18: seeds rows, backs up, drills the good dump, then proves a corrupted dump fails on the checksum and a tampered manifest on the row counts), run by a new `backup-drill` CI job. Docker is denied in this environment, so the e2e script and the real `pg_dump`, `pg_restore` and snapshot behaviour could not be run here; CI is the first real run. Not done: scheduling the cron entry, creating the R2 bucket and keys, the uptime monitor's heartbeat, remote retention of old dumps, and the first drill on the VPS; those are the owner's and go into the 7.4b runbook and checklist. Still open as an [ENG] item for the checklist: Story 1.2 part 2.

## Review Triage Log

Inline review by the implementer (not independent; no reviewer subagents were launched).

| Finding | Verdict | Evidence / route |
|---|---|---|
| The real dump, snapshot coprocess and restore are untested locally | medium | the `backup-drill` CI job runs them against Postgres 18; fix there if it fails |
| `pg_restore` may report harmless errors on a fresh database (for example existing `public` schema) and fail the drill | medium | `--exit-on-error` was left off, but a non-zero exit still fails; the CI run will show it |
| Old dumps are never deleted from R2 | low | set an R2 lifecycle rule; noted for the 7.4b checklist |
| The drill and backup need `aws` and `docker` on the VPS host | low | for the 7.4b runbook's prerequisites |
| `.env` is sourced as shell, so a value with spaces or `$` must be quoted | low | same convention as the other deploy scripts; noted in the runbook later |

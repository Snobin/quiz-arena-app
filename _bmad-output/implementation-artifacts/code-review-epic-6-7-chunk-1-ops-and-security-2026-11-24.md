# Code review: Epics 6 and 7, chunk 1 of 5 (ops and security)

- **Date:** 2026-11-24
- **Range:** `e1c8739^..3822898` on the public repo (Epic 6 story 6.1 to the Epic 7 retro merge, 45 commits); this chunk is the
  27 files under `deploy/`, `.github/`, `contracts/.../metrics/` and each service's `MetricsConfiguration` (2,515 diff lines).
- **Mode:** full. Spec: stories 7.3a, 7.3c, 7.4a, 7.4b.
- **Layers:** Blind Hunter, Edge Case Hunter, Verification Gap Reviewer, Acceptance Auditor (independent subagents). None failed.
- **Triage:** every claim was checked against the code at the end of the range, including the Micrometer OTLP bytecode (`javap`)
  and a name-by-name comparison of dashboard and alert metrics with the meters the services register.
- **Already fixed since this range:** `backup.sh` and `restore-drill.sh` sourced `deploy/.env` as shell (`. ./.env`); replaced by
  the data-only loader `deploy/load-env.sh` in PR #104.

Result: **1 decision-needed (resolved, became a patch), 11 patch, 1 defer, 18 rejected** (the rejected entries each group one or more reviewer claims).

### Review Findings

#### Decision needed
- [x] [Review][Decision] Off-site backups are plaintext personal data (medium) — RESOLVED 2026-11-24 by the owner: accept R2 server-side encryption plus access keys and document it (now the last patch below). Original finding: — `backup.sh` uploads the full dump (user emails, ratings) to R2 unencrypted; the only protection is R2's own at-rest encryption and the bucket's access keys. Options: accept R2 server-side encryption and record that in the DPDP checklist item; or encrypt the dump before upload (`age` or `gpg`), which adds a key to store and a decrypt step to the restore runbook and drill. [deploy/backup.sh]

#### Patch
- [ ] [Review][Patch] HIGH: the three "no metrics" alerts fire while the services are healthy. Rule A is an instant `absent_over_time(...)`, which returns an empty result when metrics are present; Grafana reads that as NoData and `noDataState` is `Alerting`. When metrics are absent it returns 1, which also fires. Set `noDataState` to `OK` on `minnal-nometrics-*` and assert it in `grafana.test.mjs`. [deploy/grafana/alerts.json]
- [ ] [Review][Patch] HIGH: the dead-letter alert can never fire and its Health panel is always empty. `minnal.deadletter` is only a Valkey stream name; no meter has that name. The rule is `sum(increase(minnal_deadletter_total)) + sum(increase(minnal_stream_deadletter_total))`, and in PromQL an empty operand makes the whole sum empty. Use `minnal_stream_deadletter_total` alone (it is registered at construction, so `increase` works from the first dead letter), fix `health.json` the same way, and add a test that fails when a metric named in a dashboard or alert is not registered by any service. [deploy/grafana/alerts.json, deploy/grafana/dashboards/health.json]
- [ ] [Review][Patch] MEDIUM: under cron, `backup.sh` and `restore-drill.sh` can not find `aws` (`/usr/local/bin`, `/snap/bin`). Cron's default `PATH` is `/usr/bin:/bin`; neither script nor the runbook's crontab example sets one, and a manual test run in a login shell passes. Set `PATH` in the crontab example and extend it in the scripts. [deploy/backup.sh, deploy/restore-drill.sh, deploy/RUNBOOK-restore.md]
- [ ] [Review][Patch] MEDIUM: an empty `BACKUP_HEARTBEAT_URL` silently skips the heartbeat and the script still prints "ok" and exits 0. `.env.example` ships it empty, so without a monitor a failed night raises no alert (the heartbeat is the only dead-man's switch). Print a warning to stderr when uploads are on and the URL is empty. [deploy/backup.sh]
- [ ] [Review][Patch] MEDIUM: dumps and manifests are written under the default umask into a `mkdir -p` directory, so any local user can read the full database until it is uploaded (or for good, if the upload fails). Add `umask 077` and `mkdir -p -m 700`. [deploy/backup.sh]
- [ ] [Review][Patch] MEDIUM: nothing asserts that the log-flood throttle is installed in a service. Deleting `PushFailureThrottle.install()` from any `MetricsConfiguration` leaves every test green. Assert in each service's `MetricsConfigurationTest.Local` that the Logback turbo-filter list contains a `PushFailureThrottle`. [services/*/…/MetricsConfigurationTest.java]
- [ ] [Review][Patch] LOW: `hasAnOtlpRegistryWithAMinuteStep` only asserts that one `OtlpMeterRegistry` bean exists; it never reads the step and never activates the `prod` profile, so changing `step: 60s` or breaking the `${GRAFANA_OTLP_URL:}` binding stays green. Assert the step and add a `prod`-profile test. [services/*/…/MetricsConfigurationTest.java]
- [ ] [Review][Patch] LOW: `GRAFANA_OTLP_URL` and `GRAFANA_OTLP_AUTHORIZATION` passthrough in `compose.yaml` is not tested; removing the two lines passes `check-compose` and the services simply stop pushing. Add them to the env-passthrough test. [deploy/check-compose.test.mjs]
- [ ] [Review][Patch] LOW: the drill's R2 path (`aws s3 ls | awk '{print $4}' | grep … | tail`, then `aws s3 cp`) is never run by any test; `backup-drill-e2e.sh` always sets `DRILL_SOURCE_DIR`. Add an `AWS_CMD`-stub test in the style of `backup.test.mjs`. [deploy/restore-drill.sh]
- [ ] [Review][Patch] LOW: the manifest row-count `sed` accepts only `[a-z_]` in schema and table names. No current table has a digit or uppercase letter, but a future `rating_v2` would make the drill fail with a false "row counts differ". Widen to `[a-z0-9_]`. [deploy/restore-drill.sh]

- [ ] [Review][Patch] LOW (from the decision above): record in the DPDP item of `deploy/LAUNCH-CHECKLIST.md` that the off-site dumps rely on R2 server-side encryption and the bucket's access keys, with no client-side encryption. [deploy/LAUNCH-CHECKLIST.md]

#### Defer
- [x] [Review][Defer] The monthly restore-drill reminder stops after 60 days without repo activity (GitHub disables scheduled workflows), and an ignored open issue suppresses all later reminders, with no label, comment or escalation. [.github/workflows/monthly-restore-drill.yml] — deferred: matters only once the owner runs the monthly drill unattended; add a label and a comment on the open issue then.

#### Rejected
- `false` Acceptance Auditor: "prod push config and the 60 s step are not in the diff" — they exist at the end of the range: `micrometer-registry-otlp` in all three poms, `management.metrics.tags.service`, `step: 60s` and `enabled: false` in `application.yaml`, `url`/`Authorization` bindings in `application-prod.yaml`. They are outside this chunk's diff (an artifact of chunking).
- `false` Acceptance Auditor: "the `type`/`opponent` tag renames and the percentile histograms are missing" — the only tag keys used in main code are `kind` and `mode`; `minnal.session.matches` and `minnal.match.broadcast.lag` publish histograms.
- `false` Blind Hunter: "`snapshot-dump.sh` can return partial counts and still succeed" — the exported snapshot lives only while the exporting `psql` transaction does; if `psql` dies, `pg_dump --snapshot` fails and the script exits non-zero.
- `false` Edge Case Hunter and Verification Gap: "`isWarnEnabled()` guards burn the throttle window" — `OtlpMeterRegistry` (micrometer-registry-otlp 1.17.2) calls `warn(String, Throwable)` directly; the bytecode has no `isWarnEnabled` calls.
- `false` Edge Case Hunter: "the first dead letter never alerts because the counter appears at 1" — `minnal.stream.deadletter` is built in the `StreamConsumer` constructor, so it exports 0 from startup (the real defect is the other operand, above).
- `low` `MinnalMeterFilter` room-code pattern matches any 6-letter uppercase value without I/L/O/0/1 (for example `DEGREE`, `MEMBER`). Not reachable today: the only tag keys used are `kind` and `mode`, whose values never match. Requiring the hyphen would weaken the filter for bare codes; revisit if an `examLevel` or `role` tag is added.
- `low` `MinnalMeterFilter` email pattern `.+@.+` is loose; no tag value contains `@` today.
- `low` Throttle covers every WARN/ERROR in the OTLP package and shares one window; a different error within 10 minutes of a push failure is hidden. Negligible.
- `low` Throttle could be removed if logging is re-initialised after the bean runs; Spring Boot initialises logging once, before the context.
- `low` An empty `GRAFANA_OTLP_URL` with the prod profile: the registry fails to publish and logs a (throttled) warning; the service does not fail. Matches the spec's "fails quietly".
- `low` Three copies of `MetricsConfiguration`: by design, since `contracts` carries no Spring code and services may not depend on each other.
- `low` Restore drill takes the newest dump with no freshness check; the heartbeat covers stopped backups, the drill covers restorability.
- `low` Restore drill: a name like `minnal-../x.dump` or a relative `DRILL_SOURCE_DIR` (resolved after `cd deploy/`); owner-run CLI and CI only.
- `low` Restore drill uses `postgres:18` and `--no-owner --no-acl`; `DRILL_IMAGE` overrides it and the real recovery path is covered by `backup-drill-e2e.sh`.
- `low` `backup.sh`: a mistyped `BACKUP_UPLOAD` silently skips the upload; a failed night leaves local files and no pruning; an orphan dump if only the manifest upload fails (upload order is fixed by the 7.4a spec, so changing it edits the spec).
- `low` Alert tuning: no traffic floor on the 5xx alert, the heap panel's fixed 384 MB line versus the alert's ratio, and `${PROM_DS_UID}`/`${ALERT_EMAIL}` left unreplaced at import (the README describes the import step).
- `low` Test and doc hygiene: `grafana.test.mjs` title says five rules but checks seven; `launch-docs.test.mjs` accepts an empty "Answer:"; "scripts merged in PR #100" and a hard-coded review date in the checklist; the CI `backup-drill` job pulls unpinned `postgres:18`; only one alert email address.
- `low` AC2 hygiene test registers one synthetic meter instead of listing real ones; the filter is unit-tested for every pattern in `contracts` and the service tests prove it is wired.

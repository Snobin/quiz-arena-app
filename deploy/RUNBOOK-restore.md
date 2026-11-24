# Restore runbook (Story 7.4b)

Targets [ASSUMPTION]: **RPO 24 h** (the nightly backup, so at most a day of play is lost) and **RTO about 2 h** (a lost server back up on a new VPS). Leaderboards rebuild from Postgres; Valkey holds nothing that cannot be rebuilt or lost (live matches, queues, rate-limit counters).

What exists: `deploy/backup.sh` (nightly, from cron on the VPS) writes `minnal-<UTC stamp>.dump` and `.manifest.json` to the R2 bucket under `postgres/`, then calls the uptime monitor's heartbeat. `deploy/restore-drill.sh` proves a dump restores. Both read their settings from `deploy/.env` (`R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BACKUP_HEARTBEAT_URL`).

## Prerequisites on the VPS

Docker with the Compose plugin, the AWS CLI (`aws`, used against the R2 endpoint), `curl`, and a checkout of this repository at the path cron uses (for example `/opt/minnal`) with a filled `deploy/.env`. One-time:

```
crontab -e
PATH=/usr/local/bin:/usr/bin:/bin
15 2 * * *  /opt/minnal/deploy/backup.sh >> /var/log/minnal-backup.log 2>&1
```

Set an R2 lifecycle rule to expire old dumps (for example after 35 days; nothing deletes them otherwise). Create the heartbeat check in the uptime monitor and set it to alert when silent for **26 h**. Quote any `.env` value that has spaces or `$`, because the scripts source the file as shell.

## Monthly drill

GitHub opens a "Monthly restore drill" issue on the 1st. On the VPS:

1. `cd /opt/minnal && git pull`
2. `deploy/restore-drill.sh` (the latest dump) or `deploy/restore-drill.sh minnal-<stamp>.dump`.
3. It must end with `restore-drill: OK in <n> s`. It checks the SHA-256, restores into a throwaway `postgres-restore` container (512 MB, no network) and compares every table's row count with the manifest, then runs a smoke query per schema. It removes the container and the downloaded files, and never touches production.
4. Add a row to the **Drill log** below, then close the issue.

If it fails, the message names what failed (`checksum mismatch`, `row counts differ from the manifest`, `pg_restore reported errors`, a failed download). A failed drill is an incident: fix it, take a fresh backup with `deploy/backup.sh`, and drill again the same day.

## Real recovery onto a new VPS

Use the newest good dump. Expect at most 24 h of lost data.

1. **Provision** a new VPS (the same plan as production; see the launch checklist) with Docker, the Compose plugin and the AWS CLI. Check out this repository and copy the old `deploy/.env` from your password manager (it holds the database passwords, the JWT signing key and the R2 keys; the database passwords must be the ones the dump's roles expect, or any new values, because step 3 recreates the roles from `.env`).
2. **Bring the stack up with an empty database:** `docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --wait postgres valkey`. On first start the init script creates the `core` and `ratings` logins and schemas from `.env`.
3. **Fetch and restore the dump:**
   ```
   cd deploy
   set -a; . ./.env; set +a
   export AWS_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY AWS_DEFAULT_REGION=auto
   aws s3 ls --endpoint-url "$R2_ENDPOINT" "s3://$R2_BUCKET/postgres/" | tail
   aws s3 cp --endpoint-url "$R2_ENDPOINT" "s3://$R2_BUCKET/postgres/minnal-<stamp>.dump" .
   aws s3 cp --endpoint-url "$R2_ENDPOINT" "s3://$R2_BUCKET/postgres/minnal-<stamp>.manifest.json" .
   sha256sum minnal-<stamp>.dump   # must equal "sha256" in the manifest
   docker compose -f compose.yaml --env-file .env cp minnal-<stamp>.dump postgres:/tmp/restore.dump
   docker compose -f compose.yaml --env-file .env exec -T postgres pg_restore -U postgres -d minnal --clean --if-exists /tmp/restore.dump
   ```
   `--clean --if-exists` replaces the empty schemas the init script made; the dump restores each object with its owner (`core`, `ratings`), so the services can use it.
4. **Verify against the manifest:** the table counts should equal the manifest's `rowCounts` (the drill's query does exactly this).
5. **Start everything:** `docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --wait`. Flyway sees its history in the restored schemas and does nothing.
6. **Point DNS** (the API subdomain) at the new VPS and wait for the TLS certificate. The PWA on Cloudflare Pages needs no change.
7. **Verify:** sign in on a phone, play a Quick Match, open `/r/<code>` and `/q` links, open `/admin` as the admin, check the Launch dashboard receives metrics, and confirm the external `/health` ping is green. Leaderboards rebuild from `match_record` on start.
8. **Afterwards:** run `deploy/backup.sh` once by hand, re-create the cron entry, and write the incident down.

## Error budget

99.5% monthly uptime allows about **3 h 36 min** of downtime a month [ASSUMPTION]. The month's remaining budget is read from the **uptime monitor's monthly report**. When a month's budget is spent, feature work pauses for reliability work until the next month [ASSUMPTION: freeze policy, owner to accept in the launch checklist].

## Drill log

| Date (UTC) | Dump | Duration | Result | By |
|---|---|---|---|---|
| _none yet: the first drill on the VPS is an open item in the launch checklist_ | | | | |

#!/usr/bin/env bash
# Nightly Postgres backup (Story 7.4a, NFR9). Run from cron on the VPS, for example:
#   15 2 * * *  /opt/minnal/deploy/backup.sh >> /var/log/minnal-backup.log 2>&1
# It dumps the whole database at one snapshot, writes a manifest beside the dump (UTC time, size, SHA-256, row counts of every
# table in the `core` and `ratings` schemas), uploads both to Cloudflare R2 and, only on success, calls the uptime monitor's
# heartbeat URL, so a night without a backup raises an alert (set the monitor to alert after 26 h).
# Settings come from deploy/.env: R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, BACKUP_HEARTBEAT_URL.
# Overrides (tests and CI): PG_EXEC (the command prefix that runs a command in the postgres container), BACKUP_DIR,
# BACKUP_UPLOAD=off, AWS_CMD, CURL_CMD.
set -euo pipefail
cd "$(dirname "$0")"

if [ -f .env ] && [ -z "${BACKUP_SKIP_ENV:-}" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

PG_EXEC=${PG_EXEC:-docker compose -f compose.yaml --env-file .env exec -T postgres}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/minnal}
AWS_CMD=${AWS_CMD:-aws}
CURL_CMD=${CURL_CMD:-curl}
UPLOAD=${BACKUP_UPLOAD:-on}

stamp=$(date -u +%Y%m%dT%H%M%SZ)
name=minnal-$stamp
dump=$BACKUP_DIR/$name.dump
manifest=$BACKUP_DIR/$name.manifest.json
counts=$BACKUP_DIR/$name.counts.tmp
mkdir -p "$BACKUP_DIR"

fail() { echo "backup: $*" >&2; rm -f "$counts"; exit 1; }
trap 'rm -f "$counts"' EXIT

# 1. Dump and row counts from one snapshot, inside the container, then copy the dump out.
# shellcheck disable=SC2086
$PG_EXEC bash -s -- "/tmp/$name.dump" < postgres/snapshot-dump.sh > "$counts" || fail "pg_dump or the row counts failed"
# shellcheck disable=SC2086
$PG_EXEC cat "/tmp/$name.dump" > "$dump" || fail "could not copy the dump out of the container"
# shellcheck disable=SC2086
$PG_EXEC rm -f "/tmp/$name.dump" || true
[ -s "$dump" ] || fail "the dump is empty"
[ -s "$counts" ] || fail "no row counts: the core and ratings schemas were not found"

# 2. The manifest: UTC time, size, SHA-256 and every table's row count, one table per line.
size=$(wc -c < "$dump" | tr -d ' ')
sha=$(sha256sum "$dump" | cut -d' ' -f1)
{
  printf '{\n  "dump": "%s",\n  "createdAtUtc": "%s",\n  "sizeBytes": %s,\n  "sha256": "%s",\n  "rowCounts": {\n' \
    "$name.dump" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$size" "$sha"
  awk -F'\t' 'NF == 2 { lines[++n] = sprintf("    \"%s\": %s", $1, $2) } END { for (i = 1; i <= n; i++) printf "%s%s\n", lines[i], (i < n ? "," : "") }' "$counts"
  printf '  }\n}\n'
} > "$manifest"

# 3. Off-site, then the heartbeat.
if [ "$UPLOAD" = "on" ]; then
  : "${R2_ENDPOINT:?set R2_ENDPOINT in deploy/.env}" "${R2_BUCKET:?set R2_BUCKET in deploy/.env}"
  : "${R2_ACCESS_KEY_ID:?set R2_ACCESS_KEY_ID in deploy/.env}" "${R2_SECRET_ACCESS_KEY:?set R2_SECRET_ACCESS_KEY in deploy/.env}"
  export AWS_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY AWS_DEFAULT_REGION=auto
  for file in "$dump" "$manifest"; do
    $AWS_CMD s3 cp --endpoint-url "$R2_ENDPOINT" "$file" "s3://$R2_BUCKET/postgres/$(basename "$file")" || fail "upload of $(basename "$file") failed"
  done
  rm -f "$dump" "$manifest"
  if [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then
    $CURL_CMD -fsS -m 20 --retry 3 -o /dev/null "$BACKUP_HEARTBEAT_URL" || fail "the heartbeat call failed"
  fi
fi
echo "backup: $name ok ($size bytes, sha256 $sha)"

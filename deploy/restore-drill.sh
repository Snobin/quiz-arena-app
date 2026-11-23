#!/usr/bin/env bash
# Restore drill (Story 7.4a, NFR9). Run on the VPS, so production data never leaves it:
#   deploy/restore-drill.sh [dump-name]        (the latest dump when no name is given; a name is `minnal-<stamp>.dump`)
# It downloads the dump and its manifest from R2, checks the SHA-256, restores into a throwaway `postgres-restore`
# container (512 MB, no network, so no service can reach it), compares every table's row count with the manifest,
# runs a smoke query per schema, prints the elapsed time, and removes the container and the downloaded files.
# Production is never touched. Any failure exits non-zero and names what failed.
# Settings: R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (deploy/.env). Overrides (tests and CI):
# DRILL_SOURCE_DIR (read the dump from a folder instead of R2), AWS_CMD, DOCKER_CMD.
set -euo pipefail
cd "$(dirname "$0")"

if [ -f .env ] && [ -z "${BACKUP_SKIP_ENV:-}" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

AWS_CMD=${AWS_CMD:-aws}
DOCKER=${DOCKER_CMD:-docker}
CONTAINER=postgres-restore
IMAGE=${DRILL_IMAGE:-postgres:18}
started=$(date +%s)
work=$(mktemp -d)

cleanup() {
  $DOCKER rm -f "$CONTAINER" > /dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
fail() { echo "restore-drill: FAILED: $*" >&2; exit 1; }

export AWS_DEFAULT_REGION=auto
if [ -z "${DRILL_SOURCE_DIR:-}" ]; then
  : "${R2_ENDPOINT:?set R2_ENDPOINT in deploy/.env}" "${R2_BUCKET:?set R2_BUCKET in deploy/.env}"
  : "${R2_ACCESS_KEY_ID:?set R2_ACCESS_KEY_ID in deploy/.env}" "${R2_SECRET_ACCESS_KEY:?set R2_SECRET_ACCESS_KEY in deploy/.env}"
  export AWS_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY
fi

# 1. Which dump, and fetch it with its manifest.
name=${1:-}
if [ -z "$name" ]; then
  if [ -n "${DRILL_SOURCE_DIR:-}" ]; then
    name=$(cd "$DRILL_SOURCE_DIR" && ls -1 minnal-*.dump 2> /dev/null | sort | tail -n 1 || true)
  else
    name=$($AWS_CMD s3 ls --endpoint-url "$R2_ENDPOINT" "s3://$R2_BUCKET/postgres/" | awk '{print $4}' | grep -E '^minnal-.*\.dump$' | sort | tail -n 1 || true)
  fi
  [ -n "$name" ] || fail "no dump found"
fi
case "$name" in minnal-*.dump) ;; *) fail "the dump name must look like minnal-<stamp>.dump, got $name" ;; esac
base=${name%.dump}
echo "restore-drill: using $name"
for file in "$name" "$base.manifest.json"; do
  if [ -n "${DRILL_SOURCE_DIR:-}" ]; then
    cp "$DRILL_SOURCE_DIR/$file" "$work/$file" || fail "cannot read $file"
  else
    $AWS_CMD s3 cp --endpoint-url "$R2_ENDPOINT" "s3://$R2_BUCKET/postgres/$file" "$work/$file" > /dev/null || fail "download of $file failed"
  fi
done

# 2. Checksum.
expected=$(sed -n 's/.*"sha256": "\([0-9a-f]*\)".*/\1/p' "$work/$base.manifest.json")
actual=$(sha256sum "$work/$name" | cut -d' ' -f1)
[ -n "$expected" ] || fail "the manifest has no sha256"
[ "$expected" = "$actual" ] || fail "checksum mismatch for $name (manifest $expected, file $actual)"
echo "restore-drill: checksum ok"

# 3. A throwaway Postgres: 512 MB, no network.
$DOCKER rm -f "$CONTAINER" > /dev/null 2>&1 || true
$DOCKER run -d --name "$CONTAINER" --memory 512m --network none -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=minnal "$IMAGE" > /dev/null \
  || fail "could not start the $CONTAINER container"
ready=0
for _ in $(seq 1 60); do
  # TCP on loopback passes only once the init server has restarted as the real one.
  if $DOCKER exec "$CONTAINER" pg_isready -h 127.0.0.1 -U postgres -d minnal > /dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" = 1 ] || fail "the $CONTAINER container did not become ready"

# 4. Restore.
$DOCKER cp "$work/$name" "$CONTAINER:/tmp/restore.dump" > /dev/null || fail "could not copy the dump into $CONTAINER"
$DOCKER exec "$CONTAINER" pg_restore -U postgres -d minnal --no-owner --no-acl /tmp/restore.dump \
  || fail "pg_restore reported errors"
echo "restore-drill: restored"

# 5. Every table's row count against the manifest.
query="SELECT table_schema || '.' || table_name || E'\t' || (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_schema IN ('core', 'ratings') AND table_type = 'BASE TABLE' ORDER BY 1"
$DOCKER exec "$CONTAINER" psql -X -A -t -U postgres -d minnal -c "$query" | sort > "$work/restored.counts" || fail "could not count the restored rows"
sed -n 's/^ *"\([a-z_]*\.[a-z_]*\)": \([0-9]*\),\{0,1\}$/\1\t\2/p' "$work/$base.manifest.json" | sort > "$work/manifest.counts"
[ -s "$work/manifest.counts" ] || fail "the manifest lists no row counts"
if ! diff -u "$work/manifest.counts" "$work/restored.counts" > "$work/counts.diff"; then
  cat "$work/counts.diff" >&2
  fail "row counts differ from the manifest"
fi
echo "restore-drill: row counts match the manifest ($(wc -l < "$work/manifest.counts" | tr -d ' ') tables)"

# 6. A smoke query per schema.
smoke() {
  $DOCKER exec "$CONTAINER" psql -X -A -t -U postgres -d minnal -c "$2" || fail "smoke query failed: $1"
}
published=$(smoke "published questions" "SELECT count(*) FROM core.question_version WHERE status = 'PUBLISHED'")
users=$(smoke "users" "SELECT count(*) FROM core.app_user")
ratings=$(smoke "rating rows" "SELECT count(*) FROM ratings.rating")
echo "restore-drill: smoke ok: $published published question versions, $users users, $ratings rating rows"

echo "restore-drill: OK in $(( $(date +%s) - started )) s"

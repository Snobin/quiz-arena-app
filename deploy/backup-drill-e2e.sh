#!/usr/bin/env bash
# End-to-end check of backup.sh and restore-drill.sh against a real Postgres 18 (Story 7.4a). Needs Docker; CI runs it.
# Seeds a small database, takes a backup (no R2), restores it in the drill, then proves the drill fails on a corrupted dump
# and on a tampered row count.
set -euo pipefail
cd "$(dirname "$0")"

PG=ci-postgres
work=$(mktemp -d)
cleanup() { docker rm -f "$PG" postgres-restore > /dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
docker rm -f "$PG" postgres-restore > /dev/null 2>&1 || true

docker run -d --name "$PG" -e POSTGRES_PASSWORD=ci -e POSTGRES_DB=minnal -e CORE_DB_PASSWORD=core -e RATINGS_DB_PASSWORD=ratings \
  -v "$PWD/postgres/init:/docker-entrypoint-initdb.d:ro" postgres:18 > /dev/null
for _ in $(seq 1 60); do
  docker exec "$PG" pg_isready -h 127.0.0.1 -U postgres -d minnal > /dev/null 2>&1 && break
  sleep 1
done
docker exec "$PG" pg_isready -h 127.0.0.1 -U postgres -d minnal > /dev/null

docker exec -i "$PG" psql -X -q -U postgres -d minnal -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE core.app_user (id int PRIMARY KEY, email text);
CREATE TABLE core.question_version (id int PRIMARY KEY, status text NOT NULL);
CREATE TABLE ratings.rating (id int PRIMARY KEY, value int NOT NULL);
CREATE TABLE ratings.match_record (id int PRIMARY KEY);
INSERT INTO core.app_user SELECT g, 'u' || g || '@example.com' FROM generate_series(1, 7) g;
INSERT INTO core.question_version SELECT g, CASE WHEN g <= 40 THEN 'PUBLISHED' ELSE 'DRAFT' END FROM generate_series(1, 50) g;
INSERT INTO ratings.rating SELECT g, 1200 + g FROM generate_series(1, 7) g;
SQL

export PG_EXEC="docker exec -i $PG" BACKUP_DIR="$work/backups" BACKUP_UPLOAD=off BACKUP_SKIP_ENV=1
./backup.sh
ls -1 "$BACKUP_DIR"
cat "$BACKUP_DIR"/*.manifest.json

echo "--- drill on the good dump"
DRILL_SOURCE_DIR=$BACKUP_DIR ./restore-drill.sh

echo "--- drill on a corrupted dump must fail on the checksum"
mkdir "$work/corrupt"
cp "$BACKUP_DIR"/* "$work/corrupt/"
printf 'x' >> "$work"/corrupt/minnal-*.dump
if DRILL_SOURCE_DIR=$work/corrupt ./restore-drill.sh > "$work/out.txt" 2>&1; then echo "the corrupted dump passed the drill"; exit 1; fi
grep -q "checksum mismatch" "$work/out.txt" || { cat "$work/out.txt"; echo "no checksum message"; exit 1; }

echo "--- drill with a tampered manifest count must fail on the row counts"
mkdir "$work/tamper"
cp "$BACKUP_DIR"/* "$work/tamper/"
sed -i 's/"core.app_user": 7/"core.app_user": 8/' "$work"/tamper/*.manifest.json
if DRILL_SOURCE_DIR=$work/tamper ./restore-drill.sh > "$work/out2.txt" 2>&1; then echo "the tampered manifest passed the drill"; exit 1; fi
grep -q "row counts differ" "$work/out2.txt" || { cat "$work/out2.txt"; echo "no row-count message"; exit 1; }

docker ps -a --format '{{.Names}}' | grep -q '^postgres-restore$' && { echo "the drill left its container behind"; exit 1; }
echo "backup and drill end-to-end: OK"

#!/usr/bin/env bash
# Runs INSIDE the postgres container (Story 7.4a): `docker compose exec -T postgres bash -s -- /tmp/x.dump < snapshot-dump.sh`.
# Writes a custom-format dump of the whole database to $1 and prints one `schema.table<TAB>rows` line per table of the
# `core` and `ratings` schemas on stdout. The counts and the dump read ONE exported snapshot, so they agree exactly even
# while players are writing; the restore drill compares them.
set -euo pipefail
out=${1:?usage: snapshot-dump.sh <dump path in the container>}
db=${POSTGRES_DB:-minnal}
user=${POSTGRES_USER:-postgres}

coproc SQL { psql -X -q -A -t -U "$user" -d "$db" -v ON_ERROR_STOP=1; }
trap 'echo "ROLLBACK;" >&"${SQL[1]}" 2>/dev/null || true' EXIT

echo "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;" >&"${SQL[1]}"
echo "SELECT 'SNAPSHOT ' || pg_export_snapshot();" >&"${SQL[1]}"
read -r -u "${SQL[0]}" tag snapshot
[ "$tag" = "SNAPSHOT" ] || { echo "snapshot-dump: no snapshot ($tag)" >&2; exit 1; }

cat >&"${SQL[1]}" <<'SQL'
SELECT 'COUNT ' || table_schema || '.' || table_name || E'\t'
    || (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text
FROM information_schema.tables
WHERE table_schema IN ('core', 'ratings') AND table_type = 'BASE TABLE'
ORDER BY table_schema, table_name;
SELECT 'DONE';
SQL
while read -r -u "${SQL[0]}" line; do
  [ "$line" = "DONE" ] && break
  printf '%s\n' "${line#COUNT }"
done

pg_dump -U "$user" -d "$db" --format=custom --snapshot="$snapshot" --file="$out"

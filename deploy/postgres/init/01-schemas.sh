#!/usr/bin/env bash
# Runs once, on first start with an empty data volume (docker-entrypoint-initdb.d).
# One login + one schema per service (AD-3). game-service has no schema or login.
# No grants across schemas.
set -euo pipefail

: "${CORE_DB_PASSWORD:?CORE_DB_PASSWORD must be set}"
: "${RATINGS_DB_PASSWORD:?RATINGS_DB_PASSWORD must be set}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set core_pw="$CORE_DB_PASSWORD" \
  --set ratings_pw="$RATINGS_DB_PASSWORD" \
  --set db="$POSTGRES_DB" <<'SQL'
-- Nobody but the owner may use or create objects in public.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;

CREATE ROLE core LOGIN PASSWORD :'core_pw';
CREATE ROLE ratings LOGIN PASSWORD :'ratings_pw';

GRANT CONNECT ON DATABASE :"db" TO core, ratings;

-- Each schema is owned by its own login; no other role gets any privilege on it.
CREATE SCHEMA core AUTHORIZATION core;
CREATE SCHEMA ratings AUTHORIZATION ratings;
REVOKE ALL ON SCHEMA core FROM PUBLIC;
REVOKE ALL ON SCHEMA ratings FROM PUBLIC;

ALTER ROLE core SET search_path = core;
ALTER ROLE ratings SET search_path = ratings;
SQL

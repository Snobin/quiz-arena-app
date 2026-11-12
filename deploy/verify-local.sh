#!/usr/bin/env bash
# Stack-level acceptance checks (Stories 1.1 and 1.4). Run after:
#   docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --wait
# Usage: bash deploy/verify-local.sh
#   BASE_URL defaults to http://localhost:<CADDY_HTTP_PORT> (from the environment, else deploy/.env, else 8080).
# Exit codes: 0 all checks passed, 1 a check failed, 2 setup problem (missing deploy/.env).
set -uo pipefail

cd "$(dirname "$0")"
if [ ! -f .env ]; then
  echo "deploy/.env is missing: run 'cp deploy/.env.example deploy/.env' and set the passwords." >&2
  exit 2
fi

# Read the port without sourcing .env (it is data, not a script).
env_port=$(sed -n 's/^CADDY_HTTP_PORT=//p' .env | tail -n1 | tr -d '[:space:]"'"'")
CADDY_HTTP_PORT="${CADDY_HTTP_PORT:-${env_port:-8080}}"
BASE_URL="${BASE_URL:-http://localhost:${CADDY_HTTP_PORT}}"
COMPOSE=(docker compose -f compose.yaml --env-file .env)
FAILURES=0
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n      %s\n' "$1" "$2"; FAILURES=$((FAILURES + 1)); }
check() { # name, condition-result (0 = ok), detail
  if [ "$2" -eq 0 ]; then pass "$1"; else fail "$1" "$3"; fi
}

# Logs are captured into a variable before grepping: `grep -q` closing a pipe early would trip pipefail.
logs_of() { "${COMPOSE[@]}" logs --no-log-prefix "$@" 2>/dev/null; }
# wait_for_log <fixed-string> <service...>: retries for up to 5 s (log shipping is asynchronous).
wait_for_log() {
  local needle="$1" logs i
  shift
  for i in $(seq 1 10); do
    logs=$(logs_of "$@")
    grep -qF -- "$needle" <<<"$logs" && return 0
    sleep 0.5
  done
  return 1
}
SERVICES=(core-service game-service ratings-service)
response_request_id() { grep -i '^x-request-id:' | awk '{print $2}' | tr -d '\r'; }

# 1. All six containers healthy
unhealthy=$("${COMPOSE[@]}" ps --format '{{.Service}} {{.Health}}' | grep -v ' healthy$' || true)
count=$("${COMPOSE[@]}" ps --format '{{.Service}}' | wc -l | tr -d ' ')
[ "$count" -eq 6 ] && [ -z "$unhealthy" ]; check "six containers healthy" $? "count=$count not-healthy: ${unhealthy:-none}"

# 2. GET /health -> 200 {"status":"UP"} from core
body=$(curl -s -o - -w '\n%{http_code}' "$BASE_URL/health")
[ "$(tail -n1 <<<"$body")" = "200" ] && [ "$(head -n1 <<<"$body")" = '{"status":"UP"}' ]
check "GET /health -> 200 {\"status\":\"UP\"}" $? "got: $(tr '\n' ' ' <<<"$body")"

# 3. /internal/** -> 404 at Caddy; no service ever sees it.
# Once Caddy has logged the request it is finished, so a service could no longer log it.
rid="verify-internal-$RANDOM$RANDOM"
code=$(curl -s -o /dev/null -w '%{http_code}' -H "X-Request-Id: $rid" "$BASE_URL/internal/anything")
wait_for_log "\"requestId\":\"$rid\"" caddy; caddy_saw=$?
service_hits=$(logs_of "${SERVICES[@]}" | grep -cF -- "$rid")
[ "$code" = "404" ] && [ "$caddy_saw" -eq 0 ] && [ "$service_hits" -eq 0 ]
check "GET /internal/anything -> 404 from Caddy, no service log line" $? "status=$code caddy-logged=$((1 - caddy_saw)) service-hits=$service_hits"

# Story 1.4: the real question-set endpoint is not reachable through Caddy either.
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -H 'X-Internal-Token: guess' -d '{"source":"BANK","filters":{"category":"KERALA_PSC"},"count":1,"requesterId":"x"}' \
  "$BASE_URL/internal/question-sets")
[ "$code" = "404" ]; check "POST /internal/question-sets through Caddy -> 404" $? "status=$code"

# 4. /actuator/** is not public
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/actuator/health")
[ "$code" = "404" ]; check "GET /actuator/health is not routed (404)" $? "status=$code"

# 5. Unknown API paths -> RFC 9457 ProblemDetail 404 (core and ratings)
for svc in core ratings; do
  body_file="$TMP_DIR/problem-$svc.json"
  out=$(curl -s -D - -o "$body_file" "$BASE_URL/api/$svc/v1/nope")
  status=$(head -n1 <<<"$out" | awk '{print $2}')
  ctype=$(grep -i '^content-type:' <<<"$out" | tr -d '\r' | awk '{print $2}')
  grep -q '"status":404' "$body_file" && [ "$status" = "404" ] && [[ "$ctype" == application/problem+json* ]]
  check "GET /api/$svc/v1/nope -> 404 application/problem+json" $? "status=$status type=$ctype body=$(cat "$body_file")"
done

# 6. Request id: Caddy generates one when absent (it appears in Caddy's access log, so it was not
#    invented by the service), forwards a valid one unchanged, and replaces a malformed one.
generated=$(curl -s -D - -o /dev/null "$BASE_URL/api/core/v1/nope" | response_request_id)
[ -n "$generated" ] \
  && wait_for_log "\"requestId\":\"$generated\"" caddy \
  && wait_for_log "\"requestId\":\"$generated\"" core-service
check "missing X-Request-Id -> Caddy generates one; Caddy and service logs carry it" $? "generated='$generated'"

rid="verify-$RANDOM$RANDOM"
echoed=$(curl -s -D - -o /dev/null -H "X-Request-Id: $rid" "$BASE_URL/api/ratings/v1/nope" | response_request_id)
[ "$echoed" = "$rid" ] && wait_for_log "\"requestId\":\"$rid\"" ratings-service
check "valid X-Request-Id forwarded unchanged and logged" $? "sent=$rid echoed=$echoed"

replaced=$(curl -s -D - -o /dev/null -H 'X-Request-Id: bad id"here' "$BASE_URL/api/core/v1/nope" | response_request_id)
[ -n "$replaced" ] && [ "$replaced" != 'bad id"here' ] \
  && wait_for_log "\"requestId\":\"$replaced\"" caddy \
  && wait_for_log "\"requestId\":\"$replaced\"" core-service
check "malformed X-Request-Id replaced at Caddy; edge and service ids match" $? "returned='$replaced'"

# 7. Service logs are structured JSON
for svc in "${SERVICES[@]}"; do
  nonjson=$(logs_of "$svc" | grep -v '^{' | grep -v '^Picked up JAVA_TOOL_OPTIONS' | grep -v '^$' | head -3)
  [ -z "$nonjson" ]; check "$svc log lines are JSON" $? "non-JSON: $nonjson"
done

# 8. Schema isolation: each login is denied the other schema; no game schema/login.
# Passwords are read with printenv inside the postgres container; they never pass through this shell.
psql_as() { # user, password-env-var, sql
  "${COMPOSE[@]}" exec -T postgres sh -c \
    'PGPASSWORD="$(printenv "$1")" psql -h 127.0.0.1 -U "$2" -d minnal -tAc "$3"' sh "$2" "$1" "$3" 2>&1
}
out=$(psql_as core CORE_DB_PASSWORD "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'core'; CREATE TABLE ratings.probe(id int);")
grep -q 'permission denied for schema ratings' <<<"$out"
check "core login cannot use the ratings schema" $? "$out"

out=$(psql_as ratings RATINGS_DB_PASSWORD "SELECT * FROM core.flyway_schema_history LIMIT 1;")
grep -q 'permission denied for schema core' <<<"$out"
check "ratings login cannot use the core schema" $? "$out"

out=$(psql_as core CORE_DB_PASSWORD "CREATE TABLE public.probe(id int);")
grep -q 'permission denied for schema public' <<<"$out"
check "core login cannot create in the public schema" $? "$out"

out=$(psql_as postgres POSTGRES_PASSWORD "SELECT (SELECT count(*) FROM pg_namespace WHERE nspname = 'game') + (SELECT count(*) FROM pg_roles WHERE rolname = 'game');")
[ "$(tr -d '[:space:]' <<<"$out")" = "0" ]; check "no game schema or login" $? "count=$out"

# Story 1.4's question-bank tables exist in core (later stories may add more); ratings has none yet.
out=$(psql_as postgres POSTGRES_PASSWORD "SELECT count(*) FROM pg_tables WHERE schemaname = 'core' AND tablename IN ('subject','topic','question','question_version');")
[ "$(tr -d '[:space:]' <<<"$out")" = "4" ]; check "core has the four question-bank tables" $? "found=$out"

out=$(psql_as postgres POSTGRES_PASSWORD "SELECT count(*) FROM pg_tables WHERE schemaname = 'ratings' AND tablename <> 'flyway_schema_history';")
[ "$(tr -d '[:space:]' <<<"$out")" = "0" ]; check "no ratings application tables" $? "count=$out"

# core-service received a real MINNAL_INTERNAL_TOKEN (else it boots healthy but logs this WARN and 401s every internal call).
token_warn=$(logs_of core-service | grep -cF 'MINNAL_INTERNAL_TOKEN) is not set')
[ "$token_warn" -eq 0 ]; check "core-service has MINNAL_INTERNAL_TOKEN set (no token-not-set WARN)" $? "warnings=$token_warn: set a non-placeholder MINNAL_INTERNAL_TOKEN in deploy/.env and recreate core-service"

# 9. Valkey AOF settings
aof=$("${COMPOSE[@]}" exec -T valkey sh -c 'export REDISCLI_AUTH="$VALKEY_PASSWORD"; valkey-cli CONFIG GET appendonly; valkey-cli CONFIG GET appendfsync' | tr '\n' ' ')
[[ "$aof" == *"appendonly yes"*"appendfsync everysec"* ]]
check "Valkey appendonly yes, appendfsync everysec" $? "got: $aof"

# 10. WebSocket upgrade at /ws: allowed origin -> 101 from game, foreign origin -> 403
ws_status() { # origin
  curl -s -i --http1.1 --max-time 3 \
    -H "Origin: $1" -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
    "$BASE_URL/ws" 2>/dev/null | head -n1 | tr -d '\r'
}
ws=$(ws_status http://localhost:5173)
[[ "$ws" == *" 101"* ]]; check "WebSocket /ws from http://localhost:5173 -> 101 Switching Protocols" $? "got: $ws"
ws=$(ws_status http://evil.example)
[[ "$ws" == *" 403"* ]]; check "WebSocket /ws from http://evil.example -> 403" $? "got: $ws"

echo
if [ "$FAILURES" -eq 0 ]; then echo "All checks passed."; else echo "$FAILURES check(s) failed."; exit 1; fi

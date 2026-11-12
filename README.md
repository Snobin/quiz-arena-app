# Minnal

A Malayalam-first Kerala PSC live quiz PWA. Monorepo:

| Path | What |
| --- | --- |
| `contracts/` | The only shared Java module (events, `/internal` DTOs, STOMP envelope, `Scoring`, `Ranking`). No Spring code. |
| `services/core` | core-service: identity, profiles, question bank. REST `/api/core/v1/**`. Port 8081. |
| `services/game` | game-service: matchmaking and live matches over WebSocket `/ws`. Port 8082. |
| `services/ratings` | ratings-service: ELO, history, leaderboards. REST `/api/ratings/v1/**`. Port 8083. |
| `web/` | React PWA (Vite). |
| `deploy/` | `compose.yaml` (local and prod), Caddy, Postgres init, Valkey config. |

Java packages follow `in.minnal.<service>.<feature>.(api|application|domain|infrastructure)`.
A Maven Enforcer rule fails the build if a service module depends on another service module.

## Prerequisites

- **JDK 25** (Temurin): `brew install --cask temurin@25`. Maven comes through the committed wrapper (`./mvnw`); no Maven install is needed.
- **Docker** with Compose v2. On macOS: `brew install --cask orbstack`, then open OrbStack once.
- **Node.js** `^20.19` or `>=22.12` (for `web/`).

## Build and test the services

```sh
./mvnw verify
```

This builds every module, runs the Enforcer rules and all tests. **Docker must be running**: core-service's
integration tests start a throwaway Postgres 18 with Testcontainers. The three context-load tests use a
`test` profile without Flyway or Valkey (and never open a DB connection), so they need no Docker.

## Run the stack locally

```sh
cp deploy/.env.example deploy/.env      # once; replace the placeholder passwords
docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --build --wait
bash deploy/verify-local.sh             # every check should print PASS
```

Only Caddy is published, on <http://localhost:8080>:

| Route | Goes to |
| --- | --- |
| `GET /health` | core `/actuator/health` |
| `/api/core/**` | core-service |
| `/api/ratings/**` | ratings-service |
| `/ws` | game-service (WebSocket) |
| `/internal/**`, `/actuator/**`, anything else | 404 at Caddy |

Caddy adds `X-Request-Id` when a request has none; every service log line is JSON and carries `requestId`.

Useful commands:

```sh
docker compose -f deploy/compose.yaml --env-file deploy/.env ps          # health of all six containers
docker compose -f deploy/compose.yaml --env-file deploy/.env logs -f core-service
docker compose -f deploy/compose.yaml --env-file deploy/.env down        # stop (add -v to wipe pgdata/valkeydata)
```

The Postgres init script runs only on an empty `pgdata` volume. After changing it, or the DB passwords
in `deploy/.env`, recreate the volume with `down -v`.

### Internal service token

game-service calls `POST core-service:8081/internal/question-sets` on the private Compose network with an
`X-Internal-Token` header. Set the shared value once in `deploy/.env`:

```sh
openssl rand -hex 32     # paste as MINNAL_INTERNAL_TOKEN=... in deploy/.env, then recreate core and game
```

Both services read `MINNAL_INTERNAL_TOKEN`. If it is unset (or still the `change-me…` placeholder), core-service still starts but logs a WARN and
answers every `/internal/**` call with 401. Caddy never routes `/internal/**` (404). Rotate it by changing
the value and redeploying both services.

### Seed the question bank

The starter questions live in `services/core/src/main/resources/seed/kerala-psc-starter.csv` (columns:
category, subject, topic, examLevel, difficulty, textMl, textEn, optionA–D, answerIndex, explanation,
attribution, sourceRef, reviewedBy, reviewedAt). Load them with the one-shot `seed` profile, with the stack up:

```sh
docker compose -f deploy/compose.yaml --env-file deploy/.env run --rm -e SPRING_PROFILES_ACTIVE=local,seed core-service
```

It logs one `row N · field · problem` line per problem, then `N loaded · M rows skipped · K unchanged`,
and exits (0, or 1 if the file can't be read). Running it again is safe: rows are matched by `sourceRef`,
and an existing one counts as unchanged (later edits go through admin versions, not the CSV).

Every row needs `reviewedBy` (the admin who checked it); `reviewedAt` is ISO-8601 and defaults to the load
time; an empty `attribution` is stored as none ("source not available"). The committed rows are drafts with
`reviewedBy`, `reviewedAt` and `attribution` left blank, so a fresh run reports `0 loaded · 30 rows skipped · 0 unchanged`
until each row is checked, signed and attributed. The image bakes the CSV in, so rebuild core-service
(`up -d --build`) after editing it. To load another file, add `-e MINNAL_SEED_FILE=file:/path/in/container.csv`.

Profiles: `SPRING_PROFILES_ACTIVE` in `deploy/.env` selects `local` or `prod`. All secrets come from
environment variables; only `deploy/.env.example` is committed.

## Web app

```sh
cd web
npm ci
npm run dev          # http://localhost:5173, proxies /api/core, /api/ratings and /ws to Caddy on :8080
npm run typecheck
npm run build        # output in web/dist
```

Start the Compose stack first so the dev proxy has something to talk to.

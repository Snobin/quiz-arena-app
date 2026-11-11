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

This builds every module, runs the Enforcer rules and the three context-load tests. The tests use a
`test` profile without Postgres, Flyway or Valkey, so they need no Docker.

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

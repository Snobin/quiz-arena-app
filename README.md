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

## Run the services from IntelliJ IDEA

Postgres, Valkey and Caddy stay in Docker; the three Spring Boot services run in the IDE, where you can
debug them. `deploy/compose.ide.yaml` publishes Postgres on `127.0.0.1:55432` and Valkey on
`127.0.0.1:56379` (non-default ports, so a Homebrew Postgres or Redis on the Mac never clashes), and
points Caddy at the services on your Mac, so the web app and `:8080` work unchanged.

1. Open the repository root (`pom.xml`) as the project, not a single service folder.
2. Start the infrastructure and stop the service containers:

   ```bash
   docker compose -f deploy/compose.yaml -f deploy/compose.ide.yaml --env-file deploy/.env \
     stop core-service game-service ratings-service
   docker compose -f deploy/compose.yaml -f deploy/compose.ide.yaml --env-file deploy/.env \
     up -d --no-deps --wait postgres valkey caddy
   ```

3. Run **all services** (or `core-service`, `game-service`, `ratings-service`) from the Run menu.
   These shared configurations live in `.run/`: profile `local`, the IDE ports above, and the
   repository root as working directory.

Under the `local` profile each service imports `deploy/.env` (`spring.config.import`), so the
passwords and `MINNAL_INTERNAL_TOKEN` come from that file; nothing secret is in the run
configurations. Services listen on 8081 (core), 8082 (game) and 8083 (ratings); through Caddy use
`http://localhost:8080`. `deploy/verify-local.sh` checks the all-Docker stack, so run it after
switching back:

```bash
docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --build --wait
```

## Web app

```sh
cd web
npm ci
npm run dev          # http://localhost:5173, proxies /api/core, /api/ratings and /ws to Caddy on :8080
npm run typecheck
npm run build        # output in web/dist
```

Start the Compose stack first so the dev proxy has something to talk to.

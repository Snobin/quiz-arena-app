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

### JWT signing key

core-service signs guest access tokens (RS256, 24 h) at `POST /api/core/v1/auth/guest {"lang":"ml"|"en"}`
and publishes the public keys at `GET /api/core/v1/auth/jwks`. game-service and ratings-service verify
every bearer token against that JWKS (`MINNAL_JWKS_URI`, fetched lazily on the first token, so they
start without core): no token, a bad signature or an expired token gets a `401` Problem Details;
`/actuator/health` (and `/ws` on game) stay public.

Locally, leave `MINNAL_JWT_SIGNING_KEY` empty: core generates an ephemeral key at startup and logs a
WARN, so every guest token becomes invalid when core restarts. The web app's `apiFetch` (used by REST
calls from Story 1.6 on) drops a rejected token and refetches on a 401; the guest session itself
fetches a new token on reload and when the page wakes (focus, visibility, back online). Under `prod`
an empty key stops core at startup. To set a real key:

```sh
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 | base64 | tr -d '\n'
# paste as MINNAL_JWT_SIGNING_KEY=... and pick a kid, e.g. MINNAL_JWT_KEY_ID=2026-11
```

To rotate: move the old key's public half into `MINNAL_JWT_EXTRA_PUBLIC_KEYS` (comma-separated
`kid=base64(SPKI PEM)` pairs, published in the JWKS but never used to sign), set the new signing key
and kid, and redeploy core. Drop the old entry after 24 h, when its last guest token has expired.

```sh
printf '%s' "$OLD_MINNAL_JWT_SIGNING_KEY" | base64 -d | openssl pkey -pubout | base64 | tr -d '\n'
```

### Sign in with Google

Registered players sign in with Google by a full-page redirect (OpenID Connect authorization code + PKCE;
no popup, One Tap or iframe). core-service verifies the ID token, creates or resumes the account, sets a
30-day refresh cookie (`httpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/core/v1/auth`) and sends the
browser to the PWA's `/auth/return`. The PWA trades the cookie for a 1 h access JWT held in memory only
(`POST /api/core/v1/auth/refresh`); with no cookie, or a stale one, it carries on as a guest. Every refresh
rotates the cookie inside a token family; replaying an already-rotated token revokes the whole family
(the player is asked to sign in again). Refresh needs the PWA `Origin` and an `X-Minnal-Auth: 1` header, and the
web app takes a Web Lock so open tabs refresh one at a time.

To create the credentials: in Google Cloud Console open APIs & Services, then Credentials, then Create
credentials, then OAuth client ID, type **Web application**. Add the callback as an Authorized redirect URI:
`<GOOGLE_REDIRECT_URI>`, e.g. `https://api.minnal.in/api/core/v1/auth/google/callback` (locally,
`http://localhost:5173/api/core/v1/auth/google/callback`, which the Vite proxy forwards to core). Put the
client id and secret in `deploy/.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; never commit them), set
`WEB_URL` to the PWA's public URL and `ADMIN_EMAILS` to a comma-separated list of admin addresses (granted
`ADMIN` only while Google reports the email verified; re-checked on every refresh). With the client id or
secret empty, core starts and `GET /api/core/v1/auth/google/start` answers 503.

**Shared-domain assumption:** the refresh cookie is `SameSite=Strict`, so it is only sent when the PWA and
the API share a registrable domain (e.g. `minnal.in` and `api.minnal.in`); the Cloudflare Pages site needs
that custom domain. When the API is on another origin, build the web app with `VITE_API_BASE_URL`
(e.g. `https://api.minnal.in`) and list the PWA origin in `CORS_ALLOWED_ORIGINS`; only the refresh
endpoint allows credentialed cross-origin calls. Tests use a fake OIDC provider and never call Google.

### Profile and the outbox

`GET|PUT /api/core/v1/me/profile` (USER or ADMIN bearer token; a guest gets 403) stores the display name,
district, exam level and language. A save writes a `minnal.user.profileUpdated` row to `event_outbox` in the
same transaction; a relay in core publishes the rows in order to the Valkey stream of the same name
(`XADD ... MAXLEN ~100000`), retrying with backoff, so a crash after commit still delivers the event. Set
`MINNAL_OUTBOX_RELAY_ENABLED=false` to run core without Valkey.

### Ratings

ratings-service is the only place ELO is computed (core and game have a test that fails if ELO or rating writes
appear there). It consumes `minnal.match.completed` and `minnal.user.profileUpdated` from Valkey through the
`ratings-service` consumer group: every pending entry is reclaimed on the first poll after boot, and later ones once idle for 30 s, an entry is acknowledged
only after its transaction commits, and one that fails five deliveries is copied to `minnal.deadletter` (with the
source stream, entry id, event id and last error), counted by the Micrometer counter `minnal.stream.deadletter`.
Ratings start at 1200, are per mode and integer, a guest opponent counts as 1200 and a bot as the player's own
rating; nothing is ever stored for a guest or a bot. Rating changes are published to `minnal.rating.updated`
from a transactional outbox. Set `MINNAL_STREAMS_ENABLED=false` to run it without Valkey.

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
time; an empty `attribution` is stored as none ("source not available"). The committed rows are signed
(`reviewedBy`, `reviewedAt`) but not yet attributed, so a fresh run reports `30 loaded · 0 rows skipped · 0 unchanged`. The image bakes the CSV in, so rebuild core-service
(`up -d --build`) after editing it. To load another file, add `-e MINNAL_SEED_FILE=file:/path/in/container.csv`.

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
   These shared configurations live in `.run/`. Clicking ▶ next to `main()` also works: with no
   profile set the services default to `local`, and the `local` profile defaults to the published
   ports above (inside Docker the container's own variables still win).

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

## CI

`.github/workflows/ci.yml` runs on every push to any branch, not tags (and by hand from the Actions tab).
Any failing step turns the run red. It has three jobs:

- **backend**: JDK 25 (Temurin), `./mvnw -B verify`. Core's integration tests start Postgres with
  Testcontainers, so they need Docker.
- **web**: Node 22, `npm ci`, then `typecheck`, `test`, `check:i18n`, `check:tokens` and
  `build:check`.
- **compose**: `node --test deploy/*.test.mjs` (the check script's own tests), then
  `node deploy/check-compose.mjs`. The check resolves `deploy/compose.yaml` with
  `docker compose config` and fails if a service has no memory limit, healthcheck or
  `restart: unless-stopped`, if a JVM service's `JAVA_TOOL_OPTIONS` lacks `-Xmx384m` or lower, or
  if the memory limits add up to 3.2 GB (3,200,000,000 bytes) or more. It prints the total. Required `${VAR:?}` values get
  placeholders, and it never reads `deploy/.env`.

Run the same checks locally from the repo root. Docker must be running: `./mvnw -B verify` needs it
for Testcontainers, and the Compose check calls `docker compose`.

```sh
./mvnw -B verify
(cd web && npm ci && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check)
node --test deploy/*.test.mjs
node deploy/check-compose.mjs
```

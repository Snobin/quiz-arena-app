---
title: 'Story 1.2 (part 2): the deploy pipeline'
type: 'chore'
created: '2026-11-19'
status: 'done'
baseline_commit: '2c1a859d1cd22f64a8c3c5d1ffbb4e6837e1d14c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-2-ci-workflow.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** CI only tests. Nothing builds the service images, ships them to the OVH VPS, or publishes the PWA, and there is no `.env.example` documenting the production secrets.

**Approach:** A repo-side deploy pipeline. A merge to `main` with green CI builds core, game and ratings images tagged with the commit SHA, pushes them to the registry, has the VPS pull them and run `docker compose up -d` with the `prod` profile and the same `deploy/compose.yaml`, and publishes the web build to Cloudflare Pages. Backups and the uptime monitor are deferred (`deferred-work.md`). Account, server and DNS setup stays with the owner.

## Boundaries & Constraints

**Always:**
- Deploy runs only on `main`, only after the backend, web and compose jobs pass; any failure blocks it. PR and branch pushes never deploy.
- game-service stays exactly one replica. The `check-compose.mjs` envelope (memory limits, 384 MB heap, healthchecks, `restart: unless-stopped`, under 3.2 GB) still passes, and the same compose file serves local and prod.
- Caddy is the only service publishing ports (80, 443 in prod); Postgres, Valkey and service ports stay private; `/internal/**` stays unrouted.
- No secret value in git. Secrets live in GitHub Actions secrets and the server-side `deploy/.env`; `.env` is git-ignored; `.env.example` lists every key without values. Rotating `MINNAL_INTERNAL_TOKEN` needs only a `.env` change and a redeploy.
- CORS allows only the Cloudflare Pages origin in prod.
- Renegotiated by the owner on 2026-11-19, after implementation found the web app calls its own origin: the web app takes a build-time `VITE_API_BASE_URL` (HTTP calls) and derives the realtime WebSocket URL from it, so a Pages-hosted build reaches the VPS API. Unset, it stays same-origin, so local dev and tests are unchanged. The deploy workflow passes the API origin (a GitHub variable) at build time.
- Decisions (owner, 2026-11-19): the workflow SSHes into the VPS and runs `docker compose pull && up -d` (SSH key as a GitHub secret); images go to GHCR (`ghcr.io/snobin/...`, built-in `GITHUB_TOKEN`); the web build is published with `wrangler pages deploy` from the workflow (Cloudflare API token and account id as GitHub secrets).

**Never:**
- No backup job, restore scripts or uptime monitor (deferred).
- The build creates no cloud accounts, servers, DNS records or secrets, and never runs a real deploy; it writes code and config only.

</frozen-after-approval>

## Code Map

- `.github/workflows/ci.yml` -- existing jobs `backend`, `web`, `compose`; the deploy workflow must wait on these (same workflow `needs:` or `workflow_run`).
- `deploy/compose.yaml` -- services use `build:` today; add `image:` with the SHA tag so the same file builds locally and pulls in prod; Caddy publishes `${CADDY_HTTP_PORT:-8080}` and `CADDY_SITE_ADDRESS` defaults to `:8080`, so prod needs 80 and 443 and the API domain.
- `deploy/check-compose.mjs` -- must still pass; extend its tests if the compose file gains the `prod` profile or ports.
- `deploy/caddy/Caddyfile` -- site address from `{$CADDY_SITE_ADDRESS}`; a real hostname gives automatic TLS and HTTP-to-HTTPS redirect.
- `services/{core,game,ratings}/Dockerfile` -- exist; `web/` has no Dockerfile (Pages needs none).

## Tasks & Acceptance

**Execution:**
- [x] `.github/workflows/deploy.yml` -- build and push the three SHA-tagged images, deploy to the VPS, publish web, gated on green CI and on `main` only, per the answers above
- [x] `web/src/auth/guestSession.ts`, `web/src/realtime/connection.ts` and any other fetch/WebSocket call site -- use `VITE_API_BASE_URL` (default same-origin), with tests; pass it in `deploy.yml`'s web build
- [x] `deploy/compose.yaml` -- `image:` references with `${IMAGE_TAG}`, prod ports and site address from env, still one compose file
- [x] `deploy/.env.example` and `.gitignore` -- every key without values (DB passwords, JWT key, `MINNAL_INTERNAL_TOKEN`, Valkey password, CORS origin, site address, image tag); `.env` ignored
- [x] `deploy/check-compose.test.mjs` -- keep the envelope checks green for the new compose shape
- [x] `deploy/README` section (or `docs/`) -- the owner's one-time setup checklist: VPS, Docker, DNS, GitHub secrets, Cloudflare Pages

**Acceptance Criteria:**
- Given a push to a non-`main` branch or a PR, when workflows run, then nothing is built for release or deployed.
- Given a green merge to `main`, when the deploy workflow runs, then the three images are tagged with the commit SHA and the web build is published.
- Given `deploy/compose.yaml` with the prod env, when `check-compose.mjs` runs, then it passes.
- Given the repository, when searched, then no secret value is present and `.env.example` lists every key the compose file requires.

## Implementation Notes

- Deploy is a `workflow_run` on CI success for a push to `main`, with a `gate` job that skips stale commits (head SHA must equal current `main`). Jobs: images (GHCR, SHA-tagged), server (SSH, pull, `up -d --wait`, rollback of `IMAGE_TAG` on failure, `.env` prod-key check), web (settings guard, then `wrangler pages deploy`), ordered `web` after `server`.
- "prod profile" is read as `SPRING_PROFILES_ACTIVE=prod` in the server `.env`; no Compose `profiles:` block.
- Mid-build renegotiation: the web app calls its own origin, so `VITE_API_BASE_URL` (default same-origin) now drives the guest-token call, `apiFetch` and the WebSocket URL.
- Not verified here: `docker compose config`, `check-compose.mjs` and the CLI compose tests (this machine's docker is a podman shim over compose 1.29); CI runs the first two. No real deploy was run.

## Verification

**Commands:**
- `node --test deploy/*.test.mjs && node deploy/check-compose.mjs` -- expected: pass
- `docker compose -f deploy/compose.yaml --env-file deploy/.env.example config` -- expected: resolves (placeholders filled in)

**Manual checks (if no CLI):**
- The workflow file parses (`actionlint` if available); the real deploy is run by the owner after setup.

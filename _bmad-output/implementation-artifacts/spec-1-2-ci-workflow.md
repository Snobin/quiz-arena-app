---
title: 'Story 1.2 (part 1): CI on every push'
type: 'chore'
created: '2026-11-13'
status: 'done'
baseline_commit: '740ab02ecf19119fc8c4ec0a5bb490b734ef7fa2'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing checks a change before it reaches `main`. About 20 PRs have merged on local test runs alone, and `main` has been red once already (PR #11 broke the seed tests until #13). Nothing checks that `deploy/compose.yaml` stays inside the VPS memory envelope either.

**Approach:** One GitHub Actions workflow runs the repo's two verification suites on every push. A small check script reads the resolved Compose config and fails when the resource and health rules are broken.

**Decisions:**
- **Scope split (owner, 2026-11-13):** this is Story 1.2 part 1. Production deploy is part 2, logged in `deferred-work.md`. This part covers only AC1 (tests on every push, any failure fails the workflow) and AC4 (the Compose check).
- **Trigger:** `push` on every branch, plus `workflow_dispatch`. There is no separate `pull_request` trigger. The repo is private, and this solo developer pushes branches before opening PRs, so a push run already reports its status on the PR commit, and dropping `pull_request` halves the Actions minutes (the free private-repo quota).
- **Concurrency:** one run per ref, and a newer push cancels the older run.
- **Turning the check into a merge gate** (a branch protection "required status check") is a GitHub repository setting the owner switches on after the first green run. It is not part of the code.

## Boundaries & Constraints

**Always:**
- **Jobs:**
  - `backend`: Temurin JDK 25, `./mvnw -B verify`, with a Maven repo cache.
  - `web`: Node 22 LTS with an npm cache. Runs `npm ci`, then `npm run typecheck`, `npm test`, `npm run check:i18n`, `npm run check:tokens` and `npm run build:check`.
  - `compose`: `node deploy/check-compose.mjs`.
- Any failing step fails its job and the workflow.
- The `backend` job runs on `ubuntu-latest`, where Docker is available for core's Testcontainers integration tests. No test is skipped or excluded to make CI pass.
- Least privilege: `permissions: contents: read`. The workflow uses no secrets, and nothing is pushed, published or deployed.
- Third-party actions are pinned to a version tag (for example `actions/checkout@v4`, `actions/setup-java@v4`, `actions/setup-node@v4`).
- **`deploy/check-compose.mjs`** (Node, no npm dependencies):
  - It resolves the file with `docker compose -f deploy/compose.yaml config --format json`.
  - Required `${VAR:?}` values are filled with harmless placeholders from the script's own environment, never from a real `.env`.
  - It fails, listing every violation, when any of these hold:
    - a service has no memory limit;
    - one of the three JVM services (`core-service`, `game-service`, `ratings-service`) lacks a heap cap of `-Xmx384m` or lower in `JAVA_TOOL_OPTIONS`;
    - the sum of all memory limits is 3.2 GB or more;
    - a service has no healthcheck;
    - a service's restart policy isn't `unless-stopped`.
  - It prints the total, and runs locally the same way.
- The script has tests: run against fixture Compose files, it passes a good file and reports each rule's violation. The `compose` job runs those tests.
- `README.md` gets a short "CI" section: what runs, and how to run the same checks locally.

**Never:**
- Deploy, image builds or pushes, Cloudflare, VPS, secrets, TLS, backups or the uptime monitor (all part 2).
- Changing application code or tests, except to fix a real failure that CI exposes (record it in Implementation Notes).
- Changing `deploy/compose.yaml` values to make the check pass, unless the check exposes a real breach (stop and report it instead).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Green push | today's `main` | all three jobs pass | — |
| Failing test | a commit that breaks a JUnit or Vitest test | its job fails and the workflow is red | — |
| Missing limit | a fixture service with no `mem_limit` | check fails and names the service | — |
| Heap too big | a fixture JVM service with `-Xmx512m` or no `-Xmx` | check fails and names it | — |
| Over budget | fixture limits summing to ≥ 3.2 GB | check fails and prints the total | — |
| No healthcheck / wrong restart | a fixture service missing either | check fails and names the rule | — |
| Superseded push | two quick pushes to one branch | the older run is cancelled | — |

</frozen-after-approval>

## Code Map

- `.github/workflows/ci.yml`: new, with the three jobs above.
- `deploy/check-compose.mjs`: new. Read `deploy/compose.yaml` first:
  - Shared settings come from `x-service-defaults`: `restart: unless-stopped`, `mem_limit: 640m` and `JAVA_TOOL_OPTIONS: -Xmx384m` via `x-service-env`.
  - The services are `caddy` (128m), `core-service`, `game-service`, `ratings-service`, `postgres` (512m) and `valkey` (256m). Today's total is about 2,816 MB.
  - Required variables use `${VAR:?…}` (for example `VALKEY_PASSWORD`). Find each one with a grep and give it a placeholder in the child process environment.
  - `docker compose config` normalises `mem_limit` (for example to bytes), so parse what it outputs, not the raw YAML.
- `deploy/check-compose.test.mjs` + `deploy/fixtures/compose-*.yaml`: new. Use `node:test`, run with `node --test deploy/`.
- `README.md`: add a CI section next to "Web app".
- Toolchain facts:
  - `pom.xml` `<java.version>25`.
  - The Maven wrapper is 3.9.16 (`.mvn/wrapper`).
  - `web/package.json` `engines.node` `^20.19.0 || >=22.12.0`.
  - Core integration tests use Testcontainers Postgres (`services/core/pom.xml:73–85`, `application-it.yaml`).
  - Game and ratings tests exclude the Redis auto-config (`application-test.yaml`), so no Valkey is needed.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: not touched by the implementer (the workflow syncs it).

## Tasks & Acceptance

**Execution:**
- [x] `deploy/check-compose.mjs` + tests + fixtures: the check, with a test per rule. Run it locally against the real file; it must pass.
- [x] `.github/workflows/ci.yml`: the three jobs, with caching, concurrency and permissions.
- [x] `README.md`: the CI section.

**Acceptance Criteria:**
- Given `node deploy/check-compose.mjs` locally, when it runs against `deploy/compose.yaml`, then it passes and prints the total memory (about 2.8 GB).
- Given `node --test deploy/`, when it runs, then every rule's fixture test passes.
- Given the branch pushed to GitHub, when the workflow runs, then `backend`, `web` and `compose` all pass (checked with `gh run watch`/`gh run view`).
- Given `actionlint` (if installed) or a YAML parse, when it reads `.github/workflows/ci.yml`, then it is valid.

## Implementation Notes

- `node --test deploy/` works on Node 20 but fails on Node 22+, which reads a bare directory as a module path ("Cannot find module …/deploy"; first CI run). CI, the README and the test header use `node --test deploy/*.test.mjs` instead, which works on both.
- Actions are pinned to `@v5` (checkout, setup-java, setup-node): v4 runs on the deprecated Node 20 runtime and setup-java v4 is flagged as deprecated.
- "3.2 GB" is decimal: 3,200,000,000 bytes (about 3052 MiB). Today's total is 2816 MiB (2.95 GB). The output prints GB and MiB. The check also flags a JVM service missing from the file, so a rename cannot silently skip the heap rule. `docker compose config` runs with an empty temp `--env-file`, so `deploy/.env` is never read.
- One local `./mvnw -B verify` hit a timing failure in `MatchFlowTest.aFloodIsCutToTheRateAndOtherSessionsAreUnaffected` (processed 0, expected 8–12). It passed on a rerun and in both CI runs. It is a possible flaky test, and its code is unchanged.
- CI run 43383723606 on `story/1-2-ci-workflow`: backend, web and compose all green.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | blind + edge | `cancel-in-progress` also cancels runs on `main`, so a merged commit can end up with no result | medium | patch | `concurrency` applies to every ref; two merges in quick succession cancel the first run. |
| 2 | edge | The bare `push:` trigger also runs on tag pushes | low | patch | Spends Actions minutes the push-only choice meant to save. Direct fix: `branches: ['**']`. |
| 3 | blind | Budget is 3200 MiB (about 3.36 GB) while the rule and README say "< 3.2 GB" | low | patch | `MEMORY_BUDGET_BYTES = 3200 * MIB`. Direct fix: 3.2e9 bytes, and update the fixture. |
| 4 | edge | Run through a symlinked path, `main()` never runs and the script exits 0 | low | patch | The entry check compares `process.argv[1]` with the module path without `realpath`; a silent pass is the worst failure mode for a check. |
| 5 | blind + edge | No test for the "JVM service missing" rule or for `healthcheck.test: ["NONE"]` | low | patch | Real branches in `checkConfig` with no test, against the spec's "a test per rule". |
| 6 | verification-gap | "Never reads `deploy/.env`" has no test | low | patch | Pre-verified; removing `--env-file` keeps all 11 tests green. |
| 7 | blind | `COMPOSE_*` variables in the caller's shell change what is checked | low | patch | `resolveCompose` copies the whole `process.env`. Direct fix: drop `COMPOSE_*`. |
| 8 | blind + verification-gap (other) | The test file's header comment about Node reading a directory is wrong | low | patch | Doc-only fix. |
| 9 | blind | README's local block doesn't say Docker must be running | low | patch | Both `./mvnw verify` (Testcontainers) and the check need Docker. One line. |
| 10 | blind + edge + verification-gap (other) | Heap set through `-XX:MaxHeapSize`, `JDK_JAVA_OPTIONS` or `command` is not checked | low | reject | Not live: the Dockerfiles use `java -jar` with no heap flags. Covering it adds parsing branches. |
| 11 | blind + edge | `profiles:` and `deploy.replicas` are ignored | low | reject | The file uses neither, and game-service must stay at one replica. |
| 12 | blind + edge | Unit suffixes `t` and `*ib` are not parsed | false | reject | `docker compose config` normalises `mem_limit` to bytes before the script reads it. |
| 13 | blind | No `pull_request` trigger | false | reject | Push-only is the owner-approved decision in the frozen intent. |
| 14 | blind | Heap headroom against `mem_limit` is not checked | low | reject | A new rule beyond the AC; today's 384m heap against 640m limits is fine. |
| 15 | blind | No artifact upload on failure, no `docker compose version` step | low | reject | Nice-to-have; failures already show in the log. |
| 16 | edge | Required variables in typed fields, `include`/`extends`, a zero `mem_limit`, `deploy.restart_policy` | low | reject | None is used in `deploy/compose.yaml`. |
| 17 | edge | The AC command `node --test deploy/` doesn't run the tests | low | reject | Fixing it means editing the spec; the deviation is recorded in Implementation Notes. |

## Verification

**Commands:**
- `node deploy/check-compose.mjs` -- expected: pass; prints the total.
- `node --test deploy/` -- expected: all pass.
- After the push: `gh run list --branch <branch> --limit 1` and `gh run watch <id>` -- expected: success on all three jobs.

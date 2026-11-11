# Deferred Work

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-project-scaffold-runs-locally.md`
  summary: Configure REST CORS in core and ratings from `minnal.cors.allowed-origins`, allowing the Pages origin only.
  evidence: Today the property gates only the `/ws` handshake. Story 1.2's acceptance criteria own the CORS allow-list.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-project-scaffold-runs-locally.md`
  summary: Add a negative test proving the Enforcer rule fails when one service module depends on another (e.g. a maven-invoker fixture in CI).
  evidence: `./mvnw verify` only ever runs against compliant POMs, so the failing case has never been exercised.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-project-scaffold-runs-locally.md`
  summary: Run `deploy/verify-local.sh` (or an equivalent) in CI on every change.
  evidence: The stack-level checks run only when someone remembers to run them by hand. There is no CI until Story 1.2.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-project-scaffold-runs-locally.md`
  summary: Give each service its own Valkey ACL user, limited to its own key prefix plus the `minnal.*` streams.
  evidence: Every service shares one full-access password, so the `core:`/`game:`/`ratings:` prefixes are only a convention, unlike the Postgres schema isolation.

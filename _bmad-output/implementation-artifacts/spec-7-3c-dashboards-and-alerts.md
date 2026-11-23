---
title: 'Story 7.3c: Dashboards and alerts'
type: 'feature'
created: '2026-11-23'
status: 'done'
baseline_commit: 'c3355f5'
route: 'oneshot'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The metrics from 7.3a and 7.3b reach Grafana Cloud but nothing shows them, and nobody is told when the site or answer latency goes bad.

**Approach:** From Story 7.3, last three Givens: keep a "Launch" and a "Health" dashboard and the five alert rules (answer confirmation p95 over 200 ms, no metrics for 10 minutes, 5xx over 2%, any dead-letter entry, JVM heap over 90%) as JSON in `deploy/grafana/`, emailing the developer, with the Battle Room host panel labelled "proxy" and the coaching-centre counting question left open for the owner.

</frozen-after-approval>

## Implementation Notes

Implemented directly. `deploy/grafana/dashboards/launch.json` (nine panels with the 40%, 2, 60%, 200 ms and 500 ms lines), `health.json`, `alerts.json` (rules, an email contact point with `${ALERT_EMAIL}` and a policy; the data source UID is `${PROM_DS_UID}`; no real address or token in the repo) and `README.md` (import steps, metric-name check, thresholds, an alert test log for the owner, known gaps). `deploy/grafana.test.mjs` (picked up by CI's `node --test deploy/*.test.mjs`) checks the panels, target lines, allowlisted label keys and the alert rules. Two small code changes so histogram quantiles work: `minnal.session.matches` and `minnal.match.broadcast.lag` now publish a percentile histogram. Not possible here: importing into Grafana Cloud, confirming the Prometheus metric names after a first push, and the forced-failure test of each alert on the VPS; all three are the owner's, listed in the README. Gaps recorded there: Valkey stream pending is not an exported metric, and restarts are approximated by process start-time changes.

## Review Triage Log

Inline review by the implementer (not independent; no reviewer subagents were launched).

| Finding | Verdict | Evidence / route |
|---|---|---|
| Prometheus metric names are derived from OTLP names by convention, not verified against a live push | medium | README says to check in Explore after the first push |
| Alert forced-failure tests are not done | medium | need the owner's Grafana account and the VPS; a log table is in the README |
| No stream-pending metric, so no pending panel | low | stated in the README; a new gauge would be its own change |
| `phi`-tagged percentile gauges from `publishPercentiles` are collapsed by the allowlist | low | dashboards use histogram buckets instead, so they are unaffected |

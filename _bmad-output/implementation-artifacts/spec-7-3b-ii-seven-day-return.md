---
title: 'Story 7.3b-ii: Seven-day return rate'
type: 'feature'
created: '2026-11-23'
status: 'done'
baseline_commit: '253e20b'
route: 'oneshot'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The launch success signal "7-day return" (target 40%) cannot be read: nothing computes it from ratings-service's `match_record`.

**Approach:** From Story 7.3, third Given, bullet "7-day return": a nightly job at 03:00 IST over `match_record` publishes two gauges for the cohort whose first completed match fell on the IST day 8 days earlier: its size (`minnal.retention.d7.cohort`) and the share who completed another match on a later IST day within 7 × 24 h of their first (`minnal.retention.d7.share`, 0 to 1). Registered players only, because guests and bots are never stored; aborted matches are never stored, so none counts. No tags (allowlist from 7.3a). Gauges keep the last computed value; a restart loses them until the next run.

</frozen-after-approval>

## Implementation Notes

Implemented directly. New `ratings/metrics/ReturnRateJob` (a `@Scheduled` cron `0 0 3 * * *` in `Asia/Kolkata`; one SQL over `match_record` with `FILTER` and `EXISTS`, IST days via `AT TIME ZONE 'Asia/Kolkata'`) and `SchedulingConfiguration` (scheduling on even with the stream loops off). Gauges `minnal.retention.d7.cohort` and `.share`; an empty cohort publishes NaN for the share. `ReturnRateJobIntegrationTest` covers a return, a same-IST-day second match, a return after 7 x 24 h, a first match on another day, a first match that was earlier, an empty cohort and an IST-versus-UTC boundary. That test needs Docker, which is denied here, so only CI runs it; the ratings context tests and the compile pass locally.

## Review Triage Log

Inline review by the implementer (not independent; no reviewer subagents were launched).

| Finding | Verdict | Evidence / route |
|---|---|---|
| The SQL is untested locally (no Docker, no Postgres here) | medium | CI runs the integration test; fix there if it fails |
| The nightly scan groups all of `match_record` | low | fine at launch scale; the `(user_id, ended_at)` index helps the `EXISTS`; revisit if the table grows large |
| Gauges are empty (NaN) until 03:00 after a restart | low | accepted in the intent |

# Grafana Cloud dashboards and alerts (Story 7.3c)

Everything here is imported into the Grafana Cloud free tier; nothing runs on the VPS. Metrics arrive from the three services over OTLP (Story 7.3a, `GRAFANA_OTLP_URL` and `GRAFANA_OTLP_AUTHORIZATION` in `deploy/.env`).

| File | What it is |
|---|---|
| `dashboards/launch.json` | **Launch**: 7-day return against 40%, matches per session against 2, Quick Match bot-ended share against 60% beside the median queue wait, completed vs aborted by mode, answer confirmation p50/p95 (server and client round trip) against 200 ms, Battle Room hosts, 5-plus hosts and rooms per IST week (labelled **proxy**), scoreboard broadcast p95 against 500 ms |
| `dashboards/health.json` | **Health**: requests and 5xx rate per service, JVM heap against the 384 MB cap, dead-lettered entries, restarts (process start time changes) |
| `alerts.json` | Alert rules, a contact point (email to the developer) and a notification policy, in Grafana's provisioning format |

## Import

1. Dashboards: Grafana, Dashboards, New, Import, upload each file, pick the Prometheus data source (variable `ds`).
2. Alerts: in `alerts.json` replace `${PROM_DS_UID}` with the Prometheus data source's UID and `${ALERT_EMAIL}` with the developer's address, then import through the provisioning API (`POST /api/v1/provisioning/alert-rules`, `contact-points`, `policies`) or Alerting, Alert rules, Import. Keep the real address out of the repo.
3. The external `/health` uptime ping from Story 1.2 stays the primary uptime alert.

## Metric names (verify once)

Panels use the Prometheus names Grafana Cloud derives from the OTLP names: dots become underscores, timers end in `_seconds`, the client round trip in `_milliseconds`, counters in `_total`. After the first push, open Explore and check each name (for example `minnal_match_answer_ack_seconds_bucket`); fix a panel here if a name differs.

## Alert rules and thresholds [ASSUMPTION]

| Alert | Condition | For |
|---|---|---|
| Answer confirmation p95 | server p95 over 200 ms | 10 min |
| No metrics, per service | no `jvm_memory_used_bytes` from core, game or ratings | 10 min |
| 5xx | over 2% on any service | 10 min |
| Dead letter | any entry in `minnal.deadletter` or `minnal.stream.deadletter` | at once |
| JVM heap | over 90% of the service's cap | 10 min |

## Alert test log (owner, once, on the VPS)

Force each condition and note the result here: for example stop ratings-service (no-metrics), then start it again.

| Alert | How forced | Date | Result |
|---|---|---|---|
| No metrics | stop ratings-service for 11 min | | |
| Dead letter | | | |
| 5xx | | | |
| JVM heap | | | |
| Answer confirmation p95 | | | |

## Known gaps

- Valkey stream **pending** counts are not exported as a metric yet, so the Health dashboard has no pending panel; dead letters are shown. Container restarts are approximated by process start-time changes.
- **Open question for the owner (not a requirement):** how should a coaching centre be counted? The Battle Room host panels are a proxy (distinct hosts, and hosts of rooms with 5 or more humans) until that is defined.

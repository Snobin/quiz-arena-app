# Metrics

Definitions behind the SPEC's success signal and its technical targets. The system has to emit these from launch day.

## Product goals

| Goal | Metric | Target |
| --- | --- | --- |
| Habit formation | Players who return within 7 days of their first match | ≥ 40% |
| Session depth | Fully completed matches per session | ≥ 2 |
| Real opponents | Quick Match sessions that end against a bot | < 60% at 90 days |
| B2B traction | Coaching centers actively using Battle Room | ≥ 5 within 60 days of launch (how to count a center is an open question) |

## Counter-metrics

- Track the bot rate together with the median matchmaking wait time. A lower bot rate bought by a longer queue does not count.
- Session depth counts only fully completed matches. Aborted or empty matches are excluded.

## Technical targets

| Target | Value |
| --- | --- |
| Answer submission to server confirmation | < 200 ms for players in Kerala on mobile data |
| Live scoreboard update after an answer is received | < 500 ms |
| Initial app load on 3G | < 5 s |
| Minimum device | Android with 2 GB RAM, on a 3G connection |
| Quick Match / Topic Duel duration | ≤ 4 min end to end |
| Uptime | ≥ 99.5% |

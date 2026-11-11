# Game Modes

The per-mode rules for CAP-4 to CAP-7 and CAP-9. The match mechanics behind these rules are fixed by the architecture spine: AD-4 to AD-8, AD-11, AD-13 and AD-14.

## Mode matrix

| | Quick Match | Topic Duel | Battle Room | Solo Practice |
| --- | --- | --- | --- | --- |
| Who can play | Registered + guests | Registered | Registered | Registered |
| Players | 1v1 | 1v1 | 2–50 humans | 1 |
| Question source | PSC bank, mixed subjects | PSC bank, player-chosen subject/topic | Host-chosen: PSC bank by topic, or one of the host's custom topics | PSC bank topic, or own custom topic |
| Questions | 10 | 10 | Host sets 5–30 (default 10) | Player's pace, no fixed count |
| Timer | 15 s per question | 15 s per question | 15 s per question | None |
| Scoring | Speed-weighted | Speed-weighted | Speed-weighted | None |
| Bot fallback | Yes, after ~8 s | Yes, after ~8 s | Never | — |
| Rating track | Quick Match | Topic Duel | Battle Room (bank source only) | None |
| Answer shown | After window closes | After window closes | After window closes | Immediately after answering |
| Post-match | Rematch / Home | Rematch / Home | Play again / Home | — |

## Scoring

- Correct answer: `500 + round(500 × remainingMs / 15000)`. Wrong answer or no answer: `0`. Faster correct answers score more, and the slowest correct answer still earns 500.
- The response time is measured by the server from the moment the question opened. Only the player's first answer to a question counts.
- Every mode and every bot uses this one formula.

## Matchmaking (Quick Match, Topic Duel)

- Match within ±200 rating, widening to ±400 after 4 s. After ~8 s with no human match, a bot joins.
- Topic Duel queues are separate per topic.
- Track the median queue wait time together with the bot rate (see the counter-metrics in `metrics.md`). Matchmaking must never be slowed down to make the bot rate look better.

## Bots

- A bot is shown with a bot badge in the opponent slot.
- Its answer delay is randomized for each question. It is not a fixed delay, and not tied to difficulty.
- For rating purposes, a bot counts at the human player's current rating.

## Battle Room lifecycle

- The host creates a room and gets a shareable code. Codes expire at match end or after 24 h, whichever comes first.
- Players join with the code. Joining should feel like joining a WhatsApp group: minimal friction, no confirmation steps (see the PRD addendum on UX tone).
- The host configures the question source and count, then starts the match. Starting needs at least 2 humans, and only the host can start. If the host leaves the lobby, the room closes.
- During the match, a live scoreboard is visible to everyone.
- **Play again** creates a new room with the same question source preselected.

## Disconnects

- A player who drops has 10 s to reconnect. If they make it back in time, they resume at the current question and scores.
- After 10 s they forfeit the remaining questions, and the match continues for everyone else.
- A match counts as completed once its first question has been revealed. A player who quits after that still receives the result their score earned.
- If every human leaves before the first reveal, the match is aborted and does not count anywhere.

## Ratings

- ELO, K = 32, starting at 1200 for every new user in every mode. The three mode tracks are independent.
- Battle Room ratings use pairwise ELO against every other human, with K = 32/(N−1) [assumption].
- Custom-topic matches never change ratings or leaderboards, but they are still recorded in the registered players' match history.
- Guests are never rated. A registered player who plays a guest is rated, with the guest counted at 1200.
- Leaderboards exist per mode, with daily, weekly and all-time scopes, covering all of Kerala. Days and weeks follow Indian Standard Time, and weeks start on Monday.

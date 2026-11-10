# Kerala PSC Quiz Arena – Project Brief

Nov 10, 2026 · @Snobin Abraham

## Vision

Quiz Arena (working name) is a Kerala PSC quiz app where aspirants learn by competing: live matches against other players, or against bots when no one else is online. It launches as a web app, then on Android and iOS.

- **Problem:** PSC preparation is long and lonely. Mock tests feel like work, and many aspirants stop practising daily.
- **Idea:** turn daily practice into short, live matches with real people, so learning feels like a game.
- **Learning first:** every match ends with explanations for each question and a list of weak topics to revise.
- **Always playable:** if no human opponent is found in a few seconds, a bot joins, so a single player never waits.
- **Career goal:** a production-quality, scalable project you can host, show to employers, and grow into a real product.

## Users and competitors

The audience is large: over 5.55 lakh candidates confirmed for the 2026 Degree Level Prelims alone, out of 26.77 lakh applications ([source](https://competitivecracker.com/blog/kerala-psc-degree-prelims-2026-over-555-lakh-candidates-confirmed)). Live PSC quiz battles already exist, so the app must stand out.

**Target users**

- 10th level aspirants (LGS, LDC and similar posts), often on low-cost Android phones and mobile data.
- 12th level and Degree level aspirants (Degree Prelims is 100 questions in 1 hour 15 minutes, OMR/online) ([source](https://competitivecracker.com/blog/kerala-psc-degree-prelims-2026-over-555-lakh-candidates-confirmed)).
- Most prefer Malayalam questions; some want English.

**Existing apps**

| App | What it offers | Gap we can target |
| --- | --- | --- |
| [PSC Challenger](https://iphoneaddict.fr/apps/education/psc-challenger.html) | Live quiz battles, PYQs, mock tests, video classes, Malayalam questions | Mostly 1-vs-1; learning loop after the match is thin |
| [Prepscale](https://play.google.com/store/apps/details?id=com.prepscale.app) | Video classes, daily quizzes, live tests with all-Kerala rank lists, Malayalam and English | Course-style, not game-first |
| [PSC PYQ](https://appgoblin.info/apps/com.pscprepcompanion.app) | Previous year questions, topic-wise practice, mock tests | No live multiplayer |

**Possible differentiators** (to test in BMAD brainstorming)

- Rooms with friends or a coaching-centre batch (private room code, 2 to 10 players).
- Bots that play at your level, so you always get a fair match.
- Weak-topic revision right after each match (spaced repetition).
- District and college leaderboards, which suit Kerala's local pride.
- Works well on slow 3G/4G and cheap phones.

## Features

The MVP is the smallest version that proves people enjoy live PSC matches: sign-in, a question bank, quick match with bot fallback, results with explanations, and a leaderboard.

| Feature | MVP | Later |
| --- | --- | --- |
| Sign-in with phone OTP or Google; guest play | Yes |  |
| Profile: name, district, exam target (10th / 12th / Degree level) | Yes |  |
| Question bank in Malayalam and English, tagged by subject, topic, exam level, difficulty | Yes |  |
| Admin panel to add, edit, bulk-upload (CSV) and review questions | Yes |  |
| Quick match: 1 vs 1, real-time, bot joins if no player in \~8 seconds | Yes |  |
| Solo practice by topic (no timer pressure) | Yes |  |
| Match result: score, correct answers, explanation per question | Yes |  |
| Leaderboards: daily, weekly, all-Kerala | Yes |  |
| Private rooms with a code (2 to 10 players) |  | Phase 2 |
| District and college leaderboards |  | Phase 2 |
| Weak-topic report and spaced-repetition revision |  | Phase 2 |
| Daily challenge and streaks |  | Phase 2 |
| Tournaments with scheduled start times |  | Phase 3 |
| Friends, chat, notifications |  | Phase 3 |
| Android and iOS apps |  | Phase 3 |
| Premium plan (ad-free, unlimited rooms, full mock tests) |  | Phase 3 |

## Game modes and bots

The server controls every match: it sends questions, runs the timer and scores answers, so players cannot cheat by editing the app.

**A quick match, step by step**

1. Player taps Quick Match and picks an exam level and topic (or "mixed").
2. The server looks for a player with a similar rating. If none appears within about 8 seconds, it adds a bot.
3. Both players get the same 10 questions, one at a time, 15 seconds each.
4. Faster correct answers score more points (for example 10 points plus a speed bonus of up to 10).
5. After the last question, both see the result, the correct answers and an explanation for each.
6. Ratings and leaderboards update.

**How bots behave**

- Each bot has a skill level matched to the player's rating (easy, medium, hard).
- A bot's chance of answering correctly depends on its level and the question's difficulty.
- Bots answer after a realistic, random delay (for example 3 to 12 seconds), not instantly.
- Bots get Malayali names and avatars, but the app shows a small "bot" badge. Being honest keeps trust.
- Bot matches count for practice and XP, but should count less (or not at all) for the competitive leaderboard.

## Tech stack and architecture

Recommendation: Java and Spring Boot for the backend (the developer's existing strength), and TypeScript with React for web and mobile. This makes a full-stack Java profile, which is in high demand. Treat this as a starting proposal. BMAD's architecture step should confirm or change it.

| Layer | Choice | Why |
| --- | --- | --- |
| Web app | Next.js (React, TypeScript) as an installable PWA | Works on any phone browser; fast first load; SEO for question pages |
| Mobile apps (later) | React Native with Expo | Reuses TypeScript types and logic from the web app; one codebase for Android and iOS |
| API server | Java 21 + Spring Boot (Spring Security with JWT, Spring Data JPA, Flyway) | Builds on existing Spring skills; virtual threads handle many connections; most in-demand backend stack in India |
| Real-time matches | Spring WebSocket with Redis pub/sub | Lets many server copies share live match events, so you can add servers as users grow |
| Main database | PostgreSQL | Users, questions, match history; strong for reports and leaderboards history |
| Fast store | Redis | Matchmaking queue, live match state, leaderboards (sorted sets), rate limiting |
| Sign-in | Phone OTP and Google (e.g. Firebase Auth), with your own JWT sessions | Phone OTP is what most Kerala users expect |
| Hosting | Docker containers in an India region (Mumbai), behind a CDN such as Cloudflare | Low latency for Kerala; start small, add servers later |
| Quality | JUnit 5 and Testcontainers, Sentry for errors, k6 for load tests, GitHub Actions for CI | Prove the app handles thousands of players at once |

&#91;embedded content: system architecture · clients, servers, data stores\]

Both server types run as several identical copies; both read and write PostgreSQL and Redis.

**Scaling approach**

- API and game servers keep no state in memory between requests; live state lives in Redis. Any server can then handle any player, and you add servers behind a load balancer.
- Questions for a match are loaded once and cached in Redis, not read from PostgreSQL per player.
- Leaderboards use Redis sorted sets, which rank millions of entries quickly.
- Static files and images go through the CDN.
- Start with one small server and a managed database. Measure with load tests before paying for more.

## Quality requirements

These targets are starting points for the PRD; adjust them once you know your launch audience.

| Area | Target |
| --- | --- |
| Concurrent players | 1,000 live at launch; design so 50,000+ is possible by adding servers |
| Answer latency | Server receives and confirms an answer in under 200 ms for players in Kerala |
| Devices | Works on Android phones with 2 GB RAM, iPhones, tablets and desktop browsers; screens from 360 px wide |
| Network | Usable on slow 3G; reconnects to a live match automatically after a short drop |
| Language | Full Malayalam and English UI; questions stored in both where available |
| Accessibility | Readable Malayalam font sizes, good contrast, works with screen readers |
| Uptime | 99.5% monthly at first |
| Security | HTTPS only, rate limits on sign-in and answers, server-side scoring, no answers sent to the client before time is up |
| Privacy | Follow India's DPDP Act: collect only what is needed, let users delete their account |
| Content | Questions reviewed by an admin before going live; users can report a wrong question |

## Roadmap

Build in four phases, and move on only when each gate passes. Phase 1, the backend, is your current focus.

&#91;embedded content: roadmap · 4 phases, 3 gates\]

Dates are left open until the PRD sizes the work.

## BMAD session plan

Run each step below as its own fresh Claude Code session (type `/clear` between them), and commit to git after each one. This is a project-sized plan, so it follows BMAD's full path: brief, PRD, UX, architecture, then epics and stories. If a skill name differs in your BMAD version, type `/bmad-help` and describe the step; it will point you to the right one.

**Step 0: Set up (once)**

```bash
mkdir quiz-arena && cd quiz-arena
git init
npx bmad-method install --directory . --modules bmm --tools claude-code --yes
mkdir docs
# Export this doc as Markdown and save it as docs/project-brief.md
claude
```

**Step 1: Brainstorm**

> /bmad-help I'm starting a new project. Read docs/project-brief.md. I want to brainstorm with BMAD: how my app can stand out from PSC Challenger and Prepscale, game modes, a name, and how it could earn money.

**Step 2: Product brief (Analyst)**

> Act as the BMAD analyst. Using docs/project-brief.md and the brainstorming output, create the product brief for a Kerala PSC multiplayer quiz app with bots.

**Step 3: PRD (Product Manager)**

> Act as the BMAD PM. Create the PRD from the product brief. Keep the MVP to the features marked MVP in docs/project-brief.md. Web app first, backend first. Include the quality targets.

**Step 4: UX design**

> Run the BMAD UX design workflow. Mobile-first, Malayalam and English, works on cheap Android phones. Cover: sign-in, home, quick match, live match screen, results with explanations, leaderboard, admin question panel.

**Step 5: Architecture**

> Run the BMAD architecture workflow. Start from the tech stack table in docs/project-brief.md. Design for 1,000 concurrent players at launch and horizontal scaling to 50,000. Detail the real-time match engine, matchmaking with bot fallback, and the database schema.

**Step 6: Epics and stories**

> Create the epics and stories from the PRD and architecture, backend first. Then run the implementation readiness check.

A backend-first order to suggest:

1. Project setup: Spring Boot, PostgreSQL, Redis, Docker, CI
2. Auth and user profiles
3. Question bank and admin API (with CSV upload)
4. Solo practice API
5. Real-time match engine (Spring WebSocket)
6. Matchmaking and bots
7. Scoring, ratings and leaderboards
8. Load testing and deployment
9. Web frontend

**Step 7 onward: Build, one story per session**

> Run sprint planning.

Then, for each story:

> Create the next story. Then implement it with the dev workflow, with tests. Then run code review.

At the end of each epic:

> Run a retrospective for this epic.

**Habits that help**

- Read and correct every document BMAD writes before moving on; later steps build on it.
- Keep the PRD and architecture in `docs/` under git, so the plan lives with the code.
- Run the tests yourself and understand each story's code. For a career project, you should be able to explain every part in an interview.

## Open questions and risks

**Decide before the PRD**

- [ ] App name and brand
- [ ] Where questions come from: write your own, licensed, or user-submitted with review? Copying another app's question bank is a legal risk.
- [ ] Which exam level to launch with first (10th level has the most aspirants)
- [ ] Free only, ads, or a premium plan
- [ ] Budget for hosting and SMS OTP each month
- [ ] Solo developer, or a team?

**Risks**

| Risk | Mitigation |
| --- | --- |
| Not enough players online, so matches feel empty | Bot fallback from day one; scheduled daily tournaments to gather players at one time |
| Wrong answers in the question bank hurt trust | Admin review before publishing; "report question" button; show sources |
| Cheating (bots, answer lookup) | Server-side timer and scoring; short time per question; rate limits |
| Hosting costs grow with users | Load test early; cache in Redis; scale only when metrics show the need |
| Being mistaken for an official app | Clear note: not affiliated with Kerala PSC |
| Scope too big for one person | Ship the MVP web app first; mobile apps only after real users |

Sources: [BMad docs](https://docs.bmad-method.org/), [Kerala PSC Degree Prelims 2026 numbers](https://competitivecracker.com/blog/kerala-psc-degree-prelims-2026-over-555-lakh-candidates-confirmed), [PSC Challenger listing](https://iphoneaddict.fr/apps/education/psc-challenger.html), [Prepscale listing](https://play.google.com/store/apps/details?id=com.prepscale.app), [PSC PYQ listing](https://appgoblin.info/apps/com.pscprepcompanion.app).

# Epic 7 Context: Minnal spreads and is launch-ready

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make Minnal spread by word of mouth and make launch safe. A finished match can be shared to WhatsApp as a drawn image with a short link that drops friends into Quick Match; a first-time registered player is offered an install to the home screen once; the developer gets free-tier dashboards and alerts for retention, matches per session, bot rate, queue time, aborts, answer-confirm latency and weekly room hosts; and before launch a written restore runbook and a decide-versus-build checklist exist.

## Stories

- Story 7.1: Result share card
- Story 7.2: Install prompt
- Story 7.3: Launch metrics
- Story 7.4: Launch readiness

## Requirements & Constraints

- The share card is rendered in the browser on a canvas: no server rendering, no third-party service, the renderer outside the initial bundle (initial JS budget 150 KB gzipped, currently about 134 KB).
- Share and the link are open to guests and registered players; a custom topic's name never leaves the app.
- The share link carries no user id, match id, name or tracking parameter, and is built from the build-time public origin, never hard-coded.
- Metrics use a tag allowlist and the free Grafana Cloud tier; alert rules and dashboards live in the repo.
- Launch is blocked until the DPDP account-deletion question is answered (Epic 2 action A1).

## Technical Decisions

- The public app origin comes from build-time configuration (set in Story 5.2); the share route is `/q`.
- The PWA manifest and service worker exist (Story 1.3); installability is checked, not rebuilt.
- Counters already exist from earlier stories (matchmaking, reconnect, rooms); product metrics are computed from them and from ratings-service match records.

## UX & Interaction Patterns

- The Share action fills the empty slot in every results action bar; volt appears only on the share card's ink field; text on the card is never under 40 px on a 1080 canvas.
- A `/q` link opens straight into Quick Match matchmaking with no landing page.

## Cross-Story Dependencies

- 7.1 builds on the results screens (Stories 1.10, 2.6, 4.2, 5.5, 5.6), guest identity and matchmaking (1.5, 1.6) and the public origin (5.2).
- 7.2 builds on the PWA setup (1.3) and the first completed match for a registered player.
- 7.4 needs the Story 1.2 backup job and the DPDP answer.

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
- source_spec: none
  summary: Story 1.3 part 2, Malayalam font and bilingual text. Covers: self-hosted Noto Sans Malayalam subset (U+0D00-0D7F, U+200C-200D, U+25CC, U+0964-0965, shaping features kept) with a metric-matched fallback; preload and precache; swap vs optional faces; a shaping fixture page; ml/en catalogue holding every Voice & Tone string, with TBD entries flagged; an i18n lint rule against hard-coded strings; <html lang> and the <Lang> helper; Latin-digit number formatting; document.title per route.
  evidence: Split from Story 1.3 at the build scope check (user chose Split). It can ship as its own PR and depends only on part 1's tokens.
- source_spec: none
  summary: Story 1.3 part 3, shell, motion safety and offline. Covers: bottom tab bar Play/Rooms/Ranks/Me with placeholder surfaces, scroll memory and a route-level hide; skeleton loaders; Reduce-effects store (on/off/follow-phone) with auto-fallback and a dev toggle; app-wide flash scheduler with a fake-timer test and a QA fixture; shared live regions; offline banner; shell-only service worker; manifest (standalone, orientation any); 150 KB gzipped initial-JS budget check as an npm script that Story 1.2's CI will call.
  evidence: Split from Story 1.3 at the build scope check (user chose Split). It can ship as its own PR and depends on parts 1 and 2.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-design-foundation-theme-and-primitives.md`
  summary: Add a post-build check over `web/dist`: every token is a custom property in the built CSS, the initial JS is ≤ 150 KB gzipped, no DesignFixture code ships, and the classes used by primitives were actually generated.
  evidence: The token parity test reads the source `theme.css` only, so the built-output criteria regress silently. This belongs with the bundle check in Story 1.3 part 3.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-design-foundation-theme-and-primitives.md`
  summary: Automate the dark-swap and reflow checks (320px; 360px at 200% text) in a real browser, e.g. Playwright, when the shell lands.
  evidence: jsdom can't lay out, so these matrix rows were verified only in a one-off headless Chrome run.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-malayalam-font-and-bilingual-text.md`
  summary: Extend the post-build `web/dist` check to assert the Malayalam woff2 is listed in `dist/sw.js`, the font preload is in `dist/index.html`, and the `/fonts/...` URLs still resolve under a non-root `BASE_URL`.
  evidence: These Story 1.3 part 2 acceptance criteria were verified by hand only (grep on dist); nothing fails if a Vite or workbox change drops them. Fold into the part 3 bundle/dist check.

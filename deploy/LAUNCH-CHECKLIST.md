# Launch checklist (Story 7.4b)

Every item is tagged **[OWNER]** (a decision only the owner can make) or **[ENG]** (an engineering task with a check). This list does not decide any owner item: it records the owner's answer, or says **open · blocks launch**. An [ENG] item is checked only with its evidence linked.

Last reviewed: 2026-11-23. Nothing here is launch-ready until every box is checked.

## 1. Domain, hosting and origins

- [ ] **[OWNER]** Choose and buy the domain. Answer: answered, `snobin.in`, bought at GoDaddy (2026-11-24), as a general domain so it can host other projects. Minnal runs on subdomains: the app at `minnal.snobin.in` and the API at `api.minnal.snobin.in` (same registrable domain, so the refresh cookie stays first-party). Still to do at the registrar: auto-renew on, two-factor sign-in on, registrar lock on, and nameservers pointed at Cloudflare DNS.
- [ ] **[ENG]** Serve the PWA from Cloudflare Pages on the app host and the API from the VPS on an `api.` subdomain of the same registrable domain, so the refresh cookie from Story 2.1 is first-party. Set `VITE_PUBLIC_APP_ORIGIN`, the prod `CORS_ALLOWED_ORIGINS` and the Google OAuth redirect URIs to the real origins. Verify sign-in, a `/r/<code>` link and a `/q` link on a real Android phone. Evidence: _open_ (needs Story 1.2 part 2, the production deploy, which is still `in-progress`)
- [ ] **[ENG]** Production deploy to the OVH Mumbai VPS and Cloudflare Pages (Story 1.2 part 2: CI deploy, secrets, TLS, resource envelope). Evidence: _open_

## 2. VPS plan and bandwidth

- [ ] **[OWNER]** Confirm the OVHcloud Mumbai plan's availability and its bandwidth cap (10 Mbps after the monthly quota) on the order page, and accept or change the plan. Answer: _open · blocks launch_
- [ ] **[ENG]** Record the measured bandwidth of one 50-player room so the cap can be judged. Evidence: _open_ (measure on the VPS during a staged room)

## 3. Privacy and sign-in

- [ ] **[OWNER]** Answer the India DPDP Act question from Story 2.8: what must be erased or kept on account deletion, including backups and `match_record`. Answer: _open · blocks launch_ (launch is blocked while this item is open)
- [ ] **[ENG]** Implement whatever the DPDP answer requires before launch, or record that nothing changes. Evidence: _open, waits on the answer above_
- [ ] **[OWNER]** Publish the Google OAuth consent screen out of testing mode. Answer: _open · blocks launch_
- [ ] **[ENG]** Set `ADMIN_EMAILS` in the prod `.env`; check that the admin can open `/admin` and a non-admin cannot. Evidence: _open_ (the admin console and its role check exist from Epic 3; the prod value and the two-account check are still to do)

## 4. Content

- [ ] **[OWNER]** Confirm the published-bank threshold, proposed as at least 500 published Kerala PSC questions across at least 10 topics with 10 or more each [ASSUMPTION: threshold]. Answer: _open · blocks launch_
- [ ] **[ENG]** Show the current counts from one admin query. Run `deploy/bank-counts.sql` on the VPS (the command is in the file) and paste the output here. Evidence: _open_ (query is in the repo: `deploy/bank-counts.sql`)

## 5. Operations

- [ ] **[ENG]** External uptime ping on `/health` live, with an alert tested by stopping a container. Evidence: _open_
- [ ] **[ENG]** Nightly backup running from cron with R2 keys set and an R2 lifecycle rule; backup heartbeat live and set to alert after 26 h. Evidence: _open_ (scripts merged in PR #100: `deploy/backup.sh`, CI-proven by the `backup-drill` job; the VPS setup is in `deploy/RUNBOOK-restore.md`)
- [ ] **[ENG]** A restore drill on the VPS logged within the last 30 days. Evidence: _open_ (the drill log in `deploy/RUNBOOK-restore.md` is empty)
- [ ] **[ENG]** Story 7.3 dashboards and alerts live in Grafana Cloud: both dashboards imported, the metric names checked in Explore, each alert forced once and logged. Evidence: _open_ (files in `deploy/grafana/`, README has the alert test log)
- [ ] **[OWNER]** Accept the error budget: 99.5% monthly uptime allows about 3 h 36 min of downtime a month; when a month's budget is spent, feature work pauses for reliability work [ASSUMPTION: freeze policy]. Answer: _open · blocks launch_
- [x] **[ENG]** The runbook records where the month's remaining budget is read: the uptime monitor's monthly report. Evidence: `deploy/RUNBOOK-restore.md`, section **Error budget**

## 6. Copy

- [ ] **[OWNER]** Sign off every string flagged TBD: the Malayalam share-card lines (Story 7.1), the sample GPT prompt in Malayalam, the join copy (Story 5.3) and the install copy (Story 7.2). Answer: _open · blocks launch_ (the flagged strings carry `signoff` entries in the catalogues; `pendingSignoff()` in `web/src/i18n` lists them)

## Done means

Every [ENG] item above is checked with its evidence linked, and every [OWNER] item has its answer recorded or is marked _open · blocks launch_.

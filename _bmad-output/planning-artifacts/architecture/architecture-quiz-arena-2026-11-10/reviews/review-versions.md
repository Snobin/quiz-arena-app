# Stack Version Review (2026-11-10)

Web search check of the Stack table in ARCHITECTURE-SPINE.md. The spine was not edited. Search snippets were used, not registry lookups, so confirm each pin with `npm view` / the official site when scaffolding.

| Name | Spine value | Verified current stable | Correct? | Source |
|---|---|---|---|---|
| Java | 25 (LTS) | 25 LTS (26 is non-LTS) | Yes | sanity only |
| Spring Boot | 4.1.x (4.1.1) | 4.1.x; 4.2 due ~Nov 2026, not yet 2 weeks old | Yes, stay on 4.1 | sanity only |
| PostgreSQL | 18 | 18 | Yes | sanity only |
| vite-plugin-pwa | 1.x | 1.x | Yes | sanity only |
| TypeScript | 5.x | 7.0.x (7.0 GA 2026-07-08; 6.0 GA 2026-03-23) | **NO: two majors behind.** Use 7.0.x. Note: 7.0 has no stable programmatic API yet (expected in 7.1). If typescript-eslint or other tools break, fall back to 6.0 or use `@typescript/typescript6` | https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ |
| Vite | 8.x | 8.1.x (8.1 released 2026-06-23) | Yes | https://vite.dev/blog/announcing-vite8-1 |
| TanStack Query | 5.x | 5.9x (no v6 found) | Yes (low confidence on latest minor) | https://www.skills.sh/jezweb/claude-skills/tanstack-query |
| Zustand | 5.x | 5.0.x (no v6 found) | Yes (minor not confirmed) | https://github.com/pmndrs/zustand/releases/tag/v5.0.0 |
| Tailwind CSS | 4.x | 4.3.x (4.3.1, 2026-06) | Yes | https://releases.sh/tailwind-css/tailwind-css.md |
| react-i18next | 15.x | 17.1.x | **NO: two majors behind.** Use 17.x | https://unpkg.com/react-i18next@17.1.13/README.md |
| @stomp/stompjs | 7.x | 7.3.0 (7.4 in beta) | Yes | https://packages.ecosyste.ms/api/v1/registries/npmjs.org/packages/@stomp%2Fstompjs |
| Caddy | 2.x | 2.11.8 | Yes (pin 2.11) | https://newreleases.io/project/github/caddyserver/caddy/release/v2.11.8 |
| Valkey | 8.1 | 9.1.x (9.0 GA 2025-09; 9.1 GA 2026) | **NO: one major behind.** Use 9.1 | https://valkey.io/blog/introducing-valkey-9/ ; https://techstrong.it/featured/valkey-9-1-sharpens-performance-and-security-controls/ |
| Maven | 3.9.x | 3.9.16 (4.0.0 still RC, rc-6) | Yes | https://maven.apache.org/docs/history.html |
| React | 19.2 | 19.3.0 (2026-09-09) | Outdated minor. Use 19.3 | https://react.dev/blog/2026/09/09/react-19-3 |
| Docker Compose | v2 | v2 | Yes | n/a |
| OVHcloud VPS Mumbai | VPS Mumbai 2 vCPU/4 GB | The OVH India VPS page lists Mumbai for APAC VPS. The DE/ES pages contradict it. APAC bandwidth is capped at 10 Mbps after the monthly quota | Likely yes. Verify on the order page. Check the APAC bandwidth quota | https://www.ovhcloud.com/en-in/vps/vps-india/ |

## Flags
1. TypeScript 5.x: change to 7.0.x. If lint or tooling breaks, use 6.0.
2. react-i18next 15.x: change to 17.x.
3. Valkey 8.1: change to 9.1.
4. React 19.2: change to 19.3.
5. OVH Mumbai VPS: the OVH pages conflict, so confirm on the order page. The 10 Mbps cap after the quota could limit WebSocket game traffic.

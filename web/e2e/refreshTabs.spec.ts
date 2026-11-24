import { expect, test, type BrowserContext, type Route } from '@playwright/test';

// Epic 2 action A6 (Story 2.2): "reuse detection never fires for the app's own tabs (tested with two contexts)".
// Two tabs of one browser context share the cookie jar and the real navigator.locks. The refresh endpoint is a small
// model of core's rotation: the cookie in the request must be the current one; a token that was already rotated is
// reuse (401 session_ended). A reply is delayed so that, without the lock, the two tabs' refreshes overlap.

const REFRESH = '**/api/core/v1/auth/refresh';
const REPLY_DELAY_MS = 400;

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const accessToken = () => `${b64({ alg: 'RS256', kid: 'e2e' })}.${b64({ sub: 'u-anju', roles: ['USER'], lang: 'en', name: 'Anju' })}.c2ln`;

type Model = { refreshes: number; reuses: number; rejected: number };

/** Core's rotation, as far as the browser can tell: one live token, every earlier one is reuse. */
async function installRefreshModel(context: BrowserContext): Promise<Model> {
  const model: Model = { refreshes: 0, reuses: 0, rejected: 0 };
  const issued = ['t0'];
  let live = 't0';
  await context.addCookies([{ name: 'minnal_rt', value: live, url: 'http://localhost:4173' }]);
  await context.route(REFRESH, async (route: Route) => {
    const presented = /minnal_rt=([^;]+)/.exec(route.request().headers()['cookie'] ?? '')?.[1];
    let reply: { status: number; body: unknown; setCookie?: string };
    if (presented === live) {
      live = `t${issued.length}`;
      issued.push(live);
      model.refreshes += 1;
      reply = {
        status: 200,
        body: { accessToken: accessToken(), expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
        setCookie: `minnal_rt=${live}; Path=/`,
      };
    } else if (presented !== undefined && issued.includes(presented)) {
      model.reuses += 1;
      reply = { status: 401, body: { reason: 'session_ended' }, setCookie: 'minnal_rt=; Path=/; Max-Age=0' };
    } else {
      model.rejected += 1;
      reply = { status: 401, body: {} };
    }
    await new Promise((resolve) => setTimeout(resolve, REPLY_DELAY_MS));
    await route.fulfill({
      status: reply.status,
      contentType: 'application/json',
      headers: reply.setCookie ? { 'set-cookie': reply.setCookie } : {},
      body: JSON.stringify(reply.body),
    });
  });
  // Everything else core would answer is out of scope here: a plain 404 keeps the app on its own defaults.
  await context.route('**/api/core/v1/**', (route) =>
    route.request().url().endsWith('/auth/refresh') ? route.fallback() : route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
  );
  return model;
}

test('two tabs booting together refresh one after the other and reuse detection never fires', async ({ context }) => {
  const model = await installRefreshModel(context);
  const [a, b] = await Promise.all([context.newPage(), context.newPage()]);
  await Promise.all([a.goto('/'), b.goto('/')]);
  // The real Web Locks API is in play (a stubbed one is exactly what the unit tests already cover).
  expect(await a.evaluate(() => typeof navigator.locks?.request)).toBe('function');
  await Promise.all([a.getByText('Quick Match').first().waitFor(), b.getByText('Quick Match').first().waitFor()]);
  await expect.poll(() => model.refreshes + model.reuses + model.rejected, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);

  expect(model.reuses).toBe(0);
  expect(model.refreshes).toBe(2); // each tab got its own, in turn: the second used the cookie the first rotated
  for (const page of [a, b]) await expect(page.getByText('Please sign in again')).toHaveCount(0);
  expect((await context.cookies()).find((c) => c.name === 'minnal_rt')?.value).toBe('t2');
});

test('without the lock the same two tabs would be caught as reuse (the model has teeth)', async ({ context }) => {
  const model = await installRefreshModel(context);
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
  });
  const [a, b] = await Promise.all([context.newPage(), context.newPage()]);

  await Promise.all([a.goto('/'), b.goto('/')]);
  await expect.poll(() => model.refreshes + model.reuses, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);

  expect(model.reuses).toBeGreaterThanOrEqual(1);
});

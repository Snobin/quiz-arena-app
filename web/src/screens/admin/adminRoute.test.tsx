import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { guestSession, GUEST_TOKEN_PATH } from '../../auth/guestSession.ts';
import { REFRESH_PATH, session } from '../../auth/session.ts';
import i18n from '../../i18n.ts';
import { PROFILE_PATH, resetProfile } from '../../profile/profileStore.ts';
import { syncFromLocation } from '../../shell/router.ts';
import { guestTokenBody, jsonResponse, utf8Jwt } from '../../test-utils/guest.ts';

// Counts evaluations of the admin module: it must run only for an admin.
const adminLoaded = vi.hoisted(() => ({ count: 0 }));
vi.mock('../../admin/AdminApp.tsx', () => {
  adminLoaded.count += 1;
  return { default: () => <p>admin console</p> };
});

function renderApp(path: string) {
  window.history.pushState(null, '', path);
  syncFromLocation();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

/** Boots the session as a registered player with `roles`, or as a guest when roles is null. */
async function boot(roles: string[] | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === REFRESH_PATH) {
        return roles === null
          ? jsonResponse({ status: 401 }, 401, 'application/problem+json')
          : jsonResponse({ accessToken: utf8Jwt({ name: 'Snobin', roles }), expiresAt: new Date(Date.now() + 3600_000).toISOString() });
      }
      if (url === PROFILE_PATH) return jsonResponse({ displayName: 'Snobin', district: 'thrissur', examLevel: 'DEGREE', language: 'en', profileComplete: true });
      if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
      return jsonResponse({ status: 404 }, 404, 'application/problem+json');
    }),
  );
  session.start();
  await session.ready();
}

beforeEach(async () => {
  adminLoaded.count = 0;
  await act(() => i18n.changeLanguage('en'));
});

afterEach(() => {
  session.reset();
  resetProfile();
  guestSession.reset();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
});

describe('the /admin route guard', () => {
  it('shows "Not authorised" with a Home link to a signed-in player without ADMIN, and never loads the admin module', async () => {
    await boot(['USER']);
    renderApp('/admin');
    expect(await screen.findByRole('heading', { name: 'Not authorised' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(adminLoaded.count).toBe(0);
  });

  it('treats every /admin/* path the same way', async () => {
    await boot(['USER']);
    renderApp('/admin/drafts');
    expect(await screen.findByRole('heading', { name: 'Not authorised' })).toBeTruthy();
    expect(adminLoaded.count).toBe(0);
  });

  it('sends a guest through sign-in with returnTo=/admin, without loading admin code', async () => {
    await boot(null);
    renderApp('/admin');
    await waitFor(() => expect(window.location.pathname).toBe('/sign-in'));
    expect(window.location.search).toBe('?returnTo=/admin');
    expect(adminLoaded.count).toBe(0);
  });

  it('loads the admin chunk for an ADMIN token', async () => {
    await boot(['USER', 'ADMIN']);
    renderApp('/admin');
    expect(await screen.findByText('admin console')).toBeTruthy();
    expect(adminLoaded.count).toBe(1);
  });

  it('takes the role only from the token', async () => {
    await boot(['USER']);
    expect(session.isAdmin()).toBe(false);
    session.reset();
    await boot(['ADMIN']);
    expect(session.isAdmin()).toBe(true);
  });
});

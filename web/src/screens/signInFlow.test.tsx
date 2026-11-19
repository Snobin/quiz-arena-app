import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { guestSession } from '../auth/guestSession.ts';
import { REFRESH_PATH, session } from '../auth/session.ts';
import { PROFILE_PATH, resetProfile } from '../profile/profileStore.ts';
import i18n from '../i18n.ts';
import { resetAnnouncements, useAnnouncements } from '../shell/announce.ts';
import { clearReturnFocus } from '../shell/returnFocus.ts';
import { syncFromLocation } from '../shell/router.ts';
import { clearScrollMemory } from '../shell/scrollMemory.ts';
import { GUEST_TOKEN_PATH } from '../auth/guestSession.ts';
import { guestTokenBody, jsonResponse, utf8Jwt } from '../test-utils/guest.ts';

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

/** The refresh endpoint answers as a registered player named `name`, or 401 when `name` is null. */
function stubRefresh(name: string | null, reason?: string) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === REFRESH_PATH) {
      return name === null
        ? jsonResponse({ status: 401, ...(reason ? { reason } : {}) }, 401, 'application/problem+json')
        : jsonResponse({ accessToken: utf8Jwt({ name }), expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    }
    if (url === PROFILE_PATH) {
      return jsonResponse({
        displayName: name,
        district: 'thrissur',
        examLevel: 'DEGREE',
        language: i18n.language,
        profileComplete: true,
      });
    }
    if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
    return jsonResponse({ status: 404 }, 404, 'application/problem+json');
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function boot(name: string | null, reason?: string) {
  const fetchMock = stubRefresh(name, reason);
  session.start();
  await session.ready();
  return fetchMock;
}

beforeEach(async () => {
  await act(() => i18n.changeLanguage('en'));
});

afterEach(async () => {
  session.reset();
  resetProfile();
  guestSession.reset();
  clearReturnFocus();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  clearScrollMemory();
  resetAnnouncements();
  await act(() => i18n.changeLanguage('ml'));
});

describe('/auth/return', () => {
  it('restores the surface from `to`, focuses its heading and announces "Signed in as <name>" once', async () => {
    await boot('Anju');
    const polite = vi.fn();
    const stop = useAnnouncements.subscribe((state) => polite(state.polite.text));

    renderApp('/auth/return?to=/rooms');

    await waitFor(() => expect(window.location.pathname).toBe('/rooms'));
    expect(window.location.search).toBe('');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
    await waitFor(() => expect(polite).toHaveBeenCalled());
    stop();
    expect(polite.mock.calls.map(([text]) => text).filter(Boolean)).toEqual(['Signed in as Anju']);
  });

  it('inserts a Malayalam display name unchanged', async () => {
    await boot('അഞ്ജു');
    await act(() => i18n.changeLanguage('ml'));
    renderApp('/auth/return?to=/');
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    await waitFor(() => expect(useAnnouncements.getState().polite.text.trim()).toBe('സൈൻ ഇൻ ചെയ്തു: അഞ്ജു'));
  });

  it.each(['//evil.example/x', 'https://evil.example', 'javascript:alert(1)'])('never leaves the app for to=%s', async (to) => {
    await boot('Anju');
    renderApp(`/auth/return?to=${encodeURIComponent(to)}`);
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(window.location.origin).toBe('http://localhost:3000');
  });

  it('goes back to the surface with the failure note when no session came up', async () => {
    await boot(null);
    renderApp('/auth/return?to=/');
    await waitFor(() => expect(screen.getByTestId('signin-outcome')).toHaveTextContent("Sign-in didn't work. Please try again."));
    expect(screen.getByTestId('signin-outcome')).toHaveAttribute('role', 'alert');
    // The note is read once and the parameter is removed from the address.
    expect(window.location.search).toBe('');
    expect(screen.getByRole('heading', { level: 1, name: 'Playing as guest' })).toBeInTheDocument();
  });
});

describe('registered Home', () => {
  it('has no Sign-in nudge; Quick Match is playable; the other modes are unlocked but "Coming soon"', async () => {
    await boot('Anju');
    renderApp('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Hi, Anju' })).toBeInTheDocument();
    expect(screen.queryByTestId('sign-in-nudge')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
    expect(screen.queryByText('Sign in', { exact: true })).toBeNull();
    expect(screen.getByRole('button', { name: 'Quick Match' })).not.toHaveAttribute('aria-disabled');
    for (const mode of ['Topic Duel', 'Solo Practice', 'Battle Room']) {
      const row = screen.getByRole('button', { name: `${mode}, coming soon` });
      expect(row).toHaveAttribute('aria-disabled', 'true');
      expect(within(row).getByText('Coming soon')).toBeInTheDocument();
    }
    // A registered player never fetches a guest token.
    expect(vi.mocked(fetch).mock.calls.map(([input]) => String(input))).not.toContain(GUEST_TOKEN_PATH);
  });

  it('tapping a coming-soon row opens nothing', async () => {
    await boot('Anju');
    renderApp('/');
    (await screen.findByRole('button', { name: 'Topic Duel, coming soon' })).click();
    expect(window.location.pathname).toBe('/');
  });
});

describe('boot with a stale cookie', () => {
  it('shows guest Home with the nudge and the real Google button', async () => {
    await boot(null);
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Playing as guest' })).toBeInTheDocument();
    expect(within(screen.getByTestId('sign-in-nudge')).getByRole('button', { name: 'Continue with Google' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });
});

describe('session ended', () => {
  it('asks her to sign in again when the server ended the session', async () => {
    await boot(null, 'session_ended');
    renderApp('/');
    expect(await screen.findByTestId('session-ended')).toHaveTextContent('Please sign in again');
    expect(screen.getByRole('heading', { level: 1, name: 'Playing as guest' })).toBeInTheDocument();
  });

  it('says nothing after an ordinary boot with no cookie', async () => {
    await boot(null);
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Playing as guest' });
    expect(screen.queryByTestId('session-ended')).toBeNull();
  });
});

describe('sign-in outcome note', () => {
  it('says "Sign-in cancelled" after a cancel, as a quiet status, and removes the parameter', async () => {
    await boot(null);
    renderApp('/?signin=cancelled');
    const note = await screen.findByTestId('signin-outcome');
    expect(note).toHaveTextContent('Sign-in cancelled');
    expect(note).toHaveAttribute('role', 'status');
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('shows nothing for an unknown value', async () => {
    await boot(null);
    renderApp('/?signin=surprise');
    await screen.findByRole('heading', { level: 1, name: 'Playing as guest' });
    expect(screen.queryByTestId('signin-outcome')).toBeNull();
  });
});

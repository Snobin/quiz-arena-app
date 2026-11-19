import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { GUEST_TOKEN_PATH, guestSession } from '../auth/guestSession.ts';
import { REFRESH_PATH, session } from '../auth/session.ts';
import i18n from '../i18n.ts';
import { PROFILE_PATH, resetProfile } from '../profile/profileStore.ts';
import { resetAnnouncements, useAnnouncements } from '../shell/announce.ts';
import { clearReturnFocus } from '../shell/returnFocus.ts';
import { syncFromLocation } from '../shell/router.ts';
import { clearScrollMemory } from '../shell/scrollMemory.ts';
import { guestTokenBody, jsonResponse, utf8Jwt } from '../test-utils/guest.ts';

type Stored = { displayName: string; district: string; examLevel: string; language: string } | null;

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

/** A stateful fake core: refresh, the guest token, and GET/PUT of the profile. */
function stubCore(initial: Stored, { puts = [] as unknown[], reject = null as null | object } = {}) {
  let stored = initial;
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url === REFRESH_PATH) {
      return jsonResponse({
        accessToken: utf8Jwt({ name: stored?.displayName ?? 'Anju' }),
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });
    }
    if (url === PROFILE_PATH && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as NonNullable<Stored>;
      puts.push(body);
      if (reject) return jsonResponse(reject, 400, 'application/problem+json');
      stored = body;
      return jsonResponse({ ...body, profileComplete: true });
    }
    if (url === PROFILE_PATH) {
      return jsonResponse(
        stored
          ? { ...stored, profileComplete: true }
          : { displayName: null, district: null, examLevel: null, language: null, profileComplete: false },
      );
    }
    if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
    return jsonResponse({ status: 404 }, 404, 'application/problem+json');
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, puts, get stored() { return stored; } };
}

async function boot() {
  session.start();
  await session.ready();
}

const FULL: NonNullable<Stored> = { displayName: 'Anju', district: 'thrissur', examLevel: 'DEGREE', language: 'en' };

beforeEach(async () => {
  await act(() => i18n.changeLanguage('en'));
});

afterEach(async () => {
  session.reset();
  guestSession.reset();
  resetProfile();
  clearReturnFocus();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  clearScrollMemory();
  resetAnnouncements();
  await act(() => i18n.changeLanguage('ml'));
});

describe('profile setup', () => {
  it('opens first after sign-in for a new account: labelled fields, prefilled name and language, no district or level default', async () => {
    stubCore(null);
    await boot();
    renderApp('/auth/return?to=/rooms');

    expect(await screen.findByRole('heading', { level: 1, name: 'Set up your profile' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/profile/setup');
    expect(new URLSearchParams(window.location.search).get('to')).toBe('/rooms');
    expect(screen.getByLabelText('Display name')).toHaveValue('Anju'); // the Google given name passes the rule
    expect(screen.getByLabelText('District')).toHaveValue('');
    expect(screen.getByLabelText('Exam level')).toHaveValue('');
    expect(screen.getByLabelText('Language')).toHaveValue('en');
    expect(screen.getByLabelText('District').tagName).toBe('SELECT');
    expect(within(screen.getByLabelText('District')).getAllByRole('option')).toHaveLength(16); // placeholder + 15
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(1);
  });

  it('opens before any other surface when she comes back without having finished setup', async () => {
    stubCore(null);
    await boot();
    renderApp('/rooms');
    expect(await screen.findByRole('heading', { level: 1, name: 'Set up your profile' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Rooms' })).toBeNull();
  });

  it('keeps Quick Match from starting until setup is saved', async () => {
    stubCore(null);
    await boot();
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Set up your profile' });
    expect(screen.queryByRole('button', { name: 'Quick Match' })).toBeNull();
  });

  it('shows ⚠ text under each invalid field, links it, marks it invalid, focuses the first, and stores nothing', async () => {
    const user = userEvent.setup();
    const core = stubCore(null);
    await boot();
    renderApp('/profile/setup?to=/');
    const name = await screen.findByLabelText('Display name');
    await user.clear(name);
    await user.type(name, 'A');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(name).toHaveFocus();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    const nameError = document.getElementById(name.getAttribute('aria-describedby')!)!;
    expect(nameError).toHaveTextContent('⚠ Use 2–24 letters');
    for (const label of ['District', 'Exam level']) {
      const field = screen.getByLabelText(label);
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(document.getElementById(field.getAttribute('aria-describedby')!)).toHaveTextContent('⚠');
    }
    expect(core.puts).toHaveLength(0);
  });

  it('saves a valid form, refreshes the token, and goes on to where she was going', async () => {
    const user = userEvent.setup();
    const core = stubCore(null);
    await boot();
    renderApp('/auth/return?to=/rooms');
    await screen.findByRole('heading', { level: 1, name: 'Set up your profile' });
    await user.selectOptions(screen.getByLabelText('District'), 'kozhikode');
    await user.selectOptions(screen.getByLabelText('Exam level'), 'TENTH');
    const refreshesBefore = core.calls.filter((c) => c.endsWith(REFRESH_PATH)).length;

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(window.location.pathname).toBe('/rooms'));
    expect(core.puts).toEqual([{ displayName: 'Anju', district: 'kozhikode', examLevel: 'TENTH', language: 'en' }]);
    expect(core.calls.filter((c) => c.endsWith(REFRESH_PATH)).length).toBe(refreshesBefore + 1);
  });

  it('shows the server field errors when a PUT skips the client validator', async () => {
    const user = userEvent.setup();
    stubCore(null, { reject: { status: 400, errors: [{ field: 'displayName', code: 'reserved', message: 'x' }] } });
    await boot();
    renderApp('/profile/setup?to=/');
    await screen.findByLabelText('Display name');
    await user.selectOptions(screen.getByLabelText('District'), 'kollam');
    await user.selectOptions(screen.getByLabelText('Exam level'), 'OTHER');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const name = screen.getByLabelText('Display name');
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'));
    expect(document.getElementById(name.getAttribute('aria-describedby')!)).toHaveTextContent('⚠ Choose a different name');
    expect(name).toHaveFocus();
  });

  it('switches the whole UI at once when the language changes, keeps focus, announces it, and saves nothing', async () => {
    const user = userEvent.setup();
    const core = stubCore(null);
    await boot();
    renderApp('/profile/setup?to=/');
    const language = await screen.findByLabelText('Language');
    await user.selectOptions(language, 'ml');

    await waitFor(() => expect(document.documentElement.lang).toBe('ml'));
    expect(screen.getByRole('heading', { level: 1, name: 'പ്രൊഫൈൽ സജ്ജമാക്കാം' })).toBeInTheDocument();
    expect(document.title).toContain('പ്രൊഫൈൽ');
    expect(screen.getByLabelText('ഭാഷ')).toHaveFocus();
    await waitFor(() => expect(useAnnouncements.getState().polite.text.trim()).toBe('ഭാഷ മലയാളം'));
    expect(core.puts).toHaveLength(0);
  });
});

describe('setup gate edge cases', () => {
  it('sends a guest who opens /profile/setup on to the surface in `to`', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === GUEST_TOKEN_PATH ? jsonResponse(guestTokenBody('en')) : jsonResponse({ status: 401 }, 401, 'application/problem+json'),
      ),
    );
    await boot();
    renderApp('/profile/setup?to=/rooms');
    await waitFor(() => expect(window.location.pathname).toBe('/rooms'));
  });

  it('sends a player who already has a profile away from /profile/setup instead of showing a blank form', async () => {
    stubCore(FULL);
    await boot();
    renderApp('/profile/setup?to=/me');
    await waitFor(() => expect(window.location.pathname).toBe('/me'));
    expect(screen.queryByRole('heading', { level: 1, name: 'Set up your profile' })).toBeNull();
  });

  it('after sign-in, a failed profile load goes on to `to` and never into setup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === REFRESH_PATH) {
          return jsonResponse({ accessToken: utf8Jwt({ name: 'Anju' }), expiresAt: new Date(Date.now() + 3600_000).toISOString() });
        }
        return jsonResponse({ status: 500 }, 500, 'application/problem+json');
      }),
    );
    await boot();
    renderApp('/auth/return?to=/rooms');
    await waitFor(() => expect(window.location.pathname).toBe('/rooms'));
    expect(screen.queryByRole('heading', { level: 1, name: 'Set up your profile' })).toBeNull();
  });

  it('ignores a profile response that arrives after sign-out', async () => {
    let release: (response: Response) => void = () => undefined;
    const gate = new Promise<Response>((resolve) => (release = resolve));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === REFRESH_PATH) {
          return jsonResponse({ accessToken: utf8Jwt({ name: 'Anju' }), expiresAt: new Date(Date.now() + 3600_000).toISOString() });
        }
        return url === PROFILE_PATH ? gate : jsonResponse({ status: 404 }, 404, 'application/problem+json');
      }),
    );
    await boot();
    const { ensureProfileLoaded, useProfile } = await import('../profile/profileStore.ts');
    const loading = ensureProfileLoaded();
    resetProfile(); // sign-out while the GET is in flight
    release(jsonResponse({ ...FULL, profileComplete: true }));
    await loading;
    expect(useProfile.getState()).toMatchObject({ status: 'idle', profile: null });
  });
});

describe('Me', () => {
  it('shows a registered player her profile, with Edit; Back without saving reverts a language preview', async () => {
    const user = userEvent.setup();
    const core = stubCore(FULL);
    await boot();
    renderApp('/me');

    const section = await screen.findByTestId('profile-section');
    expect(within(section).getByText('Anju')).toBeInTheDocument();
    expect(within(section).getByText('Thrissur')).toBeInTheDocument();
    expect(within(section).getByText('Degree')).toBeInTheDocument();
    expect(screen.queryByTestId('sign-in-nudge')).toBeNull();

    await user.click(within(section).getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Display name')).toHaveValue('Anju');
    await user.selectOptions(screen.getByLabelText('Language'), 'ml');
    await waitFor(() => expect(document.documentElement.lang).toBe('ml'));

    await user.click(screen.getByRole('button', { name: 'തിരികെ' }));

    await waitFor(() => expect(document.documentElement.lang).toBe('en'));
    expect(await screen.findByTestId('profile-section')).toBeInTheDocument();
    expect(core.puts).toHaveLength(0);
  });

  it('saves an edit and shows it', async () => {
    const user = userEvent.setup();
    const core = stubCore(FULL);
    await boot();
    renderApp('/me');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.selectOptions(screen.getByLabelText('District'), 'wayanad');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const section = await screen.findByTestId('profile-section');
    expect(within(section).getByText('Wayanad')).toBeInTheDocument();
    expect(core.puts).toHaveLength(1);
  });

  it('applies her saved language to the UI once the profile loads', async () => {
    stubCore({ ...FULL, language: 'ml' });
    await boot();
    renderApp('/me');
    await waitFor(() => expect(document.documentElement.lang).toBe('ml'));
  });

  it('shows a guest exactly one Sign-in nudge and no profile', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === GUEST_TOKEN_PATH ? jsonResponse(guestTokenBody('en')) : jsonResponse({ status: 401 }, 401, 'application/problem+json'),
      ),
    );
    await boot();
    renderApp('/me');
    expect(await screen.findAllByTestId('sign-in-nudge')).toHaveLength(1);
    expect(screen.queryByTestId('profile-section')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});

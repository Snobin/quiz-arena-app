import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { GUEST_TOKEN_PATH, guestSession } from '../auth/guestSession.ts';
import { clearAccountNotice } from '../auth/accountNotice.ts';
import { LOGOUT_PATH, ME_PATH, REFRESH_PATH, session } from '../auth/session.ts';
import i18n from '../i18n.ts';
import { useReduceEffectsStore } from '../motion/reduceEffects.ts';
import { PROFILE_PATH, resetProfile } from '../profile/profileStore.ts';
import { resetAnnouncements, useAnnouncements } from '../shell/announce.ts';
import { closeRealtime } from '../realtime/connection.ts';
import { syncFromLocation } from '../shell/router.ts';
import { clearScrollMemory } from '../shell/scrollMemory.ts';
import { guestTokenBody, jsonResponse, utf8Jwt } from '../test-utils/guest.ts';

vi.mock('../realtime/connection.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../realtime/connection.ts')>()),
  closeRealtime: vi.fn(),
}));

const FULL = { displayName: 'Anju', district: 'thrissur', examLevel: 'DEGREE', language: 'en' };

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

function stub({ registered, failPut = false }: { registered: boolean; failPut?: boolean }) {
  const calls: string[] = [];
  const puts: unknown[] = [];
  let deleteStatus = 204;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url === REFRESH_PATH) {
      return registered
        ? jsonResponse({ accessToken: utf8Jwt({ name: 'Anju' }), expiresAt: new Date(Date.now() + 3600_000).toISOString() })
        : jsonResponse({ status: 401 }, 401, 'application/problem+json');
    }
    if (url === PROFILE_PATH && init?.method === 'PUT' && failPut) return new Response(null, { status: 500 });
    if (url === PROFILE_PATH && init?.method === 'PUT') {
      puts.push(JSON.parse(String(init.body)));
      return jsonResponse({ ...JSON.parse(String(init.body)), profileComplete: true });
    }
    if (url === PROFILE_PATH) return jsonResponse({ ...FULL, profileComplete: true });
    if (url === LOGOUT_PATH) return new Response(null, { status: 204 });
    if (url === ME_PATH) return new Response(null, { status: deleteStatus });
    if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
    return jsonResponse({ status: 404 }, 404, 'application/problem+json');
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, puts, failDelete: () => (deleteStatus = 500) };
}

async function boot() {
  session.start();
  await session.ready();
}

beforeEach(async () => {
  window.localStorage.clear();
  vi.mocked(closeRealtime).mockClear();
  await act(() => i18n.changeLanguage('en'));
});

afterEach(async () => {
  session.reset();
  guestSession.reset();
  resetProfile();
  clearAccountNotice();
  useReduceEffectsStore.getState().setSetting('follow-phone');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  clearScrollMemory();
  resetAnnouncements();
  await act(() => i18n.changeLanguage('ml'));
});

describe('Settings', () => {
  it('a registered player sees Language, Reduce effects (Follow phone by default), Sign out and Delete account', async () => {
    stub({ registered: true });
    await boot();
    renderApp('/settings');
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Follow phone' })).toBeChecked();
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument();
  });

  it('a guest sees only Language and Reduce effects', async () => {
    stub({ registered: false });
    await boot();
    renderApp('/settings');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(screen.getByRole('group', { name: 'Reduce effects' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete account' })).toBeNull();
  });

  it('Reduce effects writes the device store only, never the profile', async () => {
    const user = userEvent.setup();
    const core = stub({ registered: true });
    await boot();
    renderApp('/settings');
    await user.click(await screen.findByRole('radio', { name: 'On' }));
    expect(useReduceEffectsStore.getState().setting).toBe('on');
    expect(core.puts).toHaveLength(0);
  });

  it('a registered player picking a language switches at once, announces it and saves the profile', async () => {
    const user = userEvent.setup();
    const core = stub({ registered: true });
    await boot();
    renderApp('/settings');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    await waitFor(() => expect(screen.getByRole('radio', { name: 'മലയാളം' })).toBeEnabled());
    await user.click(screen.getByRole('radio', { name: 'മലയാളം' }));
    await waitFor(() => expect(core.puts).toEqual([{ ...FULL, language: 'ml' }]));
    expect(i18n.resolvedLanguage).toBe('ml');
    expect(useAnnouncements.getState().polite.text).not.toBe('');
  });

  it('a guest picking a language keeps it on the device and saves no profile', async () => {
    const user = userEvent.setup();
    const core = stub({ registered: false });
    await boot();
    renderApp('/settings');
    await user.click(await screen.findByRole('radio', { name: 'മലയാളം' }));
    await waitFor(() => expect(window.localStorage.getItem('minnal.language')).toBe('ml'));
    expect(core.puts).toHaveLength(0);
  });

  it('Sign out calls logout, becomes a guest and shows guest Home', async () => {
    const user = userEvent.setup();
    const core = stub({ registered: true });
    await boot();
    renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(session.store.getState().status).toBe('guest'));
    expect(core.calls).toContain(`POST ${LOGOUT_PATH}`);
    expect(closeRealtime).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  it('Delete opens an alertdialog with focus on Cancel; Esc cancels and nothing is deleted', async () => {
    const user = userEvent.setup();
    const core = stub({ registered: true });
    await boot();
    renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Delete account' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Your ratings, board positions and history will be removed. This cannot be undone.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(core.calls).not.toContain(`DELETE ${ME_PATH}`);
  });

  it('confirming deletes the account, signs out to guest Home and says so politely', async () => {
    const user = userEvent.setup();
    const core = stub({ registered: true });
    await boot();
    renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Delete account' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    await waitFor(() => expect(session.store.getState().status).toBe('guest'));
    expect(core.calls).toContain(`DELETE ${ME_PATH}`);
    expect(closeRealtime).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('account-deleted')).toHaveTextContent('Your account was deleted');
    expect(useAnnouncements.getState().polite.text).toBe('Your account was deleted');
  });

  it('a failed deletion keeps her signed in and shows an error', async () => {
    const user = userEvent.setup();
    const core = stub({ registered: true });
    core.failDelete();
    await boot();
    renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Delete account' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't delete your account");
    expect(session.store.getState().status).toBe('registered');
    expect(closeRealtime).not.toHaveBeenCalled();
  });

  it('a failed language save restores the previous language and shows the alert', async () => {
    const user = userEvent.setup();
    stub({ registered: true, failPut: true });
    await boot();
    renderApp('/settings');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    await waitFor(() => expect(screen.getByRole('radio', { name: 'മലയാളം' })).toBeEnabled());
    await user.click(screen.getByRole('radio', { name: 'മലയാളം' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save your language");
    await waitFor(() => expect(i18n.resolvedLanguage).toBe('en'));
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
  });
});

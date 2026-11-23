import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { GUEST_TOKEN_PATH, guestSession } from '../../auth/guestSession.ts';
import { REFRESH_PATH, session } from '../../auth/session.ts';
import i18n from '../../i18n.ts';
import { resetInstall } from '../../install/installPrompt.ts';
import { PROFILE_PATH, resetProfile } from '../../profile/profileStore.ts';
import * as lastResult from '../../realtime/lastResult.ts';
import { resetRealtime } from '../../realtime/connection.ts';
import { parseMatchEnded } from '../../realtime/protocol.ts';
import { resetAnnouncements, useAnnouncements } from '../../shell/announce.ts';
import { clearReturnFocus } from '../../shell/returnFocus.ts';
import { syncFromLocation } from '../../shell/router.ts';
import { clearScrollMemory } from '../../shell/scrollMemory.ts';
import { guestTokenBody, jsonResponse, restartGuestSession, stubFetch, utf8Jwt } from '../../test-utils/guest.ts';
import { matchEnded } from '../../test-utils/realtime.ts';

/** Story 7.2: the install card on a registered player's results. */

const MATCH_ID = 'm-install';
const USER = 'user-install';
const KEY = `install:${USER}`;
const BENEFIT = 'Add Minnal to your home screen · it opens in one tap, even on slow data';

function storeResult(guest: boolean) {
  const raw = matchEnded(MATCH_ID, {
    participants: [
      { participantId: 'me', displayName: 'Anju', kind: guest ? 'GUEST' : 'USER', score: 7000, correctCount: 1, placement: 1 },
      { participantId: 'them', displayName: 'Rahul', kind: 'USER', score: 3000, correctCount: 1, placement: 2 },
    ],
    breakdown: { me: [{ pickedIndex: 0, correct: true, responseMs: 2000, points: 7000 }], them: [{ pickedIndex: 0, correct: true, responseMs: 2500, points: 3000 }] },
  }).payload;
  lastResult.save({ matchId: MATCH_ID, selfId: 'me', payload: parseMatchEnded(raw)!, guest });
}

function renderApp() {
  window.history.pushState(null, '', '/results');
  syncFromLocation();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

async function openRegistered() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === REFRESH_PATH) return jsonResponse({ accessToken: utf8Jwt({ name: 'Anju', sub: USER }), expiresAt: new Date(Date.now() + 3600_000).toISOString() });
      if (url === PROFILE_PATH) return jsonResponse({ displayName: 'Anju', district: 'thrissur', examLevel: 'DEGREE', language: 'en', profileComplete: true });
      if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
      return jsonResponse({ ratings: [], matches: [] });
    }),
  );
  storeResult(false);
  session.start();
  await session.ready();
  renderApp();
  await screen.findByTestId('results-actions');
}

/** A kept `beforeinstallprompt`, as the browser fires it. */
function fireInstallEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

const card = () => screen.queryByTestId('install-card');
const stored = () => JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as { firstMatchSeen: number; state: string } | null;

function setStandalone(on: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: on && query === '(display-mode: standalone)', addEventListener: () => {}, removeEventListener: () => {} }));
}

beforeEach(async () => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  resetInstall();
  setStandalone(false);
  await act(() => i18n.changeLanguage('en'));
});

afterEach(async () => {
  resetRealtime();
  session.reset();
  guestSession.reset();
  resetProfile();
  clearReturnFocus();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  clearScrollMemory();
  resetAnnouncements();
  resetInstall();
  await act(() => i18n.changeLanguage('ml'));
});

describe('the install card', () => {
  it('shows below the band and above the breakdown once the event is kept, with both controls', async () => {
    fireInstallEvent();
    await openRegistered();
    const node = await screen.findByTestId('install-card');
    expect(node).toHaveTextContent(BENEFIT);
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
    expect(node.compareDocumentPosition(screen.getByTestId('breakdown')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(node.closest('[data-testid="results-actions"]')).toBeNull();
    expect(stored()?.state).toBe('PENDING');
  });

  it('prevents the browser mini-infobar when the event fires', () => {
    expect(fireInstallEvent().defaultPrevented).toBe(true);
  });

  it('shows nothing without an install event, and the event arriving later brings it in', async () => {
    await openRegistered();
    expect(card()).toBeNull();
    expect(stored()?.state).toBe('PENDING');
    fireInstallEvent();
    expect(await screen.findByTestId('install-card')).toBeInTheDocument();
  });

  it('Install prompts; accepted removes the card, stores INSTALLED and announces it', async () => {
    const event = fireInstallEvent('accepted');
    await openRegistered();
    await userEvent.click(await screen.findByRole('button', { name: 'Install' }));
    await waitFor(() => expect(card()).toBeNull());
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(stored()?.state).toBe('INSTALLED');
    await waitFor(() => expect(useAnnouncements.getState().polite.text).toContain('Minnal installed'));
  });

  it('a dismissed browser dialog removes the card and stores DISMISSED', async () => {
    fireInstallEvent('dismissed');
    await openRegistered();
    await userEvent.click(await screen.findByRole('button', { name: 'Install' }));
    await waitFor(() => expect(card()).toBeNull());
    expect(stored()?.state).toBe('DISMISSED');
  });

  it('a prompt() that throws counts as dismissed', async () => {
    const event = fireInstallEvent();
    event.prompt.mockRejectedValue(new Error('no'));
    await openRegistered();
    await userEvent.click(await screen.findByRole('button', { name: 'Install' }));
    await waitFor(() => expect(card()).toBeNull());
    expect(stored()?.state).toBe('DISMISSED');
  });

  it('appinstalled removes the card, stores INSTALLED and announces it', async () => {
    fireInstallEvent();
    await openRegistered();
    await screen.findByTestId('install-card');
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    await waitFor(() => expect(card()).toBeNull());
    expect(stored()?.state).toBe('INSTALLED');
    await waitFor(() => expect(useAnnouncements.getState().polite.text).toContain('Minnal installed'));
  });

  it('Not now removes the card, stores DISMISSED and moves focus on', async () => {
    fireInstallEvent();
    await openRegistered();
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(card()).toBeNull();
    expect(stored()?.state).toBe('DISMISSED');
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.closest('[data-testid="install-card"]')).toBeNull();
  });

  it.each([['DISMISSED'], ['INSTALLED']])('does not show for a player whose state is %s', async (state) => {
    window.localStorage.setItem(KEY, JSON.stringify({ firstMatchSeen: 1, state }));
    fireInstallEvent();
    await openRegistered();
    expect(card()).toBeNull();
  });

  it('treats a failing storage read as dismissed', async () => {
    fireInstallEvent();
    const real = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
      if (key === KEY) throw new Error('blocked');
      return real.call(this, key);
    });
    await openRegistered();
    expect(card()).toBeNull();
  });

  it('does not show when running standalone', async () => {
    setStandalone(true);
    fireInstallEvent();
    await openRegistered();
    expect(card()).toBeNull();
  });

  it('does not show on a guest\'s results, which keep only the sign-in prompt', async () => {
    fireInstallEvent();
    stubFetch();
    restartGuestSession();
    storeResult(true);
    renderApp();
    expect(await screen.findByTestId('results-sign-in-prompt')).toBeInTheDocument();
    expect(card()).toBeNull();
  });

  it('on iOS Safari shows the instruction with a single Got it, and remembers it', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1');
    await openRegistered();
    const node = await screen.findByTestId('install-card');
    expect(node).toHaveTextContent('Tap Share, then Add to Home Screen');
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(card()).toBeNull();
    expect(stored()?.state).toBe('DISMISSED');
  });

  it('shows nothing in iOS Chrome or another browser with no install path', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120 Mobile/15E148 Safari/604.1');
    await openRegistered();
    expect(card()).toBeNull();
  });

  it('renders in Malayalam', async () => {
    fireInstallEvent();
    await openRegistered();
    await act(() => i18n.changeLanguage('ml'));
    expect(await screen.findByRole('button', { name: 'ഇൻസ്റ്റാൾ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ഇപ്പോൾ വേണ്ട' })).toBeInTheDocument();
  });
});

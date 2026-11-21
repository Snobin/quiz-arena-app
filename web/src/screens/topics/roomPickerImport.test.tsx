import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { GUEST_TOKEN_PATH, guestSession } from '../../auth/guestSession.ts';
import { REFRESH_PATH, session } from '../../auth/session.ts';
import i18n from '../../i18n.ts';
import { PROFILE_PATH, resetProfile } from '../../profile/profileStore.ts';
import { syncFromLocation } from '../../shell/router.ts';
import { guestTokenBody, jsonResponse, utf8Jwt } from '../../test-utils/guest.ts';
import { RECENT_TOPICS_PATH, TOPICS_PATH } from './topicsApi.ts';

// The rooms chunk fails to load (offline, or a chunk fetch error).
vi.mock('../rooms/pickerReturn.ts', () => {
  throw new Error('chunk failed');
});

beforeEach(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === REFRESH_PATH) return jsonResponse({ accessToken: utf8Jwt({ name: 'Anju' }), expiresAt: new Date(Date.now() + 3600_000).toISOString() });
      if (url === PROFILE_PATH) return jsonResponse({ displayName: 'Anju', district: 'thrissur', examLevel: 'DEGREE', language: 'en', profileComplete: true });
      if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
      if (url === TOPICS_PATH) return jsonResponse({ category: 'KERALA_PSC', minQuestions: 10, subjects: [{ subjectId: 's', name: 'History', topics: [{ topicId: 't1', name: 'Kerala History', publishedCount: 50 }] }] });
      if (url === RECENT_TOPICS_PATH) return jsonResponse([]);
      if (url.startsWith(`${RECENT_TOPICS_PATH}/`)) return new Response(null, { status: 204 });
      return jsonResponse({ status: 404 }, 404, 'application/problem+json');
    }),
  );
  await act(() => i18n.changeLanguage('en'));
});

afterEach(async () => {
  session.reset();
  guestSession.reset();
  resetProfile();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  await act(() => i18n.changeLanguage('ml'));
});

describe('topic picker for a room', () => {
  it('goes to the Rooms tab when the rooms chunk cannot load, with no unhandled rejection', async () => {
    session.start();
    await session.ready();
    window.history.pushState(null, '', '/play/topics?for=room');
    syncFromLocation();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </QueryClientProvider>,
    );
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Kerala History, History, 50 questions' }, { timeout: 8000 }));
    await waitFor(() => expect(window.location.pathname).toBe('/rooms'));
  });
});

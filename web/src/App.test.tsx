import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import { guestSession } from './auth/guestSession.ts';
import './i18n.ts';
import { restartGuestSession, stubFetch } from './test-utils/guest.ts';

function renderApp(path: string) {
  window.history.pushState({}, '', path);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

describe('App', () => {
  beforeEach(() => {
    stubFetch();
    restartGuestSession();
  });

  afterEach(() => {
    guestSession.reset();
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
  });

  it('renders guest Home at / with the brand, the guest header and the Home title', async () => {
    renderApp('/');
    expect(screen.getByRole('heading', { level: 1, name: 'അതിഥിയായി കളിക്കുന്നു' })).toBeInTheDocument();
    expect(screen.getByText('മിന്നൽ', { selector: '.sr-only' })).toBeInTheDocument();
    expect(document.title).toBe('ഹോം · മിന്നൽ');
    // The scaffold probe is gone: no request to /api/core/v1/ping.
    await screen.findByRole('button', { name: 'ക്വിക്ക് മാച്ച്' });
    const urls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes('/ping'))).toBe(false);
  });

  it.each(['/__design', '/__design/'])('renders the dev design fixture at %s', async (path) => {
    expect(import.meta.env.DEV).toBe(true);
    renderApp(path);
    expect(await screen.findByRole('heading', { level: 1, name: /design fixture/ })).toBeInTheDocument();
  });

  it.each(['/__shaping', '/__shaping/'])('renders the dev shaping fixture at %s', async (path) => {
    renderApp(path);
    expect(await screen.findByRole('heading', { level: 1, name: 'Malayalam shaping fixture' })).toBeInTheDocument();
    expect(screen.getAllByText(/ക്ഷ/).length).toBeGreaterThan(0);
    expect(document.querySelector('.font-face-live')).not.toBeNull();
  });
});

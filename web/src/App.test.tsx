import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import './i18n.ts';

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
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: 404, title: 'Not Found' }), {
            status: 404,
            headers: { 'content-type': 'application/problem+json' },
          }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
  });

  it('renders the shell at / with the BrandMark and tagline', async () => {
    renderApp('/');
    expect(screen.getByRole('heading', { level: 1, name: 'മിന്നൽ' })).toBeInTheDocument();
    expect(screen.getByText('സ്കാഫോൾഡ് പ്രവർത്തിക്കുന്നു')).toBeInTheDocument();
    expect(await screen.findByText('404 Not Found')).toBeInTheDocument();
    expect(screen.getByText('404 Not Found').closest('[lang]')).toHaveAttribute('lang', 'en');
    expect(document.title).toBe('മിന്നൽ');
  });

  it('shows the catalogue probe text when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad gateway', { status: 502 })));
    renderApp('/');
    expect(await screen.findByText('API ലഭ്യമല്ല')).toBeInTheDocument();
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

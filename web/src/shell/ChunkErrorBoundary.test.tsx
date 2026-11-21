import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n.ts';
import { ChunkErrorBoundary, isChunkLoadError } from './ChunkErrorBoundary.tsx';
import { lazyWithRetry } from './lazyWithRetry.ts';

function Screen() {
  return (
    <main>
      <h1>Loaded screen</h1>
    </main>
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ChunkErrorBoundary', () => {
  it('renders children untouched when nothing fails', () => {
    render(
      <ChunkErrorBoundary>
        <Screen />
      </ChunkErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'Loaded screen' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('shows the fallback, focuses its heading, and Retry re-imports the screen', async () => {
    const load = vi
      .fn<() => Promise<{ default: typeof Screen }>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module: /x.js'))
      .mockResolvedValueOnce({ default: Screen });
    const Lazy = lazyWithRetry(load);
    render(
      <ChunkErrorBoundary>
        <Suspense fallback={null}>
          <Lazy />
        </Suspense>
      </ChunkErrorBoundary>,
    );
    const heading = await screen.findByRole('heading', { name: 'This screen could not load' });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(heading).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Loaded screen' })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('logs and shows the fallback for other render errors too', () => {
    function Boom(): never {
      throw new Error('boom');
    }
    render(
      <ChunkErrorBoundary>
        <Boom />
      </ChunkErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });

  it('renders nothing for a silent boundary when the import fails', async () => {
    const Lazy = lazyWithRetry(() => Promise.reject(new Error('Importing a module script failed.')));
    const { container } = render(
      <ChunkErrorBoundary variant="silent">
        <Suspense fallback={null}>
          <Lazy />
        </Suspense>
      </ChunkErrorBoundary>,
    );
    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('recognises chunk-load errors', () => {
    expect(isChunkLoadError(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('boom'))).toBe(false);
  });
});

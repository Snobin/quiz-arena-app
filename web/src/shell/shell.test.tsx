import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { guestSession } from '../auth/guestSession.ts';
import '../i18n.ts';
import { restartGuestSession, stubFetch } from '../test-utils/guest.ts';
import { clearReturnFocus } from './returnFocus.ts';
import { resetAnnouncements } from './announce.ts';
import { syncFromLocation } from './router.ts';
import { clearScrollMemory } from './scrollMemory.ts';
import { TabBar } from './TabBar.tsx';
import { useHideTabBar } from './useHideTabBar.ts';

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

const nav = () => screen.getByRole('navigation', { name: 'പ്രധാന മെനു' });
const tab = (name: string) => within(nav()).getByRole('link', { name });

let online = true;

beforeEach(() => {
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  stubFetch();
  restartGuestSession();
});

afterEach(() => {
  guestSession.reset();
  clearReturnFocus();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  clearScrollMemory();
  resetAnnouncements();
});

describe('tab bar', () => {
  it('renders the four tabs in a labelled nav, with aria-current on the active one', () => {
    renderApp('/ranks');
    const links = within(nav()).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['കളി', 'റൂമുകൾ', 'റാങ്ക്', 'ഞാൻ']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/', '/rooms', '/ranks', '/me']);
    expect(tab('റാങ്ക്')).toHaveAttribute('aria-current', 'page');
    for (const name of ['കളി', 'റൂമുകൾ', 'ഞാൻ']) expect(tab(name)).not.toHaveAttribute('aria-current');
    expect(tab('റാങ്ക്').className).toContain('font-bold');
    expect(tab('കളി').className).toContain('text-muted');
  });

  it('switches screens and titles on tab clicks', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(tab('റൂമുകൾ'));
    expect(await screen.findByRole('heading', { level: 1, name: 'റൂമുകൾ' })).toBeInTheDocument();
    expect(document.title).toBe('റൂമുകൾ · മിന്നൽ');
    expect(window.location.pathname).toBe('/rooms');
    await user.click(tab('ഞാൻ'));
    expect(await screen.findByRole('heading', { level: 1, name: 'ഞാൻ' })).toBeInTheDocument();
    expect(tab('ഞാൻ')).toHaveAttribute('aria-current', 'page');
  });

  it('renders Play for an unknown path', () => {
    renderApp('/nope');
    expect(screen.getByRole('heading', { level: 1, name: 'അതിഥിയായി കളിക്കുന്നു' })).toBeInTheDocument();
    expect(tab('കളി')).toHaveAttribute('aria-current', 'page');
  });

  it('is hidden while a route calls useHideTabBar, and publishes --fixed-bar-height while shown', () => {
    function LiveMatchStub() {
      useHideTabBar();
      return null;
    }
    const { rerender } = render(<TabBar />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue('--fixed-bar-height')).toMatch(/px$/);
    rerender(
      <>
        <TabBar />
        <LiveMatchStub />
      </>,
    );
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--fixed-bar-height')).toBe('');
    rerender(<TabBar />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('does not render outside the shell (dev fixtures)', async () => {
    renderApp('/__flash');
    expect(await screen.findByRole('heading', { level: 1, name: 'Flash scheduler fixture' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

describe('focus on navigation', () => {
  it('moves focus to the new screen heading after a tab click, but not on first load', async () => {
    const user = userEvent.setup();
    renderApp('/');
    expect(document.activeElement).toBe(document.body);
    expect(screen.getByRole('heading', { level: 1, name: 'അതിഥിയായി കളിക്കുന്നു' })).toHaveAttribute('tabindex', '-1');
    await user.click(tab('റൂമുകൾ'));
    expect(screen.getByRole('heading', { level: 1, name: 'റൂമുകൾ' })).toHaveFocus();
    await user.click(tab('കളി'));
    expect(screen.getByRole('heading', { level: 1, name: 'അതിഥിയായി കളിക്കുന്നു' })).toHaveFocus();
  });

  it('focuses without scrolling, so the scroll restore wins', async () => {
    const user = userEvent.setup();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    renderApp('/');
    await user.click(tab('ഞാൻ'));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});

describe('matrix: tab return', () => {
  it('scroll Ranks to 600, go to Me, back to Ranks: Ranks at 600', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    let scrollY = 0;
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY);
    renderApp('/ranks');

    scrollY = 600;
    await user.click(tab('ഞാൻ'));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);

    scrollY = 0;
    await user.click(tab('റാങ്ക്'));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 600);
  });
});

describe('matrix: back button', () => {
  it('/ → /rooms → browser back: Play renders with its tab active', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(tab('റൂമുകൾ'));
    expect(screen.getByRole('heading', { level: 1, name: 'റൂമുകൾ' })).toBeInTheDocument();
    act(() => window.history.back());
    expect(await screen.findByRole('heading', { level: 1, name: 'അതിഥിയായി കളിക്കുന്നു' })).toBeInTheDocument();
    expect(tab('കളി')).toHaveAttribute('aria-current', 'page');
  });
});

describe('matrix: go offline', () => {
  const setOnline = (value: boolean) =>
    act(() => {
      online = value;
      window.dispatchEvent(new Event(value ? 'online' : 'offline'));
    });

  const banner = 'ഇന്റർനെറ്റ് ഇല്ല. കണക്ഷൻ തിരിച്ചു വന്നാൽ കളിക്കാം.';
  const bannerShown = () => screen.queryAllByText(banner).filter((el) => el !== screen.getByRole('status'));

  it('shows the banner, announces it once per episode, and disables Quick Match with a caption', async () => {
    renderApp('/');
    const status = screen.getByRole('status');
    const quickMatch = screen.getByRole('button', { name: 'ക്വിക്ക് മാച്ച്' });
    await waitFor(() => expect(quickMatch).not.toHaveAttribute('aria-disabled'));
    // Let the live regions finish mounting before the first episode.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    setOnline(false);
    await waitFor(() => expect(status).toHaveTextContent(banner));
    expect(bannerShown()).toHaveLength(1);
    const disabled = screen.getByRole('button', { name: 'ക്വിക്ക് മാച്ച്' });
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    expect(disabled).toHaveAccessibleDescription(expect.stringContaining('കളിക്കാൻ ഇന്റർനെറ്റ് കണക്ഷൻ വേണം'));

    // A repeated offline event in the same episode is not announced again.
    const first = status.textContent;
    setOnline(false);
    await act(async () => {});
    expect(status.textContent).toBe(first);

    setOnline(true);
    await waitFor(() => expect(bannerShown()).toHaveLength(0));
    expect(screen.getByRole('button', { name: 'ക്വിക്ക് മാച്ച്' })).not.toHaveAttribute('aria-disabled');

    // A second episode is announced again (the region content changes).
    setOnline(false);
    await waitFor(() => expect(status.textContent).not.toBe(first));
    expect(status.textContent?.trim()).toBe(banner);
    expect(bannerShown()).toHaveLength(1);
  });

  it('booting offline ends with the notice in the polite region after the mount tick', async () => {
    online = false;
    renderApp('/');
    const status = screen.getByRole('status');
    expect(bannerShown()).toHaveLength(1);
    expect(status).toBeEmptyDOMElement();
    await waitFor(() => expect(status).toHaveTextContent(banner));
  });
});

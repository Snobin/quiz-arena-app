import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Link } from './Link.tsx';
import { navigate, setNavigationGuard, stripBase, syncFromLocation, useRouter, useRouterSync, withBase } from './router.ts';

afterEach(() => {
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  vi.restoreAllMocks();
});

describe('base handling', () => {
  it.each([
    ['/', '/', '/'],
    ['/rooms', '/', '/rooms'],
    ['/rooms/', '/', '/rooms'],
    ['/sub/', '/sub/', '/'],
    ['/sub', '/sub/', '/'],
    ['/sub/rooms', '/sub/', '/rooms'],
    ['/sub/rooms/', '/sub/', '/rooms'],
    ['/subway', '/sub/', '/subway'],
    ['/other', '/sub/', '/other'],
  ])('stripBase(%s, %s) is %s', (pathname, base, expected) => {
    expect(stripBase(pathname, base)).toBe(expected);
  });

  it.each([
    ['/', '/', '/'],
    ['/rooms', '/', '/rooms'],
    ['/', '/sub/', '/sub/'],
    ['/rooms', '/sub/', '/sub/rooms'],
    ['me', '/sub/', '/sub/me'],
  ])('withBase(%s, %s) is %s', (path, base, expected) => {
    expect(withBase(path, base)).toBe(expected);
  });
});

describe('navigate', () => {
  it('pushes a history entry and updates the store', () => {
    const before = window.history.length;
    navigate('/rooms');
    expect(window.location.pathname).toBe('/rooms');
    expect(useRouter.getState().pathname).toBe('/rooms');
    expect(window.history.length).toBe(before + 1);
  });

  it('replaces instead when asked, or when the path is unchanged', () => {
    navigate('/rooms');
    const length = window.history.length;
    navigate('/ranks', { replace: true });
    navigate('/ranks');
    expect(window.history.length).toBe(length);
    expect(useRouter.getState().pathname).toBe('/ranks');
  });

  it('keeps a query and hash on the URL but routes on the path alone', () => {
    navigate('/rooms?x=1#top');
    expect(useRouter.getState().pathname).toBe('/rooms');
    expect(window.location.pathname).toBe('/rooms');
    expect(window.location.search).toBe('?x=1');
    expect(window.location.hash).toBe('#top');
    navigate('/me#a');
    expect(useRouter.getState().pathname).toBe('/me');
    expect(window.location.hash).toBe('#a');
  });

  it('normalises a trailing slash', () => {
    navigate('/me/');
    expect(useRouter.getState().pathname).toBe('/me');
  });
});

describe('Link', () => {
  const renderLink = (props: Record<string, unknown> = {}) => {
    render(
      <Link to="/rooms" {...props}>
        Rooms
      </Link>,
    );
    return screen.getByRole('link', { name: 'Rooms' });
  };

  it('is a real anchor with the base-aware href', () => {
    expect(renderLink()).toHaveAttribute('href', '/rooms');
  });

  it('intercepts a plain left click and navigates in-app', () => {
    const link = renderLink();
    const notPrevented = fireEvent.click(link, { button: 0 });
    expect(notPrevented).toBe(false);
    expect(useRouter.getState().pathname).toBe('/rooms');
  });

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
    ['middle button', { button: 1 }],
  ])('leaves a %s click to the browser', (_, init) => {
    const link = renderLink();
    // Stop jsdom from attempting the navigation itself once the event is not prevented.
    link.addEventListener('click', (e) => {
      if (!e.defaultPrevented) {
        expect(useRouter.getState().pathname).toBe('/');
        e.preventDefault();
      }
    });
    const pushState = vi.spyOn(window.history, 'pushState');
    fireEvent.click(link, { button: 0, ...init });
    expect(pushState).not.toHaveBeenCalled();
    expect(useRouter.getState().pathname).toBe('/');
  });

  it('leaves download links to the browser', () => {
    const link = renderLink({ download: '' });
    link.addEventListener('click', (e) => e.preventDefault());
    const pushState = vi.spyOn(window.history, 'pushState');
    fireEvent.click(link, { button: 0 });
    expect(pushState).not.toHaveBeenCalled();
    expect(useRouter.getState().pathname).toBe('/');
  });

  it('leaves target=_blank links to the browser', () => {
    const link = renderLink({ target: '_blank' });
    link.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(link, { button: 0 });
    expect(useRouter.getState().pathname).toBe('/');
  });
});

describe('navigation guard on popstate', () => {
  /** On /edit with the router listening; then the browser moves to /other (as Back does) and fires popstate. */
  function backFromEdit() {
    window.history.replaceState(null, '', '/edit');
    syncFromLocation();
    renderHook(() => useRouterSync());
    window.history.pushState(null, '', '/other');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  it('blocked: asks the guard, restores the URL and keeps the store path', () => {
    const guard = vi.fn(() => true);
    const remove = setNavigationGuard(guard);
    backFromEdit();
    remove();
    expect(guard).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe('/edit');
    expect(useRouter.getState().pathname).toBe('/edit');
  });

  it('Stay: the proceed callback is never run, so nothing navigates', () => {
    const back = vi.spyOn(window.history, 'back');
    const remove = setNavigationGuard(() => true);
    backFromEdit();
    remove();
    expect(back).not.toHaveBeenCalled();
    expect(useRouter.getState().pathname).toBe('/edit');
  });

  it('Leave: proceed calls history.back once and the guard is not asked again', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    let proceed: (() => void) | null = null;
    const guard = vi.fn((p: () => void) => {
      proceed = p;
      return true;
    });
    const remove = setNavigationGuard(guard);
    backFromEdit();
    (proceed as (() => void) | null)?.();
    expect(back).toHaveBeenCalledOnce();
    // The browser's popstate from that back(): the guard is bypassed and the store follows the location.
    window.history.replaceState(null, '', '/other');
    window.dispatchEvent(new PopStateEvent('popstate'));
    remove();
    expect(guard).toHaveBeenCalledOnce();
    expect(useRouter.getState().pathname).toBe('/other');
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Link } from './Link.tsx';
import { navigate, stripBase, syncFromLocation, useRouter, withBase } from './router.ts';

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

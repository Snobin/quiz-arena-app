import { describe, expect, it } from 'vitest';
import { safeReturnPath, signInPath } from './signInPath.ts';

const ORIGIN = 'https://minnal.example';

describe('signInPath', () => {
  it('keeps slashes readable', () => {
    expect(signInPath('/')).toBe('/sign-in?returnTo=/');
    expect(signInPath('/rooms?x=1')).toBe('/sign-in?returnTo=/rooms%3Fx%3D1');
  });
});

describe('safeReturnPath', () => {
  it.each([
    ['/', '/'],
    ['/rooms', '/rooms'],
    ['/rooms?tab=2#top', '/rooms?tab=2#top'],
  ])('keeps the in-app path %s', (value, expected) => {
    expect(safeReturnPath(value, ORIGIN)).toBe(expected);
  });

  it.each([
    null,
    '',
    'rooms',
    'https://evil.example/x',
    'javascript:alert(1)',
    '//evil.example/x',
    '/\t/evil.example/x',
    '/\n/evil.example/x',
    '/\r\n/evil.example',
    '/\\evil.example/x',
    '\\\\evil.example',
    '/\\/evil.example',
  ])('sends %j home', (value) => {
    expect(safeReturnPath(value, ORIGIN)).toBe('/');
  });
});

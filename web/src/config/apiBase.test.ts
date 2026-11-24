import { describe, expect, it } from 'vitest';
import { apiUrl, normalizeBase, wsUrl } from './apiBase.ts';

describe('apiBase', () => {
  it('stays same-origin when unset or blank', () => {
    expect(normalizeBase(undefined)).toBe('');
    expect(apiUrl('/api/core/v1/auth/guest', '')).toBe('/api/core/v1/auth/guest');
    expect(wsUrl('/ws', '', { protocol: 'https:', host: 'minnal.pages.dev' })).toBe('wss://minnal.pages.dev/ws');
    expect(wsUrl('/ws', '  ', { protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/ws');
  });

  it('prefixes HTTP calls with the base and drops trailing slashes', () => {
    expect(apiUrl('/api/core/v1/auth/guest', 'https://api.example.com/')).toBe('https://api.example.com/api/core/v1/auth/guest');
  });

  it('derives the WebSocket URL from the base', () => {
    expect(wsUrl('/ws', 'https://api.example.com')).toBe('wss://api.example.com/ws');
    expect(wsUrl('/ws', 'http://localhost:8080/')).toBe('ws://localhost:8080/ws');
  });
});

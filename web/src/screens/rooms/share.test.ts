import { describe, expect, it, vi } from 'vitest';
import { copyText, shareRoom } from './share.ts';

const CONTENT = { title: 'Minnal Battle Room', text: 'Join my Minnal Battle Room · K7M-Q2X', url: 'https://minnal.example/r/K7M-Q2X' };

describe('shareRoom', () => {
  it('opens the share sheet with the title, text and url', async () => {
    const share = vi.fn(async () => undefined);
    expect(await shareRoom(CONTENT, { share })).toBe('shared');
    expect(share).toHaveBeenCalledWith(CONTENT);
  });

  it('copies the text and link together where navigator.share is missing', async () => {
    const writeText = vi.fn(async () => undefined);
    expect(await shareRoom(CONTENT, { writeText })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(`${CONTENT.text}\n${CONTENT.url}`);
  });

  it('does nothing when the share sheet is cancelled', async () => {
    const writeText = vi.fn(async () => undefined);
    const share = vi.fn(async () => {
      throw new DOMException('cancelled', 'AbortError');
    });
    expect(await shareRoom(CONTENT, { share, writeText })).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to the clipboard when the share sheet fails for another reason, and reports a refused clipboard', async () => {
    const share = vi.fn(async () => {
      throw new Error('boom');
    });
    expect(await shareRoom(CONTENT, { share, writeText: async () => undefined })).toBe('copied');
    expect(await shareRoom(CONTENT, { share, writeText: async () => Promise.reject(new Error('denied')) })).toBe('failed');
    expect(await shareRoom(CONTENT, {})).toBe('failed');
  });
});

describe('copyText', () => {
  it('is false when the clipboard refuses', async () => {
    expect(await copyText('K7M-Q2X', { writeText: async () => Promise.reject(new Error('denied')) })).toBe(false);
    expect(await copyText('K7M-Q2X', { writeText: async () => undefined })).toBe(true);
  });
});

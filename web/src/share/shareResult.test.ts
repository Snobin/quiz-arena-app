import { beforeAll, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n.ts';
import { CASES, SELF } from './cardFixtures.ts';
import { buildCardText } from './cardText.ts';
import { fontReady, shareResult } from './shareResult.ts';

const payload = CASES[0]!.payload;
const BLOB = new Blob(['png'], { type: 'image/png' });

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

function env(over: Record<string, unknown> = {}) {
  return {
    canShare: vi.fn(() => true),
    share: vi.fn(async () => undefined),
    download: vi.fn(),
    copy: vi.fn(async () => true),
    render: vi.fn(async () => BLOB),
    ready: vi.fn(async () => undefined),
    ...over,
  } as Parameters<typeof shareResult>[2] & { share: ReturnType<typeof vi.fn>; download: ReturnType<typeof vi.fn>; copy: ReturnType<typeof vi.fn> };
}

describe('sharing the card', () => {
  it('shares the PNG file with the line and the link when the browser can share files', async () => {
    const e = env();
    expect(await shareResult(payload, SELF, e)).toEqual({ outcome: 'shared' });
    const data = (e.share as ReturnType<typeof vi.fn>).mock.calls[0]![0] as ShareData;
    expect(data.files).toHaveLength(1);
    expect(data.files![0]!.name).toBe('minnal-result.png');
    expect(data.files![0]!.type).toBe('image/png');
    expect(data.text).toBe('I beat Vishnu 7,840 – 7,420 on Minnal. Beat me:');
    expect(data.url).toMatch(/\/q$/);
    expect(e.download).not.toHaveBeenCalled();
  });

  it('a cancelled share sheet does nothing and shows nothing', async () => {
    const e = env({ share: vi.fn(async () => Promise.reject(new DOMException('cancelled', 'AbortError'))) });
    expect(await shareResult(payload, SELF, e)).toEqual({ outcome: 'cancelled' });
    expect(e.download).not.toHaveBeenCalled();
  });

  it('without file sharing it saves minnal-result.png and copies the text plus the link', async () => {
    const e = env({ canShare: undefined, share: undefined });
    expect(await shareResult(payload, SELF, e)).toEqual({ outcome: 'saved' });
    expect(e.download).toHaveBeenCalledWith(BLOB, 'minnal-result.png');
    const copied = (e.copy as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(copied).toContain('I beat Vishnu 7,840 – 7,420 on Minnal. Beat me:');
    expect(copied).toMatch(/\/q$/);
  });

  it('a refused clipboard returns the link so the note can show it as selectable text', async () => {
    const e = env({ canShare: vi.fn(() => false), copy: vi.fn(async () => false) });
    const result = await shareResult(payload, SELF, e);
    expect(result.outcome).toBe('savedLink');
    expect(result.outcome === 'savedLink' && result.url).toMatch(/\/q$/);
    expect(e.download).toHaveBeenCalled();
  });

  it('a share that fails for another reason falls back to the download', async () => {
    const e = env({ share: vi.fn(async () => Promise.reject(new Error('boom'))) });
    expect(await shareResult(payload, SELF, e)).toEqual({ outcome: 'saved' });
  });

  it('fails when no image can be drawn, and for a participant who is not in the match', async () => {
    expect(await shareResult(payload, SELF, env({ render: vi.fn(async () => null) }))).toEqual({ outcome: 'failed' });
    expect(await shareResult(payload, SELF, env({ render: vi.fn(async () => Promise.reject(new Error('canvas'))) }))).toEqual({ outcome: 'failed' });
    expect(await shareResult(payload, 'nobody', env())).toEqual({ outcome: 'failed' });
  });
});

describe('waiting for the font', () => {
  const card = buildCardText(payload, SELF, 'en')!;

  it('continues as soon as the face has loaded', async () => {
    const load = vi.fn(async () => []);
    await fontReady(card, { load } as never);
    expect(load).toHaveBeenCalled();
  });

  it('continues after 3 s when the font never resolves', async () => {
    vi.useFakeTimers();
    const pending = fontReady(card, { load: () => new Promise(() => undefined) } as never);
    let done = false;
    void pending.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(2900);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(done).toBe(true);
    vi.useRealTimers();
  });
});

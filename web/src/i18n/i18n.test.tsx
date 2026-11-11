import { act, render, screen } from '@testing-library/react';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '../design/BrandMark.tsx';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WEB_ROOT, checkSource } from '../../scripts/check-i18n.mjs';
import { fontsReady } from '../design/fonts.ts';
import i18n, { formatNumber, formatSigned, pendingSignoff } from '../i18n.ts';
import { Lang, detectLanguage } from './Lang.tsx';
import { useDocumentTitle } from './useDocumentTitle.ts';

afterEach(async () => {
  await act(() => i18n.changeLanguage('ml'));
});

describe('TBD Malayalam', () => {
  it('falls back to English and is flagged', () => {
    expect(i18n.language).toBe('ml');
    expect(i18n.t('share.cta')).toBe('Beat me on Minnal');
    expect(pendingSignoff()).toContainEqual({ key: 'share.cta', language: 'ml', reason: 'tbd' });
  });

  it('renders none-by-design strings as nothing, without falling back', async () => {
    await act(() => i18n.changeLanguage('en'));
    expect(i18n.t('result.winSlang')).toBe('');
  });

  it('handles plurals with _one / _other', () => {
    expect(i18n.t('lobby.waitingForMore', { count: 1 })).toBe('Waiting for 1 more player');
    expect(i18n.t('lobby.waitingForMore', { count: 3 })).toBe('Waiting for 3 more players');
  });
});

function Screen({ title }: { title?: boolean }) {
  const { t } = useTranslation();
  useDocumentTitle(title ? t('tab.ranks') : undefined);
  return <p>{t('match.locked')}</p>;
}

describe('language change', () => {
  it('syncs <html lang>, the title and catalogue strings (en -> ml)', async () => {
    await act(() => i18n.changeLanguage('en'));
    render(<Screen title />);
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('Ranks · Minnal');
    expect(screen.getByText('Locked in')).toBeInTheDocument();

    await act(() => i18n.changeLanguage('ml'));
    expect(document.documentElement.lang).toBe('ml');
    expect(document.title).toBe('റാങ്ക് · മിന്നൽ');
    expect(screen.getByText('ഉത്തരം ലോക്ക് ചെയ്തു')).toBeInTheDocument();
  });

  it('sets the brand alone without a title, in the UI language', async () => {
    render(<Screen />);
    expect(document.title).toBe('മിന്നൽ');
    await act(() => i18n.changeLanguage('en'));
    expect(document.title).toBe('Minnal');
  });

  it('restores the previous title on unmount', () => {
    document.title = 'before';
    const { unmount } = render(<Screen title />);
    expect(document.title).toBe('റാങ്ക് · മിന്നൽ');
    unmount();
    expect(document.title).toBe('before');
  });

  it('treats an unsupported language as Malayalam everywhere (strings, <html lang>, <Lang>, wordmark)', async () => {
    await act(() => i18n.changeLanguage('ta'));
    const { container } = render(
      <h1>
        <BrandMark />
        <Lang>Arjun K</Lang>
      </h1>,
    );
    expect(i18n.t('match.locked')).toBe('ഉത്തരം ലോക്ക് ചെയ്തു');
    expect(document.documentElement.lang).toBe('ml');
    expect(screen.getByText('മിന്നൽ', { selector: '.sr-only' })).toHaveAttribute('lang', 'ml');
    expect(container.querySelector('span[lang="en"]')).toHaveTextContent('Arjun K');
  });

  it('normalises regional variants for <html lang>', async () => {
    await act(() => i18n.changeLanguage('en-IN'));
    expect(document.documentElement.lang).toBe('en');
    expect(i18n.t('tab.play')).toBe('Play');
  });
});

describe('<Lang>', () => {
  it('wraps a Latin name in Malayalam UI', () => {
    const { container } = render(
      <p>
        <Lang>Arjun K</Lang>
      </p>,
    );
    expect(container.querySelector('span[lang="en"]')).toHaveTextContent('Arjun K');
  });

  it('renders a same-language run bare', () => {
    const { container } = render(
      <p>
        <Lang>മിന്നൽ</Lang>
      </p>,
    );
    expect(container.querySelector('span')).toBeNull();
    expect(container.querySelector('p')).toHaveTextContent('മിന്നൽ');
  });

  it('wraps a Malayalam run in English UI, and honours an explicit lang', async () => {
    await act(() => i18n.changeLanguage('en'));
    const { container } = render(
      <p>
        <Lang>മിന്നൽ</Lang>
        <Lang lang="en">BOT</Lang>
        <Lang lang="ml">EN</Lang>
      </p>,
    );
    const spans = [...container.querySelectorAll('span')].map((s) => [s.lang, s.textContent]);
    expect(spans).toEqual([
      ['ml', 'മിന്നൽ'],
      ['ml', 'EN'],
    ]);
  });

  it('detects Malayalam by script', () => {
    expect(detectLanguage('Arjun K')).toBe('en');
    expect(detectLanguage('Arjun · മറികടന്നു')).toBe('ml');
  });
});

describe('formatNumber', () => {
  it('uses Latin digits with Indian grouping', () => {
    expect(formatNumber(7840)).toBe('7,840');
    expect(`#${formatNumber(3406)}`).toBe('#3,406');
    expect(formatNumber(100000)).toBe('1,00,000');
    expect(formatSigned(24)).toBe('+24');
    expect(formatSigned(-8)).toBe('-8');
  });

  it('applies inside interpolation, in both UI languages', async () => {
    expect(i18n.t('match.reconnecting', { seconds: 100000 })).toBe('കണക്ഷൻ പോയി, തിരിച്ചു വരുന്നു… 1,00,000');
    expect(i18n.t('result.win', { delta: 1000 })).toBe('ജയിച്ചു! +1,000');
    await act(() => i18n.changeLanguage('en'));
    expect(i18n.t('join.full', { max: 100000 })).toBe('Room is full (1,00,000). Ask the host for a new room.');
  });
});

describe('fontsReady', () => {
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'fonts');
  });

  const stubFonts = (ready: Promise<unknown>) =>
    Object.defineProperty(document, 'fonts', { value: { ready }, configurable: true });

  it('resolves at the 3 s cap when fonts are slow', async () => {
    vi.useFakeTimers();
    stubFonts(new Promise(() => {}));
    let done = false;
    void fontsReady().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(2999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('resolves as soon as fonts are ready', async () => {
    vi.useFakeTimers();
    stubFonts(Promise.resolve());
    let done = false;
    void fontsReady().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  it('requests the optional Live face and waits for it, even when ready is already settled', async () => {
    vi.useFakeTimers();
    let finishLoad!: () => void;
    const load = vi.fn(() => new Promise<void>((resolve) => (finishLoad = resolve)));
    Object.defineProperty(document, 'fonts', { value: { ready: Promise.resolve(), load }, configurable: true });
    let done = false;
    void fontsReady().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(100);
    expect(load).toHaveBeenCalledWith('1em "Noto Sans Malayalam Live"', 'മ');
    expect(done).toBe(false);
    finishLoad();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  it('resolves at the cap when the Live face load stalls', async () => {
    vi.useFakeTimers();
    const load = vi.fn(() => new Promise<void>(() => {}));
    Object.defineProperty(document, 'fonts', { value: { ready: Promise.resolve(), load }, configurable: true });
    let done = false;
    void fontsReady().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(3000);
    expect(done).toBe(true);
  });

  it('never rejects when the Live face load fails', async () => {
    const load = vi.fn(() => Promise.reject(new Error('404')));
    Object.defineProperty(document, 'fonts', { value: { ready: Promise.resolve(), load }, configurable: true });
    await expect(fontsReady(50)).resolves.toBeUndefined();
  });

  it('never rejects (rejected ready, or no FontFaceSet)', async () => {
    stubFonts(Promise.reject(new Error('font failed')));
    await expect(fontsReady(50)).resolves.toBeUndefined();
    Reflect.deleteProperty(document, 'fonts');
    await expect(fontsReady(50)).resolves.toBeUndefined();
  });
});

describe('hard-coded string', () => {
  it('check-i18n reports file:line for <p>Hello</p> in a screen', () => {
    expect(checkSource('src/screens/X.tsx', 'export const X = () => (\n  <p>Hello</p>\n);\n')).toEqual([
      expect.objectContaining({ file: 'src/screens/X.tsx', line: 2, rule: 'jsx-text' }),
    ]);
  });

  it('npm run check:i18n exits non-zero, naming file:line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-i18n-'));
    try {
      const file = join(dir, 'X.tsx');
      writeFileSync(file, 'export const X = () => (\n  <p>Hello</p>\n);\n');
      const result = spawnSync(process.execPath, ['scripts/check-i18n.mjs', file], { cwd: WEB_ROOT, encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/X\.tsx:2: jsx-text/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

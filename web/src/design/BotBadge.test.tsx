import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../i18n.ts';
import { BotBadge } from './BotBadge.tsx';

afterEach(async () => {
  await act(() => i18n.changeLanguage('ml'));
});

describe('BotBadge', () => {
  it.each(['ml', 'en'])('is a small-radius outline tag reading BOT, marked lang="en" (%s UI)', async (language) => {
    await act(() => i18n.changeLanguage(language));
    render(<BotBadge />);
    const badge = screen.getByTestId('bot-badge');
    expect(badge).toHaveTextContent('BOT');
    expect(screen.getByText('BOT')).toHaveAttribute('lang', 'en');
    expect(badge.className).toMatch(/\brounded-sm\b/);
    expect(badge.className).toMatch(/\bborder\b/);
    // An outline: no fill, and never the peak volt.
    expect(badge.className).not.toMatch(/\bbg-/);
    expect(badge.outerHTML).not.toMatch(/volt/);
  });
});

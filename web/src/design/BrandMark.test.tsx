import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../i18n.ts';
import { BrandMark, brandLanguage } from './BrandMark.tsx';

const BOLT = '7,0 1,9 5,9 3,16 11,6 7,6 9,0';

const renderInHeading = () =>
  render(
    <h1>
      <BrandMark />
    </h1>,
  );

describe('BrandMark', () => {
  afterEach(async () => {
    await act(() => i18n.changeLanguage('ml'));
  });

  it('shows മിന്നൽ when the language is ml, named in Malayalam', () => {
    renderInHeading();
    expect(screen.getByRole('heading', { name: 'മിന്നൽ' })).toBeInTheDocument();
    const name = screen.getByText('മിന്നൽ', { selector: '.sr-only' });
    expect(name).toHaveAttribute('lang', 'ml');
  });

  it('switches to Minnal live when the language changes to en', async () => {
    renderInHeading();
    await act(() => i18n.changeLanguage('en'));
    expect(screen.getByRole('heading', { name: 'Minnal' })).toBeInTheDocument();
    expect(screen.getByText('Minnal', { selector: '.sr-only' })).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Minnal', { selector: '[aria-hidden="true"]' })).toHaveAttribute('lang', 'en');
  });

  it('normalises the language case-insensitively by prefix, falling back to ml', () => {
    expect(brandLanguage('en')).toBe('en');
    expect(brandLanguage('EN')).toBe('en');
    expect(brandLanguage('en-US')).toBe('en');
    expect(brandLanguage('En_in')).toBe('en');
    expect(brandLanguage('eng')).toBe('ml');
    expect(brandLanguage('fr')).toBe('ml');
    expect(brandLanguage(undefined)).toBe('ml');
  });

  it('renders the hard-edged ink bolt before the wordmark, hidden from assistive tech', () => {
    const { container } = render(<BrandMark language="en" />);
    const root = container.firstElementChild!;
    const svg = root.firstElementChild!;
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg.querySelector('polygon')).toHaveAttribute('points', BOLT);
    expect(svg.querySelector('polygon')).toHaveAttribute('fill', 'currentColor');
    expect(svg.querySelector('[stroke-linejoin], [rx]')).toBeNull();
    expect(root.className).toMatch(/\btext-ink\b/);
  });
});

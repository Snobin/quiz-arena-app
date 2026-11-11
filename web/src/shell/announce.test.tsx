import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { announce, resetAnnouncements } from './announce.ts';
import { LiveRegions } from './LiveRegions.tsx';

afterEach(() => resetAnnouncements());

/** Mounts the regions and waits out the reveal tick. */
async function renderRegions() {
  render(<LiveRegions />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const say = (text: string, options?: { assertive?: boolean }) =>
  act(async () => {
    announce(text, options);
  });

describe('announce + LiveRegions', () => {
  it('renders one polite status region and one assertive region, both empty at first', async () => {
    await renderRegions();
    const polite = screen.getByRole('status');
    expect(polite).toHaveAttribute('aria-live', 'polite');
    expect(polite).toBeEmptyDOMElement();
    const assertive = screen.getByTestId('live-assertive');
    expect(assertive).toHaveAttribute('aria-live', 'assertive');
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(2);
  });

  it('routes polite and assertive text to their regions', async () => {
    await renderRegions();
    await say('Locked in');
    await say('Reconnecting… 10', { assertive: true });
    expect(screen.getByRole('status')).toHaveTextContent('Locked in');
    expect(screen.getByTestId('live-assertive')).toHaveTextContent('Reconnecting… 10');
  });

  it('announces repeated identical text again (the region content changes each time)', async () => {
    await renderRegions();
    const region = screen.getByRole('status');
    const seen: Array<string | null> = [];
    for (let i = 0; i < 3; i += 1) {
      await say('Locked in');
      seen.push(region.textContent);
    }
    expect(seen[0]).not.toBe(seen[1]);
    expect(seen[1]).not.toBe(seen[2]);
    for (const text of seen) expect(text?.trim()).toBe('Locked in');
  });

  it('joins same-tick announcements on one channel instead of dropping all but the last', async () => {
    await renderRegions();
    await act(async () => {
      announce('Minnal Bot joined');
      announce('Locked in');
      announce('Reconnecting…', { assertive: true });
    });
    expect(screen.getByRole('status').textContent?.trim()).toBe('Minnal Bot joined Locked in');
    expect(screen.getByTestId('live-assertive').textContent?.trim()).toBe('Reconnecting…');
  });

  it('mounts empty and shows a message that arrived with it only after the next tick', async () => {
    announce('Offline');
    await act(async () => {}); // flush the announce microtask: the store holds the message
    render(<LiveRegions />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Offline');
  });
});

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import i18n from '../../i18n.ts';
import type { ResultParticipant } from '../../realtime/protocol.ts';
import { Podium, standingsOrder } from './Podium.tsx';
import { RoomStandings } from './RoomStandings.tsx';

const p = (id: string, name: string, score: number, placement: number, forfeited = false): ResultParticipant => ({
  participantId: id,
  displayName: name,
  kind: 'USER',
  score,
  correctCount: 3,
  forfeited,
  placement,
});

beforeEach(async () => {
  await act(() => i18n.changeLanguage('en'));
});
afterEach(async () => {
  cleanup();
  await act(() => i18n.changeLanguage('ml'));
});

const placements = () => screen.getAllByTestId('podium-column').map((c) => c.getAttribute('data-placement'));

describe('Podium', () => {
  it('orders the first three columns 2-1-3, #1 tallest', () => {
    render(<Podium selfId="d" participants={[p('a', 'Anju', 900, 1), p('b', 'Biju', 700, 2), p('c', 'Chitra', 500, 3), p('d', 'Devan', 100, 4)]} />);
    expect(placements()).toEqual(['2', '1', '3']);
    const columns = screen.getAllByTestId('podium-column');
    expect(columns[1]!.className).toContain('min-h-[9rem]');
    expect(columns[0]!.className).toContain('min-h-[7rem]');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows only columns 2 and 1 with two players', () => {
    render(<Podium selfId="a" participants={[p('a', 'Anju', 900, 1), p('b', 'Biju', 700, 2)]} />);
    expect(placements()).toEqual(['2', '1']);
  });

  it('tied entries share the numeral and height and are ordered by name', () => {
    render(<Podium selfId="x" participants={[p('c', 'Chitra', 900, 1), p('a', 'Anju', 900, 1), p('b', 'Biju', 900, 1), p('d', 'Devan', 100, 4)]} />);
    expect(placements()).toEqual(['1', '1', '1']);
    const columns = screen.getAllByTestId('podium-column');
    expect(columns.map((c) => c.className.match(/min-h-\[[^\]]+\]/)![0])).toEqual(['min-h-[9rem]', 'min-h-[9rem]', 'min-h-[9rem]']);
    // 2-1-3 over the name order Anju, Biju, Chitra.
    expect(columns.map((c) => c.getAttribute('aria-label'))).toEqual([
      'Place 1, Biju, 900 points',
      'Place 1, Anju, 900 points',
      'Place 1, Chitra, 900 points',
    ]);
  });

  it('identical tied names are ordered by participant id, whatever the input order', () => {
    const order = (list: ResultParticipant[]) => standingsOrder(list).map((x) => x.participantId);
    expect(order([p('b', 'Anju', 9, 1), p('a', 'Anju', 9, 1)])).toEqual(['a', 'b']);
  });

  it('her own column takes the band fill, and her score is volt only at placement 1', () => {
    const { unmount } = render(<Podium selfId="b" participants={[p('a', 'Anju', 900, 1), p('b', 'Biju', 700, 2)]} />);
    const own = screen.getAllByTestId('podium-column').find((c) => c.hasAttribute('data-self'))!;
    expect(own.className).toContain('surface-band');
    expect(screen.queryByTestId('podium-self-score')).toBeNull();
    unmount();
    render(<Podium selfId="a" participants={[p('a', 'Anju', 900, 1), p('b', 'Biju', 700, 2)]} />);
    expect(screen.getByTestId('podium-self-score')).toHaveAttribute('data-accent');
  });
});

describe('RoomStandings', () => {
  it('lists every participant with placement, score and correct count, tags her row "You" and a forfeiter "left"', () => {
    const many = Array.from({ length: 50 }, (_, i) => p(`p${i}`, `Player ${i}`, 5000 - i * 10, i + 1, i === 7));
    render(<RoomStandings selfId="p2" participants={many} />);
    const rows = screen.getAllByTestId('results-standings-row');
    expect(rows).toHaveLength(50);
    expect(within(rows[2]!).getByTestId('self-tag')).toHaveTextContent('You');
    expect(screen.getAllByTestId('self-tag')).toHaveLength(1);
    expect(within(rows[7]!).getByTestId('left-tag')).toHaveTextContent('left');
    expect(rows[7]).toHaveAttribute('aria-label', 'Place 8, Player 7, 4,930 points, 3 correct, left');
  });
});

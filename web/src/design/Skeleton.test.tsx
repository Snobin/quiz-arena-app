import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import '../i18n.ts';
import { useReduceEffectsStore } from '../motion/reduceEffects.ts';
import { Skeleton, type SkeletonRow } from './Skeleton.tsx';

const ROWS: SkeletonRow[] = [{ kind: 'title', width: '60%' }, { width: '90%' }, { kind: 'card' }];
const initial = useReduceEffectsStore.getState();

afterEach(() => useReduceEffectsStore.setState(initial, true));

describe('Skeleton', () => {
  it('shapes rows from props and shimmers on the full path', () => {
    useReduceEffectsStore.setState({ setting: 'off', fallback: null });
    const { container } = render(<Skeleton rows={ROWS} />);
    const rows = container.querySelectorAll('[data-skeleton-row]');
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.className).toContain('skeleton-shimmer');
    expect(container.firstChild).toMatchSnapshot();
  });

  it('never shimmers on the reduced path', () => {
    useReduceEffectsStore.setState({ setting: 'on', fallback: null });
    const { container } = render(<Skeleton rows={ROWS} />);
    for (const row of container.querySelectorAll('[data-skeleton-row]')) expect(row.className).not.toContain('shimmer');
    expect(container.firstChild).toMatchSnapshot();
  });

  it('is reduced by the session fallback too, and renders no spinner', () => {
    useReduceEffectsStore.setState({ setting: 'off', fallback: 'low-memory' });
    const { container } = render(<Skeleton rows={[{}]} />);
    expect(container.querySelector('.skeleton-shimmer')).toBeNull();
    expect(container.querySelector('[role="progressbar"], svg')).toBeNull();
    expect(container.firstChild).toHaveAttribute('aria-busy', 'true');
  });
});

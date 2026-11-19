import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../../i18n.ts';
import { WinTakeover } from './WinTakeover.tsx';

const props = { selfScore: 7840, opponent: { name: 'Rahul', score: 3000 }, reduced: true, onDone: () => undefined };

describe('the win takeover rating change', () => {
  it('shows the delta when it has already arrived', () => {
    render(<WinTakeover {...props} delta={24} />);
    expect(screen.getByTestId('takeover-delta')).toHaveTextContent('+24');
  });

  it('shows nothing when it has not arrived (the usual case)', () => {
    const { unmount } = render(<WinTakeover {...props} delta={null} />);
    expect(screen.queryByTestId('takeover-delta')).toBeNull();
    unmount();
    render(<WinTakeover {...props} />);
    expect(screen.queryByTestId('takeover-delta')).toBeNull();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button.tsx';

describe('Button', () => {
  it('calls onClick when enabled', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Play</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('disabled: stays focusable, ignores click / Enter / Space, and links the reason', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled disabledReason="Coming soon" onClick={onClick}>
        Sign in
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Sign in' });

    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toHaveAttribute('disabled');
    expect(button).toHaveAccessibleDescription('Coming soon');
    expect(screen.getByText('Coming soon')).toBeVisible();

    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disabled submit button does not submit its form', () => {
    const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
    render(
      <form onSubmit={(e) => onSubmit(e.nativeEvent as SubmitEvent)}>
        <Button type="submit" disabled disabledReason="Offline">
          Send
        </Button>
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders primary and secondary styles from semantic tokens', () => {
    render(
      <>
        <Button>One</Button>
        <Button variant="secondary">Two</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'One' }).className).toMatch(/\bbg-band\b.*\btext-on-band\b/);
    expect(screen.getByRole('button', { name: 'Two' }).className).toMatch(/\bbg-card\b.*\bborder-ink\b/);
    expect(screen.getByRole('button', { name: 'One' }).className).toMatch(/\bhit-target\b/);
  });

  it('defaults to type="button", and a disabled submit renders type="button"', () => {
    render(
      <>
        <Button>Plain</Button>
        <Button type="submit" disabled disabledReason="Offline">
          Submit
        </Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Plain' })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('button', { name: 'Submit' })).toHaveAttribute('type', 'button');
  });

  it('disabled keeps a caller aria-describedby alongside the reason', () => {
    render(
      <>
        <p id="hint">Hint text</p>
        <Button disabled disabledReason="Coming soon" aria-describedby="hint">
          Go
        </Button>
      </>,
    );
    const button = screen.getByRole('button', { name: 'Go' });
    const ids = button.getAttribute('aria-describedby')!.split(' ');
    expect(ids).toContain('hint');
    expect(ids).toHaveLength(2);
    expect(button).toHaveAccessibleDescription('Hint text Coming soon');
  });

  it('toggling disabled keeps the same focused element', () => {
    const { rerender } = render(<Button>Toggle</Button>);
    const button = screen.getByRole('button', { name: 'Toggle' });
    button.focus();
    rerender(
      <Button disabled disabledReason="Wait">
        Toggle
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Toggle' })).toBe(button);
    expect(button).toHaveFocus();
    rerender(<Button>Toggle</Button>);
    expect(screen.getByRole('button', { name: 'Toggle' })).toBe(button);
    expect(button).toHaveFocus();
  });
});

import { useId, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

type FilledVariant = 'primary' | 'secondary';
type Variant = FilledVariant | 'danger-text';

type BaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'aria-disabled' | 'children'> & {
  variant?: Variant;
  children: ReactNode;
};

/** A disabled Button must say why; the reason is shown as a caption and linked via aria-describedby. */
export type ButtonProps = BaseProps &
  ({ disabled?: false; disabledReason?: never } | { disabled: true; disabledReason: string });

const BASE = 'hit-target inline-flex min-h-target-min items-center justify-center rounded-md px-4 py-2 text-body';

// Primary: ink fill with an on-band label. `bg-band` is ink in light and band-dark in dark,
// which is how DESIGN.md renders calm ink surfaces in dark mode (an ink-dark fill would put
// white on light grey).
const VARIANTS: Record<FilledVariant, string> = {
  primary: 'bg-band text-on-band',
  secondary: 'bg-card text-ink border-[1.5px] border-ink',
};

/** `danger-text`: a quiet brick text button (Leave). No fill, no border; the hit area stays 48 px. */
const DANGER_TEXT = 'bg-transparent font-bold text-brick';

const DISABLED = 'bg-card text-muted border border-dim cursor-not-allowed';

/**
 * Disabled buttons use aria-disabled (never the native attribute), so they stay focusable and
 * the reason is announced; activation by click, Enter or Space is ignored.
 */
export function Button(props: ButtonProps) {
  const { variant = 'primary', disabled, disabledReason, className, onClick, type, children, ...rest } = props;
  const reasonId = useId();
  const look = variant === 'danger-text' ? DANGER_TEXT : VARIANTS[variant];
  const classes = [BASE, disabled ? DISABLED : look, className].filter(Boolean).join(' ');

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  // The <button> is always the first child, so toggling `disabled` never remounts it (focus is
  // kept). Disabled renders type="button" so implicit (Enter-in-field) submission can't fire it.
  return (
    <>
      <button
        {...rest}
        type={disabled ? 'button' : (type ?? 'button')}
        className={classes}
        onClick={handleClick}
        aria-disabled={disabled ? 'true' : undefined}
        aria-describedby={
          disabled ? [rest['aria-describedby'], reasonId].filter(Boolean).join(' ') : rest['aria-describedby']
        }
      >
        {children}
      </button>
      {disabled ? (
        <span id={reasonId} className="block text-caption text-muted">
          {disabledReason}
        </span>
      ) : null}
    </>
  );
}

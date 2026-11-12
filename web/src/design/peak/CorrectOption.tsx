/**
 * The correct option at a reveal (DESIGN.md › answer-option-correct): band fill with on-band
 * text, a volt ✓ tile and a volt status. In dark mode it carries a 1px volt edge so the
 * band-dark fill separates from the page. Volt lives here, in design/peak/, only; every volt
 * element carries `data-accent` so tests outside this folder can check where volt shows.
 */
export const CORRECT_OPTION_CLASS = 'surface-band border border-band dark:border-volt';

export const CORRECT_STATUS_CLASS = 'text-volt';

export function CorrectTile() {
  return (
    <span
      aria-hidden="true"
      data-testid="correct-tile"
      data-accent=""
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-volt text-label font-bold text-on-volt"
    >
      ✓
    </span>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Whole seconds left until `expiresAt` (server clock), ticking once a second. */
function useSecondsLeft(expiresAt: string, clockOffsetMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  const left = Date.parse(expiresAt) - (now + clockOffsetMs);
  return Number.isFinite(left) ? Math.max(0, Math.ceil(left / 1000)) : 0;
}

/**
 * The rematch waiting card (Story 1.10 part 2; DESIGN.md › Results, rematch waiting): a 1.5 px ink
 * outline, "Waiting for <name>…", the seconds left until the server's `expiresAt`, and a Cancel
 * text link with a 48 px hit area. The count is display only: the server decides the expiry.
 */
export function RematchCard({
  name,
  expiresAt,
  clockOffsetMs,
  onCancel,
}: {
  name: string;
  expiresAt: string;
  clockOffsetMs: number;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const seconds = useSecondsLeft(expiresAt, clockOffsetMs);
  return (
    <div
      data-testid="rematch-waiting"
      className="flex min-w-[min(14rem,100%)] items-center justify-between gap-3 rounded-md border-[1.5px] border-ink bg-card pl-3"
    >
      <div className="flex flex-col py-2">
        <span className="text-body text-ink">{t('rematch.waiting', { name })}</span>
        <span data-testid="rematch-seconds" className="text-caption tabular-nums text-muted">
          {t('rematch.secondsLeft', { seconds })}
        </span>
      </div>
      <button
        type="button"
        data-testid="rematch-cancel"
        className="hit-target inline-flex min-h-target-min shrink-0 items-center justify-center px-3 text-body text-ink underline"
        onClick={onCancel}
      >
        {t('common.cancel')}
      </button>
    </div>
  );
}

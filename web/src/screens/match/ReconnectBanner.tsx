import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../i18n/format.ts';

/** Whole seconds left until `deadline` (device ms), never below 0. */
function secondsLeft(deadline: number): number {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

/**
 * The reconnect banner (Story 1.9; DESIGN.md › reconnect-banner): it replaces the timer while the
 * socket is down. A card with a 1.5px ink border and a 40px ring holding the seconds left of her
 * grace, counting 10 → 0 once a second from `deadline`. Monochrome, no animation, never flashes.
 * It is not a live region: the screen announces its start and end once each.
 */
export function ReconnectBanner({ deadline }: { deadline: number }) {
  const { t } = useTranslation();
  const [seconds, setSeconds] = useState(() => secondsLeft(deadline));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const left = deadline - Date.now();
      setSeconds(secondsLeft(deadline));
      if (left > 0) timer = setTimeout(tick, left % 1000 || 1000);
    };
    tick();
    return () => clearTimeout(timer);
  }, [deadline]);

  return (
    <div
      data-testid="reconnect-banner"
      className="sticky top-[0] z-10 mt-2 flex items-center gap-3 rounded-lg border-[1.5px] border-ink bg-card px-3 py-3"
    >
      <span
        data-testid="reconnect-ring"
        aria-hidden="true"
        className="flex size-[40px] flex-none items-center justify-center rounded-full border-2 border-ink font-bold tabular-nums text-ink"
      >
        {formatNumber(seconds)}
      </span>
      <p className="text-body font-bold text-ink">{t('match.reconnecting', { seconds })}</p>
    </div>
  );
}

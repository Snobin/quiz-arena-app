import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const BUTTON = 'hit-target inline-flex min-h-target-min items-center justify-center rounded-md px-4 py-2 text-body';

/** "Leave without importing?": a centred card, focus on Stay, Esc means Stay, focus returns to what opened it. */
export function LeaveDialog({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  const stay = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stay.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <div className="fixed inset-[0] z-20 flex items-center justify-center bg-ink/40 px-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-[28rem] flex-col gap-4 rounded-lg border border-hairline bg-card p-4"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onStay();
          }
        }}
      >
        <h2 id={titleId} className="text-body text-ink">
          {t('import.leave.title')}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <button ref={stay} type="button" onClick={onStay} className={`${BUTTON} border-[1.5px] border-ink bg-card text-ink`}>
            {t('import.leave.stay')}
          </button>
          <button type="button" onClick={onLeave} className={`${BUTTON} bg-transparent font-bold text-brick`}>
            {t('import.leave.leave')}
          </button>
        </div>
      </div>
    </div>
  );
}

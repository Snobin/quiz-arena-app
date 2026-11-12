import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../design/Button.tsx';

type LeaveDialogProps = {
  onStay: () => void;
  onLeave: () => void;
};

/**
 * The Leave confirm dialog (Story 1.9; DESIGN.md › leave-confirm-dialog): a centred card over the
 * dimmed match, `role="alertdialog"`, focus on Stay. Esc means Stay (so does Android back, handled
 * by the screen). The match keeps running on the server while it shows; the screen makes
 * everything behind it `inert`.
 */
export function LeaveDialog({ onStay, onLeave }: LeaveDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const stayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    stayRef.current?.querySelector('button')?.focus();
  }, []);

  return (
    <div className="fixed inset-[0] z-20 flex items-center justify-center px-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-[24rem] flex-col gap-4 rounded-lg border border-hairline bg-card p-4"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onStay();
          }
        }}
      >
        <h2 id={titleId} className="font-title text-title text-ink">
          {t('match.leaveConfirm')}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <div ref={stayRef}>
            <Button onClick={onStay}>{t('match.stay')}</Button>
          </div>
          <Button variant="danger-text" onClick={onLeave}>
            {t('match.leave')}
          </Button>
        </div>
      </div>
    </div>
  );
}

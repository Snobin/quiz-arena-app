import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../design/Button.tsx';

type DeleteAccountDialogProps = {
  busy: boolean;
  onCancel: () => void;
  onDelete: () => void;
};

/**
 * Delete-account confirm (Story 2.8): a centred card, `role="alertdialog"`, focus on Cancel (primary), a brick
 * "Delete account" text button. Esc means Cancel (Android back is handled by the screen). Same pattern as LeaveDialog.
 */
export function DeleteAccountDialog({ busy, onCancel, onDelete }: DeleteAccountDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const cancelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cancelRef.current?.querySelector('button')?.focus();
  }, []);

  return (
    <div className="fixed inset-[0] z-20 flex items-center justify-center bg-ink/40 px-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-[24rem] flex-col gap-4 rounded-lg border border-hairline bg-card p-4"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            if (!busy) onCancel();
          }
        }}
      >
        <h2 id={titleId} className="font-body text-body text-ink">
          {t('settings.deleteConfirm')}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <div ref={cancelRef}>
            <Button onClick={() => !busy && onCancel()}>{t('common.cancel')}</Button>
          </div>
          {busy ? (
            <Button variant="danger-text" disabled disabledReason={t('common.loading')} aria-busy>
              {t('settings.deleteAccount')}
            </Button>
          ) : (
            <Button variant="danger-text" onClick={onDelete}>
              {t('settings.deleteAccount')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

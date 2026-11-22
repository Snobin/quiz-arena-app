import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const BUTTON = 'hit-target inline-flex min-h-target-min items-center justify-center rounded-md px-4 py-2 text-body';

type Props = { topic: string; count: number; busy: boolean; onCancel: () => void; onConfirm: () => void };

/** "Delete '<topic>'?": focus on Cancel (the primary button), a brick Delete text button, Esc means Cancel. */
export function DeleteDialog({ topic, count, busy, onCancel, onConfirm }: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancel.current?.focus();
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
            if (!busy) onCancel();
          }
        }}
      >
        <h2 id={titleId} className="text-body text-ink">
          {t('manage.delete.title', { topic, count })}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <button ref={cancel} type="button" onClick={() => !busy && onCancel()} className={`${BUTTON} bg-band text-on-band`}>
            {t('common.cancel')}
          </button>
          <button type="button" aria-disabled={busy} onClick={() => !busy && onConfirm()} className={`${BUTTON} bg-transparent font-bold text-brick`}>
            {busy ? t('manage.delete.working') : t('manage.delete.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

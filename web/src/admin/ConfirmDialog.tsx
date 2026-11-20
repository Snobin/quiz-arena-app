import { useEffect, useId, useRef } from 'react';
import { adminT } from './adminI18n.ts';

type Props = {
  title: string;
  cancelLabel: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const BUTTON = 'hit-target inline-flex min-h-target-min items-center justify-center rounded-md px-4 py-2 text-body';

/**
 * An admin confirm: a centred card with `role="alertdialog"`, focus on Cancel, a brick confirm button, Esc meaning
 * Cancel. Focus returns to the control that opened it. Same pattern as the player's DeleteAccountDialog.
 */
export function ConfirmDialog({ title, cancelLabel, confirmLabel, busy = false, onCancel, onConfirm }: Props) {
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
          {title}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <button ref={cancel} type="button" onClick={() => !busy && onCancel()} className={`${BUTTON} border-[1.5px] border-ink bg-card text-ink`}>
            {cancelLabel}
          </button>
          <button
            type="button"
            aria-disabled={busy}
            onClick={() => !busy && onConfirm()}
            className={`${BUTTON} bg-transparent font-bold text-brick`}
          >
            {busy ? adminT('delete.working') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
